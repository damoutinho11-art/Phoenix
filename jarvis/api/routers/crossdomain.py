"""Cross-domain intelligence router. Wires training × nutrition × calendar."""

from fastapi import APIRouter, Depends

from jarvis.api.dependencies import (
    get_nutrition_constitution,
    get_training_constitution,
)
from jarvis.core import clock
from jarvis.data import database
from jarvis.domains.calendar import plaan_live
from jarvis.domains.calendar.engine import parse_snapshot
from jarvis.domains.calendar.tests.fixtures import LIVE_SNAPSHOT_RAW
from jarvis.domains.training.engine import get_cross_domain_alerts

router = APIRouter()


def opera_calendar_evidence(source: dict) -> dict:
    active = str(source.get("active_source", "unavailable"))
    personal = active.startswith("personal_feed")
    healthy = (active == "personal_feed" and source.get("status") == "healthy") if personal else active in {
        "env_json", "local_file", "manual_import", "read_only_url",
    }
    return {
        "available": healthy,
        "source": active,
        "conflicts_checked": healthy,
        "reason": None if healthy else (
            f"Opera schedule is unconfirmed ({source.get('status') or active}). "
            "Known events may be outdated; do not infer free time or missing commitments. Check Plaan before planning."
        ),
    }


def resolve_opera_calendar() -> tuple[dict, dict]:
    """Resolve once so retained events and their health belong to one snapshot."""
    try:
        latest = database.get_latest_calendar_snapshot_import()
        raw, source = plaan_live.resolve_snapshot_raw(
            LIVE_SNAPSHOT_RAW, imported_snapshot=latest.get("snapshot") if latest else None,
        )
        parse_snapshot(raw)
        return raw, opera_calendar_evidence(source)
    except Exception:
        return {"as_of": "1970-01-01T00:00:00", "events": [], "fetch_warnings": []}, opera_calendar_evidence({})


@router.get("/alerts")
def cross_domain_alerts(
    training_constitution: dict = Depends(get_training_constitution),
    nutrition_constitution: dict = Depends(get_nutrition_constitution),
) -> dict:
    opera_raw, evidence = resolve_opera_calendar()

    today = clock.today()
    alerts = get_cross_domain_alerts(
        training_constitution=training_constitution,
        nutrition_constitution=nutrition_constitution,
        opera_snapshot_raw=opera_raw,
        today=today,
    )
    if evidence["reason"]:
        alerts.insert(0, evidence["reason"])

    return {
        "as_of": today.isoformat(),
        "alerts": alerts,
        "count": len(alerts),
        "calendar_evidence": evidence,
    }
