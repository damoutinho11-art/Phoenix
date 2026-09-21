"""Scheduled renewal of dated crypto investment reviews.

A renewal is not a new judgment. PHOENIX re-issues a human-authored review
for another seven days only after re-verifying its premises today: same
owner policy, sources still fetchable (re-hashed), broker fee still stated,
market risk inside the review's own reassessment bounds, and a chain no
older than RENEWAL_CHAIN_DAYS since the human review. Any failed premise
refuses the renewal and says why. See docs/superpowers/specs/
2026-09-21-crypto-review-renewal-design.md.
"""
from __future__ import annotations

from copy import deepcopy
from datetime import date, timedelta
import hashlib
import re

from .investment_review import RENEWAL_CHAIN_DAYS, review_digest, validated_investment_review

RENEWAL_VALID_DAYS = 7
RENEW_WITHIN_DAYS = 2
MAX_DRAWDOWN_PCT = -45.0
MIN_RETURN_90_PCT = -35.0
RENEWABLE_VERDICTS = {'BUY_CANDIDATE', 'WATCH'}
REVIEWER = 'PHOENIX scheduled renewal'


def needs_renewal(review: dict, today: date) -> bool:
    """True when the review has expired or expires within RENEW_WITHIN_DAYS."""
    try:
        end = date.fromisoformat(review['valid_until'])
    except (KeyError, TypeError, ValueError):
        return False
    return (end - today).days <= RENEW_WITHIN_DAYS


def _check(name: str, passed: bool, detail: str) -> dict:
    return {'name': name, 'passed': bool(passed), 'detail': detail}


def plan_renewal(memo: dict, records: list, today: date, *, policy_sha: str | None,
                 fetch_source, market_metrics) -> dict:
    """Return {'renew', 'reason', 'review', 'checks'} without persisting anything.

    fetch_source(url) -> bytes; market_metrics(asset) -> measure_history-style dict.
    """
    checks: list[dict] = []
    prior = (memo.get('validation') or {}).get('investment_review')
    if not isinstance(prior, dict):
        return {'renew': False, 'reason': 'No prior investment review to renew.', 'review': None, 'checks': checks}

    # 1. The prior review must have been valid on its own terms.
    try:
        as_of = date.fromisoformat(prior['valid_until'])
    except (KeyError, TypeError, ValueError):
        return {'renew': False, 'reason': 'Prior review has invalid dates.', 'review': None, 'checks': checks}
    validated, reason = validated_investment_review(memo, records, as_of)
    checks.append(_check('prior_review_valid', validated is not None, reason))
    if validated is None:
        return {'renew': False, 'reason': f'Prior review did not validate: {reason}', 'review': None, 'checks': checks}
    if prior.get('verdict') not in RENEWABLE_VERDICTS:
        checks.append(_check('verdict_renewable', False, f"verdict {prior.get('verdict')}"))
        return {'renew': False, 'reason': f"A {prior.get('verdict')} review is not renewed automatically.", 'review': None, 'checks': checks}
    checks.append(_check('verdict_renewable', True, prior['verdict']))

    # 6. Chain age (checked early: no point fetching if a human review is due).
    origin = prior.get('origin_reviewed_at') or prior.get('reviewed_at')
    try:
        age = (today - date.fromisoformat(origin)).days
    except (TypeError, ValueError):
        age = RENEWAL_CHAIN_DAYS + 1
    checks.append(_check('chain_age', 0 <= age <= RENEWAL_CHAIN_DAYS, f'{age} days since the assistant review'))
    if not 0 <= age <= RENEWAL_CHAIN_DAYS:
        return {'renew': False, 'reason': f'Renewal chain is {age} days old; a fresh assistant review is required.', 'review': None, 'checks': checks}

    # 2. Owner policy unchanged.
    same_policy = bool(policy_sha) and prior.get('investment_policy_sha256') == policy_sha
    checks.append(_check('policy_unchanged', same_policy, 'owner investment policy digest'))
    if not same_policy:
        return {'renew': False, 'reason': 'Owner investment policy changed since the review; a new review is required.', 'review': None, 'checks': checks}

    # 3 + 4. Sources re-fetched and re-hashed today; broker fee still stated.
    sources = []
    fee_seen = False
    for source in prior.get('sources') or []:
        url = source['url']
        try:
            body = fetch_source(url)
        except Exception as exc:  # network, TLS, size — all mean "cannot re-verify"
            checks.append(_check('sources_refetched', False, f'{url}: {exc.__class__.__name__}'))
            return {'renew': False, 'reason': f'Source could not be re-fetched today: {url}', 'review': None, 'checks': checks}
        if not isinstance(body, (bytes, bytearray)) or not body:
            checks.append(_check('sources_refetched', False, f'{url}: empty response'))
            return {'renew': False, 'reason': f'Source returned no content: {url}', 'review': None, 'checks': checks}
        if source.get('role') == 'broker_cost':
            fee_seen = bool(re.search(r'0[.,]5\s*%|0[.,]5 percent', body.decode('utf-8', errors='replace'), re.I))
        sources.append({**source, 'checked_at': today.isoformat(),
                        'evidence_sha256': hashlib.sha256(bytes(body)).hexdigest(),
                        'hash_scope': 'Public response bytes fetched at renewal.'})
    checks.append(_check('sources_refetched', True, f'{len(sources)} sources re-hashed'))
    checks.append(_check('broker_fee_present', fee_seen, 'broker page still states the 0.5% fee'))
    if not fee_seen:
        return {'renew': False, 'reason': 'Broker fee statement no longer found on the broker page; a human must re-read it.', 'review': None, 'checks': checks}

    # 5. Market risk within the review's reassessment bounds.
    try:
        metrics = market_metrics(prior['asset']) or {}
        r90 = float(metrics['return_90_pct']); dd = float(metrics['max_drawdown_pct'])
    except Exception as exc:
        checks.append(_check('market_risk_within_bounds', False, f'metrics unavailable: {exc.__class__.__name__}'))
        return {'renew': False, 'reason': 'Market history could not be measured today.', 'review': None, 'checks': checks}
    within = r90 > MIN_RETURN_90_PCT and dd > MAX_DRAWDOWN_PCT
    checks.append(_check('market_risk_within_bounds', within, f'90-day {r90:.1f}%, drawdown {dd:.1f}%'))
    if not within:
        why = f'drawdown {dd:.1f}% beyond {MAX_DRAWDOWN_PCT:.0f}%' if dd <= MAX_DRAWDOWN_PCT else f'90-day return {r90:.1f}% below {MIN_RETURN_90_PCT:.0f}%'
        return {'renew': False, 'reason': f'Market risk moved outside the review bounds ({why}); reassess before renewing.', 'review': None, 'checks': checks}

    review = deepcopy(prior)
    review.update({
        'reviewed_at': today.isoformat(),
        'valid_until': (today + timedelta(days=RENEWAL_VALID_DAYS)).isoformat(),
        'reviewer': REVIEWER,
        'reviewer_type': 'phoenix_renewal',
        'renews_review_sha256': review_digest(prior),
        'origin_reviewed_at': origin,
        'sources': sources,
        'renewal_metrics': {k: metrics.get(k) for k in ('return_90_pct', 'return_180_pct', 'volatility_pct', 'max_drawdown_pct', 'last_close', 'observations')},
    })
    return {'renew': True, 'reason': 'All premises re-verified today.', 'review': review, 'checks': checks}


def renewal_records(review: dict, checks: list[dict]) -> list[dict]:
    """The two binding checks the contract requires, marked as PHOENIX-generated."""
    digest = review_digest(review)
    raw = {'external_review_sha256': digest, 'generated_by': 'phoenix_renewal',
           'renews_review_sha256': review.get('renews_review_sha256'), 'premise_checks': checks}
    common = {'asset': review['asset'], 'status': 'PASS', 'confidence': 'medium',
              'source_primary': 'PHOENIX scheduled renewal of dated assistant research',
              'notes': 'Premises of the prior review re-verified today; this is a renewal, not a new judgment.',
              'raw_json': raw}
    return [
        {**common, 'check_type': 'SOURCE_CONFIDENCE', 'field_name': 'external_source_review'},
        {**common, 'check_type': 'MANUAL_REVIEW', 'field_name': 'investment_thesis_review'},
    ]
