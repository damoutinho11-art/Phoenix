"""Synthetic instrument accounting; never accesses portfolios or live quotes."""
from copy import deepcopy
from unittest.mock import patch

import pytest

from jarvis.domains.finance import market_data
from jarvis.domains.finance.positions import apply_position_transaction, correct_position_units


def original():
    return {'holdings': {'global_core_etf': 300}, 'units': {'global_core_etf': 2}}


def purchase():
    return {'asset': 'global_core_etf', 'symbol': 'SPYI.DE', 'side': 'buy',
            'amount_eur': 100, 'units': 10}


def test_different_funds_never_share_units_and_inputs_are_preserved():
    state, tx = original(), purchase()
    before = deepcopy(state)
    result = apply_position_transaction(state, tx)
    assert state == before
    assert result['positions']['global_core_etf']['VWCE.DE']['units'] == 2
    assert result['positions']['global_core_etf']['SPYI.DE']['units'] == 10
    assert result['units'].get('global_core_etf') is None
    assert result['holdings']['global_core_etf'] == 400


def test_refresh_values_each_instrument_and_void_preserves_other_fund():
    state = apply_position_transaction(original(), purchase())

    def quotes(keys, *, symbol_map=None):
        assert set(symbol_map.values()) == {'VWCE.DE', 'SPYI.DE'}
        prices = {'VWCE.DE': 160, 'SPYI.DE': 12}
        return {key: prices[symbol_map[key]] for key in keys}, []

    with patch.object(market_data, 'fetch_current_prices', side_effect=quotes):
        valued, meta = market_data.update_portfolio_state_prices(state, {})
    assert valued['holdings']['global_core_etf'] == 440
    assert not meta['failed']
    reversed_state = apply_position_transaction(valued, purchase(), reverse=True)
    assert reversed_state['holdings']['global_core_etf'] == 320
    assert reversed_state['positions']['global_core_etf']['VWCE.DE']['units'] == 2


def test_missing_one_quote_preserves_entire_sleeve_and_marks_incomplete():
    state = apply_position_transaction(original(), purchase())
    def quotes(keys, *, symbol_map=None):
        return ({key: 160 for key in keys if symbol_map[key] == 'VWCE.DE'},
                [key for key in keys if symbol_map[key] == 'SPYI.DE'])
    with patch.object(market_data, 'fetch_current_prices', side_effect=quotes):
        valued, meta = market_data.update_portfolio_state_prices(state, {})
    assert valued['holdings'] == state['holdings']
    assert valued['positions'] == state['positions']
    assert 'global_core_etf' in meta['failed']
    assert valued['price_refresh_complete'] is False


def test_unknown_legacy_units_and_ambiguous_correction_are_rejected():
    state = original()
    state['units'] = {}
    with pytest.raises(ValueError, match='units'):
        apply_position_transaction(state, purchase())
    mixed = apply_position_transaction(original(), purchase())
    with pytest.raises(ValueError, match='instrument'):
        correct_position_units(mixed, 'global_core_etf', 12, None)


def test_single_fund_correction_and_missing_symbol_fail_safely():
    state = apply_position_transaction({'holdings': {'global_core_etf': 0}}, purchase())
    result = correct_position_units(state, 'global_core_etf', 5, 60)
    assert result['positions']['global_core_etf']['SPYI.DE']['units'] == 5
    assert result['holdings']['global_core_etf'] == 60
    with pytest.raises(ValueError, match='symbol'):
        apply_position_transaction(original(), {**purchase(), 'symbol': None})


def test_invalid_or_excessive_reversal_never_clamps_or_corrupts_units():
    state = apply_position_transaction(original(), purchase())
    with pytest.raises(ValueError, match='units'):
        apply_position_transaction(state, {**purchase(), 'units': 11}, reverse=True)
    with pytest.raises(ValueError):
        apply_position_transaction(state, {**purchase(), 'units': float('nan')})


def test_immediate_void_restores_pre_buy_value_even_at_different_unit_cost():
    state = {'holdings': {'global_core_etf': 100}, 'units': {'global_core_etf': 10}}
    tx = {**purchase(), 'symbol': 'VWCE.DE', 'amount_eur': 200}
    applied = apply_position_transaction(state, tx)
    reversed_state = apply_position_transaction(applied, tx, reverse=True)
    assert reversed_state['holdings'] == state['holdings']
    assert reversed_state['units'] == state['units']


def test_mixed_sleeve_has_usable_symbol_specific_correction():
    mixed = apply_position_transaction(original(), purchase())
    corrected = correct_position_units(mixed, 'global_core_etf', 5, 60, symbol='SPYI.DE')
    assert corrected['positions']['global_core_etf']['SPYI.DE']['units'] == 5
    assert corrected['positions']['global_core_etf']['VWCE.DE']['units'] == 2
    assert corrected['holdings']['global_core_etf'] == 360


def test_explicit_legacy_identity_is_preserved_and_requires_a_value():
    with pytest.raises(ValueError):
        correct_position_units(original(), 'global_core_etf', 10, None, symbol='SPYI.DE')
    corrected = correct_position_units(original(), 'global_core_etf', 10, 100, symbol='SPYI.DE')
    assert list(corrected['positions']['global_core_etf']) == ['SPYI.DE']
    assert corrected['positions']['global_core_etf']['SPYI.DE']['value_eur'] == 100


def test_unfunded_candidates_do_not_require_quotes_for_portfolio_freshness():
    state = {'holdings': {'btc': 100, 'hype': 0, 'tao': 0, 'tactical_reserve': 50},
             'units': {'btc': .001, 'hype': 0, 'tao': 0}}
    def quotes(keys):
        assert keys == ['btc']
        return {'btc': 100000}, []
    with patch.object(market_data, 'fetch_current_prices', side_effect=quotes):
        refreshed, meta = market_data.update_portfolio_state_prices(state, {})
    assert refreshed['price_refresh_complete'] is True
    assert meta['failed'] == []
