import json
from datetime import date
from pathlib import Path

import pytest

from jarvis.domains.training.performance_hybrid import (
    HYBRID_SEQUENCE,
    apply_phase_rules,
    build_hybrid_week,
    compress_session,
)
from jarvis.domains.training.plan_contracts import PlannerInputSnapshot


@pytest.fixture
def training_constitution_v2():
    path = Path(__file__).parent.parent / "constitution.json"
    return json.loads(path.read_text(encoding="utf-8"))


def snapshot(*, sequence_cursor=1, calendar_events=(), equipment=()):
    return PlannerInputSnapshot(
        week_start=date(2026, 7, 20),
        created_at="2026-07-20T06:00:00Z",
        completed_sessions=(),
        readiness=None,
        calendar_events=calendar_events,
        progression={},
        equipment=equipment,
        preferences=(),
        sequence_cursor=sequence_cursor,
    )


@pytest.fixture
def baseline_days(training_constitution_v2):
    return build_hybrid_week(training_constitution_v2, snapshot())


@pytest.fixture
def plan_day(baseline_days):
    return next(day for day in baseline_days if day.session_intent == "push_strength")


def test_builds_six_ordered_intents_plus_one_recovery(training_constitution_v2):
    days = build_hybrid_week(training_constitution_v2, snapshot(sequence_cursor=1))

    intents = [day.session_intent for day in days if day.session_intent]
    assert intents == list(HYBRID_SEQUENCE)
    assert sum(day.session_type == "recovery" for day in days) == 1
    recovery = next(day for day in days if day.session_type == "recovery")
    assert recovery.decision_reasons == ("recovery_placed:lower_spacing",)


def test_push_strength_uses_approved_template_and_duration(training_constitution_v2):
    day = next(
        day
        for day in build_hybrid_week(training_constitution_v2, snapshot())
        if day.session_intent == "push_strength"
    )

    assert [item["movement_family"] for item in day.exercises] == [
        "horizontal_push",
        "vertical_push",
        "lateral_delt",
        "triceps",
    ]
    assert 60 <= day.estimated_minutes <= 75


def test_rotates_sequence_and_keeps_recovery_out_of_sequence(training_constitution_v2):
    days = build_hybrid_week(training_constitution_v2, snapshot(sequence_cursor=3))
    training_days = [day for day in days if day.session_intent]
    recovery = next(day for day in days if day.session_type == "recovery")

    assert [day.session_intent for day in training_days] == list(HYBRID_SEQUENCE[2:] + HYBRID_SEQUENCE[:2])
    assert [day.sequence_position for day in training_days] == [3, 4, 5, 6, 1, 2]
    assert recovery.session_intent is None
    assert recovery.sequence_position is None
    assert recovery.sequence_length is None


def test_exercises_include_constitution_derived_equipment(training_constitution_v2):
    policy = training_constitution_v2["adaptive_planner"]
    days = build_hybrid_week(training_constitution_v2, snapshot())

    for day in days:
        for exercise in day.exercises:
            assert set(exercise) >= {
                "name",
                "movement_family",
                "priority",
                "sets",
                "reps",
                "equipment",
            }
            assert exercise["equipment"] == tuple(policy["exercise_equipment"][exercise["name"]])


def test_selects_the_first_approved_exercise_compatible_with_equipment(
    training_constitution_v2,
):
    days = build_hybrid_week(
        training_constitution_v2,
        snapshot(
            equipment=(
                "dumbbells",
                "bench",
                "incline_bench",
                "cable_machine",
                "pullup_bar",
                "weight_belt",
                "hex_bar",
                "leg_press",
                "seated_calf_raise",
            )
        ),
    )

    push_strength = next(day for day in days if day.session_intent == "push_strength")
    assert push_strength.exercises[0]["name"] == "dumbbell_bench_press"


def test_rejects_a_required_family_without_a_compatible_exercise(training_constitution_v2):
    with pytest.raises(ValueError, match="horizontal_push"):
        build_hybrid_week(training_constitution_v2, snapshot(equipment=("dumbbells",)))


def test_hard_calendar_event_receives_the_recovery_slot(training_constitution_v2):
    days = build_hybrid_week(
        training_constitution_v2,
        snapshot(calendar_events=({"date": "2026-07-20", "severity": "hard"},)),
    )

    recovery = next(day for day in days if day.session_type == "recovery")
    assert recovery.date == date(2026, 7, 20)
    assert recovery.decision_reasons == ("recovery_placed:calendar",)


def test_recovery_prefers_the_earliest_date_between_lower_and_jump(
    training_constitution_v2,
):
    days = build_hybrid_week(training_constitution_v2, snapshot(sequence_cursor=4))
    recovery = next(day for day in days if day.session_type == "recovery")

    assert recovery.date == date(2026, 7, 23)
    assert recovery.decision_reasons == ("recovery_placed:lower_spacing",)


def test_recovery_targets_48_hours_between_lower_and_jump(training_constitution_v2):
    days = build_hybrid_week(training_constitution_v2, snapshot(sequence_cursor=3))
    lower = next(day for day in days if day.session_intent == "lower_power")
    jump = next(day for day in days if day.session_intent == "jump_elastic")

    assert (jump.date - lower.date).days >= 2


def test_40_minute_compression_removes_accessories_not_primary_work(plan_day):
    compressed = compress_session(plan_day, 40)

    assert compressed.estimated_minutes == 40
    assert any(item["priority"] == "primary" for item in compressed.exercises)
    assert len(compressed.exercises) < len(plan_day.exercises)
    assert "time_compressed" in compressed.decision_reasons


def test_peak_removes_loaded_lower_and_keeps_upper_maintenance(baseline_days):
    days = apply_phase_rules(baseline_days, phase="peak", week=1)

    assert not any(day.session_intent == "lower_power" for day in days)
    assert all(day.estimated_minutes <= 45 for day in days if day.session_type == "general")


def test_attempt_keeps_only_required_jump_preparation_and_attempt_exposure(baseline_days):
    days = apply_phase_rules(baseline_days, phase="attempt", week=1)
    jump = next(day for day in days if day.session_intent == "jump_elastic")

    assert {item["movement_family"] for item in jump.exercises} == {
        "dynamic_warmup",
        "sprint_mechanics",
        "approach_jump",
    }
    assert jump.estimated_minutes <= 30
    assert all(day.estimated_minutes <= 30 for day in days if day.session_type == "general")
