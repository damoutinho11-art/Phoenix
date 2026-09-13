from datetime import date
import sqlite3

import pytest

from jarvis.data import database


@pytest.fixture
def ledger(monkeypatch, tmp_path):
    path = tmp_path / 'ledger.db'
    connection = sqlite3.connect(path)
    connection.execute('CREATE TABLE finance_transaction_ledger (executed_at TEXT, side TEXT, voided INTEGER, portfolio_state_updated INTEGER)')
    connection.commit()
    monkeypatch.setattr(database, 'get_db', lambda: sqlite3.connect(path))
    yield connection
    connection.close()


@pytest.mark.parametrize('executed,voided,applied,blocked', [
    ('2026-09-13', 0, 1, True),
    ('2026-09-13T12:00:00+03:00', 0, 0, True),
    ('2026-09-12', 0, 0, True),
    ('2026-09-11', 0, 1, False),
    ('2026-09-13', 1, 1, False),
    ('bad-date', 0, 0, True),
    ('2026-09-15', 0, 0, True),
])
def test_unrepresented_purchases_remain_blocked_next_week(ledger, executed, voided, applied, blocked):
    from jarvis.data.finance_cash_reconciliation import cash_reconciliation_blockers
    ledger.execute('INSERT INTO finance_transaction_ledger VALUES (?, ?, ?, ?)', (executed, 'buy', voided, applied))
    ledger.commit()
    assert bool(cash_reconciliation_blockers('2026-09-12', date(2026, 9, 14))) is blocked


def test_later_verified_statement_clears_purchase(ledger):
    from jarvis.data.finance_cash_reconciliation import cash_reconciliation_blockers
    ledger.execute("INSERT INTO finance_transaction_ledger VALUES ('2026-09-13', 'buy', 0, 0)")
    ledger.commit()
    assert cash_reconciliation_blockers('2026-09-14', date(2026, 9, 14)) == []


def test_unavailable_history_blocks(monkeypatch):
    from jarvis.data.finance_cash_reconciliation import cash_reconciliation_blockers
    def unavailable():
        raise sqlite3.OperationalError('unavailable')
    monkeypatch.setattr(database, 'get_db', unavailable)
    assert cash_reconciliation_blockers('2026-09-13', date(2026, 9, 14))


@pytest.mark.parametrize('day,windows,weekly', [(1, 5, 129.21), (13, 4, 161.52), (14, 3, 215.35), (21, 2, 323.03), (28, 1, 646.06)])
def test_missed_windows_redistribute_only_existing_cash(day, windows, weekly):
    from jarvis.domains.finance.cashflow_authority import calculate_cashflow_authority
    today = date(2026, 9, day)
    result = calculate_cashflow_authority(
        policy={'version': 2, 'emergency_fund_floor_eur': 5000, 'emergency_fund_balance_eur': 5000,
                'checking_buffer_eur': 300, 'food_budget_eur': 200, 'essential_spending_ceiling_eur': 950,
                'salary_day_cutoff': 30, 'recurring_obligations': []},
        snapshot={'closing_balance_eur': 1035.22, 'statement_end_date': today.isoformat(), 'quality_status': 'reconciled'},
        month_summary={'income_total': 3000, 'expenses_total': 950, 'invested_total': 0,
                       'emergency_fund_total': 0, 'by_category': {'Food & Groceries': {'total': 159.84}}},
        unpaid_bills_eur=49, today=today, week_closed=False,
    )
    assert result['deployable_capacity_eur'] == 646.06
    assert result['remaining_weekly_windows'] == windows
    assert result['weekly_budget_eur'] == weekly
    assert result['protected_cash'] == {'checking_buffer_eur': 300.0, 'food_eur': 40.16,
                                       'unpaid_bills_eur': 49.0, 'emergency_shortfall_eur': 0.0}
