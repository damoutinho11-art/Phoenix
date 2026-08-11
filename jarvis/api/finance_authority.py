"""Validated cash-flow authority for every Finance allocation surface."""

import copy
import re
from datetime import date
from decimal import Decimal, InvalidOperation

from jarvis.api.routers import budget as budget_router

_MAX_SAFE_EUROS = Decimal("100000000000000000000")
_INVALID_PAYLOAD_BLOCKER = "Cash-flow authority payload is invalid."
_UNAVAILABLE_BLOCKER = "Cash-flow authority is unavailable."


def blocked_cashflow_authority(blocker: str) -> dict:
    return {
        "data_ready": False,
        "blockers": [blocker],
        "weekly_budget_eur": 0.0,
    }


def _valid_number(value: object, *, positive: bool) -> bool:
    if type(value) not in (int, float):
        return False
    try:
        numeric = Decimal(str(value))
    except (InvalidOperation, TypeError, ValueError):
        return False
    if not numeric.is_finite() or abs(numeric) > _MAX_SAFE_EUROS:
        return False
    return numeric > 0 if positive else numeric == 0


def _valid_nonnegative_number(value: object) -> bool:
    if type(value) not in (int, float):
        return False
    try:
        numeric = Decimal(str(value))
    except (InvalidOperation, TypeError, ValueError):
        return False
    return numeric.is_finite() and Decimal(0) <= numeric <= _MAX_SAFE_EUROS


def _valid_ready_provenance(authority: dict) -> bool:
    source = authority.get("source")
    if authority.get("blockers") != []:
        return False
    if not isinstance(authority.get("input_hash"), str) or not re.fullmatch(
        r"[0-9a-f]{64}", authority["input_hash"]
    ):
        return False
    if type(authority.get("policy_version")) is not int or authority["policy_version"] != 2:
        return False
    if not isinstance(source, dict):
        return False
    if source.get("parser") != "lhv_pdf" or source.get("quality_status") != "reconciled":
        return False
    if not isinstance(source.get("filename_hash"), str) or not re.fullmatch(
        r"[0-9a-fA-F]{64}", source["filename_hash"]
    ):
        return False
    receipt_verified = source.get("receipt_verified")
    if receipt_verified is not True and not (type(receipt_verified) is int and receipt_verified == 1):
        return False
    if not _valid_number(source.get("balance_difference_eur"), positive=False):
        return False
    statement_end_date = source.get("statement_end_date")
    if not isinstance(statement_end_date, str):
        return False
    try:
        if date.fromisoformat(statement_end_date).isoformat() != statement_end_date:
            return False
    except ValueError:
        return False
    cash_capacity = authority.get("cash_capacity_eur")
    deployable = authority.get("deployable_capacity_eur")
    weekly = authority.get("weekly_budget_eur")
    if not all(_valid_nonnegative_number(value) for value in (cash_capacity, deployable)):
        return False
    return Decimal(str(weekly)) <= Decimal(str(deployable)) <= Decimal(str(cash_capacity))


def validate_cashflow_authority(authority: object) -> dict:
    """Return a safe authority object, never an untrusted malformed payload."""
    if not isinstance(authority, dict) or type(authority.get("data_ready")) is not bool:
        return blocked_cashflow_authority(_INVALID_PAYLOAD_BLOCKER)

    if authority["data_ready"]:
        if not _valid_number(authority.get("weekly_budget_eur"), positive=True) or not _valid_ready_provenance(authority):
            return blocked_cashflow_authority(_INVALID_PAYLOAD_BLOCKER)
        return authority

    blockers = authority.get("blockers")
    if (
        not isinstance(blockers, list)
        or not blockers
        or any(not isinstance(blocker, str) or not blocker.strip() for blocker in blockers)
        or not _valid_number(authority.get("weekly_budget_eur"), positive=False)
    ):
        return blocked_cashflow_authority(_INVALID_PAYLOAD_BLOCKER)
    return authority


def build_cashflow_authority(today: date) -> dict:
    try:
        authority = budget_router._build_cashflow_authority(today.strftime("%Y-%m"))
    except Exception:
        return blocked_cashflow_authority(_UNAVAILABLE_BLOCKER)
    return validate_cashflow_authority(authority)


def authoritative_portfolio_state(portfolio_state: dict, authority: dict) -> dict:
    """Copy state and inject the only permitted weekly allocation budget."""
    state = copy.deepcopy(portfolio_state)
    state["weekly_investment_budget"] = (
        authority["weekly_budget_eur"] if authority.get("data_ready") is True else 0.0
    )
    return state
