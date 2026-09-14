"""Public EUR share-class reference quotes; never broker execution prices."""
from datetime import datetime
import hashlib
from html import unescape
from math import isfinite
import re
import httpx

BASE_URL = 'https://www.tradegatebsx.com/orderbuch.php?isin='


def decode_document(raw, content_type=None):
    """Decode a quote page by its declared charset, never failing on raw bytes.

    German venues still serve ISO-8859-1, and an undeclared or mislabelled
    charset must not silently disable the fallback quote: a UnicodeDecodeError
    is a ValueError, so the caller would record 'reference quote unavailable'
    for what is really an encoding mismatch. Decoding therefore degrades through
    the declared charset, utf-8 and cp1252 to latin-1, which accepts any byte.
    The evidence hash is taken over the original bytes, so a lenient decode
    never changes what was received.
    """
    raw = bytes(raw)
    declared = None
    if content_type:
        match = re.search(r'charset=["\']?([\w.:-]+)', content_type, re.I)
        declared = match.group(1) if match else None
    if declared is None:
        head = raw[:2048].decode('latin-1')
        match = (re.search(r'<meta[^>]+charset=["\']?([\w.:-]+)', head, re.I)
                 or re.search(r'charset=["\']?([\w.:-]+)', head, re.I))
        declared = match.group(1) if match else None
    for encoding in (declared, 'utf-8', 'cp1252', 'latin-1'):
        if not encoding:
            continue
        try:
            return raw.decode(encoding)
        except (LookupError, UnicodeDecodeError):
            continue
    return raw.decode('latin-1', 'replace')


def parse_quote(document, isin, today, *, content_type=None):
    if not re.fullmatch(r'[A-Z]{2}[A-Z0-9]{9}[0-9]', str(isin)):
        raise ValueError('Verified ETF ISIN required for reference quote.')
    # Hash exactly what the venue sent; a str caller is hashed as utf-8 bytes.
    if isinstance(document, (bytes, bytearray)):
        received = bytes(document)
        document = decode_document(received, content_type)
    else:
        received = document.encode('utf-8')
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
            'quote_document_sha256':hashlib.sha256(received).hexdigest()}


def fetch_reference_quote(isin, today):
    if not re.fullmatch(r'[A-Z]{2}[A-Z0-9]{9}[0-9]', str(isin)):
        raise ValueError('Verified ETF ISIN required for reference quote.')
    with httpx.stream('GET', BASE_URL+isin, timeout=5, follow_redirects=False) as response:
        response.raise_for_status()
        content_type = response.headers.get('content-type')
        body = bytearray()
        for chunk in response.iter_bytes():
            body.extend(chunk)
            if len(body) > 2_000_000:
                raise ValueError('Reference quote document exceeds size limit.')
    return parse_quote(bytes(body), isin, today, content_type=content_type)
