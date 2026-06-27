"""Tests for the PHOENIX Autonomous Evidence Record Generator v1.

Invariants verified:
 1. Generate evidence creates validation records.
 2. Generated records are linked to memo_id.
 3. Duplicate generation skips existing records.
 4. Missing memo returns 404.
 5. Generated evidence uses only local recommendation/source metadata.
 6. No portfolio_state.json mutation.
 7. No recommendation amount/route mutation.
 8. Safety flags present.
 9. Quality gate not run by default (no quality_gate_result key).
10. run_quality_gate_after=false does not run quality gate.
11. run_quality_gate_after=true runs gate after evidence generation.
12. Crypto asset market_data_source is UNVERIFIED.
13. ETF asset market_data_source is PASS.
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
    monkeypatch.setattr(database, "DB_PATH", tmp_path / "generate_evidence_test.db")
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
    thesis: str = "A valid research thesis.",
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


def _generate(memo_id: int, run_gate: bool = False) -> dict:
    response = client.post(
        f"/finance/research/memos/{memo_id}/generate-evidence",
        json={"run_quality_gate_after": run_gate},
    )
    assert response.status_code == 200
    return response.json()


# ---------------------------------------------------------------------------
# 1. Creates records
# ---------------------------------------------------------------------------

def test_generate_evidence_creates_records() -> None:
    memo_id = _create_memo()
    data = _generate(memo_id)

    assert data["generated_count"] > 0
    assert isinstance(data["records"], list)
    assert len(data["records"]) == data["generated_count"]


# ---------------------------------------------------------------------------
# 2. Records linked to memo_id
# ---------------------------------------------------------------------------

def test_generated_records_linked_to_memo_id() -> None:
    memo_id = _create_memo()
    data = _generate(memo_id)

    for record in data["records"]:
        assert record["memo_id"] == memo_id


# ---------------------------------------------------------------------------
# 3. Duplicate generation skips
# ---------------------------------------------------------------------------

def test_duplicate_generation_skips_existing_records() -> None:
    memo_id = _create_memo()
    first = _generate(memo_id)

    assert first["generated_count"] > 0
    assert first["skipped_count"] == 0

    second = _generate(memo_id)

    assert second["generated_count"] == 0
    assert second["skipped_count"] == first["generated_count"]
    assert second["records"] == []


# ---------------------------------------------------------------------------
# 4. Missing memo returns 404
# ---------------------------------------------------------------------------

def test_missing_memo_returns_404() -> None:
    response = client.post(
        "/finance/research/memos/999999/generate-evidence",
        json={"run_quality_gate_after": False},
    )
    assert response.status_code == 404


# ---------------------------------------------------------------------------
# 5. Only local metadata used (no external calls — mocked regime)
# ---------------------------------------------------------------------------

def test_generated_evidence_uses_only_local_metadata() -> None:
    # If the endpoint tried to call a real external API it would fail in isolation.
    # With detect_market_regime mocked and no ETF resolution called from this endpoint,
    # the call must succeed using only constitution + portfolio_state.
    memo_id = _create_memo(asset="quality_etf")
    data = _generate(memo_id)

    assert data["generated_count"] > 0
    for record in data["records"]:
        assert record["memo_id"] == memo_id


# ---------------------------------------------------------------------------
# 6. No portfolio_state.json mutation
# ---------------------------------------------------------------------------

def test_generate_evidence_does_not_mutate_portfolio_state() -> None:
    portfolio_path = engine.DEFAULT_PORTFOLIO_STATE_PATH
    before = portfolio_path.read_bytes()

    memo_id = _create_memo()
    _generate(memo_id)

    assert portfolio_path.read_bytes() == before


# ---------------------------------------------------------------------------
# 7. No recommendation amount/route mutation
# ---------------------------------------------------------------------------

def _get_rec_amounts_and_routes() -> tuple[dict, dict]:
    data = client.get("/finance/recommendation").json()
    amounts = {r["asset"]: r["amount"] for r in data["recommendations"]}
    routes = {r["asset"]: r["route"] for r in data["recommendations"]}
    return amounts, routes


def test_generate_evidence_does_not_change_recommendation_amounts() -> None:
    amounts_before, routes_before = _get_rec_amounts_and_routes()

    memo_id = _create_memo(asset="btc")
    _generate(memo_id)

    amounts_after, routes_after = _get_rec_amounts_and_routes()

    assert amounts_after == amounts_before
    assert routes_after == routes_before


# ---------------------------------------------------------------------------
# 8. Safety flags
# ---------------------------------------------------------------------------

def test_safety_flags_present() -> None:
    memo_id = _create_memo()
    data = _generate(memo_id)

    assert data["evidence_generation_only"] is True
    assert data["research_only"] is True
    assert data["investment_approval"] is False
    assert data["trades_executed"] is False
    assert data["broker_connection"] is False
    assert data["portfolio_state_updated"] is False
    assert data["recommendation_overridden"] is False


# ---------------------------------------------------------------------------
# 9. Quality gate not run by default
# ---------------------------------------------------------------------------

def test_quality_gate_not_run_by_default() -> None:
    memo_id = _create_memo()

    response = client.post(
        f"/finance/research/memos/{memo_id}/generate-evidence",
        json={},
    )
    data = response.json()

    assert "quality_gate_result" not in data


# ---------------------------------------------------------------------------
# 10. run_quality_gate_after=false does not run gate
# ---------------------------------------------------------------------------

def test_run_quality_gate_after_false_does_not_run_gate() -> None:
    memo_id = _create_memo()
    data = _generate(memo_id, run_gate=False)

    assert "quality_gate_result" not in data


# ---------------------------------------------------------------------------
# 11. run_quality_gate_after=true runs gate after generation
# ---------------------------------------------------------------------------

def test_run_quality_gate_after_true_includes_gate_result() -> None:
    memo_id = _create_memo()
    data = _generate(memo_id, run_gate=True)

    assert "quality_gate_result" in data
    gate = data["quality_gate_result"]
    assert gate["memo_id"] == memo_id
    assert "quality_status" in gate
    assert gate["gate_applied"] is True


def test_run_quality_gate_after_true_gate_is_separate_from_evidence() -> None:
    # evidence_result keys and quality_gate_result are clearly separated
    memo_id = _create_memo()
    data = _generate(memo_id, run_gate=True)

    assert "generated_count" in data
    assert "skipped_count" in data
    assert "records" in data
    assert "quality_gate_result" in data
    # gate fields are nested, not mixed into top level
    assert "quality_status" not in data
    assert "gate_applied" not in data


# ---------------------------------------------------------------------------
# 12. Crypto asset — market_data_source is UNVERIFIED
# ---------------------------------------------------------------------------

def test_crypto_asset_market_data_source_is_unverified() -> None:
    memo_id = _create_memo(asset="btc")
    data = _generate(memo_id)

    mds_records = [
        r for r in data["records"]
        if r["field_name"] == "market_data_source"
    ]
    assert len(mds_records) == 1
    assert mds_records[0]["status"] == "UNVERIFIED"
    assert mds_records[0]["check_type"] == "SOURCE_CONFIDENCE"


# ---------------------------------------------------------------------------
# 13. ETF asset — market_data_source is PASS
# ---------------------------------------------------------------------------

def test_etf_asset_market_data_source_is_pass() -> None:
    memo_id = _create_memo(asset="quality_etf")
    data = _generate(memo_id)

    mds_records = [
        r for r in data["records"]
        if r["field_name"] == "market_data_source"
    ]
    assert len(mds_records) == 1
    assert mds_records[0]["status"] == "PASS"
    assert mds_records[0]["primary_value"] == "yfinance"


# ---------------------------------------------------------------------------
# Bonus: all four check field names are present
# ---------------------------------------------------------------------------

def test_four_check_fields_generated() -> None:
    memo_id = _create_memo()
    data = _generate(memo_id)

    field_names = {r["field_name"] for r in data["records"]}
    assert "market_data_source" in field_names
    assert "broker_source" in field_names
    assert "recommendation_leg_mapping" in field_names
    assert "portfolio_allocation_context" in field_names


# ---------------------------------------------------------------------------
# Bonus: records persist in DB after generation
# ---------------------------------------------------------------------------

def test_generated_records_persist_in_db() -> None:
    memo_id = _create_memo()
    data = _generate(memo_id)

    persisted = database.list_research_validation_records_by_memo_id(memo_id)
    assert len(persisted) == data["generated_count"]


# ---------------------------------------------------------------------------
# Patch tests — correct recommendation mapping
# ---------------------------------------------------------------------------

def test_btc_recommendation_leg_mapping_is_pass() -> None:
    # BTC is in the recommendation (engine allocates it when btc is in portfolio)
    memo_id = _create_memo(asset="btc")
    data = _generate(memo_id)

    leg_records = [r for r in data["records"] if r["field_name"] == "recommendation_leg_mapping"]
    assert len(leg_records) == 1
    assert leg_records[0]["status"] == "PASS", (
        f"Expected PASS, got {leg_records[0]['status']}. "
        f"raw_json: {leg_records[0].get('raw_json')}"
    )


def test_btc_recommendation_assets_not_empty() -> None:
    memo_id = _create_memo(asset="btc")
    data = _generate(memo_id)

    leg_records = [r for r in data["records"] if r["field_name"] == "recommendation_leg_mapping"]
    assert len(leg_records) == 1
    rec_assets = leg_records[0].get("raw_json", {}).get("recommendation_assets", [])
    assert rec_assets, "recommendation_assets must not be empty when BTC is recommended"
    assert "btc" in rec_assets


def test_quality_etf_recommendation_leg_mapping_is_pass() -> None:
    memo_id = _create_memo(asset="quality_etf")
    data = _generate(memo_id)

    leg_records = [r for r in data["records"] if r["field_name"] == "recommendation_leg_mapping"]
    assert len(leg_records) == 1
    assert leg_records[0]["status"] == "PASS", (
        f"Expected PASS, got {leg_records[0]['status']}. "
        f"raw_json: {leg_records[0].get('raw_json')}"
    )


def test_quality_etf_in_recommendation_assets() -> None:
    memo_id = _create_memo(asset="quality_etf")
    data = _generate(memo_id)

    leg_records = [r for r in data["records"] if r["field_name"] == "recommendation_leg_mapping"]
    rec_assets = leg_records[0].get("raw_json", {}).get("recommendation_assets", [])
    assert "quality_etf" in rec_assets


def test_btc_stays_needs_more_evidence_after_generation_with_gate() -> None:
    # BTC draft memo has INSUFFICIENT_DATA verdict + LOW confidence
    # After generating evidence and running quality gate, it must remain NEEDS_MORE_EVIDENCE
    memo_id = _create_memo(
        asset="btc",
        verdict="INSUFFICIENT_DATA",
        data_confidence="LOW",
        status="draft",
    )
    data = _generate(memo_id, run_gate=True)

    gate = data["quality_gate_result"]
    assert gate["quality_status"] == "NEEDS_MORE_EVIDENCE", (
        f"Expected NEEDS_MORE_EVIDENCE, got {gate['quality_status']}. "
        f"Reason: {gate.get('quality_reason')}"
    )


def test_recommendation_amounts_unchanged_after_patch() -> None:
    amounts_before, routes_before = _get_rec_amounts_and_routes()

    memo_id = _create_memo(asset="btc")
    _generate(memo_id)

    amounts_after, routes_after = _get_rec_amounts_and_routes()
    assert amounts_after == amounts_before
    assert routes_after == routes_before


def test_portfolio_state_unchanged_after_patch() -> None:
    portfolio_path = engine.DEFAULT_PORTFOLIO_STATE_PATH
    before = portfolio_path.read_bytes()

    memo_id = _create_memo(asset="btc")
    _generate(memo_id)

    assert portfolio_path.read_bytes() == before


def test_unknown_asset_recommendation_leg_mapping_is_unverified() -> None:
    memo_id = _create_memo(asset="unknown_fake_asset_xyz")
    data = _generate(memo_id)

    leg_records = [r for r in data["records"] if r["field_name"] == "recommendation_leg_mapping"]
    assert len(leg_records) == 1
    assert leg_records[0]["status"] in ("UNVERIFIED", "WARNING")


# ---------------------------------------------------------------------------
# Repair / update behavior
# ---------------------------------------------------------------------------

def _create_stale_generated_record(memo_id: int, status: str = "WARNING") -> int:
    """Insert a PHOENIX-generated record with a stale/wrong status (simulates pre-patch production)."""
    return database.create_research_validation_record({
        "memo_id": memo_id,
        "asset": "btc",
        "check_type": "CROSS_SOURCE",
        "field_name": "recommendation_leg_mapping",
        "source_primary": "PHOENIX recommendation engine",
        "source_secondary": "PHOENIX constitution target_weights",
        "primary_value": None,
        "secondary_value": "0.21",
        "consensus_value": None,
        "tolerance_pct": None,
        "deviation_pct": None,
        "status": status,
        "confidence": "medium",
        "notes": "Stale pre-patch record",
        "raw_json": {
            "asset": "btc",
            "in_recommendation": False,
            "recommendation_assets": [],  # pre-patch bug: empty
        },
    })


def _create_manual_record(memo_id: int) -> int:
    """Insert a user-created validation record (no PHOENIX source prefix, no generated_by marker)."""
    return database.create_research_validation_record({
        "memo_id": memo_id,
        "asset": "btc",
        "check_type": "CROSS_SOURCE",
        "field_name": "recommendation_leg_mapping",
        "source_primary": "manual review by analyst",
        "source_secondary": None,
        "primary_value": "user-set-value",
        "secondary_value": None,
        "consensus_value": "user-set-value",
        "tolerance_pct": None,
        "deviation_pct": None,
        "status": "PASS",
        "confidence": "high",
        "notes": "Manually created record — must not be overwritten by generator",
        "raw_json": {"manually_created": True},
    })


def test_second_identical_generation_is_skipped() -> None:
    memo_id = _create_memo(asset="btc")
    first = _generate(memo_id)
    assert first["generated_count"] > 0

    second = _generate(memo_id)

    assert second["skipped_count"] == first["generated_count"]
    assert second["generated_count"] == 0
    assert second["updated_count"] == 0


def test_stale_generated_record_is_updated_not_duplicated() -> None:
    memo_id = _create_memo(asset="btc")
    _create_stale_generated_record(memo_id)

    data = _generate(memo_id)

    # No duplicate rows must exist
    persisted = database.list_research_validation_records_by_memo_id(memo_id)
    leg_records = [r for r in persisted if r["field_name"] == "recommendation_leg_mapping"]
    assert len(leg_records) == 1, "Must not create a duplicate row"


def test_updated_count_increments_for_changed_content() -> None:
    memo_id = _create_memo(asset="btc")
    _create_stale_generated_record(memo_id, status="WARNING")

    data = _generate(memo_id)

    # The stale WARNING record should have been repaired to PASS
    assert data["updated_count"] >= 1


def test_updated_record_status_corrected() -> None:
    memo_id = _create_memo(asset="btc")
    _create_stale_generated_record(memo_id, status="WARNING")

    _generate(memo_id)

    persisted = database.list_research_validation_records_by_memo_id(memo_id)
    leg_records = [r for r in persisted if r["field_name"] == "recommendation_leg_mapping"]
    assert len(leg_records) == 1
    assert leg_records[0]["status"] == "PASS"


def test_manual_record_not_overwritten() -> None:
    memo_id = _create_memo(asset="btc")
    record_id = _create_manual_record(memo_id)

    data = _generate(memo_id)

    # Manual record must be intact
    manual = database.get_research_validation_record(record_id)
    assert manual is not None
    assert manual["primary_value"] == "user-set-value"
    assert manual["notes"] == "Manually created record — must not be overwritten by generator"

    # skipped_count must include the protected manual record
    leg_skipped = data["skipped_count"]
    assert leg_skipped >= 1


def test_updated_count_in_response() -> None:
    memo_id = _create_memo(asset="btc")

    # Fresh generation — no updates
    first = _generate(memo_id)
    assert "updated_count" in first
    assert first["updated_count"] == 0

    # Second identical run — still no updates (all skipped)
    second = _generate(memo_id)
    assert second["updated_count"] == 0
    assert second["skipped_count"] > 0
