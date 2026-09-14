"""Official public LHV fund NAVs; no proxy ETF or undated price fallback."""
from datetime import datetime
from math import isfinite
import httpx
from jarvis.core import clock

ISINS = {'LHVWORLDA':'EE3600092417','LHVEVF':'EE3600001921'}
BASE = 'https://www.lhv.ee/b/public/market-data/fund/'


def parse_fund_nav(symbol, payload, today):
    try:
        fund = payload['fundData']
        if symbol not in ISINS or fund['shortName'] != symbol or fund['isin'] != ISINS[symbol]:
            raise ValueError('Official fund identity does not match the holding.')
        rows = payload['priceGraphDetails']
        parsed = []
        for row in rows:
            stamp = datetime.fromisoformat(row['timestamp'].replace('Z','+00:00'))
            if stamp.tzinfo is None:
                raise ValueError('NAV date must have a timezone.')
            parsed.append((stamp, float(row['price'])))
        stamp, price = max(parsed, key=lambda row: row[0])
        day = stamp.astimezone(clock.LOCAL_TIMEZONE).date()
        nav = float(fund['nav'])
        if not 0 <= (today-day).days <= 7:
            raise ValueError('Official NAV is stale or future dated.')
        if any(not isfinite(v) or v <= 0 for v in (price,nav)) or abs(price-nav) > .000001:
            raise ValueError('Official NAV and dated price do not reconcile.')
        return {'nav_eur':nav,'as_of':day.isoformat(),'isin':ISINS[symbol],
                'source':BASE + symbol + '?timeSpan=year'}
    except (KeyError, TypeError, OverflowError, AttributeError) as exc:
        raise ValueError('Official fund NAV is incomplete.') from exc


def fetch_fund_nav(symbol):
    if symbol not in ISINS:
        raise ValueError('Unknown LHV fund.')
    response = httpx.get(BASE + symbol, params={'timeSpan':'year'}, timeout=8)
    response.raise_for_status()
    if len(response.content) > 2_000_000:
        raise ValueError('Official fund response is too large.')
    return parse_fund_nav(symbol, response.json(), clock.today())
