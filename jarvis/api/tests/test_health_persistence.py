"""Tests for the persistence diagnostic endpoints."""

import json
from pathlib import Path

import pytest
from fastapi.testclient import TestClient

from jarvis.api.main import app
from jarvis.data import database
from jarvis.domains.finance import engine

client = TestClient(app)


@pytest.fixture(autouse=True)
def isolated_db(tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(database, "DB_PATH", tmp_path / "test.db")
    database.init_db()


def test_get_persistence_returns_diagnostics() -> None:
    response = client.get("/health/persistence")

    assert response.status_code == 200
    data = response.json()
    assert "db_path" in data
    assert "db_exists" in data
    assert "db_size_bytes" in data
    assert "table_counts" in data
    assert "finance_transaction_ledger_columns" in data


def test_get_persistence_includes_finance_ledger_count() -> None:
    response = client.get("/health/persistence")

    data = response.json()
    assert "finance_transaction_ledger" in data["table_counts"]


def test_post_probe_creates_marker() -> None:
    response = client.post("/health/persistence/probe")

    assert response.status_code == 200
    data = response.json()
    assert data["ok"] is True
    assert data["marker"]["key"] == "production_persistence_probe"
    assert data["marker"]["value"]  # non-empty timestamp


def test_post_probe_safety_flags() -> None:
    data = client.post("/health/persistence/probe").json()

    assert data["trades_executed"] is False
    assert data["broker_connection"] is False
    assert data["portfolio_state_updated"] is False


def test_post_probe_message_is_safe() -> None:
    data = client.post("/health/persistence/probe").json()

    assert "No finance data or portfolio state was changed" in data["message"]


def test_get_persistence_shows_marker_after_probe() -> None:
    client.post("/health/persistence/probe")

    data = client.get("/health/persistence").json()
    assert data["persistence_marker"] is not None
    assert data["persistence_marker"]["key"] == "production_persistence_probe"


def test_probe_does_not_create_finance_transaction(tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> None:
    client.post("/health/persistence/probe")

    rows = database.get_finance_transactions(limit=50)
    assert rows == []


def test_probe_does_not_mutate_portfolio_state(tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> None:
    state_path = engine.DEFAULT_PORTFOLIO_STATE_PATH
    before = state_path.read_text(encoding="utf-8")

    client.post("/health/persistence/probe")

    assert state_path.read_text(encoding="utf-8") == before


def test_probe_is_idempotent() -> None:
    client.post("/health/persistence/probe")
    r1 = client.post("/health/persistence/probe")

    assert r1.status_code == 200
    data = client.get("/health/persistence").json()
    assert data["table_counts"]["persistence_markers"] == 1


def test_table_counts_present() -> None:
    data = client.get("/health/persistence").json()
    counts = data["table_counts"]

    for table in ("brief_history", "finance_transaction_ledger",
                  "persistence_markers", "budget_transactions",
                  "meal_log", "weight_log"):
        assert table in counts
