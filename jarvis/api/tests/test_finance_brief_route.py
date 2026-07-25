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

    def test_brief_contains_mock_text(self):
        with patch("jarvis.api.routers.finance.ai_gateway.generate_text", return_value=_make_ai_result()):
            data = client.get("/finance/brief").json()
        assert data["brief"] == _MOCK_BRIEF

    def test_brief_uses_executive_assistant_voice(self):
        with patch("jarvis.api.routers.finance.ai_gateway.generate_text", return_value=_make_ai_result(ok=False)):
            data = client.get("/finance/brief").json()

        assert data["brief"].startswith("Sir, ")
        assert "best current decision under your constitution" in data["brief"]
        assert "PHOENIX will wait for your approval" in data["brief"]
        assert "engine-selected allocation" not in data["brief"]
        assert data["brief"].endswith("Requires your approval before any action.")

    def test_gateway_called_with_expected_boundary(self):
        with patch("jarvis.api.routers.finance.ai_gateway.generate_text", return_value=_make_ai_result()) as gateway:
            client.get("/finance/brief")
        assert gateway.call_args.kwargs["max_tokens"] == 256
        assert gateway.call_args.kwargs["system_prompt"]

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
