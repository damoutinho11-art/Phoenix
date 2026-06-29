from jarvis.domains.news import engine


def test_news_status_is_optional():
    status = engine.status()
    assert status["core_requires_news"] is False
    assert status["source"] == "google_news_rss"


def test_news_disabled_returns_warning(monkeypatch):
    monkeypatch.setenv("PHOENIX_NEWS_ENABLED", "false")
    result = engine.fetch_headlines(topic="finance", limit=3)
    assert result["enabled"] is False
    assert result["headlines"] == []
    assert result["warnings"]


def test_news_message_detection():
    assert engine.should_fetch_for_message("finance", "what should I buy") is True
    assert engine.should_fetch_for_message("home", "what news are you fetching?") is True
    assert engine.should_fetch_for_message("nutrition", "how much protein left") is False
