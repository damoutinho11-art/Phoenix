"""Tests for the manual-only finance transaction ledger."""

from pathlib import Path

import pytest
from fastapi.testclient import TestClient

from jarvis.api.main import app
from jarvis.data import database

client = TestClient(app)


@pytest.fixture()
def brief_id(tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> int:
    monkeypatch.setattr(database, "DB_PATH", tmp_path / "ledger.db")
    database.init_db()
    return database.save_brief(
        "W26 2026", "finance", "BUY", "quality_etf", 69.23, "lightyear", "test", None
    )


def _payload(brief_id: int) -> dict:
    return {
        "brief_id": brief_id,
        "asset": "quality_etf",
        "symbol": "IWQU.L",
        "platform": "Lightyear",
        "side": "buy",
        "amount_eur": 69.23,
        "units": 0.91,
        "price": 75.64,
        "currency": "EUR",
        "fee_eur": 0,
        "executed_at": "2026-06-27T12:00:00Z",
        "notes": "Manual Lightyear buy",
    }


def test_valid_manual_transaction_is_accepted_with_safety_flags(brief_id: int) -> None:
    response = client.post("/finance/ledger/manual-transaction", json=_payload(brief_id))

    assert response.status_code == 200
    data = response.json()
    assert isinstance(data["transaction_id"], int)
    assert data["manual_record_only"] is True
    assert data["trades_executed"] is False
    assert data["broker_connection"] is False
    assert data["portfolio_state_updated"] is False
    assert "did not execute a trade" in data["message"]


def test_transaction_appears_in_ledger(brief_id: int) -> None:
    created = client.post("/finance/ledger/manual-transaction", json=_payload(brief_id)).json()
    response = client.get("/finance/ledger")

    assert response.status_code == 200
    data = response.json()
    assert data["count"] == 1
    assert data["transactions"][0]["id"] == created["transaction_id"]
    assert data["transactions"][0]["asset"] == "quality_etf"
    assert data["manual_record_only"] is True
    assert data["trades_executed"] is False
    assert data["broker_connection"] is False


@pytest.mark.parametrize(
    ("field", "value"),
    [
        ("amount_eur", -1),
        ("units", 0),
        ("price", 0),
        ("fee_eur", -0.01),
        ("side", "sell"),
    ],
)
def test_invalid_numeric_or_side_values_are_rejected(
    brief_id: int, field: str, value: object
) -> None:
    response = client.post(
        "/finance/ledger/manual-transaction", json={**_payload(brief_id), field: value}
    )

    assert response.status_code == 422


@pytest.mark.parametrize("field", ["asset", "platform"])
def test_required_text_fields_are_rejected_when_missing(brief_id: int, field: str) -> None:
    payload = _payload(brief_id)
    payload.pop(field)

    response = client.post("/finance/ledger/manual-transaction", json=payload)

    assert response.status_code == 422


def test_invalid_brief_id_returns_404(brief_id: int) -> None:
    response = client.post(
        "/finance/ledger/manual-transaction", json={**_payload(brief_id), "brief_id": brief_id + 999}
    )

    assert response.status_code == 404


@pytest.mark.parametrize("action", ["approve", "defer", "reject"])
def test_approval_routes_keep_no_trade_safety_flags(brief_id: int, action: str) -> None:
    response = client.post(f"/finance/brief/{brief_id}/{action}")

    assert response.status_code == 200
    data = response.json()
    assert data["manual_record_only"] is True
    assert data["trades_executed"] is False
    assert data["broker_connection"] is False
