import sys
from types import SimpleNamespace
from unittest.mock import patch

import pytest

from jarvis.domains.finance import market_data


@pytest.mark.parametrize('currency', ['USD', 'GBP', 'GBp', 'GBX'])
@pytest.mark.parametrize('rate', [None, 0, -1, float('nan'), float('inf')])
def test_missing_or_invalid_fx_never_becomes_parity(currency, rate):
    fx = {} if rate is None else {'USDEUR': rate, 'GBPEUR': rate}
    assert market_data._convert_to_eur(100, currency, fx) is None


@pytest.mark.parametrize('price', [0, -1, float('nan'), float('inf')])
def test_invalid_eur_price_is_not_accepted(price):
    assert market_data._convert_to_eur(price, 'EUR', {}) is None


@pytest.mark.parametrize('vix', [0, -1, float('nan'), float('inf')])
def test_invalid_vix_never_becomes_risk_on(vix):
    fake = SimpleNamespace(Ticker=lambda _: SimpleNamespace(fast_info=SimpleNamespace(last_price=vix)))
    with patch.dict(sys.modules, {'yfinance': fake}):
        assert market_data.detect_market_regime() == 'unknown'


def test_real_conversion_keeps_pence_and_currency_units_distinct():
    assert market_data._convert_to_eur(100, 'GBp', {'GBPEUR': 1.2}) == 1.2
    assert market_data._convert_to_eur(100, 'GBP', {'GBPEUR': 1.2}) == 120
    assert market_data._convert_to_eur(100, 'USD', {'USDEUR': .9}) == 90
