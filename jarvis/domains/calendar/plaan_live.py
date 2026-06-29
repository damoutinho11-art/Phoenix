"""Read-only Plaan snapshot source boundary.

This module is intentionally conservative. It does **not** log in, click, submit,
mutate Plaan, store credentials, or send raw pages to AI. It only resolves a
calendar snapshot dict in the already-normalized Phoenix contract:

    {"as_of": ISO datetime, "events": [...], "fetch_warnings": [...]}

Default behavior remains the recorded fixture. Optional live/local sources are
explicitly opt-in through environment variables so production cannot accidentally
start scraping or spending network calls.
"""

from __future__ import annotations

import json
import os
import urllib.error
import urllib.parse
import urllib.request
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

PLAAN_WORKSPACE_URL = "https://plaan.opera.ee/v2/workspace/"
_ALLOWED_HOSTS = {"plaan.opera.ee"}
_FORBIDDEN_IMPORT_KEYS = {
    "cookie", "cookies", "authorization", "auth", "password", "passwd",
    "token", "access_token", "refresh_token", "session", "csrf", "secret",
    "raw_html", "raw_page", "html", "document", "localstorage", "local_storage",
}
_EVENT_ALLOWED_KEYS = {"event_id", "event_type", "title", "date", "time_start", "time_end", "location", "role"}



def _truthy(value: str | None) -> bool:
    return str(value or "").strip().lower() in {"1", "true", "yes", "on"}


def _redact(value: str | None) -> str | None:
    if not value:
        return None
    text = str(value)
    if len(text) <= 8:
        return "***"
    return f"{text[:4]}…{text[-4:]}"


def _is_allowed_plaan_url(url: str) -> bool:
    try:
        parsed = urllib.parse.urlparse(url)
    except Exception:
        return False
    return parsed.scheme == "https" and parsed.hostname in _ALLOWED_HOSTS


def _normalize_snapshot(raw: dict[str, Any], *, source_label: str) -> dict[str, Any]:
    """Return a normalized snapshot-shaped dict with a provenance warning."""
    snapshot = dict(raw)
    snapshot.setdefault("as_of", datetime.now(timezone.utc).replace(tzinfo=None).isoformat(timespec="seconds"))
    snapshot.setdefault("events", [])
    warnings = [str(w) for w in snapshot.get("fetch_warnings", [])]
    provenance = f"SNAPSHOT SOURCE: {source_label}. Read-only normalized Phoenix calendar contract."
    if provenance not in warnings:
        warnings.append(provenance)
    snapshot["fetch_warnings"] = warnings
    return snapshot




def _find_forbidden_keys(value: Any, *, path: str = "root") -> list[str]:
    hits: list[str] = []
    if isinstance(value, dict):
        for key, child in value.items():
            clean_key = str(key).strip().lower()
            if clean_key in _FORBIDDEN_IMPORT_KEYS or any(token in clean_key for token in ["cookie", "password", "token", "secret", "csrf"]):
                hits.append(f"{path}.{key}")
            hits.extend(_find_forbidden_keys(child, path=f"{path}.{key}"))
    elif isinstance(value, list):
        for idx, child in enumerate(value):
            hits.extend(_find_forbidden_keys(child, path=f"{path}[{idx}]"))
    return hits


def sanitize_manual_snapshot_import(raw: dict[str, Any]) -> dict[str, Any]:
    """Return a normalized, sanitized calendar snapshot import.

    v2.3 accepts only Phoenix's normalized calendar contract. It strips event
    data to public scheduling fields and refuses obvious credential/session/raw
    page keys anywhere in the payload. This keeps manual Plaan imports useful
    without turning Phoenix into a credential store or raw-page archive.
    """
    if not isinstance(raw, dict):
        raise ValueError("Manual Plaan snapshot import must be a JSON object.")
    forbidden = _find_forbidden_keys(raw)
    if forbidden:
        raise ValueError(
            "Manual Plaan snapshot import refused because it contains credential/raw-page-like keys: "
            + ", ".join(forbidden[:5])
        )
    if "as_of" not in raw:
        raise ValueError("Manual Plaan snapshot import requires as_of.")
    if not isinstance(raw.get("events", []), list):
        raise ValueError("Manual Plaan snapshot import events must be a list.")

    clean_events: list[dict[str, Any]] = []
    for index, event in enumerate(raw.get("events", [])):
        if not isinstance(event, dict):
            raise ValueError(f"Manual Plaan snapshot event {index} must be an object.")
        clean_event = {key: event.get(key) for key in _EVENT_ALLOWED_KEYS if key in event}
        clean_event.setdefault("event_id", f"manual-{index + 1}")
        clean_event.setdefault("event_type", "unknown")
        clean_event.setdefault("title", "Untitled Plaan event")
        if "date" not in clean_event or not clean_event["date"]:
            raise ValueError(f"Manual Plaan snapshot event {index} requires date.")
        clean_events.append(clean_event)

    fetch_warnings = raw.get("fetch_warnings", [])
    if fetch_warnings is None:
        fetch_warnings = []
    if not isinstance(fetch_warnings, list):
        raise ValueError("Manual Plaan snapshot fetch_warnings must be a list when provided.")
    clean = {
        "as_of": str(raw["as_of"]),
        "events": clean_events,
        "fetch_warnings": [str(w) for w in fetch_warnings],
    }
    return _normalize_snapshot(clean, source_label="manual Plaan snapshot import")


def validate_manual_snapshot_import(raw: dict[str, Any]) -> tuple[dict[str, Any], dict[str, Any]]:
    """Sanitize and validate a manual snapshot against the calendar parser."""
    from jarvis.domains.calendar import engine as calendar_engine

    clean = sanitize_manual_snapshot_import(raw)
    snapshot = calendar_engine.parse_snapshot(clean)
    validation = {
        "valid": True,
        "read_only": True,
        "normalized_contract": True,
        "credentials_stored": False,
        "cookies_stored": False,
        "raw_page_stored": False,
        "raw_page_sent_to_ai": False,
        "mutations_allowed": False,
        "event_count": len(snapshot.events),
        "as_of": snapshot.as_of.isoformat(),
        "warnings": list(snapshot.fetch_warnings),
    }
    return clean, validation

def get_plaan_live_status(imported_snapshot: dict[str, Any] | None = None) -> dict[str, Any]:
    """Return safe fetch configuration status without exposing secrets."""
    snapshot_path = os.getenv("PHOENIX_PLAAN_SNAPSHOT_PATH")
    snapshot_json = os.getenv("PHOENIX_PLAAN_SNAPSHOT_JSON")
    snapshot_url = os.getenv("PHOENIX_PLAAN_SNAPSHOT_URL")
    live_enabled = _truthy(os.getenv("PHOENIX_PLAAN_LIVE_ENABLED"))

    active_source = "fixture"
    if snapshot_json:
        active_source = "env_json"
    elif snapshot_path:
        active_source = "local_file"
    elif imported_snapshot:
        active_source = "manual_import"
    elif live_enabled and snapshot_url:
        active_source = "read_only_url"

    blockers: list[str] = []
    warnings: list[str] = []
    if live_enabled and not snapshot_url and active_source == "fixture":
        blockers.append("PHOENIX_PLAAN_LIVE_ENABLED is true but PHOENIX_PLAAN_SNAPSHOT_URL is not configured.")
    if snapshot_url and not _is_allowed_plaan_url(snapshot_url):
        blockers.append("PHOENIX_PLAAN_SNAPSHOT_URL must be an https URL on plaan.opera.ee.")
    if snapshot_path and not Path(snapshot_path).exists():
        blockers.append("PHOENIX_PLAAN_SNAPSHOT_PATH does not exist.")
    if not live_enabled and active_source == "fixture":
        warnings.append("Live Plaan fetch is disabled; using recorded/read-only fixture snapshot.")

    return {
        "mode": "plaan_read_only_fetcher_shell",
        "workspace_url": PLAAN_WORKSPACE_URL,
        "live_enabled": live_enabled,
        "active_source": active_source,
        "snapshot_path_configured": bool(snapshot_path),
        "snapshot_json_configured": bool(snapshot_json),
        "snapshot_url_configured": bool(snapshot_url),
        "manual_import_configured": bool(imported_snapshot),
        "snapshot_url_preview": _redact(snapshot_url),
        "read_only": True,
        "allowed_methods": ["GET"],
        "mutations_allowed": False,
        "credentials_stored": False,
        "cookies_stored": False,
        "raw_page_sent_to_ai": False,
        "requires_manual_enable": True,
        "source_priority": ["env_json", "local_file", "manual_import", "read_only_url", "fixture"],
        "blockers": blockers,
        "warnings": warnings,
    }


def load_snapshot_from_env_json() -> dict[str, Any] | None:
    payload = os.getenv("PHOENIX_PLAAN_SNAPSHOT_JSON")
    if not payload:
        return None
    raw = json.loads(payload)
    if not isinstance(raw, dict):
        raise ValueError("PHOENIX_PLAAN_SNAPSHOT_JSON must decode to an object.")
    return _normalize_snapshot(raw, source_label="PHOENIX_PLAAN_SNAPSHOT_JSON")


def load_snapshot_from_file() -> dict[str, Any] | None:
    raw_path = os.getenv("PHOENIX_PLAAN_SNAPSHOT_PATH")
    if not raw_path:
        return None
    path = Path(raw_path)
    with path.open("r", encoding="utf-8") as f:
        raw = json.load(f)
    if not isinstance(raw, dict):
        raise ValueError("PHOENIX_PLAAN_SNAPSHOT_PATH must contain a JSON object.")
    return _normalize_snapshot(raw, source_label=f"local file {path.name}")


def fetch_snapshot_from_read_only_url(timeout_seconds: float = 10.0) -> dict[str, Any] | None:
    """Fetch a normalized snapshot from a configured Plaan URL.

    This function performs one read-only GET and expects JSON already shaped as
    Phoenix's calendar snapshot contract. It intentionally does not handle login,
    cookies, CSRF, browser automation, or form submission.
    """
    if not _truthy(os.getenv("PHOENIX_PLAAN_LIVE_ENABLED")):
        return None
    url = os.getenv("PHOENIX_PLAAN_SNAPSHOT_URL")
    if not url:
        raise ValueError("PHOENIX_PLAAN_SNAPSHOT_URL is required when live fetch is enabled.")
    if not _is_allowed_plaan_url(url):
        raise ValueError("PHOENIX_PLAAN_SNAPSHOT_URL must be an https URL on plaan.opera.ee.")

    request = urllib.request.Request(
        url,
        method="GET",
        headers={
            "Accept": "application/json",
            "User-Agent": "PhoenixCalendarReadOnly/2.2",
        },
    )
    try:
        with urllib.request.urlopen(request, timeout=timeout_seconds) as response:
            raw_bytes = response.read()
    except urllib.error.URLError as exc:
        raise ValueError(f"Read-only Plaan snapshot fetch failed: {exc}") from exc
    raw = json.loads(raw_bytes.decode("utf-8"))
    if not isinstance(raw, dict):
        raise ValueError("Plaan snapshot URL must return a JSON object.")
    return _normalize_snapshot(raw, source_label="read-only Plaan snapshot URL")


def resolve_snapshot_raw(default_raw: dict[str, Any], imported_snapshot: dict[str, Any] | None = None) -> tuple[dict[str, Any], dict[str, Any]]:
    """Resolve the calendar snapshot source with safe fallback to fixture.

    Priority: env JSON → local file → manual import → explicit read-only URL → default fixture.
    Any optional-source failure returns the fixture plus a warning instead of
    breaking Nutrition/Calendar.
    """
    status = get_plaan_live_status(imported_snapshot=imported_snapshot)
    try:
        raw = load_snapshot_from_env_json()
        if raw is not None:
            status["active_source"] = "env_json"
            return raw, status
        raw = load_snapshot_from_file()
        if raw is not None:
            status["active_source"] = "local_file"
            return raw, status
        if imported_snapshot:
            raw, validation = validate_manual_snapshot_import(imported_snapshot)
            status["active_source"] = "manual_import"
            status["manual_import_validation"] = validation
            return raw, status
        raw = fetch_snapshot_from_read_only_url()
        if raw is not None:
            status["active_source"] = "read_only_url"
            return raw, status
    except Exception as exc:
        status.setdefault("warnings", []).append(
            f"Optional Plaan snapshot source failed; using fixture snapshot. Reason: {exc}"
        )
        status["active_source"] = "fixture_fallback"

    fixture = dict(default_raw)
    fixture.setdefault("as_of", datetime.now(timezone.utc).replace(tzinfo=None).isoformat(timespec="seconds"))
    fixture.setdefault("events", [])
    fixture.setdefault("fetch_warnings", [])
    return fixture, status
