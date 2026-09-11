from copy import deepcopy
from datetime import date
import pytest
from jarvis.data import database
from jarvis.api.routers import budget

TODAY = date(2026,9,11)
BASE = {'statement_import_id':'base','statement_end_date':'2026-09-07','closing_balance_eur':100.0}


def payload():
    return {'base_import_id':'base','opening_balance_cents':10000,'closing_balance_cents':9500,
        'statement_end_date':'2026-09-11','reviewed':True,'transactions':[
            {'date':'2026-09-09','merchant':'Food shop','amount_cents':300,'balance_after_cents':9700,
             'category':'Food & Groceries','description':'reviewed debit 1'},
            {'date':'2026-09-11','merchant':'Cafe','amount_cents':200,'balance_after_cents':9500,
             'category':'Eating Out','description':'reviewed debit 2'}]}


def test_debit_chain_preserves_rows_and_reconciles_every_balance():
    from jarvis.data.budget_supplements import validate_supplement
    rows = validate_supplement(payload(),BASE,TODAY)
    assert len(rows) == 2
    assert rows[0]['amount_eur'] == 3
    assert rows[1]['source'] == 'owner_reviewed_image'
    assert rows[1]['month'] == '2026-09'


@pytest.mark.parametrize('change',['anchor','opening','closing','running','future','old_row','income','boolean','review','duplicate'])
def test_bad_or_ambiguous_supplement_is_rejected(change):
    from jarvis.data.budget_supplements import validate_supplement
    p=payload()
    if change=='anchor': p['base_import_id']='other'
    if change=='opening': p['opening_balance_cents']=9999
    if change=='closing': p['closing_balance_cents']=9499
    if change=='running': p['transactions'][0]['balance_after_cents']=9600
    if change=='future': p['statement_end_date']='2026-09-12'
    if change=='old_row': p['transactions'][0]['date']='2026-09-07'
    if change=='income': p['transactions'][0]['category']='Income'
    if change=='boolean': p['transactions'][0]['amount_cents']=True
    if change=='review': p['reviewed']=False
    if change=='duplicate': p['transactions'][1]=deepcopy(p['transactions'][0])
    with pytest.raises(ValueError): validate_supplement(p,BASE,TODAY)


def test_new_gym_effective_date_does_not_reuse_previous_membership_payment():
    policy={'recurring_obligations':[{'name':'Gym','amount_eur':49,'contains':['gym'],
        'enabled':True,'effective_from':'2026-09-11'}]}
    old={'date':'2026-09-02','merchant':'gymeesti.ee','description':'Previous gym','amount_eur':19}
    assert budget._unpaid_recurring_bills(policy,[old]) == 49
    new={**old,'date':'2026-09-12','amount_eur':49}
    assert budget._unpaid_recurring_bills(policy,[old,new]) == 0
    policy['recurring_obligations'][0]['effective_from']='bad date'
    assert budget._unpaid_recurring_bills(policy,[old]) is None


@pytest.fixture
def db_base(monkeypatch,tmp_path):
    monkeypatch.setattr(database,'DB_PATH',tmp_path/'supplements.db')
    database.init_db()
    rows=[{'date':'2026-09-07','merchant':'Previous food','amount_eur':20,'category':'Food & Groceries',
           'source':'pdf','month':'2026-09','is_income':0}]
    snapshot={**BASE,'opening_balance_eur':120,'parser':'lhv_pdf','quality_status':'reconciled',
              'statement_rows':1,'parsed_rows':1,'balance_difference_eur':0,'filename_hash':'a'*64}
    receipt=database._create_budget_statement_parse_receipt(rows,snapshot)
    database._save_budget_statement_receipt_import(rows,receipt['receipt_id'])
    return database.get_latest_reconciled_budget_statement()


IMAGE=b'\x89PNG\r\n\x1a\nsynthetic-image-bytes'


def test_atomic_import_idempotency_and_authority_projection(db_base,monkeypatch):
    from jarvis.data.budget_supplements import save_reviewed_supplement,project_supplements
    p=payload(); p['base_import_id']=db_base['statement_import_id']
    saved=save_reviewed_supplement(p,IMAGE,TODAY)
    assert saved['saved']==2
    again=save_reviewed_supplement(p,IMAGE,TODAY)
    assert again['already_imported'] and again['saved']==0
    assert len(database.get_budget_transactions('2026-09'))==3
    assert len(database.get_budget_statement_import_transactions(db_base['statement_import_id']))==1
    snapshot,rows=project_supplements(db_base,TODAY)
    assert snapshot['parser']=='lhv_pdf_with_reviewed_image'
    assert snapshot['closing_balance_eur']==95
    assert snapshot['base_closing_balance_eur']==100
    assert len(rows)==2
    authority=budget._build_cashflow_authority('2026-09',today=TODAY)
    assert authority['source']['statement_end_date']=='2026-09-11'
    assert authority['source']['closing_balance_eur']==95
    assert authority['protected_cash']['food_eur']==177
    bad=deepcopy(p); bad['transactions'][0]['description']='changed'
    with pytest.raises(ValueError): save_reviewed_supplement(bad,IMAGE,TODAY)


def test_invalid_chain_rolls_back_and_stored_corruption_is_detected(db_base):
    from jarvis.data.budget_supplements import save_reviewed_supplement,project_supplements
    p=payload(); p['base_import_id']=db_base['statement_import_id']
    p['closing_balance_cents']=9000
    with pytest.raises(ValueError): save_reviewed_supplement(p,IMAGE,TODAY)
    assert len(database.get_budget_transactions('2026-09'))==1
    p['closing_balance_cents']=9500
    save_reviewed_supplement(p,IMAGE,TODAY)
    connection=database.get_db()
    connection.execute("UPDATE budget_image_supplements SET image_bytes=?",(b'corrupted',))
    connection.commit(); connection.close()
    with pytest.raises(ValueError): project_supplements(db_base,TODAY)
    assert budget._build_cashflow_authority('2026-09',today=TODAY)['data_ready'] is False


def test_existing_generic_row_prevents_partial_import(db_base):
    from jarvis.data.budget_supplements import save_reviewed_supplement
    p=payload(); p['base_import_id']=db_base['statement_import_id']
    database.save_budget_transactions([{'date':'2026-09-11','merchant':'Cafe','amount_eur':2,
        'category':'Other','source':'manual','month':'2026-09','is_income':0}])
    with pytest.raises(ValueError): save_reviewed_supplement(p,IMAGE,TODAY)
    assert len(database.get_budget_transactions('2026-09'))==2


@pytest.mark.parametrize('end,balance,blocked', [('2026-09-07',100,True),('2026-09-09',97,True),
    ('2026-09-11',99,True),('2026-09-11',95,False),('2026-09-12',90,False)])
def test_reimport_only_supersedes_covered_consistent_supplement(db_base,end,balance,blocked):
    from jarvis.data.budget_supplements import save_reviewed_supplement,project_supplements
    p=payload(); p['base_import_id']=db_base['statement_import_id']
    save_reviewed_supplement(p,IMAGE,TODAY)
    other={**db_base,'statement_import_id':'different-base','statement_end_date':end,'closing_balance_eur':balance}
    if blocked:
        with pytest.raises(ValueError): project_supplements(other,date(2026,9,12))
    else:
        assert project_supplements(other,date(2026,9,12))[1]==[]


def test_upload_route_requires_owner_and_rejects_bad_image(db_base,monkeypatch):
    import hashlib,base64
    from fastapi import FastAPI
    from fastapi.testclient import TestClient
    from jarvis.api.access_control import AccessControlMiddleware
    key='synthetic-owner-key-for-supplement'
    monkeypatch.setenv('PHOENIX_ACCESS_KEY_SHA256',hashlib.sha256(key.encode()).hexdigest())
    monkeypatch.setattr(budget.clock,'today',lambda:TODAY)
    app=FastAPI(); app.include_router(budget.router,prefix='/budget'); app.add_middleware(AccessControlMiddleware)
    client=TestClient(app)
    p=payload();p['base_import_id']=db_base['statement_import_id']
    body={'review':p,'image_base64':base64.b64encode(IMAGE).decode()}
    assert client.post('/budget/statement-image-supplement',json=body).status_code==401
    headers={'Authorization':f'Bearer {key}'}
    assert client.post('/budget/statement-image-supplement',json={**body,'image_base64':'not base64'},headers=headers).status_code==422
    response=client.post('/budget/statement-image-supplement',json=body,headers=headers)
    assert response.status_code==200
    assert response.json()['saved']==2
    assert 'no-store' in response.headers['cache-control']
