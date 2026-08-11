"""Shared current-week Finance closure snapshot."""

from datetime import date

from jarvis.data import database


_CLOSED_BRIEF_STATES = {"approved", "executed"}


def current_week_lifecycle(today: date) -> dict:
    """Read current closure facts once for every authority-consuming path."""
    iso = today.isocalendar()
    week_label = f"W{iso[1]} {iso[0]}"
    applied_transactions = database.get_applied_transactions_for_iso_week(week_label)
    latest_brief = database.get_latest_brief_for_week(week_label, "finance")
    brief_state = str((latest_brief or {}).get("status") or "").lower()
    brief_action = str((latest_brief or {}).get("user_action") or "").lower()
    return {
        "week_label": week_label,
        "applied_transactions": applied_transactions,
        "latest_brief": latest_brief,
        "week_closed": bool(applied_transactions)
        or brief_state in _CLOSED_BRIEF_STATES
        or brief_action in _CLOSED_BRIEF_STATES,
    }
