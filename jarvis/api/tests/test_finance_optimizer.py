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
    assert result['promotion_status'] == 'NOT_VALIDATED'
    assert state == original
    assert database.get_latest_brief_for_week('W37 2026','finance') is None
