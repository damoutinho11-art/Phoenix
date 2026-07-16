import json
from dataclasses import replace
from datetime import date
from pathlib import Path

import pytest

from jarvis.domains.training.adaptive_planner import (
    PlanningSnapshot,
    apply_constraints,
    generate_weekly_plan,
)
from jarvis.domains.training.plan_evidence import build_planning_snapshot
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


def test_baseline_plan_uses_engine_order_and_constitution_prescriptions(training_constitution):
    plan = generate_weekly_plan(training_constitution, snapshot())

    assert _exercise_names(plan.days[0]) == (
        "knee_extension_isometrics",
        "dynamic_flexibility",
        "barbell_warmup",
        "hex_bar_jump",
        "back_squat",
        "hip_thrust",
        "seated_calf_raise",
    )
    assert _exercise_names(plan.days[1]) == (
        "shoulder_rehab",
        "bench_press",
        "lat_pulldown",
        "lateral_raise",
    )
    assert _exercise_names(plan.days[5]) == (
        "knee_extension_isometrics",
        "dynamic_flexibility",
        "sprint_development_drills",
        "jumps_10_to_100pct",
        "max_effort_approach_jumps",
    )


def test_constitution_defines_equipment_for_programmed_exercises(training_constitution):
    equipment = training_constitution["adaptive_planner"]["exercise_equipment"]

    assert equipment["back_squat"] == ["barbell", "rack"]
    assert equipment["bench_press"] == ["barbell", "bench"]
    assert equipment["max_effort_approach_jumps"] == []


def test_identical_snapshot_produces_identical_receipt(training_constitution):
    first = generate_weekly_plan(training_constitution, snapshot())
    second = generate_weekly_plan(training_constitution, snapshot())
    assert first.plan_id == second.plan_id
    assert first.receipt_hash == second.receipt_hash


def test_pain_block_routes_high_neural_days_to_recovery(training_constitution):
    unsafe = replace(
        snapshot(),
        readiness={"knee": 5, "sharp_pain": True},
        safety_blocks=("knee",),
    )

    plan = generate_weekly_plan(training_constitution, unsafe)

    assert plan.days[0].session_type == "recovery"
    assert plan.days[0].objective == "pain_safe_recovery"
    assert plan.days[0].exercises == ()
    assert plan.days[0].change_reason == "hard_pain_block"
    assert plan.days[5].session_type == "recovery"
    assert any(row.rule == "pain_block" and row.passed for row in plan.validations)


def test_hard_readiness_signal_blocks_without_precomputed_safety_blocks(training_constitution):
    unsafe = replace(snapshot(), readiness={"ankle": 4, "limping": True})

    plan = generate_weekly_plan(training_constitution, unsafe)

    assert plan.days[0].session_type == "recovery"
    assert plan.days[0].change_reason == "hard_pain_block"


def test_pain_block_validation_reports_no_op_when_constraints_removed_high_neural_work(
    training_constitution,
):
    unsafe = replace(
        snapshot(),
        readiness={"knee": 5, "sharp_pain": True},
        safety_blocks=("knee",),
    )
    constraints = (
        TrainingConstraint.from_mapping("skip_session", "user", {"date": "2026-07-20"}),
        TrainingConstraint.from_mapping("skip_session", "user", {"date": "2026-07-22"}),
        TrainingConstraint.from_mapping("skip_session", "user", {"date": "2026-07-25"}),
    )

    plan = generate_weekly_plan(training_constitution, unsafe, constraints)

    pain_validation = next(row for row in plan.validations if row.rule == "pain_block")
    assert pain_validation.passed
    assert pain_validation.detail == (
        "Hard pain block for knee required no additional routing; "
        "no high-neural work remained after constraints."
    )


def test_pain_block_precedes_calendar_and_progression_routing(training_constitution):
    unsafe = replace(
        snapshot(),
        readiness={"knee": 5, "sharp_pain": True},
        safety_blocks=("knee",),
        calendar_events=({"event_type": "performance", "date": "2026-07-20"},),
        progression={
            "Back Squat": {
                "suggested_kg": 72.5,
                "basis": "All sets hit target reps; add 5kg.",
                "deload": False,
            }
        },
    )

    plan = generate_weekly_plan(training_constitution, unsafe)

    assert plan.days[0].session_type == "recovery"
    assert plan.days[0].change_reason == "hard_pain_block"
    assert plan.days[0].exercises == ()


def test_explicit_hard_calendar_event_preserves_pain_recovery_provenance(training_constitution):
    unsafe = replace(
        snapshot(),
        readiness={"knee": 5, "sharp_pain": True},
        safety_blocks=("knee",),
        calendar_events=({"severity": "hard", "date": "2026-07-20"},),
    )

    plan = generate_weekly_plan(training_constitution, unsafe)

    assert plan.days[0].session_type == "recovery"
    assert plan.days[0].objective == "pain_safe_recovery"
    assert plan.days[0].change_reason == "hard_pain_block"
    calendar_validation = next(
        row for row in plan.validations if row.rule == "calendar_conflicts"
    )
    assert calendar_validation.passed
    assert "2026-07-20" in calendar_validation.detail


def test_calendar_performance_conflict_routes_high_neural_day_to_recovery(training_constitution):
    conflicted = replace(
        snapshot(),
        calendar_events=({"event_type": "performance", "date": "2026-07-22"},),
    )

    plan = generate_weekly_plan(training_constitution, conflicted)

    assert plan.days[2].session_type == "recovery"
    assert plan.days[2].objective == "calendar_recovery"
    assert plan.days[2].change_reason == "calendar_hard_conflict"
    assert plan.days[1].session_type == "general"
    assert any(row.rule == "calendar_conflicts" and row.passed for row in plan.validations)


def test_move_preserves_minimum_high_neural_spacing(training_constitution):
    move = TrainingConstraint.from_mapping(
        "move_session", "user", {"source_date": "2026-07-20", "target_date": "2026-07-21"}
    )

    plan = generate_weekly_plan(training_constitution, snapshot(), (move,))
    high_neural_dates = [
        day.date for day in plan.days if day.session_type in {"high_intensity", "jump"}
    ]

    assert all(
        (later - earlier).days >= 2
        for earlier, later in zip(high_neural_dates, high_neural_dates[1:])
    )
    assert any(row.rule == "recovery_spacing" and row.passed for row in plan.validations)


def test_progression_enriches_safe_exercise_payloads(training_constitution):
    evidence = replace(
        snapshot(),
        progression={
            "Bench Press": {
                "suggested_kg": 62.5,
                "basis": "All sets hit target reps; add 2.5kg.",
                "deload": False,
            }
        },
    )

    plan = generate_weekly_plan(training_constitution, evidence)
    bench_press = next(
        exercise for exercise in plan.days[1].exercises if exercise["name"] == "bench_press"
    )

    assert bench_press["suggested_kg"] == 62.5
    assert bench_press["progression_basis"] == "All sets hit target reps; add 2.5kg."
    assert bench_press["deload"] is False
    assert plan.days[1].change_reason == "progression_applied:bench_press:62.5kg"


def test_progression_alias_order_does_not_change_receipt(training_constitution):
    first = replace(
        snapshot(),
        progression={
            "bench_press": {"suggested_kg": 65, "basis": "underscore", "deload": False},
            "Bench Press": {"suggested_kg": 62.5, "basis": "spaced", "deload": False},
        },
    )
    second = replace(
        snapshot(),
        progression={
            "Bench Press": {"suggested_kg": 62.5, "basis": "spaced", "deload": False},
            "bench_press": {"suggested_kg": 65, "basis": "underscore", "deload": False},
        },
    )

    first_plan = generate_weekly_plan(training_constitution, first)
    second_plan = generate_weekly_plan(training_constitution, second)

    assert first_plan.receipt_hash == second_plan.receipt_hash
    bench_press = next(
        exercise for exercise in first_plan.days[1].exercises if exercise["name"] == "bench_press"
    )
    assert bench_press["suggested_kg"] == 62.5


def test_reversed_same_date_sessions_without_ids_produce_identical_progression_and_receipt(
    training_constitution,
):
    completed = (
        {
            "date": "2026-07-19",
            "session_type": "general",
            "exercises": [
                {
                    "name": "Bench Press",
                    "target_reps": 5,
                    "sets": [{"reps": 5, "target_reps": 5, "weight_kg": 60}],
                }
            ],
        },
        {
            "date": "2026-07-19",
            "session_type": "general",
            "exercises": [
                {
                    "name": "Bench Press",
                    "target_reps": 5,
                    "sets": [{"reps": 3, "target_reps": 5, "weight_kg": 80}],
                }
            ],
        },
    )
    first = build_planning_snapshot(
        week_start=date(2026, 7, 20),
        created_at="2026-07-20T06:00:00Z",
        sessions=completed,
        readiness=None,
        calendar_events=(),
        equipment=("barbell", "bench"),
        preferences={},
    )
    second = build_planning_snapshot(
        week_start=date(2026, 7, 20),
        created_at="2026-07-20T06:00:00Z",
        sessions=tuple(reversed(completed)),
        readiness=None,
        calendar_events=(),
        equipment=("barbell", "bench"),
        preferences={},
    )

    assert first.completed_sessions == second.completed_sessions
    assert first.progression == second.progression
    assert generate_weekly_plan(training_constitution, first).receipt_hash == generate_weekly_plan(
        training_constitution, second
    ).receipt_hash


def test_weekly_volume_change_validation_is_explicit(training_constitution):
    plan = generate_weekly_plan(training_constitution, snapshot())
    volume_validation = next(row for row in plan.validations if row.rule == "weekly_volume_change")

    assert volume_validation.passed
    assert volume_validation.severity == "warning"
    assert "360 minutes" in volume_validation.detail


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

    assert "back_squat" not in _exercise_names(plan.days[0])
    assert "split_squat" in _exercise_names(plan.days[0])
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


def _exercise_names(day):
    return tuple(exercise["name"] for exercise in day.exercises)


def test_equipment_substitutes_first_valid_family_exercise_deterministically(training_constitution):
    constraint = TrainingConstraint.from_mapping(
        "equipment_available", "user", {"date": "2026-07-20", "equipment": ("barbell",)}
    )

    first = apply_constraints((_exercise_day(),), (constraint,), training_constitution)
    second = apply_constraints((_exercise_day(),), (constraint,), training_constitution)

    assert first == second
    assert first[0].exercises[0]["name"] == "split_squat"
    assert first[0].change_reason == "equipment_substituted:back_squat:split_squat"


def test_equipment_substitutes_every_affected_exercise_and_preserves_reasons(training_constitution):
    day = PlanDay(
        date=date(2026, 7, 20),
        session_type="high_intensity",
        objective="jump_strength",
        exercises=({"name": "back_squat"}, {"name": "power_clean"}),
        estimated_minutes=60,
    )
    constraint = TrainingConstraint.from_mapping(
        "equipment_available", "user", {"date": "2026-07-20", "equipment": ("barbell",)}
    )

    plan = apply_constraints((day,), (constraint,), training_constitution)

    assert _exercise_names(plan[0]) == ("split_squat", "approach_jump")
    assert plan[0].change_reason == (
        "equipment_substituted:back_squat:split_squat;"
        "equipment_substituted:power_clean:approach_jump"
    )


def test_equipment_without_metadata_retains_exercise_with_explicit_reason(training_constitution):
    training_constitution["adaptive_planner"]["exercise_equipment"].pop("back_squat")
    day = PlanDay(
        date=date(2026, 7, 20),
        session_type="high_intensity",
        objective="jump_strength",
        exercises=({"name": "back_squat"},),
        estimated_minutes=60,
    )
    constraint = TrainingConstraint.from_mapping(
        "equipment_available", "user", {"date": "2026-07-20", "equipment": ()}
    )

    plan = apply_constraints((day,), (constraint,), training_constitution)

    assert _exercise_names(plan[0]) == ("back_squat",)
    assert plan[0].change_reason == "equipment_retained:back_squat:unknown_equipment"


def test_substitutions_record_no_reason_when_exercise_content_is_unchanged(training_constitution):
    equipment = TrainingConstraint.from_mapping(
        "equipment_available", "user", {"date": "2026-07-20", "equipment": ("barbell", "rack")}
    )
    preference = TrainingConstraint.from_mapping(
        "exercise_preference",
        "user",
        {"date": "2026-07-20", "exercise": "back_squat", "avoid_or_prefer": "prefer"},
    )

    equipment_plan = apply_constraints((_exercise_day(),), (equipment,), training_constitution)
    preference_plan = apply_constraints((_exercise_day(),), (preference,), training_constitution)

    assert equipment_plan[0].change_reason is None
    assert preference_plan[0].change_reason is None


def test_avoid_preference_substitutes_first_valid_family_exercise(training_constitution):
    constraint = TrainingConstraint.from_mapping(
        "exercise_preference",
        "user",
        {"date": "2026-07-20", "exercise": "back_squat", "avoid_or_prefer": "avoid"},
    )

    plan = apply_constraints((_exercise_day(),), (constraint,), training_constitution)

    assert plan[0].exercises[0]["name"] == "split_squat"
    assert plan[0].change_reason == "preference_substituted:back_squat:split_squat"


def test_preference_substitutes_every_matching_family_exercise(training_constitution):
    day = PlanDay(
        date=date(2026, 7, 20),
        session_type="high_intensity",
        objective="jump_strength",
        exercises=({"name": "split_squat"}, {"name": "leg_press"}),
        estimated_minutes=60,
    )
    constraint = TrainingConstraint.from_mapping(
        "exercise_preference",
        "user",
        {"date": "2026-07-20", "exercise": "back_squat", "avoid_or_prefer": "prefer"},
    )

    plan = apply_constraints((day,), (constraint,), training_constitution)

    assert _exercise_names(plan[0]) == ("back_squat", "back_squat")
    assert plan[0].change_reason == (
        "preference_substituted:split_squat:back_squat;"
        "preference_substituted:leg_press:back_squat"
    )


def test_preference_rejects_unknown_to_unknown_family_pair(training_constitution):
    day = PlanDay(
        date=date(2026, 7, 20),
        session_type="general",
        objective="general_strength",
        exercises=({"name": "unknown_source"},),
        estimated_minutes=60,
    )
    constraint = TrainingConstraint.from_mapping(
        "exercise_preference",
        "user",
        {"date": "2026-07-20", "exercise": "unknown_target", "avoid_or_prefer": "prefer"},
    )

    plan = apply_constraints((day,), (constraint,), training_constitution)

    assert _exercise_names(plan[0]) == ("unknown_source",)
    assert plan[0].change_reason is None


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


def test_replacement_records_no_change_when_source_is_not_in_the_day(training_constitution):
    constraint = TrainingConstraint.from_mapping(
        "replace_exercise", "user", {"date": "2026-07-20", "from": "leg_press", "to": "split_squat"}
    )

    plan = generate_weekly_plan(training_constitution, snapshot(), (constraint,))

    assert "leg_press" not in _exercise_names(plan.days[0])
    assert plan.days[0].change_reason is None


def test_composes_change_reasons_only_for_actual_exercise_replacements(training_constitution):
    constraints = (
        TrainingConstraint.from_mapping(
            "time_limit", "user", {"date": "2026-07-20", "minutes": 30}
        ),
        TrainingConstraint.from_mapping(
            "replace_exercise",
            "user",
            {"date": "2026-07-20", "from": "back_squat", "to": "split_squat"},
        ),
    )

    plan = generate_weekly_plan(training_constitution, snapshot(), constraints)

    assert "split_squat" in _exercise_names(plan.days[0])
    assert plan.days[0].change_reason == (
        "time_limit;exercise_replaced:back_squat:split_squat"
    )


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
