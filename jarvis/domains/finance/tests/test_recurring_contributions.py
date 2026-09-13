from copy import deepcopy
import pytest
from jarvis.domains.finance.investment_policy import apply_policy, policy_digest
from jarvis.domains.finance.tests.test_buy_selection import inputs, candidate, TODAY
from jarvis.domains.finance.contribution_selection import select_contributions


def setup(total=0,crypto=0):
    c,p,h=inputs()
    c['investment_policy']={'version':'core-satellite-v2','crypto_max_weight':.15,
        'crypto_contribution_weight':.1,'effective_from':TODAY.isoformat()}
    c['contribution_history']={'version':'recorded-purchases-v1','policy_sha256':policy_digest(c['investment_policy']),
        'as_of':TODAY.isoformat(),'total_purchase_outlay_cents':total,
        'crypto_purchase_outlay_cents':crypto,'records_sha256':'a'*64}
    return apply_policy(c),p,h


def choose(c,p,h,budget=16152):
    return select_contributions([candidate(),candidate('btc','BTC-EUR',lane='crypto')],
        c,p,h,budget,TODAY,horizon_years=20)


def test_repeated_recommendations_do_not_create_purchase_credit():
    c,p,h=setup();before=deepcopy(c)
    first=choose(c,p,h);second=choose(c,p,h)
    assert first==second
    assert first['lanes']['crypto']['status']=='WAIT'
    assert c==before


def test_actual_etf_purchase_allows_later_btc_batch_above_minimum():
    c,p,h=setup(total=16152)
    result=choose(c,p,h)
    assert result['lanes']['crypto']['status']=='BUY'
    assert result['lanes']['crypto']['amount_eur']==32.30
    assert sum(result['allocations_cents'].values())==16152
    assert result['policy_version']=='contribution-v3'


def test_previous_crypto_outlay_reduces_amount_due():
    c,p,h=setup(total=32304,crypto=3230)
    result=choose(c,p,h)
    assert result['lanes']['crypto']['status']=='WAIT'
    assert not any(r['asset']=='btc' for r in result['decision_comparison']['standalone_candidates'])


def test_concentration_ceiling_still_blocks_scheduled_buy():
    c,p,h=setup(total=100000)
    h['btc']=40000
    result=choose(c,p,h)
    assert result['lanes']['crypto']['status']=='WAIT'
    assert not any(r['asset']=='btc' for r in result['decision_comparison']['standalone_candidates'])


def test_missing_or_stale_history_cannot_default_to_zero():
    c,p,h=setup()
    del c['contribution_history']
    with pytest.raises(ValueError):choose(c,p,h)
    c,p,h=setup();c['contribution_history']['as_of']='2026-01-01'
    with pytest.raises(ValueError):choose(c,p,h)


def test_recurring_selection_resolves_instrument_and_binds_history():
    from jarvis.api.buy_recommendation import selected_instrument, decision_signature, selection_rationale
    c,p,h=setup(16152)
    selection=choose(c,p,h)
    assert selected_instrument(selection,'btc')['ticker']=='BTC-EUR'
    assert 'Recurring BTC purchase share' in selection_rationale(selection)
    response={'week_budget':161.52,'buy_selection':selection}
    changed=deepcopy(response)
    changed['buy_selection']['recurring_contribution']['records_sha256']='b'*64
    assert decision_signature(response)!=decision_signature(changed)


def test_crypto_minimum_is_met_after_fees():
    c,p,h=setup(3848)
    result=choose(c,p,h)
    assert result['lanes']['crypto']['status']=='WAIT'
    assert not any(r['asset']=='btc' for r in result['decision_comparison']['standalone_candidates'])
    c,p,h=setup(4048)
    decision=choose(c,p,h)['lanes']['crypto']
    assert decision['status']=='BUY'
    assert decision['principal_eur']>=20
