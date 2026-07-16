from datetime import date

import pytest

from jarvis.domains.training.plan_contracts import (
    PlanDay,
    TrainingConstraint,
    WeeklyPlanReceipt,
    canonical_hash,
    iso_cycle_id,
)


def test_canonical_hash_is_order_independent_and_type_sensitive():
    assert canonical_hash({"b": 2, "a": 1}) == canonical_hash({"a": 1, "b": 2})
    assert canonical_hash({"days": ["mon"]}) != canonical_hash({"days": ("mon",)})


def test_plan_receipt_rejects_duplicate_dates():
    day = PlanDay(
        date=date(2026, 7, 20),
        session_type="high_intensity",
        objective="jump_strength",
        exercises=(),
        estimated_minutes=60,
    )
    with pytest.raises(ValueError, match="unique dates"):
        WeeklyPlanReceipt.create(
            parent_plan_id=None,
            constitution_version="1",
            planner_version="adaptive-v1",
            cycle_id="2026-W30",
            days=(day, day),
            constraints=(),
            validations=(),
            created_at="2026-07-20T06:00:00Z",
            status="proposed",
        )


def test_iso_cycle_id_uses_iso_week():
    assert iso_cycle_id(date(2026, 7, 20)) == "2026-W30"
