from datetime import date

import pytest

from jarvis.domains.training.plan_contracts import (
    PlanDay,
    PlanValidation,
    PlannerInputSnapshot,
    TrainingConstraint,
    TrainingPlanReplayInputs,
    WeeklyPlanReceipt,
    canonical_hash,
    iso_cycle_id,
)


def test_canonical_hash_is_order_independent_and_type_sensitive():
    assert canonical_hash({"b": 2, "a": 1}) == canonical_hash({"a": 1, "b": 2})
    assert canonical_hash({"days": ["mon"]}) != canonical_hash({"days": ("mon",)})


def test_replay_inputs_deeply_freeze_constitution_snapshot_and_constraints():
    constitution = {
        "version": "1",
        "adaptive_planner": {"version": "adaptive-v1", "rules": ["hard_safety"]},
    }
    readiness = {"knee": {"pain": 0, "signals": ["clear"]}}
    progression = {"Bench Press": {"suggested_kg": 62.5, "deload": False}}
    snapshot = PlannerInputSnapshot(
        week_start=date(2026, 7, 20),
        created_at="2026-07-20T06:00:00Z",
        completed_sessions=(),
        readiness=readiness,
        calendar_events=(),
        progression=progression,
        equipment=("barbell", "bench"),
        preferences=(),
    )
    inputs = TrainingPlanReplayInputs(
        constitution=constitution,
        snapshot=snapshot,
        constraints=(),
    )

    constitution["adaptive_planner"]["rules"].append("tampered")
    readiness["knee"]["signals"].append("tampered")
    progression["Bench Press"]["suggested_kg"] = 100

    assert inputs.constitution["adaptive_planner"]["rules"] == ("hard_safety",)
    assert inputs.snapshot.readiness["knee"]["signals"] == ("clear",)
    assert inputs.snapshot.progression["Bench Press"]["suggested_kg"] == 62.5
    with pytest.raises(TypeError):
        inputs.constitution["version"] = "2"


def test_receipt_input_hash_covers_consumed_inputs_not_generated_days():
    day = PlanDay(
        date=date(2026, 7, 20),
        session_type="general",
        objective="general_strength",
        exercises=(),
        estimated_minutes=60,
    )
    changed_day = PlanDay(
        date=date(2026, 7, 20),
        session_type="recovery",
        objective="recovery",
        exercises=(),
        estimated_minutes=20,
    )
    inputs = _replay_inputs()
    values = {
        "parent_plan_id": None,
        "constitution_version": "1",
        "planner_version": "adaptive-v1",
        "cycle_id": "2026-W30",
        "constraints": (),
        "validations": (),
        "created_at": "2026-07-20T06:00:00Z",
        "status": "proposed",
        "replay_inputs": inputs,
    }

    first = WeeklyPlanReceipt.create(days=(day,), **values)
    changed_output = WeeklyPlanReceipt.create(days=(changed_day,), **values)
    changed_inputs = WeeklyPlanReceipt.create(
        days=(day,),
        **{
            **values,
            "replay_inputs": _replay_inputs(readiness={"knee": 1}),
        },
    )

    assert first.input_hash == changed_output.input_hash
    assert first.receipt_hash != changed_output.receipt_hash
    assert first.input_hash != changed_inputs.input_hash
    assert first.plan_id != changed_inputs.plan_id


def test_replay_inputs_round_trip_through_receipt_mapping():
    day = PlanDay(
        date=date(2026, 7, 20),
        session_type="general",
        objective="general_strength",
        exercises=({"name": "bench_press", "sets": [5, 5, 5]},),
        estimated_minutes=60,
    )
    receipt = WeeklyPlanReceipt.create(
        parent_plan_id=None,
        constitution_version="1",
        planner_version="adaptive-v1",
        cycle_id="2026-W30",
        days=(day,),
        constraints=(),
        validations=(),
        created_at="2026-07-20T06:00:00Z",
        status="proposed",
        replay_inputs=_replay_inputs(),
    )

    restored = WeeklyPlanReceipt.from_mapping(receipt.to_mapping())

    assert restored == receipt
    assert restored.input_hash == receipt.input_hash
    assert restored.receipt_hash == receipt.receipt_hash


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
            replay_inputs=_replay_inputs(),
            created_at="2026-07-20T06:00:00Z",
            status="proposed",
        )


def test_iso_cycle_id_uses_iso_week():
    assert iso_cycle_id(date(2026, 7, 20)) == "2026-W30"


def test_receipt_hashes_nonempty_constraints_and_validations_deterministically():
    day = PlanDay(
        date=date(2026, 7, 20),
        session_type="high_intensity",
        objective="jump_strength",
        exercises=(),
        estimated_minutes=60,
    )
    constraint = TrainingConstraint.from_mapping(
        kind="time_limit",
        source="user",
        values={"minutes": 60},
    )
    validation = PlanValidation(
        rule="weekly_volume_cap",
        passed=True,
        severity="info",
        detail="Within policy",
    )
    values = {
        "parent_plan_id": None,
        "constitution_version": "1",
        "planner_version": "adaptive-v1",
        "cycle_id": "2026-W30",
        "days": (day,),
        "constraints": (constraint,),
        "validations": (validation,),
        "replay_inputs": TrainingPlanReplayInputs(
            constitution={
                "version": "1",
                "adaptive_planner": {"version": "adaptive-v1"},
            },
            snapshot=_replay_inputs().snapshot,
            constraints=(constraint,),
        ),
        "created_at": "2026-07-20T06:00:00Z",
        "status": "proposed",
    }

    first = WeeklyPlanReceipt.create(**values)
    second = WeeklyPlanReceipt.create(**values)

    assert first.input_hash == second.input_hash
    assert first.receipt_hash == second.receipt_hash


def test_receipt_detaches_source_collections_before_hashing():
    day = PlanDay(
        date=date(2026, 7, 20),
        session_type="high_intensity",
        objective="jump_strength",
        exercises=(),
        estimated_minutes=60,
    )
    constraint = TrainingConstraint.from_mapping(
        kind="time_limit",
        source="user",
        values={"minutes": 60},
    )
    validation = PlanValidation(
        rule="weekly_volume_cap",
        passed=True,
        severity="info",
        detail="Within policy",
    )
    days = [day]
    constraints = [constraint]
    validations = [validation]

    receipt = WeeklyPlanReceipt.create(
        parent_plan_id=None,
        constitution_version="1",
        planner_version="adaptive-v1",
        cycle_id="2026-W30",
        days=days,
        constraints=constraints,
        validations=validations,
        replay_inputs=TrainingPlanReplayInputs(
            constitution={
                "version": "1",
                "adaptive_planner": {"version": "adaptive-v1"},
            },
            snapshot=_replay_inputs().snapshot,
            constraints=(constraint,),
        ),
        created_at="2026-07-20T06:00:00Z",
        status="proposed",
    )
    original = (
        tuple(receipt.days),
        tuple(receipt.constraints),
        tuple(receipt.validations),
        receipt.input_hash,
        receipt.receipt_hash,
    )

    days.append(day)
    constraints.append(constraint)
    validations.append(validation)

    assert (
        tuple(receipt.days),
        tuple(receipt.constraints),
        tuple(receipt.validations),
        receipt.input_hash,
        receipt.receipt_hash,
    ) == original


def test_training_constraint_freezes_source_mapping_and_nested_list():
    source = {"equipment": ["barbell"]}
    constraint = TrainingConstraint.from_mapping(
        kind="equipment_available",
        source="user",
        values=source,
    )

    source["equipment"].append("rack")
    source["new_key"] = True

    assert constraint.values == (("equipment", ("barbell",)),)


@pytest.mark.parametrize(
    ("kind", "source"),
    (("invent_workout", "user"), ("skip_session", "untrusted")),
)
def test_training_constraint_rejects_unknown_typed_values(kind, source):
    with pytest.raises(ValueError, match="constraint"):
        TrainingConstraint.from_mapping(kind, source, {"date": "2026-07-20"})


def test_plan_day_freezes_source_exercise_mappings_and_nested_lists():
    exercises = [{"name": "back_squat", "sets": [3, 3, 3]}]
    day = PlanDay(
        date=date(2026, 7, 20),
        session_type="high_intensity",
        objective="jump_strength",
        exercises=exercises,
        estimated_minutes=60,
    )

    exercises[0]["sets"].append(2)
    exercises[0]["name"] = "split_squat"
    exercises.append({"name": "leg_press", "sets": [3]})

    assert len(day.exercises) == 1
    assert day.exercises[0]["name"] == "back_squat"
    assert day.exercises[0]["sets"] == (3, 3, 3)

    with pytest.raises(TypeError):
        day.exercises[0]["name"] = "split_squat"
    with pytest.raises(AttributeError):
        day.exercises[0]["sets"].append(2)


def _replay_inputs(readiness=None):
    return TrainingPlanReplayInputs(
        constitution={
            "version": "1",
            "adaptive_planner": {"version": "adaptive-v1"},
        },
        snapshot=PlannerInputSnapshot(
            week_start=date(2026, 7, 20),
            created_at="2026-07-20T06:00:00Z",
            completed_sessions=(),
            readiness=readiness,
            calendar_events=(),
            progression={},
            equipment=("barbell", "bench"),
            preferences=(),
        ),
        constraints=(),
    )
