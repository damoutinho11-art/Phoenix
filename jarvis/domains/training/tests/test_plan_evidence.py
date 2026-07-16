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
