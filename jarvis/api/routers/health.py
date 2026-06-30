"""Health and persistence diagnostic routes."""

from fastapi import APIRouter

from jarvis.core import clock
from jarvis.data import database

router = APIRouter()

_PROBE_KEY = "production_persistence_probe"


@router.get("/persistence")
def health_persistence() -> dict:
    """Return read-only database diagnostics. No writes."""
    return database.get_database_diagnostics()


@router.post("/persistence/probe")
def health_persistence_probe() -> dict:
    """Write a timestamp marker to SQLite and return diagnostics.

    This endpoint only touches the persistence_markers table.
    It does not create finance transactions, does not mutate
    portfolio_state.json, and does not call any broker or execution logic.
    """
    value = clock.utc_now_iso()
    marker = database.set_persistence_marker(_PROBE_KEY, value)
    diagnostics = database.get_database_diagnostics()

    return {
        "ok": True,
        "marker": marker,
        "diagnostics": diagnostics,
        "trades_executed": False,
        "broker_connection": False,
        "portfolio_state_updated": False,
        "message": "Persistence probe saved. No finance data or portfolio state was changed.",
    }
