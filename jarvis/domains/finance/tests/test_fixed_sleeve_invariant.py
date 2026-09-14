"""A fixed sleeve is exogenous: the statistical optimizer may never resize it.

Excluding a holding from covariance estimation is not enough. If the search could
still trade it, the optimizer would be making an allocation decision about an
instrument it admits it cannot model. Any future money going there must come from
the policy and band engine saying so explicitly, never from this objective.
"""
from datetime import timedelta
import numpy as np
import pytest

from jarvis.domains.finance.portfolio_optimizer import optimize_portfolio
from jarvis.domains.finance.tests.test_portfolio_optimizer import history, row, TODAY

FIXED = 'LHVEVF'
HOLDINGS = {'CASH': 100000, 'VWCE.DE': 400000, 'BTC-EUR': 200000, FIXED: 300000}
BUDGET = 50000


def run(returns, *, tolerance=40, holdings=None):
    histories = {'VWCE.DE': history(returns), 'BTC-EUR': history(returns[::-1])}
    return optimize_portfolio(holdings or HOLDINGS,
                              [row('VWCE.DE'), row('BTC-EUR', 'crypto')],
                              histories, BUDGET, TODAY, horizon_years=20,
                              drawdown_tolerance_pct=tolerance, fixed_symbols=[FIXED])


# Deliberately extreme and contradictory return regimes. If the fixed sleeve's
# amount were reachable by the objective at all, one of these would move it.
REGIMES = {
    'strong gains': [.03, .02]*65,
    'severe losses': [-.03, -.02]*65,
    'high volatility': [.25, -.2]*65,
    'near zero': [.0001, -.0001]*65,
    'flat': [0.0]*130,
    'mixed drift': [.004, -.001]*65,
}


@pytest.mark.parametrize('label', sorted(REGIMES))
def test_no_return_regime_can_move_the_fixed_sleeve(label):
    result = run(REGIMES[label])
    fixed = {f['symbol']: f for f in result['fixed_sleeves']}
    assert fixed[FIXED]['value_cents'] == HOLDINGS[FIXED]

    considered = result.get('ranked_plans') or []
    plans = [*considered, result['cash_alternative']]
    assert plans, f'{label}: no plan was evaluated'
    for plan in plans:
        # No trade may name it, and its value must survive untouched.
        assert all(trade['symbol'] != FIXED for trade in plan['trades'])
        share = plan['weights_pct'][FIXED]/100
        assert share*plan['net_value_cents'] == pytest.approx(HOLDINGS[FIXED], abs=1)


def test_the_fixed_amount_is_identical_across_every_regime():
    """The amount is exogenous, so it cannot vary with the objective at all."""
    amounts = set()
    for returns in REGIMES.values():
        result = run(returns)
        for plan in [*(result.get('ranked_plans') or []), result['cash_alternative']]:
            amounts.add(round(plan['weights_pct'][FIXED]/100*plan['net_value_cents']))
    assert amounts == {HOLDINGS[FIXED]}


@pytest.mark.parametrize('tolerance', [1, 5, 40, 99])
def test_no_drawdown_tolerance_can_liquidate_the_fixed_sleeve(tolerance):
    """Even when the screen rejects every plan, the sleeve is never sold down."""
    result = run(REGIMES['high volatility'], tolerance=tolerance)
    fixed = {f['symbol']: f for f in result['fixed_sleeves']}
    assert fixed[FIXED]['value_cents'] == HOLDINGS[FIXED]
    assert all(trade['symbol'] != FIXED
               for plan in [*(result.get('ranked_plans') or []), result['cash_alternative']]
               for trade in plan['trades'])


def test_a_fixed_sleeve_may_not_also_be_a_contribution_candidate():
    """Buying into a sleeve the model cannot estimate is a contradiction."""
    result = optimize_portfolio(
        HOLDINGS, [row('VWCE.DE'), {**row(FIXED), 'symbol': FIXED}],
        {'VWCE.DE': history(REGIMES['mixed drift'])}, BUDGET, TODAY,
        horizon_years=20, drawdown_tolerance_pct=40, fixed_symbols=[FIXED])
    assert result['status'] == 'INSUFFICIENT_DATA'
    assert any('cannot also be a contribution candidate' in b for b in result['blockers'])


def test_the_fixed_sleeve_contributes_no_estimated_risk_or_return():
    result = run(REGIMES['mixed drift'])
    assert FIXED not in result['correlations']
    assert all(FIXED not in row_ for row_ in result['correlations'].values())


def test_removing_the_fixed_sleeve_changes_only_scale_not_the_chosen_trades():
    """Its presence must not steer the decision among the estimated assets."""
    with_sleeve = run(REGIMES['mixed drift'])
    without = optimize_portfolio(
        {k: v for k, v in HOLDINGS.items() if k != FIXED},
        [row('VWCE.DE'), row('BTC-EUR', 'crypto')],
        {'VWCE.DE': history(REGIMES['mixed drift']),
         'BTC-EUR': history(REGIMES['mixed drift'][::-1])},
        BUDGET, TODAY, horizon_years=20, drawdown_tolerance_pct=40)
    assert with_sleeve['status'] == without['status'] == 'RESEARCH_READY'
    assert [t['symbol'] for t in with_sleeve['selected_plan']['trades']] \
        == [t['symbol'] for t in without['selected_plan']['trades']]


def test_the_modeled_path_starts_at_the_full_portfolio_value():
    """A missing sleeve weight would open every path with a phantom drawdown."""
    flat = run(REGIMES['flat'])
    # With flat returns and no trades the portfolio cannot draw down at all.
    assert flat['cash_alternative']['historical_drawdown_pct'] == pytest.approx(0, abs=1e-9)
