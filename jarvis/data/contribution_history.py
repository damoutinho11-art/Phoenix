"""Read-only, policy-bound accounting of completed purchase outlays."""
from datetime import date, datetime
from decimal import Decimal, InvalidOperation
import hashlib
import json
from jarvis.data import database
from jarvis.domains.finance.investment_policy import validate_policy, policy_digest, CRYPTO


def load_contribution_history(policy, today):
    policy = validate_policy(policy)
    start = date.fromisoformat(policy['effective_from'])
    if start > today:
        raise ValueError('Future policy activation.')
    connection = database.get_db()
    try:
        rows = connection.execute("SELECT id,executed_at,asset,amount_eur,fee_eur,currency FROM finance_transaction_ledger WHERE portfolio_state_updated=1 AND (voided IS NULL OR voided=0) AND lower(trim(side))='buy' ORDER BY id").fetchall()
    finally:
        connection.close()
    known_assets = set(CRYPTO) | {'global_core_etf','growth_nasdaq_etf','quality_etf',
        'lhv_growth_sxr8','lhv_growth_iemm','lhv_growth_xcha',
        'lhv_growth_world_equities','lhv_growth_euro_bond'}
    records = []
    total = crypto = 0
    for row in rows:
        value = row['executed_at']
        if not isinstance(value, str):
            raise ValueError('Invalid recorded purchase date.')
        executed = date.fromisoformat(value) if len(value) == 10 else datetime.fromisoformat(value).date()
        if value[:10] != executed.isoformat() or executed > today:
            raise ValueError('Invalid recorded purchase date.')
        if executed < start:
            continue
        if row['currency'] != 'EUR' or row['asset'] not in known_assets:
            raise ValueError('Recorded purchase identity or currency is invalid.')
        outlay = 0
        for key in ('amount_eur', 'fee_eur'):
            try:
                amount = Decimal(str(row[key])) * 100
                if not amount.is_finite() or amount < 0 or amount != amount.to_integral_value():
                    raise ValueError('Recorded purchase amounts must be nonnegative EUR cents.')
                outlay += int(amount)
            except InvalidOperation as exc:
                raise ValueError('Invalid recorded purchase amount.') from exc
        total += outlay
        if row['asset'] in CRYPTO:
            crypto += outlay
        records.append([row['id'], value, row['asset'], outlay])
    return {'version':'recorded-purchases-v1', 'policy_sha256':policy_digest(policy),
            'as_of':today.isoformat(), 'total_purchase_outlay_cents':total,
            'crypto_purchase_outlay_cents':crypto,
            'records_sha256':hashlib.sha256(json.dumps(records,separators=(',',':')).encode()).hexdigest()}
