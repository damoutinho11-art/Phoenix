import tempfile
import unittest
import sqlite3
from datetime import date, timedelta
from pathlib import Path
from unittest.mock import patch

from fastapi.testclient import TestClient

from jarvis.api.main import app
from jarvis.data import database
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

