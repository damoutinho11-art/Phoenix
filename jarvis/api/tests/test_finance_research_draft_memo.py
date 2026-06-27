"""Tests for POST /finance/research/draft-memo (PHOENIX Automated Research Draft v1).

Safety invariants verified:
- Draft is always status=draft
- Draft does not mutate portfolio_state.json
- Draft does not change recommendation amounts/routes
- All safety flags present (research_only, draft_only, trades_executed=False, etc.)
- Missing/empty asset is rejected
- Generated content is marked as requiring human review
"""

from pathlib import Path
from unittest.mock import patch

import pytest
from fastapi.testclient import TestClient

from jarvis.api.main import app
from jarvis.data import database
from jarvis.domains.finance import engine

client = TestClient(app)

_SAFE_RESOLUTION = {
    "selected_candidate": None,
    "candidates": [],
    "source": "yfinance",
    "broker_source": "lightyear_public_fund_screener",
    "broker_verification": "not_verified",
    "confirmation_required": True,
    "lightyear_available": "unknown",
    "confidence": "unresolved",
    "reason": "test fixture",
}


@pytest.fixture(autouse=True)
def isolated_db(tmp_path: Path, monkeypatch: pytest.MonkeyPatch):
    monkeypatch.setattr(database, "DB_PATH", tmp_path / "draft_test.db")
    database.init_db()


@pytest.fixture(autouse=True)
def patch_etf_resolver():
    with patch(
        "jarvis.api.routers.finance.resolve_best_etf_candidate_with_broker_check",
        return_value=_SAFE_RESOLUTION,
    ):
        yield


# --- Basic creation ---

def test_draft_memo_returns_200_and_memo_id() -> None:
    response = client.post("/finance/research/draft-memo", json={"asset": "btc"})

    assert response.status_code == 200
    data = response.json()
    assert isinstance(data["memo_id"], int)
    assert data["memo_id"] == data["memo"]["id"]


def test_draft_memo_status_is_always_draft() -> None:
    response = client.post("/finance/research/draft-memo", json={"asset": "btc"})

    assert response.json()["memo"]["status"] == "draft"


def test_draft_memo_verdict_is_insufficient_data() -> None:
    response = client.post("/finance/research/draft-memo", json={"asset": "quality_etf"})

    assert response.json()["memo"]["verdict"] == "INSUFFICIENT_DATA"


def test_draft_memo_data_confidence_is_low() -> None:
    response = client.post("/finance/research/draft-memo", json={"asset": "btc"})

    assert response.json()["memo"]["data_confidence"] == "LOW"


def test_draft_memo_notes_requires_human_review() -> None:
    response = client.post("/finance/research/draft-memo", json={"asset": "btc"})

    notes = response.json()["memo"]["notes"]
    assert notes is not None
    assert "human review" in notes.lower()


def test_draft_memo_thesis_marked_as_generated_draft() -> None:
    response = client.post("/finance/research/draft-memo", json={"asset": "btc"})

    thesis = response.json()["memo"]["thesis"]
    assert "GENERATED DRAFT" in thesis
    assert "REQUIRES HUMAN REVIEW" in thesis


def test_draft_memo_risks_is_non_empty_list() -> None:
    response = client.post("/finance/research/draft-memo", json={"asset": "btc"})

    risks = response.json()["memo"]["risks"]
    assert isinstance(risks, list)
    assert len(risks) >= 1


def test_draft_memo_asset_stored_correctly() -> None:
    response = client.post("/finance/research/draft-memo", json={"asset": "quality_etf"})

    assert response.json()["memo"]["asset"] == "quality_etf"


def test_draft_memo_sleeve_stored_when_provided() -> None:
    response = client.post(
        "/finance/research/draft-memo",
        json={"asset": "quality_etf", "sleeve": "quality_etf"},
    )

    assert response.json()["memo"]["sleeve"] == "quality_etf"


def test_draft_memo_custom_title_used_when_provided() -> None:
    response = client.post(
        "/finance/research/draft-memo",
        json={"asset": "btc", "title": "My custom BTC draft"},
    )

    assert response.json()["memo"]["title"] == "My custom BTC draft"


def test_draft_memo_default_title_includes_asset() -> None:
    response = client.post("/finance/research/draft-memo", json={"asset": "btc"})

    assert "btc" in response.json()["memo"]["title"].lower()


def test_draft_memo_source_context_included_in_thesis() -> None:
    response = client.post(
        "/finance/research/draft-memo",
        json={"asset": "btc", "source_context": "Strong on-chain metrics noted."},
    )

    thesis = response.json()["memo"]["thesis"]
    assert "Strong on-chain metrics noted." in thesis


# --- Safety flags ---

def test_draft_memo_safety_flags_all_present() -> None:
    response = client.post("/finance/research/draft-memo", json={"asset": "btc"})
    data = response.json()

    assert data["research_only"] is True
    assert data["draft_only"] is True
    assert data["trades_executed"] is False
    assert data["broker_connection"] is False
    assert data["portfolio_state_updated"] is False
    assert data["recommendation_overridden"] is False


# --- Portfolio state not mutated ---

def test_draft_memo_does_not_mutate_portfolio_state() -> None:
    portfolio_path = engine.DEFAULT_PORTFOLIO_STATE_PATH
    before = portfolio_path.read_bytes()

    client.post("/finance/research/draft-memo", json={"asset": "btc"})

    assert portfolio_path.read_bytes() == before


def test_multiple_draft_memos_do_not_mutate_portfolio_state() -> None:
    portfolio_path = engine.DEFAULT_PORTFOLIO_STATE_PATH
    before = portfolio_path.read_bytes()

    for asset in ("btc", "quality_etf", "hype"):
        client.post("/finance/research/draft-memo", json={"asset": asset})

    assert portfolio_path.read_bytes() == before


# --- Recommendation unchanged ---

def test_draft_memo_does_not_change_recommendation_amounts() -> None:
    with patch(
        "jarvis.api.routers.finance.detect_market_regime", return_value="risk_on"
    ):
        rec_before = client.get("/finance/recommendation").json()
        amounts_before = {r["asset"]: r["amount"] for r in rec_before["recommendations"]}

        client.post("/finance/research/draft-memo", json={"asset": "btc"})
        client.post("/finance/research/draft-memo", json={"asset": "quality_etf"})

        rec_after = client.get("/finance/recommendation").json()
        amounts_after = {r["asset"]: r["amount"] for r in rec_after["recommendations"]}

    assert amounts_after == amounts_before


def test_draft_memo_does_not_change_recommendation_routes() -> None:
    with patch(
        "jarvis.api.routers.finance.detect_market_regime", return_value="risk_on"
    ):
        rec_before = client.get("/finance/recommendation").json()
        routes_before = {r["asset"]: r["route"] for r in rec_before["recommendations"]}

        client.post("/finance/research/draft-memo", json={"asset": "btc"})

        rec_after = client.get("/finance/recommendation").json()
        routes_after = {r["asset"]: r["route"] for r in rec_after["recommendations"]}

    assert routes_after == routes_before


# --- Validation / rejection ---

def test_draft_memo_rejects_empty_asset() -> None:
    response = client.post("/finance/research/draft-memo", json={"asset": ""})

    assert response.status_code == 422


def test_draft_memo_rejects_missing_asset() -> None:
    response = client.post("/finance/research/draft-memo", json={"sleeve": "btc"})

    assert response.status_code == 422


# --- Draft persists in memo list ---

def test_draft_memo_appears_in_research_memos_list() -> None:
    client.post("/finance/research/draft-memo", json={"asset": "btc"})

    listing = client.get("/finance/research/memos").json()

    assert listing["count"] >= 1
    assets = [m["asset"] for m in listing["memos"]]
    assert "btc" in assets


def test_draft_memo_appears_with_draft_status_in_list() -> None:
    client.post("/finance/research/draft-memo", json={"asset": "quality_etf"})

    listing = client.get("/finance/research/memos").json()
    quality_memos = [m for m in listing["memos"] if m["asset"] == "quality_etf"]

    assert len(quality_memos) >= 1
    assert quality_memos[0]["status"] == "draft"
