"""Public EUR share-class reference quotes; never broker execution prices."""
from datetime import datetime
import hashlib
from html import unescape
from math import isfinite
import re
import httpx

BASE_URL = 'https://www.tradegatebsx.com/orderbuch.php?isin='


def parse_quote(document, isin, today):
    if not re.fullmatch(r'[A-Z]{2}[A-Z0-9]{9}[0-9]', str(isin)):
        raise ValueError('Verified ETF ISIN required for reference quote.')
    clean = re.sub(r'<(script|style)\b[^>]*>.*?</\1>', '', document, flags=re.S | re.I)
    def visible(text):
        return ' '.join(unescape(re.sub(r'<[^>]+>', '', text)).split())
    identities = []
    for row in re.findall(r'<tr\b[^>]*>(.*?)</tr>', clean, re.S | re.I):
        cells = [visible(x) for x in re.findall(r'<td\b[^>]*>(.*?)</td>', row, re.S | re.I)]
        if len(cells) == 4 and cells[2] == isin:
            identities.append(cells)
    if len(identities) != 1 or identities[0][3] != 'EUR':
        raise ValueError('Reference quote share class or EUR identity is unverified.')
    def field(name):
        values = re.findall(r'<[^>]+\bid=["\']' + name + r'["\'][^>]*>([^<]*)</', clean, re.I)
        if len(values) != 1:
            raise ValueError('Reference quote field is missing or duplicated.')
        return visible(values[0])
    def number(name):
        value = field(name)
        if not re.fullmatch(r'\d+(?:\.\d{3})*(?:,\d+)?', value):
            raise ValueError('Reference quote number is invalid.')
        result = float(value.replace('.', '').replace(',', '.'))
        if not isfinite(result) or result <= 0:
            raise ValueError('Reference quote must be positive.')
        return result
    stamp = datetime.strptime(field('rt_datum')+' '+field('rt_zeit'), '%d.%m.%Y %H:%M:%S')
    if not 0 <= (today-stamp.date()).days <= 7:
        raise ValueError('Reference quote date is stale or in the future.')
    bid, ask = number('bid'), number('ask')
    bid_size, ask_size = number('bidsize'), number('asksize')
    if bid > ask:
        raise ValueError('Reference quote is crossed.')
    spread = 100*((ask-bid)/(ask/2+bid/2))
    if not isfinite(spread) or not 0 <= spread <= 10:
        raise ValueError('Reference quote is crossed or excessively wide.')
    return {'spread_pct':spread, 'quote_date':stamp.date().isoformat(),
            'quote_timestamp_local':stamp.isoformat(), 'quote_timezone':'Europe/Berlin',
            'quote_source':BASE_URL+isin, 'quote_venue':'Tradegate BSX EUR reference market',
            'broker_execution_quote':False, 'quote_isin':isin, 'quote_currency':'EUR',
            'quote_bid':bid, 'quote_ask':ask, 'quote_bid_size':bid_size, 'quote_ask_size':ask_size,
            'quote_document_sha256':hashlib.sha256(document.encode()).hexdigest()}


def fetch_reference_quote(isin, today):
    if not re.fullmatch(r'[A-Z]{2}[A-Z0-9]{9}[0-9]', str(isin)):
        raise ValueError('Verified ETF ISIN required for reference quote.')
    with httpx.stream('GET', BASE_URL+isin, timeout=5, follow_redirects=False) as response:
        response.raise_for_status()
        body = bytearray()
        for chunk in response.iter_bytes():
            body.extend(chunk)
            if len(body) > 2_000_000:
                raise ValueError('Reference quote document exceeds size limit.')
    return parse_quote(body.decode('utf-8'), isin, today)
