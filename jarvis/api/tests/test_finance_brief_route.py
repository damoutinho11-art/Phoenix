"""Tests for GET /finance/brief — mocks the Anthropic API call."""

from unittest.mock import MagicMock, patch

from fastapi.testclient import TestClient

from jarvis.api import dependencies
from jarvis.api.main import app

client = TestClient(app)

_MOCK_BRIEF = (
    "Your portfolio holds €1170.44 across 8 sleeves in transition_mode. "
    "The crypto lane targets BTC at €46.15 via lhv_crypto, "
    "and the ETF lane targets quality_etf at €69.23 via lightyear. "
    "Requires your approval before any action."
)

_MOCK_ANTHROPIC_RESPONSE = MagicMock()
_MOCK_ANTHROPIC_RESPONSE.content = [MagicMock(text=_MOCK_BRIEF)]


def _make_mock_anthropic():
    mock_client = MagicMock()
    mock_client.messages.create.return_value = _MOCK_ANTHROPIC_RESPONSE
    return mock_client


class TestFinanceBriefRoute:
    def test_brief_returns_200(self):
        with patch("jarvis.api.routers.finance.anthropic.Anthropic", return_value=_make_mock_anthropic()):
            response = client.get("/finance/brief")
        assert response.status_code == 200

    def test_brief_shape(self):
        with patch("jarvis.api.routers.finance.anthropic.Anthropic", return_value=_make_mock_anthropic()):
            data = client.get("/finance/brief").json()
        assert "brief" in data
        assert isinstance(data["brief"], str)
        assert len(data["brief"]) > 0

    def test_requires_approval_always_true(self):
        with patch("jarvis.api.routers.finance.anthropic.Anthropic", return_value=_make_mock_anthropic()):
            data = client.get("/finance/brief").json()
        assert data["requires_approval"] is True

    def test_brief_contains_mock_text(self):
        with patch("jarvis.api.routers.finance.anthropic.Anthropic", return_value=_make_mock_anthropic()):
            data = client.get("/finance/brief").json()
        assert data["brief"] == _MOCK_BRIEF

    def test_correct_model_string_used(self):
        mock_anthropic = _make_mock_anthropic()
        with patch("jarvis.api.routers.finance.anthropic.Anthropic", return_value=mock_anthropic):
            client.get("/finance/brief")
        call_kwargs = mock_anthropic.messages.create.call_args
        assert call_kwargs.kwargs["model"] == "claude-sonnet-4-6"

    def test_missing_portfolio_state_returns_503(self):
        def _raise():
            from fastapi import HTTPException
            raise HTTPException(status_code=503, detail="portfolio_state.json not found")

        app.dependency_overrides[dependencies.get_portfolio_state] = _raise
        try:
            with patch("jarvis.api.routers.finance.anthropic.Anthropic", return_value=_make_mock_anthropic()):
                response = client.get("/finance/brief")
            assert response.status_code == 503
        finally:
            app.dependency_overrides.clear()

    def test_anthropic_failure_returns_fallback_not_500(self):
        mock_client = MagicMock()
        mock_client.messages.create.side_effect = Exception("network error")
        with patch("jarvis.api.routers.finance.anthropic.Anthropic", return_value=mock_client):
            response = client.get("/finance/brief")
        assert response.status_code == 200
        data = response.json()
        assert "Unable to generate brief" in data["brief"]
        assert data["requires_approval"] is True

    def test_anthropic_failure_still_has_requires_approval(self):
        mock_client = MagicMock()
        mock_client.messages.create.side_effect = RuntimeError("timeout")
        with patch("jarvis.api.routers.finance.anthropic.Anthropic", return_value=mock_client):
            data = client.get("/finance/brief").json()
        assert data["requires_approval"] is True
