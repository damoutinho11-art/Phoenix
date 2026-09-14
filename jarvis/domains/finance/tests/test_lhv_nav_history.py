"""Official NAV history is a price source only when the published series holds up."""
from datetime import date, timedelta
import hashlib
import json

import pytest

from jarvis.domains.finance.lhv_fund_nav import ISINS
from jarvis.domains.finance.lhv_nav_history import (
    MAX_NAV_GAP_DAYS, MINIMUM_NAV_OBSERVATIONS, MINIMUM_NAV_SPAN_DAYS, SOURCE_TYPE,
    NavHistoryError, nav_history_record, parse_nav_history)

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


def test_insufficient_observations_are_rejected_with_the_count_received():
    short = series(count=MINIMUM_NAV_OBSERVATIONS - 1)
    with pytest.raises(NavHistoryError, match=f'has {MINIMUM_NAV_OBSERVATIONS-1} observations'):
        parse_nav_history(SYMBOL, payload(short), TODAY)


def test_a_dense_but_shallow_series_is_rejected_on_span():
    """Enough points is not enough history: a year of daily NAVs is still a year."""
    daily = series(count=300, step_days=1)
    with pytest.raises(NavHistoryError, match='spans'):
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


def test_span_and_depth_floors_clear_the_optimizer_minimum():
    """The adapter must reject anything the optimizer would reject later."""
    assert MINIMUM_NAV_OBSERVATIONS > 104
    assert MINIMUM_NAV_SPAN_DAYS >= 2 * 365
