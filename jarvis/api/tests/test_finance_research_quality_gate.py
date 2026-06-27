"""Tests for the PHOENIX Autonomous Research Quality Gate v1.

Gate rules verified:
  1. No validation records → NEEDS_MORE_EVIDENCE, status stays draft.
  2. One PASS record → NEEDS_MORE_EVIDENCE (fewer than 2).
  3. Two PASS + acceptable verdict/confidence/thesis/risks → VALIDATED, status active.
  4. Any FAIL → REJECTED, status stays draft.
  5. Any WARNING → NEEDS_MORE_EVIDENCE.
  6. Any UNVERIFIED → NEEDS_MORE_EVIDENCE.
  7. LOW confidence → NEEDS_MORE_EVIDENCE.
  8. INSUFFICIENT_DATA verdict → NEEDS_MORE_EVIDENCE.
  9. Archived memo → gate not applied, gate_applied=False.
 10. Recommendation context attaches VALIDATED active memo only.
 11. Recommendation context does NOT attach draft/UNREVIEWED memo.
 12. Recommendation context does NOT attach active-but-UNREVIEWED legacy memo.
 13. Quality gate does not mutate portfolio_state.json.
 14. Quality gate does not change recommendation amount/route.
 15. Safety flags present.
 16. Batch run evaluates all non-archived memos.
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
    monkeypatch.setattr(database, "DB_PATH", tmp_path / "quality_gate_test.db")
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
# Helpers
# ---------------------------------------------------------------------------

def _create_memo(
    asset: str = "btc",
    verdict: str = "WATCH",
    data_confidence: str = "MEDIUM",
    status: str = "draft",
    thesis: str = "A proper research thesis.",
    risks: list | None = None,
) -> int:
    return database.create_research_memo({
        "asset": asset,
        "sleeve": None,
        "title": f"{asset} research memo",
        "thesis": thesis,
        "risks": risks if risks is not None else ["Risk one", "Risk two"],
        "data_confidence": data_confidence,
        "verdict": verdict,
        "sources": [],
        "validation": {},
        "status": status,
        "notes": None,
    })


def _add_record(memo_id: int, status: str) -> None:
    database.create_research_validation_record({
        "memo_id": memo_id,
        "asset": None,
        "check_type": "CROSS_SOURCE",
        "field_name": "price",
        "source_primary": "src_a",
        "source_secondary": "src_b",
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


def _run_gate(memo_id: int) -> dict:
    response = client.post(f"/finance/research/memos/{memo_id}/quality-gate")
    assert response.status_code == 200
    return response.json()


# ---------------------------------------------------------------------------
# Gate rules
# ---------------------------------------------------------------------------

def test_no_records_produces_needs_more_evidence() -> None:
    memo_id = _create_memo()
    result = _run_gate(memo_id)

    assert result["quality_status"] == "NEEDS_MORE_EVIDENCE"
    assert result["gate_applied"] is True


def test_no_records_status_remains_draft() -> None:
    memo_id = _create_memo()
    _run_gate(memo_id)

    memo = database.get_research_memo(memo_id)
    assert memo["status"] == "draft"


def test_one_pass_record_produces_needs_more_evidence() -> None:
    memo_id = _create_memo()
    _add_record(memo_id, "PASS")

    result = _run_gate(memo_id)

    assert result["quality_status"] == "NEEDS_MORE_EVIDENCE"


def test_one_pass_record_status_remains_draft() -> None:
    memo_id = _create_memo()
    _add_record(memo_id, "PASS")
    _run_gate(memo_id)

    assert database.get_research_memo(memo_id)["status"] == "draft"


def test_two_pass_records_valid_memo_produces_validated() -> None:
    memo_id = _create_memo(verdict="WATCH", data_confidence="MEDIUM")
    _add_record(memo_id, "PASS")
    _add_record(memo_id, "PASS")

    result = _run_gate(memo_id)

    assert result["quality_status"] == "VALIDATED"
    assert result["gate_applied"] is True


def test_validated_memo_status_becomes_active() -> None:
    memo_id = _create_memo(verdict="WATCH", data_confidence="MEDIUM")
    _add_record(memo_id, "PASS")
    _add_record(memo_id, "PASS")
    _run_gate(memo_id)

    assert database.get_research_memo(memo_id)["status"] == "active"


def test_buy_candidate_verdict_two_pass_records_validated() -> None:
    memo_id = _create_memo(verdict="BUY_CANDIDATE", data_confidence="HIGH")
    _add_record(memo_id, "PASS")
    _add_record(memo_id, "PASS")

    result = _run_gate(memo_id)

    assert result["quality_status"] == "VALIDATED"


def test_any_fail_record_produces_rejected() -> None:
    memo_id = _create_memo()
    _add_record(memo_id, "PASS")
    _add_record(memo_id, "FAIL")

    result = _run_gate(memo_id)

    assert result["quality_status"] == "REJECTED"


def test_rejected_status_remains_draft() -> None:
    memo_id = _create_memo()
    _add_record(memo_id, "FAIL")
    _run_gate(memo_id)

    assert database.get_research_memo(memo_id)["status"] == "draft"


def test_any_warning_record_produces_needs_more_evidence() -> None:
    memo_id = _create_memo()
    _add_record(memo_id, "PASS")
    _add_record(memo_id, "WARNING")

    result = _run_gate(memo_id)

    assert result["quality_status"] == "NEEDS_MORE_EVIDENCE"


def test_any_unverified_record_produces_needs_more_evidence() -> None:
    memo_id = _create_memo()
    _add_record(memo_id, "PASS")
    _add_record(memo_id, "UNVERIFIED")

    result = _run_gate(memo_id)

    assert result["quality_status"] == "NEEDS_MORE_EVIDENCE"


def test_low_data_confidence_produces_needs_more_evidence() -> None:
    memo_id = _create_memo(data_confidence="LOW")
    _add_record(memo_id, "PASS")
    _add_record(memo_id, "PASS")

    result = _run_gate(memo_id)

    assert result["quality_status"] == "NEEDS_MORE_EVIDENCE"


def test_insufficient_data_verdict_produces_needs_more_evidence() -> None:
    memo_id = _create_memo(verdict="INSUFFICIENT_DATA")
    _add_record(memo_id, "PASS")
    _add_record(memo_id, "PASS")

    result = _run_gate(memo_id)

    assert result["quality_status"] == "NEEDS_MORE_EVIDENCE"


def test_archived_memo_gate_not_applied() -> None:
    memo_id = _create_memo(status="archived")
    _add_record(memo_id, "PASS")
    _add_record(memo_id, "PASS")

    result = _run_gate(memo_id)

    assert result["gate_applied"] is False


def test_archived_memo_status_unchanged() -> None:
    memo_id = _create_memo(status="archived")
    _run_gate(memo_id)

    assert database.get_research_memo(memo_id)["status"] == "archived"


def test_missing_thesis_produces_needs_more_evidence() -> None:
    memo_id = _create_memo(thesis="   ")
    _add_record(memo_id, "PASS")
    _add_record(memo_id, "PASS")

    result = _run_gate(memo_id)

    assert result["quality_status"] == "NEEDS_MORE_EVIDENCE"


def test_empty_risks_produces_needs_more_evidence() -> None:
    memo_id = _create_memo(risks=[])
    _add_record(memo_id, "PASS")
    _add_record(memo_id, "PASS")

    result = _run_gate(memo_id)

    assert result["quality_status"] == "NEEDS_MORE_EVIDENCE"


def test_missing_memo_returns_404() -> None:
    response = client.post("/finance/research/memos/999999/quality-gate")

    assert response.status_code == 404


# ---------------------------------------------------------------------------
# Safety flags
# ---------------------------------------------------------------------------

def test_quality_gate_safety_flags_present() -> None:
    memo_id = _create_memo()
    result = _run_gate(memo_id)

    assert result["research_only"] is True
    assert result["quality_gate_only"] is True
    assert result["investment_approval"] is False
    assert result["trades_executed"] is False
    assert result["broker_connection"] is False
    assert result["portfolio_state_updated"] is False
    assert result["recommendation_overridden"] is False


# ---------------------------------------------------------------------------
# Portfolio state invariant
# ---------------------------------------------------------------------------

def test_quality_gate_does_not_mutate_portfolio_state() -> None:
    portfolio_path = engine.DEFAULT_PORTFOLIO_STATE_PATH
    before = portfolio_path.read_bytes()
    memo_id = _create_memo()
    _add_record(memo_id, "PASS")
    _add_record(memo_id, "PASS")

    _run_gate(memo_id)

    assert portfolio_path.read_bytes() == before


def test_batch_quality_gate_does_not_mutate_portfolio_state() -> None:
    portfolio_path = engine.DEFAULT_PORTFOLIO_STATE_PATH
    before = portfolio_path.read_bytes()
    for asset in ("btc", "quality_etf"):
        mid = _create_memo(asset=asset)
        _add_record(mid, "PASS")
        _add_record(mid, "PASS")

    client.post("/finance/research/quality-gate/run")

    assert portfolio_path.read_bytes() == before


# ---------------------------------------------------------------------------
# Recommendation invariant
# ---------------------------------------------------------------------------

def _get_rec_amounts_and_routes() -> tuple[dict, dict]:
    data = client.get("/finance/recommendation").json()
    amounts = {r["asset"]: r["amount"] for r in data["recommendations"]}
    routes = {r["asset"]: r["route"] for r in data["recommendations"]}
    return amounts, routes


def test_quality_gate_does_not_change_recommendation_amounts() -> None:
    amounts_before, routes_before = _get_rec_amounts_and_routes()
    memo_id = _create_memo(asset="btc", verdict="WATCH", data_confidence="MEDIUM")
    _add_record(memo_id, "PASS")
    _add_record(memo_id, "PASS")
    _run_gate(memo_id)

    amounts_after, routes_after = _get_rec_amounts_and_routes()

    assert amounts_after == amounts_before
    assert routes_after == routes_before


# ---------------------------------------------------------------------------
# Recommendation context — memo attachment rules
# ---------------------------------------------------------------------------

def test_validated_active_memo_attaches_to_recommendation_context() -> None:
    memo_id = _create_memo(asset="btc", verdict="WATCH", data_confidence="MEDIUM")
    _add_record(memo_id, "PASS")
    _add_record(memo_id, "PASS")
    _run_gate(memo_id)  # → VALIDATED, status=active

    data = client.get("/finance/recommendation").json()
    btc_leg = next(
        (leg for leg in data["research_context"] if leg["asset"] == "btc"), None
    )

    assert btc_leg is not None
    assert btc_leg["memo_id"] == memo_id
    assert btc_leg["evidence_status"] != "NO_EVIDENCE"


def test_draft_unreviewed_memo_does_not_attach_to_recommendation_context() -> None:
    _create_memo(asset="btc", status="draft")  # never run through quality gate

    data = client.get("/finance/recommendation").json()
    btc_leg = next(
        (leg for leg in data["research_context"] if leg["asset"] == "btc"), None
    )

    assert btc_leg is not None
    assert btc_leg["memo_id"] is None
    assert btc_leg["evidence_status"] == "NO_EVIDENCE"


def test_active_but_not_validated_legacy_memo_does_not_attach() -> None:
    # Manually create a memo with status=active but quality=UNREVIEWED
    # (legacy memo that predates the quality gate)
    memo_id = _create_memo(asset="btc", status="active")
    # Do NOT run quality gate — research_quality_status stays UNREVIEWED

    data = client.get("/finance/recommendation").json()
    btc_leg = next(
        (leg for leg in data["research_context"] if leg["asset"] == "btc"), None
    )

    assert btc_leg is not None
    assert btc_leg["memo_id"] is None
    assert btc_leg["evidence_status"] == "NO_EVIDENCE"


def test_needs_more_evidence_memo_does_not_attach() -> None:
    memo_id = _create_memo(asset="btc")
    _run_gate(memo_id)  # no records → NEEDS_MORE_EVIDENCE

    data = client.get("/finance/recommendation").json()
    btc_leg = next(
        (leg for leg in data["research_context"] if leg["asset"] == "btc"), None
    )

    assert btc_leg["memo_id"] is None


def test_rejected_memo_does_not_attach() -> None:
    memo_id = _create_memo(asset="btc")
    _add_record(memo_id, "FAIL")
    _run_gate(memo_id)  # → REJECTED

    data = client.get("/finance/recommendation").json()
    btc_leg = next(
        (leg for leg in data["research_context"] if leg["asset"] == "btc"), None
    )

    assert btc_leg["memo_id"] is None


# ---------------------------------------------------------------------------
# Batch endpoint
# ---------------------------------------------------------------------------

def test_batch_quality_gate_returns_results_for_all_non_archived_memos() -> None:
    ids = [_create_memo(asset=f"btc_{i}") for i in range(3)]
    archived_id = _create_memo(asset="hype", status="archived")

    response = client.post("/finance/research/quality-gate/run")

    assert response.status_code == 200
    data = response.json()
    assert data["total_evaluated"] == 3
    evaluated_ids = {r["memo_id"] for r in data["results"]}
    assert set(ids) == evaluated_ids
    assert archived_id not in evaluated_ids


def test_batch_quality_gate_safety_flags() -> None:
    response = client.post("/finance/research/quality-gate/run")
    data = response.json()

    assert data["research_only"] is True
    assert data["quality_gate_only"] is True
    assert data["trades_executed"] is False
    assert data["recommendation_overridden"] is False


def test_batch_validated_memo_becomes_active() -> None:
    memo_id = _create_memo(verdict="WATCH", data_confidence="MEDIUM")
    _add_record(memo_id, "PASS")
    _add_record(memo_id, "PASS")

    client.post("/finance/research/quality-gate/run")

    assert database.get_research_memo(memo_id)["status"] == "active"
    assert database.get_research_memo(memo_id)["research_quality_status"] == "VALIDATED"
