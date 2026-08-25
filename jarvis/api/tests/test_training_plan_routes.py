"""Lifecycle and validation tests for the adaptive Training plan API."""

from __future__ import annotations

from copy import deepcopy
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
from jarvis.domains.calendar import google_calendar_client, google_oauth
from jarvis.domains.calendar.tests.fixtures import (
    LIVE_SNAPSHOT_RAW,
    make_event,
    make_snapshot_raw,
)
from jarvis.domains.training.adaptive_planner import (
    PlanningSnapshot,
    generate_weekly_plan,
)
from jarvis.domains.training.performance_hybrid import HYBRID_SEQUENCE


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


def _enable_live_certificate(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setenv("PHOENIX_TRAINING_PLANNER_MODE", "live")
    monkeypatch.setattr(
        training_router,
        "training_planner_acceptance_status",
        lambda: {
            "accepted": True,
            "reasons": [],
            "planner_version": "adaptive-v2",
            "constitution_version": "2",
            "evidence_id": "recomputed-test-evidence",
            "fixture_summary": {},
        },
    )


def _enable_live_planner(
    monkeypatch: pytest.MonkeyPatch, *_synthetic_plan_ids: str
) -> None:
    _enable_live_certificate(monkeypatch)
    monkeypatch.setattr(
        training_router,
        "validate_runtime_proposal",
        lambda *_args, **_kwargs: (True, ()),
        raising=False,
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


def test_plan_authority_reports_closed_gate_without_exposing_evidence(client: TestClient):
    response = client.get("/training/plan/authority")

    assert response.status_code == 200
    assert response.json()["mode"] == "shadow"
    assert response.json()["accepted"] is False
    assert response.json()["reasons"] == ["acceptance_evidence_missing"]
    assert "receipt_bundle" not in response.json()


def test_first_midweek_proposal_starts_fresh_on_current_date(
    client: TestClient,
    monkeypatch: pytest.MonkeyPatch,
):
    current = date(2026, 7, 22)
    monkeypatch.setattr(clock, "today", lambda: current)
    monkeypatch.setattr(clock, "utc_now_iso", lambda: "2026-07-22T06:00:00+00:00")

    response = client.post("/training/plan/proposals", json={"constraints": []})

    assert response.status_code == 200
    days = response.json()["days"]
    assert all(
        day["session_type"] == "recovery"
        and day["session_intent"] is None
        and day["sequence_position"] is None
        and day["change_reason"] == "elapsed_before_plan"
        for day in days[:2]
    )
    assert days[2]["date"] == current.isoformat()
    assert days[2]["session_intent"] == "push_strength"
    assert days[2]["sequence_position"] == 1
    assert all(
        row["passed"] is True
        for row in response.json()["validations"]
        if row["severity"] == "hard"
    )


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


def test_proposal_advances_from_active_hybrid_completion(
    client: TestClient,
    monkeypatch: pytest.MonkeyPatch,
):
    constitution = get_training_constitution()
    equipment = tuple(
        sorted(
            {
                item
                for requirements in constitution["adaptive_planner"][
                    "exercise_equipment"
                ].values()
                for item in requirements
            }
        )
    )
    active = generate_weekly_plan(
        constitution,
        PlanningSnapshot(
            week_start=TODAY,
            created_at="2026-07-20T06:00:00+00:00",
            completed_sessions=(),
            readiness=None,
            calendar_events=(),
            progression={},
            equipment=equipment,
            preferences=(),
        ),
    )
    active_mapping = active.to_mapping()
    active_mapping["status"] = "active"
    database.save_training_plan_receipt(active_mapping)
    completed_day = next(day for day in active.days if day.sequence_position == 1)
    completed_exercise = completed_day.exercises[0]
    completion = {
        "date": completed_day.date.isoformat(),
        "session_type": completed_day.session_type,
        "session_intent": completed_day.session_intent,
        "sequence_position": completed_day.sequence_position,
        "sequence_length": len(HYBRID_SEQUENCE),
        "plan_provenance": {
            "plan_id": active.plan_id,
            "receipt_hash": active.receipt_hash,
            "date": completed_day.date.isoformat(),
        },
        "completion_evidence": {
            "duration_seconds": completed_day.estimated_minutes * 60,
            "rpe": 8,
            "pain_confirmed": False,
            "pain_body_areas": [],
        },
        "exercises": [
            {
                "name": completed_exercise["name"],
                "target_reps": completed_exercise["reps"],
                "sets": [
                    {
                        "reps": completed_exercise["reps"],
                        "target_reps": completed_exercise["reps"],
                        "weight_kg": 60,
                    }
                    for _ in range(completed_exercise["sets"])
                ],
            }
        ],
    }
    monkeypatch.setattr(database, "get_sessions", lambda limit=None: [completion])

    response = client.post(
        "/training/plan/proposals",
        json={
            "constraints": [
                {
                    "kind": "time_limit",
                    "values": {"date": TODAY.isoformat(), "minutes": 60},
                }
            ]
        },
    )

    assert response.status_code == 200
    stored = database.get_training_plan_receipt(response.json()["plan_id"])["payload"]
    assert stored["replay_inputs"]["snapshot"]["sequence_cursor"] == 2
    assert (
        stored["replay_inputs"]["snapshot"]["sequence_source_plan_id"]
        == active.plan_id
    )
    first_training_day = next(day for day in stored["days"] if day["session_intent"])
    assert first_training_day["sequence_position"] == 2
    assert first_training_day["session_intent"] == HYBRID_SEQUENCE[1]


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


def test_v2_autonomous_proposal_does_not_require_user_constraints(client: TestClient):
    response = client.post("/training/plan/proposals", json={"constraints": []})

    assert response.status_code == 200
    assert response.json()["planner_version"] == "adaptive-v2"
    assert response.json()["constraints"] == []


def test_autonomous_snapshot_does_not_invent_equipment_availability(
    client: TestClient,
):
    response = client.post("/training/plan/proposals", json={"constraints": []})

    assert response.status_code == 200
    stored = database.get_training_plan_receipt(response.json()["plan_id"])
    assert stored["payload"]["replay_inputs"]["snapshot"]["equipment"] == []


def test_v2_public_plan_days_expose_exact_authoritative_sequence_evidence(
    client: TestClient,
):
    response = client.post("/training/plan/proposals", json={"constraints": []})

    assert response.status_code == 200
    public = response.json()
    stored = database.get_training_plan_receipt(public["plan_id"])
    assert stored is not None
    authoritative_days = {
        day["date"]: day for day in stored["payload"]["days"]
    }
    for day in public["days"]:
        authoritative = authoritative_days[day["date"]]
        assert day["session_intent"] == authoritative["session_intent"]
        assert day["sequence_position"] == authoritative["sequence_position"]
        assert day["sequence_length"] == authoritative["sequence_length"]
        assert day["decision_reasons"] == authoritative["decision_reasons"]
        assert day["high_neural"] is authoritative["high_neural"]


@pytest.mark.parametrize(
    "malformation",
    (
        ("high_neural", "false"),
        ("high_neural", 0),
        ("high_neural", 1),
        ("high_neural", None),
        ("decision_reasons", None),
        ("session_intent", None),
        ("sequence_position", None),
        ("sequence_length", None),
    ),
)
def test_v2_public_projection_fails_closed_for_inexact_hybrid_day_fields(
    client: TestClient,
    monkeypatch: pytest.MonkeyPatch,
    malformation: tuple[str, object | None],
):
    proposal = client.post(
        "/training/plan/proposals", json={"constraints": []}
    ).json()
    stored = deepcopy(database.get_training_plan_receipt(proposal["plan_id"]))
    stored["status"] = "active"
    field, value = malformation
    training_day = next(
        day for day in stored["payload"]["days"] if day["session_intent"] is not None
    )
    if value is None:
        training_day.pop(field)
    else:
        training_day[field] = value
    monkeypatch.setattr(database, "get_active_training_plan", lambda _cycle: stored)

    response = client.get("/training/plan/current")

    assert response.status_code == 503
    assert response.json()["detail"] == "Stored adaptive-v2 plan is malformed"


def test_legacy_public_plan_days_do_not_infer_hybrid_sequence_from_objective(
    client: TestClient,
):
    legacy = _receipt("legacy-active", status="active")
    legacy["days"][0]["objective"] = "push_strength"
    database.save_training_plan_receipt(legacy)

    response = client.get("/training/plan/current")

    assert response.status_code == 200
    first_day = response.json()["days"][0]
    assert first_day.get("session_intent") is None
    assert first_day.get("sequence_position") is None
    assert first_day.get("sequence_length") is None
    assert first_day.get("decision_reasons") in (None, [])
    assert first_day.get("high_neural") in (None, False)


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
                "2026-07-22",
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
    assert days_by_date["2026-07-22"]["session_type"] == "recovery"
    assert days_by_date["2026-07-22"]["change_reason"] == "calendar_hard_conflict"


@pytest.mark.parametrize("active_source", ["fixture_fallback", "fixture", "stale_cache"])
def test_proposal_plans_without_a_non_authoritative_calendar_source(
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

    # No usable calendar is survivable: the week is planned without conflict
    # avoidance, and the response says so rather than implying it checked.
    assert response.status_code == 200
    evidence = response.json()["calendar_evidence"]
    assert evidence["available"] is False
    assert evidence["conflicts_checked"] is False
    assert evidence["source"] is None
    assert "not an authoritative source" in evidence["reason"]


def test_proposal_uses_healthy_connected_google_calendar_as_authoritative_evidence(
    client: TestClient,
    monkeypatch: pytest.MonkeyPatch,
):
    def resolve_calendar_snapshot(
        default_raw: dict, imported_snapshot: dict | None = None
    ):
        return {"events": []}, {"active_source": "fixture"}

    google_event = {
        "event_id": "google-1",
        "event_type": "performance",
        "title": "Evening performance",
        "date": "2026-07-22",
        "time_start": "19:00",
        "time_end": "22:00",
        "source": "google_calendar",
    }
    monkeypatch.setattr(
        training_router.plaan_live,
        "resolve_snapshot_raw",
        resolve_calendar_snapshot,
    )
    monkeypatch.setattr(
        google_oauth,
        "connection_status",
        lambda: {"connected": True},
    )
    monkeypatch.setattr(
        google_calendar_client,
        "fetch_events",
        lambda time_min, time_max: ([google_event], []),
    )

    response = client.post("/training/plan/proposals", json={"constraints": []})

    assert response.status_code == 200
    days_by_date = {day["date"]: day for day in response.json()["days"]}
    assert days_by_date["2026-07-22"]["change_reason"] == "calendar_hard_conflict"


def test_proposal_accepts_empty_healthy_connected_google_calendar(
    client: TestClient,
    monkeypatch: pytest.MonkeyPatch,
):
    monkeypatch.setattr(
        training_router.plaan_live,
        "resolve_snapshot_raw",
        lambda default_raw, imported_snapshot=None: (
            {"events": []},
            {"active_source": "fixture"},
        ),
    )
    monkeypatch.setattr(
        google_oauth,
        "connection_status",
        lambda: {"connected": True},
    )
    monkeypatch.setattr(
        google_calendar_client,
        "fetch_events",
        lambda time_min, time_max: ([], []),
    )

    response = client.post("/training/plan/proposals", json={"constraints": []})

    assert response.status_code == 200
    assert len(response.json()["days"]) == 7


def test_proposal_fails_closed_when_connected_google_calendar_fetch_warns(
    client: TestClient,
    monkeypatch: pytest.MonkeyPatch,
):
    monkeypatch.setattr(
        training_router.plaan_live,
        "resolve_snapshot_raw",
        lambda default_raw, imported_snapshot=None: (
            {"events": []},
            {"active_source": "fixture"},
        ),
    )
    monkeypatch.setattr(
        google_oauth,
        "connection_status",
        lambda: {"connected": True},
    )
    monkeypatch.setattr(
        google_calendar_client,
        "fetch_events",
        lambda time_min, time_max: ([], ["Google Calendar fetch failed"]),
    )

    response = client.post("/training/plan/proposals", json={"constraints": []})

    assert response.status_code == 200
    evidence = response.json()["calendar_evidence"]
    assert evidence["available"] is False
    assert evidence["conflicts_checked"] is False
    assert "could not be read" in evidence["reason"]


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
    assert response.json()["detail"] == "Training plan calendar evidence is unreadable"


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
    assert response.json()["detail"] == "Training plan calendar evidence is unreadable"


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
    assert response.json()["detail"] == "Training plan calendar evidence is unreadable"


@pytest.mark.parametrize(
    "phrase",
    [
        "I can't train today",
        "can't make it today",
        "no gym today",
        "I cannot go to the gym today",
        "not able to train today",
    ],
)
def test_being_unavailable_shifts_the_session_instead_of_dropping_it(
    client: TestClient, phrase: str
):
    """Diogo cares that a session happens, not which weekday it lands on.

    Saying he cannot train moves the session to the next day and slides the
    rest of the sequence with it. Only the explicit word "skip" drops one.
    """
    response = client.post("/training/plan/proposals", json={"intent": phrase})

    assert response.status_code == 200
    constraints = response.json()["interpreted_constraints"]
    assert [item["kind"] for item in constraints] == ["move_session"]
    values = constraints[0]["values"]
    assert (
        date.fromisoformat(values["target_date"])
        - date.fromisoformat(values["source_date"])
    ) == timedelta(days=1)


def test_skip_still_drops_the_session_rather_than_moving_it(client: TestClient):
    response = client.post("/training/plan/proposals", json={"intent": "skip today"})

    assert response.status_code == 200
    constraints = response.json()["interpreted_constraints"]
    assert [item["kind"] for item in constraints] == ["skip_session"]


@pytest.mark.parametrize(
    ("phrase", "minutes"),
    [("only 30 minutes today", 30), ("just 45 mins tomorrow", 45)],
)
def test_a_short_session_is_read_as_a_time_limit(
    client: TestClient, phrase: str, minutes: int
):
    response = client.post("/training/plan/proposals", json={"intent": phrase})

    assert response.status_code == 200
    constraints = response.json()["interpreted_constraints"]
    assert [item["kind"] for item in constraints] == ["time_limit"]
    assert constraints[0]["values"]["minutes"] == minutes


@pytest.mark.parametrize(
    "phrase",
    ["my knee hurts", "shoulder pain today", "my achilles is sore", "I tweaked my back"],
)
def test_pain_is_directed_to_the_readiness_scan_not_guessed_at(
    client: TestClient, phrase: str
):
    """Pain routes loaded work away from a joint — a hard safety gate.

    It is keyed on a scored readiness scan, and free text carries neither a
    severity nor whether the pain is sharp. Rather than fabricate that evidence,
    the phrase is recognised and the caller is told where it belongs.
    """
    response = client.post("/training/plan/proposals", json={"intent": phrase})

    assert response.status_code == 422
    assert "readiness scan" in response.json()["detail"]
    assert database.list_training_plan_receipts() == []


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


def test_live_apply_rejects_runtime_replay_failure(
    client: TestClient,
    seeded_active_plan: str,
    seeded_proposal: str,
    monkeypatch: pytest.MonkeyPatch,
):
    _enable_live_certificate(monkeypatch)
    monkeypatch.setattr(
        training_router,
        "validate_runtime_proposal",
        lambda *_args, **_kwargs: (False, ("runtime_replay_failed",)),
        raising=False,
    )

    response = client.post(f"/training/plan/proposals/{seeded_proposal}/apply")

    assert response.status_code == 409
    assert "runtime_replay_failed" in response.json()["detail"]
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
    assert rules.json()["planner"]["version"] == "adaptive-v2"
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
        "program",
        "hybrid_sequence",
        "preferred_lower_spacing_hours",
        "minimum_recovery_hours",
        "duration_ranges",
        "movement_families",
        "phase_behavior",
        "safety_flags",
    }
    assert rules["planner"]["version"] == "adaptive-v2"
    assert rules["planner"]["program"] == "performance_hybrid"
    assert rules["planner"]["hybrid_sequence"][-1] == "jump_elastic"
    assert "acceptance_bundle" not in rules["planner"]
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


def test_live_generated_proposals_are_authoritative_after_runtime_replay(
    client: TestClient,
    seeded_active_plan: str,
    monkeypatch: pytest.MonkeyPatch,
):
    _enable_live_certificate(monkeypatch)
    first = client.post(
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

    proposal_id = first.json()["plan_id"]
    detail = client.get(f"/training/plan/proposals/{proposal_id}")
    second = client.post(
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

    assert first.status_code == detail.status_code == second.status_code == 200
    assert first.json()["authoritative"] is True
    assert detail.json()["authoritative"] is True
    assert second.json()["authoritative"] is True
    assert database.get_active_training_plan(CYCLE_ID)["plan_id"] == seeded_active_plan


def test_live_apply_replays_generated_proposal_without_exact_allowlist(
    client: TestClient,
    seeded_active_plan: str,
    monkeypatch: pytest.MonkeyPatch,
):
    _enable_live_certificate(monkeypatch)
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

    applied = client.post(
        f"/training/plan/proposals/{proposed.json()['plan_id']}/apply"
    )

    assert proposed.status_code == applied.status_code == 200
    assert applied.json()["status"] == "active"
    assert database.get_active_training_plan(CYCLE_ID)["plan_id"] == proposed.json()[
        "plan_id"
    ]


def test_live_apply_rejects_tampered_persisted_proposal(
    client: TestClient,
    seeded_active_plan: str,
    monkeypatch: pytest.MonkeyPatch,
):
    _enable_live_certificate(monkeypatch)
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
    ).json()
    original_get = database.get_training_plan_receipt

    def tampered_get(plan_id):
        record = original_get(plan_id)
        if plan_id == proposed["plan_id"]:
            record = deepcopy(record)
            record["payload"]["days"][0]["objective"] = "tampered"
        return record

    monkeypatch.setattr(database, "get_training_plan_receipt", tampered_get)

    response = client.post(f"/training/plan/proposals/{proposed['plan_id']}/apply")

    assert response.status_code == 409
    assert "runtime_replay_failed" in response.json()["detail"]
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
