from copy import deepcopy

import pytest

from jarvis.domains.finance.holding_identity import build_identity_review


def test_positive_legacy_funds_are_flagged_without_exposing_amounts():
    result = build_identity_review({'legacy_holdings': {
        'lhv_growth_euro_bond': 0.15, 'lhv_growth_iemm': 20,
        'lhv_growth_world_equities': 0}})
    assert result['held_fund_count'] == 2
    assert {r['symbol'] for r in result['funds']} == {'IEAG.L', 'IEEM.L'}
    assert all(r['identity_status'] == 'assumed' for r in result['funds'])
    assert all(r['fund_identity_verified'] is False for r in result['funds'])
    assert all('value_eur' not in r and 'units' not in r for r in result['funds'])
    assert result['exact_issuer_overlap']['available'] is False


@pytest.mark.parametrize('source', [None, '', 'legacy_ticker_mapping',
                                  'legacy_ticker_mapping_unconfirmed', 'recorded_position'])
def test_missing_or_legacy_position_provenance_remains_assumed(source):
    position = {'units': 1, 'value_eur': 50}
    if source is not None:
        position['identity_source'] = source
    result = build_identity_review({'holdings': {'quality_etf': 50},
        'positions': {'quality_etf': {'IS3Q.DE': position}}})
    assert result['funds'][0]['identity_status'] == 'assumed'
    assert result['funds'][0]['fund_identity_verified'] is False


@pytest.mark.parametrize('source', ['manual_transaction', 'manual_correction'])
def test_manual_symbol_is_recorded_but_does_not_verify_fund_identity(source):
    result = build_identity_review({'holdings': {'global_core_etf': 50},
        'positions': {'global_core_etf': {'VWCE.DE': {
            'units': 1, 'value_eur': 50, 'identity_source': source,
            'isin': 'UNVERIFIED', 'fund_identity_verified': True}}}})
    row = result['funds'][0]
    assert row['symbol'] == 'VWCE.DE'
    assert row['identity_status'] == 'owner_recorded_symbol'
    assert row['identity_source'] == source
    assert row['fund_identity_verified'] is False
    assert result['exact_issuer_overlap']['available'] is False


def test_cash_and_crypto_are_excluded_and_inputs_preserved():
    state = {'holdings': {'btc': 50, 'tactical_reserve': 20},
        'legacy_holdings': {'lhv_growth_cash_pending_settlement': 10,
                           'lhv_growth_sxr8': 1},
        'positions': {'btc': {'BTC-EUR': {'units': 1, 'value_eur': 50}}}}
    before = deepcopy(state)
    result = build_identity_review(state)
    assert result['held_fund_count'] == 1
    assert result['funds'][0]['symbol'] == 'SXR8.DE'
    result['funds'][0]['symbol'] = 'CHANGED'
    assert state == before


def test_missing_valuation_with_held_units_still_requires_identity_review():
    result = build_identity_review({'legacy_holdings': {'lhv_growth_xcha': None},
                                   'units': {'lhv_growth_xcha': 1}})
    assert result['held_fund_count'] == 1
    assert result['funds'][0]['symbol'] == 'XCHA.L'
