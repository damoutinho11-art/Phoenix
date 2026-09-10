"""Research-only whole-portfolio contribution search; no execution authority."""
from datetime import date, timedelta
from itertools import product

import numpy as np

from .buy_selection import _number

VERSION = 'portfolio-regret-v1'
SCENARIOS = tuple(product((.25, .5, .75), (2., 4., 6.)))
LIMITATIONS = [
    'Research challenger: no validated investment outperformance or execution authority.',
    'Historical means, covariance and drawdowns are uncertain estimates, not forecasts or loss guarantees.',
    'The risk screen uses historical paths only; hypothetical crashes and forward-looking macro stress tests are not implemented.',
    'Daily ETF and crypto closes are not synchronized intraday; weekly alignment reduces but does not remove this mismatch.',
    'Price correlation is not issuer-level holdings overlap. Taxes, liquidity depth and future cash interest are unmodeled.',
    'Search is limited to one ETF and one crypto per contribution at 10% budget increments; no sales or full-portfolio rebalancing.',
]


def weekly_panel(histories, symbols, today, *, minimum_returns=104):
    """Use common actual dates in completed weeks; never interpolate prices."""
    last_friday = today - timedelta(days=(today.weekday()-4) % 7)
    if last_friday >= today:
        last_friday -= timedelta(days=7)
    series = {}
    for symbol in symbols:
        points, seen = {}, set()
        for point in histories.get(symbol, []):
            day = date.fromisoformat(point['date'])
            if day > last_friday:
                continue
            if day in seen:
                raise ValueError(f'{symbol}: duplicate close date.')
            seen.add(day)
            if point.get('close') is None:
                continue
            points[day] = _number(point['close'], minimum=1e-12)
        if not points or (today-max(points)).days > 10:
            raise ValueError(f'{symbol}: current completed history is missing.')
        series[symbol] = points
    if not symbols:
        raise ValueError('No evidenced investment histories to compare.')
    common = sorted(set.intersection(*(set(s) for s in series.values())))
    weeks = {}
    for day in common:
        week_end = day + timedelta(days=(4-day.weekday()) % 7)
        weeks[week_end] = day
    dates = sorted(weeks.values())
    if (len(dates) <= minimum_returns or (today-dates[-1]).days > 10
            or any((b-a).days > 10 for a,b in zip(dates, dates[1:]))):
        raise ValueError(f'At least {minimum_returns} continuous, completed weekly returns are required for all held instruments.')
    levels = np.array([[series[s][day] for s in symbols] for day in dates], dtype=float)
    with np.errstate(over='ignore', invalid='ignore'):
        returns = levels[1:] / levels[:-1] - 1
    if not np.isfinite(returns).all():
        raise ValueError('History produced invalid returns.')
    return dates, levels, returns


def _plans(holdings, rows, budget, symbols):
    etfs = [None] + [r for r in rows if r['lane'] == 'etf']
    crypto = [None] + [r for r in rows if r['lane'] == 'crypto']
    seen = set()
    for etf, coin in product(etfs, crypto):
        for e,c in product(range(11) if etf else (0,), range(11) if coin else (0,)):
            if e+c > 10:
                continue
            outlays = [(row, budget*n//10) for row,n in ((etf,e),(coin,c)) if row and n]
            if any(amount < row['minimum_cents'] for row,amount in outlays):
                continue
            identity = tuple(sorted((row['symbol'],amount) for row,amount in outlays))
            if identity in seen:
                continue
            seen.add(identity)
            trades, projected = [], dict(holdings)
            cost = spent = 0
            for row, amount in outlays:
                principal = int(amount/(1+row['one_way_cost_pct']/100))
                fee = amount-principal
                if principal <= 0:
                    break
                projected[row['symbol']] = projected.get(row['symbol'], 0)+principal
                trades.append({'symbol': row['symbol'], 'asset': row['asset'], 'lane': row['lane'],
                               'cash_outlay_cents': amount, 'principal_cents': principal,
                               'estimated_cost_cents': fee})
                spent += amount
                cost += fee
            else:
                projected['CASH'] = projected.get('CASH', 0)+budget-spent
                total = sum(projected.values())
                if total <= 0:
                    continue
                yield {'trades': trades, 'net_value_cents': total, 'estimated_cost_cents': cost,
                       'unspent_contribution_cents': budget-spent,
                       'weights_pct': {s: round(projected.get(s, 0)/total*100, 8) for s in [*symbols, 'CASH']}}, [projected.get(s,0)/total for s in symbols], projected.get('CASH',0)/total


def optimize_portfolio(holdings_cents, candidates, histories, budget_cents, as_of,
                       *, horizon_years, drawdown_tolerance_pct):
    result = {'model_version': VERSION, 'as_of': as_of.isoformat(), 'status': 'INSUFFICIENT_DATA',
              'promotion_status': 'NOT_VALIDATED', 'selected_plan': None, 'blockers': [],
              'limitations': list(LIMITATIONS), 'excluded_candidates': []}
    try:
        if len(candidates) > 40 or len(holdings_cents) > 60:
            raise ValueError('Instrument limit exceeded; comparison cannot be truncated.')
        horizon = _number(horizon_years, minimum=1, maximum=50)
        tolerance = _number(drawdown_tolerance_pct, minimum=1, maximum=99)
        budget = int(_number(budget_cents))
        if budget != budget_cents or any(int(_number(v)) != v for v in holdings_cents.values()):
            raise ValueError('Holdings and contribution must use nonnegative whole cents.')
        holdings = {s:v for s,v in holdings_cents.items() if v or s == 'CASH'}
        if sum(holdings.values())+budget <= 0:
            raise ValueError('No portfolio value or contribution is available.')
        rows = []
        for row in candidates:
            if not row.get('eligible'):
                result['excluded_candidates'].append({'symbol': row.get('symbol'), 'reason': row.get('reason', 'Evidence gate failed.')})
                continue
            try:
                if row['lane'] not in {'etf','crypto'} or row['symbol'] == 'CASH':
                    raise ValueError('Unsupported candidate identity.')
                _number(row['one_way_cost_pct'], maximum=15)
                minimum = _number(row['minimum_cents'], minimum=1)
                if int(minimum) != minimum:
                    raise ValueError('Minimum buy must use whole cents.')
                weekly_panel(histories, [row['symbol']], as_of)
                rows.append(row)
            except (KeyError, ValueError, TypeError) as exc:
                result['excluded_candidates'].append({'symbol': row.get('symbol'), 'reason': str(exc)})
        if len({r['symbol'] for r in rows}) != len(rows):
            raise ValueError('Duplicate candidate identity must be reconciled before optimization.')
        if not rows:
            raise ValueError('No candidate has sufficient verified history.')
        symbols = sorted((set(holdings)-{'CASH'}) | {r['symbol'] for r in rows})
        dates, levels, returns = weekly_panel(histories, symbols, as_of)
        with np.errstate(over='ignore', invalid='ignore'):
            relative_levels = levels/levels[0]
            covariance = np.atleast_2d(np.cov(returns, rowvar=False, ddof=1))*52
            means = returns.mean(axis=0)*52
        if not all(np.isfinite(v).all() for v in (relative_levels, covariance, means)):
            raise ValueError('History produced invalid risk calculations.')
        plans, weights, cash_weights = zip(*_plans(holdings, rows, budget, symbols))
        weights, cash_weights = np.array(weights), np.array(cash_weights)
        variances = np.einsum('ij,jk,ik->i', weights, covariance, weights)
        mean_proxy = weights @ means
        values = weights @ relative_levels.T + cash_weights[:,None]
        wealth_ratio = np.array([p['net_value_cents'] for p in plans])/(sum(holdings.values())+budget)
        values = np.column_stack((np.ones(len(plans)), values*wealth_ratio[:,None]))
        drawdowns = (1-values/np.maximum.accumulate(values,axis=1)).max(axis=1)*100
        feasible = drawdowns <= tolerance+1e-9
        costs = np.array([p['estimated_cost_cents'] for p in plans])/(sum(holdings.values())+budget)/horizon
        utility = np.array([shrink*mean_proxy-gamma*.5*variances-costs for shrink,gamma in SCENARIOS])
        if not all(np.isfinite(v).all() for v in (variances, values, drawdowns, utility)):
            raise ValueError('History produced invalid risk calculations.')
        covariance_diag = np.sqrt(np.maximum(np.diag(covariance), 0))
        denominator = np.outer(covariance_diag, covariance_diag)
        correlations = np.divide(covariance, denominator, out=np.zeros_like(covariance), where=denominator>0)
        result.update(evaluated_plans=len(plans), feasible_plans=int(feasible.sum()),
            observations=len(returns), history_start=dates[0].isoformat(), history_end=dates[-1].isoformat(),
            horizon_years=horizon, drawdown_tolerance_pct=tolerance,
            correlations={s:{t:round(float(correlations[i,j]),6) if denominator[i,j] else None
                              for j,t in enumerate(symbols)} for i,s in enumerate(symbols)},
            method='Minimize worst regret across nine shrinkage/risk-aversion assumptions; modeled historical drawdown screen; no fixed asset allocation ceilings.')
        for i, plan in enumerate(plans):
            plan.update(volatility_pct=round(float(np.sqrt(max(variances[i],0))*100),6),
                        historical_drawdown_pct=round(float(drawdowns[i]),6),
                        annual_mean_proxy_pct=round(float(mean_proxy[i]*100),6))
        result['cash_alternative'] = next(p for p in plans if not p['trades'])
        if not feasible.any():
            result.update(status='RISK_REVIEW', blockers=['No buy-only contribution plan meets the modeled drawdown tolerance; existing holdings may require review.'])
            return result
        best_by_scenario = utility[:,feasible].max(axis=1)
        regret = (best_by_scenario[:,None]-utility).max(axis=0)
        regret[~feasible] = np.inf
        winners = np.flatnonzero(np.abs(regret-np.min(regret)) <= 1e-10)
        order = np.argsort(regret,kind='stable')[:min(5,int(feasible.sum()))]
        result['ranked_plans'] = [{**plans[i], 'worst_regret_pct': round(float(regret[i]*100),8)} for i in order]
        result['scenario_winners'] = []
        for index,(shrink,gamma) in enumerate(SCENARIOS):
            preferred = np.flatnonzero(feasible & (np.abs(utility[index]-best_by_scenario[index]) <= 1e-10))
            result['scenario_winners'].append({'mean_shrinkage':shrink, 'risk_aversion':gamma,
                'equivalent_plans':len(preferred), 'example_trades':plans[preferred[0]]['trades']})
        if len(winners) != 1:
            result.update(status='AMBIGUOUS', blockers=['Distinct plans have equivalent minimax regret; no unique recommendation.'])
        else:
            result.update(status='RESEARCH_READY', selected_plan=result['ranked_plans'][0])
    except (ValueError, TypeError, KeyError, OverflowError) as exc:
        result['blockers'].append(str(exc))
    return result
