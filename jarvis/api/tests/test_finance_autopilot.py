"""Tests for the PHOENIX Finance Autopilot v1.

Invariants verified:
 1. Memo autopilot runs all steps in order (evidence, adapters, synthesis, quality gate).
 2. Finance autopilot creates draft memos for new recommendation legs.
 3. Finance autopilot reuses existing memo instead of creating duplicates.
 4. BTC price adapter updates market_data_source to PASS when fetch succeeds.
 5. BTC price adapter returns UNVERIFIED when fetch fails.
 6. ETF adapter creates/updates market_data_source and broker_source.
 7. Autopilot never sets BUY_CANDIDATE.
 8. Autopilot does not mutate portfolio_state.json (flag = False).
 9. Autopilot does not change recommendation amount/route.
10. Autopilot does not create ledger entries.
11. Memo autopilot response has all required safety flags.
12. Finance autopilot response has all required safety flags.
13. VALIDATED-only research context attachment is still enforced.
14. Missing memo returns 404 from memo autopilot.
"""

from pathlib import Path
from unittest.mock import MagicMock, patch

import pytest
from fastapi.testclient import TestClient

from jarvis.api.main import app
from jarvis.data import database
from jarvis.domains.finance import engine

client = TestClient(app)

# ---------------------------------------------------------------------------
# Constants
# ---------------------------------------------------------------------------

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

_MOCK_ALLOC_RESULT = {
    "approval_ticket": {
        "weekly_budget": 100.0,
        "executable_allocation": {"btc": 50.0, "quality_etf": 50.0},
        "weekly_dual_lane_mandate": {
            "crypto_lane": {
                "asset": "btc",
                "amount": 50.0,
                "status": "READY_FOR_MANUAL_BUY",
            },
            "stock_fund_etf_lane": {
                "asset": "quality_etf",
                "amount": 50.0,
                "status": "READY_FOR_MANUAL_BUY",
            },
        },
        "warnings": [],
        "blocked_actions": [],
        "fallback_actions": [],
        "reserve_actions": [],
        "safety_checks": [],
    },
    "portfolio_mode": {"mode": "normal"},
    "etf_scoring_verdict": {"sleeves": []},
    "dynamic_context": {
        "regime": "neutral",
        "phase": None,
        "phase_label": None,
        "asset_targets_pct": {},
        "sleeve_targets_pct": {},
    },
    "weekly_dual_lane_mandate": {
        "crypto_lane": {"asset": "btc", "amount": 50.0, "status": "READY_FOR_MANUAL_BUY"},
        "stock_fund_etf_lane": {"asset": "quality_etf", "amount": 50.0, "status": "READY_FOR_MANUAL_BUY"},
    },
}

# ---------------------------------------------------------------------------
# Autouse fixtures
# ---------------------------------------------------------------------------


@pytest.fixture(autouse=True)
def isolated_db(tmp_path: Path, monkeypatch: pytest.MonkeyPatch):
    monkeypatch.setattr(database, "DB_PATH", tmp_path / "autopilot_test.db")
    database.init_db()


@pytest.fixture(autouse=True)
def patch_etf_resolver():
    with patch(
        "jarvis.api.routers.finance.resolve_best_etf_candidate_with_broker_check",
        return_value=_SAFE_RESOLUTION,
    ):
        yield


@pytest.fixture(autouse=True)
def patch_regime():
    with patch(
        "jarvis.api.routers.finance.detect_market_regime", return_value="risk_on"
    ):
        yield


# ---------------------------------------------------------------------------
# Optional fixtures
# ---------------------------------------------------------------------------


@pytest.fixture
def patch_alloc():
    with patch(
        "jarvis.api.routers.finance.engine.allocate_weekly_budget",
        return_value=_MOCK_ALLOC_RESULT,
    ):
        yield


@pytest.fixture
def mock_yf_success():
    """Mock yfinance to return a successful BTC price of 51000."""
    mock = MagicMock()
    mock_hist = MagicMock()
    mock_hist.empty = False
    mock_hist.__getitem__.return_value.iloc.__getitem__.return_value = 51000.0
    mock.Ticker.return_value.history.return_value = mock_hist
    with patch("jarvis.domains.finance.research_adapters.yf", mock):
        yield mock


@pytest.fixture
def mock_yf_fail():
    """Mock yfinance to raise on fetch."""
    mock = MagicMock()
    mock.Ticker.return_value.history.side_effect = ConnectionError("network error")
    with patch("jarvis.domains.finance.research_adapters.yf", mock):
        yield mock


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------


def _create_btc_memo(status: str = "draft") -> int:
    return database.create_research_memo({
        "asset": "btc",
        "sleeve": None,
        "title": "BTC test memo",
        "thesis": "Test thesis for BTC.",
        "risks": ["Volatility"],
        "data_confidence": "LOW",
        "verdict": "INSUFFICIENT_DATA",
        "sources": [],
        "validation": {},
        "status": status,
        "notes": "Test.",
    })


def _create_etf_memo(status: str = "draft") -> int:
    return database.create_research_memo({
        "asset": "quality_etf",
        "sleeve": "quality_etf",
        "title": "Quality ETF test memo",
        "thesis": "Test thesis for quality_etf.",
        "risks": ["Market risk"],
        "data_confidence": "LOW",
        "verdict": "INSUFFICIENT_DATA",
        "sources": [],
        "validation": {},
        "status": status,
        "notes": "Test.",
    })


# ---------------------------------------------------------------------------
# Tests — memo autopilot endpoint
# ---------------------------------------------------------------------------


def test_memo_autopilot_runs_all_steps_in_order(mock_yf_fail):
    """POST /research/memos/{id}/autopilot returns all five step keys."""
    memo_id = _create_btc_memo()
    response = client.post(f"/finance/research/memos/{memo_id}/autopilot")
    assert response.status_code == 200
    data = response.json()
    assert "evidence_result" in data
    assert "source_adapter_results" in data
    assert "synthesis_result" in data
    assert "quality_gate_result" in data
    assert "final_memo" in data
    assert data["memo_id"] == memo_id


def test_memo_autopilot_404_for_missing_memo():
    response = client.post("/finance/research/memos/9999/autopilot")
    assert response.status_code == 404


def test_memo_autopilot_response_has_all_safety_flags(mock_yf_fail):
    memo_id = _create_btc_memo()
    data = client.post(f"/finance/research/memos/{memo_id}/autopilot").json()
    assert data["research_only"] is True
    assert data["autopilot_only"] is True
    assert data["investment_approval"] is False
    assert data["trades_executed"] is False
    assert data["broker_connection"] is False
    assert data["portfolio_state_updated"] is False
    assert data["recommendation_overridden"] is False


def test_autopilot_never_sets_buy_candidate(mock_yf_fail):
    """Autopilot must never write BUY_CANDIDATE to verdict."""
    memo_id = _create_btc_memo()
    data = client.post(f"/finance/research/memos/{memo_id}/autopilot").json()
    final_memo = data["final_memo"]
    assert final_memo["verdict"] != "BUY_CANDIDATE"
    assert data["synthesis_result"]["buy_candidate_auto_assigned"] is False
    assert data["synthesis_result"]["investment_approval"] is False


def test_autopilot_does_not_mutate_portfolio_state(mock_yf_fail):
    """portfolio_state_updated must be False — autopilot never writes portfolio_state.json."""
    memo_id = _create_btc_memo()
    data = client.post(f"/finance/research/memos/{memo_id}/autopilot").json()
    assert data["portfolio_state_updated"] is False


def test_autopilot_does_not_create_ledger_entries(mock_yf_fail):
    """Running autopilot must not add rows to the finance transaction ledger."""
    memo_id = _create_btc_memo()
    before = database.get_finance_transactions(limit=200)
    client.post(f"/finance/research/memos/{memo_id}/autopilot")
    after = database.get_finance_transactions(limit=200)
    assert len(before) == len(after)


# ---------------------------------------------------------------------------
# Tests — crypto price adapter
# ---------------------------------------------------------------------------


def test_btc_price_adapter_pass_when_fetch_succeeds(mock_yf_success):
    """When yfinance returns a price, market_data_source record becomes PASS."""
    memo_id = _create_btc_memo()
    data = client.post(f"/finance/research/memos/{memo_id}/autopilot").json()
    adapter_results = data["source_adapter_results"]
    assert len(adapter_results) == 1
    result = adapter_results[0]
    assert result["adapter"] == "crypto_price_adapter_v1"
    assert result["record_status"] == "PASS"
    assert result["fetch_status"] == "success"
    assert result["price_usd"] == pytest.approx(51000.0)


def test_btc_price_adapter_unverified_when_fetch_fails(mock_yf_fail):
    """When yfinance raises, market_data_source record stays UNVERIFIED."""
    memo_id = _create_btc_memo()
    data = client.post(f"/finance/research/memos/{memo_id}/autopilot").json()
    adapter_results = data["source_adapter_results"]
    assert len(adapter_results) == 1
    result = adapter_results[0]
    assert result["adapter"] == "crypto_price_adapter_v1"
    assert result["record_status"] == "UNVERIFIED"
    assert result["price_usd"] is None


def test_btc_price_adapter_does_not_duplicate_market_data_source_record(mock_yf_success):
    """Running autopilot twice must not create a second market_data_source record."""
    memo_id = _create_btc_memo()
    client.post(f"/finance/research/memos/{memo_id}/autopilot")
    client.post(f"/finance/research/memos/{memo_id}/autopilot")
    records = database.list_research_validation_records_by_memo_id(memo_id)
    mds_records = [r for r in records if r["field_name"] == "market_data_source"]
    assert len(mds_records) == 1


def test_btc_price_adapter_repairs_unverified_to_pass(mock_yf_fail):
    """First run creates UNVERIFIED; second run with success updates it to PASS."""
    memo_id = _create_btc_memo()
    # First run: fail → UNVERIFIED
    client.post(f"/finance/research/memos/{memo_id}/autopilot")
    # Second run: success → PASS (patch yf to succeed this time)
    success_mock = MagicMock()
    mock_hist = MagicMock()
    mock_hist.empty = False
    mock_hist.__getitem__.return_value.iloc.__getitem__.return_value = 52000.0
    success_mock.Ticker.return_value.history.return_value = mock_hist
    with patch("jarvis.domains.finance.research_adapters.yf", success_mock):
        data = client.post(f"/finance/research/memos/{memo_id}/autopilot").json()

    adapter_result = data["source_adapter_results"][0]
    assert adapter_result["record_status"] == "PASS"
    # Still only one market_data_source record
    records = database.list_research_validation_records_by_memo_id(memo_id)
    mds_records = [r for r in records if r["field_name"] == "market_data_source"]
    assert len(mds_records) == 1


# ---------------------------------------------------------------------------
# Tests — ETF source adapter
# ---------------------------------------------------------------------------


def test_etf_adapter_creates_market_data_source_and_broker_source():
    """ETF autopilot source_adapter_results must contain both market and broker checks."""
    memo_id = _create_etf_memo()
    data = client.post(f"/finance/research/memos/{memo_id}/autopilot").json()
    adapter_results = data["source_adapter_results"]
    checks = [r["check"] for r in adapter_results]
    assert "market_data_source" in checks
    assert "broker_source" in checks
    for result in adapter_results:
        assert result["adapter"] == "etf_source_adapter_v1"


def test_etf_adapter_does_not_duplicate_records():
    """Running ETF autopilot twice must not create extra records."""
    memo_id = _create_etf_memo()
    client.post(f"/finance/research/memos/{memo_id}/autopilot")
    client.post(f"/finance/research/memos/{memo_id}/autopilot")
    records = database.list_research_validation_records_by_memo_id(memo_id)
    mds_records = [r for r in records if r["field_name"] == "market_data_source"]
    bs_records = [r for r in records if r["field_name"] == "broker_source"]
    assert len(mds_records) == 1
    assert len(bs_records) == 1


def _resolved_etf(symbol: str) -> dict:
    candidate = {
        "symbol": symbol,
        "label": "Current selected quality ETF",
        "market_data_source": "yfinance",
        "fetch_status": "ok",
        "raw_price": 75.0,
        "currency": "EUR",
        "eur_price": 75.0,
        "lightyear_available": True,
        "lightyear_confidence": "high",
        "broker_source": "lightyear_public_fund_screener",
    }
    return {
        "selected_candidate": candidate,
        "candidates": [candidate],
        "source": "yfinance",
        "broker_source": "lightyear_public_fund_screener",
        "broker_verification": "verified",
        "confirmation_required": True,
        "confidence": "high",
        "reason": "fixture",
    }


def test_etf_adapter_binds_pass_evidence_to_current_selected_instrument():
    memo_id = _create_etf_memo()
    with patch(
        "jarvis.api.routers.finance.resolve_best_etf_candidate_with_broker_check",
        return_value=_resolved_etf("IS3Q.DE"),
    ):
        client.post(f"/finance/research/memos/{memo_id}/autopilot")

    records = database.list_research_validation_records_by_memo_id(memo_id)
    market = next(record for record in records if record["field_name"] == "market_data_source")
    broker = next(record for record in records if record["field_name"] == "broker_source")
    assert market["status"] == "PASS"
    assert market["raw_json"]["ticker"] == "IS3Q.DE"
    assert market["raw_json"]["fetch_status"] == "ok"
    assert broker["status"] == "PASS"
    assert broker["raw_json"]["ticker"] == "IS3Q.DE"
    assert broker["raw_json"]["fetch_status"] == "verified"


def test_etf_adapter_refresh_replaces_stale_generated_instrument_evidence():
    memo_id = _create_etf_memo()
    with patch(
        "jarvis.api.routers.finance.resolve_best_etf_candidate_with_broker_check",
        return_value=_resolved_etf("IWQU.L"),
    ):
        client.post(f"/finance/research/memos/{memo_id}/autopilot")
    with patch(
        "jarvis.api.routers.finance.resolve_best_etf_candidate_with_broker_check",
        return_value=_resolved_etf("IS3Q.DE"),
    ):
        client.post(f"/finance/research/memos/{memo_id}/autopilot")

    records = database.list_research_validation_records_by_memo_id(memo_id)
    market_records = [record for record in records if record["field_name"] == "market_data_source"]
    assert len(market_records) == 1
    assert market_records[0]["raw_json"]["ticker"] == "IS3Q.DE"


# ---------------------------------------------------------------------------
# Tests — finance autopilot run endpoint
# ---------------------------------------------------------------------------


def test_finance_autopilot_creates_draft_memo_for_new_leg(patch_alloc, mock_yf_fail):
    """Finance autopilot creates a draft memo when none exists for a leg."""
    assert database.find_active_or_latest_research_memo_for_asset("btc") is None
    response = client.post("/finance/research/autopilot/run")
    assert response.status_code == 200
    data = response.json()
    assert data["total_legs"] > 0
    btc_leg = next((l for l in data["legs"] if l["asset"] == "btc"), None)
    assert btc_leg is not None
    assert btc_leg["memo_id"] is not None
    assert database.get_research_memo(btc_leg["memo_id"]) is not None


def test_finance_autopilot_reuses_existing_memo(patch_alloc, mock_yf_fail):
    """Finance autopilot must not create a second memo if one already exists."""
    existing_id = _create_btc_memo()
    data = client.post("/finance/research/autopilot/run").json()
    btc_leg = next((l for l in data["legs"] if l["asset"] == "btc"), None)
    assert btc_leg is not None
    assert btc_leg["memo_id"] == existing_id


def test_finance_autopilot_response_has_all_safety_flags(patch_alloc, mock_yf_fail):
    data = client.post("/finance/research/autopilot/run").json()
    assert data["research_only"] is True
    assert data["autopilot_only"] is True
    assert data["investment_approval"] is False
    assert data["trades_executed"] is False
    assert data["broker_connection"] is False
    assert data["portfolio_state_updated"] is False
    assert data["recommendation_overridden"] is False


def test_finance_autopilot_never_sets_buy_candidate(patch_alloc, mock_yf_fail):
    data = client.post("/finance/research/autopilot/run").json()
    for leg in data["legs"]:
        assert leg.get("synthesis_verdict") != "BUY_CANDIDATE"


def test_finance_autopilot_does_not_change_recommendation_amounts(patch_alloc, mock_yf_fail):
    """Amounts and routes must be identical before and after autopilot."""
    rec_before = client.get("/finance/recommendation").json()
    amounts_before = {r["asset"]: r["amount"] for r in rec_before["recommendations"]}
    routes_before = {r["asset"]: r["route"] for r in rec_before["recommendations"]}

    client.post("/finance/research/autopilot/run")

    rec_after = client.get("/finance/recommendation").json()
    amounts_after = {r["asset"]: r["amount"] for r in rec_after["recommendations"]}
    routes_after = {r["asset"]: r["route"] for r in rec_after["recommendations"]}

    assert amounts_before == amounts_after
    assert routes_before == routes_after


def test_finance_autopilot_does_not_create_ledger_entries(patch_alloc, mock_yf_fail):
    before = database.get_finance_transactions(limit=200)
    client.post("/finance/research/autopilot/run")
    after = database.get_finance_transactions(limit=200)
    assert len(before) == len(after)


def test_finance_autopilot_per_leg_structure(patch_alloc, mock_yf_fail):
    """Each leg result must contain the required fields."""
    data = client.post("/finance/research/autopilot/run").json()
    required_fields = {
        "asset", "amount", "route", "memo_id",
        "synthesis_verdict", "data_confidence",
        "research_quality_status", "research_quality_reason",
        "validated_for_context", "autopilot_detail",
    }
    for leg in data["legs"]:
        assert required_fields.issubset(leg.keys())


# ---------------------------------------------------------------------------
# Tests — VALIDATED-only enforcement
# ---------------------------------------------------------------------------


def test_validated_only_research_attachment_still_enforced(patch_alloc, mock_yf_fail):
    """After autopilot on a BTC memo that cannot reach VALIDATED, research_context
    must not attach the memo (VALIDATED-only rule must hold)."""
    _create_btc_memo()
    # Run autopilot — BTC with UNVERIFIED yfinance stays NEEDS_MORE_EVIDENCE
    client.post("/finance/research/autopilot/run")

    rec = client.get("/finance/recommendation").json()
    btc_context = next(
        (l for l in rec.get("research_context", []) if l.get("asset") == "btc"),
        None,
    )
    # memo_id must be None because quality gate is not VALIDATED
    if btc_context is not None:
        btc_memo = database.find_active_or_latest_research_memo_for_asset("btc")
        if btc_memo and btc_memo.get("research_quality_status") != "VALIDATED":
            assert btc_context["memo_id"] is None


# ---------------------------------------------------------------------------
# Tests — recommendation autopilot hint
# ---------------------------------------------------------------------------


def test_recommendation_response_has_autopilot_hint(patch_alloc):
    """GET /finance/recommendation must include autopilot_available and hint."""
    data = client.get("/finance/recommendation").json()
    assert data["autopilot_available"] is True
    assert "research_autopilot_hint" in data
    assert "autopilot/run" in data["research_autopilot_hint"]
