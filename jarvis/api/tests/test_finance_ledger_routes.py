"""Tests for the manual-only finance transaction ledger."""

import json
from pathlib import Path

import pytest
from fastapi.testclient import TestClient

from jarvis.api.main import app
from jarvis.data import database
from jarvis.domains.finance import engine

client = TestClient(app)

_PORTFOLIO_STATE = {
    "as_of": "2026-06-27",
    "currency": "EUR",
    "holdings": {
        "quality_etf": 0.0,
        "btc": 100.0,
        "tactical_reserve": 5.0,
    },
    "legacy_holdings": {"lhv_growth_euro_bond": 20.0},
    "units": {
        "quality_etf": 0.0,
        "btc": 0.001,
    },
}


@pytest.fixture()
def brief_id(tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> int:
    monkeypatch.setattr(database, "DB_PATH", tmp_path / "ledger.db")
    database.init_db()
    return database.save_brief(
        "W26 2026", "finance", "BUY", "quality_etf", 69.23, "lightyear", "test", None
    )


@pytest.fixture()
def apply_env(tmp_path: Path, monkeypatch: pytest.MonkeyPatch):
    """Fixture wiring an isolated DB and a writable portfolio_state.json."""
    monkeypatch.setattr(database, "DB_PATH", tmp_path / "ledger.db")
    database.init_db()

    state_path = tmp_path / "portfolio_state.json"
    state_path.write_text(json.dumps(_PORTFOLIO_STATE), encoding="utf-8")
    monkeypatch.setattr(engine, "DEFAULT_PORTFOLIO_STATE_PATH", state_path)

    brief = database.save_brief(
        "W26 2026", "finance", "BUY", "quality_etf", 69.23, "lightyear", "test", None
    )
    tx_id = database.save_finance_transaction({
        "brief_id": brief,
        "asset": "quality_etf",
        "symbol": "IWQU.L",
        "platform": "Lightyear",
        "side": "buy",
        "amount_eur": 69.23,
        "units": 0.91,
        "price": 75.64,
        "currency": "EUR",
        "fee_eur": 0.0,
        "executed_at": "2026-06-27T12:00:00Z",
        "notes": None,
    })
    return {"tx_id": tx_id, "state_path": state_path}


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


# ---------------------------------------------------------------------------
# Apply-gate tests
# ---------------------------------------------------------------------------

def test_performance_history_empty_state_is_honest(apply_env: dict) -> None:
    response = client.get("/finance/performance/history")

    assert response.status_code == 200
    assert response.json() == {
        "snapshots": [],
        "count": 0,
        "source": "real_sqlite",
        "message": "No real performance snapshots recorded yet.",
        "mock_data": False,
    }

def test_apply_preview_returns_200(apply_env: dict) -> None:
    tx_id = apply_env["tx_id"]
    response = client.get(f"/finance/ledger/{tx_id}/apply-preview")

    assert response.status_code == 200
    data = response.json()
    assert data["transaction_id"] == tx_id
    assert data["asset"] == "quality_etf"
    assert data["portfolio_state_updated"] is False
    assert data["requires_explicit_apply"] is True
    assert data["manual_record_only"] is True
    assert data["trades_executed"] is False
    assert data["broker_connection"] is False
    assert "before" in data
    assert "after" in data


def test_apply_preview_does_not_mutate_portfolio_state(apply_env: dict) -> None:
    tx_id = apply_env["tx_id"]
    state_path: Path = apply_env["state_path"]
    before_content = state_path.read_text(encoding="utf-8")

    client.get(f"/finance/ledger/{tx_id}/apply-preview")

    assert state_path.read_text(encoding="utf-8") == before_content


def test_apply_preview_creates_no_performance_snapshot(apply_env: dict) -> None:
    client.get(f"/finance/ledger/{apply_env['tx_id']}/apply-preview")

    assert database.list_finance_portfolio_snapshots() == []


def test_apply_returns_200(apply_env: dict) -> None:
    tx_id = apply_env["tx_id"]
    response = client.post(f"/finance/ledger/{tx_id}/apply")

    assert response.status_code == 200
    data = response.json()
    assert data["transaction_id"] == tx_id
    assert data["portfolio_state_updated"] is True
    assert data["manual_record_only"] is True
    assert data["trades_executed"] is False
    assert data["broker_connection"] is False
    assert data["applied_at"] is not None
    assert "PHOENIX did not execute a trade" in data["message"]


def test_apply_mutates_portfolio_state(apply_env: dict) -> None:
    tx_id = apply_env["tx_id"]
    state_path: Path = apply_env["state_path"]
    original = json.loads(state_path.read_text(encoding="utf-8"))

    client.post(f"/finance/ledger/{tx_id}/apply")

    updated = json.loads(state_path.read_text(encoding="utf-8"))
    assert updated != original


def test_apply_increases_holding_value(apply_env: dict) -> None:
    tx_id = apply_env["tx_id"]
    state_path: Path = apply_env["state_path"]

    client.post(f"/finance/ledger/{tx_id}/apply")

    updated = json.loads(state_path.read_text(encoding="utf-8"))
    assert abs(updated["holdings"]["quality_etf"] - (0.0 + 69.23)) < 0.001


def test_apply_increases_units(apply_env: dict) -> None:
    tx_id = apply_env["tx_id"]
    state_path: Path = apply_env["state_path"]

    client.post(f"/finance/ledger/{tx_id}/apply")

    updated = json.loads(state_path.read_text(encoding="utf-8"))
    assert abs(updated["units"]["quality_etf"] - (0.0 + 0.91)) < 0.0001


def test_apply_marks_transaction_applied(apply_env: dict) -> None:
    tx_id = apply_env["tx_id"]

    assert not database.finance_transaction_is_applied(tx_id)
    client.post(f"/finance/ledger/{tx_id}/apply")
    assert database.finance_transaction_is_applied(tx_id)


def test_first_apply_creates_one_real_snapshot(apply_env: dict) -> None:
    tx_id = apply_env["tx_id"]

    response = client.post(f"/finance/ledger/{tx_id}/apply")
    snapshots = database.list_finance_portfolio_snapshots()

    assert response.status_code == 200
    assert len(snapshots) == 1
    assert snapshots[0]["transaction_id"] == tx_id
    assert snapshots[0]["source"] == "real_portfolio_state"
    assert snapshots[0]["trigger"] == "ledger_apply"
    assert snapshots[0]["cash_eur"] == 5.0
    assert snapshots[0]["invested_value_eur"] == 189.23
    assert snapshots[0]["total_value_eur"] == 194.23


def test_snapshot_creation_is_idempotent_by_transaction_id(apply_env: dict) -> None:
    tx_id = apply_env["tx_id"]
    client.post(f"/finance/ledger/{tx_id}/apply")

    reused = database.create_finance_portfolio_snapshot(
        trigger="ledger_apply", transaction_id=tx_id
    )

    snapshots = database.list_finance_portfolio_snapshots()
    assert len(snapshots) == 1
    assert reused["id"] == snapshots[0]["id"]


def test_snapshots_without_transaction_id_may_coexist(apply_env: dict) -> None:
    first = database.create_finance_portfolio_snapshot(trigger="manual")
    second = database.create_finance_portfolio_snapshot(trigger="system")

    assert first["id"] != second["id"]
    assert len(database.list_finance_portfolio_snapshots()) == 2


def test_snapshot_uses_null_when_values_are_not_safely_derivable(apply_env: dict) -> None:
    state_path: Path = apply_env["state_path"]
    state_path.write_text(
        json.dumps({"as_of": "2026-06-27", "holdings": {"btc": None}}),
        encoding="utf-8",
    )

    snapshot = database.create_finance_portfolio_snapshot(trigger="manual")

    assert snapshot["total_value_eur"] is None
    assert snapshot["cash_eur"] is None
    assert snapshot["invested_value_eur"] is None
    assert snapshot["allocation"] == {}


def test_apply_twice_returns_409(apply_env: dict) -> None:
    tx_id = apply_env["tx_id"]
    client.post(f"/finance/ledger/{tx_id}/apply")

    response = client.post(f"/finance/ledger/{tx_id}/apply")

    assert response.status_code == 409
    assert len(database.list_finance_portfolio_snapshots()) == 1


def test_performance_history_returns_real_snapshot_after_apply(apply_env: dict) -> None:
    tx_id = apply_env["tx_id"]
    client.post(f"/finance/ledger/{tx_id}/apply")

    response = client.get("/finance/performance/history")
    data = response.json()

    assert response.status_code == 200
    assert data["count"] == 1
    assert data["mock_data"] is False
    assert data["source"] == "real_sqlite"
    assert data["snapshots"][0]["transaction_id"] == tx_id
    assert data["snapshots"][0]["total_value_eur"] == 194.23
    assert data["snapshots"][0]["trades_executed"] is False
    assert data["snapshots"][0]["broker_connection"] is False


def test_preview_applied_transaction_returns_409(apply_env: dict) -> None:
    tx_id = apply_env["tx_id"]
    client.post(f"/finance/ledger/{tx_id}/apply")

    response = client.get(f"/finance/ledger/{tx_id}/apply-preview")

    assert response.status_code == 409


def test_preview_missing_transaction_returns_404(apply_env: dict) -> None:
    response = client.get("/finance/ledger/99999/apply-preview")

    assert response.status_code == 404


def test_apply_missing_transaction_returns_404(apply_env: dict) -> None:
    response = client.post("/finance/ledger/99999/apply")

    assert response.status_code == 404


def test_apply_unknown_asset_returns_400(apply_env: dict, tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> None:
    tx_id = database.save_finance_transaction({
        "brief_id": None,
        "asset": "unknown_asset_xyz",
        "symbol": None,
        "platform": "Manual",
        "side": "buy",
        "amount_eur": 50.0,
        "units": 1.0,
        "price": 50.0,
        "currency": "EUR",
        "fee_eur": 0.0,
        "executed_at": "2026-06-27T12:00:00Z",
        "notes": None,
    })
    response = client.get(f"/finance/ledger/{tx_id}/apply-preview")

    assert response.status_code == 400


def test_no_broker_execution_flags_on_preview(apply_env: dict) -> None:
    tx_id = apply_env["tx_id"]
    data = client.get(f"/finance/ledger/{tx_id}/apply-preview").json()

    assert data["trades_executed"] is False
    assert data["broker_connection"] is False
    assert data["manual_record_only"] is True


def test_no_broker_execution_flags_on_apply(apply_env: dict) -> None:
    tx_id = apply_env["tx_id"]
    data = client.post(f"/finance/ledger/{tx_id}/apply").json()

    assert data["trades_executed"] is False
    assert data["broker_connection"] is False
    assert data["manual_record_only"] is True
