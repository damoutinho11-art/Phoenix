from jarvis.api import ai_gateway


def test_ai_status_reports_freellmapi_missing_key(monkeypatch):
    monkeypatch.setenv("PHOENIX_AI_PROVIDER", "freellmapi")
    monkeypatch.setenv("PHOENIX_LLM_BASE_URL", "http://localhost:3001/v1")
    monkeypatch.delenv("PHOENIX_LLM_API_KEY", raising=False)
    monkeypatch.delenv("FREELLMAPI_API_KEY", raising=False)
    status = ai_gateway.status()
    assert status.selected_provider == "freellmapi"
    assert status.configured is False
    assert "PHOENIX_LLM_API_KEY" in status.missing
    assert status.core_requires_ai is False


def test_ai_status_auto_prefers_freellmapi_when_configured(monkeypatch):
    monkeypatch.setenv("PHOENIX_AI_PROVIDER", "auto")
    monkeypatch.setenv("PHOENIX_LLM_BASE_URL", "http://localhost:3001/v1")
    monkeypatch.setenv("PHOENIX_LLM_API_KEY", "freellmapi-test")
    status = ai_gateway.status()
    assert status.selected_provider == "freellmapi"
    assert status.configured is True
    assert status.model == "auto"


def test_generate_text_returns_provider_message_when_not_configured(monkeypatch):
    monkeypatch.setenv("PHOENIX_AI_PROVIDER", "off")
    result = ai_gateway.generate_text(system_prompt="x", messages=[{"role":"user","content":"hi"}])
    assert result.ok is False
    assert "AI is disabled" in result.text
