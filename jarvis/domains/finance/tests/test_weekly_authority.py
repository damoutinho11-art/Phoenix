"""Authority-gated public weekly Finance operations."""

import copy
from datetime import date
from unittest.mock import patch

from jarvis.domains.finance import engine


_TODAY = date(2026, 8, 12)
_AUTHORITY = {
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
        "statement_end_date": "2026-08-11",
        "filename_hash": "0" * 64,
    },
}


def test_weekly_result_without_authority_fails_closed() -> None:
    result = engine.build_weekly_result(today=_TODAY)

    assert result["data_ready"] is False
    assert result["weekly_budget_cents"] == 0
    assert "approval_ticket" not in result
    assert "€115.38" not in engine.build_weekly_report(today=_TODAY)


def test_weekly_result_uses_validated_authority_without_mutating_raw_state() -> None:
    before = copy.deepcopy(engine.load_json(engine.DEFAULT_PORTFOLIO_STATE_PATH))

    result = engine.build_weekly_result(
        cashflow_authority=_AUTHORITY,
        today=_TODAY,
    )

    assert result["data_ready"] is True
    assert result["weekly_budget_cents"] == 8667
    assert result["approval_ticket"]["weekly_budget"] == 86.67
    assert engine.load_json(engine.DEFAULT_PORTFOLIO_STATE_PATH) == before


def test_weekly_result_rejects_malformed_authority_capacity() -> None:
    malformed = {**_AUTHORITY, "sustainable_capacity_eur": "260"}

    result = engine.build_weekly_result(
        cashflow_authority=malformed,
        today=_TODAY,
    )

    assert result["data_ready"] is False
    assert result["weekly_budget_cents"] == 0
    assert "approval_ticket" not in result


def test_self_check_uses_an_explicit_authority_not_the_legacy_state_budget() -> None:
    original_allocate = engine.allocate_weekly_budget

    def assert_authoritative_allocation(constitution: dict, state: dict, **kwargs):
        assert state["weekly_investment_budget"] == 86.67
        return original_allocate(constitution, state, **kwargs)

    with patch.object(engine, "allocate_weekly_budget", side_effect=assert_authoritative_allocation):
        engine.self_check()
