"""Tests for GET /finance/brief — mocks the provider-agnostic AI gateway."""

import copy
from datetime import date
from unittest.mock import MagicMock, patch

from fastapi.testclient import TestClient

from jarvis.api import dependencies
from jarvis.api.main import app
from jarvis.api.ai_gateway import AIResult
from jarvis.domains.finance import engine

client = TestClient(app)

_READY_CASHFLOW_AUTHORITY = {
    "data_ready": True,
    "blockers": [],
    "weekly_budget_eur": 115.38,
    "cash_capacity_eur": 461.52,
    "sustainable_capacity_eur": 461.52,
    "deployable_capacity_eur": 461.52,
    "remaining_weekly_windows": 4,
    "input_hash": "b" * 64,
    "policy_version": 2,
    "source": {
        "parser": "lhv_pdf",
        "quality_status": "reconciled",
        "receipt_verified": True,
        "balance_difference_eur": 0.0,
        "statement_end_date": "2026-08-11",
        "filename_hash": "0" * 64,
    },
}

_SAFE_ETF_RESOLUTION = {
    "selected_candidate": None,
    "candidates": [],
    "source": "yfinance",
    "broker_source": "lightyear_public_fund_screener",
    "broker_verification": "not_verified",
    "confirmation_required": True,
    "lightyear_available": "unknown",
    "confidence": "unresolved",
    "reason": "test fixture",
}

_MOCK_BRIEF = (
    "Sir, I recommend deploying the weekly allocation: €46.15 to BTC via lhv_crypto "
    "and €69.23 to quality_etf via lightyear. "
    "That is the best current decision under your constitution, target gaps, platform readiness, and risk caps. "
    "No warnings are active, and PHOENIX will wait for your approval. "
    "Requires your approval before any action."
)

_MOCK_ANTHROPIC_RESPONSE = MagicMock()
_MOCK_ANTHROPIC_RESPONSE.content = [MagicMock(text=_MOCK_BRIEF)]


def _make_ai_result(text=_MOCK_BRIEF, ok=True):
    return AIResult(text=text, provider="test", model="test-model", ok=ok)


class TestFinanceBriefRoute:
    def setup_method(self):
        self.authority_patch = patch(
            "jarvis.api.routers.budget._build_cashflow_authority",
            return_value=_READY_CASHFLOW_AUTHORITY.copy(),
        )
        self.regime_patch = patch(
            "jarvis.api.routers.finance.detect_market_regime", return_value="risk_on"
        )
        self.resolver_patch = patch(
            "jarvis.api.routers.finance.resolve_best_etf_candidate_with_broker_check",
            return_value=_SAFE_ETF_RESOLUTION,
        )
        self.authority_patch.start()
        self.regime_patch.start()
        self.resolver_patch.start()

    def teardown_method(self):
        self.resolver_patch.stop()
        self.regime_patch.stop()
        self.authority_patch.stop()

    def test_brief_returns_200(self):
        with patch("jarvis.api.routers.finance.ai_gateway.generate_text", return_value=_make_ai_result()):
            response = client.get("/finance/brief")
        assert response.status_code == 200

    def test_brief_shape(self):
        with patch("jarvis.api.routers.finance.ai_gateway.generate_text", return_value=_make_ai_result()):
            data = client.get("/finance/brief").json()
        assert "brief" in data
        assert isinstance(data["brief"], str)
        assert len(data["brief"]) > 0
        assert data["data_ready"] is True

    def test_requires_approval_always_true(self):
        with patch("jarvis.api.routers.finance.ai_gateway.generate_text", return_value=_make_ai_result()):
            data = client.get("/finance/brief").json()
        assert data["requires_approval"] is True

    def test_brief_is_deterministic_and_does_not_call_ai(self):
        with patch("jarvis.api.routers.finance.ai_gateway.generate_text") as gateway:
            data = client.get("/finance/brief").json()
        gateway.assert_not_called()
        assert "€115.38" in data["brief"]

    def test_brief_uses_executive_assistant_voice(self):
        with patch("jarvis.api.routers.finance.ai_gateway.generate_text", return_value=_make_ai_result(ok=False)):
            data = client.get("/finance/brief").json()

        assert data["brief"].startswith("Sir, ")
        assert "best current decision under your constitution" in data["brief"]
        assert "PHOENIX will wait for your approval" in data["brief"]
        assert "engine-selected allocation" not in data["brief"]
        assert data["brief"].endswith("Requires your approval before any action.")

    def test_brief_never_calls_the_gateway(self):
        with patch("jarvis.api.routers.finance.ai_gateway.generate_text") as gateway:
            client.get("/finance/brief")
        gateway.assert_not_called()

    def test_missing_portfolio_state_returns_503(self):
        def _raise():
            from fastapi import HTTPException
            raise HTTPException(status_code=503, detail="portfolio_state.json not found")

        app.dependency_overrides[dependencies.get_portfolio_state] = _raise
        try:
            with patch("jarvis.api.routers.finance.ai_gateway.generate_text", return_value=_make_ai_result()):
                response = client.get("/finance/brief")
            assert response.status_code == 503
        finally:
            app.dependency_overrides.clear()

    def test_anthropic_failure_returns_fallback_not_500(self):
        with patch("jarvis.api.routers.finance.ai_gateway.generate_text", return_value=_make_ai_result(ok=False)):
            response = client.get("/finance/brief")
        assert response.status_code == 200
        data = response.json()
        assert "Sir, I recommend" in data["brief"]
        assert "best current decision" in data["brief"]
        assert data["requires_approval"] is True

    def test_anthropic_failure_still_has_requires_approval(self):
        with patch("jarvis.api.routers.finance.ai_gateway.generate_text", return_value=_make_ai_result(ok=False)):
            data = client.get("/finance/brief").json()
        assert data["requires_approval"] is True

    def test_brief_rejects_ai_legacy_budget_amount(self):
        authority = {
            "data_ready": True,
            "blockers": [],
            "weekly_budget_eur": 86.67,
            "cash_capacity_eur": 260.0,
            "sustainable_capacity_eur": 260.0,
            "deployable_capacity_eur": 260.0,
            "remaining_weekly_windows": 3,
            "input_hash": "c" * 64,
            "policy_version": 2,
            "source": _READY_CASHFLOW_AUTHORITY["source"],
        }
        legacy_brief = (
            "Sir, I recommend deploying this week's €115.38 allocation: €46.15 to BTC. "
            "That is the best current decision under your constitution. "
            "No warnings are active, and PHOENIX will wait for your approval. "
            "Requires your approval before any action."
        )
        with patch(
            "jarvis.api.routers.budget._build_cashflow_authority", return_value=authority
        ), patch("jarvis.api.routers.finance.ai_gateway.generate_text") as gateway:
            data = client.get("/finance/brief").json()

        gateway.assert_not_called()
        assert "€86.67" in data["brief"]
        assert "€115.38" not in data["brief"]
        assert data["cashflow_authority"] == authority

    def test_brief_handles_closed_week_without_a_dual_lane_mandate(self):
        authority = {
            "data_ready": True,
            "blockers": [],
            "weekly_budget_eur": 86.67,
            "cash_capacity_eur": 260.0,
            "sustainable_capacity_eur": 260.0,
            "deployable_capacity_eur": 260.0,
            "remaining_weekly_windows": 3,
            "input_hash": "d" * 64,
            "policy_version": 2,
            "source": _READY_CASHFLOW_AUTHORITY["source"],
        }
        week_done = {
            "data_ready": True,
            "week_budget": 86.67,
            "recommendations": [],
            "warnings": [],
            "weekly_dual_lane_mandate": {},
            "portfolio_mode": "week_done",
            "portfolio_mode_details": {"mode": "week_done"},
            "requires_approval": False,
            "week_done": True,
            "week_closed": True,
            "cashflow_authority": authority,
        }
        with patch(
            "jarvis.api.routers.finance._build_finance_recommendation",
            return_value=week_done,
        ), patch(
            "jarvis.api.routers.finance.ai_gateway.generate_text",
            return_value=_make_ai_result(ok=False),
        ):
            data = client.get("/finance/brief").json()

        assert data["week_done"] is True
        assert data["week_closed"] is True
        assert data["requires_approval"] is False
        assert data["cashflow_authority"] == authority

    def test_brief_never_exposes_model_scratchpad(self):
        scratchpad = (
            'We need to produce max 4 sentences. Let\'s craft: "Buy BTC." '
            "Check sentence count: first sentence, second sentence."
        )
        with patch("jarvis.api.routers.finance.ai_gateway.generate_text", return_value=_make_ai_result(scratchpad)):
            data = client.get("/finance/brief").json()

        assert "We need to" not in data["brief"]
        assert "Let's craft" not in data["brief"]
        assert "sentence count" not in data["brief"].lower()
        assert data["brief"].endswith("Requires your approval before any action.")

    def test_stale_finance_data_pauses_brief_without_calling_ai(self):
        state = copy.deepcopy(engine.load_json(engine.DEFAULT_PORTFOLIO_STATE_PATH))
        state["as_of"] = date.today().isoformat()
        state["prices_refreshed_at"] = "2020-01-01T00:00:00+00:00"
        app.dependency_overrides[dependencies.get_portfolio_state] = lambda: state
        try:
            with patch.dict("os.environ", {"PHOENIX_FINANCE_FAIL_CLOSED": "true"}), patch(
                "jarvis.api.routers.finance.ai_gateway.generate_text"
            ) as gateway:
                data = client.get("/finance/brief").json()
        finally:
            app.dependency_overrides.clear()

        gateway.assert_not_called()
        assert data["data_ready"] is False
        assert data["requires_approval"] is False
        assert "paused" in data["brief"].lower()

    def test_brief_closes_an_approved_week_before_a_blocked_current_authority(self):
        approved = {
            "id": 17,
            "status": "approved",
            "user_action": "approved",
            "user_action_at": "2026-08-12T09:00:00+00:00",
        }
        blocked = {
            "data_ready": False,
            "blockers": ["Checking-account statement is stale."],
            "weekly_budget_eur": 0.0,
        }
        with patch(
            "jarvis.api.routers.budget._build_cashflow_authority", return_value=blocked
        ) as builder, patch(
            "jarvis.api.routers.finance.database.get_applied_transactions_for_iso_week",
            return_value=[],
        ), patch(
            "jarvis.api.routers.finance.database.get_latest_brief_for_week",
            return_value=approved,
        ), patch("jarvis.api.routers.finance.ai_gateway.generate_text") as gateway:
            data = client.get("/finance/brief").json()

        builder.assert_called_once()
        gateway.assert_not_called()
        assert data["week_closed"] is True
        assert data["week_done"] is False
        assert data["requires_approval"] is False
        assert data["recommendations"] == []
        assert data["cashflow_authority"] == blocked
