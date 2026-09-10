"""Instrument units are authoritative; sleeve values are their EUR aggregation.

Legacy units retain their documented ticker mapping on first manual application.
This does not reconcile historical transactions that previously mixed instruments.
"""
from copy import deepcopy
from math import isfinite
import re


def number(value, *, positive=False):
    if isinstance(value, bool):
        raise ValueError('Position values and units must be finite numbers.')
    try:
        result = float(value)
    except (TypeError, ValueError) as exc:
        raise ValueError('Position values and units must be known.') from exc
    if not isfinite(result) or result < 0 or (positive and result == 0):
        raise ValueError('Position values and units must be finite and nonnegative.')
    return result


def validate_positions(positions):
    if not isinstance(positions, dict):
        raise ValueError('Instrument positions must be a mapping.')
    for symbol, position in positions.items():
        if not re.fullmatch(r'[A-Z0-9][A-Z0-9.=-]{0,39}', symbol):
            raise ValueError('A valid instrument symbol is required.')
        units = number(position.get('units'))
        value = number(position.get('value_eur'))
        if units == 0 and value != 0:
            raise ValueError('A position without units cannot have a recorded value.')


def _sync(state, asset):
    positions = state['positions'][asset]
    validate_positions(positions)
    state.setdefault('holdings', {})[asset] = round(sum(p['value_eur'] for p in positions.values()), 2)
    active = [p for p in positions.values() if p['units'] > 0]
    state.setdefault('units', {})[asset] = active[0]['units'] if len(active) == 1 else (0 if not active else None)


def _initialize(state, asset):
    from .market_data import TICKER_MAP
    if asset in state.setdefault('positions', {}):
        validate_positions(state['positions'][asset])
        return
    value = number(state.get('holdings', {}).get(asset, 0) or 0)
    units = state.get('units', {}).get(asset)
    positions = {}
    if value or units:
        units = number(units, positive=True)
        symbol = TICKER_MAP.get(asset)
        if not symbol:
            raise ValueError('Existing holding has no verified instrument symbol mapping.')
        positions[symbol] = {'units': units, 'value_eur': value,
                             'identity_source': 'legacy_ticker_mapping'}
    state['positions'][asset] = positions


def apply_position_transaction(state, transaction, *, reverse=False):
    from .market_data import TICKER_MAP
    result = deepcopy(state)
    asset = transaction['asset']
    if transaction.get('side', 'buy').lower() != 'buy':
        raise ValueError('Only manually recorded buys are supported.')
    symbol = transaction.get('symbol')
    if not symbol and asset in {'btc', 'eth', 'sol', 'hype', 'tao'}:
        symbol = TICKER_MAP.get(asset)
    if not isinstance(symbol, str) or not re.fullmatch(r'[A-Z0-9][A-Z0-9.=-]{0,39}', symbol):
        raise ValueError('An exact instrument symbol is required before applying this transaction.')
    if asset in {'btc', 'eth', 'sol', 'hype', 'tao'} and symbol != TICKER_MAP.get(asset):
        raise ValueError('Crypto instrument symbol does not match the asset.')
    units = number(transaction.get('units'), positive=True)
    value = number(transaction.get('amount_eur'), positive=True)
    _initialize(result, asset)
    positions = result['positions'][asset]
    position = positions.get(symbol, {'units': 0, 'value_eur': 0, 'identity_source': 'manual_transaction'})
    pending = position.setdefault('unpriced_buys', [])
    record = {'transaction_id': transaction.get('id'), 'units': units, 'amount_eur': value}
    if reverse:
        if units > position['units'] + 1e-10:
            raise ValueError('Recorded instrument units are insufficient to reverse this transaction; reconcile the position first.')
        remaining = max(0, round(position['units'] - units, 10))
        if record in pending:
            position['value_eur'] = round(position['value_eur'] - value, 2)
            pending.remove(record)
        else:
            # Exclude newer unpriced contributions when reversing older, marked units.
            unpriced_units = sum(p['units'] for p in pending)
            unpriced_value = sum(p['amount_eur'] for p in pending)
            marked_units = position['units'] - unpriced_units
            if units > marked_units + 1e-10 or marked_units <= 0:
                raise ValueError('Cannot reconcile recorded units with pending transactions.')
            position['value_eur'] = round(unpriced_value + (position['value_eur'] - unpriced_value)
                                          * (marked_units - units) / marked_units, 2)
        position['units'] = remaining
    else:
        position['units'] = round(position['units'] + units, 10)
        position['value_eur'] = round(position['value_eur'] + value, 2)
        pending.append(record)
    positions[symbol] = position
    _sync(result, asset)
    # A recorded transaction is not a fresh market valuation.
    result['price_refresh_complete'] = False
    return result


def correct_position_units(state, asset, units, value_eur, *, symbol=None):
    result = deepcopy(state)
    units = number(units)
    positions = result.get('positions', {}).get(asset)
    if positions is not None:
        validate_positions(positions)
        active = [positions[symbol]] if symbol in positions else [p for p in positions.values() if p['units'] > 0]
        if symbol is not None and symbol not in positions:
            raise ValueError('Instrument symbol is not tracked in this sleeve.')
        if len(active) != 1:
            if len(positions) != 1:
                raise ValueError('Choose an individual instrument; aggregate units are ambiguous for this sleeve.')
            active = list(positions.values())
        position = active[0]
        old_units = position['units']
        position['value_eur'] = (number(value_eur) if value_eur is not None else
                                 round(position['value_eur'] * units / old_units, 2) if old_units else 0)
        position['units'] = units
        position['unpriced_buys'] = []
        _sync(result, asset)
    else:
        result.setdefault('units', {})[asset] = units
        if symbol is not None:
            from .market_data import TICKER_MAP
            if value_eur is None:
                raise ValueError('An explicit instrument correction requires its current EUR value as well as units.')
            if asset not in result.get('holdings', {}):
                raise ValueError('Instrument correction requires an active tracked sleeve.')
            if asset in {'btc', 'eth', 'sol', 'hype', 'tao'} and symbol != TICKER_MAP.get(asset):
                raise ValueError('Crypto instrument symbol does not match the asset.')
            result.setdefault('positions', {})[asset] = {symbol: {
                'units': units, 'value_eur': number(value_eur), 'identity_source': 'manual_correction'}}
            _sync(result, asset)
            result['price_refresh_complete'] = False
            return result
        if value_eur is not None:
            store = 'holdings' if asset in result.get('holdings', {}) else 'legacy_holdings'
            result.setdefault(store, {})[asset] = number(value_eur)
    result['price_refresh_complete'] = False
    return result
