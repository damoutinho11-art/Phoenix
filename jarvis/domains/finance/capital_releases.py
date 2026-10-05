"""Owner-approved, statement-backed capital for a single budget month.

Approval is not income and does not prove that a purchase has happened.
Legacy statements discard transfer direction: the owner must explicitly confirm
that this exact transfer arrived in checking. Never infer direction from category.
Old approvals remain audit records; they never renew next month's allowance.
"""
from datetime import date
from decimal import Decimal


_FIELDS = {'date', 'merchant', 'description', 'amount_eur'}


def _identity(row: dict) -> tuple:
    return (row['date'], row['merchant'], row['description'], Decimal(str(row['amount_eur'])))


def validate_capital_releases(releases: object) -> None:
    if not isinstance(releases, list) or len(releases) > 120:
        raise ValueError('one_time_capital_releases must be a list of at most 120 approvals')
    seen = set()
    for release in releases:
        if not isinstance(release, dict) or set(release) != _FIELDS | {'owner_confirmed_incoming'}:
            raise ValueError('Capital approval requires transaction identity and owner_confirmed_incoming')
        if release['owner_confirmed_incoming'] is not True:
            raise ValueError('Owner must explicitly confirm this transfer arrived in checking')
        if not isinstance(release['description'], str):
            raise ValueError('Capital approval description must be text')
        for key in ('date', 'merchant'):
            if not isinstance(release[key], str) or not release[key].strip():
                raise ValueError('Capital approval identity must contain nonempty strings')
        if date.fromisoformat(release['date']).isoformat() != release['date']:
            raise ValueError('Capital approval date must be YYYY-MM-DD')
        amount = release['amount_eur']
        if type(amount) not in (int, float):
            raise ValueError('Capital approval amount must be an exact-cent number')
        money = Decimal(str(amount))
        if not money.is_finite() or not 0 < money <= 100_000 or money * 100 != (money * 100).to_integral_value():
            raise ValueError('Capital approval amount must be positive exact cents, at most 100000 EUR')
        identity = _identity(release)
        if identity in seen:
            raise ValueError('Duplicate capital approval')
        seen.add(identity)


def approved_capital_cents(releases: object, verified_rows: list[dict], today: date) -> int:
    validate_capital_releases(releases)
    total = 0
    for release in releases:
        if date.fromisoformat(release['date']) > today:
            raise ValueError('Capital approval transfer is in the future')
        if release['date'][:7] != today.strftime('%Y-%m'):
            continue
        matches = [row for row in verified_rows
                   if all(row.get(key) == release[key] for key in _FIELDS)]
        if len(matches) != 1:
            raise ValueError('Approved capital requires exactly one matching verified statement transfer')
        row = matches[0]
        if row.get('bank_direction') not in (None, 'incoming'):
            raise ValueError('Capital approval conflicts with bank transfer direction')
        if (row.get('effective_category', row.get('category')) != 'Transfers'
                or row.get('is_income') != 0
                or row.get('month') != today.strftime('%Y-%m')):
            raise ValueError('Approved capital must be a non-income transfer in the current budget month')
        total += int(Decimal(str(release['amount_eur'])) * 100)
    return total
