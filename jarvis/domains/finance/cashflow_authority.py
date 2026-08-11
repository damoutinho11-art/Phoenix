from __future__ import annotations

from calendar import monthrange
from datetime import date, timedelta
from decimal import Decimal, InvalidOperation, ROUND_HALF_UP


_MONETARY_POLICY_FIELDS = (
    "emergency_fund_floor_eur",
    "emergency_fund_balance_eur",
    "checking_buffer_eur",
    "food_budget_eur",
    "essential_spending_ceiling_eur",
)
_SUMMARY_MONETARY_FIELDS = (
    "income_total",
    "expenses_total",
    "invested_total",
    "emergency_fund_total",
)
# Keep cent quantization and every downstream JSON float safely representable.
_MAX_SAFE_EUROS = Decimal("100000000000000000000")
_APPROVED_POLICY_VERSION = 2


def _json_number(value: object, *, nonnegative: bool) -> bool:
    if type(value) not in (int, float):
        return False
    try:
        decimal_value = Decimal(str(value))
    except (InvalidOperation, TypeError, ValueError):
        return False
    if not decimal_value.is_finite() or abs(decimal_value) > _MAX_SAFE_EUROS:
        return False
    return not nonnegative or decimal_value >= 0


def valid_recurring_obligations(value: object) -> bool:
    if not isinstance(value, list):
        return False
    for obligation in value:
        if not isinstance(obligation, dict):
            return False
        if not _json_number(obligation.get("amount_eur"), nonnegative=True):
            return False
        contains = obligation.get("contains")
        if not isinstance(contains, list) or not contains:
            return False
        if any(not isinstance(token, str) or not token.strip() for token in contains):
            return False
    return True


def cashflow_authority_structural_blockers(
    *,
    policy: dict,
    snapshot: dict,
    month_summary: dict,
    unpaid_bills_eur: float | None,
    today: date,
    week_closed: bool,
) -> list[str]:
    blockers: list[str] = []
    if not isinstance(policy, dict):
        return ["Cash-flow policy is invalid."]
    if not isinstance(snapshot, dict):
        return ["Checking-account snapshot is invalid."]
    if not isinstance(month_summary, dict):
        return ["Cash-flow month summary is invalid."]
    if type(today) is not date:
        return ["Cash-flow decision date is invalid."]
    if type(week_closed) is not bool:
        return ["Cash-flow week_closed flag is invalid."]

    try:
        statement_date = date.fromisoformat(str(snapshot.get("statement_end_date")))
    except (TypeError, ValueError):
        blockers.append("Checking-account statement date is missing or invalid.")
    if snapshot.get("closing_balance_eur") is None:
        blockers.append("Checking-account snapshot is missing closing_balance_eur.")
    elif not _json_number(snapshot["closing_balance_eur"], nonnegative=False):
        blockers.append("Checking-account snapshot has invalid closing_balance_eur.")
    if unpaid_bills_eur is None:
        blockers.append("Cash-flow input is missing unpaid_bills_eur.")
    elif not _json_number(unpaid_bills_eur, nonnegative=True):
        blockers.append("Cash-flow input has invalid unpaid_bills_eur.")

    for key in _MONETARY_POLICY_FIELDS:
        if policy.get(key) is None:
            blockers.append(f"Cash-flow policy is missing {key}.")
        elif not _json_number(policy[key], nonnegative=True):
            blockers.append(f"Cash-flow policy has invalid {key}.")
    cutoff = policy.get("salary_day_cutoff")
    if cutoff is None:
        blockers.append("Cash-flow policy is missing salary_day_cutoff.")
    elif type(cutoff) is not int or not 1 <= cutoff <= 31:
        blockers.append("Cash-flow policy has invalid salary_day_cutoff.")
    version = policy.get("version", _APPROVED_POLICY_VERSION)
    if type(version) is not int or version != _APPROVED_POLICY_VERSION:
        blockers.append("Cash-flow policy has invalid version.")
    if not valid_recurring_obligations(policy.get("recurring_obligations")):
        blockers.append("Cash-flow policy has invalid recurring_obligations.")

    for key in _SUMMARY_MONETARY_FIELDS:
        if month_summary.get(key) is None:
            blockers.append(f"Cash-flow month summary is missing {key}.")
        elif not _json_number(month_summary[key], nonnegative=True):
            blockers.append(f"Cash-flow month summary has invalid {key}.")
    by_category = month_summary.get("by_category")
    if by_category is None:
        blockers.append("Cash-flow month summary is missing by_category.")
    elif not isinstance(by_category, dict):
        blockers.append("Cash-flow month summary has invalid by_category.")
    else:
        food = by_category.get("Food & Groceries")
        if food is not None and (
            not isinstance(food, dict)
            or not _json_number(food.get("total"), nonnegative=True)
        ):
            blockers.append("Cash-flow month summary has invalid Food & Groceries total.")
    return blockers


def cashflow_authority_input_blockers(
    *,
    policy: dict,
    snapshot: dict,
    month_summary: dict,
    unpaid_bills_eur: float | None,
    today: date,
    week_closed: bool,
) -> list[str]:
    blockers = cashflow_authority_structural_blockers(
        policy=policy,
        snapshot=snapshot,
        month_summary=month_summary,
        unpaid_bills_eur=unpaid_bills_eur,
        today=today,
        week_closed=week_closed,
    )
    if blockers:
        return blockers

    if snapshot.get("quality_status") != "reconciled":
        blockers.append("Checking-account statement is not reconciled.")
    statement_date = date.fromisoformat(str(snapshot["statement_end_date"]))
    if statement_date > today:
        blockers.append("Checking-account statement date is in the future.")
    elif (today - statement_date).days > 7:
        blockers.append("Checking-account statement is older than seven days.")
    return blockers


def _cents(value: object) -> int:
    return int((Decimal(str(value)) * 100).quantize(Decimal("1"), rounding=ROUND_HALF_UP))


def _euros(value: int) -> float:
    return float((Decimal(value) / 100).quantize(Decimal("0.01"), rounding=ROUND_HALF_UP))


def _next_income_date(today: date, cutoff: int) -> date:
    current_cutoff = min(cutoff, monthrange(today.year, today.month)[1])
    if today.day <= current_cutoff:
        return date(today.year, today.month, current_cutoff)
    first_next = (today.replace(day=28) + timedelta(days=4)).replace(day=1)
    next_cutoff = min(cutoff, monthrange(first_next.year, first_next.month)[1])
    return date(first_next.year, first_next.month, next_cutoff)


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


def calculate_cashflow_authority(*, policy: dict, snapshot: dict, month_summary: dict, unpaid_bills_eur: float | None, today: date, week_closed: bool) -> dict:
    blockers = cashflow_authority_input_blockers(
        policy=policy,
        snapshot=snapshot,
        month_summary=month_summary,
        unpaid_bills_eur=unpaid_bills_eur,
        today=today,
        week_closed=week_closed,
    )
    if blockers:
        return {"data_ready": False, "blockers": blockers, "weekly_budget_eur": 0.0}

    balance = _cents(snapshot["closing_balance_eur"])
    buffer_cents = _cents(policy["checking_buffer_eur"])
    food_spent = _cents((month_summary.get("by_category") or {}).get("Food & Groceries", {}).get("total", 0))
    food_remaining = max(0, _cents(policy["food_budget_eur"]) - food_spent)
    bills = _cents(unpaid_bills_eur)
    emergency_shortfall = max(0, _cents(policy["emergency_fund_floor_eur"]) - _cents(policy["emergency_fund_balance_eur"]))
    cash_capacity = max(0, balance - buffer_cents - food_remaining - bills - emergency_shortfall)
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
        "protected_cash": {"checking_buffer_eur": _euros(buffer_cents), "food_eur": _euros(food_remaining), "unpaid_bills_eur": _euros(bills), "emergency_shortfall_eur": _euros(emergency_shortfall)},
    }
