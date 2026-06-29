"""Tests for /training routes — mocks the provider-agnostic AI gateway."""

from unittest.mock import MagicMock, patch

from fastapi.testclient import TestClient

from jarvis.api import dependencies
from jarvis.api.main import app
from jarvis.api.ai_gateway import AIResult

client = TestClient(app)

_MOCK_BRIEF = (
    "You're in month_1, week 1 of the Long Conjugate Sequence, laying hypertrophy base. "
    "Cut is active — 56 days to strip 4.4kg to hit 19% BF. "
    "No opera conflicts this week, training schedule is clean. "
    "Today: HIGH_INTENSITY."
)

_MOCK_RESPONSE = MagicMock()
_MOCK_RESPONSE.content = [MagicMock(text=_MOCK_BRIEF)]


def _make_ai_result(text=_MOCK_BRIEF, ok=True):
    return AIResult(text=text, provider="test", model="test-model", ok=ok)


class TestTrainingStatusRoute:
    def test_status_returns_200(self):
        assert client.get("/training/status").status_code == 200

    def test_status_shape(self):
        data = client.get("/training/status").json()
        assert "dunk_goal" in data
        assert "cut_status" in data
        assert "today_session" in data
        assert "week_sessions" in data
        assert "has_hard_conflicts" in data
        assert "fatigue_warning" in data

    def test_today_session_has_session_type(self):
        data = client.get("/training/status").json()
        assert "session_type" in data["today_session"]
        valid_types = {"high_intensity", "general", "jump", "iso_only", "rest", "peak", "attempt"}
        assert data["today_session"]["session_type"] in valid_types

    def test_week_sessions_has_7_entries(self):
        data = client.get("/training/status").json()
        assert len(data["week_sessions"]) == 7

    def test_dunk_goal_fields_present(self):
        g = client.get("/training/status").json()["dunk_goal"]
        assert "days_to_attempt" in g
        assert "weeks_to_attempt" in g
        assert "current_phase" in g
        assert "on_track" in g

    def test_cut_status_fields_present(self):
        c = client.get("/training/status").json()["cut_status"]
        assert "active" in c
        assert "days_remaining" in c
        assert "current_bf_pct" in c
        assert "target_bf_pct" in c
        assert "estimated_fat_to_lose_kg" in c

    def test_status_invalid_constitution_returns_500(self):
        def _bad():
            from fastapi import HTTPException
            raise HTTPException(status_code=500, detail="constitution violation")

        app.dependency_overrides[dependencies.get_training_constitution] = _bad
        try:
            assert client.get("/training/status").status_code == 500
        finally:
            app.dependency_overrides.clear()

    def test_today_session_has_phase(self):
        data = client.get("/training/status").json()
        assert "phase" in data["today_session"]
        assert data["today_session"]["phase"] in {"month_1", "month_2", "peak", "attempt"}


class TestTrainingBriefRoute:
    def test_brief_returns_200(self):
        with patch("jarvis.api.routers.training.ai_gateway.generate_text", return_value=_make_ai_result()):
            assert client.get("/training/brief").status_code == 200

    def test_brief_shape(self):
        with patch("jarvis.api.routers.training.ai_gateway.generate_text", return_value=_make_ai_result()):
            data = client.get("/training/brief").json()
        assert "brief" in data
        assert isinstance(data["brief"], str)
        assert len(data["brief"]) > 0

    def test_requires_approval_always_true(self):
        with patch("jarvis.api.routers.training.ai_gateway.generate_text", return_value=_make_ai_result()):
            data = client.get("/training/brief").json()
        assert data["requires_approval"] is True

    def test_gateway_called_with_expected_boundary(self):
        with patch("jarvis.api.routers.training.ai_gateway.generate_text", return_value=_make_ai_result()) as gateway:
            client.get("/training/brief")
        assert gateway.call_args.kwargs["max_tokens"] == 256
        assert gateway.call_args.kwargs["system_prompt"]

    def test_anthropic_failure_returns_fallback_not_500(self):
        with patch("jarvis.api.routers.training.ai_gateway.generate_text", return_value=_make_ai_result(ok=False)):
            response = client.get("/training/brief")
        assert response.status_code == 200
        assert "AI training brief unavailable" in response.json()["brief"]

    def test_anthropic_failure_still_requires_approval(self):
        with patch("jarvis.api.routers.training.ai_gateway.generate_text", return_value=_make_ai_result(ok=False)):
            data = client.get("/training/brief").json()
        assert data["requires_approval"] is True
