"""Shared FastAPI dependencies for J.A.R.V.I.S. API.

Each function is a FastAPI dependency (callable passed to Depends()). Keeping
them here — rather than inline in routers — means any test can override them
via app.dependency_overrides without touching router code.
"""

from fastapi import HTTPException

from jarvis.domains.calendar import engine as calendar_engine
from jarvis.domains.finance import engine as finance_engine


def get_finance_constitution() -> dict:
    """Load and validate the finance constitution. HTTP 500 on violation."""
    try:
        constitution = finance_engine.load_json(finance_engine.DEFAULT_CONSTITUTION_PATH)
        finance_engine.validate_constitution(constitution)
        return constitution
    except ValueError as exc:
        raise HTTPException(status_code=500, detail=f"Finance constitution violation: {exc}")


def get_portfolio_state() -> dict:
    """Load portfolio_state.json. HTTP 503 if the file is missing."""
    try:
        return finance_engine.load_json(finance_engine.DEFAULT_PORTFOLIO_STATE_PATH)
    except FileNotFoundError:
        raise HTTPException(
            status_code=503,
            detail=(
                "portfolio_state.json not found. "
                "Populate your holdings data before using this endpoint."
            ),
        )


def get_calendar_constitution() -> dict:
    """Load and validate the calendar constitution. HTTP 500 on violation."""
    try:
        constitution = calendar_engine.load_constitution()
        calendar_engine.validate_constitution(constitution)
        return constitution
    except ValueError as exc:
        raise HTTPException(status_code=500, detail=f"Calendar constitution violation: {exc}")
