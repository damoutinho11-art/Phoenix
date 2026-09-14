"""Bounded broker-symbol crosschecks; ownership evidence is stored privately."""
from datetime import date
import re
from jarvis.core import clock
from .positions import correct_position_units


FUND_IDENTITIES = {
    'lhv_growth_world_equities': {'broker_symbol':'LHVWORLDA','symbol':'LHVWORLDA',
        'isin':'EE3600092417','name':'LHV World Equities Fund',
        'source':'https://www.lhv.ee/en/investment-funds'},
    'lhv_growth_euro_bond': {'broker_symbol':'LHVEVF','symbol':'LHVEVF',
        'isin':'EE3600001921','name':'LHV Euro Bond Fund',
        'source':'https://www.lhv.ee/en/investment-funds'},
    'lhv_growth_iemm': {'broker_symbol':'IEMM','symbol':'IEMM.AS',
        'isin':'IE00B0M63177','name':'iShares MSCI EM UCITS ETF USD (Dist)',
        'source':'https://www.ishares.com/nl/professionele-belegger/nl/producten/251857/'},
    'lhv_growth_sxr8': {'broker_symbol':'SXR8','symbol':'SXR8.DE',
        'isin':'IE00B5BMR087','name':'iShares Core S&P 500 UCITS ETF USD (Acc)',
        'source':'https://www.blackrock.com/de/privatanleger/produkt/253743/ishares-sp-500-b-ucits-etf-acc-fund'},
    'lhv_growth_xcha': {'broker_symbol':'XCHA','symbol':'XCHA.DE',
        'isin':'LU0779800910','name':'Xtrackers CSI300 Swap UCITS ETF 1C',
        'source':'https://etf.dws.com/de-de/LU0779800910-csi300-swap-ucits-etf-1c/'},
    'growth_nasdaq_etf': {'broker_symbol':'XNAS','symbol':'XNAS.DE',
        'isin':'IE00BMFKG444','name':'Xtrackers NASDAQ 100 UCITS ETF 1C',
        'source':'https://etf.dws.com/en-ch/AssetDownload/Index/083dea93-a623-4d41-92f2-0b60d7d4842c/Factsheet.pdf/'},
    'quality_etf': {'broker_symbol':'IS3Q','symbol':'IS3Q.DE',
        'isin':'IE00BP3QZ601','name':'iShares Edge MSCI World Quality Factor UCITS ETF USD (Acc)',
        'source':'https://www.blackrock.com/de/professionelle-anleger/produkt/270054/ishares-msci-world-quality-factor-ucits-etf'},
    'btc': {'broker_symbol':'BTC','symbol':'BTC-EUR','isin':None,'name':'Bitcoin',
        'source':'https://www.lhv.ee/en/crypto'},
}


def verified_broker_identity(asset, symbol, position):
    entry = FUND_IDENTITIES.get(asset)
    evidence = position.get('broker_evidence') or {}
    if not isinstance(evidence, dict):
        return False
    try:
        received = evidence.get('received_at')
        if not isinstance(received, str) or date.fromisoformat(received).isoformat() != received or date.fromisoformat(received) > clock.today():
            return False
    except ValueError:
        return False
    return bool(entry and symbol == entry['symbol']
        and position.get('identity_source') == 'broker_screenshot_issuer_crosscheck'
        and position.get('isin') == entry['isin']
        and position.get('name') == entry['name']
        and position.get('broker_symbol') == entry['broker_symbol']
        and position.get('identity_reference') == entry['source']
        and re.fullmatch('[0-9a-f]{64}', str(evidence.get('sha256', '')))
        and evidence.get('received_at'))


def reconcile_broker_position(state, asset, units, value_eur, *, broker_symbol, evidence_sha256, received_at):
    entry = FUND_IDENTITIES.get(asset)
    if not entry or broker_symbol != entry['broker_symbol']:
        raise ValueError('Broker symbol does not match the reviewed fund identity.')
    if not isinstance(evidence_sha256, str) or not re.fullmatch('[0-9a-f]{64}', evidence_sha256):
        raise ValueError('The reviewed broker screenshot hash is required.')
    if date.fromisoformat(received_at).isoformat() != received_at or date.fromisoformat(received_at) > clock.today():
        raise ValueError('Evidence receipt requires an ISO date.')
    if value_eur is None:
        raise ValueError('A screenshot correction requires its displayed EUR value.')
    result = correct_position_units(state, asset, units, value_eur, symbol=entry['symbol'])
    position = result['positions'][asset][entry['symbol']]
    position.update(isin=entry['isin'], name=entry['name'], broker_symbol=broker_symbol,
        identity_source='broker_screenshot_issuer_crosscheck', identity_reference=entry['source'],
        broker_evidence={'sha256':evidence_sha256,'received_at':received_at,
                         'reported_units':position['units'],'reported_value_eur':position['value_eur'],
                         'observation_date_verified':False})
    return result
