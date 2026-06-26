"""Cross-domain intelligence router. Wires training × nutrition × calendar."""

from datetime import date

from fastapi import APIRouter, Depends

from jarvis.api.dependencies import (
    get_nutrition_constitution,
    get_training_constitution,
)
from jarvis.domains.calendar.engine import parse_snapshot
from jarvis.domains.calendar.tests.fixtures import LIVE_SNAPSHOT_RAW
from jarvis.domains.training.engine import get_cross_domain_alerts

router = APIRouter()


@router.get("/alerts")
def cross_domain_alerts(
    training_constitution: dict = Depends(get_training_constitution),
    nutrition_constitution: dict = Depends(get_nutrition_constitution),
) -> dict:
    try:
        parse_snapshot(LIVE_SNAPSHOT_RAW)
        opera_raw = LIVE_SNAPSHOT_RAW
    except Exception:
        opera_raw = None

    today = date.today()
    alerts = get_cross_domain_alerts(
        training_constitution=training_constitution,
        nutrition_constitution=nutrition_constitution,
        opera_snapshot_raw=opera_raw,
        today=today,
    )

    return {
        "as_of": today.isoformat(),
        "alerts": alerts,
        "count": len(alerts),
    }
