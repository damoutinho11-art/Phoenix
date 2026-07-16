import json
from datetime import date
from pathlib import Path

import pytest

from jarvis.domains.training.adaptive_planner import (
    PlanningSnapshot,
    apply_constraints,
    generate_weekly_plan,
)
from jarvis.domains.training.plan_contracts import PlanDay, TrainingConstraint


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


def test_move_today_to_tomorrow_replans_downstream_week(training_constitution):
    move = TrainingConstraint.from_mapping(
        "move_session", "user", {"source_date": "2026-07-20", "target_date": "2026-07-21"}
    )
    plan = generate_weekly_plan(training_constitution, snapshot(), (move,))
    monday, tuesday, wednesday = plan.days[:3]
    assert monday.session_type == "rest"
    assert tuesday.objective == "jump_strength"
    assert tuesday.change_reason == "moved_from:2026-07-20"
    assert wednesday.change_reason is not None


def test_skip_does_not_double_next_session(training_constitution):
    skip = TrainingConstraint.from_mapping("skip_session", "user", {"date": "2026-07-20"})
    plan = generate_weekly_plan(training_constitution, snapshot(), (skip,))
    assert plan.days[0].session_type == "rest"
    assert plan.days[1].estimated_minutes <= 60


def test_time_limit_caps_session_and_records_reason(training_constitution):
    limit = TrainingConstraint.from_mapping(
        "time_limit", "user", {"date": "2026-07-20", "minutes": 30}
    )

    plan = generate_weekly_plan(training_constitution, snapshot(), (limit,))

    assert plan.days[0].estimated_minutes == 30
    assert plan.days[0].change_reason == "time_limit"


def test_unavailable_date_becomes_a_rest_day(training_constitution):
    unavailable = TrainingConstraint.from_mapping(
        "unavailable", "user", {"date": "2026-07-20"}
    )

    plan = generate_weekly_plan(training_constitution, snapshot(), (unavailable,))

    assert plan.days[0].session_type == "rest"
    assert plan.days[0].estimated_minutes == 0
    assert plan.days[0].change_reason == "unavailable"


def test_replacement_preserves_movement_family(training_constitution):
    constraint = TrainingConstraint.from_mapping(
        "replace_exercise", "user", {"date": "2026-07-20", "from": "back_squat", "to": "split_squat"}
    )
    plan = generate_weekly_plan(training_constitution, snapshot(), (constraint,))
    assert plan.days[0].change_reason == "exercise_replaced:back_squat:split_squat"


def test_replacement_rejects_different_movement_family(training_constitution):
    constraint = TrainingConstraint.from_mapping(
        "replace_exercise", "user", {"date": "2026-07-20", "from": "back_squat", "to": "power_clean"}
    )
    with pytest.raises(ValueError, match="movement family"):
        generate_weekly_plan(training_constitution, snapshot(), (constraint,))


def test_replacement_rejects_exercises_outside_configured_families(training_constitution):
    constraint = TrainingConstraint.from_mapping(
        "replace_exercise", "user", {"date": "2026-07-20", "from": "unknown_one", "to": "unknown_two"}
    )

    with pytest.raises(ValueError, match="Replacement must preserve movement family"):
        generate_weekly_plan(training_constitution, snapshot(), (constraint,))


def _exercise_day():
    return PlanDay(
        date=date(2026, 7, 20),
        session_type="high_intensity",
        objective="jump_strength",
        exercises=({"name": "back_squat"},),
        estimated_minutes=60,
    )


def test_equipment_substitutes_first_valid_family_exercise_deterministically(training_constitution):
    constraint = TrainingConstraint.from_mapping(
        "equipment_available", "user", {"date": "2026-07-20", "equipment": ("barbell",)}
    )

    first = apply_constraints((_exercise_day(),), (constraint,), training_constitution)
    second = apply_constraints((_exercise_day(),), (constraint,), training_constitution)

    assert first == second
    assert first[0].exercises[0]["name"] == "split_squat"
    assert first[0].change_reason == "equipment_substituted:back_squat:split_squat"


def test_avoid_preference_substitutes_first_valid_family_exercise(training_constitution):
    constraint = TrainingConstraint.from_mapping(
        "exercise_preference",
        "user",
        {"date": "2026-07-20", "exercise": "back_squat", "avoid_or_prefer": "avoid"},
    )

    plan = apply_constraints((_exercise_day(),), (constraint,), training_constitution)

    assert plan[0].exercises[0]["name"] == "split_squat"
    assert plan[0].change_reason == "preference_substituted:back_squat:split_squat"


def test_prefer_preference_substitutes_within_the_same_family(training_constitution):
    day = PlanDay(
        date=date(2026, 7, 20),
        session_type="high_intensity",
        objective="jump_strength",
        exercises=({"name": "split_squat"},),
        estimated_minutes=60,
    )
    constraint = TrainingConstraint.from_mapping(
        "exercise_preference",
        "user",
        {"date": "2026-07-20", "exercise": "back_squat", "avoid_or_prefer": "prefer"},
    )

    plan = apply_constraints((day,), (constraint,), training_constitution)

    assert plan[0].exercises[0]["name"] == "back_squat"
    assert plan[0].change_reason == "preference_substituted:split_squat:back_squat"


def test_apply_constraints_orders_days_by_date(training_constitution):
    monday = _exercise_day()
    tuesday = PlanDay(
        date=date(2026, 7, 21),
        session_type="general",
        objective="general_strength",
        exercises=(),
        estimated_minutes=60,
    )

    plan = apply_constraints((tuesday, monday), (), training_constitution)

    assert tuple(day.date for day in plan) == (date(2026, 7, 20), date(2026, 7, 21))
