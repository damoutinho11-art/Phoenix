"""Broker-only funds are classified as unsupported, never looked up on Yahoo."""
from datetime import date
import pytest

from jarvis.domains.finance import optimizer_evidence
from jarvis.domains.finance.market_data import BROKER_ONLY_SYMBOLS, TICKER_MAP
from jarvis.domains.finance.optimizer_evidence import (
    BROKER_ONLY_HISTORY, fetch_eur_history, fetch_histories)

TODAY = date(2026, 9, 14)


def test_the_legacy_lhv_funds_map_to_broker_only_symbols():
    assert TICKER_MAP['lhv_growth_world_equities'] in BROKER_ONLY_SYMBOLS
    assert TICKER_MAP['lhv_growth_euro_bond'] in BROKER_ONLY_SYMBOLS


@pytest.mark.parametrize('symbol', sorted(BROKER_ONLY_SYMBOLS))
def test_direct_history_fetch_refuses_broker_only_symbols(symbol):
    with pytest.raises(ValueError, match='No public daily price history'):
        fetch_eur_history(symbol, TODAY)


def test_broker_only_symbols_are_classified_without_a_market_data_lookup(monkeypatch):
    looked_up = []

    def spy(symbol, today):
        looked_up.append(symbol)
        return {'history': [{'date': '2026-09-11', 'close': 1.0}], 'symbol': symbol,
                'history_supported': True}

    monkeypatch.setattr(optimizer_evidence, 'fetch_eur_history', spy)
    optimizer_evidence._cache.clear()
    records = fetch_histories(['LHVWORLDA', 'LHVEVF', 'VWCE.DE'], TODAY)

    assert looked_up == ['VWCE.DE']
    for symbol in ('LHVWORLDA', 'LHVEVF'):
        assert records[symbol]['history'] == []
        assert records[symbol]['history_supported'] is False
        assert records[symbol]['error'] == BROKER_ONLY_HISTORY
    assert records['VWCE.DE']['history_supported'] is True


def test_a_transient_failure_stays_distinguishable_from_an_unsupported_one(monkeypatch):
    def failing(symbol, today):
        raise OSError('network down')

    monkeypatch.setattr(optimizer_evidence, 'fetch_eur_history', failing)
    optimizer_evidence._cache.clear()
    records = fetch_histories(['LHVWORLDA', 'VWCE.DE'], TODAY)

    # Unsupported: no source exists. Failed: a source exists but did not answer.
    assert records['LHVWORLDA']['history_supported'] is False
    assert records['VWCE.DE']['history_supported'] is True
    assert 'unavailable or request timed out' in records['VWCE.DE']['error']
    optimizer_evidence._cache.clear()
