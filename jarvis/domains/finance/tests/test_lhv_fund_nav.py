"""Official LHV NAV parsing: rounding tolerance must not become price tolerance."""
from datetime import date
import pytest

from jarvis.domains.finance.lhv_fund_nav import (
    NAV_ABS_TOLERANCE_EUR, ISINS, parse_fund_nav)

TODAY = date(2026, 9, 14)
SYMBOL = 'LHVWORLDA'


def payload(nav, price, timestamp='2026-09-11T12:00:00Z'):
    return {'fundData': {'shortName': SYMBOL, 'isin': ISINS[SYMBOL], 'nav': nav},
            'priceGraphDetails': [{'timestamp': timestamp, 'price': price}]}


def test_matching_nav_and_price_reconcile():
    result = parse_fund_nav(SYMBOL, payload(15.2345, 15.2345), TODAY)
    assert result == {'nav_eur': 15.2345, 'as_of': '2026-09-11', 'isin': ISINS[SYMBOL],
                      'source': 'https://www.lhv.ee/b/public/market-data/fund/LHVWORLDA?timeSpan=year'}


@pytest.mark.parametrize('nav,price', [
    (15.2345, 15.23),      # headline rounded to cents, series to four decimals
    (15.23, 15.2345),      # the same disagreement in the other direction
    (15.2345, 15.2346),    # last published decimal differs
    (15.23, 15.2349),      # widest difference two-decimal rounding can produce
])
def test_publisher_rounding_differences_are_accepted(nav, price):
    assert parse_fund_nav(SYMBOL, payload(nav, price), TODAY)['nav_eur'] == nav


@pytest.mark.parametrize('nav,price', [
    (15.23, 15.24),        # a full cent apart is a real disagreement
    (15.23, 15.30),
    (15.23, 16.00),
    (15.23, 1.523),        # a decimal-place error must never be tolerated
])
def test_real_pricing_disagreements_still_fail_closed(nav, price):
    with pytest.raises(ValueError, match='do not reconcile'):
        parse_fund_nav(SYMBOL, payload(nav, price), TODAY)


def test_tolerance_is_bounded_to_two_decimal_rounding():
    """The band must stay narrow enough that a one-cent gap is still rejected."""
    assert NAV_ABS_TOLERANCE_EUR == 0.005
    with pytest.raises(ValueError, match='do not reconcile'):
        parse_fund_nav(SYMBOL, payload(15.0, 15.0 + 0.01), TODAY)


def test_large_unit_prices_use_the_relative_bound():
    with pytest.raises(ValueError, match='do not reconcile'):
        parse_fund_nav(SYMBOL, payload(100000.0, 100000.5), TODAY)


@pytest.mark.parametrize('nav,price', [(0, 0), (-15.23, -15.23)])
def test_nonpositive_valuations_are_rejected(nav, price):
    with pytest.raises(ValueError, match='do not reconcile'):
        parse_fund_nav(SYMBOL, payload(nav, price), TODAY)


def test_stale_and_future_dated_navs_are_rejected():
    with pytest.raises(ValueError, match='stale or future dated'):
        parse_fund_nav(SYMBOL, payload(15.23, 15.23, '2026-08-01T12:00:00Z'), TODAY)
    with pytest.raises(ValueError, match='stale or future dated'):
        parse_fund_nav(SYMBOL, payload(15.23, 15.23, '2026-09-20T12:00:00Z'), TODAY)


def test_identity_mismatch_is_rejected():
    wrong = payload(15.23, 15.23)
    wrong['fundData']['isin'] = 'EE0000000000'
    with pytest.raises(ValueError, match='identity does not match'):
        parse_fund_nav(SYMBOL, wrong, TODAY)


def test_naive_timestamp_is_rejected():
    with pytest.raises(ValueError, match='timezone'):
        parse_fund_nav(SYMBOL, payload(15.23, 15.23, '2026-09-11T12:00:00'), TODAY)
