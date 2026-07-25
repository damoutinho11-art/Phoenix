import json
from datetime import date
from pathlib import Path

import pytest

import jarvis.domains.training.performance_hybrid as performance_hybrid
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


def snapshot(*, sequence_cursor=1, calendar_events=(), equipment=(), readiness=None):
    return PlannerInputSnapshot(
        week_start=date(2026, 7, 20),
        created_at="2026-07-20T06:00:00Z",
        completed_sessions=(),
        readiness=readiness,
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
                "estimated_minutes",
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


def test_hard_calendar_conflict_outranks_lower_spacing(training_constitution_v2):
    days = build_hybrid_week(
        training_constitution_v2,
        snapshot(
            sequence_cursor=4,
            calendar_events=({"date": "2026-07-20", "hard_conflict": True},),
        ),
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


@pytest.mark.parametrize("cursor", range(1, 7))
def test_all_cursor_rotations_preserve_36_hour_minimum_and_48_hour_target(
    training_constitution_v2, cursor
):
    days = build_hybrid_week(training_constitution_v2, snapshot(sequence_cursor=cursor))
    lower = next(day for day in days if day.session_intent == "lower_power")
    jump = next(day for day in days if day.session_intent == "jump_elastic")
    spacing_hours = abs((jump.date - lower.date).days) * 24

    assert spacing_hours >= 36
    assert spacing_hours >= 48


def test_fatigue_breaks_a_recovery_tie_toward_the_earliest_date():
    recovery_index, reason = performance_hybrid._recovery_placement(
        (), date(2026, 7, 20), (), {"fatigue_score": 7}
    )

    assert recovery_index == 0
    assert reason == "recovery_placed:fatigue"


def test_high_neural_follow_on_outranks_an_unscored_recovery_date():
    recovery_index, reason = performance_hybrid._recovery_placement(
        ("push_strength", "lower_power", "pull_strength"),
        date(2026, 7, 20),
        (),
        None,
    )

    assert recovery_index == 2
    assert reason == "recovery_placed:default"


@pytest.mark.parametrize(
    ("intent", "budgets"),
    (
        ("push_strength", (22, 18, 10, 15)),
        ("pull_strength", (20, 22, 8, 15)),
        ("lower_power", (8, 15, 20, 17, 10)),
        ("push_volume", (20, 15, 12, 10, 13)),
        ("pull_volume", (20, 18, 12, 10, 10)),
        ("jump_elastic", (10, 10, 15, 25)),
    ),
)
def test_generated_block_budgets_match_the_configured_session_duration(
    training_constitution_v2, intent, budgets
):
    day = next(
        day
        for day in build_hybrid_week(training_constitution_v2, snapshot())
        if day.session_intent == intent
    )

    assert tuple(item["estimated_minutes"] for item in day.exercises) == budgets
    assert sum(item["estimated_minutes"] for item in day.exercises) == day.estimated_minutes


def test_build_fails_closed_when_an_intent_budget_count_mismatches_its_template(
    monkeypatch, training_constitution_v2
):
    monkeypatch.setitem(
        performance_hybrid._SESSION_BLOCK_MINUTES, "push_strength", (22, 18)
    )

    with pytest.raises(ValueError, match="budget count"):
        build_hybrid_week(training_constitution_v2, snapshot())


def test_build_fails_closed_when_an_intent_budget_sum_mismatches_its_duration(
    monkeypatch, training_constitution_v2
):
    monkeypatch.setitem(
        performance_hybrid._SESSION_BLOCK_MINUTES, "push_strength", (22, 18, 10, 14)
    )

    with pytest.raises(ValueError, match="budget sum"):
        build_hybrid_week(training_constitution_v2, snapshot())


def test_40_minute_compression_removes_optional_then_last_accessory(plan_day):
    compressed = compress_session(plan_day, 40)

    assert compressed.estimated_minutes == 40
    assert [item["movement_family"] for item in compressed.exercises] == [
        "horizontal_push",
        "vertical_push",
    ]
    assert compressed.decision_reasons == ("sequence_resumed", "time_compressed")


def test_compression_reports_the_truthful_protected_work_floor(baseline_days):
    lower = next(day for day in baseline_days if day.session_intent == "lower_power")
    compressed = compress_session(lower, 40)

    assert compressed.estimated_minutes == 60
    assert sum(item["estimated_minutes"] for item in compressed.exercises) == 60
    assert compressed.decision_reasons == (
        "sequence_resumed",
        "time_compressed:floor_preserved",
    )


@pytest.mark.parametrize(
    ("intent", "expected_minutes"),
    (
        ("push_strength", 40),
        ("pull_strength", 42),
        ("push_volume", 47),
        ("pull_volume", 50),
        ("jump_elastic", 45),
    ),
)
def test_40_minute_compression_keeps_truthful_template_budget_totals(
    baseline_days, intent, expected_minutes
):
    day = next(day for day in baseline_days if day.session_intent == intent)
    compressed = compress_session(day, 40)

    assert compressed.estimated_minutes == expected_minutes
    assert sum(item["estimated_minutes"] for item in compressed.exercises) == expected_minutes


def test_compression_leaves_the_original_immutable_day_unchanged(plan_day):
    original_exercises = plan_day.exercises
    original_reasons = plan_day.decision_reasons

    compressed = compress_session(plan_day, 40)

    assert plan_day.exercises == original_exercises
    assert plan_day.decision_reasons == original_reasons
    assert compressed.exercises is not plan_day.exercises


def test_peak_removes_loaded_lower_and_keeps_upper_maintenance(baseline_days):
    days = apply_phase_rules(baseline_days, phase="peak", week=1)
    lower = next(day for day in days if day.date == next(
        item.date for item in baseline_days if item.session_intent == "lower_power"
    ))
    push = next(day for day in days if day.session_intent == "push_strength")
    jump = next(day for day in days if day.session_intent == "jump_elastic")

    assert not any(day.session_intent == "lower_power" for day in days)
    assert lower.session_type == "recovery"
    assert lower.decision_reasons == ("sequence_resumed", "phase_lower_removed:peak")
    assert push.decision_reasons == (
        "sequence_resumed",
        "time_compressed",
        "phase_maintenance:peak",
    )
    assert all(
        day.decision_reasons[-1] == "phase_maintenance:peak"
        for day in days
        if day.session_type == "general"
    )
    assert jump.decision_reasons == (
        "sequence_resumed",
        "time_compressed",
        "phase_jump_volume_limited:peak",
    )


def test_attempt_keeps_only_required_jump_preparation_and_attempt_exposure(baseline_days):
    days = apply_phase_rules(baseline_days, phase="attempt", week=1)
    jump = next(day for day in days if day.session_intent == "jump_elastic")
    push = next(day for day in days if day.session_intent == "push_strength")
    lower = next(day for day in days if day.date == next(
        item.date for item in baseline_days if item.session_intent == "lower_power"
    ))

    assert {item["movement_family"] for item in jump.exercises} == {
        "dynamic_warmup",
        "sprint_mechanics",
        "approach_jump",
    }
    assert jump.estimated_minutes == 45
    assert jump.decision_reasons == ("sequence_resumed", "phase_attempt_exposure")
    assert push.decision_reasons == (
        "sequence_resumed",
        "time_compressed:floor_preserved",
        "phase_maintenance:attempt",
    )
    assert all(
        day.decision_reasons[-1] == "phase_maintenance:attempt"
        for day in days
        if day.session_type == "general"
    )
    assert lower.session_type == "recovery"
    assert lower.decision_reasons == ("sequence_resumed", "phase_lower_removed:attempt")
