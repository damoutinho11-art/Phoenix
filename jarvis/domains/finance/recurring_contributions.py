"""Pure recurring purchase accounting; never creates cash or mutates a ledger."""
from datetime import date
from decimal import Decimal, ROUND_FLOOR
import re
from .investment_policy import validate_policy, policy_digest


def recurring_context(constitution, budget, as_of):
    policy = constitution.get('investment_policy')
    if not policy or policy.get('version') != 'core-satellite-v2':
        return None
    policy = validate_policy(policy)
    history = constitution.get('contribution_history')
    if not isinstance(history, dict) or history.get('version') != 'recorded-purchases-v1':
        raise ValueError('Verified recorded purchase history is required for recurring contributions.')
    if (history.get('as_of') != as_of.isoformat()
        or history.get('policy_sha256') != policy_digest(policy)
        or date.fromisoformat(policy['effective_from']) > as_of
        or not re.fullmatch('[0-9a-f]{64}', str(history.get('records_sha256', '')))):
        raise ValueError('Recurring purchase history is stale or does not match the policy.')
    total, crypto = (history.get(k) for k in ('total_purchase_outlay_cents', 'crypto_purchase_outlay_cents'))
    if any(type(v) is not int or v < 0 for v in (total, crypto)) or crypto > total:
        raise ValueError('Recurring purchase counters are invalid.')
    share = Decimal(str(policy['crypto_contribution_weight']))
    due = max(0, int((share * (total + budget)).to_integral_value(rounding=ROUND_FLOOR)) - crypto)
    return {**history, 'crypto_contribution_weight': float(share), 'due_cents': due,
            'basis': 'Actual applied nonvoid purchase outlays since policy activation, including fees. Missed recommendations create no credit or cash.'}
