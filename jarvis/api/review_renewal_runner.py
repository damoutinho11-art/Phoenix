"""Run scheduled crypto review renewals against the database.

Pure planning lives in jarvis.domains.finance.review_renewal; this module
supplies the live fetchers, persists an accepted renewal as a new active
VALIDATED memo with its two binding records, and reports every decision.
It never edits portfolio state, ledger rows or briefs.
"""
from __future__ import annotations

from datetime import date, timedelta
from urllib.request import Request, urlopen

from jarvis.core import clock
from jarvis.data import database
from jarvis.data.investment_policy import get_policy
from jarvis.domains.finance import engine
from jarvis.domains.finance.investment_policy import policy_digest
from jarvis.domains.finance.review_renewal import needs_renewal, plan_renewal, renewal_records

RENEWABLE_ASSETS = ('btc', 'eth', 'sol')
_SYMBOLS = {'btc': 'BTC-EUR', 'eth': 'ETH-EUR', 'sol': 'SOL-EUR'}


def fetch_public_bytes(url: str) -> bytes:
    request = Request(url, headers={'User-Agent': 'Phoenix scheduled review renewal'})
    with urlopen(request, timeout=10) as response:
        body = response.read(2_000_001)
    if len(body) > 2_000_000:
        raise ValueError('Public document exceeds size limit.')
    return body


def measured_crypto_metrics(asset: str, today: date) -> dict:
    """Same adjusted daily closes and measurement the buy selector uses for BTC/ETH/SOL."""
    import yfinance as yf  # noqa: PLC0415
    from jarvis.domains.finance.buy_selection import measure_history  # noqa: PLC0415
    # Crypto candles close at UTC midnight; never count the current UTC day as completed.
    history_end = min(today, clock.utc_now().date())
    frame = yf.Ticker(_SYMBOLS[asset]).history(start=(today - timedelta(days=400)).isoformat(),
                                               end=history_end.isoformat(), interval='1d', auto_adjust=True, timeout=8)
    history = [{'date': index.date().isoformat(), 'close': float(value)} for index, value in frame['Close'].items()]
    return measure_history(history, today, 'crypto')


def current_policy_sha() -> str | None:
    try:
        policy = get_policy()
    except Exception:
        return None
    if policy is None:
        constitution = engine.load_json(engine.DEFAULT_CONSTITUTION_PATH)
        policy = constitution.get('investment_policy')
    return policy_digest(policy) if policy else None


def persist_renewal(prior_memo: dict, review: dict, checks: list[dict], today: date) -> int:
    records = renewal_records(review, checks)
    memo_id = database.create_research_memo({
        'asset': review['asset'],
        'sleeve': prior_memo.get('sleeve'),
        'title': f"{review['asset'].upper()} review renewal {today.isoformat()}",
        'thesis': review['thesis'],
        'risks': review['risks'],
        'data_confidence': prior_memo.get('data_confidence') or 'MEDIUM',
        'verdict': review['verdict'],
        'sources': review['sources'],
        'validation': {**(prior_memo.get('validation') or {}), 'investment_review': review,
                       'renewal_of_memo_id': prior_memo.get('id')},
        'status': 'active',
        'notes': f"PHOENIX scheduled renewal of memo {prior_memo.get('id')}; premises re-verified, no new judgment.",
    })
    for record in records:
        database.create_research_validation_record({**record, 'memo_id': memo_id})
    database.update_research_memo_quality(
        memo_id, 'VALIDATED', 'Scheduled renewal: prior review premises re-verified today.',
        {'generated_by': 'phoenix_renewal', 'renews_memo_id': prior_memo.get('id'), 'checks': checks},
        new_status='active',
    )
    return memo_id


def run_review_renewals(today: date | None = None, *, fetch_source=fetch_public_bytes,
                        market_metrics=None, force: bool = False) -> dict:
    """Renew expiring reviews for each renewable asset; return a per-asset report."""
    today = today or clock.today()
    metrics = market_metrics or (lambda asset: measured_crypto_metrics(asset, today))
    policy_sha = current_policy_sha()
    report = {'as_of': today.isoformat(), 'results': []}
    for asset in RENEWABLE_ASSETS:
        memo = database.find_active_research_memo_for_leg(asset, None)
        review = ((memo or {}).get('validation') or {}).get('investment_review')
        if not memo or not isinstance(review, dict):
            report['results'].append({'asset': asset, 'action': 'skipped', 'reason': 'No active review to renew.'})
            continue
        if not force and not needs_renewal(review, today):
            report['results'].append({'asset': asset, 'action': 'skipped', 'reason': f"Valid until {review.get('valid_until')}.", 'memo_id': memo['id']})
            continue
        records = database.list_research_validation_records_by_memo_id(memo['id'])
        plan = plan_renewal(memo, records, today, policy_sha=policy_sha, fetch_source=fetch_source, market_metrics=metrics)
        if not plan['renew']:
            report['results'].append({'asset': asset, 'action': 'refused', 'reason': plan['reason'], 'memo_id': memo['id'], 'checks': plan['checks']})
            continue
        new_id = persist_renewal(memo, plan['review'], plan['checks'], today)
        report['results'].append({'asset': asset, 'action': 'renewed', 'memo_id': new_id, 'renews_memo_id': memo['id'],
                                  'valid_until': plan['review']['valid_until'], 'checks': plan['checks']})
    return report
