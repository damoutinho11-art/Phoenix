"""Long-term contribution policy: target shortfall, then verified cost.

No forecast or claim of superior returns. Historical risk remains explanatory.
"""
import re
from math import isfinite
from .buy_selection import _evaluate, _number, _recent, LIMITATIONS
from .fund_cost_evidence import independent_cost_floor, conflicting_fund_cost

POLICY_VERSION = 'contribution-v2'


def _cost(row, horizon):
    friction = row['one_way_cost_pct']
    return row['fund_fee_pct'] + friction / horizon if row['lane'] == 'etf' else friction


def _known_cost_floor(row, today):
    """Even free execution cannot offset a higher verified annual fund fee."""
    try:
        if row.get('evidence_conflict') or row.get('currency') != 'EUR' or row.get('product_type') != 'ETF':
            return None
        independent = independent_cost_floor(row,today)
        if independent:
            return independent
        if (row.get('broker_verified') is not True
            or not row.get('broker_source') or not _recent(row.get('verified_at'), today, 1)
            or row.get('product_type') != 'ETF'
            or not re.fullmatch(r'[A-Z]{2}[A-Z0-9]{9}[0-9]', str(row.get('isin', '')))):
            return None
        return {'annual_fee_pct':_number(row.get('fund_fee_pct'), maximum=5),
                'isin':row['isin'],'source':row['broker_source'],'verified_at':row['verified_at']}
    except (TypeError, ValueError):
        return None


def select_contributions(candidates, constitution, portfolio_state, holdings,
                         weekly_budget_cents, as_of, *, horizon_years):
    try:
        horizon = _number(horizon_years, minimum=1, maximum=50)
    except (TypeError, ValueError):
        horizon = None
    budget = int(_number(weekly_budget_cents))
    if budget != weekly_budget_cents or any(v < 0 or not isfinite(v) for v in holdings.values()):
        raise ValueError('Nonnegative integer budget and valid holdings required.')
    evaluations = [_evaluate(row, constitution, portfolio_state, holdings, budget, as_of,
                              require_positive_returns=False) for row in candidates]
    identities = [(r.get('lane'), r.get('symbol')) for r in evaluations]
    for row, identity in zip(evaluations, identities):
        if row.get('lane') == 'etf' and conflicting_fund_cost(row,as_of):
            row.update(eligible=False,evidence_conflict=True,
                       reason='Independent exchange and broker fund identity or annual fee evidence is conflicting.')
        if identities.count(identity) > 1:
            row.update(eligible=False, reason='Duplicate candidate identity.')
    funds = {}
    for row in evaluations:
        if row.get('lane') == 'etf' and row['eligible']:
            funds.setdefault(row['isin'], []).append(row)
    for listings in funds.values():
        if (len({r['asset'] for r in listings}) > 1
                or len({round(r['fund_fee_pct'], 10) for r in listings}) > 1):
            for row in listings:
                row.update(eligible=False, evidence_conflict=True,
                           reason='Same share class has conflicting sleeve or annual fee evidence.')
        else:
            cheapest = min(listings, key=lambda r: (r['one_way_cost_pct'], r['symbol']))
            for row in listings:
                if row is not cheapest:
                    row.update(eligible=False, policy_eligible=False,
                               reason=f"Equivalent share class compared through {cheapest['symbol']}.")
    allocations = {a: 0 for a in constitution['target_weights']}
    lanes, remaining = {}, budget
    for lane in ('crypto', 'etf'):
        policy_rows = [r for r in evaluations if r.get('lane') == lane and r['policy_eligible']]
        priority = max((r['target_deficit_cents'] for r in policy_rows), default=0)
        contenders = [r for r in policy_rows if r['target_deficit_cents'] == priority]
        horizon_missing = lane == 'etf' and horizon is None
        eligible = [r for r in contenders if r['eligible']] if not horizon_missing else []
        for row in eligible:
            row['comparison_cost_pct'] = _cost(row, horizon)
        leader = min(eligible, key=lambda r: r['comparison_cost_pct']) if eligible else None
        unresolved = []
        for row in contenders:
            if row['eligible']:
                continue
            floor = _known_cost_floor(row, as_of) if lane == 'etf' else None
            if (leader and floor is not None and floor['isin'] != leader.get('isin')
                and floor['annual_fee_pct'] > leader['comparison_cost_pct'] + 1e-9):
                row['reason'] += ' Verified annual fee lower bound exceeds the selected total cost estimate, even with free execution.'
                row['cost_floor_exclusion'] = floor
            else:
                unresolved.append(row)
        decision = {'status': 'WAIT', 'selected': None, 'amount_eur': 0,
                    'reason': 'No mandate-eligible instrument has verified evidence and contribution room.'}
        research_blocked = [r for r in evaluations if r.get('lane') == lane
                            and r.get('target_deficit_cents', 0) > 0
                            and r.get('research_verdict') in {'WATCH', 'REJECT'}]
        if research_blocked:
            decision['reason'] = 'Research does not support a contribution: ' + '; '.join(
                f"{r['symbol']}: {r['reason']}" for r in research_blocked)
        if horizon_missing:
            decision['reason'] = 'Configure a valid investment horizon (1–50 years) before comparing long-term ETF costs.'
        elif unresolved:
            decision['reason'] = 'Comparison incomplete for the largest target shortfall: ' + '; '.join(
                f"{r['symbol']}: {r['reason']}" for r in unresolved)
        elif leader:
            tied = [r for r in eligible if abs(r['comparison_cost_pct'] - leader['comparison_cost_pct']) < 1e-9]
            amount = min(remaining, leader['room_cents'])
            if len(tied) > 1:
                decision['reason'] = 'Equivalent target shortfalls and costs; no unique instrument choice.'
            elif amount < leader['minimum_cents']:
                decision['reason'] = 'Remaining cash cannot support an efficient contribution.'
            else:
                allocations[leader['asset']] += amount
                remaining -= amount
                principal = int(amount / (1 + leader['one_way_cost_pct'] / 100))
                reason = (f"{leader['symbol']} fills the largest eligible {lane} target shortfall "
                          f"(€{priority / 100:.2f}) with the lowest verified comparison cost. "
                          'Recent returns do not forecast the next winner or veto the contribution.')
                if lane == 'etf':
                    reason += (f" Cost comparison: current annual fund fee plus estimated entry costs divided by "
                               f"the configured {horizon:g}-year horizon; future fees may change.")
                decision.update(status='BUY', selected=leader, amount_eur=amount/100,
                                principal_eur=principal/100, estimated_cost_eur=(amount-principal)/100,
                                reason=reason)
        decision['alternatives'] = [{'symbol': r.get('symbol'), 'asset': r.get('asset'),
            'eligible': r['eligible'], 'reason': r['reason'],
            'target_deficit_cents': r.get('target_deficit_cents'),
            'comparison_cost_pct': r.get('comparison_cost_pct'),
            **({'cost_floor_exclusion':r['cost_floor_exclusion']} if 'cost_floor_exclusion' in r else {})
            } for r in evaluations if r.get('lane') == lane]
        lanes[lane] = decision
    allocations['tactical_reserve'] = allocations.get('tactical_reserve', 0) + remaining
    from .portfolio_projection import finalize_selection
    return finalize_selection({'policy_version': POLICY_VERSION, 'as_of': as_of.isoformat(),
            'method': 'Largest eligible target shortfall first, then lowest verified cost. No return forecast.',
            'horizon_years': horizon, 'limitations': list(LIMITATIONS), 'lanes': lanes,
            'candidates': evaluations, 'allocations_cents': allocations}, constitution, holdings, budget)
