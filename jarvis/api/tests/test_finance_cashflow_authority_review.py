"""Regression tests for cash-flow authority across Finance and chat."""

import copy
from datetime import date, timedelta
from unittest.mock import MagicMock, patch

import pytest
from fastapi.testclient import TestClient

from jarvis.api.main import app
from jarvis.api.ai_gateway import AIResult
from jarvis.api.routers import chat, finance
from jarvis.core import clock
from jarvis.domains.finance import engine


# The authority gate only accepts a statement dated within the last 7 days, so
# these are relative to today. A literal date silently ages out of the window
# and turns a "ready" fixture into a stale one, which fails these tests for a
# reason that has nothing to do with what they assert.
_FRESH_STATEMENT_DATE = (clock.today() - timedelta(days=1)).isoformat()
_FUTURE_STATEMENT_DATE = (clock.today() + timedelta(days=2)).isoformat()
_STALE_STATEMENT_DATE = (clock.today() - timedelta(days=8)).isoformat()
# The decision date the sanitizer is asked about must sit inside the same
# window, or a fresh statement reads as dated in the future.
_DECISION_DATE = clock.today()

_READY_AUTHORITY = {
    "data_ready": True,
    "blockers": [],
    "weekly_budget_eur": 86.67,
    "cash_capacity_eur": 260.0,
    "sustainable_capacity_eur": 260.0,
    "deployable_capacity_eur": 260.0,
    "remaining_weekly_windows": 3,
    "input_hash": "a" * 64,
    "policy_version": 2,
    "source": {
        "parser": "lhv_pdf",
        "quality_status": "reconciled",
        "receipt_verified": True,
        "balance_difference_eur": 0.0,
        "statement_end_date": _FRESH_STATEMENT_DATE,
        "filename_hash": "0" * 64,
    },
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
        {**_READY_AUTHORITY, "input_hash": "not-a-hex-hash"},
        {**_READY_AUTHORITY, "blockers": ["unexpected blocker"]},
        {**_READY_AUTHORITY, "policy_version": True},
        {**_READY_AUTHORITY, "policy_version": 1},
        {key: value for key, value in _READY_AUTHORITY.items() if key != "source"},
        {**_READY_AUTHORITY, "source": {"parser": "lhv_pdf"}},
        {**_READY_AUTHORITY, "source": {key: value for key, value in _READY_AUTHORITY["source"].items() if key != "filename_hash"}},
        {**_READY_AUTHORITY, "source": {**_READY_AUTHORITY["source"], "receipt_verified": 1}},
        {**_READY_AUTHORITY, "source": {**_READY_AUTHORITY["source"], "statement_end_date": _FUTURE_STATEMENT_DATE}},
        {**_READY_AUTHORITY, "source": {**_READY_AUTHORITY["source"], "statement_end_date": _STALE_STATEMENT_DATE}},
        {key: value for key, value in _READY_AUTHORITY.items() if key != "sustainable_capacity_eur"},
        {**_READY_AUTHORITY, "sustainable_capacity_eur": "260"},
        {**_READY_AUTHORITY, "weekly_budget_eur": 260.01},
        {**_READY_AUTHORITY, "weekly_budget_eur": 260.0},
        {**_READY_AUTHORITY, "deployable_capacity_eur": 259.99},
        {**_READY_AUTHORITY, "remaining_weekly_windows": True},
        {**_READY_AUTHORITY, "remaining_weekly_windows": 0},
        {**_READY_AUTHORITY, "weekly_budget_eur": 86.674},
        {**_READY_AUTHORITY, "cash_capacity_eur": 260.004},
        {**_READY_AUTHORITY, "sustainable_capacity_eur": 260.004},
        {**_READY_AUTHORITY, "deployable_capacity_eur": 260.004},
        {**_READY_AUTHORITY, "protected_cash": {"food_eur": 0.004}},
    ],
)
def test_malformed_authority_is_sanitized_to_a_safe_block(authority: dict) -> None:
    with patch(
        "jarvis.api.routers.budget._build_cashflow_authority", return_value=authority
    ):
        result = finance._cashflow_authority_for_today(_DECISION_DATE)

    assert result == {
        "data_ready": False,
        "blockers": ["Cash-flow authority payload is invalid."],
        "weekly_budget_eur": 0.0,
    }


def test_ready_authority_uses_calculator_cent_rounding_for_three_windows() -> None:
    with patch(
        "jarvis.api.routers.budget._build_cashflow_authority",
        return_value=_READY_AUTHORITY,
    ):
        result = finance._cashflow_authority_for_today(_DECISION_DATE)

    assert result == _READY_AUTHORITY
    assert result is not _READY_AUTHORITY
    assert all(
        isinstance(result[field], float)
        for field in (
            "weekly_budget_eur",
            "cash_capacity_eur",
            "sustainable_capacity_eur",
            "deployable_capacity_eur",
        )
    )


@pytest.mark.parametrize(
    ("opening_balance_eur", "data_ready"),
    [(None, True), (1000.0, True), (1000.001, False)],
)
def test_finance_sanitizer_agrees_with_optional_opening_balance_contract(
    opening_balance_eur: float | None, data_ready: bool
) -> None:
    authority = {
        **_READY_AUTHORITY,
        "source": {**_READY_AUTHORITY["source"], "opening_balance_eur": opening_balance_eur},
    }
    with patch(
        "jarvis.api.routers.budget._build_cashflow_authority", return_value=authority
    ):
        result = finance._cashflow_authority_for_today(_DECISION_DATE)

    assert result["data_ready"] is data_ready
    if data_ready:
        assert result["source"]["opening_balance_eur"] == opening_balance_eur
    else:
        assert result["weekly_budget_eur"] == 0.0


@pytest.mark.parametrize(
    ("opening_balance_eur", "valid"),
    [(None, True), (1000.0, True), (1000.001, False), (float("inf"), False)],
)
def test_blocked_authority_validates_optional_opening_balance_provenance(
    opening_balance_eur: float | None, valid: bool
) -> None:
    authority = {
        "data_ready": False,
        "blockers": ["Checking-account statement is stale."],
        "weekly_budget_eur": 0.0,
        "source": {"opening_balance_eur": opening_balance_eur},
    }
    with patch(
        "jarvis.api.routers.budget._build_cashflow_authority", return_value=authority
    ):
        result = finance._cashflow_authority_for_today(_DECISION_DATE)

    if valid:
        assert result == authority
    else:
        assert result == {
            "data_ready": False,
            "blockers": ["Cash-flow authority payload is invalid."],
            "weekly_budget_eur": 0.0,
        }


def test_finance_agrees_with_producer_subcent_policy_block() -> None:
    authority = {
        "data_ready": False,
        "blockers": ["Cash-flow policy has invalid checking_buffer_eur."],
        "weekly_budget_eur": 0.0,
    }
    with patch(
        "jarvis.api.routers.budget._build_cashflow_authority", return_value=authority
    ):
        sanitized = finance._cashflow_authority_for_today(_DECISION_DATE)
        data = client.get("/finance/recommendation").json()

    assert sanitized == authority
    assert data["data_ready"] is False
    assert data["week_budget"] == 0.0
    assert data["recommendations"] == []
    assert data["cashflow_authority"] == authority


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


def test_executed_week_remains_closed_before_a_blocked_current_authority() -> None:
    authority = {
        "data_ready": False,
        "blockers": ["Checking-account statement is stale."],
        "weekly_budget_eur": 0.0,
    }
    constitution = engine.load_json(engine.DEFAULT_CONSTITUTION_PATH)
    profile = engine.load_json(engine.DEFAULT_PROFILE_PATH)
    portfolio_state = engine.load_json(engine.DEFAULT_PORTFOLIO_STATE_PATH)
    transactions = [{"asset": "btc", "amount_eur": 20.0}]
    with patch(
        "jarvis.api.routers.budget._build_cashflow_authority", return_value=authority
    ) as builder, patch(
        "jarvis.api.routers.finance.database.get_applied_transactions_for_iso_week",
        return_value=transactions,
    ), patch(
        "jarvis.api.routers.finance.database.get_latest_brief_for_week", return_value=None
    ):
        recommendation = finance._build_finance_recommendation(
            constitution, portfolio_state, profile, persist_brief=False
        )

    builder.assert_called_once_with(
        clock.today().strftime("%Y-%m"), week_closed=True, today=clock.today()
    )
    assert recommendation["week_done"] is True
    assert recommendation["week_closed"] is True
    assert recommendation["week_budget"] == 0.0
    assert recommendation["recommendations"] == []
    assert recommendation["cashflow_authority"]["data_ready"] is False
    assert recommendation["cashflow_authority"]["weekly_budget_eur"] == 0.0
    assert authority["blockers"][0] in recommendation["cashflow_authority"]["blockers"]
    assert finance._build_manual_buy_checklist(recommendation)["checklist_status"] == "WEEK_CLOSED"
    coverage = finance._build_data_coverage_from_recommendation(
        recommendation, {"sleeves": {}}
    )
    assert coverage["verdict"] == "WEEK_CLOSED"
    assert coverage["status"] == "WEEK_CLOSED"
    assert authority["blockers"][0] in coverage["blockers"]
    assert "Current investment week is closed." in coverage["blockers"]


def test_closed_recommendation_uses_one_captured_sunday_decision_date() -> None:
    sunday = date(2026, 8, 16)
    authority = {
        "data_ready": False,
        "blockers": ["Checking-account statement is stale."],
        "weekly_budget_eur": 0.0,
    }
    constitution = engine.load_json(engine.DEFAULT_CONSTITUTION_PATH)
    profile = engine.load_json(engine.DEFAULT_PROFILE_PATH)
    portfolio_state = engine.load_json(engine.DEFAULT_PORTFOLIO_STATE_PATH)

    with patch("jarvis.api.routers.finance.clock.today", side_effect=[sunday, date(2026, 8, 17)]) as today, patch(
        "jarvis.api.routers.budget._build_cashflow_authority", return_value=authority
    ), patch(
        "jarvis.api.routers.finance.database.get_applied_transactions_for_iso_week",
        return_value=[{"asset": "btc", "amount_eur": 20.0}],
    ), patch(
        "jarvis.api.routers.finance.database.get_latest_brief_for_week", return_value=None
    ):
        recommendation = finance._build_finance_recommendation(
            constitution, portfolio_state, profile, persist_brief=False
        )

    assert today.call_count == 1
    assert recommendation["week_label"] == "W33 2026"
    assert recommendation["next_window"] == "W34 2026"


@pytest.mark.parametrize(
    ("applied_transactions", "latest_brief", "week_closed"),
    [
        ([{"asset": "btc", "amount_eur": 20.0}], None, True),
        ([], {"id": 1, "status": "approved", "user_action_at": "2026-08-12"}, True),
        ([], None, False),
    ],
)
def test_recommendation_passes_lifecycle_closure_once_to_authority_builder(
    applied_transactions: list[dict], latest_brief: dict | None, week_closed: bool
) -> None:
    blocked = {
        "data_ready": False,
        "blockers": ["Checking-account statement is stale."],
        "weekly_budget_eur": 0.0,
    }
    constitution = engine.load_json(engine.DEFAULT_CONSTITUTION_PATH)
    profile = engine.load_json(engine.DEFAULT_PROFILE_PATH)
    portfolio_state = engine.load_json(engine.DEFAULT_PORTFOLIO_STATE_PATH)

    with patch(
        "jarvis.api.routers.budget._build_cashflow_authority", return_value=blocked
    ) as builder, patch(
        "jarvis.api.routers.finance.database.get_applied_transactions_for_iso_week",
        return_value=applied_transactions,
    ), patch(
        "jarvis.api.routers.finance.database.get_latest_brief_for_week",
        return_value=latest_brief,
    ):
        recommendation = finance._build_finance_recommendation(
            constitution, portfolio_state, profile, persist_brief=False
        )

    builder.assert_called_once_with(
        clock.today().strftime("%Y-%m"), week_closed=week_closed, today=clock.today()
    )
    assert recommendation["week_closed"] is week_closed


def test_blocked_authority_blocks_checklist_and_data_coverage() -> None:
    authority = {
        "data_ready": False,
        "blockers": ["Checking-account statement is stale."],
        "weekly_budget_eur": 0.0,
    }
    recommendation = finance._paused_finance_recommendation(
        {"weekly_investment_budget": 0.0},
        "W33 2026",
        authority["blockers"],
        regime=None,
        cashflow_authority=authority,
    )
    coverage = finance._build_data_coverage_from_recommendation(
        recommendation, {"sleeves": {}}
    )

    assert finance._build_manual_buy_checklist(recommendation)["checklist_status"] == "AUTHORITY_BLOCKED"
    assert coverage["verdict"] == "AUTHORITY_BLOCKED"
    assert coverage["status"] == "AUTHORITY_BLOCKED"
    assert coverage["blockers"] == authority["blockers"]


def test_approved_week_coverage_remains_closed_when_current_authority_is_blocked() -> None:
    authority = {
        "data_ready": False,
        "blockers": ["Checking-account statement is stale."],
        "weekly_budget_eur": 0.0,
    }
    recommendation = {
        "week_closed": True,
        "week_done": False,
        "recommendations": [],
        "cashflow_authority": authority,
    }

    coverage = finance._build_data_coverage_from_recommendation(
        recommendation, {"sleeves": {}}
    )

    assert finance._build_manual_buy_checklist(recommendation)["checklist_status"] == "WEEK_CLOSED"
    assert coverage["verdict"] == "WEEK_CLOSED"
    assert coverage["status"] == "WEEK_CLOSED"
    assert coverage["blockers"] == authority["blockers"]


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
        "jarvis.api.routers.budget._build_cashflow_authority", return_value=_READY_AUTHORITY
    ), patch(
        "jarvis.api.routers.chat.finance_engine.load_json",
        side_effect=FileNotFoundError,
    ):
        context, requires_approval, authority, as_of = chat._build_finance_context(
            include_authority=True
        )

    assert "unavailable" in context.lower()
    assert requires_approval is True
    assert authority["data_ready"] is False
    assert authority["weekly_budget_eur"] == 0.0
    assert as_of == clock.today()


@pytest.mark.parametrize(
    "message",
    ["What should I buy this week?", "How is the home plan looking?"],
)
def test_chat_blocked_finance_never_calls_ai_or_suggests_legacy_amount(message: str) -> None:
    authority = {
        "data_ready": False,
        "blockers": ["Checking-account statement is stale."],
        "weekly_budget_eur": 0.0,
    }
    with patch(
        "jarvis.api.routers.budget._build_cashflow_authority", return_value=authority
    ), patch("jarvis.api.routers.chat.ai_gateway.generate_text") as generate:
        data = client.post("/jarvis/chat", json={"domain": "finance", "message": message}).json()

    generate.assert_not_called()
    assert "stale" in data["response"].lower()
    assert "115.38" not in data["response"]
    assert "€" not in data["response"]
    assert data["cashflow_authority"] == authority
    assert data["week_closed"] is False
    assert data["week_budget"] == 0.0
    assert data["recommendations"] == []


def test_chat_ready_finance_allocation_is_deterministic_and_authoritative() -> None:
    with patch(
        "jarvis.api.routers.budget._build_cashflow_authority",
        return_value=_READY_AUTHORITY,
    ), patch(
        "jarvis.domains.finance.market_data.detect_market_regime", return_value="risk_on"
    ), patch(
        "jarvis.api.routers.chat.ai_gateway.generate_text"
    ) as generate:
        data = client.post(
            "/jarvis/chat", json={"domain": "finance", "message": "What should I buy this week?"}
        ).json()

    generate.assert_not_called()
    assert "€86.67" in data["response"]
    assert "€115.38" not in data["response"]
    assert data["cashflow_authority"] == _READY_AUTHORITY
    assert data["week_closed"] is False
    assert data["week_budget"] == 86.67
    assert isinstance(data["recommendations"], list)


@pytest.mark.parametrize(
    ("applied_transactions", "latest_brief"),
    [
        ([{"asset": "btc", "amount_eur": 20.0}], None),
        ([], {"id": 1, "status": "approved", "user_action_at": "2026-08-12"}),
        ([], {"id": 2, "status": "executed", "user_action_at": "2026-08-12"}),
    ],
)
def test_closed_chat_builds_closed_authority_once_without_an_open_budget(
    applied_transactions: list[dict], latest_brief: dict | None
) -> None:
    with patch(
        "jarvis.api.routers.budget._build_cashflow_authority",
        return_value=_READY_AUTHORITY,
    ) as builder, patch(
        "jarvis.api.routers.finance.database.get_applied_transactions_for_iso_week",
        return_value=applied_transactions,
    ), patch(
        "jarvis.api.routers.finance.database.get_latest_brief_for_week",
        return_value=latest_brief,
    ):
        data = client.post(
            "/jarvis/chat", json={"domain": "finance", "message": "What should I buy?"}
        ).json()

    builder.assert_called_once_with(
        clock.today().strftime("%Y-%m"), week_closed=True, today=clock.today()
    )
    assert "€" not in data["response"]
    assert data["cashflow_authority"]["data_ready"] is False
    assert data["cashflow_authority"]["weekly_budget_eur"] == 0.0
    assert data["week_closed"] is True
    assert data["week_budget"] == 0.0
    assert data["recommendations"] == []


def test_open_chat_builds_open_authority_once() -> None:
    with patch(
        "jarvis.api.routers.budget._build_cashflow_authority",
        return_value=_READY_AUTHORITY,
    ) as builder, patch(
        "jarvis.api.routers.finance.database.get_applied_transactions_for_iso_week",
        return_value=[],
    ), patch(
        "jarvis.api.routers.finance.database.get_latest_brief_for_week", return_value=None
    ):
        client.post(
            "/jarvis/chat", json={"domain": "finance", "message": "What should I buy?"}
        )

    builder.assert_called_once_with(
        clock.today().strftime("%Y-%m"), week_closed=False, today=clock.today()
    )


@pytest.mark.parametrize(
    ("applied_transactions", "latest_brief"),
    [
        ([{"asset": "btc", "amount_eur": 20.0}], None),
        ([], {"id": 1, "status": "approved", "user_action_at": "2026-08-12"}),
        ([], {"id": 2, "status": "executed", "user_action_at": "2026-08-12"}),
    ],
)
def test_closed_research_autopilot_skips_new_allocation(
    applied_transactions: list[dict], latest_brief: dict | None
) -> None:
    constitution = engine.load_json(engine.DEFAULT_CONSTITUTION_PATH)
    profile = engine.load_json(engine.DEFAULT_PROFILE_PATH)
    portfolio_state = engine.load_json(engine.DEFAULT_PORTFOLIO_STATE_PATH)
    with patch(
        "jarvis.api.routers.budget._build_cashflow_authority",
        return_value=_READY_AUTHORITY,
    ) as builder, patch(
        "jarvis.api.routers.finance.database.get_applied_transactions_for_iso_week",
        return_value=applied_transactions,
    ), patch(
        "jarvis.api.routers.finance.database.get_latest_brief_for_week",
        return_value=latest_brief,
    ), patch("jarvis.api.routers.finance.engine.allocate_weekly_budget") as allocate:
        data = finance._run_research_autopilot_internal(
            constitution, portfolio_state, profile
        )

    builder.assert_called_once_with(
        clock.today().strftime("%Y-%m"), week_closed=True, today=clock.today()
    )
    allocate.assert_not_called()
    assert data["legs"] == []
    assert data["week_closed"] is True
    assert data["data_ready"] is False
    assert data["week_budget"] == 0.0
    assert data["recommendations"] == []
    assert data["cashflow_authority"]["data_ready"] is False
    assert data["cashflow_authority"]["weekly_budget_eur"] == 0.0


def _configured_ai_status() -> MagicMock:
    status = MagicMock()
    status.configured = True
    status.supports_web_search_tool = False
    status.as_dict.return_value = {"configured": True, "provider": "test"}
    return status


def test_nutrition_dinner_buy_query_does_not_enter_finance_safety_path() -> None:
    with patch("jarvis.api.routers.chat.ai_gateway.status", return_value=_configured_ai_status()), patch(
        "jarvis.api.routers.chat.ai_gateway.generate_text",
        return_value=AIResult(text="Dinner response", provider="test", model="test", ok=True),
    ) as generate:
        response = client.post(
            "/jarvis/chat", json={"domain": "nutrition", "message": "What should I buy for dinner?"}
        )

    assert response.status_code == 200
    data = response.json()
    generate.assert_called_once()
    assert data["response"] == "Dinner response"
    assert "cash-flow authority is blocked" not in data["response"].lower()
    assert "cashflow_authority" not in data


@pytest.mark.parametrize("substance", ["MOTS-C", "ipamorelin", "BPC-157", "BPC 157"])
def test_nutrition_chat_blocks_research_peptide_dosing_without_calling_ai(substance: str) -> None:
    with patch("jarvis.api.routers.chat.ai_gateway.generate_text") as generate:
        response = client.post(
            "/jarvis/chat",
            json={"domain": "nutrition", "message": f"Give me a human dosing protocol for {substance}."},
        )

    assert response.status_code == 200
    generate.assert_not_called()
    text = response.json()["response"].lower()
    assert "blocked" in text
    assert "dosing" in text


def test_nutrition_chat_blocks_peptide_dosing_followup_from_history() -> None:
    with patch("jarvis.api.routers.chat.ai_gateway.generate_text") as generate:
        response = client.post(
            "/jarvis/chat",
            json={
                "domain": "nutrition",
                "message": "What human dose should I use?",
                "history": [{"role": "user", "content": "I have BPC-157 nasal spray."}],
            },
        )
    assert response.status_code == 200
    generate.assert_not_called()
    assert "blocked" in response.json()["response"].lower()


def test_nutrition_chat_blocks_injection_quantity_followup_from_history() -> None:
    with patch("jarvis.api.routers.chat.ai_gateway.generate_text") as generate:
        response = client.post(
            "/jarvis/chat",
            json={"domain": "nutrition", "message": "How many micrograms should I inject?", "history": [{"role": "user", "content": "I have BPC-157."}]},
        )
    generate.assert_not_called()
    assert "blocked" in response.json()["response"].lower()


@pytest.mark.parametrize("message", ["What schedule should I follow?", "What amount should I use?"])
def test_nutrition_chat_blocks_generic_operational_peptide_followups(message: str) -> None:
    with patch("jarvis.api.routers.chat.ai_gateway.generate_text") as generate:
        response = client.post("/jarvis/chat", json={"domain": "nutrition", "message": message, "history": [{"role": "user", "content": "I have BPC-157."}]})
    generate.assert_not_called()
    assert "blocked" in response.json()["response"].lower()


@pytest.mark.parametrize("message", ["How much should I inject with food?", "What dose should I use with meals?", "What dosage should I follow?", "What dosage should I use with meals?"])
def test_strong_peptide_dosing_terms_override_nutrition_subjects(message: str) -> None:
    with patch("jarvis.api.routers.chat.ai_gateway.generate_text") as generate:
        response = client.post("/jarvis/chat", json={"domain": "nutrition", "message": message, "history": [{"role": "user", "content": "I have BPC-157."}]})
    generate.assert_not_called()
    assert "blocked" in response.json()["response"].lower()


@pytest.mark.parametrize("message", ["How many calories do I have left today?", "What is my daily protein target?"])
def test_nutrition_chat_allows_macro_questions_after_prior_peptide_mention(message: str) -> None:
    with patch("jarvis.api.routers.chat.ai_gateway.status", return_value=_configured_ai_status()), patch(
        "jarvis.api.routers.chat.ai_gateway.generate_text", return_value=AIResult(text="Macro response", provider="test", model="test", ok=True),
    ) as generate:
        response = client.post("/jarvis/chat", json={"domain": "nutrition", "message": message, "history": [{"role": "user", "content": "I mentioned BPC-157 earlier."}]})
    generate.assert_called_once()
    assert response.json()["response"] == "Macro response"


def test_prior_peptide_mention_does_not_block_unrelated_nutrition_chat() -> None:
    with patch("jarvis.api.routers.chat.ai_gateway.status", return_value=_configured_ai_status()), patch(
        "jarvis.api.routers.chat.ai_gateway.generate_text",
        return_value=AIResult(text="Meal response", provider="test", model="test", ok=True),
    ) as generate:
        response = client.post(
            "/jarvis/chat",
            json={"domain": "nutrition", "message": "What should I eat for dinner?", "history": [{"role": "user", "content": "I mentioned BPC-157 earlier."}]},
        )
    assert response.json()["response"] == "Meal response"
    generate.assert_called_once()


def test_home_generic_shopping_does_not_load_or_report_finance_authority() -> None:
    with patch("jarvis.api.routers.budget._build_cashflow_authority") as build_authority, patch(
        "jarvis.api.routers.chat.ai_gateway.status", return_value=_configured_ai_status()
    ), patch(
        "jarvis.api.routers.chat.ai_gateway.generate_text",
        return_value=AIResult(text="Shopping response", provider="test", model="test", ok=True),
    ):
        response = client.post(
            "/jarvis/chat", json={"domain": "home", "message": "What should I buy at the supermarket?"}
        )

    assert response.status_code == 200
    build_authority.assert_not_called()
    data = response.json()
    assert data["response"] == "Shopping response"
    assert "cashflow_authority" not in data


def test_home_investment_intent_uses_blocked_finance_authority() -> None:
    authority = {
        "data_ready": False,
        "blockers": ["Checking-account statement is stale."],
        "weekly_budget_eur": 0.0,
    }
    with patch(
        "jarvis.api.routers.budget._build_cashflow_authority", return_value=authority
    ), patch("jarvis.api.routers.chat.ai_gateway.generate_text") as generate:
        response = client.post(
            "/jarvis/chat", json={"domain": "home", "message": "What should I invest this week?"}
        )

    assert response.status_code == 200
    generate.assert_not_called()
    assert "stale" in response.json()["response"].lower()
    assert response.json()["cashflow_authority"] == authority


@pytest.mark.parametrize(
    "message",
    [
        "Should I buy stocks this week?",
        "Should I buy ETH?",
        "Can I put 100 euros into the market?",
        "Should I invest in bitcoin?",
        "Should I buy an ETF?",
        "Should I deploy capital into bonds?",
        "Should I buy Nasdaq shares?",
        "Should I add crypto to my portfolio?",
        "Should I sell ETH?",
        "What should I do with my stocks?",
        "I am selling BTC. Any advice?",
        "Should I hold crypto?",
        "Review my ETF allocation.",
        "Can you advise on rebalancing shares?",
        "What should I do with ETH?",
        "Plan my ETF buys this week.",
        "Schedule a stock purchase this week.",
        "Move 100 euros into BTC.",
        "Please review my ETF allocation in a table.",
        "I moved 100 euros into BTC.",
        "Should I rebalance my ETH allocation?",
        "I allocated cash to an ETF.",
        "I invested in bitcoin this week.",
        "I bought BTC this week.",
        "I sold ETH this week.",
        "I held shares this week.",
    ],
)
def test_home_financial_action_intent_is_authority_gated(message: str) -> None:
    authority = {
        "data_ready": False,
        "blockers": ["Checking-account statement is stale."],
        "weekly_budget_eur": 0.0,
    }
    with patch(
        "jarvis.api.routers.budget._build_cashflow_authority", return_value=authority
    ), patch("jarvis.api.routers.chat.ai_gateway.generate_text") as generate:
        data = client.post("/jarvis/chat", json={"domain": "home", "message": message}).json()

    generate.assert_not_called()
    assert "stale" in data["response"].lower()
    assert data["cashflow_authority"] == authority


@pytest.mark.parametrize(
    "message",
    [
        "Show me my design portfolio",
        "Build a portfolio website",
        "Should I invest in a new dinner table?",
        "What should I buy for dinner?",
        "Build a shopping list",
        "Which furniture should I buy?",
        "Find stock photos for my website",
        "Show me stock images from the concert",
        "Do you have stock footage for this trailer?",
        "Review my portfolio website",
        "Should I buy stock photography for the site?",
        "Find stock media for my design site",
        "Should I buy stock for my furniture shop?",
        "Should I buy stocks for my furniture shop?",
        "Should I buy stock inventory for my shop?",
        "Should I invest euros in website design?",
    ],
)
def test_home_nonfinancial_portfolio_words_do_not_trigger_authority(message: str) -> None:
    with patch("jarvis.api.routers.budget._build_cashflow_authority") as build_authority, patch(
        "jarvis.api.routers.chat.ai_gateway.status", return_value=_configured_ai_status()
    ), patch(
        "jarvis.api.routers.chat.ai_gateway.generate_text",
        return_value=AIResult(text="Normal response", provider="test", model="test", ok=True),
    ) as generate:
        data = client.post("/jarvis/chat", json={"domain": "home", "message": message}).json()

    build_authority.assert_not_called()
    generate.assert_called_once()
    assert data["response"] == "Normal response"
    assert "cashflow_authority" not in data


@pytest.mark.parametrize(
    "message",
    [
        "Should I buy stock in Acme Furniture Company?",
        "Should I buy shares in Acme Furniture Company?",
    ],
)
def test_home_security_stock_in_furniture_company_stays_finance(message: str) -> None:
    authority = {
        "data_ready": False,
        "blockers": ["Checking-account statement is stale."],
        "weekly_budget_eur": 0.0,
    }
    with patch(
        "jarvis.api.routers.budget._build_cashflow_authority", return_value=authority
    ), patch("jarvis.api.routers.chat.ai_gateway.generate_text") as generate:
        data = client.post(
            "/jarvis/chat",
            json={"domain": "home", "message": message},
        ).json()

    generate.assert_not_called()
    assert data["cashflow_authority"] == authority


@pytest.mark.parametrize(
    ("lifecycle", "expected_closed"),
    [
        ({"week_closed": True, "applied_transactions": [{"asset": "btc"}], "latest_brief": None}, True),
        ({"week_closed": False, "applied_transactions": [], "latest_brief": None}, False),
    ],
)
def test_finance_context_preserves_lifecycle_when_state_is_unavailable(
    lifecycle: dict, expected_closed: bool
) -> None:
    decision_today = _DECISION_DATE
    with patch("jarvis.api.routers.chat.current_week_lifecycle", return_value=lifecycle), patch(
        "jarvis.api.routers.budget._build_cashflow_authority", return_value=_READY_AUTHORITY
    ), patch(
        "jarvis.api.routers.chat.finance_engine.load_json", side_effect=FileNotFoundError
    ):
        context, requires_approval, authority, as_of = chat._build_finance_context(
            include_authority=True, decision_today=decision_today
        )

    assert as_of == decision_today
    assert authority is not None
    assert authority["data_ready"] is False
    assert authority["weekly_budget_eur"] == 0.0
    if expected_closed:
        assert "closed" in context.lower()
        assert requires_approval is False
    else:
        assert "unavailable" in context.lower()
        assert requires_approval is True


def test_finance_chat_captures_one_decision_date_for_context_and_response() -> None:
    decision_today = date(2026, 8, 16)
    with patch("jarvis.api.routers.chat.clock.today", side_effect=[decision_today, date(2026, 8, 17)]) as today, patch(
        "jarvis.api.routers.budget._build_cashflow_authority", return_value=_READY_AUTHORITY
    ), patch(
        "jarvis.domains.finance.market_data.detect_market_regime", return_value="risk_on"
    ):
        data = client.post(
            "/jarvis/chat", json={"domain": "finance", "message": "What should I buy this week?"}
        ).json()

    assert today.call_count == 1
    assert data["as_of"] == decision_today.isoformat()
    assert decision_today.isoformat() in data["context_summary"]
