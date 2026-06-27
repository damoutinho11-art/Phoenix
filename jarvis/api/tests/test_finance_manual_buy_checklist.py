"""Tests for the read-only manual buy checklist projection."""

from pathlib import Path
from unittest.mock import patch

import pytest
from fastapi.testclient import TestClient

from jarvis.api.main import app
from jarvis.data import database
from jarvis.domains.finance import engine

client = TestClient(app)

_RESOLUTION = {
    "selected_candidate": {
        "symbol": "IWQU.L",
        "label": "iShares Edge MSCI World Quality Factor UCITS ETF",
        "raw_price": 75.64,
        "currency": "EUR",
        "eur_price": 75.64,
        "lightyear_available": True,
        "lightyear_confidence": "high",
    },
    "candidates": [],
    "source": "yfinance",
    "broker_source": "lightyear_public_fund_screener",
    "broker_verification": "verified",
    "confirmation_required": False,
    "lightyear_available": True,
    "confidence": "high",
    "reason": "Test fixture candidate.",
}


@pytest.fixture(autouse=True)
def isolated_environment(tmp_path: Path, monkeypatch: pytest.MonkeyPatch):
    monkeypatch.setattr(database, "DB_PATH", tmp_path / "checklist.db")
    database.init_db()
    with patch(
        "jarvis.api.routers.finance.resolve_best_etf_candidate_with_broker_check",
        return_value=_RESOLUTION,
    ), patch(
        "jarvis.api.routers.finance.detect_market_regime", return_value="risk_on"
    ):
        yield


def test_checklist_returns_current_recommendation_legs_unchanged() -> None:
    recommendation = client.get("/finance/recommendation").json()
    response = client.get("/finance/manual-buy-checklist")

    assert response.status_code == 200
    data = response.json()
    expected = {
        item["asset"]: (item["amount"], item["route"])
        for item in recommendation["recommendations"]
    }
    actual = {
        item["asset"]: (item["amount"], item["route"])
        for item in data["checklist_items"]
    }
    assert actual == expected
    assert data["week_label"] == recommendation["week_label"]
    assert data["week_budget"] == recommendation["week_budget"]
    assert data["requires_approval"] is True


def test_btc_item_has_lhv_crypto_manual_instruction() -> None:
    data = client.get("/finance/manual-buy-checklist").json()
    btc = next(item for item in data["checklist_items"] if item["asset"] == "btc")

    assert btc["platform"] == "LHV Crypto"
    assert btc["ticker"] == "BTC"
    assert "Open LHV Crypto manually" in btc["broker_instruction"]
    assert "€46.15" in btc["broker_instruction"]
    assert "fees" in btc["broker_instruction"]
    assert "quantity" in btc["broker_instruction"]


def test_quality_etf_item_has_lightyear_resolved_candidate() -> None:
    data = client.get("/finance/manual-buy-checklist").json()
    item = next(
        item for item in data["checklist_items"] if item["asset"] == "quality_etf"
    )

    assert item["platform"] == "Lightyear"
    assert item["ticker"] == "IWQU.L"
    assert item["resolved_candidate"]["symbol"] == "IWQU.L"
    assert "Open Lightyear manually" in item["broker_instruction"]
    assert "IWQU.L" in item["broker_instruction"]
    assert "€69.23" in item["broker_instruction"]


def test_checklist_copies_research_context_status() -> None:
    recommendation = client.get("/finance/recommendation").json()
    checklist = client.get("/finance/manual-buy-checklist").json()
    context = {item["asset"]: item for item in recommendation["research_context"]}

    for item in checklist["checklist_items"]:
        assert item["research_memo_id"] == context[item["asset"]]["memo_id"]
        assert item["research_verdict"] == context[item["asset"]]["verdict"]
        assert item["evidence_status"] == context[item["asset"]]["evidence_status"]
        assert item["research_warning"] == context[item["asset"]]["research_warning"]
    assert checklist["checklist_status"] == "NEEDS_RESEARCH_REVIEW"


def test_checklist_has_no_execution_safety_flags() -> None:
    flags = client.get("/finance/manual-buy-checklist").json()["safety_flags"]

    assert flags == {
        "checklist_only": True,
        "investment_approval": False,
        "trades_executed": False,
        "broker_connection": False,
        "orders_created": False,
        "portfolio_state_updated": False,
        "recommendation_overridden": False,
        "manual_broker_action_required": True,
    }


def test_checklist_does_not_mutate_portfolio_or_create_ledger_transaction() -> None:
    portfolio_path = engine.DEFAULT_PORTFOLIO_STATE_PATH
    before_portfolio = portfolio_path.read_bytes()
    before_ledger = database.get_finance_transactions(limit=50)

    response = client.get("/finance/manual-buy-checklist")

    assert response.status_code == 200
    assert portfolio_path.read_bytes() == before_portfolio
    assert database.get_finance_transactions(limit=50) == before_ledger == []
