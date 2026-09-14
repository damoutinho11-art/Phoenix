"""Read-only fund identity disclosure; symbol records do not prove share classes."""
from math import isfinite

from .market_data import TICKER_MAP
from .broker_holdings import verified_broker_identity


_EXCLUDED = frozenset({'btc', 'eth', 'sol', 'hype', 'tao', 'tactical_reserve',
                       'lhv_growth_cash_pending_settlement'})
_OWNER_RECORDED = frozenset({'manual_transaction', 'manual_correction'})


def _positive(value):
    if isinstance(value, bool):
        return False
    try:
        return isfinite(float(value)) and float(value) > 0
    except (TypeError, ValueError, OverflowError):
        return False


def build_identity_review(state):
    """Describe current fund assumptions without changing or verifying holdings.

    Only reviewed broker screenshot evidence matching the bounded issuer
    registry establishes an owned identity. Symbols alone remain assumptions.
    Exact overlap additionally requires dated constituent data.
    """
    funds = []
    positions = state.get('positions', {})
    units = state.get('units', {})
    holdings = {**state.get('legacy_holdings', {}), **state.get('holdings', {})}
    for asset in sorted(set(holdings) | set(positions) | set(units)):
        if asset in _EXCLUDED:
            continue
        held_positions = [(symbol, position) for symbol, position in
                          positions.get(asset, {}).items()
                          if _positive(position.get('units')) or
                          _positive(position.get('value_eur'))]
        if held_positions:
            for symbol, position in sorted(held_positions):
                source = position.get('identity_source') or 'missing_provenance'
                verified = verified_broker_identity(asset, symbol, position)
                funds.append({
                    'asset': asset, 'symbol': symbol, 'identity_source': source,
                    'identity_status': 'broker_screenshot_crosschecked' if verified else ('owner_recorded_symbol' if source in
                                        _OWNER_RECORDED else 'assumed'),
                    'fund_identity_verified': verified,
                    **({'isin':position['isin'], 'name':position['name'],
                        'identity_reference':position['identity_reference']} if verified else {}),
                })
        elif _positive(holdings.get(asset)) or _positive(units.get(asset)):
            symbol = TICKER_MAP.get(asset)
            funds.append({
                'asset': asset, 'symbol': symbol,
                'identity_source': ('legacy_ticker_mapping_unconfirmed' if symbol
                                    else 'missing_instrument_identity'),
                'identity_status': 'assumed' if symbol else 'unknown',
                'fund_identity_verified': False,
            })
    return {
        'held_fund_count': len(funds),
        'funds': funds,
        'exact_issuer_overlap': {
            'available': False,
            'reason': 'Dated constituent weights are unavailable; any unverified owned fund identities must also be resolved.',
            'required_evidence': [
                'Broker evidence linking each held fund to its ISIN and share class.',
                'Dated constituent weights for each verified held fund.',
            ],
            'price_correlation_is_issuer_overlap': False,
        },
    }
