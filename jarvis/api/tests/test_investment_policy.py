import pytest
from fastapi.testclient import TestClient
from jarvis.api.main import app
from jarvis.data import database
from jarvis.data.investment_policy import get_policy


@pytest.fixture
def client(tmp_path, monkeypatch):
    monkeypatch.setenv('PHOENIX_FINANCE_SELECTION_MODE', 'contribution_v2')
    monkeypatch.setattr(database, 'DB_PATH', tmp_path / 'policy.db')
    database.init_db()
    return TestClient(app)


def test_policy_is_explicit_append_only_and_does_not_execute_trades(client):
    assert client.get('/finance/investment-policy').json()['policy'] is None
    for cap in (.1, .2):
        response = client.put('/finance/investment-policy', json={
            'version': 'core-satellite-v1', 'crypto_max_weight': cap})
        assert response.status_code == 200
        assert response.json()['trades_executed'] is False
    assert get_policy()['crypto_max_weight'] == .2
    connection = database.get_db()
    try:
        assert connection.execute('SELECT COUNT(*) FROM finance_investment_policies').fetchone()[0] == 2
    finally:
        connection.close()


@pytest.mark.parametrize('cap', [True, '0.1', 0, -.1, .5, 1])
def test_invalid_policy_cannot_be_saved(client, cap):
    assert client.put('/finance/investment-policy', json={
        'version': 'core-satellite-v1', 'crypto_max_weight': cap}).status_code == 422
    assert get_policy() is None


def test_unavailable_policy_fails_closed(client):
    connection = database.get_db()
    try:
        connection.execute("INSERT INTO finance_investment_policies(value_json,created_at) VALUES ('{}','2026-09-12')")
        connection.commit()
    finally:
        connection.close()
    assert client.get('/finance/investment-policy').status_code == 503
    from jarvis.api.dependencies import get_finance_constitution
    from fastapi import HTTPException
    with pytest.raises(HTTPException) as error:
        get_finance_constitution()
    assert error.value.status_code == 503


def test_policy_routes_require_credentials(client):
    headers = {'Authorization': 'Bearer invalid-synthetic-key'}
    assert client.get('/finance/investment-policy', headers=headers).status_code == 401
    assert client.put('/finance/investment-policy', headers=headers, json={
        'version': 'core-satellite-v1', 'crypto_max_weight': .1}).status_code == 401
    assert get_policy() is None


def test_policy_put_preflight_is_allowed_for_configured_origin(client):
    response = client.options('/finance/investment-policy', headers={
        'Origin':'http://localhost:5173', 'Access-Control-Request-Method':'PUT',
        'Access-Control-Request-Headers':'authorization,content-type'})
    assert response.status_code == 200
    assert 'PUT' in response.headers['access-control-allow-methods']


def test_policy_cannot_fall_back_to_legacy_approvals(client, monkeypatch):
    policy={'version':'core-satellite-v1','crypto_max_weight':.1}
    assert client.put('/finance/investment-policy',json=policy).status_code == 200
    monkeypatch.setenv('PHOENIX_FINANCE_SELECTION_MODE','legacy')
    assert client.put('/finance/investment-policy',json=policy).status_code == 409
    from jarvis.api.dependencies import get_finance_constitution
    from fastapi import HTTPException
    with pytest.raises(HTTPException) as error:
        get_finance_constitution()
    assert error.value.status_code == 503


def test_background_research_loads_saved_policy(client, monkeypatch):
    from jarvis.api.routers import finance
    from jarvis.data.investment_policy import save_policy
    from jarvis.domains.finance.tests.test_evidence_allocation import state
    policy={'version':'core-satellite-v1','crypto_max_weight':.1}
    save_policy(policy)
    def stop_after_policy_load(today, **kwargs):
        assert finance.get_finance_constitution()['investment_policy'] == policy
        raise RuntimeError('synthetic stop before research')
    # If the background path bypasses the dependency this tracking assertion fails.
    original=finance.get_finance_constitution
    loaded=[]
    def tracked():
        value=original(); loaded.append(value); return value
    monkeypatch.setattr(finance,'get_finance_constitution',tracked)
    monkeypatch.setattr(finance,'_cashflow_authority_for_today',stop_after_policy_load)
    with pytest.raises(RuntimeError,match='synthetic stop'):
        finance._run_research_autopilot_internal(portfolio_state=state()[1],profile={})
    assert len(loaded) == 2
