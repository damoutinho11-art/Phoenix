from datetime import date

import pytest

from jarvis.domains.finance.capital_releases import approved_capital_cents, validate_capital_releases


RELEASE = {'date': '2026-10-04', 'merchant': 'Owner',
           'description': 'Emergency fund - withdrawal', 'amount_eur': 1255.46,
           'owner_confirmed_incoming': True}
ROW = {**RELEASE, 'category': 'Transfers', 'is_income': 0, 'month': '2026-10'}


def test_exact_verified_transfer_is_resolved_once_after_reimport():
    for import_id in ('old', 'new'):
        assert approved_capital_cents([RELEASE], [{**ROW, 'statement_import_id': import_id}], date(2026, 10, 4)) == 125546


@pytest.mark.parametrize('rows', [[], [ROW, ROW], [{**ROW, 'category': 'Income'}],
    [{**ROW, 'is_income': 1}], [{**ROW, 'amount_eur': 1255.45}],
    [{**ROW, 'effective_category': 'Income'}]])
def test_missing_or_ambiguous_or_nontransfer_evidence_is_rejected(rows):
    with pytest.raises(ValueError):
        approved_capital_cents([RELEASE], rows, date(2026, 10, 4))


def test_no_automatic_allowance_in_another_month():
    assert approved_capital_cents([RELEASE], [], date(2026, 11, 1)) == 0


@pytest.mark.parametrize('releases', [[RELEASE, RELEASE], [{**RELEASE, 'amount_eur': True}],
    [{**RELEASE, 'amount_eur': 1.001}], [{**RELEASE, 'amount_eur': -1}],
    [{**RELEASE, 'date': 'bad'}], [{**RELEASE, 'extra': 1}], None])
def test_invalid_approvals_rejected(releases):
    with pytest.raises(ValueError):
        validate_capital_releases(releases)


def test_future_transfer_cannot_be_used():
    with pytest.raises(ValueError):
        approved_capital_cents([RELEASE], [ROW], date(2026, 10, 3))


def test_future_month_cannot_be_preapproved_without_evidence():
    with pytest.raises(ValueError):
        approved_capital_cents([{**RELEASE, 'date': '2026-11-04'}], [], date(2026, 10, 4))


@pytest.mark.parametrize('confirmation', [False, None, 1, 'true'])
def test_owner_must_explicitly_confirm_incoming_direction(confirmation):
    with pytest.raises(ValueError):
        approved_capital_cents([{**RELEASE, 'owner_confirmed_incoming': confirmation}], [ROW], date(2026, 10, 4))


def test_known_outgoing_transfer_cannot_be_overridden_by_confirmation():
    with pytest.raises(ValueError):
        approved_capital_cents([RELEASE], [{**ROW, 'bank_direction': 'outgoing'}], date(2026, 10, 4))
