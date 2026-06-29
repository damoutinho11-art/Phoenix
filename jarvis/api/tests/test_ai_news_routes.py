from fastapi.testclient import TestClient

from jarvis.api.main import app

client = TestClient(app)


def test_ai_status_route_is_safe(monkeypatch):
    monkeypatch.setenv("PHOENIX_AI_PROVIDER", "freellmapi")
    monkeypatch.delenv("PHOENIX_LLM_API_KEY", raising=False)
    response = client.get("/jarvis/ai/status")
    assert response.status_code == 200
    data = response.json()
    assert data["selected_provider"] == "freellmapi"
    assert data["core_requires_ai"] is False
    assert "PHOENIX_LLM_API_KEY" in data["missing"]


def test_activity_route_explains_background_jobs():
    response = client.get("/jarvis/activity")
    assert response.status_code == 200
    data = response.json()
    assert "background_jobs" in data
    assert data["safety"]["automatic_trades"] is False
    assert data["inventory"]["recipes"] == 156


def test_news_status_route():
    response = client.get("/news/status")
    assert response.status_code == 200
    data = response.json()
    assert data["core_requires_news"] is False


def test_news_disabled_headlines_route(monkeypatch):
    monkeypatch.setenv("PHOENIX_NEWS_ENABLED", "false")
    response = client.get("/news/headlines?topic=finance&limit=2")
    assert response.status_code == 200
    data = response.json()
    assert data["enabled"] is False
    assert data["headlines"] == []
