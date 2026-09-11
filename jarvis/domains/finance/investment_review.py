"""Dated research assertions bound to validation records, never trade approval."""
from datetime import date
import hashlib
import ipaddress
import json
import re
from urllib.parse import urlsplit


def review_digest(review):
    return hashlib.sha256(json.dumps(review, sort_keys=True, separators=(',', ':'),
                                    allow_nan=False).encode()).hexdigest()


def validated_investment_review(memo, records, today):
    """Return (review, reason). A hash binds assertions; it does not verify truth."""
    try:
        review = memo.get('validation', {}).get('investment_review')
        if not isinstance(review, dict):
            return None, 'A dated external investment review is required.'
        if len(json.dumps(review, allow_nan=False).encode()) > 65536:
            raise ValueError('Investment review exceeds the archive size limit.')
        if review.get('version') != 'crypto-investment-review-v1':
            raise ValueError('Unsupported investment review version.')
        if review.get('asset') not in {'btc', 'eth', 'sol', 'hype', 'tao'} or review['asset'] != memo.get('asset'):
            raise ValueError('Investment review asset does not match.')
        start = date.fromisoformat(review['reviewed_at'])
        end = date.fromisoformat(review['valid_until'])
        if not start <= today <= end or not 0 <= (end-start).days <= 7:
            raise ValueError('Investment review is expired or has invalid dates.')
        if review.get('strategy') != 'long_term_spot_contribution' or review.get('reviewer_type') != 'assistant_research':
            raise ValueError('Unsupported investment review scope.')
        if review.get('verdict') not in {'BUY_CANDIDATE', 'WATCH', 'REJECT'}:
            raise ValueError('Investment review verdict is invalid.')

        def text(value):
            return isinstance(value, str) and 0 < len(value.strip()) <= 10000

        if not all(text(review.get(key)) for key in ('reviewer', 'thesis')):
            raise ValueError('Investment review needs an author and thesis.')
        for key in ('risks', 'invalidation_conditions'):
            values = review.get(key)
            if not isinstance(values, list) or len(values) < 2 or not all(text(v) for v in values):
                raise ValueError('Investment review needs risks and invalidation conditions.')
        alternatives = review.get('alternatives')
        if not isinstance(alternatives, list) or len(alternatives) < 2 or not all(
                isinstance(v, dict) and text(v.get('asset')) and text(v.get('reason')) for v in alternatives):
            raise ValueError('Investment review needs alternatives.')
        assets = {v['asset'] for v in alternatives}
        if 'cash' not in assets or not assets - {'cash', review['asset']}:
            raise ValueError('Investment review must compare cash and another asset.')
        sources = review.get('sources')
        if not isinstance(sources, list):
            raise ValueError('Investment review needs sources.')
        roles = set()
        for source in sources:
            url = urlsplit(source['url'])
            host = url.hostname or ''
            if url.scheme != 'https' or '.' not in host or url.username or url.password or host.endswith(('.local', '.localhost')):
                raise ValueError('Investment review needs public HTTPS sources.')
            try:
                address = ipaddress.ip_address(host)
            except ValueError:
                address = None
            if address is not None and not address.is_global:
                raise ValueError('Investment review source cannot be a private address.')
            checked = date.fromisoformat(source['checked_at'])
            if not 0 <= (start-checked).days <= 7 or not text(source.get('claim')) or not re.fullmatch(r'[0-9a-f]{64}', source.get('evidence_sha256', '')):
                raise ValueError('Investment review source evidence is incomplete or stale.')
            roles.add(source['role'])
        if not {'protocol', 'broker_cost', 'market_risk'} <= roles:
            raise ValueError('Investment review needs protocol, broker cost and market risk sources.')
        if not records or any(r.get('status') != 'PASS' for r in records):
            raise ValueError('Investment review has unresolved validation checks.')
        digest = review_digest(review)
        bound = {(r.get('check_type'), r.get('field_name')) for r in records
                 if r.get('raw_json', {}).get('external_review_sha256') == digest}
        if not {('SOURCE_CONFIDENCE', 'external_source_review'),
                ('MANUAL_REVIEW', 'investment_thesis_review')} <= bound:
            raise ValueError('Investment review is not bound to both required checks.')
        return review, 'Current dated external research; investment outperformance is unproven.'
    except (ValueError, TypeError, KeyError, AttributeError) as exc:
        return None, str(exc) if isinstance(exc, ValueError) else 'Investment review is malformed.'
