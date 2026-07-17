"""Lifecycle and validation tests for the adaptive Training plan API."""

from __future__ import annotations

from datetime import date, timedelta
import json
from pathlib import Path

import pytest
from fastapi.testclient import TestClient

from jarvis.api.dependencies import get_training_constitution
from jarvis.api.main import app
from jarvis.api.routers import training as training_router
from jarvis.core import clock
from jarvis.data import database
from jarvis.domains.calendar.tests.fixtures import (
    LIVE_SNAPSHOT_RAW,
    make_event,
    make_snapshot_raw,
)


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
                "rule": rule,
                "passed": not (hard_failure and rule == "pain_block"),
                "severity": "hard",
                "detail": (
                    "Hard safety block remains"
                    if hard_failure and rule == "pain_block"
                    else f"{rule} passed"
                ),
            }
            for rule in (
                "seven_unique_days",
                "pain_block",
                "calendar_conflicts",
                "recovery_spacing",
            )
        ],
        "created_at": "2026-07-20T06:00:00+00:00",
        "status": status,
        "input_hash": f"input-{plan_id}",
        "receipt_hash": f"receipt-{plan_id}",
    }


def _proposal_identity(plan_id: str) -> dict:
    payload = database.get_training_plan_receipt(plan_id)["payload"]
    return {
        "plan_id": payload["plan_id"],
        "planner_version": payload["planner_version"],
        "constitution_version": payload["constitution_version"],
        "input_hash": payload["input_hash"],
        "receipt_hash": payload["receipt_hash"],
    }


def _enable_live_planner(
    monkeypatch: pytest.MonkeyPatch, *accepted_plan_ids: str
) -> None:
    monkeypatch.setenv("PHOENIX_TRAINING_PLANNER_MODE", "live")
    monkeypatch.setattr(
        training_router,
        "training_planner_acceptance_status",
        lambda: {
            "accepted": True,
            "reasons": [],
            "planner_version": "adaptive-v1",
            "constitution_version": "1",
            "evidence_id": "recomputed-test-evidence",
            "fixture_summary": {},
            "accepted_proposals": [
                _proposal_identity(plan_id) for plan_id in accepted_plan_ids
            ],
        },
    )


@pytest.fixture(autouse=True)
def isolated_training_database(tmp_path: Path, monkeypatch: pytest.MonkeyPatch):
    monkeypatch.setattr(database, "DB_PATH", tmp_path / "training-plan-routes.db")
    monkeypatch.setattr(clock, "today", lambda: TODAY)
    monkeypatch.setattr(clock, "utc_now_iso", lambda: "2026-07-20T06:00:00+00:00")
    monkeypatch.setenv("PHOENIX_PLAAN_SNAPSHOT_JSON", json.dumps(LIVE_SNAPSHOT_RAW))
    monkeypatch.delenv("PHOENIX_TRAINING_PLANNER_MODE", raising=False)
    monkeypatch.delenv("PHOENIX_TRAINING_PLANNER_ACCEPTANCE_JSON", raising=False)
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
    assert body["authoritative"] is False
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


def test_proposal_passes_latest_import_to_real_resolver_and_uses_its_performance_events(
    client: TestClient, monkeypatch: pytest.MonkeyPatch
):
    monkeypatch.delenv("PHOENIX_PLAAN_SNAPSHOT_JSON")
    database.save_calendar_snapshot_import(
        make_snapshot_raw([], as_of="2026-07-19T06:00:00"),
        label="older import",
    )
    latest_snapshot = make_snapshot_raw(
        [
            make_event(
                "performance-1",
                "performance",
                "Imported performance",
                "2026-07-21",
                "19:00",
                "22:00",
            )
        ],
        as_of="2026-07-20T05:00:00",
    )
    database.save_calendar_snapshot_import(latest_snapshot, label="latest import")
    real_resolver = training_router.plaan_live.resolve_snapshot_raw
    passed_imports: list[dict | None] = []

    def resolve_calendar_snapshot(
        default_raw: dict, imported_snapshot: dict | None = None
    ):
        passed_imports.append(imported_snapshot)
        return real_resolver(default_raw, imported_snapshot=imported_snapshot)

    monkeypatch.setattr(
        training_router.plaan_live,
        "resolve_snapshot_raw",
        resolve_calendar_snapshot,
    )

    response = client.post(
        "/training/plan/proposals",
        json={
            "constraints": [
                {
                    "kind": "time_limit",
                    "values": {"date": "2026-07-23", "minutes": 60},
                }
            ]
        },
    )

    assert response.status_code == 200
    assert passed_imports == [latest_snapshot]
    days_by_date = {day["date"]: day for day in response.json()["days"]}
    assert days_by_date["2026-07-20"]["session_type"] == "recovery"
    assert days_by_date["2026-07-20"]["change_reason"] == "calendar_hard_conflict"


@pytest.mark.parametrize("active_source", ["fixture_fallback", "fixture", "stale_cache"])
def test_proposal_fails_closed_for_non_current_calendar_source_status(
    client: TestClient,
    monkeypatch: pytest.MonkeyPatch,
    active_source: str,
):
    def resolve_calendar_snapshot(
        default_raw: dict, imported_snapshot: dict | None = None
    ):
        return {"events": []}, {"active_source": active_source}

    monkeypatch.setattr(
        training_router.plaan_live,
        "resolve_snapshot_raw",
        resolve_calendar_snapshot,
    )

    response = client.post(
        "/training/plan/proposals",
        json={
            "constraints": [
                {
                    "kind": "time_limit",
                    "values": {"date": "2026-07-23", "minutes": 60},
                }
            ]
        },
    )

    assert response.status_code == 503
    assert response.json()["detail"] == "Training plan calendar evidence unavailable"


@pytest.mark.parametrize(
    "active_source",
    ["env_json", "local_file", "manual_import", "read_only_url"],
)
def test_proposal_preserves_configured_current_calendar_sources(
    client: TestClient,
    monkeypatch: pytest.MonkeyPatch,
    active_source: str,
):
    def resolve_calendar_snapshot(
        default_raw: dict, imported_snapshot: dict | None = None
    ):
        return {"events": []}, {"active_source": active_source}

    monkeypatch.setattr(
        training_router.plaan_live,
        "resolve_snapshot_raw",
        resolve_calendar_snapshot,
    )

    response = client.post(
        "/training/plan/proposals",
        json={
            "constraints": [
                {
                    "kind": "time_limit",
                    "values": {"date": "2026-07-23", "minutes": 60},
                }
            ]
        },
    )

    assert response.status_code == 200


@pytest.mark.parametrize(
    "resolver_output",
    [
        pytest.param(None, id="not-a-tuple"),
        pytest.param(({"events": []},), id="short-tuple"),
        pytest.param(
            ({"events": []}, {"active_source": "env_json"}, None),
            id="long-tuple",
        ),
        pytest.param(
            [{"events": []}, {"active_source": "env_json"}],
            id="list-boundary",
        ),
        pytest.param(([], {"active_source": "env_json"}), id="snapshot-not-mapping"),
        pytest.param(({}, {"active_source": "env_json"}), id="events-missing"),
        pytest.param(
            ({"events": {}}, {"active_source": "env_json"}),
            id="events-not-list",
        ),
        pytest.param(({"events": []}, []), id="status-not-mapping"),
        pytest.param(({"events": []}, {}), id="active-source-missing"),
    ],
)
def test_proposal_rejects_malformed_calendar_resolver_boundary_with_calendar_503(
    client: TestClient,
    monkeypatch: pytest.MonkeyPatch,
    resolver_output: object,
):
    def resolve_calendar_snapshot(
        default_raw: dict, imported_snapshot: dict | None = None
    ):
        return resolver_output

    monkeypatch.setattr(
        training_router.plaan_live,
        "resolve_snapshot_raw",
        resolve_calendar_snapshot,
    )

    response = client.post(
        "/training/plan/proposals",
        json={
            "constraints": [
                {
                    "kind": "time_limit",
                    "values": {"date": "2026-07-23", "minutes": 60},
                }
            ]
        },
    )

    assert response.status_code == 503
    assert response.json()["detail"] == "Training plan calendar evidence unavailable"


@pytest.mark.parametrize(
    "malformed_event",
    [
        pytest.param("not-an-event-mapping", id="non-mapping-entry"),
        pytest.param({}, id="missing-date"),
        pytest.param({"date": "2026-02-30"}, id="invalid-iso-date"),
        pytest.param(
            {"date": "2026-07-21", "event_type": ["performance"]},
            id="event-type-not-string",
        ),
        pytest.param(
            {"date": "2026-07-21", "event_type": ""},
            id="event-type-empty",
        ),
        pytest.param(
            {"date": "2026-07-21", "severity": {"level": "hard"}},
            id="severity-not-string",
        ),
        pytest.param(
            {"date": "2026-07-21", "severity": ""},
            id="severity-empty",
        ),
        pytest.param(
            {"date": "2026-07-21", "severity": "blocker"},
            id="severity-unknown",
        ),
        pytest.param(
            {"date": "2026-07-21", "hard_conflict": []},
            id="hard-conflict-list",
        ),
        pytest.param(
            {"date": "2026-07-21", "hard_conflict": {}},
            id="hard-conflict-mapping",
        ),
        pytest.param(
            {"date": "2026-07-21", "hard_conflict": 0},
            id="hard-conflict-zero",
        ),
        pytest.param(
            {"date": "2026-07-21", "hard_conflict": 1},
            id="hard-conflict-one",
        ),
        pytest.param(
            {"date": "2026-07-21", "hard_conflict": "false"},
            id="hard-conflict-string-false",
        ),
        pytest.param(
            {"date": "2026-07-21", "hard_conflict": None},
            id="hard-conflict-null",
        ),
    ],
)
def test_proposal_fails_closed_for_malformed_calendar_event_entries(
    client: TestClient,
    monkeypatch: pytest.MonkeyPatch,
    malformed_event: object,
):
    def resolve_calendar_snapshot(
        default_raw: dict, imported_snapshot: dict | None = None
    ):
        return {"events": [malformed_event]}, {"active_source": "env_json"}

    monkeypatch.setattr(
        training_router.plaan_live,
        "resolve_snapshot_raw",
        resolve_calendar_snapshot,
    )

    response = client.post(
        "/training/plan/proposals",
        json={
            "constraints": [
                {
                    "kind": "time_limit",
                    "values": {"date": "2026-07-23", "minutes": 60},
                }
            ]
        },
    )

    assert response.status_code == 503
    assert response.json()["detail"] == "Training plan calendar evidence unavailable"


@pytest.mark.parametrize(
    "event",
    [
        pytest.param(
            {
                "date": "2026-07-21",
                "event_type": "performance",
                "source_metadata": {"assignment": "principal"},
            },
            id="performance-with-extra-fields",
        ),
        pytest.param(
            {
                "date": "2026-07-21",
                "event_type": "gala",
                "severity": "hard",
                "source_metadata": {"venue": "main-stage"},
            },
            id="custom-event-type-with-hard-severity",
        ),
    ],
)
def test_proposal_preserves_valid_calendar_event_fields_at_planning_boundary(
    client: TestClient,
    monkeypatch: pytest.MonkeyPatch,
    event: dict,
):
    captured_events: list[dict] = []
    real_build_snapshot = training_router.build_planning_snapshot

    def capture_planning_snapshot(**kwargs):
        captured_events.extend(kwargs["calendar_events"])
        return real_build_snapshot(**kwargs)

    def resolve_calendar_snapshot(
        default_raw: dict, imported_snapshot: dict | None = None
    ):
        return {"events": [event]}, {"active_source": "env_json"}

    monkeypatch.setattr(
        training_router,
        "build_planning_snapshot",
        capture_planning_snapshot,
    )
    monkeypatch.setattr(
        training_router.plaan_live,
        "resolve_snapshot_raw",
        resolve_calendar_snapshot,
    )

    response = client.post(
        "/training/plan/proposals",
        json={
            "constraints": [
                {
                    "kind": "time_limit",
                    "values": {"date": "2026-07-23", "minutes": 60},
                }
            ]
        },
    )

    assert response.status_code == 200
    assert captured_events == [event]


@pytest.mark.parametrize(
    ("event", "expected_event"),
    [
        pytest.param(
            {"date": "2026-07-21", "event_type": " Performance "},
            {"date": "2026-07-21", "event_type": "performance"},
            id="event-type-performance",
        ),
        pytest.param(
            {"date": "2026-07-21", "severity": " Hard "},
            {"date": "2026-07-21", "severity": "hard"},
            id="severity-hard",
        ),
    ],
)
def test_proposal_normalizes_known_calendar_routing_fields_before_planning(
    client: TestClient,
    monkeypatch: pytest.MonkeyPatch,
    event: dict,
    expected_event: dict,
):
    captured_events: list[dict] = []
    real_build_snapshot = training_router.build_planning_snapshot

    def capture_planning_snapshot(**kwargs):
        captured_events.extend(kwargs["calendar_events"])
        return real_build_snapshot(**kwargs)

    def resolve_calendar_snapshot(
        default_raw: dict, imported_snapshot: dict | None = None
    ):
        return {"events": [event]}, {"active_source": "env_json"}

    monkeypatch.setattr(
        training_router,
        "build_planning_snapshot",
        capture_planning_snapshot,
    )
    monkeypatch.setattr(
        training_router.plaan_live,
        "resolve_snapshot_raw",
        resolve_calendar_snapshot,
    )

    response = client.post(
        "/training/plan/proposals",
        json={
            "constraints": [
                {
                    "kind": "time_limit",
                    "values": {"date": "2026-07-23", "minutes": 60},
                }
            ]
        },
    )

    assert response.status_code == 200
    assert captured_events == [expected_event]


@pytest.mark.parametrize(
    ("hard_conflict", "is_hard"),
    [
        pytest.param(True, True, id="true"),
        pytest.param(False, False, id="false"),
    ],
)
def test_proposal_routes_only_boolean_true_hard_conflict_as_hard(
    client: TestClient,
    monkeypatch: pytest.MonkeyPatch,
    hard_conflict: bool,
    is_hard: bool,
):
    def resolve_calendar_snapshot(
        default_raw: dict, imported_snapshot: dict | None = None
    ):
        return (
            {
                "events": [
                    {
                        "date": "2026-07-20",
                        "event_type": "gala",
                        "hard_conflict": hard_conflict,
                    }
                ]
            },
            {"active_source": "env_json"},
        )

    monkeypatch.setattr(
        training_router.plaan_live,
        "resolve_snapshot_raw",
        resolve_calendar_snapshot,
    )

    response = client.post(
        "/training/plan/proposals",
        json={
            "constraints": [
                {
                    "kind": "time_limit",
                    "values": {"date": "2026-07-23", "minutes": 60},
                }
            ]
        },
    )

    assert response.status_code == 200
    day = next(item for item in response.json()["days"] if item["date"] == "2026-07-20")
    assert (day["change_reason"] == "calendar_hard_conflict") is is_hard


def test_proposal_returns_explicit_503_when_calendar_resolver_fails(
    client: TestClient, monkeypatch: pytest.MonkeyPatch
):
    def fail_to_resolve_calendar_snapshot(
        default_raw: dict, imported_snapshot: dict | None = None
    ):
        raise OSError("calendar evidence unavailable")

    monkeypatch.setattr(
        training_router.plaan_live,
        "resolve_snapshot_raw",
        fail_to_resolve_calendar_snapshot,
    )

    response = client.post(
        "/training/plan/proposals",
        json={
            "constraints": [
                {
                    "kind": "time_limit",
                    "values": {"date": "2026-07-23", "minutes": 60},
                }
            ]
        },
    )

    assert response.status_code == 503
    assert response.json()["detail"] == "Training plan calendar evidence unavailable"


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
    client: TestClient,
    seeded_proposal: str,
    monkeypatch: pytest.MonkeyPatch,
):
    _enable_live_planner(monkeypatch, seeded_proposal)

    first = client.post(f"/training/plan/proposals/{seeded_proposal}/apply")
    monkeypatch.setenv("PHOENIX_TRAINING_PLANNER_MODE", "shadow")
    second = client.post(f"/training/plan/proposals/{seeded_proposal}/apply")

    assert first.status_code == second.status_code == 200
    assert first.json()["status"] == second.json()["status"] == "active"
    assert client.get("/training/plan/current").json()["plan_id"] == seeded_proposal


def test_hard_safety_block_disables_apply(
    client: TestClient,
    pain_blocked_proposal: str,
    monkeypatch: pytest.MonkeyPatch,
):
    _enable_live_planner(monkeypatch, pain_blocked_proposal)

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


def test_live_apply_rejects_evidence_allowlisted_for_a_different_proposal(
    client: TestClient,
    seeded_active_plan: str,
    seeded_proposal: str,
    monkeypatch: pytest.MonkeyPatch,
):
    _enable_live_planner(monkeypatch, seeded_active_plan)

    response = client.post(f"/training/plan/proposals/{seeded_proposal}/apply")

    assert response.status_code == 503
    assert "does not cover this proposal" in response.json()["detail"]
    assert database.get_training_plan_receipt(seeded_proposal)["status"] == "proposed"


@pytest.mark.parametrize(
    "malformation",
    ("empty", "integer_false", "integer_true", "missing_detail"),
)
def test_live_apply_rejects_malformed_validation_rows(
    client: TestClient,
    seeded_active_plan: str,
    monkeypatch: pytest.MonkeyPatch,
    malformation: str,
):
    receipt = _receipt(
        f"malformed-{malformation}",
        parent_plan_id=seeded_active_plan,
    )
    if malformation == "empty":
        receipt["validations"] = []
    elif malformation.startswith("integer_"):
        receipt["validations"][0]["passed"] = (
            1 if malformation == "integer_true" else 0
        )
    else:
        receipt["validations"][0].pop("detail")
    database.save_training_plan_receipt(receipt)
    _enable_live_planner(monkeypatch, receipt["plan_id"])

    response = client.post(f"/training/plan/proposals/{receipt['plan_id']}/apply")

    assert response.status_code == 409
    assert "validation evidence is malformed" in response.json()["detail"].lower()
    assert database.get_training_plan_receipt(receipt["plan_id"])["status"] == "proposed"


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


def test_rules_whitelist_excludes_private_policy_fields(
    client: TestClient, monkeypatch: pytest.MonkeyPatch
):
    constitution = get_training_constitution()
    policy = {
        **constitution["adaptive_planner"],
        "system_prompt": "never expose this",
        "service_token": "token-value",
        "secret_instructions": "private",
    }
    constitution["adaptive_planner"] = policy
    monkeypatch.setitem(
        app.dependency_overrides,
        get_training_constitution,
        lambda: constitution,
    )

    response = client.get("/training/rules")

    assert response.status_code == 200
    rules = response.json()
    assert set(rules["planner"]) == {
        "version",
        "minimum_recovery_hours",
        "maximum_weekly_volume_increase_pct",
        "maximum_session_volume_reduction_pct",
        "pain_block_flags",
        "movement_families",
        "exercise_equipment",
    }
    assert rules["planner"]["version"] == "adaptive-v1"
    assert rules["recovery_spacing"] == policy["minimum_recovery_hours"]
    assert rules["adaptation_limits"] == {
        "maximum_weekly_volume_increase_pct": 10,
        "maximum_session_volume_reduction_pct": 40,
    }
    assert rules["movement_families"] == policy["movement_families"]
    serialized_rules = str(rules).lower()
    assert "system_prompt" not in serialized_rules
    assert "service_token" not in serialized_rules
    assert "secret_instructions" not in serialized_rules


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
    _enable_live_planner(monkeypatch, seeded_proposal)

    def fail_apply(_: str):
        raise OSError("storage offline")

    monkeypatch.setattr(database, "apply_training_plan_proposal", fail_apply)

    response = client.post(f"/training/plan/proposals/{seeded_proposal}/apply")

    assert response.status_code == 503
    assert response.json()["detail"] == "Training plan storage unavailable"
    assert database.get_active_training_plan(CYCLE_ID)["plan_id"] == seeded_active_plan


def test_shadow_mode_cannot_apply_or_supersede_proposal(
    client: TestClient,
    seeded_active_plan: str,
    seeded_proposal: str,
):
    response = client.post(f"/training/plan/proposals/{seeded_proposal}/apply")

    assert response.status_code == 409
    assert response.json()["detail"] == (
        "Training planner is in shadow mode; proposal cannot be applied"
    )
    assert database.get_active_training_plan(CYCLE_ID)["plan_id"] == seeded_active_plan
    assert database.get_training_plan_receipt(seeded_proposal)["status"] == "proposed"


def test_live_apply_returns_503_without_accepted_evidence(
    client: TestClient,
    seeded_active_plan: str,
    seeded_proposal: str,
    monkeypatch: pytest.MonkeyPatch,
):
    monkeypatch.setenv("PHOENIX_TRAINING_PLANNER_MODE", "live")

    response = client.post(f"/training/plan/proposals/{seeded_proposal}/apply")

    assert response.status_code == 503
    assert response.json()["detail"] == (
        "Training planner live acceptance evidence is unavailable"
    )
    assert database.get_active_training_plan(CYCLE_ID)["plan_id"] == seeded_active_plan
    assert database.get_training_plan_receipt(seeded_proposal)["status"] == "proposed"


def test_live_proposal_is_authoritative_only_when_exactly_allowlisted(
    client: TestClient,
    seeded_active_plan: str,
    monkeypatch: pytest.MonkeyPatch,
):
    monkeypatch.setenv("PHOENIX_TRAINING_PLANNER_MODE", "live")
    rejected = client.post(
        "/training/plan/proposals",
        json={
            "constraints": [
                {
                    "kind": "skip_session",
                    "values": {"date": TODAY.isoformat()},
                }
            ]
        },
    )

    proposal_id = rejected.json()["plan_id"]
    _enable_live_planner(monkeypatch, proposal_id)
    accepted = client.get(f"/training/plan/proposals/{proposal_id}")
    different = client.post(
        "/training/plan/proposals",
        json={
            "constraints": [
                {
                    "kind": "skip_session",
                    "values": {"date": (TODAY + timedelta(days=1)).isoformat()},
                }
            ]
        },
    )

    assert rejected.status_code == accepted.status_code == different.status_code == 200
    assert rejected.json()["authoritative"] is False
    assert accepted.json()["authoritative"] is True
    assert different.json()["authoritative"] is False
    assert database.get_active_training_plan(CYCLE_ID)["plan_id"] == seeded_active_plan


def test_propose_and_live_apply_have_no_session_or_calendar_write_side_effects(
    client: TestClient,
    seeded_active_plan: str,
    monkeypatch: pytest.MonkeyPatch,
):
    session_writes = []
    calendar_writes = []
    monkeypatch.setattr(
        database,
        "log_session",
        lambda *args, **kwargs: session_writes.append((args, kwargs)),
    )
    monkeypatch.setattr(
        database,
        "save_calendar_snapshot_import",
        lambda *args, **kwargs: calendar_writes.append((args, kwargs)),
    )

    proposed = client.post(
        "/training/plan/proposals",
        json={
            "constraints": [
                {
                    "kind": "skip_session",
                    "values": {"date": TODAY.isoformat()},
                }
            ]
        },
    )
    _enable_live_planner(monkeypatch, proposed.json()["plan_id"])
    applied = client.post(
        f"/training/plan/proposals/{proposed.json()['plan_id']}/apply"
    )

    assert proposed.status_code == applied.status_code == 200
    assert database.get_active_training_plan(CYCLE_ID)["plan_id"] == proposed.json()[
        "plan_id"
    ]
    assert session_writes == []
    assert calendar_writes == []
    assert database.get_sessions() == []
