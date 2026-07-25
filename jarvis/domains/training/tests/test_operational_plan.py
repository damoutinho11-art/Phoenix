from datetime import date

import pytest

from jarvis.domains.training.operational_plan import project_plan_day


@pytest.fixture
def active_receipt():
    return {
        "plan_id": "plan-2026-W30",
        "receipt_hash": "receipt-2026-W30",
        "days": [
            {
                "date": "2026-07-20",
                "session_type": "high_intensity",
                "objective": "jump_strength",
                "exercises": [
                    {"name": "hang_power_clean", "sets": 5, "reps": 3},
                    {"name": "back_squat", "sets": 4, "reps": 5},
                ],
                "estimated_minutes": 55,
                "change_reason": None,
            },
            {
                "date": "2026-07-21",
                "session_type": "rest",
                "objective": "recovery",
                "exercises": [],
                "estimated_minutes": 0,
                "change_reason": "unavailable",
            },
        ],
    }


def test_projects_today_from_active_receipt(active_receipt):
    result = project_plan_day(active_receipt, date(2026, 7, 20))

    assert result["operational_state"] == "active_plan"
    assert result["plan_provenance"] == {
        "plan_id": "plan-2026-W30",
        "receipt_hash": "receipt-2026-W30",
        "date": "2026-07-20",
    }
    assert result["session"] == {
        "date": "2026-07-20",
        "session_type": "high_intensity",
        "display_name": "Jump Strength",
        "objective": "jump_strength",
        "exercises": [
            {"name": "hang_power_clean", "sets": 5, "reps": 3},
            {"name": "back_squat", "sets": 4, "reps": 5},
        ],
        "estimated_minutes": 55,
        "change_reason": None,
        "is_rest": False,
    }


def test_projects_rest_day_without_making_it_runnable(active_receipt):
    result = project_plan_day(active_receipt, date(2026, 7, 21))

    assert result["operational_state"] == "active_plan"
    assert result["session"]["is_rest"] is True
    assert result["session"]["exercises"] == []


def test_missing_active_receipt_requires_plan():
    assert project_plan_day(None, date(2026, 7, 20)) == {
        "operational_state": "plan_required",
        "plan_provenance": None,
        "session": None,
    }


def test_active_receipt_without_target_day_fails_closed(active_receipt):
    result = project_plan_day(active_receipt, date(2026, 8, 1))

    assert result == {
        "operational_state": "plan_required",
        "plan_provenance": None,
        "session": None,
    }


@pytest.mark.parametrize(
    "receipt",
    [
        {"plan_id": "p", "receipt_hash": "h", "days": "bad"},
        {"plan_id": "p", "receipt_hash": "h", "days": [{}]},
        {"plan_id": "", "receipt_hash": "h", "days": []},
    ],
)
def test_malformed_receipt_fails_closed(receipt):
    assert project_plan_day(receipt, date(2026, 7, 20))["operational_state"] == "plan_required"
