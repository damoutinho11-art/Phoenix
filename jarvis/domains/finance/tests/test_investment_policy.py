from copy import deepcopy
import pytest
from jarvis.domains.finance.investment_policy import validate_policy, apply_policy, policy_digest
from jarvis.domains.finance.tests.test_buy_selection import inputs

@pytest.mark.parametrize('cap',[0,-.1,.5,1,True,float('nan'),float('inf'),'0.2'])
def test_invalid_owner_ceiling_rejected(cap):
    with pytest.raises(ValueError):validate_policy({'version':'core-satellite-v1','crypto_max_weight':cap})

def test_policy_conserves_total_and_does_not_mutate_source():
    c,_,_=inputs(); before=deepcopy(c)
    c['investment_policy']={'version':'core-satellite-v1','crypto_max_weight':.1}
    result=apply_policy(c)
    assert sum(result['target_weights'].values())==pytest.approx(1)
    assert sum(result['target_weights'][a] for a in ('btc','eth','sol','hype','tao'))<=.1+1e-12
    assert result['target_weights']['hype']==0
    assert result['target_weights']['tao']==0
    assert result['target_weights']['tactical_reserve']==before['target_weights']['tactical_reserve']
    assert c['target_weights']==before['target_weights']
    assert result['investment_policy_context']['automatic_selling'] is False

def test_absent_policy_preserves_existing_behavior_and_digest_changes_with_cap():
    c,_,_=inputs()
    assert apply_policy(c) is c
    assert policy_digest({'version':'core-satellite-v1','crypto_max_weight':.1})!=policy_digest({'version':'core-satellite-v1','crypto_max_weight':.2})


def test_other_crypto_holdings_count_toward_combined_ceiling_without_selling():
    from jarvis.domains.finance.contribution_selection import select_contributions
    from jarvis.domains.finance.tests.test_buy_selection import candidate, TODAY
    c, p, h = inputs()
    c['investment_policy'] = {'version':'core-satellite-v1', 'crypto_max_weight':.1}
    h['hype'] = 30000
    original = deepcopy(h)
    result = select_contributions([candidate('btc','BTC-EUR',lane='crypto'), candidate()],
                                  apply_policy(c), p, h, 10000, TODAY, horizon_years=20)
    assert result['lanes']['crypto']['status'] == 'WAIT'
    assert h == original
    assert all(amount >= 0 for amount in result['allocations_cents'].values())
    assert sum(result['allocations_cents'].values()) == 10000


def test_policy_bands_remain_ordered_below_old_minimum():
    c, _, _ = inputs()
    c['sleeve_bands']['btc'] = {'min_weight':.15,'max_weight':.25}
    c['investment_policy'] = {'version':'core-satellite-v1','crypto_max_weight':.05}
    band = apply_policy(c)['sleeve_bands']['btc']
    assert 0 <= band['min_weight'] <= band['max_weight'] <= .05


@pytest.mark.parametrize('regime',['risk_on','neutral','risk_off'])
def test_dynamic_engine_keeps_owner_ceiling_and_excludes_emergency_money(regime):
    from jarvis.domains.finance import engine
    from jarvis.domains.finance.tests.test_evidence_allocation import state
    from jarvis.domains.finance.tests.test_buy_selection import TODAY
    c = engine.load_json(engine.DEFAULT_CONSTITUTION_PATH)
    c['investment_policy'] = {'version':'core-satellite-v1','crypto_max_weight':.05}
    _, p = state()
    p['emergency_fund']['amount'] = 100000
    original = deepcopy(p)
    result = engine.allocate_weekly_budget(c,p,regime=regime,
        profile={'personal':{'age':30},'risk_profile':{'time_horizon_years':20}},
        selection_evidence={'policy_version':'contribution-v2','candidates':[]},as_of=TODAY)
    context = result['dynamic_context']
    assert sum(context['asset_targets_pct'].get(a,0) for a in ('btc','eth','sol','hype','tao')) <= 5.01
    assert result['buy_selection']['investment_policy']['crypto_max_weight'] == .05
    assert result['investable_after_cents'] == 110000
    assert p == original


@pytest.mark.parametrize('cap',[.01,.1,.3,.49])
@pytest.mark.parametrize('phase',[1,2,3])
@pytest.mark.parametrize('regime',['risk_on','neutral','risk_off'])
def test_adjusted_targets_fit_existing_etf_bands(cap,phase,regime):
    from jarvis.domains.finance import engine
    c=engine.expand_evidence_constitution(engine.load_json(engine.DEFAULT_CONSTITUTION_PATH))
    sleeves=engine.get_dynamic_targets(c,{},regime,26,phase)
    c['target_weights']=engine.compute_asset_target_weights(sleeves,c,phase)
    c['investment_policy']={'version':'core-satellite-v1','crypto_max_weight':cap}
    adjusted=apply_policy(c)
    for asset in ('global_core_etf','growth_nasdaq_etf','quality_etf'):
        assert adjusted['target_weights'][asset] <= adjusted['sleeve_bands'][asset]['max_weight'] + 1e-10
    assert sum(adjusted['target_weights'].values()) == pytest.approx(1)
