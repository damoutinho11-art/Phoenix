"""Tests for GET /finance/brief — mocks the provider-agnostic AI gateway."""

from unittest.mock import MagicMock, patch

from fastapi.testclient import TestClient

from jarvis.api import dependencies
from jarvis.api.main import app
from jarvis.api.ai_gateway import AIResult

client = TestClient(app)

_MOCK_BRIEF = (
    "Your portfolio holds €1170.44 across 8 sleeves in transition_mode. "
    "The crypto lane targets BTC at €46.15 via lhv_crypto, "
    "and the ETF lane targets quality_etf at €69.23 via lightyear. "
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

    def test_requires_approval_always_true(self):
        with patch("jarvis.api.routers.finance.ai_gateway.generate_text", return_value=_make_ai_result()):
            data = client.get("/finance/brief").json()
        assert data["requires_approval"] is True

    def test_brief_contains_mock_text(self):
        with patch("jarvis.api.routers.finance.ai_gateway.generate_text", return_value=_make_ai_result()):
            data = client.get("/finance/brief").json()
        assert data["brief"] == _MOCK_BRIEF

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
        assert "AI brief unavailable" in data["brief"]
        assert data["requires_approval"] is True

    def test_anthropic_failure_still_has_requires_approval(self):
        with patch("jarvis.api.routers.finance.ai_gateway.generate_text", return_value=_make_ai_result(ok=False)):
            data = client.get("/finance/brief").json()
        assert data["requires_approval"] is True
