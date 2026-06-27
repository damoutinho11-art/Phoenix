"""Tests for PHOENIX Autonomous Memo Synthesis from Evidence v1.

Synthesis rules verified:
  E. No records → INSUFFICIENT_DATA / LOW.
  A. Any FAIL → REJECT / MEDIUM.
  B. Any WARNING → INSUFFICIENT_DATA / LOW.
  B. Any UNVERIFIED → INSUFFICIENT_DATA / LOW.
  C. Fewer than 2 PASS → INSUFFICIENT_DATA / LOW.
  D. ≥2 PASS, 0 FAIL, 0 WARNING, 0 UNVERIFIED → WATCH / MEDIUM or HIGH.
  D. Never auto-assigns BUY_CANDIDATE.
  Safety: no portfolio_state mutation.
  Safety: no recommendation amount/route change.
  Safety flags always present.
  Quality gate separation: not run by default.
  Quality gate: run_quality_gate_after=true triggers existing gate.
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
    monkeypatch.setattr(database, "DB_PATH", tmp_path / "synthesize_test.db")
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
    verdict: str = "INSUFFICIENT_DATA",
    data_confidence: str = "LOW",
    status: str = "draft",
    thesis: str = "Initial draft thesis.",
    risks: list | None = None,
) -> int:
    return database.create_research_memo({
        "asset": asset,
        "sleeve": None,
        "title": f"{asset} test memo",
        "thesis": thesis,
        "risks": risks if risks is not None else ["Draft risk"],
        "data_confidence": data_confidence,
        "verdict": verdict,
        "sources": [],
        "validation": {},
        "status": status,
        "notes": None,
    })


def _add_record(memo_id: int, status: str, confidence: str = "high") -> None:
    database.create_research_validation_record({
        "memo_id": memo_id,
        "asset": None,
        "check_type": "SOURCE_CONFIDENCE",
        "field_name": f"test_field_{status}_{confidence}",
        "source_primary": "PHOENIX test",
        "source_secondary": None,
        "primary_value": "value",
        "secondary_value": None,
        "consensus_value": "value",
        "tolerance_pct": None,
        "deviation_pct": None,
        "status": status,
        "confidence": confidence,
        "notes": None,
        "raw_json": {},
    })


def _synthesize(memo_id: int, run_gate: bool = False) -> dict:
    response = client.post(
        f"/finance/research/memos/{memo_id}/synthesize-from-evidence",
        json={"run_quality_gate_after": run_gate},
    )
    assert response.status_code == 200
    return response.json()


# ---------------------------------------------------------------------------
# Rule E: no records
# ---------------------------------------------------------------------------

def test_no_records_produces_insufficient_data() -> None:
    memo_id = _create_memo()
    data = _synthesize(memo_id)

    assert data["synthesis_result"]["verdict"] == "INSUFFICIENT_DATA"
    assert data["synthesis_result"]["data_confidence"] == "LOW"
    assert data["synthesis_result"]["rule_applied"] == "E"


def test_no_records_memo_fields_updated() -> None:
    memo_id = _create_memo()
    _synthesize(memo_id)

    memo = database.get_research_memo(memo_id)
    assert memo["verdict"] == "INSUFFICIENT_DATA"
    assert memo["data_confidence"] == "LOW"


# ---------------------------------------------------------------------------
# Rule A: any FAIL → REJECT / MEDIUM
# ---------------------------------------------------------------------------

def test_any_fail_produces_reject() -> None:
    memo_id = _create_memo()
    _add_record(memo_id, "PASS")
    _add_record(memo_id, "FAIL")

    data = _synthesize(memo_id)

    assert data["synthesis_result"]["verdict"] == "REJECT"
    assert data["synthesis_result"]["data_confidence"] == "MEDIUM"
    assert data["synthesis_result"]["rule_applied"] == "A"


def test_fail_memo_fields_updated_to_reject() -> None:
    memo_id = _create_memo()
    _add_record(memo_id, "FAIL")
    _synthesize(memo_id)

    memo = database.get_research_memo(memo_id)
    assert memo["verdict"] == "REJECT"


# ---------------------------------------------------------------------------
# Rule B: any WARNING → INSUFFICIENT_DATA / LOW
# ---------------------------------------------------------------------------

def test_any_warning_produces_insufficient_data() -> None:
    memo_id = _create_memo()
    _add_record(memo_id, "PASS")
    _add_record(memo_id, "PASS")
    _add_record(memo_id, "WARNING")

    data = _synthesize(memo_id)

    assert data["synthesis_result"]["verdict"] == "INSUFFICIENT_DATA"
    assert data["synthesis_result"]["data_confidence"] == "LOW"
    assert data["synthesis_result"]["rule_applied"] == "B"


def test_any_unverified_produces_insufficient_data() -> None:
    memo_id = _create_memo()
    _add_record(memo_id, "PASS")
    _add_record(memo_id, "PASS")
    _add_record(memo_id, "UNVERIFIED")

    data = _synthesize(memo_id)

    assert data["synthesis_result"]["verdict"] == "INSUFFICIENT_DATA"
    assert data["synthesis_result"]["data_confidence"] == "LOW"
    assert data["synthesis_result"]["rule_applied"] == "B"


# ---------------------------------------------------------------------------
# Rule C: fewer than 2 PASS
# ---------------------------------------------------------------------------

def test_one_pass_produces_insufficient_data() -> None:
    memo_id = _create_memo()
    _add_record(memo_id, "PASS")

    data = _synthesize(memo_id)

    assert data["synthesis_result"]["verdict"] == "INSUFFICIENT_DATA"
    assert data["synthesis_result"]["data_confidence"] == "LOW"
    assert data["synthesis_result"]["rule_applied"] == "C"


def test_zero_pass_produces_insufficient_data() -> None:
    memo_id = _create_memo()

    data = _synthesize(memo_id)

    assert data["synthesis_result"]["verdict"] == "INSUFFICIENT_DATA"


# ---------------------------------------------------------------------------
# Rule D: ≥2 PASS, 0 FAIL, 0 WARNING, 0 UNVERIFIED → WATCH
# ---------------------------------------------------------------------------

def test_two_pass_clean_produces_watch() -> None:
    memo_id = _create_memo()
    _add_record(memo_id, "PASS", confidence="high")
    _add_record(memo_id, "PASS", confidence="high")

    data = _synthesize(memo_id)

    assert data["synthesis_result"]["verdict"] == "WATCH"
    assert data["synthesis_result"]["rule_applied"] == "D"


def test_all_high_confidence_pass_produces_high_data_confidence() -> None:
    memo_id = _create_memo()
    _add_record(memo_id, "PASS", confidence="high")
    _add_record(memo_id, "PASS", confidence="high")

    data = _synthesize(memo_id)

    assert data["synthesis_result"]["data_confidence"] == "HIGH"


def test_mixed_confidence_pass_produces_medium_data_confidence() -> None:
    memo_id = _create_memo()
    _add_record(memo_id, "PASS", confidence="high")
    _add_record(memo_id, "PASS", confidence="medium")

    data = _synthesize(memo_id)

    assert data["synthesis_result"]["data_confidence"] == "MEDIUM"


def test_watch_memo_fields_updated() -> None:
    memo_id = _create_memo()
    _add_record(memo_id, "PASS", confidence="high")
    _add_record(memo_id, "PASS", confidence="high")
    _synthesize(memo_id)

    memo = database.get_research_memo(memo_id)
    assert memo["verdict"] == "WATCH"
    assert memo["data_confidence"] == "HIGH"


# ---------------------------------------------------------------------------
# Rule D: never auto-assigns BUY_CANDIDATE
# ---------------------------------------------------------------------------

def test_synthesis_never_sets_buy_candidate() -> None:
    memo_id = _create_memo()
    for _ in range(5):
        _add_record(memo_id, "PASS", confidence="high")

    data = _synthesize(memo_id)

    assert data["synthesis_result"]["verdict"] != "BUY_CANDIDATE"
    assert data["synthesis_result"]["buy_candidate_auto_assigned"] is False
    memo = database.get_research_memo(memo_id)
    assert memo["verdict"] != "BUY_CANDIDATE"


# ---------------------------------------------------------------------------
# Thesis and risks updated
# ---------------------------------------------------------------------------

def test_thesis_updated_after_synthesis() -> None:
    memo_id = _create_memo(thesis="Original draft thesis — will be replaced.")
    _synthesize(memo_id)

    memo = database.get_research_memo(memo_id)
    assert "PHOENIX Autonomous Synthesis" in memo["thesis"]
    assert "Original draft thesis" not in memo["thesis"]


def test_thesis_mentions_evidence_counts() -> None:
    memo_id = _create_memo()
    _add_record(memo_id, "PASS")
    _add_record(memo_id, "PASS")
    _synthesize(memo_id)

    memo = database.get_research_memo(memo_id)
    assert "PASS" in memo["thesis"]
    assert "2" in memo["thesis"]


def test_thesis_mentions_source_limitation() -> None:
    memo_id = _create_memo()
    _synthesize(memo_id)

    memo = database.get_research_memo(memo_id)
    assert "local PHOENIX data only" in memo["thesis"].lower() or "local phoenix" in memo["thesis"].lower()


def test_risks_updated_after_synthesis() -> None:
    memo_id = _create_memo(risks=["Old risk that should be replaced"])
    _add_record(memo_id, "FAIL")
    _synthesize(memo_id)

    memo = database.get_research_memo(memo_id)
    assert isinstance(memo["risks"], list)
    assert len(memo["risks"]) > 0
    assert "Old risk that should be replaced" not in memo["risks"]


# ---------------------------------------------------------------------------
# Response shape
# ---------------------------------------------------------------------------

def test_response_contains_synthesis_result_and_memo() -> None:
    memo_id = _create_memo()
    data = _synthesize(memo_id)

    assert "synthesis_result" in data
    assert "memo" in data
    assert data["memo"]["id"] == memo_id


def test_synthesis_result_has_required_fields() -> None:
    memo_id = _create_memo()
    data = _synthesize(memo_id)
    sr = data["synthesis_result"]

    for field in ("rule_applied", "rule_reason", "evidence_counts", "verdict",
                  "data_confidence", "source_limitation", "buy_candidate_auto_assigned",
                  "synthesis_only", "investment_approval"):
        assert field in sr, f"Missing field: {field}"


def test_evidence_counts_in_synthesis_result() -> None:
    memo_id = _create_memo()
    _add_record(memo_id, "PASS")
    _add_record(memo_id, "WARNING")
    data = _synthesize(memo_id)

    counts = data["synthesis_result"]["evidence_counts"]
    assert counts["pass"] == 1
    assert counts["warning"] == 1
    assert counts["fail"] == 0
    assert counts["unverified"] == 0
    assert counts["total"] == 2


# ---------------------------------------------------------------------------
# Safety flags
# ---------------------------------------------------------------------------

def test_safety_flags_present() -> None:
    memo_id = _create_memo()
    data = _synthesize(memo_id)

    assert data["research_only"] is True
    assert data["synthesis_only"] is True
    assert data["investment_approval"] is False
    assert data["trades_executed"] is False
    assert data["broker_connection"] is False
    assert data["portfolio_state_updated"] is False
    assert data["recommendation_overridden"] is False


# ---------------------------------------------------------------------------
# Portfolio state invariant
# ---------------------------------------------------------------------------

def test_synthesis_does_not_mutate_portfolio_state() -> None:
    portfolio_path = engine.DEFAULT_PORTFOLIO_STATE_PATH
    before = portfolio_path.read_bytes()

    memo_id = _create_memo()
    _add_record(memo_id, "PASS")
    _add_record(memo_id, "PASS")
    _synthesize(memo_id)

    assert portfolio_path.read_bytes() == before


# ---------------------------------------------------------------------------
# Recommendation invariant
# ---------------------------------------------------------------------------

def _get_rec_amounts_and_routes() -> tuple[dict, dict]:
    data = client.get("/finance/recommendation").json()
    amounts = {r["asset"]: r["amount"] for r in data["recommendations"]}
    routes = {r["asset"]: r["route"] for r in data["recommendations"]}
    return amounts, routes


def test_synthesis_does_not_change_recommendation_amounts() -> None:
    amounts_before, routes_before = _get_rec_amounts_and_routes()

    memo_id = _create_memo(asset="btc")
    _add_record(memo_id, "PASS")
    _add_record(memo_id, "PASS")
    _synthesize(memo_id)

    amounts_after, routes_after = _get_rec_amounts_and_routes()
    assert amounts_after == amounts_before
    assert routes_after == routes_before


# ---------------------------------------------------------------------------
# Missing memo → 404
# ---------------------------------------------------------------------------

def test_missing_memo_returns_404() -> None:
    response = client.post(
        "/finance/research/memos/999999/synthesize-from-evidence",
        json={},
    )
    assert response.status_code == 404


# ---------------------------------------------------------------------------
# Quality gate separation
# ---------------------------------------------------------------------------

def test_quality_gate_not_run_by_default() -> None:
    memo_id = _create_memo()
    data = _synthesize(memo_id, run_gate=False)

    assert "quality_gate_result" not in data


def test_run_quality_gate_after_false_no_gate_result() -> None:
    memo_id = _create_memo()
    response = client.post(
        f"/finance/research/memos/{memo_id}/synthesize-from-evidence",
        json={},
    )
    assert "quality_gate_result" not in response.json()


def test_run_quality_gate_after_true_includes_gate_result() -> None:
    memo_id = _create_memo()
    _add_record(memo_id, "PASS")
    _add_record(memo_id, "PASS")

    data = _synthesize(memo_id, run_gate=True)

    assert "quality_gate_result" in data
    gate = data["quality_gate_result"]
    assert gate["memo_id"] == memo_id
    assert "quality_status" in gate
    assert gate["gate_applied"] is True


def test_gate_result_separated_from_synthesis_result() -> None:
    memo_id = _create_memo()
    _add_record(memo_id, "PASS")
    _add_record(memo_id, "PASS")
    data = _synthesize(memo_id, run_gate=True)

    # quality_gate_result fields must not bleed into top level
    assert "quality_status" not in data
    assert "gate_applied" not in data
    # synthesis_result must still be present alongside gate
    assert "synthesis_result" in data


# ---------------------------------------------------------------------------
# Lifecycle status not changed by synthesis
# ---------------------------------------------------------------------------

def test_synthesis_does_not_change_memo_lifecycle_status() -> None:
    memo_id = _create_memo(status="draft")
    _add_record(memo_id, "PASS")
    _add_record(memo_id, "PASS")
    _synthesize(memo_id)

    memo = database.get_research_memo(memo_id)
    assert memo["status"] == "draft"


def test_synthesis_does_not_change_active_memo_to_draft() -> None:
    memo_id = _create_memo(status="active", verdict="WATCH", data_confidence="MEDIUM")
    _add_record(memo_id, "PASS")
    _add_record(memo_id, "PASS")
    _synthesize(memo_id)

    memo = database.get_research_memo(memo_id)
    assert memo["status"] == "active"
