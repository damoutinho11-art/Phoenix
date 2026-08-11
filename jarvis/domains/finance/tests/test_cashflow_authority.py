from datetime import date

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
    assert result["cash_capacity_eur"] == 60.00


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
