"""Official public LHV fund NAVs; no proxy ETF or undated price fallback."""
from datetime import datetime
from math import isclose, isfinite
import httpx
from jarvis.core import clock

ISINS = {'LHVWORLDA':'EE3600092417','LHVEVF':'EE3600001921'}
BASE = 'https://www.lhv.ee/b/public/market-data/fund/'

# The headline NAV and the dated price series are formatted independently by the
# publisher and may carry a different number of decimals for the same valuation.
# Half a cent is exactly the widest disagreement two-decimal rounding can create,
# so it absorbs formatting differences while any real pricing disagreement — which
# would be orders of magnitude larger — still fails closed. The relative bound
# keeps the same guarantee if a fund is ever quoted at a much larger unit price.
NAV_ABS_TOLERANCE_EUR = 0.005
NAV_REL_TOLERANCE = 1e-6


def validate_fund_identity(symbol, fund):
    """A published document only speaks for the holding whose identity it carries."""
    if symbol not in ISINS or fund['shortName'] != symbol or fund['isin'] != ISINS[symbol]:
        raise ValueError('Official fund identity does not match the holding.')
    return ISINS[symbol]


def parse_fund_nav(symbol, payload, today):
    try:
        fund = payload['fundData']
        validate_fund_identity(symbol, fund)
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
        if any(not isfinite(v) or v <= 0 for v in (price,nav)):
            raise ValueError('Official NAV and dated price do not reconcile.')
        if not isclose(price, nav, rel_tol=NAV_REL_TOLERANCE, abs_tol=NAV_ABS_TOLERANCE_EUR):
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
