"""Scheduled renewal end to end: expired review → new active VALIDATED memo the selector accepts."""
from datetime import date, timedelta
import hashlib

import pytest

from jarvis.data import database
from jarvis.domains.finance.investment_review import review_digest, validated_investment_review
from jarvis.domains.finance.review_renewal import renewal_records
from jarvis.api import review_renewal_runner as runner

TODAY = date(2026, 9, 21)
POLICY_SHA = 'e' * 64


def _review(reviewed: str, **extra):
    start = date.fromisoformat(reviewed)
    review = {
        'version': 'crypto-investment-review-v1', 'asset': 'btc', 'strategy': 'long_term_spot_contribution',
        'reviewer': 'Phoenix owner-requested assistant research', 'reviewer_type': 'assistant_research',
        'reviewed_at': reviewed, 'valid_until': (start + timedelta(days=7)).isoformat(), 'verdict': 'BUY_CANDIDATE',
        'decision_basis': 'strategic_allocation', 'role': 'long_term_speculative_satellite', 'investment_policy_sha256': POLICY_SHA,
        'thesis': 'Conditional long-term BTC satellite.', 'risks': ['Drawdowns.', 'Custody.'],
        'invalidation_conditions': ['Stop if authority fails.', 'Reassess if facts change.'],
        'alternatives': [{'asset': 'cash', 'reason': 'Liquidity.'}, {'asset': 'broad_etf', 'reason': 'Core.'}],
        'sources': [
            {'url': 'https://bitcoin.org/en/faq', 'checked_at': reviewed, 'evidence_sha256': '1' * 64, 'role': 'protocol', 'claim': 'Supply.'},
            {'url': 'https://www.lhv.ee/en/crypto', 'checked_at': reviewed, 'evidence_sha256': '2' * 64, 'role': 'broker_cost', 'claim': 'Fee 0.5%.'},
            {'url': 'https://finance.yahoo.com/quote/BTC-EUR/', 'checked_at': reviewed, 'evidence_sha256': '3' * 64, 'role': 'market_risk', 'claim': 'Closes.'},
        ],
    }
    review.update(extra)
    return review


def _seed(review):
    memo_id = database.create_research_memo({
        'asset': 'btc', 'sleeve': None, 'title': 'BTC review', 'thesis': review['thesis'], 'risks': review['risks'],
        'data_confidence': 'MEDIUM', 'verdict': review['verdict'], 'sources': review['sources'],
        'validation': {'investment_review': review}, 'status': 'active', 'notes': None,
    })
    digest = review_digest(review)
    for check_type, field in (('SOURCE_CONFIDENCE', 'external_source_review'), ('MANUAL_REVIEW', 'investment_thesis_review')):
        database.create_research_validation_record({'memo_id': memo_id, 'asset': 'btc', 'check_type': check_type, 'field_name': field,
                                                    'status': 'PASS', 'confidence': 'medium', 'raw_json': {'external_review_sha256': digest}})
    database.update_research_memo_quality(memo_id, 'VALIDATED', 'seeded', {}, new_status='active')
    return memo_id


@pytest.fixture
def db(tmp_path, monkeypatch):
    monkeypatch.setattr(database, 'DB_PATH', tmp_path / 'renewal.db')
    database.init_db()
    monkeypatch.setattr(runner, 'current_policy_sha', lambda: POLICY_SHA)
    return database


def fetch(url):
    return {'https://bitcoin.org/en/faq': b'21 million', 'https://www.lhv.ee/en/crypto': b'fee 0.5% per trade',
            'https://finance.yahoo.com/quote/BTC-EUR/': b'quote'}[url]


def metrics(asset):
    return {'return_90_pct': 9.0, 'return_180_pct': 3.0, 'volatility_pct': 34.0, 'max_drawdown_pct': -25.0, 'last_close': '2026-09-20', 'observations': 181}


def test_expired_review_is_renewed_into_a_memo_the_selector_accepts(db):
    old_id = _seed(_review('2026-09-13'))
    report = runner.run_review_renewals(TODAY, fetch_source=fetch, market_metrics=metrics)
    row = next(r for r in report['results'] if r['asset'] == 'btc')
    assert row['action'] == 'renewed' and row['renews_memo_id'] == old_id and row['valid_until'] == '2026-09-28'

    active = database.find_active_research_memo_for_leg('btc', None)
    assert active['id'] == row['memo_id'] and active['id'] != old_id
    records = database.list_research_validation_records_by_memo_id(active['id'])
    validated, reason = validated_investment_review(active, records, TODAY)
    assert validated is not None, reason
    assert validated['reviewer_type'] == 'phoenix_renewal'
    assert all(r['raw_json']['generated_by'] == 'phoenix_renewal' for r in records)
    assert validated['sources'][1]['evidence_sha256'] == hashlib.sha256(b'fee 0.5% per trade').hexdigest()

    # Idempotent: a second run the same day has nothing to do.
    again = runner.run_review_renewals(TODAY, fetch_source=fetch, market_metrics=metrics)
    assert next(r for r in again['results'] if r['asset'] == 'btc')['action'] == 'skipped'


def test_refused_renewal_leaves_the_prior_memo_untouched(db):
    old_id = _seed(_review('2026-09-13'))

    def broken(url):
        raise OSError('unreachable')

    report = runner.run_review_renewals(TODAY, fetch_source=broken, market_metrics=metrics)
    row = next(r for r in report['results'] if r['asset'] == 'btc')
    assert row['action'] == 'refused' and 're-fetched' in row['reason']
    assert database.find_active_research_memo_for_leg('btc', None)['id'] == old_id


def test_still_valid_review_is_left_alone_unless_forced(db):
    _seed(_review('2026-09-19'))
    report = runner.run_review_renewals(TODAY, fetch_source=fetch, market_metrics=metrics)
    assert next(r for r in report['results'] if r['asset'] == 'btc')['action'] == 'skipped'
    forced = runner.run_review_renewals(TODAY, fetch_source=fetch, market_metrics=metrics, force=True)
    assert next(r for r in forced['results'] if r['asset'] == 'btc')['action'] == 'renewed'


def test_chain_ends_after_eight_weeks(db):
    origin = (TODAY - timedelta(days=57)).isoformat()
    _seed(_review('2026-09-13', reviewer_type='phoenix_renewal', reviewer='PHOENIX scheduled renewal',
                  renews_review_sha256='f' * 64, origin_reviewed_at=origin))
    report = runner.run_review_renewals(TODAY, fetch_source=fetch, market_metrics=metrics)
    row = next(r for r in report['results'] if r['asset'] == 'btc')
    assert row['action'] == 'refused' and 'assistant review' in row['reason']
