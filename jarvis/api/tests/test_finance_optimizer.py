import json
from datetime import date
from unittest.mock import patch
import pytest

from jarvis.api import finance_optimizer as bridge
from jarvis.data import database


@pytest.fixture(autouse=True)
def isolated_db(tmp_path, monkeypatch):
    monkeypatch.setattr(database, 'DB_PATH', tmp_path/'optimizer.db')
    database.init_db()


def test_archive_is_separate_from_approvals_and_replayable():
    snapshot = {'synthetic': True}
    result = {'status': 'INSUFFICIENT_DATA', 'promotion_status': 'NOT_VALIDATED'}
    first = database.save_optimizer_run('test-hash', snapshot, result)
    assert database.save_optimizer_run('test-hash', snapshot, result) == first
    saved = database.get_latest_optimizer_run()
    assert json.loads(saved['snapshot_json']) == snapshot
    assert database.get_latest_brief_for_week('W37 2026', 'finance') is None


def test_closed_week_and_unverified_cash_stop_before_market_requests():
    with patch.object(bridge, 'load_selection_evidence') as fetch:
        for authority, closed in [({'data_ready': True}, True), ({'data_ready': False}, False)]:
            result = bridge.run_optimizer({}, {}, {}, authority, date(2026,9,10), week_closed=closed)
            assert result['selected_plan'] is None
            assert result['promotion_status'] == 'NOT_VALIDATED'
        fetch.assert_not_called()


def test_unknown_holdings_stop_before_market_requests():
    with patch.object(bridge.engine, 'portfolio_state_freshness_blockers', return_value=[]), \
         patch.object(bridge, 'load_selection_evidence') as fetch:
        result = bridge.run_optimizer({}, {'holdings': {'unknown': 10}}, {},
            {'data_ready': True, 'weekly_budget_eur': 100}, date(2026,9,10))
        assert result['status'] == 'INSUFFICIENT_DATA'
        fetch.assert_not_called()


def test_full_research_pipeline_archives_exact_inputs_without_changing_state():
    from copy import deepcopy
    from jarvis.domains.finance.tests.test_buy_selection import candidate, inputs, TODAY
    from jarvis.domains.finance.tests.test_portfolio_optimizer import history
    from jarvis.domains.finance.optimizer_evidence import replay_snapshot
    c, state, _ = inputs()
    state['holdings'] = {'tactical_reserve':1000}
    original = deepcopy(state)
    profile = {'risk_profile':{'time_horizon_years':20, 'max_acceptable_drawdown_pct':40}}
    with patch.object(bridge.engine,'portfolio_state_freshness_blockers',return_value=[]), \
         patch.object(bridge,'detect_market_regime',return_value='risk_on'), \
         patch.object(bridge.engine,'compute_asset_target_weights',return_value=c['target_weights']), \
         patch.object(bridge,'load_selection_evidence',return_value={'candidates':[candidate()]}), \
         patch.object(bridge,'fetch_histories',return_value={'VWCE.DE':{'history':history([.004,-.001]*65)}}):
        result = bridge.run_optimizer(c,state,profile,{'data_ready':True,'weekly_budget_eur':100},TODAY)
    assert result['status'] == 'RESEARCH_READY'
    saved = database.get_latest_optimizer_run()
    replayed = replay_snapshot(json.loads(saved['snapshot_json']))
    assert replayed['selected_plan'] == result['selected_plan']
    from jarvis.domains.finance.portfolio_downside import compare_downside
    snapshot = json.loads(saved['snapshot_json'])
    assert 'downside_configuration' in snapshot
    assert result['downside_comparison'] == compare_downside(snapshot,replayed)
    assert result['downside_comparison']['plans'][0]['id'] == 'selected'
    assert result['promotion_status'] == 'NOT_VALIDATED'
    assert state == original
    assert database.get_latest_brief_for_week('W37 2026','finance') is None


# --- LHV funds held: unavailable -> blocked -> available ---------------------

from datetime import timedelta

from jarvis.domains.finance import optimizer_evidence
from jarvis.domains.finance.lhv_fund_nav import ISINS
from jarvis.domains.finance.lhv_nav_history import (
    FUND_INCEPTION, NavHistoryError, NavHistoryImmature, nav_history_record)

LAST_PUBLISHED = date(2026, 9, 4)


def nav_payload(symbol, weeks=170, drift=0.02):
    """A published weekly NAV series on the same grid the ETF fixture uses."""
    rows = [{'timestamp': (LAST_PUBLISHED - timedelta(weeks=i)).isoformat() + 'T12:00:00Z',
             'price': round(15 + drift*(weeks-i) + 0.05*((weeks-i) % 5), 4)}
            for i in range(weeks)][::-1]
    return {'fundData': {'shortName': symbol, 'isin': ISINS[symbol],
                         'nav': rows[-1]['price'], 'currency': 'EUR'},
            'priceGraphDetails': rows}


def lhv_scenario(state_extra=None, constitution_extra=None):
    from jarvis.domains.finance.tests.test_buy_selection import inputs
    c, state, _ = inputs()
    state['holdings'] = {'tactical_reserve': 1000}
    c.update(constitution_extra or {})
    state.update(state_extra or {})
    return c, state


HELD_LEGACY = {'lhv_growth_world_equities': 500.0, 'lhv_growth_euro_bond': 300.0}
LEGACY_POLICY = {'legacy_holding_policy': {
    'lhv_growth_world_equities': {'maps_to': 'global_core_etf'},
    'lhv_growth_euro_bond': {'maps_to': 'global_core_etf'}}}


def run_with(c, state, nav_history):
    """Patch only the two leaf fetchers so routing and validation stay real."""
    from jarvis.domains.finance.tests.test_buy_selection import candidate, TODAY
    from jarvis.domains.finance.tests.test_portfolio_optimizer import history
    profile = {'risk_profile': {'time_horizon_years': 20, 'max_acceptable_drawdown_pct': 40}}
    market = {'VWCE.DE': {'history': history([.004, -.001]*65), 'symbol': 'VWCE.DE',
                          'currency': 'EUR', 'history_supported': True}}
    optimizer_evidence._cache.clear()
    with patch.object(bridge.engine, 'portfolio_state_freshness_blockers', return_value=[]), \
         patch.object(bridge, 'detect_market_regime', return_value='risk_on'), \
         patch.object(bridge.engine, 'compute_asset_target_weights', return_value=c['target_weights']), \
         patch.object(bridge, 'load_selection_evidence', return_value={'candidates': [candidate()]}), \
         patch.object(optimizer_evidence, 'fetch_eur_history', lambda s, today: market[s]), \
         patch.object(optimizer_evidence, 'fetch_nav_history', nav_history):
        result = bridge.run_optimizer(c, state, profile,
                                      {'data_ready': True, 'weekly_budget_eur': 100}, TODAY)
    optimizer_evidence._cache.clear()
    return result


def official_nav(symbol, today):
    return nav_history_record(symbol, nav_payload(symbol), today,
                              document_sha256='a'*64)


def test_baseline_without_lhv_holdings_reaches_a_normal_optimizer_result():
    """The control: the scenario must actually work before absence proves anything."""
    c, state = lhv_scenario()
    result = run_with(c, state, official_nav)
    assert result['status'] == 'RESEARCH_READY'
    assert result['selected_plan'] is not None
    assert result['blockers'] == []


def test_an_invalid_official_nav_series_blocks_and_names_its_own_defect():
    def invalid(symbol, today):
        raise NavHistoryError(
            f'Official NAV history has 12 observations; at least 110 are required '
            'to compare historical risk.')

    c, state = lhv_scenario({'legacy_holdings': HELD_LEGACY}, LEGACY_POLICY)
    result = run_with(c, state, invalid)

    assert result['status'] == 'INSUFFICIENT_DATA'
    assert result['selected_plan'] is None
    assert result['official_nav_history_invalid_symbols'] == ['LHVEVF', 'LHVWORLDA']
    assert '12 observations' in result['blockers'][0]
    # A published series that failed validation is never a missing source.
    assert 'unsupported_history_symbols' not in result
    assert not any('no dated public price source' in b for b in result['blockers'])


def test_both_lhv_funds_held_reach_a_normal_result_on_official_nav_history():
    c, state = lhv_scenario({'legacy_holdings': HELD_LEGACY}, LEGACY_POLICY)
    result = run_with(c, state, official_nav)

    assert result['status'] == 'RESEARCH_READY'
    assert result['selected_plan'] is not None
    assert result['blockers'] == []
    assert 'official_nav_history_invalid_symbols' not in result

    # The NAV provenance is persisted with the run, not just used and discarded.
    saved = json.loads(database.get_latest_optimizer_run()['snapshot_json'])
    sources = saved['provenance']['history_sources']
    for symbol in ('LHVWORLDA', 'LHVEVF'):
        assert sources[symbol]['source_type'] == 'official_fund_nav'
        assert sources[symbol]['document_sha256'] == 'a'*64
        assert sources[symbol]['isin'] == ISINS[symbol]
        assert sources[symbol]['observations'] >= 110
        assert 'not a traded price' in sources[symbol]['valuation_basis']


# --- a young fund stays in the portfolio without distorting the statistics ----

def immature_nav(symbol, today):
    """LHVWORLDA has history; LHVEVF is sound but younger than the statistics."""
    if symbol != 'LHVEVF':
        return official_nav(symbol, today)
    raise NavHistoryImmature(
        'LHVEVF: official NAV history is valid but insufficient since inception '
        '(launched 2025-01-28). It carries 85 completed weekly returns and 110 are '
        'required, which the fund cannot yet have. The holding is retained as a '
        'constrained fixed sleeve.',
        symbol='LHVEVF', inception='2025-01-28', weekly_returns=85)


def test_a_young_fund_is_optimized_around_rather_than_blocking_the_run():
    c, state = lhv_scenario({'legacy_holdings': HELD_LEGACY}, LEGACY_POLICY)
    result = run_with(c, state, immature_nav)

    assert result['status'] == 'RESEARCH_READY'
    assert result['selected_plan'] is not None
    assert result['blockers'] == []

    # Reported, never blocking, and never relabelled as a defect.
    assert 'official_nav_history_invalid_symbols' not in result
    excluded = result['excluded_from_estimation']
    assert [e['symbol'] for e in excluded] == ['LHVEVF']
    assert excluded[0]['code'] == 'official_nav_history_insufficient_since_inception'
    assert excluded[0]['inception'] == '2025-01-28'
    assert excluded[0]['weekly_returns'] == 85
    assert 'valid but insufficient since inception' in excluded[0]['reason']


def test_the_young_fund_keeps_its_full_value_and_weight_in_the_portfolio():
    c, state = lhv_scenario({'legacy_holdings': HELD_LEGACY}, LEGACY_POLICY)
    result = run_with(c, state, immature_nav)

    fixed = {f['symbol']: f for f in result['fixed_sleeves']}
    assert set(fixed) == {'LHVEVF'}
    assert fixed['LHVEVF']['value_cents'] == 30000        # the full held value
    assert fixed['LHVEVF']['weight_pct_of_holdings'] > 0

    plan = result['selected_plan']
    # It is part of the portfolio the plan describes, at exactly its held value.
    assert plan['weights_pct']['LHVEVF'] == pytest.approx(
        30000/plan['net_value_cents']*100, abs=1e-6)
    assert sum(plan['weights_pct'].values()) == pytest.approx(100.0, abs=1e-6)
    # Nothing is lost from the portfolio total except the contribution's own costs.
    invested = round((sum(state['holdings'].values()) + sum(state['legacy_holdings'].values()))*100)
    assert plan['net_value_cents'] + plan['estimated_cost_cents'] == invested + 10000


def test_no_return_variance_or_correlation_is_attributed_to_the_young_fund():
    c, state = lhv_scenario({'legacy_holdings': HELD_LEGACY}, LEGACY_POLICY)
    result = run_with(c, state, immature_nav)

    assert 'LHVEVF' not in result['correlations']
    assert all('LHVEVF' not in row for row in result['correlations'].values())
    assert 'LHVWORLDA' in result['correlations']          # the one with history is estimated


def test_the_understated_risk_from_a_fixed_sleeve_is_stated_not_implied():
    c, state = lhv_scenario({'legacy_holdings': HELD_LEGACY}, LEGACY_POLICY)
    result = run_with(c, state, immature_nav)
    assert any('LHVEVF' in line and 'understate' in line for line in result['limitations'])


def test_no_pre_inception_history_is_synthesized_for_the_young_fund():
    c, state = lhv_scenario({'legacy_holdings': HELD_LEGACY}, LEGACY_POLICY)
    run_with(c, state, immature_nav)
    snapshot = json.loads(database.get_latest_optimizer_run()['snapshot_json'])
    assert snapshot['histories'].get('LHVEVF', []) == []
    assert snapshot['fixed_symbols'] == ['LHVEVF']
    # No proxy instrument stands in for it anywhere in the recorded inputs.
    assert not any('LHVEVF' in str(k) for k in snapshot['histories'] if k != 'LHVEVF')


def test_a_replayed_snapshot_reproduces_the_fixed_sleeve_decision():
    from jarvis.domains.finance.optimizer_evidence import replay_snapshot
    c, state = lhv_scenario({'legacy_holdings': HELD_LEGACY}, LEGACY_POLICY)
    result = run_with(c, state, immature_nav)
    snapshot = json.loads(database.get_latest_optimizer_run()['snapshot_json'])
    replayed = replay_snapshot(snapshot)
    assert replayed['selected_plan'] == result['selected_plan']
    assert replayed['fixed_sleeves'] == result['fixed_sleeves']


def test_an_invalid_series_still_blocks_even_beside_a_merely_young_one():
    """The three outcomes stay separate when two of them occur together."""
    def mixed(symbol, today):
        if symbol == 'LHVEVF':
            return immature_nav(symbol, today)
        raise NavHistoryError('Official NAV history has a 41-day gap; a complete '
                              'published series is required.')

    c, state = lhv_scenario({'legacy_holdings': HELD_LEGACY}, LEGACY_POLICY)
    result = run_with(c, state, mixed)

    assert result['status'] == 'INSUFFICIENT_DATA'
    assert result['official_nav_history_invalid_symbols'] == ['LHVWORLDA']
    assert [e['symbol'] for e in result['excluded_from_estimation']] == ['LHVEVF']
    assert any('41-day gap' in b for b in result['blockers'])
    assert not any('LHVEVF' in b for b in result['blockers'])
