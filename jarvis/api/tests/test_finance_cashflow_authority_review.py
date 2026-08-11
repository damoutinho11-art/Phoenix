"""Regression tests for cash-flow authority across Finance and chat."""

import copy
from datetime import date
from unittest.mock import patch

import pytest
from fastapi.testclient import TestClient

from jarvis.api.main import app
from jarvis.api.routers import chat, finance
from jarvis.domains.finance import engine


_READY_AUTHORITY = {
    "data_ready": True,
    "blockers": [],
    "weekly_budget_eur": 86.67,
    "deployable_capacity_eur": 260.0,
    "input_hash": "cashflow-review-proof",
}

client = TestClient(app)


@pytest.mark.parametrize(
    "authority",
    [
        {"data_ready": 1, "weekly_budget_eur": 86.67, "input_hash": "proof"},
        {"data_ready": True, "weekly_budget_eur": 0.0, "input_hash": "proof"},
        {"data_ready": True, "weekly_budget_eur": -1.0, "input_hash": "proof"},
        {"data_ready": True, "weekly_budget_eur": float("nan"), "input_hash": "proof"},
        {"data_ready": True, "weekly_budget_eur": float("inf"), "input_hash": "proof"},
        {"data_ready": True, "weekly_budget_eur": "86.67", "input_hash": "proof"},
        {"data_ready": True, "weekly_budget_eur": True, "input_hash": "proof"},
        {"data_ready": True, "weekly_budget_eur": 86.67},
        {"data_ready": True, "weekly_budget_eur": 10**21, "input_hash": "proof"},
    ],
)
def test_malformed_authority_is_sanitized_to_a_safe_block(authority: dict) -> None:
    with patch(
        "jarvis.api.routers.budget._build_cashflow_authority", return_value=authority
    ):
        result = finance._cashflow_authority_for_today(date(2026, 8, 12))

    assert result == {
        "data_ready": False,
        "blockers": ["Cash-flow authority payload is invalid."],
        "weekly_budget_eur": 0.0,
    }


@pytest.mark.parametrize(
    "authority",
    [
        {"data_ready": True, "weekly_budget_eur": float("nan"), "input_hash": "proof"},
        {"data_ready": True, "weekly_budget_eur": "86.67", "input_hash": "proof"},
        {"data_ready": True, "weekly_budget_eur": 0.0, "input_hash": "proof"},
        {"data_ready": True, "weekly_budget_eur": 86.67},
    ],
)
def test_recommendation_route_fails_closed_for_malformed_authority(authority: dict) -> None:
    with patch(
        "jarvis.api.routers.budget._build_cashflow_authority", return_value=authority
    ):
        data = client.get("/finance/recommendation").json()

    assert data["data_ready"] is False
    assert data["week_budget"] == 0.0
    assert data["recommendations"] == []
    assert data["cashflow_authority"] == {
        "data_ready": False,
        "blockers": ["Cash-flow authority payload is invalid."],
        "weekly_budget_eur": 0.0,
    }


def test_research_autopilot_uses_authoritative_overlay_without_mutating_state() -> None:
    portfolio_state = engine.load_json(engine.DEFAULT_PORTFOLIO_STATE_PATH)
    before = copy.deepcopy(portfolio_state)
    constitution = engine.load_json(engine.DEFAULT_CONSTITUTION_PATH)
    profile = engine.load_json(engine.DEFAULT_PROFILE_PATH)
    captured = []

    def allocate(*args, **kwargs):
        captured.append(copy.deepcopy(args[1]))
        return {
            "approval_ticket": {
                "executable_allocation": {},
                "weekly_dual_lane_mandate": {},
            }
        }

    with patch(
        "jarvis.api.routers.budget._build_cashflow_authority",
        return_value=_READY_AUTHORITY,
    ), patch("jarvis.api.routers.finance.detect_market_regime", return_value="risk_on"), patch(
        "jarvis.api.routers.finance.engine.allocate_weekly_budget", side_effect=allocate
    ):
        result = finance._run_research_autopilot_internal(
            constitution, portfolio_state, profile
        )

    assert captured[0]["weekly_investment_budget"] == 86.67
    assert portfolio_state == before
    assert result["cashflow_authority"] == _READY_AUTHORITY


def test_research_autopilot_blocks_without_allocating_when_authority_is_blocked() -> None:
    portfolio_state = engine.load_json(engine.DEFAULT_PORTFOLIO_STATE_PATH)
    constitution = engine.load_json(engine.DEFAULT_CONSTITUTION_PATH)
    profile = engine.load_json(engine.DEFAULT_PROFILE_PATH)
    authority = {
        "data_ready": False,
        "blockers": ["Checking-account statement is stale."],
        "weekly_budget_eur": 0.0,
    }

    with patch(
        "jarvis.api.routers.budget._build_cashflow_authority", return_value=authority
    ), patch("jarvis.api.routers.finance.engine.allocate_weekly_budget") as allocate:
        result = finance._run_research_autopilot_internal(
            constitution, portfolio_state, profile
        )

    allocate.assert_not_called()
    assert result["legs"] == []
    assert result["data_ready"] is False
    assert result["cashflow_authority"] == authority


def test_chat_finance_context_uses_authority_not_legacy_budget() -> None:
    portfolio_state = engine.load_json(engine.DEFAULT_PORTFOLIO_STATE_PATH)
    before = copy.deepcopy(portfolio_state)
    captured = []

    def allocate(*args, **kwargs):
        captured.append(copy.deepcopy(args[1]))
        return {
            "approval_ticket": {
                "weekly_budget": 86.67,
                "executable_allocation": {},
                "weekly_dual_lane_mandate": {
                    "crypto_lane": {"status": "DEFERRED"},
                    "stock_fund_etf_lane": {"status": "DEFERRED"},
                },
                "warnings": [],
            },
            "portfolio_mode": {"mode": "normal"},
            "dynamic_context": {},
        }

    with patch("jarvis.api.routers.chat.database.load_portfolio_state", return_value=portfolio_state), patch(
        "jarvis.api.routers.budget._build_cashflow_authority", return_value=_READY_AUTHORITY
    ), patch("jarvis.domains.finance.market_data.detect_market_regime", return_value="risk_on"), patch(
        "jarvis.api.routers.chat.finance_engine.allocate_weekly_budget", side_effect=allocate
    ):
        context, _ = chat._build_finance_context()

    assert captured[0]["weekly_investment_budget"] == 86.67
    assert portfolio_state == before
    assert "Weekly budget: €86.67" in context
    assert "€115.38" not in context


def test_chat_finance_context_explains_blocked_authority() -> None:
    authority = {
        "data_ready": False,
        "blockers": ["Checking-account statement is stale."],
        "weekly_budget_eur": 0.0,
    }
    with patch(
        "jarvis.api.routers.budget._build_cashflow_authority", return_value=authority
    ), patch("jarvis.api.routers.chat.finance_engine.allocate_weekly_budget") as allocate:
        context, requires_approval = chat._build_finance_context()

    allocate.assert_not_called()
    assert requires_approval is True
    assert "stale" in context.lower()
    assert "Weekly budget: €115.38" not in context


def test_chat_finance_context_preserves_authority_shape_when_state_is_unavailable() -> None:
    with patch(
        "jarvis.api.routers.chat.finance_engine.load_json",
        side_effect=FileNotFoundError,
    ):
        context, requires_approval, authority = chat._build_finance_context(
            include_authority=True
        )

    assert "unavailable" in context.lower()
    assert requires_approval is True
    assert authority is None
