from copy import deepcopy
from fastapi.testclient import TestClient
from jarvis.api.main import app
from jarvis.data import database


def test_broker_correction_stays_in_legacy_and_never_records_a_trade(monkeypatch):
    state={'holdings':{},'legacy_holdings':{'lhv_growth_euro_bond':1},
           'units':{'lhv_growth_euro_bond':.1}}
    saved=[]
    monkeypatch.setattr(database,'load_portfolio_state',lambda: deepcopy(state))
    monkeypatch.setattr(database,'save_portfolio_state',lambda value:saved.append(value))
    def forbid_trade(*args, **kwargs):
        raise AssertionError('A holdings correction cannot create a transaction.')
    monkeypatch.setattr(database,'save_finance_transaction',forbid_trade)
    with TestClient(app) as client:
        result=client.post('/finance/portfolio-state/patch-units',json={
            'asset':'lhv_growth_euro_bond','units':.2,'holdings_eur':2.05,
            'broker_symbol':'LHVEVF','evidence_sha256':'a'*64,'reason':'Synthetic screenshot review'})
    assert result.status_code==200,result.text
    assert saved[0]['legacy_holdings']['lhv_growth_euro_bond']==2.05
    assert saved[0]['holdings']=={}
    assert saved[0]['positions']['lhv_growth_euro_bond']['LHVEVF']['isin']=='EE3600001921'


def test_unmatched_screenshot_symbol_does_not_save(monkeypatch):
    monkeypatch.setattr(database,'load_portfolio_state',lambda:{'legacy_holdings':{'lhv_growth_euro_bond':1},'units':{}})
    saved=[]
    monkeypatch.setattr(database,'save_portfolio_state',lambda value:saved.append(value))
    with TestClient(app) as client:
        result=client.post('/finance/portfolio-state/patch-units',json={
            'asset':'lhv_growth_euro_bond','units':.2,'holdings_eur':2.05,
            'broker_symbol':'IEAG','evidence_sha256':'a'*64})
    assert result.status_code==400
    assert not saved
