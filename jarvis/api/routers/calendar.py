"""Calendar API routes. Routers call engines; no business logic lives here."""

from datetime import datetime, timedelta, timezone

from fastapi import APIRouter, Depends, File, Form, HTTPException, Query, Response, UploadFile
from pydantic import BaseModel, Field

from jarvis.api.dependencies import get_calendar_constitution
from jarvis.data import database
from jarvis.domains.calendar import (
    connectors,
    engine,
    google_calendar_client,
    google_oauth,
    ics_feed,
    plaan_excel_import,
    plaan_live,
)
from jarvis.domains.calendar.tests.fixtures import LIVE_SNAPSHOT_RAW

router = APIRouter()


class PlaanSnapshotImportRequest(BaseModel):
    snapshot: dict = Field(...)
    label: str = Field(default="manual Plaan snapshot", max_length=160)
    source: str = Field(default="manual_paste", max_length=80)


def _latest_imported_snapshot() -> dict | None:
    latest = database.get_latest_calendar_snapshot_import()
    return latest.get("snapshot") if latest else None



def _resolved_snapshot_and_source() -> tuple:
    raw_snapshot, source_info = plaan_live.resolve_snapshot_raw(LIVE_SNAPSHOT_RAW, imported_snapshot=_latest_imported_snapshot())
    return engine.parse_snapshot(raw_snapshot), source_info


def _serialize_calendar_event(e) -> dict:
    return {
        "event_id": e.event_id,
        "event_type": e.event_type.value,
        "title": e.title,
        "date": e.date.isoformat(),
        "time_start": e.time_start.strftime("%H:%M") if e.time_start else None,
        "time_end": e.time_end.strftime("%H:%M") if e.time_end else None,
        "location": e.location,
        "role": e.role,
    }


@router.get("/snapshot")
def calendar_snapshot(
    constitution: dict = Depends(get_calendar_constitution),
) -> dict:
    raw_snapshot, source_info = plaan_live.resolve_snapshot_raw(LIVE_SNAPSHOT_RAW, imported_snapshot=_latest_imported_snapshot())
    snapshot = engine.parse_snapshot(raw_snapshot)
    staleness = engine.snapshot_staleness_warning(snapshot, constitution)

    return {
        "as_of": snapshot.as_of.isoformat(),
        "events": [
            {
                "event_id": e.event_id,
                "event_type": e.event_type.value,
                "title": e.title,
                "date": e.date.isoformat(),
                "time_start": e.time_start.strftime("%H:%M") if e.time_start else None,
                "time_end": e.time_end.strftime("%H:%M") if e.time_end else None,
                "location": e.location,
                "role": e.role,
            }
            for e in snapshot.events
        ],
        "fetch_warnings": list(snapshot.fetch_warnings),
        "staleness_warning": staleness,
        "source": source_info,
        "read_only_notice": engine.APPROVAL_NOTICE,
    }


@router.get("/plaan-live/status")
def plaan_live_status() -> dict:
    """Return safe read-only Plaan snapshot source status. No network call."""
    return plaan_live.get_plaan_live_status(imported_snapshot=_latest_imported_snapshot())


@router.get("/plaan-live/preview")
def plaan_live_preview(
    constitution: dict = Depends(get_calendar_constitution),
) -> dict:
    """Preview the resolved snapshot source without exposing raw pages or secrets."""
    raw_snapshot, source_info = plaan_live.resolve_snapshot_raw(LIVE_SNAPSHOT_RAW, imported_snapshot=_latest_imported_snapshot())
    snapshot = engine.parse_snapshot(raw_snapshot)
    staleness = engine.snapshot_staleness_warning(snapshot, constitution)
    return {
        "as_of": snapshot.as_of.isoformat(),
        "event_count": len(snapshot.events),
        "events": [
            {
                "event_id": e.event_id,
                "event_type": e.event_type.value,
                "title": e.title,
                "date": e.date.isoformat(),
                "time_start": e.time_start.strftime("%H:%M") if e.time_start else None,
                "time_end": e.time_end.strftime("%H:%M") if e.time_end else None,
                "location": e.location,
                "role": e.role,
            }
            for e in snapshot.events
        ],
        "fetch_warnings": list(snapshot.fetch_warnings),
        "staleness_warning": staleness,
        "source": source_info,
        "read_only_notice": engine.APPROVAL_NOTICE,
    }


@router.get("/plaan-live/imports")
def plaan_live_imports(limit: int = Query(10, ge=1, le=50)) -> dict:
    """List sanitized manual Plaan snapshot imports without exposing raw secrets."""
    imports = database.list_calendar_snapshot_imports(limit=limit)
    return {
        "count": len(imports),
        "imports": [
            {
                "id": item["id"],
                "imported_at": item["imported_at"],
                "label": item["label"],
                "source": item["source"],
                "as_of": item["as_of"],
                "event_count": item["event_count"],
                "warning_count": item["warning_count"],
                "validation": item.get("validation", {}),
            }
            for item in imports
        ],
        "read_only_notice": engine.APPROVAL_NOTICE,
    }


@router.get("/plaan-live/imports/latest")
def plaan_live_latest_import() -> dict:
    """Return the latest manual import preview and validation status."""
    latest = database.get_latest_calendar_snapshot_import()
    if not latest:
        return {
            "configured": False,
            "active_source": "none",
            "message": "No manual Plaan snapshot import has been saved yet.",
            "read_only_notice": engine.APPROVAL_NOTICE,
        }
    snapshot = engine.parse_snapshot(latest["snapshot"])
    return {
        "configured": True,
        "active_source": "manual_import",
        "id": latest["id"],
        "imported_at": latest["imported_at"],
        "label": latest["label"],
        "source": latest["source"],
        "as_of": snapshot.as_of.isoformat(),
        "event_count": len(snapshot.events),
        "events": [_serialize_calendar_event(e) for e in snapshot.events[:25]],
        "fetch_warnings": list(snapshot.fetch_warnings),
        "validation": latest.get("validation", {}),
        "read_only_notice": engine.APPROVAL_NOTICE,
    }


def _save_manual_snapshot_import(raw_snapshot: dict, *, label: str, source: str) -> dict:
    """Validate + persist a manual Plaan snapshot import and shape the API response.

    Shared by the JSON paste endpoint and the Excel upload endpoint so both
    entry points go through the exact same sanitize/validate pipeline.
    """
    try:
        clean_snapshot, validation = plaan_live.validate_manual_snapshot_import(raw_snapshot)
        saved = database.save_calendar_snapshot_import(
            clean_snapshot,
            label=label,
            source=source,
            validation=validation,
        )
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc))
    snapshot = engine.parse_snapshot(saved["snapshot"])
    return {
        "saved": True,
        "id": saved["id"],
        "active_source": "manual_import",
        "imported_at": saved["imported_at"],
        "label": saved["label"],
        "as_of": snapshot.as_of.isoformat(),
        "event_count": len(snapshot.events),
        "events": [_serialize_calendar_event(e) for e in snapshot.events[:25]],
        "fetch_warnings": list(snapshot.fetch_warnings),
        "validation": saved.get("validation", {}),
        "safety": {
            "read_only": True,
            "mutations_allowed": False,
            "credentials_stored": False,
            "cookies_stored": False,
            "raw_page_stored": False,
            "raw_page_sent_to_ai": False,
        },
        "read_only_notice": engine.APPROVAL_NOTICE,
    }


@router.post("/plaan-live/import")
def plaan_live_import_snapshot(request: PlaanSnapshotImportRequest) -> dict:
    """Save a normalized manual Plaan snapshot import.

    This is the v2.3 import workflow: users/Codex can paste a normalized JSON
    snapshot that Phoenix can safely consume. It rejects raw HTML, credentials,
    cookies, tokens, and arbitrary raw pages. It never logs in or mutates Plaan.
    """
    return _save_manual_snapshot_import(request.snapshot, label=request.label, source=request.source)


@router.post("/plaan-live/import/excel")
async def plaan_live_import_excel(
    file: UploadFile = File(...),
    label: str = Form(default="manual Plaan Excel import"),
) -> dict:
    """Convert an uploaded Plaan "Excel - Kava" export and save it as a manual snapshot import.

    Manual, user-initiated upload only — never logs into Plaan, never fetches
    it automatically, never stores Plaan credentials. The raw uploaded file is
    parsed in-memory and discarded; only the normalized JSON snapshot produced
    by plaan_excel_import.parse_plaan_excel() (validated through the same
    pipeline as a hand-written JSON import) is persisted.
    """
    filename = (file.filename or "").lower()
    if filename.endswith(".xlsm"):
        raise HTTPException(
            status_code=400,
            detail="Macro-enabled workbooks (.xlsm) are not accepted. Please upload a plain .xlsx export.",
        )

    file_bytes = await file.read()
    try:
        raw_snapshot = plaan_excel_import.parse_plaan_excel(file_bytes)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc))

    return _save_manual_snapshot_import(raw_snapshot, label=label, source="manual_excel_import")


@router.delete("/plaan-live/imports/{import_id}")
def plaan_live_delete_import(import_id: int) -> dict:
    deleted = database.delete_calendar_snapshot_import(import_id)
    if not deleted:
        raise HTTPException(status_code=404, detail="Manual Plaan snapshot import not found")
    return {"deleted": True, "id": import_id, "read_only_notice": engine.APPROVAL_NOTICE}

@router.get("/feed/status")
def calendar_feed_status() -> dict:
    """Return Phoenix ICS feed publisher status without exposing the private token."""
    snapshot, source_info = _resolved_snapshot_and_source()
    return ics_feed.feed_status(snapshot, source_info)


@router.get("/feed.ics")
def calendar_feed_ics(token: str | None = Query(default=None)) -> Response:
    """Return a Google Calendar-compatible private ICS feed.

    This endpoint only serializes Phoenix's normalized calendar snapshot. It never
    fetches Plaan, never writes to Google Calendar, and requires a private feed
    token configured through PHOENIX_CALENDAR_FEED_TOKEN.
    """
    if not ics_feed.feed_token_configured():
        raise HTTPException(status_code=403, detail="Phoenix calendar ICS feed is disabled until PHOENIX_CALENDAR_FEED_TOKEN is configured.")
    if not ics_feed.token_matches(token):
        raise HTTPException(status_code=403, detail="Invalid Phoenix calendar feed token.")
    snapshot, _source_info = _resolved_snapshot_and_source()
    content = ics_feed.build_ics_feed(snapshot)
    return Response(
        content=content,
        media_type="text/calendar; charset=utf-8",
        headers={
            "Content-Disposition": 'inline; filename="phoenix-opera-schedule.ics"',
            "Cache-Control": "no-store",
        },
    )


_GOOGLE_CALENDAR_SETUP_STEPS = [
    "Create a Google Cloud OAuth client and enable the Google Calendar API.",
    "Set PHOENIX_GOOGLE_CLIENT_ID, PHOENIX_GOOGLE_CLIENT_SECRET, PHOENIX_GOOGLE_REDIRECT_URI.",
    "Set PHOENIX_TOKEN_ENCRYPTION_KEY to a generated Fernet key.",
    "Visit /auth/google/login to connect (read-only calendar scope only).",
]


@router.get("/google/status")
def google_calendar_status() -> dict:
    """Safe Google Calendar connector status. No network call, no secrets."""
    configured = google_oauth.is_configured()
    connection = google_oauth.connection_status()
    return {
        "mode": "google_calendar_read_only",
        "configured": configured,
        "connected": connection["connected"],
        "event_count_cached": None,
        "safety": {
            "write_scopes_requested": False,
            "read_only": True,
            "credentials_stored": connection["connected"],
            "credentials_encrypted": True,
        },
        "setup_steps": _GOOGLE_CALENDAR_SETUP_STEPS if not (configured and connection["connected"]) else [],
    }


@router.get("/google/preview")
def google_calendar_preview(days: int = Query(14, ge=1, le=60)) -> dict:
    """Preview normalized Google Calendar events for the next N days (capped at 60).

    Always returns 200. When not connected/configured, returns an empty event
    list rather than an error so the UI can render a "not connected" state.
    """
    configured = google_oauth.is_configured()
    connection = google_oauth.connection_status()
    as_of = datetime.now(timezone.utc).replace(tzinfo=None)

    if not configured or not connection["connected"]:
        return {
            "as_of": as_of.isoformat(),
            "configured": configured,
            "connected": False,
            "event_count": 0,
            "events": [],
            "fetch_warnings": ["Google Calendar is not connected."],
            "source": "google_calendar",
            "read_only_notice": engine.APPROVAL_NOTICE,
        }

    time_min = as_of.replace(tzinfo=timezone.utc)
    time_max = time_min + timedelta(days=days)
    events, fetch_warnings = google_calendar_client.fetch_events(time_min, time_max)
    return {
        "as_of": as_of.isoformat(),
        "configured": configured,
        "connected": True,
        "event_count": len(events),
        "events": events,
        "fetch_warnings": fetch_warnings,
        "source": "google_calendar",
        "read_only_notice": engine.APPROVAL_NOTICE,
    }


@router.get("/unified")
def unified_calendar(days: int = Query(14, ge=1, le=60)) -> dict:
    """Merge Plaan + Google Calendar events into one sorted-by-date feed.

    Additive only — does not replace /calendar/snapshot.
    """
    plaan_snapshot, plaan_source = _resolved_snapshot_and_source()
    plaan_events = [{**_serialize_calendar_event(e), "source": "plaan"} for e in plaan_snapshot.events]

    google_preview = google_calendar_preview(days=days)
    google_events = google_preview["events"]

    merged = plaan_events + google_events
    merged.sort(key=lambda e: (e.get("date") or "", e.get("time_start") or ""))

    return {
        "as_of": datetime.now(timezone.utc).replace(tzinfo=None).isoformat(),
        "event_count": len(merged),
        "events": merged,
        "sources": {
            "plaan": plaan_source,
            "google_calendar": {
                "configured": google_preview["configured"],
                "connected": google_preview["connected"],
                "fetch_warnings": google_preview["fetch_warnings"],
            },
        },
        "fetch_warnings": list(plaan_snapshot.fetch_warnings) + google_preview["fetch_warnings"],
        "read_only_notice": engine.APPROVAL_NOTICE,
    }


@router.get("/connectors/status")
def calendar_connectors_status() -> dict:
    """Aggregated read-only status across Plaan, ICS feed, Google Calendar, and Gmail."""
    return connectors.get_connectors_status(imported_snapshot=_latest_imported_snapshot())
