"""Official LHV fund NAV history as a dated public price source, research only.

These share classes are not listed, so no market data provider carries them and
no proxy ETF may ever stand in for one. The fund's own published NAV series is
the only dated price record that exists. It is normalized here into the same
history contract the optimizer already consumes for listed instruments, so the
optimizer needs no LHV-specific logic to reason about them.

A NAV is a valuation the manager publishes, not a price struck between a buyer
and a seller. It carries no bid/ask and no intraday path, so it is evidence for
historical risk comparison only, never for execution.
"""
from datetime import date, datetime, timezone
import hashlib
import json
from math import isfinite

import httpx

from jarvis.core import clock
from .lhv_fund_nav import BASE, ISINS, validate_fund_identity

SOURCE_TYPE = 'official_fund_nav'

# A source that exists but published something untrustworthy is a different
# problem from a source that does not exist at all: the first is a data-quality
# failure to investigate, the second a permanent capability gap. Never collapse
# them into one "history unavailable" message.
OFFICIAL_NAV_HISTORY_INVALID = 'official_nav_history_invalid'
PUBLIC_MARKET_HISTORY_UNAVAILABLE = 'public_market_history_unavailable'

# weekly_panel needs more than 104 weekly returns. Require a margin above that
# here so a series that only just clears the optimizer's minimum is rejected at
# the adapter, naming its depth, instead of failing deep inside the optimizer.
MINIMUM_NAV_OBSERVATIONS = 110
MINIMUM_NAV_SPAN_DAYS = 3 * 365

# Longest silent gap tolerated inside the series, and between its last
# observation and today. Fund NAVs publish on business days, so a longer gap
# means the series is incomplete or stale, not merely quiet.
MAX_NAV_GAP_DAYS = 10

# The span requested from the public endpoint. Only 'year' is exercised by the
# spot-NAV call, and a one-year series can never satisfy the depth required
# above, so this value is unverified against the live endpoint. That is
# deliberate and safe: an unsupported span or a short series surfaces as
# OFFICIAL_NAV_HISTORY_INVALID naming the observation count it did receive,
# never as a silently empty history.
HISTORY_TIME_SPAN = 'all'
MAX_DOCUMENT_BYTES = 8_000_000

# Funds with an official NAV history adapter. A broker-only symbol outside this
# set genuinely has no price history source of any kind.
NAV_HISTORY_SYMBOLS = frozenset(ISINS)


class NavHistoryError(ValueError):
    """An official NAV series exists but cannot be trusted as a price history."""

    code = OFFICIAL_NAV_HISTORY_INVALID


def history_source(symbol, time_span=HISTORY_TIME_SPAN):
    return f'{BASE}{symbol}?timeSpan={time_span}'


def _currency(fund):
    """EUR is validated when declared and recorded as assumed when it is not."""
    declared = fund.get('currency') if isinstance(fund, dict) else None
    if declared is None:
        return 'EUR', 'assumed_fund_base_currency'
    if str(declared).strip().upper() != 'EUR':
        raise NavHistoryError('Official fund NAV history is not denominated in EUR.')
    return 'EUR', 'declared_by_publisher'


def _observations(rows, today):
    """One positive EUR NAV per calendar date, ordered, never future dated."""
    if not isinstance(rows, (list, tuple)) or not rows:
        raise NavHistoryError('Official fund NAV history has no observations.')
    seen, records = {}, []
    for row in rows:
        try:
            stamp = datetime.fromisoformat(str(row['timestamp']).replace('Z', '+00:00'))
        except (KeyError, TypeError, ValueError, IndexError) as exc:
            raise NavHistoryError('Official NAV observation has no usable timestamp.') from exc
        if stamp.tzinfo is None:
            raise NavHistoryError('Official NAV observation must carry a timezone.')
        day = stamp.astimezone(clock.LOCAL_TIMEZONE).date()
        if day > today:
            raise NavHistoryError('Official NAV history contains a future-dated observation.')
        try:
            nav = float(row['price'])
        except (KeyError, TypeError, ValueError, OverflowError) as exc:
            raise NavHistoryError('Official NAV observation has an unreadable price.') from exc
        if not isfinite(nav) or nav <= 0:
            raise NavHistoryError('Official NAV observations must be positive finite EUR values.')
        if day in seen:
            raise NavHistoryError(
                'Official NAV history reports two different values for one date.'
                if seen[day] != nav else 'Official NAV history repeats a date.')
        seen[day] = nav
        records.append({'date': day.isoformat(), 'nav_eur': nav})
    records.sort(key=lambda record: record['date'])
    return records


def _validate_depth_and_continuity(records, today):
    if len(records) < MINIMUM_NAV_OBSERVATIONS:
        raise NavHistoryError(
            f'Official NAV history has {len(records)} observations; at least '
            f'{MINIMUM_NAV_OBSERVATIONS} are required to compare historical risk.')
    days = [date.fromisoformat(record['date']) for record in records]
    span = (days[-1] - days[0]).days
    if span < MINIMUM_NAV_SPAN_DAYS:
        raise NavHistoryError(
            f'Official NAV history spans {span} days; at least '
            f'{MINIMUM_NAV_SPAN_DAYS} are required to compare historical risk.')
    gap = max((b - a).days for a, b in zip(days, days[1:]))
    if gap > MAX_NAV_GAP_DAYS:
        raise NavHistoryError(
            f'Official NAV history has a {gap}-day gap; a complete published '
            'series is required and missing valuations are never interpolated.')
    stale = (today - days[-1]).days
    if not 0 <= stale <= MAX_NAV_GAP_DAYS:
        raise NavHistoryError(
            f'Official NAV history ends {stale} days before today; a current '
            'published series is required.')


def parse_nav_history(symbol, payload, today, *, time_span=HISTORY_TIME_SPAN,
                      document_sha256=None, retrieved_at=None):
    """Normalized {date, nav_eur} observations with the provenance that backs them."""
    try:
        fund = payload['fundData']
        rows = payload['priceGraphDetails']
    except (KeyError, TypeError) as exc:
        raise NavHistoryError('Official fund NAV history is incomplete.') from exc
    try:
        isin = validate_fund_identity(symbol, fund)
    except (KeyError, TypeError) as exc:
        raise NavHistoryError('Official fund NAV history is incomplete.') from exc
    currency, currency_basis = _currency(fund)
    observations = _observations(rows, today)
    _validate_depth_and_continuity(observations, today)
    provenance = {
        'source_type': SOURCE_TYPE,
        'source': history_source(symbol, time_span),
        'symbol': symbol,
        'isin': isin,
        'currency': currency,
        'currency_basis': currency_basis,
        'time_span': time_span,
        'retrieved_at': retrieved_at or datetime.now(timezone.utc).isoformat(),
        'document_sha256': document_sha256,
        'observations': len(observations),
        'first_date': observations[0]['date'],
        'last_date': observations[-1]['date'],
        'valuation_basis': 'Manager-published net asset value per unit; not a traded price.',
    }
    return observations, provenance


def nav_history_record(symbol, payload, today, *, time_span=HISTORY_TIME_SPAN,
                       document_sha256=None, retrieved_at=None):
    """The optimizer's history contract, so it needs no LHV-specific handling."""
    observations, provenance = parse_nav_history(
        symbol, payload, today, time_span=time_span,
        document_sha256=document_sha256, retrieved_at=retrieved_at)
    return {
        'history': [{'date': o['date'], 'close': o['nav_eur']} for o in observations],
        'currency': 'EUR', 'original_currency': 'EUR', 'history_supported': True,
        'fx_symbol': None, 'symbol': symbol,
        'omitted_provider_closes': 0, 'missing_fx_dates': 0,
        'source': f'{provenance["source"]} (official published net asset value per unit)',
        **{k: v for k, v in provenance.items() if k != 'source'},
    }


def fetch_nav_history(symbol, today=None, *, time_span=HISTORY_TIME_SPAN):
    if symbol not in NAV_HISTORY_SYMBOLS:
        raise NavHistoryError(f'{symbol}: no official LHV fund NAV source is configured.')
    with httpx.stream('GET', BASE + symbol, params={'timeSpan': time_span}, timeout=10) as response:
        response.raise_for_status()
        body = bytearray()
        for chunk in response.iter_bytes():
            body.extend(chunk)
            if len(body) > MAX_DOCUMENT_BYTES:
                raise NavHistoryError('Official fund NAV response is too large.')
    raw = bytes(body)
    try:
        payload = json.loads(raw)
    except ValueError as exc:
        raise NavHistoryError('Official fund NAV response is not valid JSON.') from exc
    return nav_history_record(symbol, payload, today or clock.today(), time_span=time_span,
                              document_sha256=hashlib.sha256(raw).hexdigest())
