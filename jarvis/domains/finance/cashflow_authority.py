from __future__ import annotations

import copy
import re
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
_INVALID_PAYLOAD_BLOCKER = "Cash-flow authority payload is invalid."
_UNAVAILABLE_BLOCKER = "Cash-flow authority is unavailable."
_READY_MONETARY_FIELDS = (
    "weekly_budget_eur",
    "cash_capacity_eur",
    "sustainable_capacity_eur",
    "deployable_capacity_eur",
)


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


def _is_exact_cent(value: object) -> bool:
    """Accept monetary evidence only when it is already expressed in cents."""
    if type(value) not in (int, float):
        return False
    try:
        cents_value = Decimal(str(value)) * 100
    except (InvalidOperation, TypeError, ValueError):
        return False
    return cents_value == cents_value.to_integral_value(rounding=ROUND_HALF_UP)


def _nested_monetary_values_are_exact(value: object) -> bool:
    """Reject any carried EUR evidence that would need hidden rounding."""
    if isinstance(value, dict):
        for key, nested_value in value.items():
            if not isinstance(key, str):
                return False
            if key.endswith("_eur") and (
                not _json_number(nested_value, nonnegative=False)
                or not _is_exact_cent(nested_value)
            ):
                return False
            if isinstance(nested_value, (dict, list)) and not _nested_monetary_values_are_exact(
                nested_value
            ):
                return False
    elif isinstance(value, list):
        return all(_nested_monetary_values_are_exact(item) for item in value)
    return True


def _normalize_nested_monetary_values(value: object) -> object:
    if isinstance(value, dict):
        return {
            key: (
                _euros(_cents(nested_value))
                if isinstance(key, str) and key.endswith("_eur")
                else _normalize_nested_monetary_values(nested_value)
            )
            for key, nested_value in value.items()
        }
    if isinstance(value, list):
        return [_normalize_nested_monetary_values(item) for item in value]
    return value


def blocked_cashflow_authority(blocker: str = _INVALID_PAYLOAD_BLOCKER) -> dict:
    """Return the deterministic, zero-budget authority failure shape."""
    return {
        "data_ready": False,
        "blockers": [blocker],
        "weekly_budget_eur": 0.0,
    }


def closed_cashflow_authority(authority: object) -> dict:
    """Project a lifecycle-closed week without exposing a future allocation budget."""
    if not isinstance(authority, dict):
        authority = blocked_cashflow_authority()
    closed = copy.deepcopy(authority)
    blockers = list(closed.get("blockers") or [])
    closure_blocker = "Current investment week is closed."
    if closure_blocker not in blockers:
        blockers.append(closure_blocker)
    closed["data_ready"] = False
    closed["blockers"] = blockers
    closed["weekly_budget_eur"] = 0.0
    return closed


def _valid_ready_provenance(authority: dict, *, today: date) -> bool:
    source = authority.get("source")
    if authority.get("blockers") != []:
        return False
    if not isinstance(authority.get("input_hash"), str) or not re.fullmatch(
        r"[0-9a-f]{64}", authority["input_hash"]
    ):
        return False
    if type(authority.get("policy_version")) is not int or authority["policy_version"] != _APPROVED_POLICY_VERSION:
        return False
    if not isinstance(source, dict):
        return False
    if source.get("parser") != "lhv_pdf" or source.get("quality_status") != "reconciled":
        return False
    if not isinstance(source.get("filename_hash"), str) or not re.fullmatch(
        r"[0-9a-fA-F]{64}", source["filename_hash"]
    ):
        return False
    if source.get("receipt_verified") is not True:
        return False
    if not _valid_exact_zero(source.get("balance_difference_eur")):
        return False
    statement_end_date = source.get("statement_end_date")
    if not isinstance(statement_end_date, str):
        return False
    try:
        statement_date = date.fromisoformat(statement_end_date)
    except ValueError:
        return False
    if statement_date.isoformat() != statement_end_date:
        return False
    if statement_date > today or (today - statement_date).days > 7:
        return False

    capacities = (
        authority.get("cash_capacity_eur"),
        authority.get("sustainable_capacity_eur"),
        authority.get("deployable_capacity_eur"),
    )
    if not all(
        _valid_nonnegative_json_number(value) and _is_exact_cent(value)
        for value in capacities
    ):
        return False
    windows = authority.get("remaining_weekly_windows")
    if type(windows) is not int or windows < 1:
        return False
    cash_capacity, sustainable_capacity, deployable_capacity = (
        _cents(value) for value in capacities
    )
    if deployable_capacity != min(cash_capacity, sustainable_capacity):
        return False
    expected_weekly = int(
        (Decimal(deployable_capacity) / windows).quantize(
            Decimal("1"), rounding=ROUND_HALF_UP
        )
    )
    return (
        _is_exact_cent(authority["weekly_budget_eur"])
        and _cents(authority["weekly_budget_eur"]) == expected_weekly
    )


def _valid_nonnegative_json_number(value: object) -> bool:
    return _json_number(value, nonnegative=True)


def _valid_positive_json_number(value: object) -> bool:
    if not _json_number(value, nonnegative=True):
        return False
    return Decimal(str(value)) > 0


def _valid_exact_zero(value: object) -> bool:
    return _json_number(value, nonnegative=False) and Decimal(str(value)) == 0


def validate_cashflow_authority(authority: object, *, today: date) -> dict:
    """Sanitize untrusted authority data before any allocation can consume it."""
    if type(today) is not date or not isinstance(authority, dict):
        return blocked_cashflow_authority()
    if type(authority.get("data_ready")) is not bool:
        return blocked_cashflow_authority()
    if authority["data_ready"]:
        if (
            not _valid_positive_json_number(authority.get("weekly_budget_eur"))
            or not _valid_ready_provenance(authority, today=today)
            or not _nested_monetary_values_are_exact(authority)
        ):
            return blocked_cashflow_authority()
        normalized = _normalize_nested_monetary_values(copy.deepcopy(authority))
        for field in _READY_MONETARY_FIELDS:
            normalized[field] = _euros(_cents(normalized[field]))
        return normalized

    blockers = authority.get("blockers")
    if (
        not isinstance(blockers, list)
        or not blockers
        or any(not isinstance(blocker, str) or not blocker.strip() for blocker in blockers)
        or not _valid_exact_zero(authority.get("weekly_budget_eur"))
    ):
        return blocked_cashflow_authority()
    return copy.deepcopy(authority)


def authoritative_portfolio_state(portfolio_state: dict, authority: dict) -> dict:
    """Copy state and inject the only permitted weekly allocation budget."""
    state = copy.deepcopy(portfolio_state)
    state["weekly_investment_budget"] = (
        authority["weekly_budget_eur"] if authority.get("data_ready") is True else 0.0
    )
    return state


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
    if policy.get("recurring_obligations") is None:
        blockers.append("Cash-flow policy is missing recurring_obligations.")
    elif not valid_recurring_obligations(policy["recurring_obligations"]):
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
    weekly_is_positive = weekly > 0
    return {
        "data_ready": weekly_is_positive,
        "blockers": (
            []
            if weekly_is_positive
            else [
                "Available deployable cash rounds below €0.01 per weekly window."
                if deployable > 0
                else "No deployable cash remains after protected reserves."
            ]
        ),
        "cash_capacity_eur": _euros(cash_capacity),
        "sustainable_capacity_eur": _euros(sustainable),
        "deployable_capacity_eur": _euros(deployable),
        "weekly_budget_eur": _euros(weekly) if weekly_is_positive else 0.0,
        "remaining_weekly_windows": windows,
        "protected_cash": {"checking_buffer_eur": _euros(buffer_cents), "food_eur": _euros(food_remaining), "unpaid_bills_eur": _euros(bills), "emergency_shortfall_eur": _euros(emergency_shortfall)},
    }
