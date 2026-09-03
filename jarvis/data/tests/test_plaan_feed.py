from datetime import datetime, timedelta, timezone
from unittest.mock import patch

import pytest
import httpx

from jarvis.data import database


@pytest.fixture
def feed(tmp_path, monkeypatch):
    monkeypatch.setattr(database, "DB_PATH", tmp_path / "feed.db")
    database.init_db()
    monkeypatch.setenv("PHOENIX_PLAAN_LIVE_ENABLED", "true")
    monkeypatch.setenv("PHOENIX_PLAAN_ICAL_URL", "webcal://plaan.opera.ee/v2/c/test.ical")
    from jarvis.data import plaan_feed
    return plaan_feed


def test_restrict_url(feed):
    assert feed.normalize_url("webcal://plaan.opera.ee/v2/c/test.ical").startswith("https://")
    for url in ["http://plaan.opera.ee/x", "https://other.test/x", "https://user:pass@plaan.opera.ee/x", "https://plaan.opera.ee:444/x"]:
        with pytest.raises(ValueError):
            feed.normalize_url(url)


def test_cache_refresh_and_fail_closed(feed):
    now = datetime(2026, 9, 3, 9, tzinfo=timezone.utc)
    snapshot = {"as_of": "2026-09-03T09:00:00", "events": [], "fetch_warnings": []}
    with patch.object(feed, "fetch_snapshot", return_value=snapshot) as fetch:
        feed.refresh(now=now)
        feed.refresh(now=now + timedelta(minutes=30))
        assert fetch.call_count == 1
    assert feed.read_status(now=now)["status"] == "healthy"
    with patch.object(feed, "fetch_snapshot", side_effect=ValueError("private URL secret")):
        feed.refresh(now=now + timedelta(hours=2))
    status = feed.read_status(now=now + timedelta(hours=2))
    assert status["status"] == "degraded"
    assert "secret" not in str(status)
    assert feed.read_status(now=now + timedelta(hours=27))["status"] == "stale"
    assert feed.resolve(now=now + timedelta(hours=2))[1]["active_source"] == "personal_feed_degraded"


def test_new_source_never_reuses_previous_cache(feed, monkeypatch):
    now = datetime.now(timezone.utc)
    with patch.object(feed, "fetch_snapshot", return_value={"as_of": now.isoformat(), "events": [], "fetch_warnings": []}):
        feed.refresh(now=now)
    monkeypatch.setenv("PHOENIX_PLAAN_ICAL_URL", "https://plaan.opera.ee/v2/c/other.ical")
    assert feed.read_status(now=now)["status"] == "unavailable"


def test_resolver_never_falls_back_to_fixture(feed):
    from jarvis.domains.calendar import plaan_live
    raw, status = plaan_live.resolve_snapshot_raw({"events": [{"title": "FAKE"}]})
    assert raw["events"] == []
    assert status["active_source"] == "personal_feed_unavailable"


def test_health_is_preserved_in_connector_status(feed):
    from jarvis.domains.calendar.connectors import _plaan_connector_status
    status = _plaan_connector_status(feed.resolve()[1])
    assert status["status"] == "unavailable"
    assert "once per day" in status["source_cadence"]


def test_healthy_source_is_authoritative_for_training(feed):
    from jarvis.api.routers.training import _AUTHORITATIVE_CALENDAR_SOURCES
    assert "personal_feed" in _AUTHORITATIVE_CALENDAR_SOURCES
    assert "personal_feed_degraded" not in _AUTHORITATIVE_CALENDAR_SOURCES


def test_background_job_registered_only_when_enabled(feed, monkeypatch):
    from jarvis.api import main
    monkeypatch.setenv("PHOENIX_BACKGROUND_JOBS_ENABLED", "true")
    assert "plaan_personal_feed" in {j["name"] for j in main.background_job_descriptions()}
    monkeypatch.setenv("PHOENIX_PLAAN_LIVE_ENABLED", "false")
    assert "plaan_personal_feed" not in {j["name"] for j in main.background_job_descriptions()}


def test_nutrition_does_not_infer_free_day_when_feed_missing(feed):
    from fastapi.testclient import TestClient
    from jarvis.api.main import app
    data = TestClient(app).get("/nutrition/calendar-bridge?days=1").json()
    assert data["calendar_available"] is False
    assert data["days"][0]["day_type"] == "unconfirmed"
    assert data["days"][0]["meal_timing"] == []


@pytest.mark.parametrize('response', [
    httpx.Response(302, headers={'location':'https://other.test/'}),
    httpx.Response(200, headers={'content-type':'text/html'}, text='<html>login</html>'),
    httpx.Response(200, headers={'content-type':'text/calendar'}, content=b'x' * (5*1024*1024+1)),
])
def test_fetch_rejects_redirect_html_and_oversized_payload(feed, response):
    requests = []
    def respond(request):
        requests.append(request)
        return response
    client = httpx.AsyncClient(transport=httpx.MockTransport(respond), follow_redirects=False)
    with patch.object(feed.httpx, 'AsyncClient', return_value=client):
        with pytest.raises(ValueError):
            feed.fetch_snapshot('https://plaan.opera.ee/v2/c/test.ical', now=datetime.now(timezone.utc))
    assert len(requests) == 1


def test_refresh_is_single_flight(feed):
    with feed._lock:
        with patch.object(feed, 'fetch_snapshot') as fetch:
            feed.refresh()
            fetch.assert_not_called()


def test_transport_log_does_not_reveal_private_path(feed, caplog):
    import logging
    with caplog.at_level(logging.INFO, logger='httpx'):
        client = httpx.AsyncClient(transport=httpx.MockTransport(lambda req: httpx.Response(302)))
        with patch.object(feed.httpx, 'AsyncClient', return_value=client):
            with pytest.raises(ValueError):
                feed.fetch_snapshot('https://plaan.opera.ee/v2/c/private-secret.ical', now=datetime.now(timezone.utc))
    assert 'private-secret' not in caplog.text


def test_persistence_failure_cannot_keep_healthy_label(feed):
    now = datetime.now(timezone.utc)
    with patch.object(feed, 'fetch_snapshot', return_value={'as_of':now.isoformat(),'events':[],'fetch_warnings':[]}):
        feed.refresh(now=now)
        connection = database.get_db()
        class BrokenConnection:
            def __enter__(self):
                raise OSError('disk full')
            def __exit__(self, *args):
                return False
            def close(self):
                pass
        with patch.object(database, 'get_db', side_effect=[connection, BrokenConnection()]):
            feed.refresh(now=now + timedelta(hours=2))
        assert feed.read_status(now=now + timedelta(hours=2))['status'] == 'degraded'
        feed.refresh(now=now + timedelta(hours=2))
        assert feed.read_status(now=now + timedelta(hours=2))['status'] == 'healthy'


def test_resolver_uses_one_atomic_cache_read(feed):
    now = datetime.now(timezone.utc)
    cached = {'snapshot_json':'{"events":[],"as_of":"2026-09-03T00:00:00"}', 'last_success_at':now.isoformat()}
    with patch.object(feed, '_load', side_effect=[cached, OSError('read failed')]) as load:
        raw, status = feed.resolve(now=now)
    assert load.call_count == 1
    assert status['status'] == 'healthy'


def test_download_has_total_deadline(feed):
    import asyncio
    from unittest.mock import AsyncMock
    with patch.object(feed, '_download', new=AsyncMock(return_value=b'calendar')):
        real_wait = asyncio.wait_for
        with patch.object(feed.asyncio, 'wait_for', wraps=real_wait) as wait:
            assert asyncio.run(feed._bounded_download('https://plaan.opera.ee/test')) == b'calendar'
            assert wait.call_args.kwargs['timeout'] == 10
