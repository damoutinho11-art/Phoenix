import json
from datetime import date
from pathlib import Path

import pytest

from jarvis.domains.training.performance_hybrid import HYBRID_SEQUENCE, build_hybrid_week
from jarvis.domains.training.plan_contracts import PlannerInputSnapshot


@pytest.fixture
def training_constitution_v2():
    path = Path(__file__).parent.parent / "constitution.json"
    return json.loads(path.read_text(encoding="utf-8"))


def snapshot(*, sequence_cursor=1, calendar_events=()):
    return PlannerInputSnapshot(
        week_start=date(2026, 7, 20),
        created_at="2026-07-20T06:00:00Z",
        completed_sessions=(),
        readiness=None,
        calendar_events=calendar_events,
        progression={},
        equipment=(),
        preferences=(),
        sequence_cursor=sequence_cursor,
    )


def test_builds_six_ordered_intents_plus_one_recovery(training_constitution_v2):
    days = build_hybrid_week(training_constitution_v2, snapshot(sequence_cursor=1))

    intents = [day.session_intent for day in days if day.session_intent]
    assert intents == list(HYBRID_SEQUENCE)
    assert sum(day.session_type == "recovery" for day in days) == 1


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


def test_hard_calendar_event_receives_the_recovery_slot(training_constitution_v2):
    days = build_hybrid_week(
        training_constitution_v2,
        snapshot(calendar_events=({"date": "2026-07-20", "severity": "hard"},)),
    )

    recovery = next(day for day in days if day.session_type == "recovery")
    assert recovery.date == date(2026, 7, 20)
