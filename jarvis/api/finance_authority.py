"""API adapter for the domain-owned cash-flow authority contract."""

from datetime import date

from jarvis.api.routers import budget as budget_router
from jarvis.domains.finance.cashflow_authority import (
    authoritative_portfolio_state,
    blocked_cashflow_authority,
    closed_cashflow_authority,
    validate_cashflow_authority,
)


def build_cashflow_authority(today: date, *, week_closed: bool = False) -> dict:
    """Build and validate one authority using a single captured decision date."""
    if type(today) is not date or type(week_closed) is not bool:
        return blocked_cashflow_authority()
    try:
        authority = budget_router._build_cashflow_authority(
            today.strftime("%Y-%m"), week_closed=week_closed, today=today
        )
    except Exception:
        return blocked_cashflow_authority("Cash-flow authority is unavailable.")
    authority = validate_cashflow_authority(authority, today=today)
    return closed_cashflow_authority(authority) if week_closed else authority
