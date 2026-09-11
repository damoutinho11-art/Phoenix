from copy import deepcopy
from datetime import date
import pytest
from jarvis.api.routers import finance

TODAY=date(2026,9,11)


def reviewed_memo():
    review={'version':'crypto-investment-review-v1','asset':'btc','reviewed_at':'2026-09-11',
        'valid_until':'2026-09-18','reviewer_type':'assistant_research','reviewer':'Owner-requested research',
        'strategy':'long_term_spot_contribution','verdict':'BUY_CANDIDATE',
        'thesis':'A strategic contribution case, not a forecast or price target.',
        'risks':['Deep drawdowns and permanent loss are possible.','Custodian access may fail.'],
        'alternatives':[{'asset':'cash','reason':'Protects near-term spending.'},{'asset':'eth','reason':'Different protocol exposure.'}],
        'invalidation_conditions':['Cash authority becomes unverified.','Protocol or custody risk changes.'],
        'sources':[{'role':role,'url':url,'checked_at':'2026-09-11','evidence_sha256':str(i)*64,
                    'claim':'Synthetic independently reviewed source claim.'}
            for i,(role,url) in enumerate([('protocol','https://bitcoin.org/en/faq'),
                ('broker_cost','https://www.lhv.ee/en/crypto/'),('market_risk','https://finance.yahoo.com/quote/BTC-EUR/')],1)]}
    return {'asset':'btc','verdict':'BUY_CANDIDATE','validation':{'investment_review':review}}


def records(memo):
    from jarvis.domains.finance.investment_review import review_digest
    digest=review_digest(memo['validation']['investment_review'])
    return [{'status':'PASS','confidence':'medium','check_type':kind,'field_name':field,
             'raw_json':{'external_review_sha256':digest},'source_primary':'Synthetic external review'}
        for kind,field in [('SOURCE_CONFIDENCE','external_source_review'),('MANUAL_REVIEW','investment_thesis_review')]]


def test_bound_review_survives_synthesis_without_becoming_automatic_approval(monkeypatch):
    monkeypatch.setattr(finance.clock,'today',lambda:TODAY)
    memo=reviewed_memo()
    result,fields=finance._synthesize_memo_from_evidence(memo,records(memo))
    assert fields['verdict']=='BUY_CANDIDATE'
    assert fields['thesis']==memo['validation']['investment_review']['thesis']
    assert result['investment_approval'] is False
    assert result['buy_candidate_auto_assigned'] is False
    assert 'local PHOENIX data only' not in result['source_limitation']


@pytest.mark.parametrize('change',['expired','future','too_long','asset','role','cash','risk','hash','binding','failed','url'])
def test_invalid_review_never_produces_buy(change,monkeypatch):
    monkeypatch.setattr(finance.clock,'today',lambda:TODAY)
    memo=reviewed_memo(); review=memo['validation']['investment_review']; checks=records(memo)
    if change=='expired': review.update(reviewed_at='2026-09-01',valid_until='2026-09-08')
    if change=='future': review.update(reviewed_at='2026-09-12',valid_until='2026-09-18')
    if change=='too_long': review['valid_until']='2027-09-11'
    if change=='asset': review['asset']='eth'
    if change=='role': review['sources'][0]['role']='market_risk'
    if change=='cash': review['alternatives']=review['alternatives'][1:]
    if change=='risk': review['risks']=[]
    if change=='hash': review['sources'][0]['evidence_sha256']=''
    checks=records(memo)
    if change=='binding': checks[0]['raw_json']['external_review_sha256']='bad'
    if change=='failed': checks[0]['status']='FAIL'
    if change=='url': review['sources'][0]['url']='http://localhost'
    result,fields=finance._synthesize_memo_from_evidence(memo,checks)
    assert fields['verdict']!='BUY_CANDIDATE'


def test_external_price_check_is_not_mislabelled_local_or_an_investment_thesis(monkeypatch):
    monkeypatch.setattr(finance.clock,'today',lambda:TODAY)
    checks=[{'status':'PASS','confidence':'high','raw_json':{'adapter':'crypto_price_adapter_v1','fetch_status':'success'}},
            {'status':'PASS','confidence':'high'}]
    result,fields=finance._synthesize_memo_from_evidence({'asset':'btc'},checks)
    assert fields['verdict']=='WATCH'
    assert 'external market' in result['source_limitation'].lower()
    assert 'No external market research' not in fields['thesis']


def test_selection_uses_bound_review_date_not_quality_gate_refresh(monkeypatch):
    from jarvis.api import buy_recommendation as bridge
    memo=reviewed_memo();memo.update(id=1,research_quality_checked_at='2026-09-11')
    monkeypatch.setattr(bridge,'fetch_evidence',lambda c,d:{'candidates':[{'asset':'btc','lane':'crypto','symbol':'BTC-EUR'}]})
    monkeypatch.setattr(bridge.database,'find_active_research_memo_for_leg',lambda *args:memo)
    monkeypatch.setattr(bridge.database,'get_research_memo_evidence_summary',lambda *args:{'evidence_status':'EVIDENCE_STRONG'})
    checks=records(memo)
    monkeypatch.setattr(bridge.database,'list_research_validation_records_by_memo_id',lambda *args:checks)
    row=bridge.load_selection_evidence({},TODAY)['candidates'][0]
    assert row['research_verdict']=='BUY_CANDIDATE'
    assert row['research_as_of']=='2026-09-11'
    proof=row['research_review_proof']
    assert proof['memo_id']==1
    assert proof['review']['valid_until']=='2026-09-18'
    assert len(proof['bound_checks'])==2
    memo['validation']['investment_review']['valid_until']='2026-09-10'
    assert proof['review']['valid_until']=='2026-09-18'
    row=bridge.load_selection_evidence({},TODAY)['candidates'][0]
    assert row['research_verdict']!='BUY_CANDIDATE'


def test_selection_does_not_override_rejected_memo(monkeypatch):
    from jarvis.api import buy_recommendation as bridge
    memo=reviewed_memo(); checks=records(memo); memo.update(id=1,verdict='REJECT')
    monkeypatch.setattr(bridge,'fetch_evidence',lambda c,d:{'candidates':[{'asset':'btc','lane':'crypto'}]})
    monkeypatch.setattr(bridge.database,'find_active_research_memo_for_leg',lambda *args:memo)
    monkeypatch.setattr(bridge.database,'get_research_memo_evidence_summary',lambda *args:{'evidence_status':'EVIDENCE_STRONG'})
    monkeypatch.setattr(bridge.database,'list_research_validation_records_by_memo_id',lambda *args:checks)
    assert bridge.load_selection_evidence({},TODAY)['candidates'][0]['research_verdict']=='REJECT'
    monkeypatch.setattr(finance.clock,'today',lambda:TODAY)
    assert finance._synthesize_memo_from_evidence(memo, checks)[1]['verdict']=='REJECT'
