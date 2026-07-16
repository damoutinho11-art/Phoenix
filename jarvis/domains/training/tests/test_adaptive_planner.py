import json
from datetime import date
from pathlib import Path

import pytest

from jarvis.domains.training.adaptive_planner import PlanningSnapshot, generate_weekly_plan


@pytest.fixture
def training_constitution():
    path = Path(__file__).parent.parent / "constitution.json"
    return json.loads(path.read_text(encoding="utf-8"))


def snapshot():
    return PlanningSnapshot(
        week_start=date(2026, 7, 20),
        created_at="2026-07-20T06:00:00Z",
        completed_sessions=(),
        readiness=None,
        calendar_events=(),
        progression={},
        equipment=("barbell", "rack", "hex_bar"),
        preferences=(),
    )


def test_baseline_plan_has_seven_ordered_days(training_constitution):
    plan = generate_weekly_plan(training_constitution, snapshot())
    assert len(plan.days) == 7
    assert tuple(day.date for day in plan.days) == tuple(
        date(2026, 7, 20 + offset) for offset in range(7)
    )


def test_identical_snapshot_produces_identical_receipt(training_constitution):
    first = generate_weekly_plan(training_constitution, snapshot())
    second = generate_weekly_plan(training_constitution, snapshot())
    assert first.plan_id == second.plan_id
    assert first.receipt_hash == second.receipt_hash
