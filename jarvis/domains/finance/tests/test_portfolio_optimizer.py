from datetime import date, timedelta
from copy import deepcopy

import numpy as np

from jarvis.domains.finance.portfolio_optimizer import optimize_portfolio, weekly_panel

TODAY = date(2026, 9, 10)


def history(returns):
    start = TODAY - timedelta(days=TODAY.weekday()+3) - timedelta(weeks=len(returns))
    values = [100, *list(100*np.cumprod(1+np.array(returns)))]
    return [{'date': (start+timedelta(weeks=i)).isoformat(), 'close': float(v)} for i,v in enumerate(values)]


def row(symbol, lane='etf', cost=0):
    return {'symbol': symbol, 'asset': 'btc' if lane == 'crypto' else 'global_core_etf',
            'lane': lane, 'one_way_cost_pct': cost, 'minimum_cents': 1, 'eligible': True}


def run(rows=None, holdings=None, histories=None, tolerance=40):
    return optimize_portfolio(holdings or {'CASH': 100000}, rows or [row('ETF')],
        histories or {'ETF': history([.004, -.001]*65)}, 10000, TODAY,
        horizon_years=20, drawdown_tolerance_pct=tolerance)


def test_complete_cash_accounting_and_no_arbitrary_bitcoin_ceiling():
    result = optimize_portfolio({'CASH': 0}, [row('BTC-EUR','crypto', .5)],
        {'BTC-EUR': history([.01, -.001]*65)},10000,TODAY,horizon_years=20,drawdown_tolerance_pct=40)
    assert result['status'] == 'RESEARCH_READY'
    selected = result['selected_plan']
    assert selected['weights_pct']['BTC-EUR'] > 25
    assert selected['net_value_cents'] + selected['estimated_cost_cents'] == 10000
    assert sum(t['cash_outlay_cents'] for t in selected['trades']) + selected['unspent_contribution_cents'] == 10000
    assert result['promotion_status'] == 'NOT_VALIDATED'


def test_future_prices_do_not_change_the_decision():
    histories = {'ETF': history([.004, -.001]*65)}
    expected = run(histories=histories)
    histories['ETF'].append({'date': TODAY.isoformat(), 'close': 1e9})
    assert run(histories=histories) == expected


def test_daily_crypto_uses_consistent_friday_ending_weeks():
    points = [{'date': (TODAY-timedelta(days=i)).isoformat(), 'close': 100+i}
              for i in range(1, 900)]
    days, _, _ = weekly_panel({'BTC-EUR': points}, ['BTC-EUR'], TODAY)
    assert all(day.weekday() == 4 for day in days)
    assert all((b-a).days == 7 for a,b in zip(days, days[1:]))


def test_overflow_is_missing_evidence_not_a_risk_verdict():
    points = history([.004, -.001]*65)
    for point, exponent in zip(points, np.linspace(-12, 300, len(points))):
        point['close'] = 10**exponent
    result = run(histories={'ETF': points})
    assert result['status'] == 'INSUFFICIENT_DATA'
    assert result['selected_plan'] is None


def test_missing_held_instrument_blocks_whole_portfolio_claim():
    result = run(holdings={'MISSING': 100000, 'CASH': 0})
    assert result['status'] == 'INSUFFICIENT_DATA'
    assert result['selected_plan'] is None
    assert 'MISSING' in str(result['blockers'])


def test_correlation_is_measured_and_diversification_changes_the_plan():
    a = [.04, -.03]*65
    b = [-.03, .04]*65
    result = run(rows=[row('A'),row('B','crypto')], holdings={'A': 10000, 'CASH': 0},
                 histories={'A': history(a), 'B': history(b)})
    assert result['correlations']['A']['B'] < -.99
    assert any(t['symbol'] == 'B' for t in result['selected_plan']['trades'])
    assert len(result['scenario_winners']) == 9


def test_existing_exposure_that_cannot_meet_tolerance_requires_risk_review():
    result = run(holdings={'ETF': 1000000, 'CASH': 0}, histories={'ETF': history([-.01]*130)}, tolerance=5)
    assert result['status'] == 'RISK_REVIEW'
    assert result['selected_plan'] is None


def test_distinct_identical_choices_are_not_resolved_by_symbol_order():
    h = history([.004, -.001]*65)
    result = run(rows=[row('A'),row('B')], histories={'A':h,'B':deepcopy(h)})
    assert result['status'] == 'AMBIGUOUS'
    assert result['selected_plan'] is None


def test_panel_rejects_short_duplicate_and_nonfinite_history():
    for points in (history([.01]*30), history([.01]*130)+[history([.01]*130)[0]],
                   [{**p, 'close': float('inf')} for p in history([.01]*130)]):
        result = run(histories={'ETF': points})
        assert result['status'] == 'INSUFFICIENT_DATA'
