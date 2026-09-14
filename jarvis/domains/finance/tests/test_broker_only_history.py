"""Each symbol reaches the one source that speaks for it, and failures stay distinct."""
from datetime import date
import pytest

from jarvis.domains.finance import optimizer_evidence
from jarvis.domains.finance.lhv_nav_history import (
    OFFICIAL_NAV_HISTORY_INVALID, PUBLIC_MARKET_HISTORY_UNAVAILABLE, NavHistoryError)
from jarvis.domains.finance.market_data import BROKER_ONLY_SYMBOLS, TICKER_MAP
from jarvis.domains.finance.optimizer_evidence import (
    BROKER_ONLY_HISTORY, fetch_eur_history, fetch_histories)

TODAY = date(2026, 9, 14)


@pytest.fixture(autouse=True)
def clear_cache():
    optimizer_evidence._cache.clear()
    yield
    optimizer_evidence._cache.clear()


def test_the_legacy_lhv_funds_map_to_broker_only_symbols():
    assert TICKER_MAP['lhv_growth_world_equities'] in BROKER_ONLY_SYMBOLS
    assert TICKER_MAP['lhv_growth_euro_bond'] in BROKER_ONLY_SYMBOLS


@pytest.mark.parametrize('symbol', sorted(BROKER_ONLY_SYMBOLS))
def test_market_history_still_refuses_broker_only_symbols(symbol):
    """No market data provider carries these, so none is ever asked."""
    with pytest.raises(ValueError, match='no market data provider carries'):
        fetch_eur_history(symbol, TODAY)


def nav_record(symbol):
    return {'history': [{'date': '2026-09-11', 'close': 15.0}], 'symbol': symbol,
            'history_supported': True, 'source_type': 'official_fund_nav'}


def test_lhv_funds_are_routed_to_official_nav_and_never_to_market_data(monkeypatch):
    market, official = [], []
    monkeypatch.setattr(optimizer_evidence, 'fetch_eur_history',
                        lambda s, today: market.append(s) or nav_record(s))
    monkeypatch.setattr(optimizer_evidence, 'fetch_nav_history',
                        lambda s, today: official.append(s) or nav_record(s))

    records = fetch_histories(['LHVWORLDA', 'LHVEVF', 'VWCE.DE'], TODAY)

    assert market == ['VWCE.DE']
    assert official == ['LHVEVF', 'LHVWORLDA']
    assert all(records[s]['history_supported'] is True for s in records)
    assert all('error_code' not in records[s] for s in records)


def test_an_invalid_official_series_is_not_reported_as_a_missing_source(monkeypatch):
    def invalid(symbol, today):
        raise NavHistoryError(f'Official NAV history has 12 observations; at least 110 are required.')

    monkeypatch.setattr(optimizer_evidence, 'fetch_nav_history', invalid)
    monkeypatch.setattr(optimizer_evidence, 'fetch_eur_history', lambda s, today: nav_record(s))

    records = fetch_histories(['LHVWORLDA', 'VWCE.DE'], TODAY)
    record = records['LHVWORLDA']

    # The source exists and answered; what it published did not hold up.
    assert record['history_supported'] is True
    assert record['error_code'] == OFFICIAL_NAV_HISTORY_INVALID
    assert '12 observations' in record['error']
    assert 'error_code' not in records['VWCE.DE']


def test_an_unreachable_official_source_does_not_claim_a_data_quality_defect(monkeypatch):
    monkeypatch.setattr(optimizer_evidence, 'fetch_nav_history',
                        lambda s, today: (_ for _ in ()).throw(OSError('network down')))
    records = fetch_histories(['LHVWORLDA'], TODAY)

    assert records['LHVWORLDA']['error_code'] == OFFICIAL_NAV_HISTORY_INVALID
    assert records['LHVWORLDA']['error'] == optimizer_evidence.OFFICIAL_NAV_HISTORY_UNAVAILABLE
    assert 'observations' not in records['LHVWORLDA']['error']


def test_a_market_failure_keeps_its_own_classification(monkeypatch):
    monkeypatch.setattr(optimizer_evidence, 'fetch_eur_history',
                        lambda s, today: (_ for _ in ()).throw(OSError('network down')))
    monkeypatch.setattr(optimizer_evidence, 'fetch_nav_history', lambda s, today: nav_record(s))
    records = fetch_histories(['LHVWORLDA', 'VWCE.DE'], TODAY)

    assert records['VWCE.DE']['error_code'] == PUBLIC_MARKET_HISTORY_UNAVAILABLE
    assert records['VWCE.DE']['error'] == optimizer_evidence.MARKET_HISTORY_UNAVAILABLE
    assert 'error_code' not in records['LHVWORLDA']


def test_a_broker_only_symbol_without_an_adapter_has_no_source_at_all(monkeypatch):
    """Classification still exists for a share class nothing can price historically."""
    monkeypatch.setattr(optimizer_evidence, 'BROKER_ONLY_SYMBOLS',
                        frozenset(BROKER_ONLY_SYMBOLS | {'NOSOURCE'}))
    looked_up = []
    monkeypatch.setattr(optimizer_evidence, 'fetch_eur_history',
                        lambda s, today: looked_up.append(s) or nav_record(s))
    monkeypatch.setattr(optimizer_evidence, 'fetch_nav_history', lambda s, today: nav_record(s))

    records = fetch_histories(['NOSOURCE', 'VWCE.DE'], TODAY)

    assert looked_up == ['VWCE.DE']
    assert records['NOSOURCE']['history_supported'] is False
    assert records['NOSOURCE']['error'] == BROKER_ONLY_HISTORY
    assert records['NOSOURCE']['error_code'] == PUBLIC_MARKET_HISTORY_UNAVAILABLE
