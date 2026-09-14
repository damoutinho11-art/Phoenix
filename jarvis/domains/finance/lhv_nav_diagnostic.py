"""Describe a published NAV series without deciding anything from it.

The validator answers one question: may this series be used? A first live run
needs the opposite posture. It must report what the document actually contains
even when — especially when — validation rejects it, so a human can tell a dense
usable history from a downsampled chart from a truncated one. Nothing here feeds
a portfolio decision, and no value it prints is ever used as a price.
"""
from datetime import date
import hashlib
import json

import httpx

from jarvis.core import clock
from .lhv_nav_history import (
    BASE, FUND_HISTORY_METADATA, HISTORY_TIME_SPAN, MAX_DOCUMENT_BYTES,
    MAX_NAV_GAP_DAYS, MINIMUM_WEEKLY_COVERAGE, MINIMUM_WEEKLY_RETURNS,
    NAV_HISTORY_SYMBOLS, NavHistoryError, NavHistoryImmature, _observations,
    history_source, history_start_lag, parse_nav_history, weekly_periods)

FIELDS = ('raw_observations', 'first_date', 'last_date', 'calendar_weeks_spanned',
          'weeks_represented', 'weekly_coverage', 'genuine_weekly_returns',
          'largest_internal_gap_days', 'expected_history_start',
          'history_start_basis', 'distance_from_expected_start_days',
          'validation_result')

DENSE = 'DENSE_USABLE_HISTORY'
DOWNSAMPLED = 'LONG_BUT_DOWNSAMPLED'
TRUNCATED = 'TRUNCATED_HISTORY'
YOUNG = 'COMPLETE_BUT_YOUNGER_THAN_REQUIREMENT'
UNREADABLE = 'UNREADABLE_DOCUMENT'


def _verdict(symbol, payload, today, report):
    try:
        parse_nav_history(symbol, payload, today)
    except NavHistoryImmature as exc:
        return 'INSUFFICIENT_SINCE_INCEPTION', exc.code, str(exc)
    except NavHistoryError as exc:
        return 'INVALID', exc.code, str(exc)
    except ValueError as exc:
        return 'INVALID', 'identity_or_document_error', str(exc)
    return 'VALID', None, 'The published series satisfies every requirement.'


def _interpretation(report):
    """Which of the three realities the numbers describe, stated plainly."""
    if report['raw_observations'] is None:
        return UNREADABLE
    if report['validation_result'] == 'VALID':
        return DENSE
    if report['validation_result'] == 'INSUFFICIENT_SINCE_INCEPTION':
        return YOUNG
    coverage = report['weekly_coverage']
    if coverage is not None and coverage < MINIMUM_WEEKLY_COVERAGE:
        return DOWNSAMPLED
    lag = report['distance_from_expected_start_days']
    if lag is not None and lag > 0 and report['genuine_weekly_returns'] is not None \
            and report['genuine_weekly_returns'] < MINIMUM_WEEKLY_RETURNS:
        return TRUNCATED
    return report['validation_code'] or 'INVALID'


def diagnose_nav_history(symbol, payload, today, *, document_sha256=None,
                         time_span=HISTORY_TIME_SPAN):
    """Cadence and coverage statistics for one published series, never raising."""
    report = dict.fromkeys(FIELDS)
    report.update(symbol=symbol, source=history_source(symbol, time_span),
                  time_span=time_span, document_sha256=document_sha256,
                  as_of=today.isoformat(), validation_code=None, validation_detail=None)
    metadata = FUND_HISTORY_METADATA.get(symbol)
    if metadata is not None:
        report.update(expected_history_start=metadata['expected_history_start'].isoformat(),
                      history_start_basis=metadata['basis'],
                      history_start_source=metadata['source'])
    try:
        observations = _observations((payload or {}).get('priceGraphDetails'), today)
    except (NavHistoryError, AttributeError, TypeError):
        observations = None
    if observations:
        days = [date.fromisoformat(o['date']) for o in observations]
        weeks = weekly_periods(days, today)
        calendar_weeks = (weeks[-1] - weeks[0]).days // 7 + 1 if weeks else None
        report.update(
            raw_observations=len(observations),
            first_date=days[0].isoformat(), last_date=days[-1].isoformat(),
            calendar_weeks_spanned=calendar_weeks,
            weeks_represented=len(weeks),
            weekly_coverage=round(len(weeks)/calendar_weeks, 4) if calendar_weeks else None,
            genuine_weekly_returns=max(len(weeks)-1, 0),
            largest_internal_gap_days=max(((b-a).days for a, b in zip(days, days[1:])), default=0),
            distance_from_expected_start_days=history_start_lag(symbol, days[0]))
    result, code, detail = _verdict(symbol, payload, today, report)
    report.update(validation_result=result, validation_code=code, validation_detail=detail)
    report['interpretation'] = _interpretation(report)
    return report


def fetch_diagnostic(symbol, today=None, *, time_span=HISTORY_TIME_SPAN):
    """Fetch and describe. Diagnostics only: nothing here prices anything."""
    if symbol not in NAV_HISTORY_SYMBOLS:
        raise ValueError(f'{symbol}: no official LHV fund NAV source is configured.')
    with httpx.stream('GET', BASE + symbol, params={'timeSpan': time_span}, timeout=15) as response:
        response.raise_for_status()
        body = bytearray()
        for chunk in response.iter_bytes():
            body.extend(chunk)
            if len(body) > MAX_DOCUMENT_BYTES:
                raise ValueError('Official fund NAV response is too large.')
    raw = bytes(body)
    try:
        payload = json.loads(raw)
    except ValueError:
        payload = None
    return diagnose_nav_history(symbol, payload, today or clock.today(), time_span=time_span,
                                document_sha256=hashlib.sha256(raw).hexdigest())


def format_report(report):
    def show(value):
        if value is None:
            return 'unavailable'
        if isinstance(value, float):
            return f'{value:.1%}'
        return str(value)

    labels = {
        'raw_observations': 'raw observations',
        'first_date': 'first date',
        'last_date': 'last date',
        'calendar_weeks_spanned': 'calendar weeks spanned',
        'weeks_represented': 'weeks represented',
        'weekly_coverage': 'weekly coverage',
        'genuine_weekly_returns': 'genuine weekly returns',
        'largest_internal_gap_days': 'largest internal gap',
        'expected_history_start': 'expected history start',
        'history_start_basis': 'expected start basis',
        'distance_from_expected_start_days': 'distance from expected start',
        'validation_result': 'validation result',
    }
    width = max(len(label) for label in labels.values())
    lines = [report['symbol']]
    for key, label in labels.items():
        lines.append(f'  {label:<{width}}  {show(report[key])}')
    lines.append(f'  {"interpretation":<{width}}  {report["interpretation"]}')
    lines.append(f'  {"required":<{width}}  '
                 f'>= {MINIMUM_WEEKLY_RETURNS} weekly returns, '
                 f'>= {MINIMUM_WEEKLY_COVERAGE:.0%} coverage, '
                 f'gaps <= {MAX_NAV_GAP_DAYS} days')
    if report['validation_detail']:
        lines.append(f'  {"detail":<{width}}  {report["validation_detail"]}')
    return '\n'.join(lines)


def main(argv=None):
    import sys
    symbols = list(argv if argv is not None else sys.argv[1:]) or sorted(NAV_HISTORY_SYMBOLS)
    for symbol in symbols:
        try:
            print(format_report(fetch_diagnostic(symbol)))
        except Exception as exc:                       # diagnostics never abort a sweep
            print(f'{symbol}\n  request failed  {type(exc).__name__}: {exc}')
        print()
    return 0


if __name__ == '__main__':
    raise SystemExit(main())
