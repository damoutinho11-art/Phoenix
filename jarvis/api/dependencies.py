"""Shared FastAPI dependencies for J.A.R.V.I.S. API.

Each function is a FastAPI dependency (callable passed to Depends()). Keeping
them here — rather than inline in routers — means any test can override them
via app.dependency_overrides without touching router code.
"""

import json
from pathlib import Path

from fastapi import HTTPException

from jarvis.domains.calendar import engine as calendar_engine
from jarvis.domains.finance import engine as finance_engine
from jarvis.domains.training import engine as training_engine


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


def get_training_constitution() -> dict:
    """Load and validate the training constitution. HTTP 500 on violation."""
    try:
        import json
        with open(training_engine.DEFAULT_CONSTITUTION_PATH) as f:
            constitution = json.load(f)
        if constitution.get("read_only") is not True:
            raise ValueError("read_only must be true")
        if constitution.get("manual_approval_required_for_any_external_action") is not True:
            raise ValueError("manual_approval_required_for_any_external_action must be true")
        return constitution
    except FileNotFoundError:
        raise HTTPException(status_code=500, detail="Training constitution file missing")
    except ValueError as exc:
        raise HTTPException(status_code=500, detail=f"Training constitution violation: {exc}")


def get_nutrition_constitution() -> dict:
    """Load the nutrition domain constitution."""
    path = Path(__file__).parent.parent / "domains" / "nutrition" / "constitution.json"
    if not path.exists():
        raise HTTPException(status_code=503, detail="Nutrition constitution not found")
    with open(path) as f:
        return json.load(f)
