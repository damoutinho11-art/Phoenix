"""Public spot EUR reference data for assets absent from Yahoo's mapping."""
from datetime import datetime, timezone
import json
from math import isfinite
from urllib.request import Request, urlopen

BASE = 'https://api.kraken.com/0/public/'
PAIRS = {'HYPE-EUR': ('HYPEEUR', 'HYPE'), 'TAO-EUR': ('TAOEUR', 'TAO')}


def _get(endpoint):
    request = Request(BASE + endpoint, headers={'User-Agent': 'Phoenix public market research'})
    with urlopen(request, timeout=5) as response:
        body = response.read(2_000_001)
    if len(body) > 2_000_000:
        raise ValueError('Public market response too large.')
    data = json.loads(body)
    if data.get('error') or not isinstance(data.get('result'), dict):
        raise ValueError('Public market evidence unavailable.')
    return data['result']


def fetch_crypto_evidence(symbol, today):
    if symbol not in PAIRS:
        raise ValueError('Unsupported canonical EUR pair.')
    pair, asset = PAIRS[symbol]
    metadata = _get(f'AssetPairs?pair={pair}').get(pair, {})
    if (metadata.get('base') != asset or metadata.get('quote') != 'ZEUR'
            or metadata.get('wsname') != f'{asset}/EUR' or metadata.get('status') != 'online'):
        raise ValueError('Spot market identity, EUR denomination or availability is unverified.')
    candles = _get(f'OHLC?pair={pair}&interval=1440').get(pair, [])
    history = []
    # Kraken documents the final row as an uncommitted candle, always excluded.
    for row in candles[:-1]:
        day = datetime.fromtimestamp(int(row[0]), timezone.utc).date()
        if day < today and int(row[7]) > 0:
            history.append({'date': day.isoformat(), 'close': float(row[4])})
    ticker = _get(f'Ticker?pair={pair}').get(pair, {})
    bid, ask = float(ticker['b'][0]), float(ticker['a'][0])
    if not (isfinite(bid) and isfinite(ask) and 0 < bid <= ask):
        raise ValueError('Reference bid/ask is invalid.')
    server = datetime.fromtimestamp(int(_get('Time')['unixtime']), timezone.utc)
    now = datetime.now(timezone.utc)
    return {'history': history, 'currency': 'EUR', 'product_type': 'CRYPTOCURRENCY',
            'spread_pct': 100 * (ask - bid) / ((ask + bid) / 2),
            'quote_date': server.date().isoformat(), 'quote_source': BASE + f'Ticker?pair={pair}',
            'quote_venue': 'Kraken EUR spot reference market', 'broker_execution_quote': False,
            'history_source': BASE + f'OHLC?pair={pair}&interval=1440',
            'identity_source': BASE + f'AssetPairs?pair={pair}',
            'source': 'Kraken public spot EUR daily closes and reference quote',
            'retrieved_at': now.isoformat()}
