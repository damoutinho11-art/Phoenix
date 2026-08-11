from datetime import date

import pytest

from jarvis.domains.finance.cashflow_authority import calculate_cashflow_authority


POLICY = {
    "version": 2,
    "emergency_fund_floor_eur": 5000,
    "emergency_fund_balance_eur": 5000,
    "checking_buffer_eur": 300,
    "food_budget_eur": 200,
    "essential_spending_ceiling_eur": 950,
    "salary_day_cutoff": 25,
}

VALID_SNAPSHOT = {
    "closing_balance_eur": 760,
    "statement_end_date": "2026-08-11",
    "quality_status": "reconciled",
}
VALID_MONTH_SUMMARY = {
    "income_total": 3006.84,
    "expenses_total": 622.32,
    "invested_total": 0,
    "emergency_fund_total": 1392,
    "by_category": {},
}


def test_760_cash_protects_food_and_persistent_buffer() -> None:
    result = calculate_cashflow_authority(
        policy=POLICY,
        snapshot={"closing_balance_eur": 760, "statement_end_date": "2026-08-11", "quality_status": "reconciled"},
        month_summary={"income_total": 3006.84, "expenses_total": 622.32, "invested_total": 0, "emergency_fund_total": 1392, "by_category": {}},
        unpaid_bills_eur=0,
        today=date(2026, 8, 11),
        week_closed=False,
    )

    assert result["cash_capacity_eur"] == 260.00
    assert result["deployable_capacity_eur"] == 260.00
    assert result["remaining_weekly_windows"] == 3
    assert result["weekly_budget_eur"] == 86.67
    assert result["protected_cash"] == {"checking_buffer_eur": 300.0, "food_eur": 200.0, "unpaid_bills_eur": 0.0, "emergency_shortfall_eur": 0.0}


def test_existing_300_buffer_is_not_added_again_each_month() -> None:
    result = calculate_cashflow_authority(
        policy=POLICY,
        snapshot={"closing_balance_eur": 500, "statement_end_date": "2026-08-11", "quality_status": "reconciled"},
        month_summary={"income_total": 3006.84, "expenses_total": 950, "invested_total": 0, "emergency_fund_total": 0, "by_category": {"Food & Groceries": {"total": 200}}},
        unpaid_bills_eur=0,
        today=date(2026, 8, 11),
        week_closed=False,
    )

    assert result["cash_capacity_eur"] == 200.00


def test_emergency_shortfall_is_reserved_before_investing() -> None:
    policy = {**POLICY, "emergency_fund_balance_eur": 4800}
    result = calculate_cashflow_authority(
        policy=policy,
        snapshot={"closing_balance_eur": 760, "statement_end_date": "2026-08-11", "quality_status": "reconciled"},
        month_summary={"income_total": 3006.84, "expenses_total": 950, "invested_total": 0, "emergency_fund_total": 0, "by_category": {"Food & Groceries": {"total": 200}}},
        unpaid_bills_eur=0,
        today=date(2026, 8, 11),
        week_closed=False,
    )

    assert result["protected_cash"]["emergency_shortfall_eur"] == 200.00
    assert result["cash_capacity_eur"] == 260.00


def test_statement_older_than_seven_days_blocks() -> None:
    result = calculate_cashflow_authority(
        policy=POLICY,
        snapshot={"closing_balance_eur": 760, "statement_end_date": "2026-08-03", "quality_status": "reconciled"},
        month_summary={"income_total": 3006.84, "expenses_total": 622.32, "invested_total": 0, "emergency_fund_total": 1392, "by_category": {}},
        unpaid_bills_eur=0,
        today=date(2026, 8, 11),
        week_closed=False,
    )

    assert result["data_ready"] is False
    assert "older than seven days" in result["blockers"][0]


def test_actual_spending_above_ceiling_lowers_sustainable_capacity() -> None:
    result = calculate_cashflow_authority(
        policy=POLICY,
        snapshot={"closing_balance_eur": 2000, "statement_end_date": "2026-08-11", "quality_status": "reconciled"},
        month_summary={"income_total": 3000, "expenses_total": 1200, "invested_total": 0, "emergency_fund_total": 0, "by_category": {"Food & Groceries": {"total": 200}}},
        unpaid_bills_eur=0,
        today=date(2026, 8, 11),
        week_closed=False,
    )

    assert result["sustainable_capacity_eur"] == 1800.00


def test_closed_current_week_counts_only_future_windows() -> None:
    result = calculate_cashflow_authority(
        policy=POLICY,
        snapshot={"closing_balance_eur": 760, "statement_end_date": "2026-08-11", "quality_status": "reconciled"},
        month_summary={"income_total": 3006.84, "expenses_total": 622.32, "invested_total": 0, "emergency_fund_total": 1392, "by_category": {}},
        unpaid_bills_eur=0,
        today=date(2026, 8, 11),
        week_closed=True,
    )

    assert result["remaining_weekly_windows"] == 2
    assert result["weekly_budget_eur"] == 130.00


@pytest.mark.parametrize(
    "field",
    [
        "income_total",
        "expenses_total",
        "invested_total",
        "emergency_fund_total",
        "by_category",
    ],
)
@pytest.mark.parametrize("invalid_value", [pytest.param("missing", id="missing"), pytest.param(None, id="none")])
def test_missing_or_none_month_summary_field_blocks(field: str, invalid_value: object) -> None:
    month_summary = dict(VALID_MONTH_SUMMARY)
    if invalid_value == "missing":
        month_summary.pop(field)
    else:
        month_summary[field] = None

    result = calculate_cashflow_authority(
        policy=POLICY,
        snapshot=VALID_SNAPSHOT,
        month_summary=month_summary,
        unpaid_bills_eur=0,
        today=date(2026, 8, 11),
        week_closed=False,
    )

    assert result["data_ready"] is False
    assert result["weekly_budget_eur"] == 0.0
    assert f"Cash-flow month summary is missing {field}." in result["blockers"]


@pytest.mark.parametrize("invalid_value", [pytest.param("missing", id="missing"), pytest.param(None, id="none")])
def test_missing_or_none_closing_balance_blocks(invalid_value: object) -> None:
    snapshot = dict(VALID_SNAPSHOT)
    if invalid_value == "missing":
        snapshot.pop("closing_balance_eur")
    else:
        snapshot["closing_balance_eur"] = None

    result = calculate_cashflow_authority(
        policy=POLICY,
        snapshot=snapshot,
        month_summary=VALID_MONTH_SUMMARY,
        unpaid_bills_eur=0,
        today=date(2026, 8, 11),
        week_closed=False,
    )

    assert result["data_ready"] is False
    assert result["weekly_budget_eur"] == 0.0
    assert "Checking-account snapshot is missing closing_balance_eur." in result["blockers"]


def test_none_unpaid_bills_blocks() -> None:
    result = calculate_cashflow_authority(
        policy=POLICY,
        snapshot=VALID_SNAPSHOT,
        month_summary=VALID_MONTH_SUMMARY,
        unpaid_bills_eur=None,
        today=date(2026, 8, 11),
        week_closed=False,
    )

    assert result["data_ready"] is False
    assert result["weekly_budget_eur"] == 0.0
    assert "Cash-flow input is missing unpaid_bills_eur." in result["blockers"]


@pytest.mark.parametrize(
    ("field", "invalid_value"),
    [
        ("checking_buffer_eur", True),
        ("checking_buffer_eur", "300"),
        ("checking_buffer_eur", float("nan")),
        ("checking_buffer_eur", float("inf")),
        ("checking_buffer_eur", 1e28),
        ("salary_day_cutoff", True),
        ("salary_day_cutoff", "25"),
        ("salary_day_cutoff", 0),
        ("salary_day_cutoff", 32),
    ],
)
def test_invalid_required_policy_value_blocks_without_calculation(
    field: str, invalid_value: object
) -> None:
    result = calculate_cashflow_authority(
        policy={**POLICY, field: invalid_value},
        snapshot=VALID_SNAPSHOT,
        month_summary=VALID_MONTH_SUMMARY,
        unpaid_bills_eur=0,
        today=date(2026, 8, 11),
        week_closed=False,
    )

    assert result["data_ready"] is False
    assert result["weekly_budget_eur"] == 0.0
    assert f"Cash-flow policy has invalid {field}." in result["blockers"]


def test_salary_cutoff_31_uses_last_day_of_short_month() -> None:
    result = calculate_cashflow_authority(
        policy={**POLICY, "salary_day_cutoff": 31},
        snapshot={
            "closing_balance_eur": 760,
            "statement_end_date": "2026-02-20",
            "quality_status": "reconciled",
        },
        month_summary=VALID_MONTH_SUMMARY,
        unpaid_bills_eur=0,
        today=date(2026, 2, 20),
        week_closed=False,
    )

    assert result["data_ready"] is True
