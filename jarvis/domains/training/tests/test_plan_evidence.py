from datetime import date

import pytest

from jarvis.domains.training.plan_evidence import (
    build_planning_snapshot,
    pain_blocked_areas,
)


def logged_bench_session(*, reps, target, weight):
    return {
        "date": "2026-07-19",
        "session_type": "general",
        "exercises": [
            {
                "name": "Bench Press",
                "target_reps": target,
                "sets": [
                    {
                        "reps": reps,
                        "target_reps": target,
                        "weight_kg": weight,
                    }
                ],
            }
        ],
    }


def active_hybrid_plan():
    return {
        "plan_id": "active-plan",
        "receipt_hash": "active-receipt",
        "planner_version": "adaptive-v2",
        "days": [
            {
                "date": "2026-07-20",
                "session_intent": "push_strength",
                "sequence_position": 1,
                "sequence_length": 6,
            },
            {
                "date": "2026-07-21",
                "session_intent": "pull_strength",
                "sequence_position": 2,
                "sequence_length": 6,
            },
        ],
    }


def completed_hybrid_session(
    *,
    plan_id="active-plan",
    planned_date="2026-07-21",
    intent="pull_strength",
    position=2,
    rpe=8,
    pain_confirmed=False,
):
    return {
        "date": planned_date,
        "session_type": "general",
        "session_intent": intent,
        "sequence_position": position,
        "sequence_length": 6,
        "plan_provenance": {
            "plan_id": plan_id,
            "receipt_hash": "active-receipt",
            "date": planned_date,
        },
        "completion_evidence": {
            "rpe": rpe,
            "pain_confirmed": pain_confirmed,
            "pain_body_areas": ["shoulder"] if pain_confirmed else [],
        },
        "exercises": [
            {
                "name": "Bench Press",
                "target_reps": 5,
                "sets": [
                    {
                        "reps": 5,
                        "target_reps": 5,
                        "weight_kg": 60,
                    }
                ],
            }
        ],
    }


def test_sharp_pain_creates_hard_loaded_work_block():
    snapshot = build_planning_snapshot(
        week_start=date(2026, 7, 20),
        created_at="2026-07-20T06:00:00Z",
        sessions=[],
        readiness={
            "knee": 4,
            "sharp_pain": True,
            "limping": False,
            "next_day_worsening": False,
        },
        calendar_events=[],
        equipment=["barbell", "rack"],
        preferences={},
    )

    assert snapshot.safety_blocks == ("knee",)


@pytest.mark.parametrize("flag", ("pain", "limping", "next_day_worsening"))
def test_hard_pain_signals_block_affected_areas(flag):
    readiness = {
        "ankle": 3,
        "pain": False,
        "sharp_pain": False,
        "limping": False,
        "next_day_worsening": False,
    }
    readiness[flag] = True

    assert pain_blocked_areas(readiness) == ("ankle",)


def test_progression_uses_existing_session_history():
    snapshot = build_planning_snapshot(
        week_start=date(2026, 7, 20),
        created_at="2026-07-20T06:00:00Z",
        sessions=[logged_bench_session(reps=5, target=5, weight=60)],
        readiness=None,
        calendar_events=[],
        equipment=["barbell", "bench"],
        preferences={},
    )

    assert snapshot.progression["Bench Press"]["suggested_kg"] == 62.5


def test_snapshot_normalizes_collections_deterministically():
    snapshot = build_planning_snapshot(
        week_start=date(2026, 7, 20),
        created_at="2026-07-20T06:00:00Z",
        sessions=[],
        readiness=None,
        calendar_events=[],
        equipment=["rack", "barbell", "rack"],
        preferences={"avoid": "power_clean", "time_limit": 45},
    )

    assert snapshot.equipment == ("barbell", "rack")
    assert snapshot.preferences == (("avoid", "power_clean"), ("time_limit", 45))


def test_snapshot_advances_cursor_only_from_authoritative_completion():
    snapshot = build_planning_snapshot(
        week_start=date(2026, 7, 27),
        created_at="2026-07-27T06:00:00Z",
        sessions=[
            completed_hybrid_session(),
            {
                **completed_hybrid_session(plan_id="other-plan", position=6),
                "id": "malformed",
            },
            completed_hybrid_session(intent="push_strength", position=2),
            completed_hybrid_session(planned_date="not-a-date", position=5),
        ],
        readiness=None,
        calendar_events=[],
        equipment=[],
        preferences={},
        active_plan=active_hybrid_plan(),
    )

    assert snapshot.sequence_cursor == 3
    assert snapshot.sequence_source_plan_id == "active-plan"


def test_actual_result_progression_holds_for_high_rpe_and_pain():
    high_rpe = build_planning_snapshot(
        week_start=date(2026, 7, 27),
        created_at="2026-07-27T06:00:00Z",
        sessions=[completed_hybrid_session(rpe=9)],
        readiness=None,
        calendar_events=[],
        equipment=[],
        preferences={},
        active_plan=active_hybrid_plan(),
    )
    painful = build_planning_snapshot(
        week_start=date(2026, 7, 27),
        created_at="2026-07-27T06:00:00Z",
        sessions=[completed_hybrid_session(pain_confirmed=True)],
        readiness=None,
        calendar_events=[],
        equipment=[],
        preferences={},
        active_plan=active_hybrid_plan(),
    )

    assert high_rpe.progression["Bench Press"]["action"] == "hold_or_reduce"
    assert high_rpe.progression["Bench Press"]["load_delta_kg"] == 0
    assert painful.progression["Bench Press"]["action"] == "hold"
    assert painful.progression["Bench Press"]["reason"] == "pain_evidence"
