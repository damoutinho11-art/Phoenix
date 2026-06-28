"""Durable finance recommendation receipt persistence tests."""

import json
from pathlib import Path
from unittest.mock import patch

import pytest
from fastapi.testclient import TestClient

from jarvis.api.main import app
from jarvis.data import database
from jarvis.domains.finance import acceptance_gate, engine


client = TestClient(app)


@pytest.fixture(autouse=True)
def accepted_receipt_environment(tmp_path: Path, monkeypatch: pytest.MonkeyPatch):
    monkeypatch.setattr(database, "DB_PATH", tmp_path / "receipt.db")
    database.init_db()
    acceptance_gate._seed_acceptance_evidence()
    with patch(
        "jarvis.api.routers.finance.resolve_best_etf_candidate_with_broker_check",
        side_effect=acceptance_gate._resolution,
    ), patch(
        "jarvis.api.routers.finance.detect_market_regime", return_value="risk_on"
    ):
        yield


def _saved_receipt() -> tuple[dict, dict]:
    response = client.get("/finance/recommendation")
    assert response.status_code == 200
    recommendation = response.json()
    row = database.get_latest_brief_for_week(recommendation["week_label"], "finance")
    assert row is not None
    payload = json.loads(row["full_brief_json"])
    return recommendation, payload["recommendation_receipt"]


def test_finance_recommendation_persists_complete_structured_receipt() -> None:
    recommendation, receipt = _saved_receipt()
    recommendations = {leg["asset"]: leg for leg in receipt["recommendations"]}

    assert receipt["version"] == 1
    assert receipt["week_label"] == recommendation["week_label"]
    assert receipt["week_budget"] == recommendation["week_budget"]
    assert recommendations["btc"]["amount"] == 46.15
    assert recommendations["btc"]["route"] == "lhv_crypto"
    assert recommendations["quality_etf"]["amount"] == 69.23
    assert recommendations["quality_etf"]["route"] == "lightyear"
    assert (
        recommendations["quality_etf"]["instrument"]["resolved_candidate"]["symbol"]
        == "IS3Q.DE"
    )


def test_finance_receipt_persists_research_and_transparency_evidence() -> None:
    _, receipt = _saved_receipt()
    research = {leg["asset"]: leg for leg in receipt["research_evidence"]}

    assert all(research[asset]["memo_id"] for asset in ("btc", "quality_etf"))
    assert research["btc"]["matching_validation_record_ids"]
    assert research["quality_etf"]["matching_validation_record_ids"]
    assert receipt["data_coverage"]["verdict"] == "DATA_TRANSPARENT"
    assert receipt["data_coverage"]["blockers"] == []
    assert receipt["acceptance_gate"]["accepted"] is True
    assert receipt["manual_buy_checklist"]["checklist_status"]


def test_finance_receipt_persists_no_execution_safety_contract() -> None:
    _, receipt = _saved_receipt()

    assert receipt["safety"] == {
        "broker_connection": False,
        "orders_created": False,
        "trades_executed": False,
        "portfolio_state_updated": False,
        "recommendation_overridden": False,
    }


def test_generating_and_viewing_receipt_creates_no_ledger_or_snapshot() -> None:
    portfolio_before = engine.DEFAULT_PORTFOLIO_STATE_PATH.read_bytes()
    ledger_before = database.get_finance_transactions()
    snapshots_before = database.list_finance_portfolio_snapshots()

    recommendation, _ = _saved_receipt()
    history = client.get("/finance/brief/history")

    assert history.status_code == 200
    assert history.json()["count"] == 1
    assert database.get_finance_transactions() == ledger_before == []
    assert database.list_finance_portfolio_snapshots() == snapshots_before == []
    assert engine.DEFAULT_PORTFOLIO_STATE_PATH.read_bytes() == portfolio_before
    assert recommendation["recommendations"][0]["amount"] in {46.15, 69.23}
