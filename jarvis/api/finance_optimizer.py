"""Research orchestration only. Never creates an executable finance brief."""
from copy import deepcopy
from math import isfinite

from jarvis.api.buy_recommendation import load_selection_evidence
from jarvis.data import database
from jarvis.domains.finance import engine
from jarvis.domains.finance.market_data import detect_market_regime
from jarvis.domains.finance.optimizer_evidence import (
    reconcile_holdings, eligible_candidates, fetch_histories, prepare_snapshot,
    replay_snapshot, snapshot_digest,
)
from jarvis.domains.finance.portfolio_optimizer import VERSION, LIMITATIONS
from jarvis.domains.finance.portfolio_downside import downside_config, compare_downside

VALIDATION_ASSESSMENT = (
    'Initial conditional study (January 2024 to September 2026): this model earned lower returns '
    'than broad-ETF and 80/20 ETF/Bitcoin contribution baselines, with only a modest reduction '
    'in drawdown. It has not earned promotion to live recommendations.'
)


def _json_safe(value):
    if isinstance(value, float) and not isfinite(value):
        return str(value)
    if isinstance(value, dict):
        return {k: _json_safe(v) for k,v in value.items()}
    if isinstance(value, (list, tuple)):
        return [_json_safe(v) for v in value]
    return value


def run_optimizer(constitution, state, profile, authority, today, *, week_closed=False):
    result = {'model_version': VERSION, 'as_of': today.isoformat(), 'status': 'INSUFFICIENT_DATA',
        'promotion_status': 'NOT_VALIDATED', 'selected_plan': None, 'blockers': [], 'limitations': list(LIMITATIONS),
        'validation_assessment': VALIDATION_ASSESSMENT}
    if week_closed:
        return {**result, 'status': 'WEEK_CLOSED', 'blockers': ['This contribution window is already closed.']}
    if authority.get('data_ready') is not True:
        return {**result, 'blockers': authority.get('blockers') or ['Cash-flow authority is not verified.']}
    blockers = engine.portfolio_state_freshness_blockers(state)
    if blockers:
        return {**result, 'blockers': blockers}
    try:
        holdings, identities = reconcile_holdings(state)
        budget = engine.cents(authority['weekly_budget_eur'])
        if budget <= 0:
            raise ValueError('No new verified contribution is available.')
        c = engine.expand_evidence_constitution(constitution)
        sleeve_holdings = engine.investable_holdings(c, state)
        if sum(holdings.values()) != sum(sleeve_holdings.values()):
            raise ValueError('Instrument totals do not match the authoritative investable portfolio.')
        regime = detect_market_regime(state)
        if regime == 'unknown':
            raise ValueError('Current phase eligibility cannot be verified without market regime data.')
        phase = engine.detect_portfolio_phase(sum(holdings.values())/100, profile)
        targets = engine.get_dynamic_targets(c, profile, regime, int(profile.get('personal', {}).get('age',30)), phase)
        c['target_weights'] = engine.compute_asset_target_weights(targets,c,phase)
        evidence = load_selection_evidence(c, today)
        if evidence.get('coverage', {}).get('truncated'):
            raise ValueError('Candidate universe was truncated; comparison is incomplete.')
        rows = eligible_candidates(evidence.get('candidates', []), c, state, sleeve_holdings, budget, today)
        symbols = set(holdings)-{'CASH'} | {r['symbol'] for r in rows if r['eligible']}
        records = fetch_histories(symbols, today) if any(r['eligible'] for r in rows) else {}
        histories = {s:r['history'] for s,r in records.items()}
        provenance = {'identities': identities, 'coverage': evidence.get('coverage', {}),
            'history_sources': {s:{k:v for k,v in r.items() if k != 'history'} for s,r in records.items()},
            'phase': phase, 'regime_for_phase_eligibility': regime,
            'valuation_as_of': state.get('prices_refreshed_at'),
            'eligibility_constitution': c, 'platform_status': state.get('platform_status', {}),
            'eligibility_evidence': evidence.get('candidates', [])}
        snapshot = _json_safe(prepare_snapshot(holdings, rows, histories, budget, today,
            profile.get('risk_profile', {}), provenance))
        snapshot['downside_configuration'] = downside_config(snapshot)
        result = replay_snapshot(snapshot)
        result['downside_comparison'] = compare_downside(snapshot,result)
        result['limitations'] = [line for line in result['limitations']
            if 'hypothetical crashes and forward-looking macro stress tests' not in line]
        result['limitations'].extend([
            'The allocator uses historical risk; separate illustrative stress comparisons do not change its chosen allocations.',
            'The investment horizon amortizes entry costs; this one-period model does not optimize terminal wealth over the full investment horizon.'])
        result['validation_assessment'] = VALIDATION_ASSESSMENT
        assumed = [r for r in identities if str(r['identity_source']).startswith('legacy_ticker_mapping')]
        if assumed:
            result['limitations'].append('Legacy ticker mappings are assumed identities; confirm them against broker records before promotion.')
        result['identity_assumptions'] = assumed
        result['input_sha256'] = snapshot_digest(snapshot)
        result['run_id'] = database.save_optimizer_run(result['input_sha256'], snapshot, deepcopy(result))
        return result
    except (ValueError, KeyError, TypeError, OverflowError) as exc:
        return {**result, 'status': 'INSUFFICIENT_DATA', 'selected_plan': None, 'blockers': [str(exc)]}
