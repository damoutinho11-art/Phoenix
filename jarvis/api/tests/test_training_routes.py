"""Tests for /training routes — mocks the provider-agnostic AI gateway."""

from datetime import date

from unittest.mock import MagicMock, patch

from fastapi.testclient import TestClient

from jarvis.api import dependencies
from jarvis.api.main import app
from jarvis.api.ai_gateway import AIResult

client = TestClient(app)


def _active_plan_record(target_date="2026-07-20", session_type="high_intensity"):
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
                    "date": target_date,
                    "session_type": session_type,
                    "objective": "jump_strength",
                    "exercises": [
                        {"name": "hang_power_clean", "sets": 5, "reps": 3},
                    ],
                    "estimated_minutes": 50,
                    "change_reason": None,
                }
            ],
        },
    }

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
        with patch(
            "jarvis.api.routers.training.database.get_active_training_plan",
            return_value=_active_plan_record(),
        ), patch("jarvis.api.routers.training.clock.today", return_value=date(2026, 7, 20)):
            data = client.get("/training/status").json()
        assert "session_type" in data["today_session"]
        valid_types = {
            "high_intensity", "general", "jump", "iso_only", "rest", "recovery",
            "peak", "attempt",
        }
        assert data["today_session"]["session_type"] in valid_types

    def test_week_sessions_contains_only_active_plan_days(self):
        with patch(
            "jarvis.api.routers.training.database.get_active_training_plan",
            return_value=_active_plan_record(),
        ), patch("jarvis.api.routers.training.clock.today", return_value=date(2026, 7, 20)):
            data = client.get("/training/status").json()
        assert data["week_sessions"] == [data["today_session"]]

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

    def test_today_session_exposes_adaptive_objective_not_legacy_phase(self):
        with patch(
            "jarvis.api.routers.training.database.get_active_training_plan",
            return_value=_active_plan_record(),
        ), patch("jarvis.api.routers.training.clock.today", return_value=date(2026, 7, 20)):
            data = client.get("/training/status").json()
        assert data["today_session"]["objective"] == "jump_strength"
        assert "phase" not in data["today_session"]

    def test_status_requires_plan_instead_of_returning_legacy_session(self):
        with patch(
            "jarvis.api.routers.training.database.get_active_training_plan",
            return_value=None,
        ):
            body = client.get("/training/status").json()

        assert body["operational_state"] == "plan_required"
        assert body["plan_provenance"] is None
        assert body["today_session"] is None

    def test_status_projects_today_from_active_plan(self):
        active = _active_plan_record()
        with patch(
            "jarvis.api.routers.training.database.get_active_training_plan",
            return_value=active,
        ), patch("jarvis.api.routers.training.clock.today", return_value=date(2026, 7, 20)):
            body = client.get("/training/status").json()

        assert body["operational_state"] == "active_plan"
        assert body["plan_provenance"] == {
            "plan_id": "plan-2026-W30",
            "receipt_hash": "receipt-2026-W30",
            "date": "2026-07-20",
        }
        assert body["today_session"]["exercises"] == [
            {"name": "hang_power_clean", "sets": 5, "reps": 3}
        ]
        assert body["week_sessions"] == [body["today_session"]]


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


class TestTrainingReadinessAndRouting:
    def test_routed_session_uses_same_active_plan_projection_as_status(self):
        active = _active_plan_record()
        with patch(
            "jarvis.api.routers.training.database.get_active_training_plan",
            return_value=active,
        ), patch(
            "jarvis.api.routers.training.database.get_latest_training_readiness_scan",
            return_value=None,
        ), patch("jarvis.api.routers.training.clock.today", return_value=date(2026, 7, 20)):
            status = client.get("/training/status").json()
            routed = client.get("/training/routed-session").json()

        assert routed["operational_state"] == "active_plan"
        assert routed["plan_provenance"] == status["plan_provenance"]
        assert routed["session"] == status["today_session"]
        assert routed["planned_session"] == status["today_session"]

    def test_routed_session_rejects_missing_active_plan(self):
        with patch(
            "jarvis.api.routers.training.database.get_active_training_plan",
            return_value=None,
        ):
            response = client.get("/training/routed-session")

        assert response.status_code == 409
        assert response.json()["detail"] == "Active training plan required"

    def test_readiness_scan_validates_score_range(self):
        response = client.post(
            "/training/readiness-scan",
            json={
                "knee": 11,
                "ankle": 0,
                "hip": 0,
                "hamstring": 0,
                "calf_achilles": 0,
                "lower_back_pelvic": 0,
            },
        )
        assert response.status_code == 422

    def test_readiness_scan_classifies_and_persists(self):
        with patch(
            "jarvis.api.routers.training.database.save_training_readiness_scan",
            return_value=41,
        ) as save:
            response = client.post(
                "/training/readiness-scan",
                json={
                    "knee": 4,
                    "ankle": 1,
                    "hip": 0,
                    "hamstring": 0,
                    "calf_achilles": 0,
                    "lower_back_pelvic": 0,
                    "note": "Knee feels loaded",
                },
            )
        assert response.status_code == 200
        assert response.json()["readiness_status"] == "caution"
        assert response.json()["scan_id"] == 41
        assert save.call_args.args[0]["readiness_status"] == "caution"

    def test_routed_session_is_unchecked_and_gates_high_neural_without_scan(self):
        with patch(
            "jarvis.api.routers.training.database.get_latest_training_readiness_scan",
            return_value=None,
        ), patch(
            "jarvis.api.routers.training.database.get_active_training_plan",
            return_value=_active_plan_record("2026-07-01"),
        ), patch("jarvis.api.routers.training.clock.today", return_value=__import__("datetime").date(2026, 7, 1)):
            response = client.get("/training/routed-session")
        assert response.status_code == 200
        data = response.json()
        assert data["readiness_status"] == "unchecked"
        assert data["readiness_required"] is True
        assert data["high_neural_allowed"] is False
        assert any(block["key"] == "sled_balance" for block in data["capacity_blocks"])

    def test_capacity_block_log_is_explicit(self):
        with patch(
            "jarvis.api.routers.training.database.save_training_capacity_log",
            return_value=8,
        ):
            response = client.post(
                "/training/log/capacity-block",
                json={"block_key": "sled_balance", "completed": True, "minutes": 8},
            )
        assert response.status_code == 200
        assert response.json() == {"status": "logged", "capacity_log_id": 8}

    def test_user_can_explicitly_request_recovery_reset(self):
        with patch(
            "jarvis.api.routers.training.database.get_latest_training_readiness_scan",
            return_value=None,
        ), patch(
            "jarvis.api.routers.training.database.get_active_training_plan",
            return_value=_active_plan_record("2026-07-01"),
        ), patch("jarvis.api.routers.training.clock.today", return_value=__import__("datetime").date(2026, 7, 1)):
            response = client.get("/training/routed-session?explicit_reset=true")
        assert response.status_code == 200
        data = response.json()
        assert data["show_recovery_reset"] is True
        # Pelvic Control is a daily block — present even on recovery/rest days.
        assert [block["key"] for block in data["capacity_blocks"]] == ["recovery_reset", "pelvic_control"]

    def test_jump_balance_accepts_supported_plant_and_one_rep(self):
        with patch(
            "jarvis.api.routers.training.database.save_training_jump_balance_log",
            return_value=9,
        ):
            response = client.post(
                "/training/log/jump-balance",
                json={
                    "plant_pattern": "two_foot_left_right",
                    "rep_count": 1,
                    "jump_variant": "arms_free",
                    "quality": {"ground_contact_feel": "controlled"},
                },
            )
        assert response.status_code == 200
        assert response.json()["jump_balance_log_id"] == 9

    def test_jump_balance_rejects_unknown_plant_and_more_than_ten_reps(self):
        unknown = client.post(
            "/training/log/jump-balance",
            json={"plant_pattern": "wrong", "rep_count": 1, "jump_variant": "arms_free"},
        )
        excessive = client.post(
            "/training/log/jump-balance",
            json={
                "plant_pattern": "one_foot_left",
                "rep_count": 11,
                "jump_variant": "arms_free",
            },
        )
        assert unknown.status_code == 422
        assert excessive.status_code == 422

    def test_history_includes_additive_training_records(self):
        with patch("jarvis.api.routers.training.database.get_sessions", return_value=[]), patch(
            "jarvis.api.routers.training.database.get_jumps", return_value=[]
        ), patch(
            "jarvis.api.routers.training.database.list_training_readiness_scans",
            return_value=[{"id": 1}],
        ), patch(
            "jarvis.api.routers.training.database.list_training_capacity_logs",
            return_value=[{"id": 2}],
        ), patch(
            "jarvis.api.routers.training.database.list_training_jump_balance_logs",
            return_value=[{"id": 3}],
        ):
            data = client.get("/training/history").json()
        assert data["readiness_scans"] == [{"id": 1}]
        assert data["capacity_logs"] == [{"id": 2}]
        assert data["jump_balance_logs"] == [{"id": 3}]
