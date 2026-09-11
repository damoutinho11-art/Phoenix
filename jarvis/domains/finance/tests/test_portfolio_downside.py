from copy import deepcopy
import pytest
from jarvis.domains.finance.portfolio_downside import downside_config, compare_downside


def inputs():
    snapshot = {'as_of':'2024-01-01','holdings_cents':{'BTC-EUR':10000,'CASH':5000},'budget_cents':10000,
        'drawdown_tolerance_pct':40,'candidates':[{'symbol':'BTC-EUR','asset':'btc'}],
        'provenance':{'identities':[{'symbol':'BTC-EUR','asset':'btc'}]},
        'histories':{'BTC-EUR':[{'date':'2022-01-03','close':100},{'date':'2022-10-12','close':50}]}}
    plan = {'trades':[{'symbol':'BTC-EUR','principal_cents':9900,'estimated_cost_cents':100,'cash_outlay_cents':10000}],
        'net_value_cents':24900,'estimated_cost_cents':100,'unspent_contribution_cents':0}
    result = {'selected_plan':plan,'ranked_plans':[plan]}
    snapshot['downside_configuration'] = downside_config(snapshot)
    return snapshot,result


def test_comparison_includes_entry_costs_and_existing_cash_exactly():
    snapshot,result = inputs()
    report = compare_downside(snapshot,result)
    selected,cash = report['plans'][:2]
    assert selected['cash_after_contribution_cents'] == 5000
    assert cash['cash_after_contribution_cents'] == 15000
    shock = next(s for s in selected['scenarios'] if s['id']=='crypto_shock')
    assert shock['loss_including_entry_cost_cents'] == 16020
    assert shock['loss_pct_of_starting_wealth'] == pytest.approx(64.08)
    assert shock['exceeds_tolerance'] is True
    assert selected['scenarios'][0]['status'] == 'CALCULATED'
    assert len(report['plans']) == 2  # ranked copy of selected does not duplicate it


def test_missing_history_or_classification_never_becomes_zero_risk():
    snapshot,result = inputs()
    snapshot['histories'] = {}
    snapshot['downside_configuration']['asset_classes'] = {}
    report = compare_downside(snapshot,result)
    scenarios = report['plans'][0]['scenarios']
    assert not report['historical_windows']['historical_2022'].get('observed_start')
    assert not report['historical_windows']['historical_2022'].get('observed_end')
    assert next(s for s in scenarios if s['kind']=='historical_window')['status'] == 'INCOMPLETE'
    assert next(s for s in scenarios if s['id']=='crypto_shock')['status'] == 'INCOMPLETE'
    assert next(s for s in scenarios if s['id']=='correlated_shock')['status'] == 'CALCULATED'


def test_future_window_is_not_available_even_if_future_prices_are_supplied():
    snapshot,result = inputs()
    snapshot['as_of'] = '2022-07-01'
    report = compare_downside(snapshot,result)
    scenario = next(s for s in report['plans'][0]['scenarios'] if s['kind']=='historical_window')
    assert scenario['status'] == 'INCOMPLETE'
    assert 'completed' in scenario['reason']


def test_unreconciled_plan_and_unknown_configuration_are_rejected():
    for mutation in ('fee','budget','version'):
        snapshot,result = inputs()
        if mutation=='fee': result['selected_plan']['estimated_cost_cents'] = 0
        if mutation=='budget': snapshot['budget_cents'] = 9999
        if mutation=='version': snapshot['downside_configuration']['version'] = 'unknown'
        with pytest.raises(ValueError):
            compare_downside(snapshot,result)


def test_saved_shock_configuration_is_used_and_input_is_unchanged():
    snapshot,result = inputs()
    snapshot['downside_configuration']['scenarios'][0]['shocks_pct']['crypto'] = -50
    original = deepcopy((snapshot,result))
    first = compare_downside(snapshot,result)
    second = compare_downside(deepcopy(snapshot),deepcopy(result))
    assert first == second
    assert (snapshot,result) == original
    first_shock = first['plans'][0]['scenarios'][0]
    assert first_shock['loss_including_entry_cost_cents'] == 10050


def test_historical_endpoints_are_common_observed_dates_for_every_instrument():
    snapshot,result = inputs()
    snapshot['holdings_cents']['ETF'] = 10000
    result['selected_plan']['net_value_cents'] += 10000
    snapshot['histories']['BTC-EUR'] += [{'date':'2022-01-04','close':90},{'date':'2022-10-11','close':45}]
    snapshot['histories']['ETF'] = [{'date':'2022-01-04','close':100},{'date':'2022-10-11','close':80}]
    report = compare_downside(snapshot,result)
    scenario = next(s for s in report['plans'][0]['scenarios'] if s['kind']=='historical_window')
    assert scenario['observed_start'] == '2022-01-04'
    assert scenario['observed_end'] == '2022-10-11'
    assert scenario['shock_pnl_cents'] == -11950


def test_shared_holding_receives_identical_historical_shock_across_plans():
    snapshot,result = inputs()
    snapshot['histories']['BTC-EUR'] = [{'date':'2022-01-03','close':100},
        {'date':'2022-01-04','close':200},{'date':'2022-10-12','close':100}]
    snapshot['histories']['ETF'] = [{'date':'2022-01-04','close':100},{'date':'2022-10-12','close':100}]
    result['selected_plan']['trades'][0]['symbol'] = 'ETF'
    report = compare_downside(snapshot,result)
    selected,cash = [next(s for s in p['scenarios'] if s['kind']=='historical_window') for p in report['plans'][:2]]
    assert selected['observed_start'] == cash['observed_start']
    assert selected['instrument_shock_pnl_cents']['BTC-EUR'] == cash['instrument_shock_pnl_cents']['BTC-EUR']


def test_unsupported_alternative_does_not_change_available_plan_history():
    snapshot,result = inputs()
    result['selected_plan']['trades'][0]['symbol'] = 'MISSING'
    report = compare_downside(snapshot,result)
    selected,cash = [next(s for s in p['scenarios'] if s['kind']=='historical_window') for p in report['plans'][:2]]
    assert selected['status'] == 'INCOMPLETE'
    assert cash['status'] == 'CALCULATED'


def test_cash_only_window_has_zero_loss_without_claiming_price_observations():
    snapshot,_ = inputs()
    snapshot['holdings_cents'] = {'CASH':15000}
    snapshot['histories'] = {}
    report = compare_downside(snapshot,{})
    scenario = next(s for s in report['plans'][0]['scenarios'] if s['kind']=='historical_window')
    assert scenario['status'] == 'CALCULATED'
    assert scenario['loss_including_entry_cost_cents'] == 0
    assert 'observed_start' not in scenario
    assert 'observed_end' not in scenario
    assert report['historical_windows']['historical_2022'] == {}
