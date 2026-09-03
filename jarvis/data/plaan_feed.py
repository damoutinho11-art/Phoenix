"""Private, GET-only Plaan subscription cache. No browser credentials required."""
from __future__ import annotations

import hashlib
import asyncio
import json
import logging
import os
import threading
from datetime import datetime, timedelta, timezone
from urllib.parse import urlsplit, urlunsplit

import httpx

from jarvis.data import database

_lock = threading.Lock()
_runtime_failures: dict[tuple[str, str], str] = {}
_MAX_BYTES = 5 * 1024 * 1024
_NOTICE = "Plaan publishes subscription updates once per day; this is not real-time."


class _PrivateFeedLogFilter(logging.Filter):
    def filter(self, record):
        return "plaan.opera.ee" not in record.getMessage().lower()


logging.getLogger("httpx").addFilter(_PrivateFeedLogFilter())


def configured() -> bool:
    return bool(os.getenv("PHOENIX_PLAAN_ICAL_URL")) and os.getenv(
        "PHOENIX_PLAAN_LIVE_ENABLED", ""
    ).lower() in {"1", "true", "yes", "on"}


def normalize_url(value: str) -> str:
    try:
        url = urlsplit(value.strip())
        if (url.scheme not in {"https", "webcal"} or url.hostname != "plaan.opera.ee"
                or url.port not in {None, 443} or url.username or url.password or url.fragment):
            raise ValueError
        return urlunsplit(("https", url.netloc, url.path, url.query, ""))
    except ValueError:
        raise ValueError("Plaan feed must use HTTPS on plaan.opera.ee without credentials.") from None


def _key() -> str:
    return hashlib.sha256(os.getenv("PHOENIX_PLAAN_ICAL_URL", "").encode()).hexdigest()


def _load() -> dict:
    connection = database.get_db()
    try:
        row = connection.execute("SELECT * FROM plaan_feed_cache WHERE source_hash = ?", (_key(),)).fetchone()
        return dict(row) if row else {}
    finally:
        connection.close()


def _runtime_key():
    return str(database.DB_PATH), _key()


def _aware(value: str) -> datetime:
    result = datetime.fromisoformat(value)
    return result.replace(tzinfo=timezone.utc) if result.tzinfo is None else result


def fetch_snapshot(url: str, *, now: datetime) -> dict:
    from jarvis.domains.calendar.plaan_ical import parse_personal_calendar

    address = normalize_url(url)
    content = asyncio.run(_bounded_download(address))
    return parse_personal_calendar(content, now=now)


async def _bounded_download(address: str) -> bytes:
    return await asyncio.wait_for(_download(address), timeout=10)


async def _download(address: str) -> bytes:
    # Disable environment proxies and redirects so this private address stays
    # confined to the configured origin. Never propagate transport exceptions.
    async with httpx.AsyncClient(timeout=10, follow_redirects=False, trust_env=False) as client:
        async with client.stream("GET", address, headers={"Accept": "text/calendar"}) as response:
            if response.status_code != 200:
                raise ValueError("Plaan calendar request was unsuccessful.")
            if "text/calendar" not in response.headers.get("content-type", "").lower():
                raise ValueError("Plaan did not return a calendar.")
            content = bytearray()
            async for chunk in response.aiter_bytes():
                content.extend(chunk)
                if len(content) > _MAX_BYTES:
                    raise ValueError("Plaan calendar exceeds the size limit.")
    return bytes(content)


def refresh(*, now: datetime | None = None) -> None:
    if not configured() or not _lock.acquire(blocking=False):
        return
    try:
        now = now or datetime.now(timezone.utc)
        cached = _load()
        if _runtime_key() not in _runtime_failures and cached.get("last_checked_at") and now - _aware(cached["last_checked_at"]) < timedelta(hours=1):
            return
        snapshot_json = cached.get("snapshot_json")
        success = cached.get("last_success_at")
        error = None
        try:
            snapshot = fetch_snapshot(os.environ["PHOENIX_PLAAN_ICAL_URL"], now=now)
            snapshot_json = json.dumps(snapshot)
            success = now.isoformat()
        except Exception:
            error = "Personal Plaan refresh failed. Last verified events retained; availability is unconfirmed."
        connection = database.get_db()
        try:
            with connection:
                connection.execute(
                    "INSERT OR REPLACE INTO plaan_feed_cache VALUES (?, ?, ?, ?, ?)",
                    (_key(), snapshot_json, now.isoformat(), success, error),
                )
        finally:
            connection.close()
        _runtime_failures.pop(_runtime_key(), None)
    except Exception:
        _runtime_failures[_runtime_key()] = "Personal calendar persistence is unavailable. Schedule is unconfirmed."
    finally:
        _lock.release()


def read_status(*, now: datetime | None = None) -> dict:
    return _status(_safe_load(), now=now)


def _safe_load() -> dict:
    try:
        return _load() if configured() else {}
    except Exception:
        _runtime_failures[_runtime_key()] = "Personal calendar persistence is unavailable. Schedule is unconfirmed."
        return {}


def _status(cached: dict, *, now: datetime | None = None) -> dict:
    now = now or datetime.now(timezone.utc)
    error = _runtime_failures.get(_runtime_key()) or cached.get("last_error")
    state = "unavailable"
    if cached.get("last_success_at"):
        age = now - _aware(cached["last_success_at"])
        state = "stale" if age > timedelta(hours=26) else "degraded" if error else "healthy"
    return {
        "configured": configured(), "status": state,
        "last_checked_at": cached.get("last_checked_at"),
        "last_success_at": cached.get("last_success_at"),
        "last_error": error,
        "source_cadence": _NOTICE, "refresh_interval_seconds": 3600,
        "timezone": "Europe/Tallinn", "read_only": True,
        "mutations_allowed": False, "raw_page_sent_to_ai": False,
    }


def resolve(*, now: datetime | None = None) -> tuple[dict, dict]:
    cached = _safe_load()
    status = _status(cached, now=now)
    empty = {"as_of": "1970-01-01T00:00:00", "events": [], "fetch_warnings": []}
    try:
        raw = json.loads(cached["snapshot_json"]) if cached.get("snapshot_json") else empty
        if not isinstance(raw, dict) or not isinstance(raw.get("events"), list):
            raise ValueError
    except (ValueError, TypeError):
        raw = empty
        status.update(status="unavailable", last_error="Stored calendar is invalid. Schedule is unconfirmed.")
    raw["fetch_warnings"] = [*raw.get("fetch_warnings", []), _NOTICE]
    if status["status"] != "healthy":
        raw["fetch_warnings"].append("PERSONAL CALENDAR UNVERIFIED: do not infer free time.")
    status["active_source"] = "personal_feed" if status["status"] == "healthy" else "personal_feed_" + status["status"]
    return raw, status
