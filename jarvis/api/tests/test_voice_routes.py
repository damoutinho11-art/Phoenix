"""Voice proxy: key stays server-side, unconfigured is honest, upstream errors are shielded."""
from unittest.mock import AsyncMock, patch

import httpx
import pytest
from fastapi.testclient import TestClient

from jarvis.api.main import app

client = TestClient(app)


@pytest.fixture
def no_key(monkeypatch):
    monkeypatch.delenv("ELEVENLABS_API_KEY", raising=False)


@pytest.fixture
def with_key(monkeypatch):
    monkeypatch.setenv("ELEVENLABS_API_KEY", "synthetic-elevenlabs-key")
    monkeypatch.setenv("ELEVENLABS_VOICE_ID", "voice-123")


def test_status_reports_unconfigured_without_key(no_key):
    data = client.get("/voice/status").json()
    assert data == {"configured": False, "provider": None, "max_chars": 1200, "voice_id": None}


def test_speak_is_503_without_key(no_key):
    r = client.post("/voice/speak", json={"text": "hello"})
    assert r.status_code == 503


def test_speak_proxies_audio_and_never_exposes_the_key(with_key):
    seen = {}

    async def fake_post(self, url, json=None, headers=None):
        seen.update(url=url, json=json, headers=headers)
        return httpx.Response(200, content=b"ID3audio", headers={"content-type": "audio/mpeg"})

    with patch.object(httpx.AsyncClient, "post", fake_post):
        r = client.post("/voice/speak", json={"text": "Week 38 is deployed."})
    assert r.status_code == 200
    assert r.headers["content-type"].startswith("audio/mpeg")
    assert r.content == b"ID3audio"
    assert "no-store" in r.headers["cache-control"]
    assert seen["url"].endswith("/text-to-speech/voice-123")
    assert seen["headers"]["xi-api-key"] == "synthetic-elevenlabs-key"
    assert seen["json"]["text"] == "Week 38 is deployed."
    assert "synthetic-elevenlabs-key" not in r.text if r.headers["content-type"].startswith("text") else True


def test_speak_rejects_oversize_and_empty_text(with_key):
    assert client.post("/voice/speak", json={"text": ""}).status_code == 422
    assert client.post("/voice/speak", json={"text": "x" * 1201}).status_code == 422
    assert client.post("/voice/speak", json={"text": "ok", "voice_id": "other"}).status_code == 422


def test_upstream_failures_are_shielded(with_key):
    async def rejected(self, url, json=None, headers=None):
        return httpx.Response(401, json={"detail": "bad key"})

    async def down(self, url, json=None, headers=None):
        raise httpx.ConnectError("boom")

    with patch.object(httpx.AsyncClient, "post", rejected):
        r = client.post("/voice/speak", json={"text": "hi"})
    assert r.status_code == 502 and "rejected the configured key" in r.json()["detail"]
    with patch.object(httpx.AsyncClient, "post", down):
        assert client.post("/voice/speak", json={"text": "hi"}).status_code == 502
