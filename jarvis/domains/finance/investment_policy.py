"""Owner risk preferences are allocation constraints, not market research."""
from copy import deepcopy
import hashlib
import json
from math import isfinite

CRYPTO = ('btc', 'eth', 'sol', 'hype', 'tao')


def validate_policy(value):
    if not isinstance(value, dict) or set(value) != {'version', 'crypto_max_weight'}:
        raise ValueError('Investment policy requires version and crypto_max_weight only.')
    if value['version'] != 'core-satellite-v1':
        raise ValueError('Unsupported investment policy version.')
    cap = value['crypto_max_weight']
    if isinstance(cap, bool) or not isinstance(cap, (int, float)) or not isfinite(cap) or not 0 < cap < .5:
        raise ValueError('Crypto maximum must be greater than zero and less than half of invested assets.')
    return {'version':value['version'], 'crypto_max_weight':float(cap)}


def policy_digest(value):
    return hashlib.sha256(json.dumps(validate_policy(value), sort_keys=True,
                                   separators=(',', ':'), allow_nan=False).encode()).hexdigest()


def apply_policy(constitution):
    """Apply after dynamic targets; never change holdings or invent a risk ceiling."""
    if constitution.get('investment_policy') is None:
        return constitution
    policy = validate_policy(constitution['investment_policy'])
    result = deepcopy(constitution)
    weights = result['target_weights']
    previous = dict(weights)
    cap = policy['crypto_max_weight']
    total_crypto = sum(weights.get(a, 0) for a in CRYPTO)
    target = min(total_crypto, cap)
    # Preserve the configured mix within BTC/ETH/SOL. Unsupported satellite
    # targets are redirected to BTC; holdings themselves remain untouched.
    mix = {a:weights.get(a,0) for a in ('btc','eth','sol')}
    mix['btc'] += sum(weights.get(a,0) for a in ('hype','tao'))
    for asset in CRYPTO:
        weights[asset] = target * mix.get(asset,0) / total_crypto if total_crypto else 0.0
        result['asset_routes'][asset] = 'lhv_crypto'
    core = [a for a in weights if a not in CRYPTO and a != 'tactical_reserve']
    core_before = sum(previous.get(a,0) for a in core)
    core_after = 1 - weights.get('tactical_reserve',0) - target
    if core_before <= 0 or core_after <= .5:
        raise ValueError('The investment policy requires a majority non-crypto investment core.')
    remaining = core_after
    active = [a for a in core if previous[a] > 0]
    for asset in core:
        weights[asset] = 0.0
    # Preserve relative weights until a pre-existing ETF cap binds, then
    # redistribute the remainder across the other funded core sleeves.
    while active:
        denominator = sum(previous[a] for a in active)
        proposed = {a: remaining * previous[a] / denominator for a in active}
        capped = [a for a in active if proposed[a] >
                  result.get('sleeve_bands', {}).get(a, {}).get('max_weight', 1.0)]
        if not capped:
            weights.update(proposed)
            remaining = 0.0
            break
        for asset in capped:
            weights[asset] = result['sleeve_bands'][asset]['max_weight']
            remaining -= weights[asset]
            active.remove(asset)
    if remaining > 1e-10:
        raise ValueError('Configured core sleeve limits cannot accommodate this investment policy.')
    rules = result.setdefault('crypto_risk_rules', {})
    rules.update(total_crypto_hard_max=cap, btc_max=cap)
    for asset in CRYPTO:
        band = result.setdefault('sleeve_bands', {}).setdefault(asset, {})
        band['min_weight'] = min(band.get('min_weight', 0), weights[asset])
        band['max_weight'] = cap
    result['investment_policy_context'] = {
        'policy_sha256':policy_digest(policy), 'role':'long_term_speculative_satellite',
        'permitted_crypto':['btc','eth','sol'], 'crypto_max_weight':cap,
        'crypto_target_weight':target, 'automatic_selling':False,
        'target_basis':'Existing configured mix bounded by owner ceiling and sleeve limits; not an optimized return forecast.',
    }
    return result
