"""Phoenix calendar ICS feed publisher.

This module turns Phoenix's normalized calendar snapshot into a private iCal
feed that Google Calendar can subscribe to. It never fetches Plaan, never
mutates Plaan, and never writes to Google Calendar. It only serializes the
already-normalized Phoenix calendar view.
"""

from __future__ import annotations

import hashlib
import os
import re
from datetime import datetime, timedelta, timezone
from typing import Any

from jarvis.domains.calendar.data_contracts import PlaanEvent, PlaanSnapshot

DEFAULT_FEED_NAME = "Phoenix Opera Schedule"
DEFAULT_TIMEZONE = "Europe/Tallinn"
_TOKEN_ENV = "PHOENIX_CALENDAR_FEED_TOKEN"
_PUBLIC_BASE_URL_ENV = "PHOENIX_PUBLIC_BASE_URL"


def feed_token_configured() -> bool:
    return bool(os.getenv(_TOKEN_ENV, "").strip())


def configured_token() -> str | None:
    token = os.getenv(_TOKEN_ENV, "").strip()
    return token or None


def token_matches(candidate: str | None) -> bool:
    expected = configured_token()
    if not expected:
        return False
    return str(candidate or "") == expected


def feed_public_base_url() -> str | None:
    raw = os.getenv(_PUBLIC_BASE_URL_ENV, "").strip().rstrip("/")
    return raw or None


def feed_path_template() -> str:
    return "/calendar/feed.ics?token=<PHOENIX_CALENDAR_FEED_TOKEN>"


def feed_url_template() -> str:
    base = feed_public_base_url()
    return f"{base}{feed_path_template()}" if base else feed_path_template()


def _escape_text(value: Any) -> str:
    text = str(value or "")
    text = text.replace("\\", "\\\\")
    text = text.replace(";", r"\;")
    text = text.replace(",", r"\,")
    text = text.replace("\r\n", r"\n").replace("\n", r"\n")
    return text


def _fold_line(line: str) -> list[str]:
    """Fold iCalendar lines at a conservative character boundary.

    RFC5545 defines 75-octet folding. Calendar clients are tolerant, and this
    character-level fold keeps output readable while avoiding very long lines.
    """
    if len(line) <= 74:
        return [line]
    out: list[str] = []
    current = line
    while len(current) > 74:
        out.append(current[:74])
        current = " " + current[74:]
    out.append(current)
    return out


def _dtstamp(snapshot: PlaanSnapshot) -> str:
    as_of = snapshot.as_of
    if as_of.tzinfo is None:
        as_of = as_of.replace(tzinfo=timezone.utc)
    return as_of.astimezone(timezone.utc).strftime("%Y%m%dT%H%M%SZ")


def _event_uid(event: PlaanEvent) -> str:
    seed = f"{event.event_id}|{event.date.isoformat()}|{event.time_start}|{event.title}"
    digest = hashlib.sha1(seed.encode("utf-8")).hexdigest()[:16]
    safe_id = re.sub(r"[^a-zA-Z0-9_-]+", "-", event.event_id or "event").strip("-") or "event"
    return f"plaan-{safe_id}-{digest}@phoenix.local"


def _format_timed(value: datetime, timezone_name: str) -> str:
    return value.strftime(f"TZID={timezone_name}:%Y%m%dT%H%M%S")


def _event_lines(event: PlaanEvent, snapshot: PlaanSnapshot, timezone_name: str) -> list[str]:
    lines = ["BEGIN:VEVENT"]
    lines.append(f"UID:{_event_uid(event)}")
    lines.append(f"DTSTAMP:{_dtstamp(snapshot)}")

    if event.time_start is None:
        start = event.date.strftime("%Y%m%d")
        end = (event.date + timedelta(days=1)).strftime("%Y%m%d")
        lines.append(f"DTSTART;VALUE=DATE:{start}")
        lines.append(f"DTEND;VALUE=DATE:{end}")
    else:
        start_dt = datetime.combine(event.date, event.time_start)
        end_dt = datetime.combine(event.date, event.time_end) if event.time_end else start_dt + timedelta(hours=1)
        if end_dt <= start_dt:
            end_dt = start_dt + timedelta(hours=1)
        lines.append(f"DTSTART;{_format_timed(start_dt, timezone_name)}")
        lines.append(f"DTEND;{_format_timed(end_dt, timezone_name)}")

    title_prefix = "🎼 " if event.event_type.value in {"rehearsal", "performance"} else ""
    lines.append(f"SUMMARY:{_escape_text(title_prefix + event.title)}")
    if event.location:
        lines.append(f"LOCATION:{_escape_text(event.location)}")

    description_parts = [
        "Source: Phoenix normalized Plaan snapshot.",
        "Read-only mirror: Phoenix never mutates Plaan.",
        f"Event type: {event.event_type.value}.",
        f"Phoenix event ID: {event.event_id}.",
    ]
    if event.role:
        description_parts.append(f"Role: {event.role}.")
    lines.append(f"DESCRIPTION:{_escape_text(chr(10).join(description_parts))}")
    lines.append(f"CATEGORIES:{_escape_text('PLAAN,' + event.event_type.value.upper())}")
    lines.append("STATUS:CONFIRMED")
    lines.append("TRANSP:OPAQUE")
    lines.append("END:VEVENT")
    return lines


def build_ics_feed(snapshot: PlaanSnapshot, *, feed_name: str = DEFAULT_FEED_NAME, timezone_name: str = DEFAULT_TIMEZONE) -> str:
    lines = [
        "BEGIN:VCALENDAR",
        "VERSION:2.0",
        "PRODID:-//Phoenix//Opera Schedule Feed//EN",
        "CALSCALE:GREGORIAN",
        "METHOD:PUBLISH",
        f"X-WR-CALNAME:{_escape_text(feed_name)}",
        f"X-WR-TIMEZONE:{_escape_text(timezone_name)}",
        "X-PHOENIX-READ-ONLY:TRUE",
        "X-PHOENIX-SOURCE:normalized-plaan-snapshot",
    ]
    for event in sorted(snapshot.events, key=lambda e: (e.date, e.time_start is None, e.time_start or datetime.min.time(), e.title)):
        lines.extend(_event_lines(event, snapshot, timezone_name))
    lines.append("END:VCALENDAR")

    folded: list[str] = []
    for line in lines:
        folded.extend(_fold_line(line))
    return "\r\n".join(folded) + "\r\n"


def feed_status(snapshot: PlaanSnapshot, source_info: dict[str, Any]) -> dict[str, Any]:
    configured = feed_token_configured()
    base = feed_public_base_url()
    return {
        "mode": "phoenix_ics_feed_publisher",
        "feed_name": DEFAULT_FEED_NAME,
        "timezone": DEFAULT_TIMEZONE,
        "enabled": configured,
        "token_required": True,
        "token_configured": configured,
        "public_base_url_configured": bool(base),
        "feed_path_template": feed_path_template(),
        "feed_url_template": feed_url_template(),
        "google_calendar_compatible": configured,
        "google_refresh_notice": "Google Calendar subscribed URL calendars may refresh with delay; Phoenix remains the main live calendar.",
        "event_count": len(snapshot.events),
        "as_of": snapshot.as_of.isoformat(),
        "calendar_source": source_info,
        "safety": {
            "plaan_read_only": True,
            "google_write": False,
            "oauth_required": False,
            "credentials_stored": False,
            "cookies_stored": False,
            "raw_page_sent_to_ai": False,
            "feed_token_required": True,
        },
        "setup_steps": [
            "Set PHOENIX_CALENDAR_FEED_TOKEN to a long private random value.",
            "Set PHOENIX_PUBLIC_BASE_URL to your deployed backend URL if you want a full copyable URL.",
            "Open Google Calendar on desktop > Other calendars > From URL.",
            "Paste the Phoenix feed URL with your private token.",
        ],
        "warnings": [] if configured else ["ICS feed is disabled until PHOENIX_CALENDAR_FEED_TOKEN is configured."],
    }
