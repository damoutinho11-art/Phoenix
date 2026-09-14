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
from datetime import date, datetime, timedelta, timezone
import hashlib
import json
from math import isfinite

import httpx

from jarvis.core import clock
from .lhv_fund_nav import BASE, ISINS, validate_fund_identity

SOURCE_TYPE = 'official_fund_nav'

# Three distinct outcomes, never collapsed into one "history unavailable":
#   invalid      - a source answered and what it published does not hold up.
#   insufficient - the published series is sound and complete for the whole life
#                  of the fund, which is simply younger than the statistics need.
#                  This is a true statement about the fund, not a defect, and it
#                  must never be treated as one: a young fund is still a real
#                  holding whose NAV, exposure and policy bands all apply.
#   unavailable  - no dated price source exists for the instrument at all.
OFFICIAL_NAV_HISTORY_INVALID = 'official_nav_history_invalid'
OFFICIAL_NAV_HISTORY_INSUFFICIENT_SINCE_INCEPTION = (
    'official_nav_history_insufficient_since_inception')
PUBLIC_MARKET_HISTORY_UNAVAILABLE = 'public_market_history_unavailable'

# The date from which NAV history should reasonably exist, so a short series can
# be attributed to the fund's age rather than to a truncated document. A fund
# with no recorded entry is treated conservatively: a short series is a defect,
# because nothing proves otherwise.
#
# The basis is recorded explicitly because a fund has several defensible "start"
# dates and they are not interchangeable. Legal formation predates any NAV;
# a marketing "launched" date can postdate the first published valuation. Only
# the start of operation answers the question this validator actually asks,
# which is whether history should exist back to a given point. Never substitute
# one basis for another without changing this record and its source.
FUND_HISTORY_METADATA = {
    'LHVEVF': {
        'expected_history_start': date(2025, 1, 28),
        'basis': 'start_of_operation',
        'source': 'LHV fund page: LHV Euro Bond Fund launched 28 January 2025, '
                  'which matches its operational start.',
    },
    'LHVWORLDA': {
        'expected_history_start': date(2007, 8, 13),
        'basis': 'start_of_operation',
        'source': 'LHV February 2026 fund report: founded 27 April 2007, start of '
                  'operation 13 August 2007. The fund page separately states '
                  '"Launched: 13 February 2008"; that later date is deliberately '
                  'not used, because history may exist before it.',
    },
}

# How far after its expected start a published series may begin and still count
# as complete since launch. A first published NAV can lag the start of operation
# by a few publication days; beyond that the document is truncated rather than
# the fund young, and the distance is always reported either way.
MAX_HISTORY_START_LAG_DAYS = 14

# weekly_panel requires more than 104 continuous completed weekly returns. Depth
# is measured in those same genuine weekly periods rather than in raw chart
# points, because the 'all' span is drawn for a chart and may downsample older
# observations: a monthly tail can carry hundreds of points across many years
# and still not contain the weekly periods the statistics need. The margin above
# 104 absorbs the shrinkage from intersecting dates with the other instruments.
MINIMUM_WEEKLY_RETURNS = 110

# Share of the calendar weeks in the series that must actually carry an
# observation. A downsampled region fails this even when its gaps hide under
# MAX_NAV_GAP_DAYS and its raw point count looks generous.
MINIMUM_WEEKLY_COVERAGE = 0.95

# Longest silent gap tolerated inside the series, and between its last
# observation and today. Fund NAVs publish on business days, so a longer gap
# means the series is incomplete or stale, not merely quiet.
MAX_NAV_GAP_DAYS = 10

# Confirmed live for LHVWORLDA: the endpoint answers with JSON and LHV's public
# page offers Week / Month / Year / All for the fund.
HISTORY_TIME_SPAN = 'all'
MAX_DOCUMENT_BYTES = 8_000_000

# Funds with an official NAV history adapter. A broker-only symbol outside this
# set genuinely has no price history source of any kind.
NAV_HISTORY_SYMBOLS = frozenset(ISINS)


class NavHistoryError(ValueError):
    """An official NAV series exists but cannot be trusted as a price history."""

    code = OFFICIAL_NAV_HISTORY_INVALID


class NavHistoryImmature(NavHistoryError):
    """A sound series that is short only because the fund is young.

    Carries no defect. The holding stays in the portfolio at full value; only
    its participation in return and covariance estimation waits for history.
    """

    code = OFFICIAL_NAV_HISTORY_INSUFFICIENT_SINCE_INCEPTION

    def __init__(self, message, *, symbol, expected_history_start, basis, weekly_returns):
        super().__init__(message)
        self.symbol = symbol
        self.expected_history_start = expected_history_start
        self.basis = basis
        self.weekly_returns = weekly_returns


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


def last_completed_week_end(today):
    """The Friday of the most recent completed week, as the optimizer defines it."""
    last_friday = today - timedelta(days=(today.weekday() - 4) % 7)
    return last_friday - timedelta(days=7) if last_friday >= today else last_friday


def weekly_periods(days, today):
    """Genuine weekly observations, bucketed exactly as the optimizer's panel is.

    Counting raw chart points would accept a downsampled series; counting the
    weeks those points actually land in is the measure the statistics need.
    """
    cutoff = last_completed_week_end(today)
    weeks = {day + timedelta(days=(4 - day.weekday()) % 7) for day in days if day <= cutoff}
    return sorted(weeks)


def _cadence(records, today):
    """Weekly period count and the share of calendar weeks actually covered."""
    days = [date.fromisoformat(record['date']) for record in records]
    weeks = weekly_periods(days, today)
    if not weeks:
        raise NavHistoryError('Official NAV history contains no completed week.')
    calendar_weeks = (weeks[-1] - weeks[0]).days // 7 + 1
    return days, weeks, len(weeks) / calendar_weeks


def history_start_lag(symbol, first_day):
    """Days between where history should start and where the document starts.

    None when no expected start is recorded. Negative means the series reaches
    back further than expected, which is never a defect.
    """
    metadata = FUND_HISTORY_METADATA.get(symbol)
    if metadata is None:
        return None
    return (first_day - metadata['expected_history_start']).days


def _insufficient(symbol, weekly_returns, detail, days, today):
    """Attribute a short series to the fund's age only when it proves that.

    A series reaching back to the start of operation is everything the fund has;
    one that starts materially later is a truncated document. Without a recorded
    expected start nothing proves youth, so the conservative reading is a defect.
    """
    metadata = FUND_HISTORY_METADATA.get(symbol)
    lag = history_start_lag(symbol, days[0])
    if metadata is None or lag > MAX_HISTORY_START_LAG_DAYS:
        raise NavHistoryError(detail)
    start = metadata['expected_history_start'].isoformat()
    raise NavHistoryImmature(
        f'{symbol}: official NAV history is valid but insufficient since inception '
        f'({metadata["basis"]} {start}). It carries {weekly_returns} completed '
        f'weekly returns and {MINIMUM_WEEKLY_RETURNS} are required, which the fund '
        'cannot yet have. The holding is retained as a constrained fixed sleeve.',
        symbol=symbol, expected_history_start=start, basis=metadata['basis'],
        weekly_returns=weekly_returns)


def _validate_depth_and_continuity(symbol, records, today):
    days, weeks, coverage = _cadence(records, today)

    # Document defects first: a downsampled or broken series is a defect whatever
    # the fund's age, and must never be excused as youth.
    gap = max(((b - a).days for a, b in zip(days, days[1:])), default=0)
    if gap > MAX_NAV_GAP_DAYS:
        raise NavHistoryError(
            f'Official NAV history has a {gap}-day gap; a complete published '
            'series is required and missing valuations are never interpolated.')
    if coverage < MINIMUM_WEEKLY_COVERAGE:
        raise NavHistoryError(
            f'Official NAV history covers {coverage:.0%} of the calendar weeks it '
            f'spans; at least {MINIMUM_WEEKLY_COVERAGE:.0%} is required. Chart data '
            'downsampled to a coarser cadence cannot stand in for weekly returns.')
    stale = (today - days[-1]).days
    if not 0 <= stale <= MAX_NAV_GAP_DAYS:
        raise NavHistoryError(
            f'Official NAV history ends {stale} days before today; a current '
            'published series is required.')

    # Only now can a shortfall be read as the fund simply being young.
    weekly_returns = len(weeks) - 1
    if weekly_returns < MINIMUM_WEEKLY_RETURNS:
        _insufficient(symbol, weekly_returns,
            f'Official NAV history carries {weekly_returns} completed weekly returns; '
            f'at least {MINIMUM_WEEKLY_RETURNS} are required to compare historical risk.',
            days, today)
    return len(weeks)


def _history_start_provenance(symbol, first_day):
    """Record which start date was used and where it came from, never just a date."""
    metadata = FUND_HISTORY_METADATA.get(symbol)
    if metadata is None:
        return {'expected_history_start': None, 'history_start_basis': None,
                'history_start_source': None, 'history_start_lag_days': None}
    return {'expected_history_start': metadata['expected_history_start'].isoformat(),
            'history_start_basis': metadata['basis'],
            'history_start_source': metadata['source'],
            'history_start_lag_days': history_start_lag(symbol, first_day)}


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
    weeks = _validate_depth_and_continuity(symbol, observations, today)
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
        'weekly_periods': weeks,
        'weekly_returns': weeks - 1,
        'first_date': observations[0]['date'],
        'last_date': observations[-1]['date'],
        **_history_start_provenance(symbol, date.fromisoformat(observations[0]['date'])),
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
