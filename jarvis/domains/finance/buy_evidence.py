"""Bounded public market evidence. No account, portfolio or execution requests."""
from concurrent.futures import ThreadPoolExecutor, wait
from copy import deepcopy
from datetime import datetime, timedelta, timezone
from html import unescape
import json
import httpx
from math import isfinite
import re
from threading import Lock
from time import monotonic
from urllib.request import Request, urlopen

from .market_data import ETF_CANDIDATE_TICKERS, TICKER_MAP
from .lightyear_catalog import verify_lightyear_candidate, _public_candidate_url
from .fund_cost_evidence import exchange_url, parse_exchange_cost

_pool = ThreadPoolExecutor(max_workers=8, thread_name_prefix='public-buy-evidence')
_lock = Lock()
_cache = {}
LHV_URL = 'https://www.lhv.ee/en/crypto/'
LIGHTYEAR_PRICING = 'https://lightyear.com/en-eu/pricing'


def clear_cache():
    with _lock:
        _cache.clear()


def candidate_universe(constitution):
    candidates = []
    for asset, rows in ETF_CANDIDATE_TICKERS.items():
        for row in rows:
            # Only EUR venue listings are eligible for this EUR-only policy.
            candidates.append({**row, 'asset': asset, 'lane': 'etf', 'name': row['label'], 'mandate_approved': True})
    for asset, config in constitution.get('crypto_universe', {}).items():
        symbol = config.get('ticker_yahoo') or TICKER_MAP.get(asset)
        candidates.append({'asset': asset, 'lane': 'crypto', 'symbol': symbol,
                           'name': config.get('name', asset.upper()), 'platform': config.get('platform')})
    for row in constitution.get('evidence_candidates', []):
        # Extra fund mappings require an explicit reviewed share class and risk
        # description; a sleeve label alone must not admit leveraged products.
        extra = deepcopy(row)
        if extra.get('lane') == 'etf':
            review = extra.get('mandate_review') or {}
            extra['mandate_approved'] = (review.get('status') == 'APPROVED'
                and review.get('ucits') is True and review.get('leverage') == 1
                and review.get('inverse') is False and bool(review.get('source'))
                and bool(review.get('isin')) and review.get('asset') == extra.get('asset'))
        candidates.append(extra)
    # Repeated configuration entries never provide additional ranking votes.
    unique = {(r.get('asset'), r.get('symbol')): r for r in candidates}
    return list(unique.values())


def quote_evidence(info):
    result = {'spread_pct': None, 'quote_date': None}
    try:
        bid, ask = float(info['bid']), float(info['ask'])
        if isfinite(bid) and isfinite(ask) and 0 < bid <= ask:
            result['spread_pct'] = 100 * (ask - bid) / ((ask + bid) / 2)
        result['quote_date'] = datetime.fromtimestamp(float(info['regularMarketTime']), timezone.utc).date().isoformat()
    except (KeyError, ValueError, TypeError, OverflowError, OSError):
        pass
    return result


def _public_text(url):
    request = Request(url, headers={'User-Agent': 'Phoenix public fund research'})
    with urlopen(request, timeout=5) as response:
        body = response.read(2_000_001)
    if len(body) > 2_000_000:
        raise ValueError('Public document exceeds size limit.')
    return body.decode('utf-8', errors='replace')


def crypto_reference_quote(symbol):
    """Observed EUR market spread, explicitly not an LHV execution quote."""
    missing = {'spread_pct': None, 'quote_date': None}
    if symbol not in {'BTC-EUR', 'ETH-EUR', 'SOL-EUR'}:
        return missing
    url = f'https://api.exchange.coinbase.com/products/{symbol}/ticker'
    try:
        payload = json.loads(_public_text(url))
        stamp = datetime.fromisoformat(payload['time'].replace('Z', '+00:00'))
        if stamp.tzinfo is None:
            return missing
        return {**quote_evidence({'bid': payload['bid'], 'ask': payload['ask'],
                                  'regularMarketTime': stamp.timestamp()}),
                'quote_source': url, 'quote_venue': 'Coinbase EUR reference market',
                'broker_execution_quote': False}
    except (ValueError, TypeError, KeyError, OSError):
        return missing


def _visible(document):
    document = re.sub(r'<(script|style)\b[^>]*>.*?</\1>', '', document, flags=re.I | re.S)
    return ' '.join(unescape(re.sub('<[^>]+>', ' ', document)).split())


def parse_broker_document(row, document, pricing=''):
    text = _visible(document)
    if row['lane'] == 'etf':
        decoded = document
        for _ in range(3):
            decoded = decoded.replace('\\"', '"')
        ticker, suffix = row['symbol'].rsplit('.', 1)
        venue = {'DE': 'XETRA', 'L': 'LSE'}.get(suffix, '')
        match = re.search(r'"symbol"\s*:\s*"' + re.escape(ticker) + r'"\s*,\s*"name"\s*:\s*"[^"\n]+"\s*,\s*"exchange"\s*:\s*"' + venue + r'"\s*,\s*"isin"\s*:\s*"([A-Z]{2}[A-Z0-9]{9}[0-9])"', decoded)
        ter = re.search(r'([0-9]+(?:\.[0-9]+)?)\s*%\s*Annual fund charges', text, re.I)
        free = re.search(r'Exchange traded funds\s*\(ETFs\)\s*No execution or custody fees', _visible(pricing), re.I)
        return {'isin': match.group(1) if match else None,
                'fund_fee_pct': float(ter.group(1)) if ter else None,
                'fee_pct': 0.0 if free else None, 'fee_source': LIGHTYEAR_PRICING}
    name, symbol = re.escape(row.get('name', '')), re.escape(str(row.get('symbol', '')).split('-')[0])
    supported = bool(name and re.search(rf'\b{name}\s*\(?\s*{symbol}\b', text, re.I))
    cards = re.findall(r'<div\b[^>]*class="[^"]*\bflip-card-text\b[^"]*"[^>]*>(.*?)</div>', document, flags=re.I | re.S)
    supported = supported or bool(name and symbol and any(
        re.search(rf'\b{name}\b', _visible(card), re.I)
        and re.search(rf'\b{symbol}\b', _visible(card), re.I) for card in cards))
    fee = re.search(r'([0-9]+(?:\.[0-9]+)?)%\s*service fee applies to buy and sell', text, re.I)
    return {'broker_verified': supported, 'broker_source': LHV_URL,
            'fee_pct': float(fee.group(1)) if fee else None, 'fee_source': LHV_URL}


def _broker_evidence(row):
    if row['lane'] == 'etf':
        verified = verify_lightyear_candidate({**row, 'label': row.get('name')})
        result = {'broker_verified': verified.get('broker_availability_status') == 'public_verified',
                  'broker_available': verified.get('lightyear_available'),
                  'broker_source': verified.get('lightyear_url') or _public_candidate_url(row['symbol']),
                  'fee_pct': None, 'isin': None, 'fund_fee_pct': None}
        if not result['broker_verified']:
            return result
        return {**result, **parse_broker_document(row, _public_text(_public_candidate_url(row['symbol'])), _public_text(LIGHTYEAR_PRICING))}
    return parse_broker_document(row, _public_text(LHV_URL))


def _fetch_candidate(row, today):
    if row.get('lane') == 'crypto' and row.get('symbol') in {'HYPE-EUR', 'TAO-EUR'}:
        from .kraken_evidence import fetch_crypto_evidence
        return {**row, **fetch_crypto_evidence(row['symbol'], today),
                **_broker_evidence(row), 'verified_at': today.isoformat(),
                'research_status': 'NO_EVIDENCE', 'research_as_of': None}
    import yfinance as yf
    if not row.get('symbol'):
        raise ValueError('No verified market-data symbol mapping.')
    ticker = yf.Ticker(row['symbol'])
    frame = ticker.history(start=(today - timedelta(days=400)).isoformat(), end=today.isoformat(),
                           interval='1d', auto_adjust=True, timeout=8)
    metadata = ticker.get_history_metadata()
    info = ticker.get_info()
    currency = metadata.get('currency')
    if currency != info.get('currency'):
        currency = None
    history = [{'date': index.date().isoformat(), 'close': float(value)} for index, value in frame['Close'].items()]
    quote = {**quote_evidence(info), 'quote_source': f'https://finance.yahoo.com/quote/{row["symbol"]}/',
             'quote_venue': 'Yahoo listing market quote', 'broker_execution_quote': False}
    if row['lane'] == 'crypto' and (quote['spread_pct'] is None or quote['quote_date'] is None):
        quote = crypto_reference_quote(row['symbol'])
    broker = _broker_evidence(row)
    from .buy_selection import _recent
    if row['lane'] == 'etf' and (quote['spread_pct'] is None or quote['quote_date'] is None
                                or not _recent(quote['quote_date'], today, 7)):
        quote['quote_issue'] = 'Primary quote has missing, stale, future-dated or crossed bid/ask evidence.'
        if broker.get('broker_verified') is True and broker.get('isin') and currency == 'EUR':
            from .etf_reference_quote import fetch_reference_quote
            try:
                quote = {**quote, **fetch_reference_quote(broker['isin'], today),
                         'quote_fallback_reason': quote['quote_issue'],
                         'quote_primary_source': quote['quote_source'],
                         'quote_primary_date': quote['quote_date']}
                quote.pop('quote_issue', None)
            except (ValueError, TypeError, OSError, httpx.HTTPError):
                quote['quote_issue'] += ' A dated exchange reference quote is also unavailable.'
    fund_cost = {}
    if row['lane'] == 'etf' and exchange_url(row['symbol']):
        try:
            fund_cost['fund_cost_evidence'] = parse_exchange_cost(
                row['symbol'], _public_text(exchange_url(row['symbol'])), today)
        except (ValueError, TypeError, OSError):
            pass  # Missing independent evidence never weakens a broker gate.
    if row.get('mandate_review') and row['mandate_review'].get('isin') != broker.get('isin'):
        row = {**row, 'mandate_approved': False}
    return {**row, 'history': history, 'currency': currency, 'product_type': info.get('quoteType'), **quote,
            **broker, **fund_cost, 'verified_at': today.isoformat(),
            'source': 'yfinance adjusted daily closes; named quote source; official public broker page',
            'retrieved_at': datetime.now(timezone.utc).isoformat(),
            'research_status': 'NO_EVIDENCE', 'research_as_of': None}


def fetch_evidence(constitution, today):
    universe = candidate_universe(constitution)
    key = (today.isoformat(), json.dumps(universe, sort_keys=True))
    # Coalesce simultaneous requests. Never cache portfolio or research decisions.
    with _lock:
        cached = _cache.get(key)
        if cached and monotonic() < cached[0]:
            return deepcopy(cached[1])
        futures = {_pool.submit(_fetch_candidate, row, today): row for row in universe[:40]}
        completed, pending = wait(futures, timeout=25)
        rows = []
        for future, row in futures.items():
            try:
                if future not in completed:
                    future.cancel()
                    raise TimeoutError()
                rows.append(future.result())
            except Exception:
                rows.append({**row, 'history': [], 'currency': 'EUR' if str(row.get('symbol', '')).endswith(('.DE', '-EUR')) else None,
                             'error': 'Public evidence unavailable or request timed out.', 'broker_verified': None})
        result = {'candidates': rows, 'retrieved_at': datetime.now(timezone.utc).isoformat(),
                  'coverage': {'configured': len(universe), 'evaluated': len(rows),
                               'truncated': len(universe) > 40, 'exhaustive_market_scan': False},
                  'source': 'Configured and explicitly added instruments; public market and broker evidence'}
        if len(_cache) >= 4:
            _cache.clear()
        _cache[key] = (monotonic() + 900, deepcopy(result))
        return result
