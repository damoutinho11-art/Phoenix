from datetime import date

import pytest

from jarvis.domains.training.plan_evidence import (
    build_planning_snapshot,
    pain_blocked_areas,
)
from jarvis.domains.training.performance_hybrid import HYBRID_SEQUENCE


def logged_bench_session(*, reps, target, weight, rpe=8):
    return {
        "date": "2026-07-19",
        "session_type": "general",
        "completion_evidence": {
            "duration_seconds": 3600,
            "rpe": rpe,
            "pain_confirmed": False,
            "pain_body_areas": [],
        },
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


def active_hybrid_plan(*, cursor=1, consumed_sessions=()):
    sequence_length = len(HYBRID_SEQUENCE)
    positions = tuple(range(cursor, sequence_length + 1)) + tuple(range(1, cursor))
    return {
        "plan_id": "active-plan",
        "receipt_hash": "active-receipt",
        "constitution_version": "2",
        "planner_version": "adaptive-v2",
        "days": [
            {
                "date": date(2026, 7, 20 + offset).isoformat(),
                "session_intent": HYBRID_SEQUENCE[position - 1],
                "sequence_position": position,
                "sequence_length": sequence_length,
            }
            for offset, position in enumerate(positions)
        ],
        "replay_inputs": {
            "snapshot": {
                "sequence_cursor": cursor,
                "completed_sessions": list(consumed_sessions),
            }
        },
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
    sequence_length = len(HYBRID_SEQUENCE)
    return {
        "date": planned_date,
        "session_type": "general",
        "session_intent": intent,
        "sequence_position": position,
        "sequence_length": sequence_length,
        "plan_provenance": {
            "plan_id": plan_id,
            "receipt_hash": "active-receipt",
            "date": planned_date,
        },
        "completion_evidence": {
            "duration_seconds": 3600,
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


def test_legacy_progression_increases_without_rpe():
    session = logged_bench_session(reps=5, target=5, weight=60)
    del session["completion_evidence"]

    snapshot = build_planning_snapshot(
        week_start=date(2026, 7, 20),
        created_at="2026-07-20T06:00:00Z",
        sessions=[session],
        readiness=None,
        calendar_events=[],
        equipment=["barbell", "bench"],
        preferences={},
    )

    assert snapshot.progression["Bench Press"] == {
        "suggested_kg": 62.5,
        "basis": "All sets hit target reps; add 2.5kg.",
        "deload": False,
    }


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


def test_reproposal_before_completion_preserves_active_start_cursor():
    snapshot = build_planning_snapshot(
        week_start=date(2026, 7, 27),
        created_at="2026-07-27T06:00:00Z",
        sessions=[],
        readiness=None,
        calendar_events=[],
        equipment=[],
        preferences={},
        active_plan=active_hybrid_plan(cursor=4),
    )

    assert snapshot.sequence_cursor == 4
    assert snapshot.sequence_source_plan_id == "active-plan"


def test_reproposal_recovers_start_cursor_from_first_hybrid_day():
    active_plan = active_hybrid_plan(cursor=4)
    del active_plan["replay_inputs"]["snapshot"]["sequence_cursor"]

    snapshot = build_planning_snapshot(
        week_start=date(2026, 7, 27),
        created_at="2026-07-27T06:00:00Z",
        sessions=[],
        readiness=None,
        calendar_events=[],
        equipment=[],
        preferences={},
        active_plan=active_plan,
    )

    assert snapshot.sequence_cursor == 4
    assert snapshot.sequence_source_plan_id == "active-plan"


def test_completion_at_last_position_wraps_to_first_position():
    sequence_length = len(HYBRID_SEQUENCE)
    session = completed_hybrid_session(
        planned_date="2026-07-20",
        intent=HYBRID_SEQUENCE[-1],
        position=sequence_length,
    )
    snapshot = build_planning_snapshot(
        week_start=date(2026, 7, 27),
        created_at="2026-07-27T06:00:00Z",
        sessions=[session],
        readiness=None,
        calendar_events=[],
        equipment=[],
        preferences={},
        active_plan=active_hybrid_plan(cursor=sequence_length),
    )

    assert snapshot.sequence_cursor == 1
    assert snapshot.sequence_source_plan_id == "active-plan"


def test_consumed_or_malformed_completion_preserves_active_cursor():
    consumed = completed_hybrid_session(
        planned_date="2026-07-20",
        intent=HYBRID_SEQUENCE[2],
        position=3,
    )
    metadata_only = {
        key: value
        for key, value in completed_hybrid_session(
            planned_date="2026-07-21",
            intent=HYBRID_SEQUENCE[3],
            position=4,
        ).items()
        if key != "completion_evidence"
    }
    mismatched = completed_hybrid_session(
        plan_id="other-plan",
        planned_date="2026-07-21",
        intent=HYBRID_SEQUENCE[3],
        position=4,
    )
    mismatched_date = completed_hybrid_session(
        planned_date="2026-07-21",
        intent=HYBRID_SEQUENCE[3],
        position=4,
    )
    mismatched_date["date"] = "2026-07-22"

    snapshot = build_planning_snapshot(
        week_start=date(2026, 7, 27),
        created_at="2026-07-27T06:00:00Z",
        sessions=[consumed, metadata_only, mismatched, mismatched_date],
        readiness=None,
        calendar_events=[],
        equipment=[],
        preferences={},
        active_plan=active_hybrid_plan(cursor=3, consumed_sessions=(consumed,)),
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


def test_progression_requires_positive_target_reps():
    session = completed_hybrid_session()
    del session["exercises"][0]["target_reps"]
    del session["exercises"][0]["sets"][0]["target_reps"]

    snapshot = build_planning_snapshot(
        week_start=date(2026, 7, 27),
        created_at="2026-07-27T06:00:00Z",
        sessions=[session],
        readiness=None,
        calendar_events=[],
        equipment=[],
        preferences={},
    )

    suggestion = snapshot.progression["Bench Press"]
    assert suggestion["suggested_kg"] == 60
    assert suggestion["action"] == "hold_or_reduce"
    assert suggestion["reason"] == "invalid_evidence"


@pytest.mark.parametrize("rpe", (-1, 11, float("nan"), float("inf"), True))
def test_progression_rejects_invalid_rpe(rpe):
    snapshot = build_planning_snapshot(
        week_start=date(2026, 7, 27),
        created_at="2026-07-27T06:00:00Z",
        sessions=[completed_hybrid_session(rpe=rpe)],
        readiness=None,
        calendar_events=[],
        equipment=[],
        preferences={},
    )

    suggestion = snapshot.progression["Bench Press"]
    assert suggestion["suggested_kg"] == 60
    assert suggestion["action"] == "hold_or_reduce"
    assert suggestion["reason"] == "invalid_evidence"


def test_hybrid_progression_rejects_missing_rpe():
    session = completed_hybrid_session()
    del session["completion_evidence"]["rpe"]

    snapshot = build_planning_snapshot(
        week_start=date(2026, 7, 27),
        created_at="2026-07-27T06:00:00Z",
        sessions=[session],
        readiness=None,
        calendar_events=[],
        equipment=[],
        preferences={},
    )

    suggestion = snapshot.progression["Bench Press"]
    assert suggestion["suggested_kg"] == 60
    assert suggestion["reason"] == "invalid_evidence"


@pytest.mark.parametrize(
    "claim",
    (
        {"plan_provenance": {"plan_id": "partial-plan"}},
        {"session_intent": "pull_strength"},
        {"sequence_position": 2},
    ),
)
def test_partial_plan_or_hybrid_claim_fails_closed(claim):
    session = logged_bench_session(reps=5, target=5, weight=60)
    del session["completion_evidence"]
    session.update(claim)

    snapshot = build_planning_snapshot(
        week_start=date(2026, 7, 27),
        created_at="2026-07-27T06:00:00Z",
        sessions=[session],
        readiness=None,
        calendar_events=[],
        equipment=[],
        preferences={},
    )

    suggestion = snapshot.progression["Bench Press"]
    assert suggestion["suggested_kg"] == 60
    assert suggestion["reason"] == "invalid_evidence"


@pytest.mark.parametrize("actual_reps", (-1, float("nan"), float("inf"), True))
def test_progression_rejects_invalid_actual_reps(actual_reps):
    session = completed_hybrid_session()
    session["exercises"][0]["sets"][0]["reps"] = actual_reps

    snapshot = build_planning_snapshot(
        week_start=date(2026, 7, 27),
        created_at="2026-07-27T06:00:00Z",
        sessions=[session],
        readiness=None,
        calendar_events=[],
        equipment=[],
        preferences={},
    )

    suggestion = snapshot.progression["Bench Press"]
    assert suggestion["suggested_kg"] == 60
    assert suggestion["reason"] == "invalid_evidence"


def test_progression_increases_from_complete_finite_actual_results():
    snapshot = build_planning_snapshot(
        week_start=date(2026, 7, 27),
        created_at="2026-07-27T06:00:00Z",
        sessions=[completed_hybrid_session(rpe=8)],
        readiness=None,
        calendar_events=[],
        equipment=[],
        preferences={},
    )

    suggestion = snapshot.progression["Bench Press"]
    assert suggestion["suggested_kg"] == 62.5
    assert suggestion["action"] == "increase"
    assert suggestion["load_delta_kg"] == 2.5
