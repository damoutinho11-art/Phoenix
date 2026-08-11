from __future__ import annotations

from datetime import date, timedelta
from decimal import Decimal, ROUND_HALF_UP


def _cents(value: object) -> int:
    return int((Decimal(str(value or 0)) * 100).quantize(Decimal("1"), rounding=ROUND_HALF_UP))


def _euros(value: int) -> float:
    return float((Decimal(value) / 100).quantize(Decimal("0.01"), rounding=ROUND_HALF_UP))


def _next_income_date(today: date, cutoff: int) -> date:
    if today.day <= cutoff:
        return date(today.year, today.month, cutoff)
    first_next = (today.replace(day=28) + timedelta(days=4)).replace(day=1)
    return date(first_next.year, first_next.month, min(cutoff, 28))


def remaining_weekly_windows(today: date, cutoff: int, week_closed: bool) -> int:
    end = _next_income_date(today, cutoff)
    labels = set()
    cursor = today
    while cursor <= end:
        labels.add(cursor.isocalendar()[:2])
        cursor += timedelta(days=1)
    if week_closed:
        labels.discard(today.isocalendar()[:2])
    return max(1, len(labels))


def calculate_cashflow_authority(*, policy: dict, snapshot: dict, month_summary: dict, unpaid_bills_eur: float, today: date, week_closed: bool) -> dict:
    blockers: list[str] = []
    if snapshot.get("quality_status") != "reconciled":
        blockers.append("Checking-account statement is not reconciled.")
    try:
        statement_date = date.fromisoformat(str(snapshot.get("statement_end_date")))
    except ValueError:
        statement_date = None
        blockers.append("Checking-account statement date is missing or invalid.")
    if statement_date and (today - statement_date).days > 7:
        blockers.append("Checking-account statement is older than seven days.")
    required = ("emergency_fund_floor_eur", "emergency_fund_balance_eur", "checking_buffer_eur", "food_budget_eur", "essential_spending_ceiling_eur", "salary_day_cutoff")
    for key in required:
        if policy.get(key) is None:
            blockers.append(f"Cash-flow policy is missing {key}.")
    if blockers:
        return {"data_ready": False, "blockers": blockers, "weekly_budget_eur": 0.0}

    balance = _cents(snapshot["closing_balance_eur"])
    buffer_cents = _cents(policy["checking_buffer_eur"])
    food_spent = _cents((month_summary.get("by_category") or {}).get("Food & Groceries", {}).get("total", 0))
    food_remaining = max(0, _cents(policy["food_budget_eur"]) - food_spent)
    bills = _cents(unpaid_bills_eur)
    emergency_shortfall = max(0, _cents(policy["emergency_fund_floor_eur"]) - _cents(policy["emergency_fund_balance_eur"]))
    protected_food = _cents(policy["food_budget_eur"]) if emergency_shortfall else food_remaining
    cash_capacity = max(0, balance - buffer_cents - protected_food - bills - emergency_shortfall)
    projected_spending = _cents(month_summary.get("expenses_total")) + bills + food_remaining
    spending_guardrail = max(_cents(policy["essential_spending_ceiling_eur"]), projected_spending)
    sustainable = max(0, _cents(month_summary.get("income_total")) - spending_guardrail - _cents(month_summary.get("emergency_fund_total")) - _cents(month_summary.get("invested_total")) - emergency_shortfall)
    deployable = min(cash_capacity, sustainable)
    windows = remaining_weekly_windows(today, int(policy["salary_day_cutoff"]), week_closed)
    weekly = int((Decimal(deployable) / windows).quantize(Decimal("1"), rounding=ROUND_HALF_UP))
    return {
        "data_ready": deployable > 0,
        "blockers": [] if deployable > 0 else ["No deployable cash remains after protected reserves."],
        "cash_capacity_eur": _euros(cash_capacity),
        "sustainable_capacity_eur": _euros(sustainable),
        "deployable_capacity_eur": _euros(deployable),
        "weekly_budget_eur": _euros(weekly),
        "remaining_weekly_windows": windows,
        "protected_cash": {"checking_buffer_eur": _euros(buffer_cents), "food_eur": _euros(protected_food), "unpaid_bills_eur": _euros(bills), "emergency_shortfall_eur": _euros(emergency_shortfall)},
    }
