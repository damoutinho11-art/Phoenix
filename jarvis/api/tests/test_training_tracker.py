import tempfile
import unittest
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

