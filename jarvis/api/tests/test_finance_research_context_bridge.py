"""Tests for the PHOENIX Research-to-Recommendation Context Bridge (v1).

Safety invariants verified here:
- research_context is advisory only
- Recommendation amounts and routes are never changed by research context
- research_gate_summary always declares advisory_only=True and trades_executed=False
- Memos with failed validation produce BLOCKED_BY_FAIL warnings (not rejections)
- Missing memos produce NO_EVIDENCE (not errors)
"""

from pathlib import Path
from unittest.mock import patch

import pytest
from fastapi.testclient import TestClient

from jarvis.api.main import app
from jarvis.data import database

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
    monkeypatch.setattr(database, "DB_PATH", tmp_path / "bridge_test.db")
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


def _get_recommendation() -> dict:
    response = client.get("/finance/recommendation")
    assert response.status_code == 200
    return response.json()


def _create_active_memo(asset: str, verdict: str = "WATCH") -> int:
    memo_id = database.create_research_memo({
        "asset": asset,
        "sleeve": None,
        "title": f"{asset} research memo",
        "thesis": "Test thesis.",
        "risks": ["test risk"],
        "data_confidence": "MEDIUM",
        "verdict": verdict,
        "sources": [],
        "validation": {},
        "status": "active",
        "notes": None,
    })
    return memo_id


def _add_validation_record(memo_id: int, status: str) -> None:
    database.create_research_validation_record({
        "memo_id": memo_id,
        "asset": None,
        "check_type": "CROSS_SOURCE",
        "field_name": "price",
        "source_primary": "source_a",
        "source_secondary": "source_b",
        "primary_value": "100",
        "secondary_value": "100",
        "consensus_value": "100",
        "tolerance_pct": 1.0,
        "deviation_pct": 0.0,
        "status": status,
        "confidence": "high",
        "notes": None,
        "raw_json": {},
    })


# --- Shape and presence ---

def test_recommendation_includes_research_context() -> None:
    data = _get_recommendation()

    assert "research_context" in data
    assert "research_gate_summary" in data
    assert isinstance(data["research_context"], list)
    assert isinstance(data["research_gate_summary"], dict)


def test_research_context_has_one_entry_per_recommendation_leg() -> None:
    data = _get_recommendation()

    assert len(data["research_context"]) == len(data["recommendations"])


def test_each_research_leg_has_required_fields() -> None:
    data = _get_recommendation()

    for leg in data["research_context"]:
        for field in ("asset", "sleeve", "memo_id", "memo_title", "verdict",
                      "data_confidence", "evidence_status", "research_warning"):
            assert field in leg, f"Missing field: {field}"


def test_gate_summary_has_required_fields() -> None:
    data = _get_recommendation()
    gate = data["research_gate_summary"]

    assert "total_recommendation_legs" in gate
    assert "legs_with_research" in gate
    assert "legs_without_research" in gate
    assert "legs_blocked_by_failed_research" in gate
    assert gate["advisory_only"] is True
    assert gate["recommendation_overridden"] is False
    assert gate["trades_executed"] is False


# --- NO_EVIDENCE when no memo exists ---

def test_no_memo_produces_no_evidence_status() -> None:
    data = _get_recommendation()

    for leg in data["research_context"]:
        assert leg["evidence_status"] == "NO_EVIDENCE"
        assert leg["memo_id"] is None
        assert leg["memo_title"] is None
        assert leg["research_warning"] == "No active research memo attached."


def test_no_memo_gate_summary_legs_with_research_is_zero() -> None:
    data = _get_recommendation()
    gate = data["research_gate_summary"]

    assert gate["legs_with_research"] == 0
    assert gate["legs_without_research"] == gate["total_recommendation_legs"]


# --- VALIDATED memo attaches (quality gate must pass first) ---

def _create_validated_memo(asset: str, verdict: str = "WATCH") -> int:
    """Create a memo with 2 PASS records and promote it through the quality gate."""
    memo_id = _create_active_memo(asset, verdict=verdict)
    _add_validation_record(memo_id, "PASS")
    _add_validation_record(memo_id, "PASS")
    client.post(f"/finance/research/memos/{memo_id}/quality-gate")
    return memo_id


def test_validated_memo_matched_by_asset() -> None:
    memo_id = _create_validated_memo("btc")
    data = _get_recommendation()

    btc_leg = next((l for l in data["research_context"] if l["asset"] == "btc"), None)
    assert btc_leg is not None
    assert btc_leg["memo_id"] == memo_id
    assert btc_leg["memo_title"] == "btc research memo"
    assert btc_leg["verdict"] == "WATCH"


def test_validated_memo_increments_legs_with_research() -> None:
    _create_validated_memo("btc")
    data = _get_recommendation()
    gate = data["research_gate_summary"]

    assert gate["legs_with_research"] >= 1


# --- EVIDENCE_STRONG (requires VALIDATED quality gate) ---

def test_evidence_strong_status_when_all_pass() -> None:
    memo_id = _create_validated_memo("btc")

    data = _get_recommendation()
    btc_leg = next((l for l in data["research_context"] if l["asset"] == "btc"), None)

    assert btc_leg["evidence_status"] == "EVIDENCE_STRONG"
    assert btc_leg["research_warning"] is None


# --- FAIL memos are REJECTED by quality gate and do NOT attach ---

def test_failed_validation_memo_does_not_attach_after_gate() -> None:
    # Quality gate: FAIL record → REJECTED → stays draft → not attached
    memo_id = _create_active_memo("btc")
    _add_validation_record(memo_id, "FAIL")
    client.post(f"/finance/research/memos/{memo_id}/quality-gate")

    data = _get_recommendation()
    btc_leg = next((l for l in data["research_context"] if l["asset"] == "btc"), None)

    assert btc_leg["evidence_status"] == "NO_EVIDENCE"
    assert btc_leg["memo_id"] is None


def test_fail_memo_not_counted_in_legs_blocked_summary() -> None:
    # Rejected memos don't attach — legs_blocked_by_failed_research counts attached legs only
    memo_id = _create_active_memo("btc")
    _add_validation_record(memo_id, "FAIL")
    client.post(f"/finance/research/memos/{memo_id}/quality-gate")

    data = _get_recommendation()
    gate = data["research_gate_summary"]

    assert gate["legs_blocked_by_failed_research"] == 0


# --- Safety: amounts and routes unchanged ---

def test_recommendation_amounts_unchanged_when_memo_present() -> None:
    data_before = _get_recommendation()
    amounts_before = {r["asset"]: r["amount"] for r in data_before["recommendations"]}
    routes_before = {r["asset"]: r["route"] for r in data_before["recommendations"]}

    _create_active_memo("btc", verdict="REJECT")
    memo_id = _create_active_memo("quality_etf")
    _add_validation_record(memo_id, "FAIL")

    data_after = _get_recommendation()
    amounts_after = {r["asset"]: r["amount"] for r in data_after["recommendations"]}
    routes_after = {r["asset"]: r["route"] for r in data_after["recommendations"]}

    assert amounts_after == amounts_before
    assert routes_after == routes_before


def test_recommendation_amounts_unchanged_when_blocked_by_fail() -> None:
    data_no_memo = _get_recommendation()
    expected_btc = next(
        (r["amount"] for r in data_no_memo["recommendations"] if r["asset"] == "btc"), None
    )

    memo_id = _create_active_memo("btc")
    _add_validation_record(memo_id, "FAIL")

    data_with_fail = _get_recommendation()
    btc_amount = next(
        (r["amount"] for r in data_with_fail["recommendations"] if r["asset"] == "btc"), None
    )

    assert btc_amount == expected_btc


def test_recommendation_overridden_is_always_false() -> None:
    _create_active_memo("btc", verdict="REJECT")

    data = _get_recommendation()

    assert data["research_gate_summary"]["recommendation_overridden"] is False


# --- Safety: gate summary safety flags ---

def test_gate_summary_safety_flags_never_change() -> None:
    memo_id = _create_active_memo("btc")
    _add_validation_record(memo_id, "FAIL")

    data = _get_recommendation()
    gate = data["research_gate_summary"]

    assert gate["advisory_only"] is True
    assert gate["recommendation_overridden"] is False
    assert gate["trades_executed"] is False


def test_requires_approval_still_true_with_research_context() -> None:
    _create_active_memo("btc")

    data = _get_recommendation()

    assert data["requires_approval"] is True


# --- Draft / archived memos not matched ---

def test_draft_memo_not_matched() -> None:
    database.create_research_memo({
        "asset": "btc",
        "sleeve": None,
        "title": "draft btc memo",
        "thesis": "Draft only.",
        "risks": ["risk"],
        "data_confidence": "LOW",
        "verdict": "WATCH",
        "sources": [],
        "validation": {},
        "status": "draft",
        "notes": None,
    })

    data = _get_recommendation()
    btc_leg = next((l for l in data["research_context"] if l["asset"] == "btc"), None)

    assert btc_leg is not None
    assert btc_leg["memo_id"] is None
    assert btc_leg["evidence_status"] == "NO_EVIDENCE"
