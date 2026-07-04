"""Aggregated read-only status across all Phoenix calendar/email connectors.

Pure Python: combines the status dicts each connector module already exposes.
No network calls are made here; each sub-status function is itself either
free (env var reads) or already safe/cheap.
"""

from __future__ import annotations

from typing import Any

from jarvis.domains.calendar import google_oauth, ics_feed, plaan_live


def _plaan_connector_status(plaan_status: dict[str, Any]) -> dict[str, Any]:
    if plaan_status.get("active_source") == "fixture":
        status = "fixture"
    elif plaan_status.get("blockers"):
        status = "not_configured"
    else:
        status = "active"
    return {"status": status, "detail": plaan_status.get("active_source", "fixture")}


def _ics_feed_connector_status(feed_status: dict[str, Any]) -> dict[str, Any]:
    return {"status": "active" if feed_status.get("enabled") else "not_configured"}


def get_connectors_status(imported_snapshot: dict[str, Any] | None = None) -> dict[str, Any]:
    """Aggregate Plaan, ICS feed, Google Calendar, and Gmail status."""
    plaan_status = plaan_live.get_plaan_live_status(imported_snapshot=imported_snapshot)
    google_connection = google_oauth.connection_status()
    google_configured = google_oauth.is_configured()

    if google_connection["connected"]:
        google_status = gmail_status = "connected"
    elif google_configured:
        google_status = gmail_status = "not_connected"
    else:
        google_status = gmail_status = "not_configured"

    return {
        "mode": "phoenix_connectors_status",
        "read_only": True,
        "writes_enabled": False,
        "connectors": {
            "plaan": _plaan_connector_status(plaan_status),
            "ics_feed": {"status": "active" if ics_feed.feed_token_configured() else "not_configured"},
            "google_calendar": {
                "status": google_status,
                "oauth": google_configured,
            },
            "gmail": {
                "status": gmail_status,
                "oauth": google_configured,
            },
        },
    }
