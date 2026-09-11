"""Independent exchange fee evidence, usable only to bound comparison costs."""
from hashlib import sha256
from html import unescape
import re

from .buy_selection import _number, _recent

EXCHANGE_FUNDS = {'EQAC.MI': 'IE00BFZXGZ54'}


def exchange_url(symbol):
    isin = EXCHANGE_FUNDS.get(symbol)
    return (f'https://www.borsaitaliana.it/borsa/etf/scheda/{isin}-ETFP.html?lang=en'
            if isin else None)


def parse_exchange_cost(symbol, document, today):
    isin = EXCHANGE_FUNDS.get(symbol)
    if not isin:
        raise ValueError('No reviewed exchange identity mapping.')
    visible = re.sub(r'<(script|style)\b[^>]*>.*?</\1>', '', document, flags=re.I|re.S)
    text = ' '.join(unescape(re.sub('<[^>]+>', ' ', visible)).split())
    expected = {'Instrument Type': 'ETF', 'Alphanumeric Code': symbol.split('.')[0], 'Isin Code': isin}
    for label,value in expected.items():
        if re.findall(re.escape(label)+r'\s+(\S+)',text) != [value]:
            raise ValueError('Exchange instrument identity is missing or conflicting.')
    fees = re.findall(r'Total Annual Fees\s+(\S+)',text)
    if len(fees) != 1 or not re.fullmatch(r'[0-9]+(?:\.[0-9]+)?%',fees[0]):
        raise ValueError('Exchange annual fee is missing or conflicting.')
    fee = _number(float(fees[0][:-1]),maximum=5)
    return {'symbol':symbol,'isin':isin,'annual_fee_pct':fee,
            'source':exchange_url(symbol),'verified_at':today.isoformat(),
            'document_sha256':sha256(document.encode('utf-8')).hexdigest()}


def independent_cost_floor(row, today):
    evidence = row.get('fund_cost_evidence')
    if not isinstance(evidence,dict):
        return None
    try:
        symbol = row.get('symbol')
        if (symbol not in EXCHANGE_FUNDS or evidence.get('symbol') != symbol
            or evidence.get('isin') != EXCHANGE_FUNDS[symbol]
            or evidence.get('source') != exchange_url(symbol)
            or not _recent(evidence.get('verified_at'),today,1)
            or not re.fullmatch('[0-9a-f]{64}',str(evidence.get('document_sha256','')))
            or row.get('isin') not in (None,evidence['isin'])):
            return None
        fee = _number(evidence.get('annual_fee_pct'),maximum=5)
        if row.get('fund_fee_pct') is not None and abs(_number(row['fund_fee_pct'],maximum=5)-fee)>1e-9:
            return None
        return {**evidence,'annual_fee_pct':fee}
    except (TypeError,ValueError,KeyError):
        return None


def conflicting_fund_cost(row, today):
    """A verified source disagreement cannot fall back to either source."""
    independent = independent_cost_floor({**row,'isin':None,'fund_fee_pct':None},today)
    if not independent:
        return False
    return independent_cost_floor(row,today) is None
