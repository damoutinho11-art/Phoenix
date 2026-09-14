"""The diagnostic must describe a rejected document, not merely reject it."""
from datetime import date, timedelta
import pytest

from jarvis.domains.finance.lhv_fund_nav import ISINS
from jarvis.domains.finance.lhv_nav_diagnostic import (
    DENSE, DOWNSAMPLED, FIELDS, TRUNCATED, UNREADABLE, YOUNG,
    diagnose_nav_history, format_report)

TODAY = date(2026, 9, 10)


def document(symbol, count, step_days, *, end=TODAY, start=None):
    if start is not None:
        stamps = [start + timedelta(days=step_days*i) for i in range(count)]
    else:
        stamps = [end - timedelta(days=step_days*i) for i in range(count)][::-1]
    rows = [{'timestamp': day.isoformat() + 'T12:00:00Z', 'price': round(15 + 0.01*i, 4)}
            for i, day in enumerate(stamps)]
    return {'fundData': {'shortName': symbol, 'isin': ISINS[symbol],
                         'nav': rows[-1]['price'], 'currency': 'EUR'},
            'priceGraphDetails': rows}


def test_every_requested_field_is_always_present():
    report = diagnose_nav_history('LHVWORLDA', document('LHVWORLDA', 210, 7), TODAY)
    assert all(field in report for field in FIELDS)


def test_a_dense_series_is_described_and_accepted():
    report = diagnose_nav_history('LHVWORLDA', document('LHVWORLDA', 210, 7), TODAY)
    assert report['validation_result'] == 'VALID'
    assert report['interpretation'] == DENSE
    assert report['raw_observations'] == 210
    assert report['weeks_represented'] == report['calendar_weeks_spanned']
    assert report['weekly_coverage'] == 1.0
    assert report['genuine_weekly_returns'] == 208
    assert report['largest_internal_gap_days'] == 7


@pytest.mark.parametrize('step', [30, 14, 9])
def test_a_downsampled_series_is_named_as_downsampled_not_merely_invalid(step):
    report = diagnose_nav_history('LHVWORLDA', document('LHVWORLDA', 200, step), TODAY)
    assert report['validation_result'] == 'INVALID'
    assert report['interpretation'] == DOWNSAMPLED
    assert report['weekly_coverage'] < 1.0
    # The raw count looks generous, which is exactly the trap being caught.
    assert report['raw_observations'] == 200


def test_a_truncated_series_is_named_as_truncated():
    report = diagnose_nav_history('LHVWORLDA', document('LHVWORLDA', 40, 7), TODAY)
    assert report['validation_result'] == 'INVALID'
    assert report['interpretation'] == TRUNCATED
    assert report['weekly_coverage'] == 1.0          # dense, just far too short
    assert report['distance_from_expected_start_days'] > 365*17


def test_a_young_fund_is_named_as_young_rather_than_defective():
    start = date(2025, 1, 28)
    today = start + timedelta(weeks=84, days=2)
    report = diagnose_nav_history('LHVEVF', document('LHVEVF', 85, 7, start=start), today)
    assert report['validation_result'] == 'INSUFFICIENT_SINCE_INCEPTION'
    assert report['interpretation'] == YOUNG
    assert report['distance_from_expected_start_days'] == 0
    assert report['history_start_basis'] == 'start_of_operation'


def test_an_unreadable_document_still_reports_rather_than_raising():
    for payload in (None, {}, {'priceGraphDetails': 'nonsense'}, {'fundData': {}}):
        report = diagnose_nav_history('LHVWORLDA', payload, TODAY)
        assert report['raw_observations'] is None
        assert report['validation_result'] == 'INVALID'
        assert report['interpretation'] == UNREADABLE


def test_the_diagnostic_never_raises_on_a_malformed_series():
    broken = document('LHVWORLDA', 210, 7)
    broken['priceGraphDetails'][5]['price'] = 'not a number'
    report = diagnose_nav_history('LHVWORLDA', broken, TODAY)
    assert report['validation_result'] == 'INVALID'
    assert 'unreadable price' in report['validation_detail']


def test_the_expected_start_and_its_basis_are_reported_together():
    report = diagnose_nav_history('LHVWORLDA', document('LHVWORLDA', 210, 7), TODAY)
    assert report['expected_history_start'] == '2007-08-13'
    assert report['history_start_basis'] == 'start_of_operation'
    assert 'start of operation' in report['history_start_source']


def test_the_formatted_block_carries_every_label_a_human_needs():
    text = format_report(diagnose_nav_history('LHVWORLDA', document('LHVWORLDA', 210, 7), TODAY))
    for label in ('raw observations', 'first date', 'last date', 'calendar weeks spanned',
                  'weeks represented', 'weekly coverage', 'genuine weekly returns',
                  'largest internal gap', 'expected history start',
                  'distance from expected start', 'validation result'):
        assert label in text, label
    assert text.startswith('LHVWORLDA')


def test_the_diagnostic_reports_no_prices():
    """It describes a series; it must never become a pricing path."""
    report = diagnose_nav_history('LHVWORLDA', document('LHVWORLDA', 210, 7), TODAY)
    assert not any('nav_eur' in str(key) or 'price' in str(key) for key in report)
