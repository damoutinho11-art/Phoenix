"""Calendar API routes. Routers call engines; no business logic lives here."""

from fastapi import APIRouter, Depends

from jarvis.api.dependencies import get_calendar_constitution
from jarvis.domains.calendar import engine
from jarvis.domains.calendar.tests.fixtures import LIVE_SNAPSHOT_RAW

router = APIRouter()


@router.get("/snapshot")
def calendar_snapshot(
    constitution: dict = Depends(get_calendar_constitution),
) -> dict:
    snapshot = engine.parse_snapshot(LIVE_SNAPSHOT_RAW)
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
    }
