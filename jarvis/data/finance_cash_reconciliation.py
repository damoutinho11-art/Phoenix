"""Conservative cash reconciliation for recorded manual purchases."""

from datetime import date, datetime
import sqlite3

from jarvis.data import database


def cash_reconciliation_blockers(statement_end_date: str, today: date) -> list[str]:
    """Require a statement strictly later than each nonvoid purchase.

    Applied status does not establish whether a manual purchase spent cash.
    Same-day evidence has no reliable ordering. Refreshed statement balances
    account for covered purchases; never estimate an extra cash deduction.
    """
    try:
        statement_date = date.fromisoformat(statement_end_date)
        if statement_date.isoformat() != statement_end_date or statement_date > today:
            raise ValueError('Invalid statement date')
        connection = database.get_db()
        try:
            rows = connection.execute(
                "SELECT executed_at FROM finance_transaction_ledger "
                "WHERE lower(trim(side)) = 'buy' AND (voided IS NULL OR voided = 0)"
            ).fetchall()
        finally:
            connection.close()
        for row in rows:
            value = row[0]
            if not isinstance(value, str):
                raise ValueError('Invalid purchase date')
            if len(value) == 10:
                executed = date.fromisoformat(value)
            else:
                executed = datetime.fromisoformat(value).date()
            if value[:10] != executed.isoformat() or executed > today:
                raise ValueError('Invalid purchase date')
            if executed >= statement_date:
                return ['Recorded purchases require a verified checking statement dated after the purchase before new investment cash can be authorized.']
    except (sqlite3.Error, ValueError, TypeError, OverflowError):
        return ['Recorded purchase cash reconciliation is unavailable or contains an invalid date.']
    return []
