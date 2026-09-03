"""Personal feed provenance must survive every legacy calendar consumer."""
from copy import deepcopy
from datetime import date
from unittest.mock import Mock

import pytest

from jarvis.api import dependencies
from jarvis.api.ai_gateway import AIResult
from jarvis.api.routers import chat, crossdomain, training
from jarvis.core import clock
from jarvis.data import database
from jarvis.domains.calendar import plaan_live


TODAY = date(2026, 6, 22)
EVENT = {"event_id": "personal-show", "event_type": "performance",
         "title": "Personal performance", "date": TODAY.isoformat(),
         "time_start": "19:00", "time_end": "22:00", "location": "Opera", "role": None}


@pytest.fixture
def source(monkeypatch, tmp_path):
    monkeypatch.setattr(database, "DB_PATH", tmp_path / "consumers.db")
    database.init_db()
    monkeypatch.setattr(clock, "today", lambda: TODAY)
    imported = {"as_of": "2026-06-23T09:00:00", "events": [], "fetch_warnings": []}
    monkeypatch.setattr(database, "get_latest_calendar_snapshot_import", lambda: {"snapshot": imported})
    raw = {"as_of": "2026-06-23T10:00:00", "events": [deepcopy(EVENT)], "fetch_warnings": []}
    status = {"active_source": "personal_feed", "status": "healthy", "configured": True}
    resolver = Mock(side_effect=lambda default, *, imported_snapshot: (deepcopy(raw), dict(status)))
    monkeypatch.setattr(plaan_live, "resolve_snapshot_raw", resolver)
    monkeypatch.setattr(training.google_oauth, "connection_status", lambda: {"connected": True})
    monkeypatch.setattr(training.google_calendar_client, "fetch_events", lambda *a: ([], []))
    return raw, status, resolver, imported


def test_training_status_uses_personal_performance(source):
    result = training.training_status(dependencies.get_training_constitution())
    assert any(c["opera_event_title"] == EVENT["title"] for c in result["conflicts"])
    assert result["calendar_evidence"]["conflicts_checked"] is True
    assert source[2].call_args.kwargs["imported_snapshot"] == source[3]


def test_training_brief_uses_personal_performance(source, monkeypatch):
    generate = Mock(return_value=AIResult(text="Brief", provider="test", model="test", ok=True))
    monkeypatch.setattr(training.ai_gateway, "generate_text", generate)
    training.training_brief(dependencies.get_training_constitution())
    assert EVENT["title"] in str(generate.call_args)
    assert source[2].call_args.kwargs["imported_snapshot"] == source[3]


def test_crossdomain_uses_personal_performance(source):
    result = crossdomain.cross_domain_alerts(dependencies.get_training_constitution(), dependencies.get_nutrition_constitution())
    assert any(EVENT["title"] in alert for alert in result["alerts"])
    assert result["calendar_evidence"]["conflicts_checked"] is True


@pytest.mark.parametrize("consumer", [chat._build_calendar_context, chat._build_training_context, chat._build_app_context])
def test_chat_consumers_resolve_latest_import(source, consumer):
    text = consumer()
    assert source[2].called
    assert source[2].call_args.kwargs["imported_snapshot"] == source[3]
    assert EVENT["title"] in text or "currently loaded: 1" in text


@pytest.mark.parametrize("health", ["unavailable", "degraded", "stale"])
@pytest.mark.parametrize("retained", [False, True])
def test_unhealthy_personal_feed_not_masked_by_empty_google(source, health, retained):
    raw, status, _, _ = source
    status.update(active_source="personal_feed_" + health, status=health)
    if not retained:
        raw["events"] = []
    events, evidence = training._current_calendar_events()
    assert evidence["conflicts_checked"] is False
    assert evidence["available"] is False
    assert health in evidence["reason"]
    assert "unconfirmed" in evidence["reason"].lower()
    assert bool(events) == retained


@pytest.mark.parametrize("health", ["unavailable", "degraded", "stale"])
def test_unhealthy_legacy_consumers_preserve_warning_and_known_events(source, monkeypatch, health):
    source[1].update(active_source="personal_feed_" + health, status=health)
    status = training.training_status(dependencies.get_training_constitution())
    assert status["calendar_evidence"]["conflicts_checked"] is False
    assert any(c["opera_event_title"] == EVENT["title"] for c in status["conflicts"])
    generate = Mock()
    monkeypatch.setattr(training.ai_gateway, "generate_text", generate)
    brief = training.training_brief(dependencies.get_training_constitution())
    assert "unconfirmed" in brief["brief"].lower()
    assert EVENT["title"] in brief["brief"]
    generate.assert_not_called()
    alerts = crossdomain.cross_domain_alerts(dependencies.get_training_constitution(), dependencies.get_nutrition_constitution())
    assert alerts["calendar_evidence"]["conflicts_checked"] is False
    assert any("unconfirmed" in a.lower() for a in alerts["alerts"])
    for consumer in (chat._build_calendar_context, chat._build_training_context, chat._build_app_context):
        assert "unconfirmed" in consumer().lower()


@pytest.mark.parametrize("health", ["unavailable", "degraded", "stale"])
def test_empty_unhealthy_chat_never_claims_no_events(source, health):
    source[0]["events"] = []
    source[1].update(active_source="personal_feed_" + health, status=health)
    text = chat._build_calendar_context()
    assert "unconfirmed" in text.lower()
    assert "No upcoming events" not in text


def test_healthy_empty_personal_feed_remains_complete(source):
    source[0]["events"] = []
    events, evidence = training._current_calendar_events()
    assert events == []
    assert evidence["conflicts_checked"] is True


def test_explicit_unhealthy_status_overrides_unsuffixed_source(source):
    source[1]["status"] = "degraded"
    _, evidence = training._current_calendar_events()
    assert evidence["conflicts_checked"] is False


def test_resolution_failure_does_not_become_empty_chat(source):
    source[2].side_effect = RuntimeError("private transport detail")
    text = chat._build_calendar_context()
    assert "unconfirmed" in text.lower()
    assert "private transport detail" not in text
