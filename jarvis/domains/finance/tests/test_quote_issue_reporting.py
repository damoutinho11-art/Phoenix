"""A blocked contribution must say why, not leak a date-parsing error."""
from datetime import date
import pytest

from jarvis.domains.finance.buy_selection import _recent

TODAY = date(2026, 9, 14)


@pytest.mark.parametrize('value', [None, '', 'n/a', 'unknown', 0, [], {}, 'NaT'])
def test_unusable_dates_are_not_recent_and_do_not_raise(value):
    assert _recent(value, TODAY, 7) is False


@pytest.mark.parametrize('value,days,expected', [
    ('2026-09-14', 7, True),
    ('2026-09-07', 7, True),
    ('2026-09-06', 7, False),
    ('2026-09-15', 7, False),          # future dated
    ('2026-09-14T09:30:00Z', 7, True),  # timestamps still truncate to a date
])
def test_real_dates_keep_their_window(value, days, expected):
    assert _recent(value, TODAY, days) is expected


def candidate(**overrides):
    row = {'asset': 'global_core_etf', 'lane': 'etf', 'symbol': 'VWCE.DE', 'currency': 'EUR',
           'source': 'test', 'broker_verified': True, 'broker_source': 'https://example.invalid',
           'verified_at': TODAY.isoformat(), 'mandate_approved': True, 'product_type': 'ETF',
           'isin': 'IE00BK5BQT80', 'fee_pct': 0.0, 'fund_fee_pct': 0.22,
           'quote_date': TODAY.isoformat(), 'spread_pct': 0.05, 'history': []}
    row.update(overrides)
    return row


def constitution():
    return {'target_weights': {'global_core_etf': 1.0}, 'asset_routes': {'global_core_etf': 'lightyear'},
            'sleeve_bands': {'global_core_etf': {'max_weight': 1.0}}, 'minimum_efficient_buys': {}}


def evaluate(row):
    from jarvis.domains.finance.buy_selection import _evaluate
    return _evaluate(row, constitution(), {'platform_status': {'lightyear_ready': True}},
                     {'global_core_etf': 100000}, 50000, TODAY)


ISSUE = ('Primary quote has missing, stale, future-dated or crossed bid/ask evidence. '
         'A dated exchange reference quote is also unavailable.')


@pytest.mark.parametrize('quote_date,spread', [
    (None, None),                  # no quote at all
    ('2026-01-01', None),          # stale primary, no usable spread
    ('2026-01-01', 0.05),          # stale primary that still carries a spread
    (TODAY.isoformat(), None),     # fresh date but no spread
])
def test_recorded_quote_issue_is_reported_verbatim(quote_date, spread):
    result = evaluate(candidate(quote_date=quote_date, spread_pct=spread, quote_issue=ISSUE))
    assert result['eligible'] is False
    assert result['reason'] == ISSUE


@pytest.mark.parametrize('quote_date', [None, '', 'n/a'])
def test_missing_quote_date_never_reports_a_parsing_error(quote_date):
    result = evaluate(candidate(quote_date=quote_date))
    assert result['eligible'] is False
    assert 'isoformat' not in result['reason']
    assert result['reason'] == 'Quote and spread evidence is stale.'


def test_stale_quote_without_a_recorded_issue_keeps_the_generic_message():
    result = evaluate(candidate(quote_date='2026-01-01'))
    assert result['reason'] == 'Quote and spread evidence is stale.'


def test_a_usable_quote_is_not_blocked_by_a_stale_issue_note():
    """quote_issue is only decisive while the evidence is actually unusable."""
    result = evaluate(candidate(quote_issue=ISSUE))
    assert result['reason'] != ISSUE
