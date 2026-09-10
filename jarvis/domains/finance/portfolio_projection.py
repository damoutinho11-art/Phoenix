"""Pure cash-conserving projections and explicit post-cost constraint checks."""
from decimal import Decimal

from .buy_selection import _number, constitution_crypto_assets


def _cents(value):
    amount = Decimal(str(_number(value))) * 100
    if amount != amount.to_integral_value():
        raise ValueError('Monetary amounts must use whole cents.')
    return int(amount)


def project_plan(holdings, budget, lanes):
    if int(_number(budget)) != budget:
        raise ValueError('Budget must use whole cents.')
    projected = dict(holdings)
    if any(int(_number(v)) != v for v in projected.values()):
        raise ValueError('Holdings must use nonnegative whole cents.')
    outlay = cost = 0
    increments = {}
    for decision in lanes.values():
        if decision.get('status') != 'BUY':
            continue
        asset = decision['selected']['asset']
        cash, principal, fee = (_cents(decision[k]) for k in
                                ('amount_eur', 'principal_eur', 'estimated_cost_eur'))
        if principal + fee != cash or principal <= 0:
            raise ValueError('Cash outlay must equal positive principal plus estimated costs.')
        projected[asset] = projected.get(asset, 0) + principal
        increments[asset] = increments.get(asset, 0) + principal
        outlay += cash
        cost += fee
    if outlay > budget:
        raise ValueError('Plan exceeds available contribution cash.')
    reserve = budget - outlay
    projected['tactical_reserve'] = projected.get('tactical_reserve', 0) + reserve
    increments['tactical_reserve'] = increments.get('tactical_reserve', 0) + reserve
    return {'holdings_cents': projected, 'principal_increments_cents': increments,
            'net_total_cents': sum(projected.values()), 'estimated_cost_cents': cost,
            'purchase_outlay_cents': outlay, 'unspent_contribution_cents': reserve}


def _violations(projection, constitution):
    h, total = projection['holdings_cents'], projection['net_total_cents']
    rules = constitution.get('crypto_risk_rules', {})
    limits = [('total_crypto', constitution_crypto_assets(constitution), rules.get('total_crypto_hard_max', .225)),
              ('btc', {'btc'}, rules.get('btc_max', .15)),
              ('hype_tao', {'hype', 'tao'}, rules.get('hype_tao_combined_max', .075))]
    limits += [(asset, {asset}, band['max_weight']) for asset, band in
               constitution.get('sleeve_bands', {}).items() if 'max_weight' in band]
    return [{'constraint': name, 'assets': sorted(assets),
             'weight_pct': round(sum(h.get(a, 0) for a in assets) / total * 100, 6) if total else 0,
             'limit_pct': _number(limit, maximum=1) * 100}
            for name, assets, limit in limits
            if sum(h.get(a, 0) for a in assets) > total * _number(limit, maximum=1) + 1e-8]


def _describe(projection, constitution):
    total = projection['net_total_cents']
    weights = {a: v / total if total else 0 for a, v in projection['holdings_cents'].items()}
    targets = constitution['target_weights']
    # Half L1 distance is the fraction of value that differs from target weights.
    distance = .5 * sum(abs(weights.get(a, 0) - targets.get(a, 0)) for a in set(weights) | set(targets))
    return {**projection, 'weights_pct': {a: round(v*100, 6) for a, v in weights.items()},
            'target_distance_pct': round(distance*100, 6),
            'crypto_weight_pct': round(sum(weights.get(a, 0) for a in constitution_crypto_assets(constitution))*100, 6),
            'constraint_breaches': _violations(projection, constitution)}


def finalize_selection(selection, constitution, holdings, budget):
    """Preserve chosen instruments unless complete-plan costs breach a buy cap."""
    # Withholding a leg refunds its entire outlay. At most two legs can be removed.
    for _ in range(len(selection['lanes'])):
        projection = project_plan(holdings, budget, selection['lanes'])
        breaches = _violations(projection, constitution)
        blocked = []
        for lane, decision in selection['lanes'].items():
            row = decision.get('selected')
            if not row:
                continue
            affected = [b for b in breaches if row['asset'] in b['assets']]
            if affected:
                blocked.append((decision, affected))
        if not blocked:
            break
        for decision, affected in blocked:
            decision.update(status='WAIT', selected=None, amount_eur=0,
                            principal_eur=0, estimated_cost_eur=0,
                            reason='Complete portfolio post-cost limits prevent this buy: ' +
                                   ', '.join(b['constraint'] for b in affected) + '.')
    projection = project_plan(holdings, budget, selection['lanes'])
    allocations = {a: 0 for a in constitution['target_weights']}
    for decision in selection['lanes'].values():
        if decision.get('selected'):
            asset = decision['selected']['asset']
            allocations[asset] = allocations.get(asset, 0) + _cents(decision['amount_eur'])
    allocations['tactical_reserve'] = projection['unspent_contribution_cents']
    selection['allocations_cents'] = allocations
    selection['projection'] = projection
    alternatives = []
    for row in selection['candidates']:
        if not row['eligible']:
            continue
        outlay = min(budget, row['room_cents'])
        principal = int(outlay / (1 + row['one_way_cost_pct']/100))
        leg = {'status': 'BUY', 'selected': row, 'amount_eur': outlay/100,
               'principal_eur': principal/100, 'estimated_cost_eur': (outlay-principal)/100}
        alternatives.append({'symbol': row['symbol'], 'asset': row['asset'],
                             'cash_outlay_cents': outlay,
                             **_describe(project_plan(holdings, budget, {row['lane']: leg}), constitution)})
    selection['decision_comparison'] = {
        'selected_plan': _describe(projection, constitution),
        'cash_alternative': _describe(project_plan(holdings, budget, {}), constitution),
        'standalone_candidates': alternatives, 'performance_validated': False,
        'unmeasured': ['holdings_overlap', 'portfolio_covariance', 'tax_effects',
                       'expected_returns', 'stress_scenario_losses'],
        'method': 'Accounting comparison against retaining the same contribution in cash. '
                  'Candidate alternatives invest alone up to their verified room; combinations are not optimized. '
                  'Target distance is half the sum of absolute differences from configured weights; lower is closer, not a return forecast.'}
    return selection
