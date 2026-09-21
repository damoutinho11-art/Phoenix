"""PHOENIX may renew a crypto review only by re-verifying its premises."""
from copy import deepcopy
from datetime import date, timedelta
import hashlib
import json

import pytest

from jarvis.domains.finance.investment_review import review_digest, validated_investment_review
from jarvis.domains.finance.review_renewal import RENEWAL_CHAIN_DAYS, plan_renewal, needs_renewal

POLICY_SHA = 'a' * 64
TODAY = date(2026, 9, 21)


def prior_review(reviewed='2026-09-13'):
    start = date.fromisoformat(reviewed)
    return {
        'version': 'crypto-investment-review-v1', 'asset': 'btc', 'strategy': 'long_term_spot_contribution',
        'reviewer': 'Phoenix owner-requested assistant research', 'reviewer_type': 'assistant_research',
        'reviewed_at': reviewed, 'valid_until': (start + timedelta(days=7)).isoformat(), 'verdict': 'BUY_CANDIDATE',
        'decision_basis': 'strategic_allocation', 'role': 'long_term_speculative_satellite', 'investment_policy_sha256': POLICY_SHA,
        'thesis': 'Conditional long-term BTC satellite within an ETF core.',
        'risks': ['Deep drawdowns.', 'Custody and broker access risk.'],
        'invalidation_conditions': ['Stop if cash authority fails.', 'Reassess if facts deteriorate.'],
        'alternatives': [{'asset': 'cash', 'reason': 'Liquidity.'}, {'asset': 'broad_etf', 'reason': 'Core role.'}],
        'sources': [
            {'url': 'https://bitcoin.org/en/faq', 'checked_at': reviewed, 'evidence_sha256': '1' * 64, 'role': 'protocol', 'claim': 'Scheduled supply.'},
            {'url': 'https://www.lhv.ee/en/crypto', 'checked_at': reviewed, 'evidence_sha256': '2' * 64, 'role': 'broker_cost', 'claim': 'LHV charges 0.5 percent.'},
            {'url': 'https://finance.yahoo.com/quote/BTC-EUR/', 'checked_at': reviewed, 'evidence_sha256': '3' * 64, 'role': 'market_risk', 'claim': 'Archived closes.'},
        ],
    }


def memo_and_records(review):
    memo = {'id': 10, 'asset': 'btc', 'verdict': review['verdict'], 'validation': {'investment_review': review}}
    digest = review_digest(review)
    records = [
        {'check_type': 'SOURCE_CONFIDENCE', 'field_name': 'external_source_review', 'status': 'PASS', 'raw_json': {'external_review_sha256': digest}},
        {'check_type': 'MANUAL_REVIEW', 'field_name': 'investment_thesis_review', 'status': 'PASS', 'raw_json': {'external_review_sha256': digest}},
    ]
    return memo, records


def fetch_ok(url):
    body = {'https://bitcoin.org/en/faq': b'Bitcoin supply is capped at 21 million.',
            'https://www.lhv.ee/en/crypto': b'LHV crypto: fee 0.5% per buy or sell.',
            'https://finance.yahoo.com/quote/BTC-EUR/': b'BTC-EUR quote page'}[url]
    return body


def metrics_ok(asset):
    return {'return_90_pct': 12.0, 'return_180_pct': 4.0, 'volatility_pct': 35.0, 'max_drawdown_pct': -26.0, 'last_close': '2026-09-20', 'observations': 181}


def test_needs_renewal_when_expired_or_expiring_within_two_days():
    assert needs_renewal(prior_review('2026-09-13'), TODAY) is True          # expired yesterday
    assert needs_renewal(prior_review('2026-09-15'), TODAY) is True          # valid until 22nd
    assert needs_renewal(prior_review('2026-09-18'), TODAY) is False         # valid until 25th


def test_renewal_reissues_a_valid_review_with_fresh_evidence_and_provenance():
    memo, records = memo_and_records(prior_review())
    plan = plan_renewal(memo, records, TODAY, policy_sha=POLICY_SHA, fetch_source=fetch_ok, market_metrics=metrics_ok)
    assert plan['renew'] is True, plan['reason']
    review = plan['review']
    assert review['reviewed_at'] == '2026-09-21' and review['valid_until'] == '2026-09-28'
    assert review['reviewer_type'] == 'phoenix_renewal'
    assert review['renews_review_sha256'] == review_digest(prior_review())
    assert review['origin_reviewed_at'] == '2026-09-13'
    assert review['verdict'] == 'BUY_CANDIDATE' and review['thesis'] == prior_review()['thesis']
    for source in review['sources']:
        assert source['checked_at'] == '2026-09-21'
        assert source['evidence_sha256'] == hashlib.sha256(fetch_ok(source['url'])).hexdigest()
    # The renewed review satisfies the production contract once bound.
    new_memo, new_records = memo_and_records(review)
    validated, reason = validated_investment_review(new_memo, new_records, TODAY)
    assert validated is not None, reason
    assert {c['name'] for c in plan['checks']} >= {'prior_review_valid', 'policy_unchanged', 'sources_refetched', 'broker_fee_present', 'market_risk_within_bounds', 'chain_age'}
    assert all(c['passed'] for c in plan['checks'])


@pytest.mark.parametrize('breaker, expected', [
    ('policy', 'policy'),
    ('fetch', 'bitcoin.org'),
    ('fee', 'fee'),
    ('drawdown', 'drawdown'),
    ('return', '90-day'),
    ('chain', 'assistant review'),
    ('reject', 'REJECT'),
])
def test_renewal_refuses_when_a_premise_fails(breaker, expected):
    review = prior_review('2026-09-13')
    policy = POLICY_SHA
    fetch = fetch_ok
    metrics = metrics_ok
    today = TODAY
    if breaker == 'policy':
        policy = 'b' * 64
    if breaker == 'fetch':
        def fetch(url):
            if 'bitcoin.org' in url:
                raise OSError('timeout')
            return fetch_ok(url)
    if breaker == 'fee':
        def fetch(url):
            return b'LHV crypto: new pricing' if 'lhv' in url else fetch_ok(url)
    if breaker == 'drawdown':
        def metrics(asset):
            return {**metrics_ok(asset), 'max_drawdown_pct': -52.0}
    if breaker == 'return':
        def metrics(asset):
            return {**metrics_ok(asset), 'return_90_pct': -41.0}
    if breaker == 'chain':
        review['origin_reviewed_at'] = (TODAY - timedelta(days=RENEWAL_CHAIN_DAYS + 1)).isoformat()
        review['reviewer_type'] = 'phoenix_renewal'
        review['renews_review_sha256'] = 'c' * 64
    if breaker == 'reject':
        review['verdict'] = 'REJECT'
    memo, records = memo_and_records(review)
    plan = plan_renewal(memo, records, today, policy_sha=policy, fetch_source=fetch, market_metrics=metrics)
    assert plan['renew'] is False
    assert expected.lower() in plan['reason'].lower(), plan['reason']
    assert plan['review'] is None


def test_contract_rejects_renewals_without_chain_binding_or_beyond_chain_age():
    review = prior_review('2026-09-21')
    review.update(reviewer_type='phoenix_renewal', reviewer='PHOENIX scheduled renewal')
    memo, records = memo_and_records(review)
    assert validated_investment_review(memo, records, TODAY)[0] is None
    review.update(renews_review_sha256='d' * 64, origin_reviewed_at='2026-07-01')
    memo, records = memo_and_records(review)
    validated, reason = validated_investment_review(memo, records, TODAY)
    assert validated is None and 'assistant review' in reason
    review['origin_reviewed_at'] = '2026-09-01'
    memo, records = memo_and_records(review)
    assert validated_investment_review(memo, records, TODAY)[0] is not None


def test_renewal_is_deterministic_for_identical_inputs():
    memo, records = memo_and_records(prior_review())
    a = plan_renewal(memo, records, TODAY, policy_sha=POLICY_SHA, fetch_source=fetch_ok, market_metrics=metrics_ok)
    b = plan_renewal(deepcopy(memo), deepcopy(records), TODAY, policy_sha=POLICY_SHA, fetch_source=fetch_ok, market_metrics=metrics_ok)
    assert json.dumps(a['review'], sort_keys=True) == json.dumps(b['review'], sort_keys=True)
