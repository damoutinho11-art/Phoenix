"""Pure, conservative weekly selection. Scores describe evidence, not forecasts."""
from datetime import date, timedelta
from math import isfinite, isnan, sqrt
from statistics import stdev
import re

POLICY_VERSION = 'evidence-buy-v1'
METHOD = ('Rank eligible choices within each lane: target gap 35%, 90-day return 20%, '
          '180-day return 20%, lower volatility 15%, smaller drawdown 10%. '
          'Require the same unique winner with risk-weighted weights 35/15/15/20/15. '
          'Scores are historical heuristics, not expected returns or probabilities.')
LIMITATIONS = ['Best-supported within the evaluated eligible universe, not globally optimal.',
               'Historical price behavior does not predict returns; valuation and holdings-level overlap are unmeasured.',
               'No automatic trades. Verify the final broker quote and fees before buying.']


def _number(value, minimum=0, maximum=float('inf')):
    if isinstance(value, bool):
        raise ValueError('Boolean is not numerical evidence.')
    number = float(value)
    if not isfinite(number) or not minimum <= number <= maximum:
        raise ValueError('Missing or invalid numerical evidence.')
    return number


def _recent(value, today, days):
    return 0 <= (today - date.fromisoformat(str(value)[:10])).days <= days


def measure_history(points, today, lane):
    calendar_days, max_gap, minimum = (365, 2, 175) if lane == 'crypto' else (252, 7, 110)
    series, seen, missing = [], set(), 0
    for point in points:
        day = date.fromisoformat(point['date'])
        if day >= today:
            continue
        if day in seen:
            raise ValueError('Duplicate historical close.')
        seen.add(day)
        if point.get('close') is None or isnan(float(point['close'])):
            missing += 1
            continue  # No interpolation: remaining real closes must pass gap/freshness gates.
        series.append((day, _number(point['close'], minimum=1e-12)))
    series.sort()
    if not series or (today - series[-1][0]).days > max_gap:
        raise ValueError('Completed close is stale or unavailable.')
    anchor = series[-1][0]
    starts = {}
    for days in (90, 180):
        eligible = [i for i, (day, _) in enumerate(series) if day <= anchor - timedelta(days=days)]
        if not eligible:
            raise ValueError('At least 180 calendar days of completed history are required.')
        index = eligible[-1]
        if (anchor - timedelta(days=days) - series[index][0]).days > max_gap:
            raise ValueError('Historical return anchor is missing.')
        starts[days] = index
    window = series[starts[180]:]
    if len(window) < minimum or any((b[0] - a[0]).days > max_gap for a, b in zip(window, window[1:])):
        raise ValueError('Historical coverage is incomplete.')
    returns = [b[1] / a[1] - 1 for a, b in zip(window, window[1:])]
    peak, drawdown = window[0][1], 0.0
    for _, value in window:
        peak = max(peak, value)
        drawdown = min(drawdown, value / peak - 1)
    values = {'return_90_pct': (series[-1][1] / series[starts[90]][1] - 1) * 100,
              'return_180_pct': (series[-1][1] / series[starts[180]][1] - 1) * 100,
              'volatility_pct': stdev(returns) * sqrt(calendar_days) * 100,
              'max_drawdown_pct': drawdown * 100}
    if any(not isfinite(v) for v in values.values()):
        raise ValueError('History produced invalid metrics.')
    return {**{k: round(v, 6) for k, v in values.items()},
            'last_close': anchor.isoformat(), 'observations': len(window), 'missing_closes': missing}


def _room(asset, lane, c, p, holdings, budget):
    target = _number(c['target_weights'].get(asset, 0), maximum=1)
    final_total = sum(holdings.values()) + budget
    if target <= 0 or final_total <= 0:
        raise ValueError('Outside the current mandate or phase; no target allocation.')
    route = c['asset_routes'].get(asset)
    if route != ('lhv_crypto' if lane == 'crypto' else 'lightyear'):
        raise ValueError('Evidence does not match the configured broker route.')
    if p.get('platform_status', {}).get(f'{route}_ready') is not True:
        raise ValueError('Broker route is not ready.')
    current = holdings.get(asset, 0)
    deficit = max(0, round(final_total * target) - current)
    cap = _number(c.get('sleeve_bands', {}).get(asset, {}).get('max_weight', target), maximum=1)
    room = min(deficit, max(0, int(final_total * cap) - current), budget)
    if lane == 'crypto':
        crypto_assets = set(c.get('crypto_universe', {})) | {'btc', 'eth', 'sol', 'hype', 'tao', 'discovery'}
        rules = c.get('crypto_risk_rules', {})
        total_room = max(0, int(final_total * _number(rules.get('total_crypto_hard_max', .225), maximum=1))
                         - sum(holdings.get(a, 0) for a in crypto_assets))
        weekly_cap = int(budget * _number(rules.get('max_total_crypto_buy_fraction_of_weekly_budget', .5), maximum=1))
        room = min(room, total_room, weekly_cap)
        if asset == 'btc':
            room = min(room, max(0, int(final_total * _number(rules.get('btc_max', .15), maximum=1)) - current))
        if asset in {'hype', 'tao'}:
            combined = holdings.get('hype', 0) + holdings.get('tao', 0)
            room = min(room, max(0, int(final_total * _number(rules.get('hype_tao_combined_max', .075), maximum=1)) - combined))
    minimum = max(1, round(_number(c.get('minimum_efficient_buys', {}).get(asset, 0)) * 100))
    if room < minimum:
        raise ValueError('No efficient buy fits the target, cash and risk limits.')
    return room, deficit / (final_total * target), minimum, route


def _evaluate(row, c, p, holdings, budget, today, *, require_positive_returns=True):
    result = {k: v for k, v in row.items() if k != 'history'}
    result.update(eligible=False, policy_eligible=False, score=None)
    try:
        asset, lane = row['asset'], row['lane']
        if lane not in {'etf', 'crypto'} or not row.get('symbol'):
            raise ValueError('Candidate identity is missing.')
        expected_lane = 'crypto' if asset in constitution_crypto_assets(c) else 'etf'
        if lane != expected_lane or (lane == 'etf' and asset not in {'global_core_etf', 'quality_etf', 'growth_nasdaq_etf'}):
            raise ValueError('Candidate lane does not match the portfolio mandate.')
        if lane == 'crypto' and asset not in {'btc', 'eth', 'sol', 'hype', 'tao'}:
            raise ValueError('Crypto asset is not supported by the current mandate and ledger.')
        if lane == 'crypto' and row['symbol'] != f'{asset.upper()}-EUR':
            raise ValueError('Crypto market identity does not match the asset and its research.')
        room, gap, minimum, route = _room(asset, lane, c, p, holdings, budget)
        if row.get('broker_available') is False:
            raise ValueError('Instrument is not available at the configured broker.')
        if lane == 'etf' and row.get('mandate_approved') is not True:
            raise ValueError('ETF sleeve and non-leveraged product mandate require review.')
        if row.get('currency') and row['currency'] != 'EUR':
            raise ValueError('Non-EUR instrument is outside this policy.')
        result['policy_eligible'] = True
        result['target_deficit_cents'] = max(0, round((sum(holdings.values()) + budget)
            * c['target_weights'][asset]) - holdings.get(asset, 0))
        if lane == 'crypto' and row.get('research_verdict') in {'REJECT', 'WATCH'}:
            result['policy_eligible'] = False
            raise ValueError('Validated research does not recommend buying this asset.')
        if row.get('currency') != 'EUR':
            raise ValueError('Verified EUR history and quote required.')
        if not row.get('source'):
            raise ValueError('Market evidence source is required.')
        if row.get('broker_verified') is not True or not row.get('broker_source') or not _recent(row.get('verified_at'), today, 1):
            raise ValueError('Current broker availability is unverified.')
        if not _recent(row.get('quote_date'), today, 2 if lane == 'crypto' else 7):
            raise ValueError('Quote and spread evidence is stale.')
        fee = _number(row.get('fee_pct'), maximum=10)
        spread = _number(row.get('spread_pct'), maximum=10)
        if lane == 'etf':
            if row.get('product_type') != 'ETF':
                raise ValueError('Current market metadata does not verify an ETF product.')
            if not re.fullmatch(r'[A-Z]{2}[A-Z0-9]{9}[0-9]', str(row.get('isin', ''))):
                raise ValueError('Verified ETF share-class identity required.')
            _number(row.get('fund_fee_pct'), maximum=5)
        elif (row.get('research_status') != 'EVIDENCE_STRONG'
              or row.get('research_verdict') != 'BUY_CANDIDATE'
              or not _recent(row.get('research_as_of'), today, 30)):
            raise ValueError('Recent validated BUY_CANDIDATE crypto risk research is required.')
        metrics = measure_history(row.get('history', []), today, lane)
        cost = 2 * fee + spread
        if require_positive_returns and min(metrics['return_90_pct'], metrics['return_180_pct']) <= cost:
            result['policy_eligible'] = False
            raise ValueError('Recent returns do not clear the estimated round-trip costs; wait.')
        result.update(eligible=True, reason='Eligible under cash, evidence and risk rules.',
                      metrics=metrics, gap_score=gap, room_cents=room, minimum_cents=minimum,
                      route=route, one_way_cost_pct=fee + spread / 2)
    except (ValueError, TypeError, KeyError, OverflowError) as exc:
        result['reason'] = str(exc) if isinstance(exc, ValueError) else 'Missing or invalid required evidence.'
    return result


def constitution_crypto_assets(constitution):
    return set(constitution.get('crypto_universe', {})) | {'btc', 'eth', 'sol', 'hype', 'tao', 'discovery'}


def _scores(rows):
    keys = ('gap_score', 'return_90_pct', 'return_180_pct', 'volatility_pct', 'max_drawdown_pct')
    for row in rows:
        components = []
        for key in keys:
            def value(item):
                n = item['gap_score'] if key == 'gap_score' else item['metrics'][key]
                return -n if key == 'volatility_pct' else n
            lower = sum(value(other) < value(row) - 1e-9 for other in rows)
            tied = sum(abs(value(other) - value(row)) <= 1e-9 for other in rows)
            components.append(100 * (lower + (tied - 1) / 2) / (len(rows) - 1) if len(rows) > 1 else 50)
        row['score_components'] = dict(zip(keys, components))
        row['score'] = round(sum(w * n for w, n in zip((.35, .2, .2, .15, .1), components)), 6)
        row['risk_weighted_score'] = round(sum(w * n for w, n in zip((.35, .15, .15, .2, .15), components)), 6)


def select_buys(candidates, constitution, portfolio_state, holdings, weekly_budget_cents, as_of):
    """Return one optional buy per lane; allocations are total cash outlay in cents."""
    budget = int(_number(weekly_budget_cents))
    if budget != weekly_budget_cents or any(v < 0 or not isfinite(v) for v in holdings.values()):
        raise ValueError('Nonnegative integer budget and valid holdings required.')
    allocations = {a: 0 for a in constitution['target_weights']}
    evaluations = [_evaluate(row, constitution, portfolio_state, holdings, budget, as_of) for row in candidates]
    # Duplicate provider rows must not influence percentile weights or resolve ties.
    identities = [(r.get('lane'), r.get('symbol')) for r in evaluations]
    for row, identity in zip(evaluations, identities):
        if identities.count(identity) > 1:
            row.update(eligible=False, reason='Duplicate candidate identity.')
    # A share class gets one ranking vote regardless of its number of venues.
    # Venue choice uses observed cost; a symbol tie-break only selects between
    # equivalent listings of the same fund, never between different investments.
    funds = {}
    for row in evaluations:
        if row.get('lane') == 'etf' and row['eligible']:
            funds.setdefault(row['isin'], []).append(row)
    for listings in funds.values():
        if len({r['asset'] for r in listings}) > 1:
            for row in listings:
                row.update(eligible=False, reason='Same share class assigned to conflicting portfolio sleeves.')
            continue
        preferred = min(listings, key=lambda r: (r['one_way_cost_pct'], r['symbol']))
        for row in listings:
            if row is not preferred:
                row.update(eligible=False, policy_eligible=False,
                           reason=f"Same share class evaluated through {preferred['symbol']} at no higher observed cost.")
    lanes, remaining = {}, budget
    for lane in ('crypto', 'etf'):
        rows = [r for r in evaluations if r.get('lane') == lane and r['eligible']]
        _scores(rows)
        ranked = sorted(rows, key=lambda r: -r['score'])
        result = {'status': 'WAIT', 'selected': None, 'amount_eur': 0,
                  'reason': 'No eligible candidate has complete evidence and available risk room.'}
        incomplete = [r for r in evaluations if r.get('lane') == lane and r.get('policy_eligible') and not r['eligible']]
        if incomplete:
            result['reason'] = 'Comparison incomplete: ' + '; '.join(f"{r.get('symbol')}: {r['reason']}" for r in incomplete)
        elif rows:
            leader = ranked[0]
            unique = sum(r['score'] == leader['score'] for r in rows) == 1
            risk_max = max(r['risk_weighted_score'] for r in rows)
            stable = leader['risk_weighted_score'] == risk_max and sum(r['risk_weighted_score'] == risk_max for r in rows) == 1
            if not unique or not stable:
                result['reason'] = 'No robust unique winner: tied scores or sensitivity to risk weights.'
            else:
                amount = min(remaining, leader['room_cents'])
                if amount >= leader['minimum_cents']:
                    allocations[leader['asset']] += amount
                    remaining -= amount
                    principal = int(amount / (1 + leader['one_way_cost_pct'] / 100))
                    result.update(status='BUY', selected=leader, amount_eur=amount / 100,
                                  principal_eur=principal / 100, estimated_cost_eur=(amount - principal) / 100,
                                  reason=f"{leader['symbol']} ranks first under both policies among {len(rows)} eligible {lane} choices; cash and risk limits determine the amount.")
                else:
                    result['reason'] = 'Remaining cash cannot support an efficient buy.'
        result['alternatives'] = [{'symbol': r.get('symbol'), 'asset': r.get('asset'), 'score': r.get('score'),
                                   'eligible': r['eligible'], 'reason': r['reason']}
                                  for r in evaluations if r.get('lane') == lane]
        lanes[lane] = result
    allocations['tactical_reserve'] = allocations.get('tactical_reserve', 0) + remaining
    from .portfolio_projection import finalize_selection
    return finalize_selection({'policy_version': POLICY_VERSION, 'as_of': as_of.isoformat(), 'method': METHOD,
            'limitations': list(LIMITATIONS), 'lanes': lanes, 'candidates': evaluations,
            'allocations_cents': allocations}, constitution, holdings, budget)
