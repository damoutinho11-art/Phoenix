"""Owner-reviewed debit image supplements; never forged PDF parse receipts."""
from datetime import date
from decimal import Decimal
from hashlib import sha256
import json

from jarvis.data import database

SPENDING = {'Housing','Food & Groceries','Eating Out','Transport','Subscriptions',
            'Health & Sport','Shopping','Banking & Fees','Other'}
SCHEMA = '''CREATE TABLE IF NOT EXISTS budget_image_supplements (
 id INTEGER PRIMARY KEY AUTOINCREMENT, base_import_id TEXT NOT NULL,
 image_sha256 TEXT NOT NULL UNIQUE, payload_sha256 TEXT NOT NULL,
 payload_json TEXT NOT NULL, image_bytes BLOB NOT NULL, created_at TEXT NOT NULL)'''


def _cents(value):
    if type(value) is not int or abs(value)>10_000_000_000:
        raise ValueError('Balances and amounts must use bounded integer cents.')
    return value


def _day(value):
    if not isinstance(value,str) or date.fromisoformat(value).isoformat()!=value:
        raise ValueError('Canonical ISO dates are required.')
    return date.fromisoformat(value)


def validate_supplement(payload, base, today):
    if not isinstance(payload,dict) or payload.get('reviewed') is not True:
        raise ValueError('Explicit owner-authorized image review is required.')
    if payload.get('base_import_id') != base['statement_import_id']:
        raise ValueError('The base statement changed; reconcile again.')
    start,end = _day(base['statement_end_date']),_day(payload['statement_end_date'])
    if not start < end <= today:
        raise ValueError('Supplement must extend the existing statement without future dates.')
    balance = _cents(payload['opening_balance_cents'])
    if Decimal(balance) != Decimal(str(base['closing_balance_eur']))*100:
        raise ValueError('Opening balance does not match the preceding statement.')
    rows = payload.get('transactions')
    if not isinstance(rows,list) or not 1<=len(rows)<=200:
        raise ValueError('Supply between 1 and 200 reviewed debit rows.')
    normalized,seen,previous = [],set(),start
    for row in rows:
        day = _day(row['date'])
        if not start < day <= end or day < previous:
            raise ValueError('Rows must be ordered and strictly after the preceding statement date.')
        previous=day
        amount = _cents(row['amount_cents'])
        if not 0 < amount <= 10_000_000 or row.get('category') not in SPENDING:
            raise ValueError('Only positive, bounded debit spending rows are supported.')
        merchant,description=row.get('merchant'),row.get('description','')
        if not isinstance(merchant,str) or not merchant.strip() or len(merchant)>200 or not isinstance(description,str) or len(description)>1000:
            raise ValueError('A bounded merchant and description are required.')
        key=(row['date'],merchant.strip(),amount)
        if key in seen:
            raise ValueError('Ambiguous duplicate transaction identity; distinguish actual card descriptions.')
        seen.add(key)
        balance-=amount
        if balance != _cents(row['balance_after_cents']):
            raise ValueError('A transaction running balance does not reconcile.')
        normalized.append({'date':row['date'],'merchant':merchant.strip(),'description':description,
            'amount_eur':amount/100,'category':row['category'],'effective_category':row['category'],
            'month':day.strftime('%Y-%m'),'source':'owner_reviewed_image','is_income':0})
    if balance != _cents(payload['closing_balance_cents']) or previous != end:
        raise ValueError('Closing balance/date does not match the final reviewed row.')
    return normalized


def _stored(connection, base_id):
    if not connection.execute("SELECT 1 FROM sqlite_master WHERE type='table' AND name='budget_image_supplements'").fetchone():
        return []
    return connection.execute('SELECT * FROM budget_image_supplements WHERE base_import_id=? ORDER BY id',(base_id,)).fetchall()


def _project(base, records, today):
    snapshot,rows,provenance=dict(base),[],[]
    for record in records:
        if sha256(record['image_bytes']).hexdigest()!=record['image_sha256'] or sha256(record['payload_json'].encode()).hexdigest()!=record['payload_sha256']:
            raise ValueError('Stored image supplement integrity check failed.')
        payload=json.loads(record['payload_json'])
        rows.extend(validate_supplement(payload,snapshot,today))
        snapshot.update(statement_end_date=payload['statement_end_date'],closing_balance_eur=payload['closing_balance_cents']/100)
        provenance.append({'id':record['id'],'image_sha256':record['image_sha256'],
                           'payload_sha256':record['payload_sha256'],'review_type':'owner_authorized_image_review'})
    if provenance:
        snapshot.update(parser='lhv_pdf_with_reviewed_image',base_statement_end_date=base['statement_end_date'],
            base_closing_balance_eur=base['closing_balance_eur'],image_supplements=provenance,
            image_supplement_rows=len(rows),statement_rows=base.get('statement_rows',0)+len(rows),
            base_pdf_receipt={key:base.get(key) for key in ('statement_import_id','statement_end_date',
                'closing_balance_eur','opening_balance_eur','parsed_rows','statement_rows','filename_hash')})
    return snapshot,rows


def _check_superseded(connection,base):
    """A partial or same-date PDF reimport must not hide newer reviewed debits."""
    if not connection.execute("SELECT 1 FROM sqlite_master WHERE name='budget_image_supplements'").fetchone():
        return
    records=connection.execute('SELECT * FROM budget_image_supplements WHERE base_import_id!=?',(base['statement_import_id'],)).fetchall()
    for record in records:
        if sha256(record['payload_json'].encode()).hexdigest()!=record['payload_sha256']:
            raise ValueError('Previous supplement integrity cannot be verified.')
        payload=json.loads(record['payload_json'])
        end=_day(payload['statement_end_date'])
        base_end=_day(base['statement_end_date'])
        if end>base_end or (end==base_end and Decimal(payload['closing_balance_cents'])!=Decimal(str(base['closing_balance_eur']))*100):
            raise ValueError('A newer or conflicting reviewed balance exists under a previous PDF; reconcile the overlap.')


def project_supplements(base,today):
    connection=database.get_db()
    try:
        _check_superseded(connection,base)
        return _project(base,_stored(connection,base['statement_import_id']),today)
    finally:
        connection.close()


def save_reviewed_supplement(payload,image,today):
    if not isinstance(image,bytes) or not 10<=len(image)<=8*1024*1024 or not (image.startswith(b'\xff\xd8\xff') or image.startswith(b'\x89PNG\r\n\x1a\n')):
        raise ValueError('A JPEG or PNG image of at most 8 MB is required.')
    image_hash=sha256(image).hexdigest()
    encoded=json.dumps(payload,sort_keys=True,separators=(',',':'),allow_nan=False)
    payload_hash=sha256(encoded.encode()).hexdigest()
    connection=database.get_db()
    try:
        connection.execute(SCHEMA)
        connection.execute('BEGIN IMMEDIATE')
        existing=connection.execute('SELECT * FROM budget_image_supplements WHERE image_sha256=?',(image_hash,)).fetchone()
        if existing:
            if existing['payload_sha256'] != payload_hash:
                raise ValueError('This image was already imported with different reviewed rows.')
            return {'id':existing['id'],'saved':0,'already_imported':True,'image_sha256':image_hash}
        base=connection.execute("SELECT * FROM budget_statement_snapshots WHERE receipt_verified=1 AND parser='lhv_pdf' AND quality_status='reconciled' AND balance_difference_eur=0 ORDER BY statement_end_date DESC, imported_at DESC, id DESC LIMIT 1").fetchone()
        if not base or base['parser']!='lhv_pdf':
            raise ValueError('A receipt-verified base PDF statement is required.')
        _check_superseded(connection,dict(base))
        projected,_=_project(dict(base),_stored(connection,base['statement_import_id']),today)
        rows=validate_supplement(payload,projected,today)
        for row in rows:
            if connection.execute('SELECT 1 FROM budget_transactions WHERE date=? AND merchant=? AND amount_eur=?',
                (row['date'],row['merchant'],row['amount_eur'])).fetchone():
                raise ValueError('A reviewed row already exists; reconcile overlap before importing.')
        cursor=connection.execute('INSERT INTO budget_image_supplements (base_import_id,image_sha256,payload_sha256,payload_json,image_bytes,created_at) VALUES (?,?,?,?,?,?)',
            (base['statement_import_id'],image_hash,payload_hash,encoded,image,database._utc_now()))
        database._save_budget_transactions_with_connection(rows,connection,strict=True)
        connection.commit()
        return {'id':cursor.lastrowid,'saved':len(rows),'already_imported':False,'image_sha256':image_hash,
                'closing_balance_eur':payload['closing_balance_cents']/100,'source':'owner_reviewed_image'}
    except Exception:
        connection.rollback()
        raise
    finally:
        connection.close()


def supplement_summary(summary,rows,month):
    """Add reviewed debits to the original receipt's effective category summary."""
    if not rows:
        return summary
    from copy import deepcopy
    result=deepcopy(summary)
    for row in rows:
        if row['month']!=month:
            continue
        group=result['by_category'].setdefault(row['category'],{'total':0,'count':0})
        group['total']=round(group['total']+row['amount_eur'],2)
        group['count']=group.get('count',0)+1
        result['expenses_total']=round(result['expenses_total']+row['amount_eur'],2)
    if result.get('income_total',0)>0:
        result['cashflow_rate']=round((result['income_total']-result['expenses_total'])/result['income_total']*100,1)
    return result
