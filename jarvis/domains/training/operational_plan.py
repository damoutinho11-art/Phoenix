"""Pure projection of immutable adaptive plan receipts into today's session."""

from __future__ import annotations

from collections.abc import Mapping, Sequence
from datetime import date
from typing import Any


def _plan_required() -> dict[str, Any]:
    return {
        "operational_state": "plan_required",
        "plan_provenance": None,
        "session": None,
    }


def project_plan_day(
    receipt: Mapping[str, Any] | None,
    target_date: date,
) -> dict[str, Any]:
    """Return the active receipt's dated session, or a closed plan-required state."""
    if not isinstance(receipt, Mapping):
        return _plan_required()
    plan_id = receipt.get("plan_id")
    receipt_hash = receipt.get("receipt_hash")
    days = receipt.get("days")
    if (
        not isinstance(plan_id, str)
        or not plan_id.strip()
        or not isinstance(receipt_hash, str)
        or not receipt_hash.strip()
        or not isinstance(days, Sequence)
        or isinstance(days, (str, bytes))
    ):
        return _plan_required()

    target = target_date.isoformat()
    day = next(
        (
            item
            for item in days
            if isinstance(item, Mapping) and item.get("date") == target
        ),
        None,
    )
    if day is None:
        return _plan_required()

    session_type = day.get("session_type")
    objective = day.get("objective")
    exercises = day.get("exercises", ())
    estimated_minutes = day.get("estimated_minutes")
    if (
        not isinstance(session_type, str)
        or not session_type.strip()
        or not isinstance(objective, str)
        or not objective.strip()
        or not isinstance(exercises, Sequence)
        or isinstance(exercises, (str, bytes))
        or any(not isinstance(item, Mapping) for item in exercises)
        or type(estimated_minutes) is not int
        or estimated_minutes < 0
    ):
        return _plan_required()

    return {
        "operational_state": "active_plan",
        "plan_provenance": {
            "plan_id": plan_id,
            "receipt_hash": receipt_hash,
            "date": target,
        },
        "session": {
            "date": target,
            "session_type": session_type,
            "display_name": objective.replace("_", " ").title(),
            "objective": objective,
            "exercises": [dict(item) for item in exercises],
            "estimated_minutes": estimated_minutes,
            "change_reason": day.get("change_reason"),
            "is_rest": session_type in {"rest", "recovery"},
        },
    }
