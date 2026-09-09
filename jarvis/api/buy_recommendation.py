"""Bridge public evidence and validated research into the existing recommendation."""
from copy import deepcopy
import hashlib
import json
import os
from fastapi import HTTPException
from jarvis.data import database
from jarvis.domains.finance.buy_evidence import fetch_evidence


def decision_signature(response):
    """Bind a manual approval to dated choices, amounts and evidence, not a week."""
    selection = response.get('buy_selection')
    if not selection:
        return None
    snapshot = {'week_budget': response.get('week_budget'),
                'policy_version': selection['policy_version'], 'as_of': selection['as_of'],
                'lanes': selection['lanes']}
    return hashlib.sha256(json.dumps(snapshot, sort_keys=True, allow_nan=False).encode()).hexdigest()


def brief_matches_decision(brief, response):
    try:
        stored = json.loads((brief or {}).get('full_brief_json') or '{}')
        signature = decision_signature(response)
        return bool(signature and decision_signature(stored) == signature)
    except (ValueError, TypeError, KeyError):
        return False


def evidence_mode():
    mode = os.getenv('PHOENIX_FINANCE_SELECTION_MODE', 'legacy').strip().lower()
    if mode not in {'legacy', 'evidence_v1', 'contribution_v2'}:
        raise HTTPException(status_code=503, detail='Finance selection policy is not configured correctly.')
    return mode != 'legacy'


def load_selection_evidence(constitution, today):
    policy = ('contribution-v2' if os.getenv('PHOENIX_FINANCE_SELECTION_MODE', '').strip().lower()
              == 'contribution_v2' else 'evidence-buy-v1')
    try:
        evidence = fetch_evidence(constitution, today)
    except Exception:
        return {'candidates': [], 'policy_version': policy, 'error': 'Selection evidence is unavailable.'}
    evidence = deepcopy(evidence)
    evidence['policy_version'] = policy
    for candidate in evidence.get('candidates', []):
        if candidate.get('lane') != 'crypto':
            continue
        candidate.update(research_status='NO_EVIDENCE', research_as_of=None, research_verdict=None)
        try:
            memo = database.find_active_research_memo_for_leg(candidate['asset'], None)
            if memo:
                summary = database.get_research_memo_evidence_summary(memo['id'])
                records = database.list_research_validation_records_by_memo_id(memo['id'])
                dates = [str(r.get('created_at', '')) for r in records]
                dates.append(str(memo.get('research_quality_checked_at') or ''))
                candidate.update(research_status=summary['evidence_status'],
                                 research_verdict=memo.get('verdict'),
                                 research_as_of=min(dates) if dates and all(dates) else None)
        except Exception:
            candidate.update(research_status='NO_EVIDENCE', research_as_of=None, research_verdict=None)
    return evidence


def selected_instrument(selection, asset):
    for lane, decision in selection['lanes'].items():
        row = decision.get('selected')
        if row and row['asset'] == asset:
            candidate = {**row, 'label': row.get('name', row['symbol']),
                         'broker_availability_status': 'public_verified', 'selected': True,
                         'market_data_source': row.get('source'), 'fetch_status': 'ok'}
            return {'display_name': candidate['label'], 'ticker': row['symbol'],
                    'isin': row.get('isin'), 'platform': 'Lightyear' if lane == 'etf' else 'LHV Crypto',
                    'confirmation_required': True, 'resolved_candidate': candidate,
                    'checklist_candidate': candidate, 'research_winner': candidate,
                    'research_winner_is_checklist_candidate': True,
                    'broker_verification': 'public_verified', 'candidates': [candidate],
                    'resolution_reason': decision['reason']}
    return {}


def selection_rationale(selection):
    parts = []
    for lane, decision in selection['lanes'].items():
        prefix = f"{lane.upper()} — "
        row = decision.get('selected')
        if row:
            metrics = row['metrics']
            parts.append(prefix + f"Buy {row['symbol']}, cash budget €{decision['amount_eur']:.2f} "
                         f"including estimated costs €{decision['estimated_cost_eur']:.2f}. "
                         f"90-day return {metrics['return_90_pct']:.2f}%, 180-day return {metrics['return_180_pct']:.2f}%, "
                         f"drawdown {metrics['max_drawdown_pct']:.2f}%. Last completed close: {metrics['last_close']}. {decision['reason']}")
            if metrics.get('missing_closes'):
                parts.append(f"{metrics['missing_closes']} empty provider closes omitted; no prices filled in, and coverage limits still passed.")
            if row.get('broker_execution_quote') is False:
                parts.append(f"Costs use {row.get('quote_venue', 'a reference market spread')}; confirm the actual broker quote before buying.")
        else:
            parts.append(prefix + 'WAIT. ' + decision['reason'])
    return '\n'.join(parts) + '\nBest-supported within the evaluated universe; future returns are uncertain.'
