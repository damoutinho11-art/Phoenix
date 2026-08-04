import json
import os
import tempfile
import unittest
import sqlite3
from datetime import date, timedelta
from pathlib import Path
from unittest.mock import patch

from fastapi.testclient import TestClient

from jarvis.api.main import app
from jarvis.api.routers import training as training_router
from jarvis.core import clock
from jarvis.data import database
from jarvis.domains.calendar.tests.fixtures import LIVE_SNAPSHOT_RAW
from jarvis.domains.training.progression import calculate_progression

client = TestClient(app)


def _exercise(reps=5, target_reps=5, weight_kg=60, name="Bench Press"):
    return {
        "name": name,
        "target_reps": target_reps,
        "sets": [
            {"reps": reps, "weight_kg": weight_kg},
            {"reps": reps, "weight_kg": weight_kg},
        ],
    }


def _planned_session_values(**overrides):
    values = {
        "session_date": "2026-07-20",
        "session_type": "high_intensity",
        "week_number": None,
        "exercises": [_exercise()],
        "plan_id": "plan-2026-W30",
        "receipt_hash": "receipt-2026-W30",
        "plan_date": "2026-07-20",
        "duration_seconds": 2700,
        "rpe": 8,
        "pain_confirmed": False,
        "pain_body_areas": [],
        "notes": "Clean session",
    }
    values.update(overrides)
    return values


def _active_plan_record():
    return {
        "plan_id": "plan-2026-W30",
        "status": "active",
        "reason": "accepted",
        "changed_at": "2026-07-19T10:00:00+00:00",
        "superseded_by": None,
        "payload": {
            "plan_id": "plan-2026-W30",
            "receipt_hash": "receipt-2026-W30",
            "days": [
                {
                    "date": "2026-07-20",
                    "session_type": "high_intensity",
                    "objective": "jump_strength",
                    "exercises": [
                        {"name": "Bench Press", "sets": 2, "reps": 5},
                    ],
                    "estimated_minutes": 45,
                    "change_reason": None,
                }
            ],
        },
    }


def _active_hybrid_plan_record():
    return {
        "plan_id": "plan-2026-W30-hybrid",
        "status": "active",
        "reason": "accepted",
        "changed_at": "2026-07-19T10:00:00+00:00",
        "superseded_by": None,
        "payload": {
            "plan_id": "plan-2026-W30-hybrid",
            "constitution_version": "2",
            "planner_version": "adaptive-v2",
            "receipt_hash": "receipt-2026-W30-hybrid",
            "days": [
                {
                    "date": "2026-07-20",
                    "session_type": "general",
                    "objective": "lower_power",
                    "session_intent": "lower_power",
                    "sequence_position": 3,
                    "sequence_length": 6,
                    "decision_reasons": ["sequence_continuity"],
                    "high_neural": True,
                    "exercises": [
                        {"name": "Bench Press", "sets": 2, "reps": 5},
                    ],
                    "estimated_minutes": 65,
                    "change_reason": None,
                }
            ],
        },
    }


def _active_hybrid_sequence_record():
    record = _active_hybrid_plan_record()
    record["payload"]["days"] = [
        {
            "date": f"2026-07-{20 + offset:02d}",
            "session_type": "general",
            "objective": intent,
            "session_intent": intent,
            "sequence_position": position,
            "sequence_length": 6,
            "decision_reasons": ["sequence_continuity"],
            "high_neural": position in {3, 6},
            "exercises": [{"name": "Bench Press", "sets": 2, "reps": 5}],
            "estimated_minutes": 65,
            "change_reason": None,
        }
        for offset, (position, intent) in enumerate(
            (
                (1, "push_strength"),
                (2, "pull_strength"),
                (3, "lower_power"),
                (4, "push_volume"),
                (5, "pull_volume"),
                (6, "jump_elastic"),
            )
        )
    ]
    record["payload"]["replay_inputs"] = {
        "snapshot": {"sequence_cursor": 1, "completed_sessions": []}
    }
    return record


def _planned_api_payload(**overrides):
    payload = {
        "date": "2026-07-20",
        "session_type": "high_intensity",
        "exercises": [_exercise()],
        "plan_id": "plan-2026-W30",
        "receipt_hash": "receipt-2026-W30",
        "duration_seconds": 2700,
        "rpe": 8,
        "pain_confirmed": False,
        "pain_body_areas": [],
        "notes": "Clean session",
    }
    payload.update(overrides)
    return payload


def _hybrid_completion_payload(**overrides):
    payload = _planned_api_payload(
        session_type="general",
        plan_id="plan-2026-W30-hybrid",
        receipt_hash="receipt-2026-W30-hybrid",
        session_intent="lower_power",
        sequence_position=3,
        sequence_length=6,
    )
    payload.update(overrides)
    return payload


class TrainingTrackerTests(unittest.TestCase):
    def setUp(self):
        self.temp_dir = tempfile.TemporaryDirectory()
        self.db_patch = patch.object(
            database,
            "DB_PATH",
            Path(self.temp_dir.name) / "training-tracker.db",
        )
        self.db_patch.start()
        database.init_db()

    def tearDown(self):
        self.db_patch.stop()
        self.temp_dir.cleanup()

    def test_session_log_create(self):
        response = client.post(
            "/training/log/session",
            json={
                "date": date.today().isoformat(),
                "session_type": "Push",
                "week_number": 1,
                "exercises": [_exercise()],
                "notes": "Strong session",
            },
        )
        assert response.status_code == 200
        assert isinstance(response.json()["session_id"], int)
        sessions = database.get_sessions()
        assert sessions[0]["exercises"][0]["name"] == "Bench Press"

    def test_planned_session_write_persists_completion_evidence(self):
        session_id, replay = database.log_planned_session(
            **_planned_session_values()
        )

        assert replay is False
        sessions = database.get_sessions()
        assert sessions[0]["id"] == session_id
        assert sessions[0]["plan_provenance"] == {
            "plan_id": "plan-2026-W30",
            "receipt_hash": "receipt-2026-W30",
            "date": "2026-07-20",
        }
        assert sessions[0]["completion_evidence"] == {
            "duration_seconds": 2700,
            "rpe": 8,
            "pain_confirmed": False,
            "pain_body_areas": [],
        }

    def test_hybrid_completion_persists_sequence_evidence_in_history(self):
        with patch(
            "jarvis.api.routers.training.database.get_active_training_plan",
            return_value=_active_hybrid_plan_record(),
        ):
            response = client.post(
                "/training/log/session",
                json=_hybrid_completion_payload(),
            )
            history = client.get("/training/history")

        assert response.status_code == 200
        assert history.status_code == 200
        recorded = history.json()["sessions"][0]
        assert recorded["session_intent"] == "lower_power"
        assert recorded["sequence_position"] == 3
        assert recorded["sequence_length"] == 6

    def test_hybrid_completion_rejects_sequence_position_not_matching_plan(self):
        with patch(
            "jarvis.api.routers.training.database.get_active_training_plan",
            return_value=_active_hybrid_plan_record(),
        ):
            response = client.post(
                "/training/log/session",
                json=_hybrid_completion_payload(sequence_position=5),
            )

        assert response.status_code == 409
        assert response.json()["detail"] == (
            "Training completion does not match plan day"
        )
        assert database.get_sessions() == []

    def test_hybrid_completion_rejects_valid_later_day_before_next_position(self):
        active_plan = _active_hybrid_sequence_record()
        with patch(
            "jarvis.api.routers.training.database.get_active_training_plan",
            return_value=active_plan,
        ):
            response = client.post(
                "/training/log/session",
                json=_hybrid_completion_payload(
                    date="2026-07-22",
                    session_intent="lower_power",
                    sequence_position=3,
                ),
            )

        assert response.status_code == 409
        assert response.json()["detail"] == (
            "Training completion is not the next executable sequence position"
        )
        assert database.get_sessions() == []

    def test_hybrid_completion_advances_only_after_contiguous_positions(self):
        active_plan = _active_hybrid_sequence_record()
        with patch(
            "jarvis.api.routers.training.database.get_active_training_plan",
            return_value=active_plan,
        ):
            first = client.post(
                "/training/log/session",
                json=_hybrid_completion_payload(
                    session_intent="push_strength",
                    sequence_position=1,
                ),
            )
            skipped = client.post(
                "/training/log/session",
                json=_hybrid_completion_payload(
                    date="2026-07-22",
                    session_intent="lower_power",
                    sequence_position=3,
                ),
            )
            second = client.post(
                "/training/log/session",
                json=_hybrid_completion_payload(
                    date="2026-07-21",
                    session_intent="pull_strength",
                    sequence_position=2,
                ),
            )

        assert first.status_code == 200
        assert skipped.status_code == 409
        assert second.status_code == 200
        assert [
            session["sequence_position"] for session in reversed(database.get_sessions())
        ] == [1, 2]

    def test_hybrid_completion_conflicting_retry_is_rejected(self):
        active_plan = _active_hybrid_plan_record()
        with patch(
            "jarvis.api.routers.training.database.get_active_training_plan",
            return_value=active_plan,
        ):
            first = client.post(
                "/training/log/session",
                json=_hybrid_completion_payload(),
            )
            active_plan["payload"]["days"][0]["session_intent"] = "push_volume"
            second = client.post(
                "/training/log/session",
                json=_hybrid_completion_payload(session_intent="push_volume"),
            )

        assert first.status_code == 200
        assert second.status_code == 409
        assert "different evidence" in second.json()["detail"]
        assert len(database.get_sessions()) == 1

    def test_hybrid_completion_requires_all_authoritative_sequence_evidence(self):
        payload = _hybrid_completion_payload()
        payload.pop("session_intent")
        with patch(
            "jarvis.api.routers.training.database.get_active_training_plan",
            return_value=_active_hybrid_plan_record(),
        ):
            response = client.post("/training/log/session", json=payload)

        assert response.status_code == 409
        assert response.json()["detail"] == (
            "Training completion does not match plan day"
        )
        assert database.get_sessions() == []

    def test_legacy_plan_completion_rejects_any_hybrid_sequence_evidence(self):
        hybrid_claims = {
            "session_intent": "push_strength",
            "sequence_position": 1,
            "sequence_length": 6,
        }
        for field, value in hybrid_claims.items():
            with self.subTest(field=field), patch.object(
                database,
                "DB_PATH",
                Path(self.temp_dir.name) / f"legacy-{field}.db",
            ), patch(
                "jarvis.api.routers.training.database.get_active_training_plan",
                return_value=_active_plan_record(),
            ):
                database.init_db()

                response = client.post(
                    "/training/log/session",
                    json=_planned_api_payload(**{field: value}),
                )

                assert response.status_code == 409
                assert response.json()["detail"] == (
                    "Training completion does not match plan day"
                )
                assert database.get_sessions() == []

    def test_unplanned_session_rejects_unlinked_hybrid_sequence_claims(self):
        response = client.post(
            "/training/log/session",
            json={
                "date": date.today().isoformat(),
                "session_type": "Push",
                "exercises": [_exercise()],
                "session_intent": "push_strength",
                "sequence_position": 1,
                "sequence_length": 6,
            },
        )

        assert response.status_code == 422
        assert "Hybrid sequence evidence requires plan provenance" in response.text
        assert database.get_sessions() == []

    def test_planned_session_write_is_idempotent_per_plan_day(self):
        first_id, first_replay = database.log_planned_session(
            **_planned_session_values()
        )
        second_id, second_replay = database.log_planned_session(
            **_planned_session_values()
        )

        assert first_replay is False
        assert second_replay is True
        assert second_id == first_id
        assert len(database.get_sessions()) == 1

    def test_planned_session_conflicting_retry_is_rejected(self):
        database.log_planned_session(**_planned_session_values())

        with self.assertRaisesRegex(
            ValueError, "completion already exists with different evidence"
        ):
            database.log_planned_session(**_planned_session_values(rpe=10))

    def test_planned_session_evidence_is_append_only(self):
        session_id, _ = database.log_planned_session(**_planned_session_values())
        connection = database.get_db()
        try:
            with self.assertRaisesRegex(sqlite3.IntegrityError, "immutable"):
                connection.execute(
                    "UPDATE training_session_evidence SET rpe = 10 WHERE session_id = ?",
                    (session_id,),
                )
            with self.assertRaisesRegex(sqlite3.IntegrityError, "immutable"):
                connection.execute(
                    "DELETE FROM training_session_evidence WHERE session_id = ?",
                    (session_id,),
                )
        finally:
            connection.close()

    def test_planned_completion_requires_rpe_and_pain_confirmation(self):
        payload = _planned_api_payload()
        payload.pop("rpe")
        payload.pop("pain_confirmed")

        response = client.post("/training/log/session", json=payload)

        assert response.status_code == 422

    def test_planned_completion_rejects_receipt_mismatch(self):
        with patch(
            "jarvis.api.routers.training.database.get_active_training_plan",
            return_value=_active_plan_record(),
        ):
            response = client.post(
                "/training/log/session",
                json=_planned_api_payload(receipt_hash="wrong"),
            )

        assert response.status_code == 409
        assert response.json()["detail"] == "Training completion provenance mismatch"

    def test_planned_completion_rejects_exercises_outside_plan(self):
        with patch(
            "jarvis.api.routers.training.database.get_active_training_plan",
            return_value=_active_plan_record(),
        ):
            response = client.post(
                "/training/log/session",
                json=_planned_api_payload(exercises=[_exercise(name="Back Squat")]),
            )

        assert response.status_code == 409
        assert response.json()["detail"] == "Training completion does not match plan day"

    def test_planned_completion_with_pain_requires_body_area(self):
        response = client.post(
            "/training/log/session",
            json=_planned_api_payload(pain_confirmed=True, pain_body_areas=[]),
        )

        assert response.status_code == 422
        assert "pain_body_areas" in response.text
        assert "required when pain is confirmed" in response.text

    def test_planned_completion_returns_idempotent_replay(self):
        with patch(
            "jarvis.api.routers.training.database.get_active_training_plan",
            return_value=_active_plan_record(),
        ):
            first = client.post("/training/log/session", json=_planned_api_payload())
            second = client.post("/training/log/session", json=_planned_api_payload())

        assert first.status_code == second.status_code == 200
        assert second.json()["session_id"] == first.json()["session_id"]
        assert first.json()["idempotent_replay"] is False
        assert second.json()["idempotent_replay"] is True
        assert second.json()["plan_provenance"] == {
            "plan_id": "plan-2026-W30",
            "receipt_hash": "receipt-2026-W30",
            "date": "2026-07-20",
        }

    def test_operational_flow_persists_readiness_route_and_actual_set_results(self):
        actual_exercise = _exercise(reps=5)
        actual_exercise["sets"][0] = {
            "reps": 4,
            "weight_kg": 57.5,
            "target_reps": 5,
        }
        with patch(
            "jarvis.api.routers.training.database.get_active_training_plan",
            return_value=_active_plan_record(),
        ), patch(
            "jarvis.api.routers.training.clock.today",
            return_value=date(2026, 7, 20),
        ):
            readiness = client.post(
                "/training/readiness-scan",
                json={
                    "knee": 0,
                    "ankle": 0,
                    "hip": 0,
                    "hamstring": 0,
                    "calf_achilles": 0,
                    "lower_back_pelvic": 0,
                    "sharp_pain": False,
                    "limping": False,
                    "next_day_worsening": False,
                    "note": "Ready",
                },
            )
            routed = client.get("/training/routed-session")
            completion = client.post(
                "/training/log/session",
                json=_planned_api_payload(exercises=[actual_exercise]),
            )
            history = client.get("/training/history")

        assert readiness.status_code == 200
        assert readiness.json()["readiness_status"] == "clear"
        assert routed.status_code == 200
        assert routed.json()["high_neural_allowed"] is True
        assert completion.status_code == 200
        recorded = history.json()["sessions"][0]
        assert recorded["exercises"][0]["sets"][0] == {
            "reps": 4,
            "weight_kg": 57.5,
            "target_reps": 5,
        }
        assert recorded["completion_evidence"]["rpe"] == 8
        assert recorded["plan_provenance"]["plan_id"] == "plan-2026-W30"

    def test_hybrid_integrity_loop_advances_from_actual_completion(self):
        acceptance = {
            "accepted": True,
            "reasons": [],
            "planner_version": "adaptive-v2",
            "constitution_version": "2",
            "evidence_id": "integrity-loop-test-evidence",
            "fixture_summary": {},
        }
        with patch.dict(
            os.environ,
            {
                "PHOENIX_PLAAN_SNAPSHOT_JSON": json.dumps(LIVE_SNAPSHOT_RAW),
                "PHOENIX_TRAINING_PLANNER_MODE": "live",
            },
        ), patch.object(
            clock,
            "today",
            return_value=date(2026, 7, 20),
        ), patch.object(
            clock,
            "utc_now_iso",
            return_value="2026-07-20T06:00:00+00:00",
        ), patch.object(
            training_router,
            "training_planner_acceptance_status",
            return_value=acceptance,
        ), patch.object(
            training_router,
            "_runtime_proposal_validation",
            return_value=(True, ()),
        ):
            proposed = client.post(
                "/training/plan/proposals",
                json={"constraints": []},
            )
            assert proposed.status_code == 200
            proposal = proposed.json()

            applied = client.post(
                f"/training/plan/proposals/{proposal['plan_id']}/apply"
            )
            assert applied.status_code == 200
            active_record = database.get_active_training_plan("2026-W30")
            assert active_record is not None
            active = active_record["payload"]
            first_day = next(
                day for day in active["days"] if day.get("sequence_position") == 1
            )
            session_date = date.fromisoformat(first_day["date"])

            with patch.object(clock, "today", return_value=session_date):
                readiness = client.post(
                    "/training/readiness-scan",
                    json={
                        "knee": 0,
                        "ankle": 0,
                        "hip": 0,
                        "hamstring": 0,
                        "calf_achilles": 0,
                        "lower_back_pelvic": 0,
                        "sharp_pain": False,
                        "limping": False,
                        "next_day_worsening": False,
                        "note": "Ready for the integrity loop",
                    },
                )
                assert readiness.status_code == 200

                routed = client.get("/training/routed-session")
                assert routed.status_code == 200
                routed_body = routed.json()
                planned_session = routed_body["session"]
                routed_plan = routed_body["planned_session"]
                assert routed_body["plan_provenance"] == {
                    "plan_id": active["plan_id"],
                    "receipt_hash": active["receipt_hash"],
                    "date": first_day["date"],
                }
                assert first_day["session_intent"] == "push_strength"
                assert first_day["sequence_position"] == 1
                assert routed_plan["session_intent"] == first_day["session_intent"]
                assert routed_plan["sequence_position"] == first_day["sequence_position"]
                assert routed_plan["sequence_length"] == first_day["sequence_length"]
                assert planned_session["session_intent"] == first_day["session_intent"]
                assert planned_session["sequence_position"] == first_day["sequence_position"]
                assert planned_session["sequence_length"] == first_day["sequence_length"]
                assert planned_session["date"] == first_day["date"]
                assert planned_session["exercises"] == first_day["exercises"]

                actual_exercises = []
                for exercise in planned_session["exercises"]:
                    actual_exercises.append(
                        {
                            "name": exercise["name"],
                            "target_reps": exercise["reps"],
                            "sets": [
                                {
                                    "reps": 7,
                                    "target_reps": exercise["reps"],
                                    "weight_kg": 57.5,
                                }
                                for _ in range(exercise["sets"])
                            ],
                        }
                    )
                completion = client.post(
                    "/training/log/session",
                    json={
                        "date": first_day["date"],
                        "session_type": planned_session["session_type"],
                        "exercises": actual_exercises,
                        "plan_id": active["plan_id"],
                        "receipt_hash": active["receipt_hash"],
                        "duration_seconds": planned_session["estimated_minutes"] * 60,
                        "rpe": 8,
                        "pain_confirmed": False,
                        "pain_body_areas": [],
                        "session_intent": routed_plan["session_intent"],
                        "sequence_position": routed_plan["sequence_position"],
                        "sequence_length": routed_plan["sequence_length"],
                    },
                )
                assert completion.status_code == 200

                history = client.get("/training/history")
                assert history.status_code == 200
                recorded = history.json()["sessions"][0]
                assert recorded["exercises"][0]["sets"][0] == {
                    "reps": 7,
                    "target_reps": planned_session["exercises"][0]["reps"],
                    "weight_kg": 57.5,
                }
                assert recorded["plan_provenance"]["plan_id"] == active["plan_id"]
                assert recorded["sequence_position"] == 1

                next_response = client.post(
                    "/training/plan/proposals",
                    json={"constraints": []},
                )

        assert next_response.status_code == 200
        next_proposal = next_response.json()
        stored_next = database.get_training_plan_receipt(next_proposal["plan_id"])
        assert stored_next is not None
        first_training_day = next(
            day
            for day in stored_next["payload"]["days"]
            if day["session_intent"]
        )
        assert first_training_day["sequence_position"] == 2
        assert first_training_day["session_intent"] == "pull_strength"

    def test_legacy_routed_session_does_not_infer_hybrid_sequence_from_objective(self):
        legacy = _active_plan_record()
        legacy["payload"]["days"][0]["objective"] = "push_strength"
        with patch(
            "jarvis.api.routers.training.database.get_active_training_plan",
            return_value=legacy,
        ), patch.object(
            clock,
            "today",
            return_value=date(2026, 7, 20),
        ):
            response = client.get("/training/routed-session")

        assert response.status_code == 200
        body = response.json()
        for session in (body["planned_session"], body["session"]):
            assert session.get("session_intent") is None
            assert session.get("sequence_position") is None
            assert session.get("sequence_length") is None

    def test_jump_log_create(self):
        response = client.post(
            "/training/log/jump",
            json={
                "date": date.today().isoformat(),
                "jump_type": "approach",
                "height_cm": 64.5,
                "notes": "Fresh legs",
            },
        )
        assert response.status_code == 200
        assert isinstance(response.json()["jump_id"], int)
        assert database.get_jumps()[0]["height_cm"] == 64.5

    def test_history_returns_progression(self):
        database.log_session(date.today(), "Push", 1, [_exercise()])
        database.log_jump(date.today() - timedelta(days=1), "standing", 52)
        database.log_jump(date.today(), "approach", 65)
        data = client.get("/training/history").json()
        assert len(data["sessions"]) == 1
        assert data["jump_progression"] == [
            {"date": (date.today() - timedelta(days=1)).isoformat(), "standing": 52.0},
            {"date": date.today().isoformat(), "approach": 65.0},
        ]
        assert data["next_week_suggestions"]["Bench Press"]["suggested_kg"] == 62.5

    def test_progression_logic_increase(self):
        suggestions = calculate_progression([
            {
                "id": 1,
                "date": "2026-06-22",
                "session_type": "Push",
                "exercises": [_exercise()],
            }
        ])
        assert suggestions["Bench Press"] == {
            "suggested_kg": 62.5,
            "basis": "All sets hit target reps; add 2.5kg.",
            "deload": False,
        }

    def test_progression_logic_hold(self):
        suggestions = calculate_progression([
            {
                "id": 1,
                "date": "2026-06-22",
                "session_type": "Push",
                "exercises": [_exercise(reps=4)],
            }
        ])
        assert suggestions["Bench Press"]["suggested_kg"] == 60
        assert suggestions["Bench Press"]["deload"] is False

    def test_deload_flag(self):
        suggestions = calculate_progression([
            {
                "id": 2,
                "date": "2026-06-22",
                "session_type": "Lower",
                "exercises": [_exercise(reps=4, weight_kg=100, name="Back Squat")],
            },
            {
                "id": 1,
                "date": "2026-06-15",
                "session_type": "Lower",
                "exercises": [_exercise(reps=3, weight_kg=100, name="Back Squat")],
            },
        ])
        assert suggestions["Back Squat"]["suggested_kg"] == 100
        assert suggestions["Back Squat"]["deload"] is True
        assert "2 consecutive sessions" in suggestions["Back Squat"]["basis"]

    def test_zero_rep_misses_trigger_deload(self):
        suggestions = calculate_progression([
            {
                "id": 2,
                "date": "2026-06-22",
                "session_type": "Lower",
                "exercises": [_exercise(reps=0, weight_kg=100, name="Back Squat")],
            },
            {
                "id": 1,
                "date": "2026-06-15",
                "session_type": "Lower",
                "exercises": [_exercise(reps=0, weight_kg=100, name="Back Squat")],
            },
        ])

        assert suggestions["Back Squat"]["suggested_kg"] == 100
        assert suggestions["Back Squat"]["deload"] is True
        assert "2 consecutive sessions" in suggestions["Back Squat"]["basis"]
