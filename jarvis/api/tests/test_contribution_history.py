from datetime import date
import sqlite3
import pytest
from jarvis.data import database
from jarvis.data.contribution_history import load_contribution_history

POLICY={'version':'core-satellite-v2','crypto_max_weight':.15,'crypto_contribution_weight':.1,'effective_from':'2026-09-13'}
TODAY=date(2026,9,14)

@pytest.fixture
def ledger(tmp_path,monkeypatch):
    path=tmp_path/'history.db'
    def connect():
        c=sqlite3.connect(path);c.row_factory=sqlite3.Row;return c
    monkeypatch.setattr(database,'get_db',connect)
    with connect() as c:
        c.execute('CREATE TABLE finance_transaction_ledger(id INTEGER PRIMARY KEY,executed_at TEXT,asset TEXT,amount_eur REAL,fee_eur REAL,currency TEXT,side TEXT,portfolio_state_updated INTEGER,voided INTEGER)')
    def add(day='2026-09-13',asset='btc',amount=20,fee=.11,currency='EUR',applied=1,void=0,side='buy'):
        with connect() as c:
            c.execute('INSERT INTO finance_transaction_ledger VALUES(NULL,?,?,?,?,?,?,?,?)',(day,asset,amount,fee,currency,side,applied,void))
    return add


def test_only_completed_nonvoid_purchases_count_with_fees(ledger):
    ledger();ledger(asset='global_core_etf',amount=100,fee=.1)
    ledger(void=1);ledger(applied=0);ledger(side='sell');ledger(day='2026-09-12')
    result=load_contribution_history(POLICY,TODAY)
    assert result['total_purchase_outlay_cents']==12021
    assert result['crypto_purchase_outlay_cents']==2011
    assert result==load_contribution_history(POLICY,TODAY)

@pytest.mark.parametrize('change',[{'day':'invalid'},{'day':'2027-01-01'}, {'currency':'USD'}, {'amount':-1},{'fee':.001},{'amount':None},{'asset':'BTC'},{'asset':'unknown'},{'asset':'tactical_reserve'}])
def test_invalid_history_never_becomes_zero(ledger,change):
    ledger(**change)
    with pytest.raises(ValueError):load_contribution_history(POLICY,TODAY)
