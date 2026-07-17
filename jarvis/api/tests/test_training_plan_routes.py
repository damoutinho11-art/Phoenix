"""Lifecycle and validation tests for the adaptive Training plan API."""

from __future__ import annotations

from datetime import date, timedelta
from pathlib import Path

import pytest
from fastapi.testclient import TestClient

from jarvis.api.main import app
from jarvis.core import clock
from jarvis.data import database


TODAY = date(2026, 7, 20)
CYCLE_ID = "2026-W30"


def _day(day: date, session_type: str = "general") -> dict:
    return {
        "date": day.isoformat(),
        "session_type": session_type,
        "objective": "general_strength" if session_type != "rest" else "recovery",
        "exercises": [{"name": "bench_press"}] if session_type != "rest" else [],
        "estimated_minutes": 60 if session_type != "rest" else 0,
        "change_reason": None,
    }


def _receipt(
    plan_id: str,
    *,
    status: str = "proposed",
    parent_plan_id: str | None = None,
    hard_failure: bool = False,
    constraints: list[dict] | None = None,
) -> dict:
    return {
        "plan_id": plan_id,
        "parent_plan_id": parent_plan_id,
        "constitution_version": "1",
        "planner_version": "adaptive-v1",
        "cycle_id": CYCLE_ID,
        "days": [
            _day(TODAY + timedelta(days=offset), "rest" if offset in {2, 4, 6} else "general")
            for offset in range(7)
        ],
        "constraints": constraints or [],
        "validations": [
            {
                "rule": "pain_block" if hard_failure else "seven_unique_days",
                "passed": not hard_failure,
                "severity": "hard",
                "detail": "Hard safety block remains" if hard_failure else "Plan contains seven unique dates",
            }
        ],
        "created_at": "2026-07-20T06:00:00+00:00",
        "status": status,
        "input_hash": f"input-{plan_id}",
        "receipt_hash": f"receipt-{plan_id}",
    }


@pytest.fixture(autouse=True)
def isolated_training_database(tmp_path: Path, monkeypatch: pytest.MonkeyPatch):
    monkeypatch.setattr(database, "DB_PATH", tmp_path / "training-plan-routes.db")
    monkeypatch.setattr(clock, "today", lambda: TODAY)
    monkeypatch.setattr(clock, "utc_now_iso", lambda: "2026-07-20T06:00:00+00:00")
    database.init_db()


@pytest.fixture
def client() -> TestClient:
    return TestClient(app)


@pytest.fixture
def seeded_active_plan() -> str:
    database.save_training_plan_receipt(_receipt("active-plan", status="active"))
    return "active-plan"


@pytest.fixture
def seeded_proposal(seeded_active_plan: str) -> str:
    database.save_training_plan_receipt(
        _receipt("proposal-plan", parent_plan_id=seeded_active_plan)
    )
    return "proposal-plan"


@pytest.fixture
def pain_blocked_proposal(seeded_active_plan: str) -> str:
    database.save_training_plan_receipt(
        _receipt(
            "pain-blocked-plan",
            parent_plan_id=seeded_active_plan,
            hard_failure=True,
        )
    )
    return "pain-blocked-plan"


def test_current_plan_returns_404_when_cycle_has_no_active_plan(client: TestClient):
    response = client.get("/training/plan/current")

    assert response.status_code == 404
    assert response.json()["detail"] == "No active training plan for the current horizon"


def test_move_proposal_returns_before_after_without_activation(
    client: TestClient, seeded_active_plan: str
):
    response = client.post(
        "/training/plan/proposals",
        json={
            "constraints": [
                {
                    "kind": "move_session",
                    "source": "user",
                    "values": {
                        "source_date": "2026-07-20",
                        "target_date": "2026-07-21",
                    },
                }
            ]
        },
    )

    assert response.status_code == 200
    body = response.json()
    assert body["status"] == "proposed"
    assert body["parent_plan_id"] == seeded_active_plan
    assert body["before"]["plan_id"] == seeded_active_plan
    assert body["after"]["plan_id"] == body["plan_id"]
    assert body["diff"]["changed_days"]
    assert body["interpreted_constraints"] == body["constraints"]
    assert client.get("/training/plan/current").json()["plan_id"] == seeded_active_plan


def test_proposal_detail_returns_persisted_preview(client: TestClient, seeded_active_plan: str):
    proposed = client.post(
        "/training/plan/proposals",
        json={
            "constraints": [
                {
                    "kind": "skip_session",
                    "values": {"date": "2026-07-21"},
                }
            ]
        },
    ).json()

    detail = client.get(f"/training/plan/proposals/{proposed['plan_id']}")

    assert detail.status_code == 200
    assert detail.json()["receipt_hash"] == proposed["receipt_hash"]
    assert detail.json()["before"]["plan_id"] == seeded_active_plan
    assert detail.json()["diff"] == proposed["diff"]


def test_proposal_detail_returns_404_for_unknown_id(client: TestClient):
    response = client.get("/training/plan/proposals/missing")

    assert response.status_code == 404
    assert response.json()["detail"] == "Training plan proposal not found"


@pytest.mark.parametrize(
    "constraint",
    [
        {
            "kind": "move_session",
            "values": {"source_date": "2026-07-19", "target_date": "2026-07-20"},
        },
        {"kind": "skip_session", "values": {"date": "2026-07-27"}},
        {"kind": "time_limit", "values": {"date": "2026-07-20", "minutes": 14}},
        {"kind": "time_limit", "values": {"date": "2026-07-20", "minutes": 181}},
        {"kind": "replace_exercise", "values": {"date": "2026-07-20", "from": "back_squat"}},
        {"kind": "equipment_available", "values": {"equipment": []}},
        {"kind": "equipment_available", "values": {"equipment": ["barbell", " "]}},
    ],
)
def test_constraint_boundaries_return_422(client: TestClient, constraint: dict):
    response = client.post("/training/plan/proposals", json={"constraints": [constraint]})

    assert response.status_code == 422


@pytest.mark.parametrize("minutes", [15, 180])
def test_time_limit_accepts_inclusive_boundaries(client: TestClient, minutes: int):
    response = client.post(
        "/training/plan/proposals",
        json={
            "constraints": [
                {
                    "kind": "time_limit",
                    "values": {"date": "2026-07-20", "minutes": minutes},
                }
            ]
        },
    )

    assert response.status_code == 200
    assert response.json()["constraints"][0]["values"]["minutes"] == minutes


def test_request_requires_constraints_or_intent(client: TestClient):
    assert client.post("/training/plan/proposals", json={}).status_code == 422
    assert client.post("/training/plan/proposals", json={"constraints": []}).status_code == 422


def test_supported_intent_compiles_to_constraint_but_never_applies(
    client: TestClient, seeded_active_plan: str
):
    response = client.post(
        "/training/plan/proposals",
        json={"intent": "Move today's training to tomorrow"},
    )

    assert response.status_code == 200
    body = response.json()
    assert body["status"] == "proposed"
    assert body["interpreted_constraints"] == [
        {
            "kind": "move_session",
            "source": "user",
            "values": {
                "source_date": "2026-07-20",
                "target_date": "2026-07-21",
            },
        }
    ]
    assert database.get_active_training_plan(CYCLE_ID)["plan_id"] == seeded_active_plan


def test_unsupported_intent_returns_422_without_creating_a_plan(client: TestClient):
    response = client.post(
        "/training/plan/proposals",
        json={"intent": "Make next week more athletic"},
    )

    assert response.status_code == 422
    assert response.json()["detail"] == (
        "Request could not be translated into a supported training constraint"
    )
    assert database.list_training_plan_receipts() == []


def test_apply_makes_proposal_authoritative_and_is_idempotent(
    client: TestClient, seeded_proposal: str
):
    first = client.post(f"/training/plan/proposals/{seeded_proposal}/apply")
    second = client.post(f"/training/plan/proposals/{seeded_proposal}/apply")

    assert first.status_code == second.status_code == 200
    assert first.json()["status"] == second.json()["status"] == "active"
    assert client.get("/training/plan/current").json()["plan_id"] == seeded_proposal


def test_hard_safety_block_disables_apply(
    client: TestClient, pain_blocked_proposal: str
):
    response = client.post(f"/training/plan/proposals/{pain_blocked_proposal}/apply")

    assert response.status_code == 409
    assert "hard safety" in response.json()["detail"].lower()
    assert database.get_training_plan_receipt(pain_blocked_proposal)["status"] == "proposed"


def test_reject_is_idempotent_and_preserves_active_parent(
    client: TestClient, seeded_active_plan: str, seeded_proposal: str
):
    first = client.post(f"/training/plan/proposals/{seeded_proposal}/reject")
    second = client.post(f"/training/plan/proposals/{seeded_proposal}/reject")

    assert first.status_code == second.status_code == 200
    assert first.json()["status"] == second.json()["status"] == "rejected"
    assert database.get_active_training_plan(CYCLE_ID)["plan_id"] == seeded_active_plan


def test_terminal_lifecycle_conflicts_return_409(client: TestClient, seeded_proposal: str):
    assert client.post(f"/training/plan/proposals/{seeded_proposal}/reject").status_code == 200

    assert client.post(f"/training/plan/proposals/{seeded_proposal}/apply").status_code == 409


def test_missing_lifecycle_target_returns_404(client: TestClient):
    assert client.post("/training/plan/proposals/missing/apply").status_code == 404
    assert client.post("/training/plan/proposals/missing/reject").status_code == 404


def test_history_and_rules_return_readable_detail(
    client: TestClient, seeded_active_plan: str
):
    database.save_training_plan_receipt(
        _receipt(
            "preference-plan",
            parent_plan_id=seeded_active_plan,
            constraints=[
                {
                    "kind": "exercise_preference",
                    "source": "user",
                    "values": {"exercise": "split_squat", "avoid_or_prefer": "prefer"},
                },
                {
                    "kind": "equipment_available",
                    "source": "user",
                    "values": {"equipment": ["barbell"]},
                },
            ],
        )
    )

    history = client.get("/training/plans/history")
    rules = client.get("/training/rules")

    assert history.status_code == rules.status_code == 200
    assert history.json()["items"][0]["days"]
    assert history.json()["items"][0]["validations"]
    assert history.json()["items"][0]["reason"] == "Plan proposed"
    assert rules.json()["objective"]
    assert rules.json()["planner"]["version"] == "adaptive-v1"
    assert rules.json()["recovery_spacing"]["high_neural_to_high_neural"] == 36
    assert rules.json()["movement_families"]["knee_extension"]
    assert rules.json()["preferences"] == []
    assert rules.json()["temporary_constraints"] == []
    serialized_rules = str(rules.json()).lower()
    assert "system_prompt" not in serialized_rules
    assert "secret" not in serialized_rules


def test_rules_exposes_constraints_from_active_plan(client: TestClient):
    database.save_training_plan_receipt(
        _receipt(
            "active-with-rules",
            status="active",
            constraints=[
                {
                    "kind": "exercise_preference",
                    "source": "user",
                    "values": {"exercise": "split_squat", "avoid_or_prefer": "prefer"},
                },
                {
                    "kind": "equipment_available",
                    "source": "user",
                    "values": {"equipment": ["barbell"]},
                },
            ],
        )
    )

    rules = client.get("/training/rules").json()

    assert [item["kind"] for item in rules["preferences"]] == ["exercise_preference"]
    assert [item["kind"] for item in rules["temporary_constraints"]] == [
        "equipment_available"
    ]


def test_apply_storage_failure_returns_503_without_changing_active_plan(
    client: TestClient,
    seeded_active_plan: str,
    seeded_proposal: str,
    monkeypatch: pytest.MonkeyPatch,
):
    def fail_apply(_: str):
        raise OSError("storage offline")

    monkeypatch.setattr(database, "apply_training_plan_proposal", fail_apply)

    response = client.post(f"/training/plan/proposals/{seeded_proposal}/apply")

    assert response.status_code == 503
    assert response.json()["detail"] == "Training plan storage unavailable"
    assert database.get_active_training_plan(CYCLE_ID)["plan_id"] == seeded_active_plan
