"""Google Calendar read-only client.

READ ONLY — DO NOT ADD WRITE METHODS.

This module calls events().list() only. It never calls events().insert,
events().update, events().patch, or events().delete, and none of those
methods are imported or referenced anywhere in this file, including in
comments describing future work.
"""

from __future__ import annotations

from datetime import datetime, timedelta, timezone
from typing import Any

from google.oauth2.credentials import Credentials
from googleapiclient.discovery import build
from googleapiclient.errors import HttpError

from jarvis.domains.calendar import google_oauth

SOURCE_LABEL = "google_calendar"


def _iso_utc(value: datetime) -> str:
    if value.tzinfo is None:
        value = value.replace(tzinfo=timezone.utc)
    return value.astimezone(timezone.utc).isoformat()


def _normalize_event(raw: dict[str, Any]) -> dict[str, Any] | None:
    """Map a Google Calendar API event into Phoenix's normalized event shape."""
    start = raw.get("start", {})
    end = raw.get("end", {})

    all_day = "date" in start
    if all_day:
        date_str = start.get("date")
        time_start = None
        time_end = None
    else:
        start_dt_str = start.get("dateTime")
        end_dt_str = end.get("dateTime")
        if not start_dt_str:
            return None
        start_dt = datetime.fromisoformat(start_dt_str)
        date_str = start_dt.date().isoformat()
        time_start = start_dt.strftime("%H:%M")
        time_end = None
        if end_dt_str:
            end_dt = datetime.fromisoformat(end_dt_str)
            time_end = end_dt.strftime("%H:%M")

    if not date_str:
        return None

    return {
        "event_id": raw.get("id", ""),
        "event_type": "unknown",
        "title": raw.get("summary") or "Untitled Google Calendar event",
        "date": date_str,
        "time_start": time_start,
        "time_end": time_end,
        "location": raw.get("location"),
        "role": None,
        "source": SOURCE_LABEL,
    }


def _fetch_events_with_credentials(
    credentials: Credentials,
    *,
    time_min: datetime,
    time_max: datetime,
    calendar_id: str = "primary",
) -> list[dict[str, Any]]:
    service = build("calendar", "v3", credentials=credentials, cache_discovery=False)
    events_result = (
        service.events()
        .list(
            calendarId=calendar_id,
            timeMin=_iso_utc(time_min),
            timeMax=_iso_utc(time_max),
            singleEvents=True,
            orderBy="startTime",
            maxResults=250,
        )
        .execute()
    )
    normalized = []
    for raw_event in events_result.get("items", []):
        event = _normalize_event(raw_event)
        if event is not None:
            normalized.append(event)
    return normalized


def fetch_events(
    time_min: datetime,
    time_max: datetime,
    calendar_id: str = "primary",
) -> tuple[list[dict[str, Any]], list[str]]:
    """Fetch normalized read-only Google Calendar events.

    Returns (events, fetch_warnings). Never raises; on any failure returns an
    empty list with a warning describing what happened.
    """
    credentials = google_oauth.load_stored_credentials()
    if credentials is None:
        return [], ["Google Calendar is not connected."]

    try:
        return _fetch_events_with_credentials(
            credentials, time_min=time_min, time_max=time_max, calendar_id=calendar_id
        ), []
    except HttpError as exc:
        if exc.resp is not None and exc.resp.status == 401:
            try:
                refreshed = google_oauth.refresh_if_needed(credentials)
                google_oauth.store_credentials(refreshed)
                return _fetch_events_with_credentials(
                    refreshed, time_min=time_min, time_max=time_max, calendar_id=calendar_id
                ), []
            except Exception as retry_exc:
                return [], [f"Google Calendar fetch failed after token refresh attempt: {retry_exc}"]
        return [], [f"Google Calendar fetch failed: {exc}"]
    except Exception as exc:
        return [], [f"Google Calendar fetch failed: {exc}"]
