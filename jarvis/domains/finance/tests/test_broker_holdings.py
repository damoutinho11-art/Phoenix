from copy import deepcopy
from datetime import date
from unittest.mock import patch
import pytest

from jarvis.domains.finance import market_data
from jarvis.domains.finance.broker_holdings import reconcile_broker_position
from jarvis.domains.finance.holding_identity import build_identity_review
from jarvis.domains.finance.lhv_fund_nav import parse_fund_nav


def legacy():
    return {'holdings': {'btc': 0}, 'legacy_holdings': {'lhv_growth_world_equities': 2},
            'units': {'lhv_growth_world_equities': .02}}


def test_screenshot_correction_preserves_legacy_section_and_attaches_crosscheck():
    state = legacy(); before = deepcopy(state)
    result = reconcile_broker_position(state, 'lhv_growth_world_equities', .1, 1.6,
        broker_symbol='LHVWORLDA', evidence_sha256='a'*64, received_at='2026-09-14')
    assert result['legacy_holdings']['lhv_growth_world_equities'] == 1.6
    assert 'lhv_growth_world_equities' not in result['holdings']
    position = result['positions']['lhv_growth_world_equities']['LHVWORLDA']
    assert position['isin'] == 'EE3600092417'
    assert position['broker_evidence']['sha256'] == 'a'*64
    assert state == before
    review = build_identity_review(result)
    assert review['funds'][0]['fund_identity_verified'] is True
    assert review['exact_issuer_overlap']['available'] is False


def test_wrong_broker_symbol_or_missing_evidence_cannot_promote_identity():
    for symbol, digest in [('SWRD', 'a'*64), ('LHVWORLDA', ''), ('LHVEVF', 'a'*64)]:
        with pytest.raises(ValueError):
            reconcile_broker_position(legacy(), 'lhv_growth_world_equities', .1, 1.6,
                broker_symbol=symbol, evidence_sha256=digest, received_at='2026-09-14')


def test_legacy_refresh_uses_real_fund_and_preserves_evidence():
    state = reconcile_broker_position(legacy(), 'lhv_growth_world_equities', .1, 1.6,
        broker_symbol='LHVWORLDA', evidence_sha256='a'*64, received_at='2026-09-14')
    def prices(keys, *, symbol_map=None):
        assert set(symbol_map.values()) == {'LHVWORLDA'}
        return {key: 17 for key in keys}, []
    with patch.object(market_data, 'fetch_current_prices', side_effect=prices):
        result, meta = market_data.update_portfolio_state_prices(state, {})
    assert not meta['failed']
    assert result['legacy_holdings']['lhv_growth_world_equities'] == 1.7
    assert 'lhv_growth_world_equities' not in result['holdings']
    assert result['positions']['lhv_growth_world_equities']['LHVWORLDA']['broker_evidence']['sha256'] == 'a'*64


def test_refresh_cannot_bless_duplicate_active_and_legacy_value():
    state = reconcile_broker_position(legacy(), 'lhv_growth_world_equities', .1, 1.6,
        broker_symbol='LHVWORLDA', evidence_sha256='a'*64, received_at='2026-09-14')
    state['holdings']['lhv_growth_world_equities'] = 99
    with patch.object(market_data, 'fetch_current_prices', side_effect=lambda keys, **kwargs: ({key:17 for key in keys}, [])):
        result, meta = market_data.update_portfolio_state_prices(state, {})
    assert result['price_refresh_complete'] is False
    assert 'lhv_growth_world_equities' in meta['failed']
    assert result['legacy_holdings'] == state['legacy_holdings']


@pytest.mark.parametrize('evidence', ['invalid', {'sha256':'a'*64,'received_at':'not-a-date'},
                                    {'sha256':'a'*64,'received_at':'2999-01-01'}])
def test_malformed_saved_evidence_never_promotes_identity(evidence):
    state = reconcile_broker_position(legacy(), 'lhv_growth_world_equities', .1, 1.6,
        broker_symbol='LHVWORLDA', evidence_sha256='a'*64, received_at='2026-09-14')
    state['positions']['lhv_growth_world_equities']['LHVWORLDA']['broker_evidence']=evidence
    assert build_identity_review(state)['funds'][0]['fund_identity_verified'] is False


def nav_payload():
    return {'fundData': {'shortName':'LHVEVF', 'isin':'EE3600001921', 'nav':10.25},
            'priceGraphDetails':[{'timestamp':'2026-09-10T21:00:00Z', 'price':10.25}]}


def test_lhv_nav_failure_never_falls_back_to_a_yahoo_etf():
    with patch.object(market_data, '_fetch_fx_rates', return_value={}), patch('yfinance.Ticker') as yahoo, patch('jarvis.domains.finance.lhv_fund_nav.fetch_fund_nav', side_effect=ValueError('stale')):
        prices, failed = market_data.fetch_current_prices(['lhv_growth_euro_bond'])
    assert prices == {}
    assert failed == ['lhv_growth_euro_bond']
    yahoo.assert_not_called()


def test_dated_lhv_nav_uses_local_valuation_date():
    result = parse_fund_nav('LHVEVF', nav_payload(), date(2026,9,14))
    assert result['nav_eur'] == 10.25
    assert result['as_of'] == '2026-09-11'


@pytest.mark.parametrize('change', ['identity','symbol','stale','future','nan','mismatch'])
def test_bad_nav_fails_closed(change):
    payload=nav_payload()
    if change=='identity': payload['fundData']['isin']='EE3600092417'
    if change=='symbol': payload['fundData']['shortName']='LHVWORLDA'
    if change=='stale': payload['priceGraphDetails'][0]['timestamp']='2026-08-01T21:00:00Z'
    if change=='future': payload['priceGraphDetails'][0]['timestamp']='2026-09-15T21:00:00Z'
    if change=='nan': payload['fundData']['nav']=float('nan')
    if change=='mismatch': payload['fundData']['nav']=12
    with pytest.raises(ValueError): parse_fund_nav('LHVEVF', payload, date(2026,9,14))
