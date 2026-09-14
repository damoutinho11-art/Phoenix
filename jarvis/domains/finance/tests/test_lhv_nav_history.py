"""Official NAV history is a price source only when the published series holds up."""
from datetime import date, timedelta
import hashlib
import json

import pytest

from jarvis.domains.finance.lhv_fund_nav import ISINS
from jarvis.domains.finance.lhv_nav_history import (
    FUND_HISTORY_METADATA, MAX_NAV_GAP_DAYS, MINIMUM_WEEKLY_COVERAGE, MINIMUM_WEEKLY_RETURNS,
    SOURCE_TYPE, NavHistoryError, NavHistoryImmature, nav_history_record,
    parse_nav_history, weekly_periods)

TODAY = date(2026, 9, 10)
SYMBOL = 'LHVWORLDA'


def series(count=160, step_days=7, end=TODAY, start_nav=15.0):
    """A published weekly NAV series ending on the most recent publication."""
    return [{'timestamp': (end - timedelta(days=step_days*i)).isoformat() + 'T12:00:00Z',
             'price': round(start_nav + 0.01*(count-i), 4)}
            for i in range(count)][::-1]


def payload(rows=None, **fund):
    data = {'shortName': SYMBOL, 'isin': ISINS[SYMBOL], 'nav': 16.6}
    data.update(fund)
    return {'fundData': data, 'priceGraphDetails': series() if rows is None else rows}


# --- 1. normalized {date, nav_eur} records ---------------------------------

def test_observations_are_normalized_dated_eur_navs():
    observations, _ = parse_nav_history(SYMBOL, payload(), TODAY)
    assert len(observations) == 160
    assert set(observations[0]) == {'date', 'nav_eur'}
    assert observations[0]['date'] < observations[-1]['date']
    assert all(isinstance(o['nav_eur'], float) and o['nav_eur'] > 0 for o in observations)


def test_observations_are_sorted_even_when_the_document_is_not():
    rows = series()
    shuffled = [rows[5], rows[0], *rows[1:5], *rows[6:]]
    observations, _ = parse_nav_history(SYMBOL, payload(shuffled), TODAY)
    assert [o['date'] for o in observations] == sorted(o['date'] for o in observations)


# --- 2. validation ----------------------------------------------------------

def test_duplicate_dates_are_rejected():
    rows = series()
    with pytest.raises(NavHistoryError, match='repeats a date'):
        parse_nav_history(SYMBOL, payload([*rows, rows[-1]]), TODAY)


def test_conflicting_values_for_one_date_are_rejected_distinctly():
    rows = series()
    conflict = {**rows[-1], 'price': rows[-1]['price'] + 1}
    with pytest.raises(NavHistoryError, match='two different values for one date'):
        parse_nav_history(SYMBOL, payload([*rows, conflict]), TODAY)


def test_future_dated_observations_are_rejected():
    rows = series()
    rows.append({'timestamp': (TODAY + timedelta(days=1)).isoformat() + 'T12:00:00Z', 'price': 17.0})
    with pytest.raises(NavHistoryError, match='future-dated'):
        parse_nav_history(SYMBOL, payload(rows), TODAY)


def test_a_stale_series_is_rejected():
    stale = series(end=TODAY - timedelta(days=MAX_NAV_GAP_DAYS + 1))
    with pytest.raises(NavHistoryError, match='days before today'):
        parse_nav_history(SYMBOL, payload(stale), TODAY)


def test_a_gap_in_the_published_series_is_rejected_and_never_interpolated():
    rows = series()
    del rows[40:44]          # a month-long hole in an otherwise weekly series
    with pytest.raises(NavHistoryError, match='gap'):
        parse_nav_history(SYMBOL, payload(rows), TODAY)


@pytest.mark.parametrize('price', ['', 'n/a', None, float('nan'), float('inf'), 0, -15.0, {}])
def test_malformed_or_nonpositive_numbers_are_rejected(price):
    rows = series()
    rows[80]['price'] = price
    with pytest.raises(NavHistoryError):
        parse_nav_history(SYMBOL, payload(rows), TODAY)


@pytest.mark.parametrize('timestamp', ['', 'not-a-date', None, '2026-09-10T12:00:00'])
def test_malformed_or_naive_timestamps_are_rejected(timestamp):
    rows = series()
    rows[80]['timestamp'] = timestamp
    with pytest.raises(NavHistoryError):
        parse_nav_history(SYMBOL, payload(rows), TODAY)


def test_insufficient_weekly_returns_are_rejected_with_the_count_received():
    short = series(count=MINIMUM_WEEKLY_RETURNS - 10)
    with pytest.raises(NavHistoryError, match='completed weekly returns'):
        parse_nav_history(SYMBOL, payload(short), TODAY)


def test_a_dense_but_shallow_series_is_rejected_on_weekly_depth():
    """Enough points is not enough history: a year of daily NAVs is still a year."""
    daily = series(count=300, step_days=1)
    with pytest.raises(NavHistoryError, match='completed weekly returns'):
        parse_nav_history(SYMBOL, payload(daily), TODAY)


@pytest.mark.parametrize('rows', [[], None, 'nope', 42, {}])
def test_a_missing_or_unusable_series_is_rejected(rows):
    document = {'fundData': {'shortName': SYMBOL, 'isin': ISINS[SYMBOL], 'nav': 16.6},
                'priceGraphDetails': rows}
    with pytest.raises(NavHistoryError):
        parse_nav_history(SYMBOL, document, TODAY)


def test_identity_mismatch_is_rejected():
    with pytest.raises(ValueError, match='identity does not match'):
        parse_nav_history(SYMBOL, payload(isin='EE0000000000'), TODAY)
    with pytest.raises(ValueError, match='identity does not match'):
        parse_nav_history('LHVEVF', payload(), TODAY)


def test_a_missing_document_section_is_incomplete_not_a_crash():
    with pytest.raises(NavHistoryError, match='incomplete'):
        parse_nav_history(SYMBOL, {'fundData': {'shortName': SYMBOL}}, TODAY)
    with pytest.raises(NavHistoryError, match='incomplete'):
        parse_nav_history(SYMBOL, {'priceGraphDetails': series()}, TODAY)


# --- EUR semantics ----------------------------------------------------------

def test_a_declared_non_eur_currency_is_rejected():
    with pytest.raises(NavHistoryError, match='not denominated in EUR'):
        parse_nav_history(SYMBOL, payload(currency='USD'), TODAY)


def test_currency_basis_records_whether_eur_was_declared_or_assumed():
    _, declared = parse_nav_history(SYMBOL, payload(currency='EUR'), TODAY)
    assert declared['currency_basis'] == 'declared_by_publisher'
    _, assumed = parse_nav_history(SYMBOL, payload(), TODAY)
    assert assumed['currency_basis'] == 'assumed_fund_base_currency'
    assert declared['currency'] == assumed['currency'] == 'EUR'


# --- 3. provenance ----------------------------------------------------------

def test_provenance_identifies_the_source_document_and_retrieval():
    raw = json.dumps(payload()).encode()
    digest = hashlib.sha256(raw).hexdigest()
    _, provenance = parse_nav_history(SYMBOL, payload(), TODAY, document_sha256=digest,
                                      retrieved_at='2026-09-10T08:00:00+00:00')
    assert provenance['source_type'] == SOURCE_TYPE
    assert provenance['source'].startswith('https://www.lhv.ee/')
    assert SYMBOL in provenance['source']
    assert provenance['isin'] == ISINS[SYMBOL]
    assert provenance['document_sha256'] == digest
    assert provenance['retrieved_at'] == '2026-09-10T08:00:00+00:00'
    assert provenance['observations'] == 160
    assert provenance['first_date'] < provenance['last_date'] <= TODAY.isoformat()
    assert 'not a traded price' in provenance['valuation_basis']


# --- 4. the optimizer's history contract ------------------------------------

# Every key fetch_eur_history returns for a listed instrument. The NAV record
# must carry all of them so history_sources stays uniform across sources.
MARKET_RECORD_KEYS = {'history', 'currency', 'original_currency', 'history_supported',
                      'fx_symbol', 'symbol', 'omitted_provider_closes',
                      'missing_fx_dates', 'source', 'retrieved_at'}


def test_record_matches_the_contract_the_optimizer_already_consumes():
    record = nav_history_record(SYMBOL, payload(), TODAY)
    assert MARKET_RECORD_KEYS <= set(record)
    assert record['currency'] == record['original_currency'] == 'EUR'
    assert record['history_supported'] is True
    assert record['fx_symbol'] is None
    assert set(record['history'][0]) == {'date', 'close'}
    assert record['history'][0]['close'] > 0
    assert record['source_type'] == SOURCE_TYPE


def test_record_history_feeds_weekly_panel_without_lhv_specific_logic():
    from jarvis.domains.finance.portfolio_optimizer import weekly_panel
    record = nav_history_record(SYMBOL, payload(), TODAY)
    dates, levels, returns = weekly_panel({SYMBOL: record['history']}, [SYMBOL], TODAY)
    assert len(dates) > 104
    assert levels.shape[0] == len(dates)
    assert returns.shape[0] == len(dates) - 1


def test_depth_floor_clears_the_optimizer_minimum():
    """The adapter must reject anything the optimizer would reject later."""
    from jarvis.domains.finance.portfolio_optimizer import weekly_panel
    import inspect
    optimizer_floor = inspect.signature(weekly_panel).parameters['minimum_returns'].default
    assert MINIMUM_WEEKLY_RETURNS > optimizer_floor


# --- cadence: downsampled chart data must not satisfy depth ------------------

def test_weekly_periods_counts_weeks_not_chart_points():
    """Five points inside one week are one weekly period, not five."""
    monday = date(2026, 8, 31)
    days = [monday + timedelta(days=i) for i in range(5)]
    assert len(weekly_periods(days, TODAY)) == 1


def test_a_monthly_downsampled_series_is_rejected_despite_many_points():
    """The 'all' span is drawn for a chart and may thin out older observations."""
    monthly = series(count=200, step_days=30)
    with pytest.raises(NavHistoryError) as excinfo:
        parse_nav_history(SYMBOL, payload(monthly), TODAY)
    assert 'gap' in str(excinfo.value) or 'calendar weeks' in str(excinfo.value)


def test_a_cadence_that_hides_under_the_gap_limit_is_still_rejected():
    """Nine-day spacing passes every gap check and still starves the weekly panel."""
    sparse = series(count=200, step_days=9)
    assert max((date.fromisoformat(b['timestamp'][:10]) - date.fromisoformat(a['timestamp'][:10])).days
               for a, b in zip(sparse, sparse[1:])) <= MAX_NAV_GAP_DAYS
    with pytest.raises(NavHistoryError, match='calendar weeks'):
        parse_nav_history(SYMBOL, payload(sparse), TODAY)


def test_a_mixed_cadence_document_is_rejected_on_its_downsampled_tail():
    """Recent daily data must not paper over a thinned-out history."""
    old = series(count=60, step_days=30, end=TODAY - timedelta(days=200))
    recent = series(count=200, step_days=1)
    with pytest.raises(NavHistoryError):
        parse_nav_history(SYMBOL, payload([*old, *recent]), TODAY)


def test_a_genuine_weekly_series_passes_cadence():
    _, provenance = parse_nav_history(SYMBOL, payload(), TODAY)
    assert provenance['weekly_returns'] >= MINIMUM_WEEKLY_RETURNS
    assert provenance['weekly_periods'] == provenance['weekly_returns'] + 1


# --- a young fund is not a broken document -----------------------------------

def young_payload(symbol='LHVEVF', weeks=85):
    """A complete, sound series that reaches back to the fund's launch."""
    inception = FUND_HISTORY_METADATA[symbol]['expected_history_start']
    rows = [{'timestamp': (inception + timedelta(weeks=i)).isoformat() + 'T12:00:00Z',
             'price': round(10 + 0.01*i, 4)} for i in range(weeks)]
    return {'fundData': {'shortName': symbol, 'isin': ISINS[symbol],
                         'nav': rows[-1]['price'], 'currency': 'EUR'},
            'priceGraphDetails': rows}, inception + timedelta(weeks=weeks-1)


def test_a_fund_younger_than_the_requirement_is_immature_not_invalid():
    document, last = young_payload()
    today = last + timedelta(days=2)
    with pytest.raises(NavHistoryImmature) as excinfo:
        parse_nav_history('LHVEVF', document, today)
    error = excinfo.value
    assert error.code == 'official_nav_history_insufficient_since_inception'
    assert error.expected_history_start == '2025-01-28'
    assert error.basis == 'start_of_operation'
    assert error.weekly_returns < MINIMUM_WEEKLY_RETURNS
    assert 'valid but insufficient since inception' in str(error)
    assert 'start_of_operation 2025-01-28' in str(error)
    assert 'constrained fixed sleeve' in str(error)


def test_immature_is_a_kind_of_history_error_so_callers_cannot_miss_it():
    document, last = young_payload()
    with pytest.raises(NavHistoryError):
        parse_nav_history('LHVEVF', document, last + timedelta(days=2))


def test_a_truncated_series_is_invalid_even_for_a_fund_with_a_known_inception():
    """Short because the document starts late is a defect, not youth."""
    document, last = young_payload(weeks=85)
    document['priceGraphDetails'] = document['priceGraphDetails'][30:]
    with pytest.raises(NavHistoryError) as excinfo:
        parse_nav_history('LHVEVF', document, last + timedelta(days=2))
    assert not isinstance(excinfo.value, NavHistoryImmature)


def test_a_short_series_for_a_fund_with_no_expected_start_is_invalid(monkeypatch):
    """Nothing proves youth, so the conservative reading is a defect."""
    monkeypatch.setitem(FUND_HISTORY_METADATA, SYMBOL, None)
    monkeypatch.delitem(FUND_HISTORY_METADATA, SYMBOL)
    with pytest.raises(NavHistoryError) as excinfo:
        parse_nav_history(SYMBOL, payload(series(count=40)), TODAY)
    assert not isinstance(excinfo.value, NavHistoryImmature)


# --- the expected start is a stated concept, not a bare date ------------------

def test_every_recorded_start_declares_its_basis_and_source():
    for symbol, metadata in FUND_HISTORY_METADATA.items():
        assert metadata['basis'] == 'start_of_operation', symbol
        assert isinstance(metadata['expected_history_start'], date), symbol
        assert len(metadata['source']) > 40, symbol


def test_lhvworlda_uses_start_of_operation_not_the_later_launched_date():
    """History may exist before the marketing date, so the later one would truncate."""
    metadata = FUND_HISTORY_METADATA['LHVWORLDA']
    assert metadata['expected_history_start'] == date(2007, 8, 13)
    assert metadata['expected_history_start'] < date(2008, 2, 13)
    assert '13 February 2008' in metadata['source']


def test_provenance_records_the_basis_and_source_not_only_the_date():
    _, provenance = parse_nav_history(SYMBOL, payload(), TODAY)
    assert provenance['expected_history_start'] == '2007-08-13'
    assert provenance['history_start_basis'] == 'start_of_operation'
    assert 'start of operation' in provenance['history_start_source']
    assert provenance['history_start_lag_days'] is not None


def test_a_series_reaching_back_further_than_expected_is_not_a_defect():
    from jarvis.domains.finance.lhv_nav_history import history_start_lag
    assert history_start_lag('LHVEVF', date(2025, 1, 20)) == -8


def test_a_young_funds_document_defects_are_still_defects():
    """Youth never excuses a broken series."""
    document, last = young_payload()
    del document['priceGraphDetails'][20:24]
    with pytest.raises(NavHistoryError) as excinfo:
        parse_nav_history('LHVEVF', document, last + timedelta(days=2))
    assert not isinstance(excinfo.value, NavHistoryImmature)
    assert 'gap' in str(excinfo.value)


def test_lhvevf_cannot_meet_the_requirement_before_its_history_exists():
    """The concrete case: a real holding that simply has not lived long enough."""
    inception = FUND_HISTORY_METADATA['LHVEVF']['expected_history_start']
    weeks_available = (date(2026, 9, 14) - inception).days // 7
    assert weeks_available < MINIMUM_WEEKLY_RETURNS
