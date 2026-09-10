from copy import deepcopy

import pytest

from jarvis.domains.finance import engine
from jarvis.domains.finance.portfolio_projection import project_plan
from jarvis.domains.finance.contribution_selection import select_contributions
from jarvis.domains.finance.tests.test_evidence_allocation import state
from jarvis.domains.finance.tests.test_buy_selection import TODAY, candidate, inputs


def test_cash_outlay_is_not_position_principal_and_budget_is_conserved():
    lanes = {'etf': {'status': 'BUY', 'selected': {'asset': 'global_core_etf'},
                     'amount_eur': 100, 'principal_eur': 99, 'estimated_cost_eur': 1}}
    result = project_plan({'global_core_etf': 10000, 'tactical_reserve': 5000}, 12000, lanes)
    assert result['holdings_cents'] == {'global_core_etf': 19900, 'tactical_reserve': 7000}
    assert result['net_total_cents'] == 26900
    assert result['estimated_cost_cents'] + result['net_total_cents'] == 27000


def test_invalid_plan_cannot_hide_excess_spend_or_inconsistent_costs():
    leg = {'status': 'BUY', 'selected': {'asset': 'btc'}, 'amount_eur': 100,
           'principal_eur': 99, 'estimated_cost_eur': 1}
    with pytest.raises(ValueError):
        project_plan({}, 9999, {'crypto': leg})
    with pytest.raises(ValueError):
        project_plan({}, 10000, {'crypto': {**leg, 'principal_eur': 100}})


def test_engine_reports_post_cost_weights_for_existing_overweight_crypto():
    c,p = state()
    p['holdings'] = {'global_core_etf': 725, 'quality_etf': 0, 'btc': 275, 'eth': 0, 'tactical_reserve': 0}
    row = candidate('quality_etf', 'IS3Q.DE')
    row['fee_pct'] = 5
    result = engine.allocate_weekly_budget(c,p, profile={'risk_profile': {'time_horizon_years': 20}},
        selection_evidence={'policy_version': 'contribution-v2', 'candidates': [row]}, as_of=TODAY)
    cost = round(result['buy_selection']['lanes']['etf']['estimated_cost_eur'] * 100)
    assert cost > 0
    assert result['investable_after_cents'] == 110000 - cost
    assert result['crypto_risk_status']['total_crypto_weight'] == pytest.approx(27500 / (110000-cost))


def test_cross_lane_costs_cannot_enable_new_crypto_above_net_cap():
    c,p,h = inputs()
    c['target_weights'] = {'global_core_etf': .65, 'quality_etf': 0, 'btc': .25, 'eth': 0, 'tactical_reserve': .1}
    c['sleeve_bands']['global_core_etf']['max_weight'] = .9
    h = {'global_core_etf': 70000, 'btc': 27240, 'tactical_reserve': 2760}
    c['minimum_efficient_buys']['btc'] = .01
    rows = [candidate(), candidate('btc','BTC-EUR',lane='crypto')]
    rows[0]['fee_pct'] = 5
    rows[1]['fee_pct'] = 0
    before = deepcopy(h)
    result = select_contributions(rows,c,p,h,10000,TODAY,horizon_years=20)
    assert result['lanes']['crypto']['status'] == 'WAIT'
    assert 'post-cost' in result['lanes']['crypto']['reason']
    assert sum(result['allocations_cents'].values()) == 10000
    assert h == before


def test_comparison_includes_cash_and_alternatives_without_claiming_return_forecasts():
    c,p,h = inputs()
    result = select_contributions([candidate(), candidate('quality_etf','IS3Q.DE')],c,p,h,10000,TODAY,horizon_years=20)
    comparison = result['decision_comparison']
    assert comparison['cash_alternative']['estimated_cost_cents'] == 0
    assert len(comparison['standalone_candidates']) == 2
    assert comparison['performance_validated'] is False
    assert 'holdings_overlap' in comparison['unmeasured']


def test_api_mandate_and_canonical_risk_use_identical_net_values():
    c,p = state()
    etf = {**candidate(), 'fee_pct': 5}
    result = engine.allocate_weekly_budget(c,p,profile={'risk_profile': {'time_horizon_years': 20}},
        selection_evidence={'policy_version': 'contribution-v2', 'candidates':
                            [etf, candidate('eth','ETH-EUR',lane='crypto')]}, as_of=TODAY)
    controls = result['weekly_dual_lane_mandate']['risk_controls']
    assert round(controls['total_crypto_buy_room']*100) == result['crypto_risk_status']['total_crypto_room_cents']
