import pytest
from jarvis.domains.finance.optimizer_attribution import attribute_study


def fixture(end_etf=150, end_coin=200):
    histories = {s:[{'date':'2024-01-02','close':100},{'date':'2024-12-31','close':v}]
        for s,v in [('VWCE.DE',end_etf),('BTC-EUR',end_coin)]}
    study = {'end':'2024-12-31','contribution_count':1,'assumed_one_way_cost_pct':{'etf':0,'crypto':0},
        'decisions':[{'execution_date':'2024-01-02','input_holdings_cents':{'CASH':0},
            'trades':[{'symbol':'BTC-EUR','cash_outlay_cents':5000,'principal_cents':5000,'estimated_cost_cents':0}]}],
        'summary':[{'strategy':'optimizer','ending_value_eur':50+end_coin/2},
            {'strategy':'broad_etf','ending_value_eur':end_etf}]}
    return study,histories


def test_cash_and_instrument_effects_reconcile_without_double_counting():
    s,h = fixture()
    result = attribute_study(s,h,10000)
    assert result['cash_timing_effect_eur'] == -25
    assert result['instrument_selection_effect_eur'] == 25
    assert result['fee_difference_effect_eur'] == 0
    assert result['ending_value_gap_eur'] == 0
    assert result['ending_cash_eur'] == 50


def test_cash_can_help_in_a_falling_market():
    s,h = fixture(50,50)
    result = attribute_study(s,h,10000)
    assert result['cash_timing_effect_eur'] == 25
    assert result['instrument_selection_effect_eur'] == 0
    assert result['ending_value_gap_eur'] == 25


def test_entry_costs_include_foregone_growth_and_reconcile():
    s,h = fixture()
    s['decisions'][0]['trades'][0].update(principal_cents=4900,estimated_cost_cents=100)
    s['summary'][0]['ending_value_eur'] = 148
    result = attribute_study(s,h,10000)
    assert result['fee_difference_effect_eur'] == -2
    assert result['ending_value_gap_eur'] == -2
    assert result['entry_costs_eur'] == 1


def test_rejects_unreconciled_results_overspending_and_missing_exact_execution_price():
    for mutation in ('result','overspend','price','duplicate','initial_holdings'):
        s,h = fixture()
        if mutation=='result': s['summary'][0]['ending_value_eur'] += 1
        if mutation=='overspend': s['decisions'][0]['trades'][0]['cash_outlay_cents'] = 20000
        if mutation=='price': h['BTC-EUR'] = h['BTC-EUR'][1:]
        if mutation=='duplicate': h['BTC-EUR'].append(h['BTC-EUR'][0])
        if mutation=='initial_holdings': s['decisions'][0]['input_holdings_cents']['BTC-EUR'] = 100
        with pytest.raises(ValueError):
            attribute_study(s,h,10000)
