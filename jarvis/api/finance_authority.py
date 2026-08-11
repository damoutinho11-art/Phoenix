"""Validated cash-flow authority for every Finance allocation surface."""

import copy
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


def validate_cashflow_authority(authority: object) -> dict:
    """Return a safe authority object, never an untrusted malformed payload."""
    if not isinstance(authority, dict) or type(authority.get("data_ready")) is not bool:
        return blocked_cashflow_authority(_INVALID_PAYLOAD_BLOCKER)

    if authority["data_ready"]:
        if not _valid_number(authority.get("weekly_budget_eur"), positive=True):
            return blocked_cashflow_authority(_INVALID_PAYLOAD_BLOCKER)
        input_hash = authority.get("input_hash")
        if not isinstance(input_hash, str) or not input_hash.strip():
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
