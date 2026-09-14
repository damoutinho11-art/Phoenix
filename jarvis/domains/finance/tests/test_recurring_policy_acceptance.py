"""Synthetic acceptance scenarios for production contribution accounting.

These verify invariants, not historical performance or optimal weights.
"""
from copy import deepcopy

import pytest

from jarvis.domains.finance.contribution_selection import select_contributions
from jarvis.domains.finance.tests.test_recurring_contributions import setup
from jarvis.domains.finance.tests.test_buy_selection import candidate, TODAY


def candidates(crypto_fee, growth=.001):
    return [candidate(growth=growth),
            {**candidate('quality_etf', 'IS3Q.DE', growth=growth), 'fund_fee_pct': .25},
            {**candidate('btc', 'BTC-EUR', lane='crypto', growth=growth), 'fee_pct': crypto_fee}]


def assert_accounting(result, before, budget):
    projection = result['projection']
    assert sum(result['allocations_cents'].values()) == budget
    assert projection['net_total_cents'] + projection['estimated_cost_cents'] == sum(before.values()) + budget
    assert projection['purchase_outlay_cents'] <= budget
    assert all(projection['holdings_cents'].get(a, 0) >= value for a, value in before.items())
    for lane, decision in result['lanes'].items():
        if decision['status'] == 'BUY':
            asset = decision['selected']['asset']
            assert not any(asset in breach['assets'] for breach in result['decision_comparison']['selected_plan']['constraint_breaches'])
            if lane == 'crypto':
                assert decision['principal_eur'] >= 20
                assert round(decision['amount_eur'] * 100) <= budget // 2


@pytest.mark.parametrize('budget', [0, 1999, 2000, 5000, 21535])
@pytest.mark.parametrize('btc_value', [0, 10000, 30000, 100000])
@pytest.mark.parametrize('fee', [.1, .5, 2.0])
@pytest.mark.parametrize('growth', [-.005, 0, .005])
def test_budget_exposure_cost_and_market_sensitivity(budget, btc_value, fee, growth):
    c, p, h = setup(total=100000, crypto=4000)
    h['btc'] = btc_value
    before = deepcopy((c, p, h))
    rows = candidates(fee, growth)
    result = select_contributions(rows, c, p, h, budget, TODAY, horizon_years=20)
    assert_accounting(result, h, budget)
    assert (c, p, h) == before


@pytest.mark.parametrize('fee', [.1, .5, 2.0])
def test_small_regular_contributions_eventually_buy_btc_without_credit_for_skipped_purchases(fee):
    c, p, h = setup()
    total = crypto = crypto_buys = 0
    for cycle in range(52):
        c['contribution_history'].update(total_purchase_outlay_cents=total,
                                          crypto_purchase_outlay_cents=crypto)
        result = select_contributions(candidates(fee), c, p, h, 5000, TODAY, horizon_years=20)
        assert_accounting(result, h, 5000)
        if cycle % 3 == 0:
            # An unexecuted recommendation changes neither holdings nor credit.
            assert result == select_contributions(candidates(fee), c, p, h, 5000, TODAY, horizon_years=20)
            continue
        total += result['projection']['purchase_outlay_cents']
        btc = result['lanes']['crypto']
        if btc['status'] == 'BUY':
            crypto += round(btc['amount_eur'] * 100)
            crypto_buys += 1
        h = result['projection']['holdings_cents']
    assert crypto_buys > 1
    # Any small remaining shortfall is allowed to wait for the minimum; no
    # overshoot beyond one funded cycle is permitted in this flat-price case.
    assert crypto <= int(.1 * (total + 5000))
