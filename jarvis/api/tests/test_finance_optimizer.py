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
from jarvis.domains.finance.lhv_nav_history import NavHistoryError, nav_history_record

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
