"""Tests for the research-only PHOENIX Research Desk memo API."""

from pathlib import Path

import pytest
from fastapi.testclient import TestClient

from jarvis.api.main import app
from jarvis.data import database
from jarvis.domains.finance import engine

client = TestClient(app)


@pytest.fixture(autouse=True)
def isolated_research_db(tmp_path: Path, monkeypatch: pytest.MonkeyPatch):
    monkeypatch.setattr(database, "DB_PATH", tmp_path / "research.db")
    database.init_db()


def _payload(**overrides) -> dict:
    payload = {
        "asset": "quality_etf",
        "sleeve": None,
        "title": "Quality ETF research memo",
        "thesis": "Evidence-backed research thesis.",
        "risks": ["Factor underperformance"],
        "data_confidence": "MEDIUM",
        "verdict": "WATCH",
        "sources": [{"label": "Issuer factsheet", "url": "https://example.com/factsheet"}],
        "validation": {"status": "PARTIAL"},
        "status": "draft",
        "notes": "Research only.",
    }
    payload.update(overrides)
    return payload


def _assert_safety_flags(data: dict) -> None:
    assert data["research_only"] is True
    assert data["trades_executed"] is False
    assert data["broker_connection"] is False
    assert data["portfolio_state_updated"] is False
    assert data["recommendation_overridden"] is False


def test_create_research_memo_returns_record_and_safety_flags() -> None:
    response = client.post("/finance/research/memos", json=_payload())

    assert response.status_code == 200
    data = response.json()
    _assert_safety_flags(data)
    assert data["memo_id"] == data["memo"]["id"]
    assert data["memo"]["verdict"] == "WATCH"
    assert data["memo"]["risks"] == ["Factor underperformance"]


def test_list_and_fetch_research_memos() -> None:
    created = client.post("/finance/research/memos", json=_payload()).json()

    listing = client.get("/finance/research/memos")
    detail = client.get(f"/finance/research/memos/{created['memo_id']}")

    assert listing.status_code == 200
    assert listing.json()["count"] == 1
    assert listing.json()["memos"][0]["id"] == created["memo_id"]
    _assert_safety_flags(listing.json())
    assert detail.status_code == 200
    assert detail.json()["memo"]["id"] == created["memo_id"]
    _assert_safety_flags(detail.json())


def test_missing_research_memo_returns_404() -> None:
    assert client.get("/finance/research/memos/999999").status_code == 404


@pytest.mark.parametrize(
    ("field", "value"),
    [("verdict", "BUY"), ("status", "published")],
)
def test_create_rejects_invalid_verdict_or_status(field: str, value: str) -> None:
    response = client.post("/finance/research/memos", json=_payload(**{field: value}))

    assert response.status_code == 422


def test_create_research_memo_does_not_mutate_portfolio_state() -> None:
    portfolio_path = engine.DEFAULT_PORTFOLIO_STATE_PATH
    before = portfolio_path.read_bytes()

    response = client.post("/finance/research/memos", json=_payload())

    assert response.status_code == 200
    assert portfolio_path.read_bytes() == before
