"""Cross-endpoint production finance smoke-gate contract tests."""

import copy
import json
import os
import subprocess
import sys
from unittest.mock import patch

import pytest

from jarvis.domains.finance.acceptance_gate import run_local_acceptance_gate
from jarvis.data import database
from jarvis.domains.finance import engine
from jarvis.domains.finance.production_smoke_gate import (
    evaluate_production_smoke,
    run_live_smoke_gate,
    run_local_smoke_gate,
)


@pytest.fixture(scope="module")
def valid_state() -> tuple[dict, dict]:
    coverage = run_local_acceptance_gate()["coverage"]
    etf_provenance = next(
        leg
        for leg in coverage["sections"]["recommendation_data_provenance"]["legs"]
        if leg["asset"] == "growth_nasdaq_etf"
    )
    selected = {
        **etf_provenance["resolved_candidate"],
        "broker_availability_status": "public_verified",
        "role": "checklist_candidate",
        "alias_for": "checklist_candidate",
    }
    research_winner = {
        "symbol": "EQQQ.L",
        "broker_availability_status": "not_publicly_verified",
        "role": "research_winner",
    }
    etf_sleeve = coverage["sections"]["etf_candidate_universe"]["sleeves"][
        "growth_nasdaq_etf"
    ]
    etf_sleeve.update(
        research_winner=research_winner,
        checklist_candidate=selected,
        selected_candidate=dict(selected),
        research_winner_is_checklist_candidate=False,
        selection_gap_reason=(
            "Research winner EQQQ.L is not publicly verified on Lightyear, "
            "so Phase 1 selected CNDX.L for the manual checklist."
        ),
    )
    checklist = {
        "checklist_status": "READY_FOR_MANUAL_REVIEW",
        "checklist_items": [
            {
                "asset": "btc",
                "route": "lhv_crypto",
                "platform": "LHV Crypto",
                "ticker": "BTC",
                "symbol": "BTC",
                "checklist_eligible": True,
            },
            {
                "asset": "growth_nasdaq_etf",
                "route": "lightyear",
                "platform": "Lightyear",
                "ticker": "CNDX.L",
                "symbol": "CNDX.L",
                "resolved_candidate": selected,
                "checklist_eligible": True,
            },
        ],
        "safety_flags": {
            "checklist_only": True,
            "investment_approval": False,
            "broker_connection": False,
            "orders_created": False,
            "trades_executed": False,
            "portfolio_state_updated": False,
            "recommendation_overridden": False,
            "manual_broker_action_required": True,
        },
    }
    return coverage, checklist


def test_smoke_gate_passes_valid_transparent_cross_endpoint_state(
    valid_state: tuple[dict, dict],
) -> None:
    coverage, checklist = copy.deepcopy(valid_state)

    assert evaluate_production_smoke(coverage, checklist) == []


def test_smoke_gate_passes_synthetic_quality_etf_current_leg(
    valid_state: tuple[dict, dict],
) -> None:
    coverage, checklist = copy.deepcopy(valid_state)
    sections = coverage["sections"]
    for leg in sections["recommendation_data_provenance"]["legs"]:
        if leg["asset"] == "growth_nasdaq_etf":
            leg["asset"] = "quality_etf"
            leg["resolved_candidate"]["symbol"] = "IS3Q.DE"
    for leg in sections["research_evidence_provenance"]["legs"]:
        if leg["asset"] == "growth_nasdaq_etf":
            leg["asset"] = "quality_etf"
            leg["expected_instrument"] = "IS3Q.DE"
            for record in leg["validation_records"]:
                if record["field_name"] == "market_data_source":
                    record["instrument"] = "IS3Q.DE"
    growth = sections["etf_candidate_universe"]["sleeves"]["growth_nasdaq_etf"]
    quality = copy.deepcopy(growth)
    for field in ("checklist_candidate", "selected_candidate"):
        quality[field]["symbol"] = "IS3Q.DE"
    quality["research_winner"]["symbol"] = "XDEQ.DE"
    quality["selection_gap_reason"] = "XDEQ.DE is not publicly verified; IS3Q.DE is selected."
    sections["etf_candidate_universe"]["sleeves"]["quality_etf"] = quality
    item = next(item for item in checklist["checklist_items"] if item["asset"] == "growth_nasdaq_etf")
    item.update(asset="quality_etf", ticker="IS3Q.DE", symbol="IS3Q.DE")
    item["resolved_candidate"]["symbol"] = "IS3Q.DE"

    assert evaluate_production_smoke(coverage, checklist) == []


def test_smoke_gate_rejects_blocked_coverage(valid_state: tuple[dict, dict]) -> None:
    coverage, checklist = copy.deepcopy(valid_state)
    coverage["verdict"] = "BLOCKED"
    coverage["blockers"] = ["fixture blocker"]

    errors = evaluate_production_smoke(coverage, checklist)

    assert any("DATA_TRANSPARENT" in error for error in errors)
    assert any("blockers" in error for error in errors)


def test_smoke_gate_rejects_missing_selection_gap_reason(
    valid_state: tuple[dict, dict],
) -> None:
    coverage, checklist = copy.deepcopy(valid_state)
    etf = coverage["sections"]["etf_candidate_universe"]["sleeves"][
        "growth_nasdaq_etf"
    ]
    etf["selection_gap_reason"] = ""

    errors = evaluate_production_smoke(coverage, checklist)

    assert any("selection_gap_reason" in error for error in errors)


def test_smoke_gate_rejects_manual_checklist_using_research_winner(
    valid_state: tuple[dict, dict],
) -> None:
    coverage, checklist = copy.deepcopy(valid_state)
    etf_item = next(
        item for item in checklist["checklist_items"] if item["asset"] == "growth_nasdaq_etf"
    )
    etf_item["ticker"] = "EQQQ.L"
    etf_item["symbol"] = "EQQQ.L"

    errors = evaluate_production_smoke(coverage, checklist)

    assert any("research winner" in error for error in errors)


def test_smoke_gate_rejects_any_safety_flag_regression(
    valid_state: tuple[dict, dict],
) -> None:
    coverage, checklist = copy.deepcopy(valid_state)
    checklist["safety_flags"]["orders_created"] = True

    errors = evaluate_production_smoke(coverage, checklist)

    assert any("orders_created" in error for error in errors)


def test_smoke_gate_rejects_checklist_etf_symbol_mismatch(
    valid_state: tuple[dict, dict],
) -> None:
    coverage, checklist = copy.deepcopy(valid_state)
    etf_item = next(
        item for item in checklist["checklist_items"] if item["asset"] == "growth_nasdaq_etf"
    )
    etf_item["ticker"] = "OTHER.DE"
    etf_item["symbol"] = "OTHER.DE"

    errors = evaluate_production_smoke(coverage, checklist)

    assert any("checklist candidate" in error for error in errors)


def test_local_smoke_gate_is_offline_safe_and_read_only() -> None:
    original_db_path = database.DB_PATH
    portfolio_before = engine.DEFAULT_PORTFOLIO_STATE_PATH.read_bytes()

    result = run_local_smoke_gate()

    assert result["accepted"] is True, result["errors"]
    assert result["mode"] == "local_offline"
    assert result["coverage_verdict"] == "DATA_TRANSPARENT"
    assert result["etf_asset"] == "growth_nasdaq_etf"
    assert result["etf_checklist_candidate"] == "CNDX.L"
    assert result["etf_manual_checklist_symbol"] == "CNDX.L"
    assert result["quality_checklist_candidate"] == "CNDX.L"
    assert result["quality_manual_checklist_symbol"] == "CNDX.L"
    assert all(value is False for value in result["safety"].values())
    assert database.DB_PATH == original_db_path
    assert engine.DEFAULT_PORTFOLIO_STATE_PATH.read_bytes() == portfolio_before


def test_live_smoke_gate_reads_both_endpoints_and_returns_compact_json(
    valid_state: tuple[dict, dict],
) -> None:
    coverage, checklist = copy.deepcopy(valid_state)
    requested_urls: list[str] = []

    class FakeResponse:
        def __init__(self, payload: dict):
            self.payload = payload

        def __enter__(self):
            return self

        def __exit__(self, *args):
            return False

        def read(self) -> bytes:
            return json.dumps(self.payload).encode("utf-8")

    def fake_urlopen(url: str, timeout: int):
        requested_urls.append(url)
        payload = coverage if url.endswith("/finance/data-coverage") else checklist
        return FakeResponse(payload)

    with patch(
        "jarvis.domains.finance.production_smoke_gate.urlopen",
        side_effect=fake_urlopen,
    ):
        result = run_live_smoke_gate("https://example.test/")

    assert requested_urls == [
        "https://example.test/finance/data-coverage",
        "https://example.test/finance/manual-buy-checklist",
    ]
    assert result["accepted"] is True
    assert result["mode"] == "live_read_only"
    assert "coverage" not in result
    assert "checklist" not in result


def test_importing_live_smoke_cli_does_not_initialize_local_sqlite(tmp_path) -> None:
    db_path = tmp_path / "must-not-be-created.db"
    env = {**os.environ, "JARVIS_DB_PATH": str(db_path)}

    result = subprocess.run(
        [
            sys.executable,
            "-c",
            "import jarvis.domains.finance.production_smoke_gate",
        ],
        cwd=os.getcwd(),
        env=env,
        capture_output=True,
        text=True,
        check=False,
    )

    assert result.returncode == 0, result.stderr
    assert not db_path.exists()


def test_local_smoke_cli_uses_only_its_temporary_sqlite(tmp_path) -> None:
    db_path = tmp_path / "configured-db-must-not-be-created.db"
    env = {**os.environ, "JARVIS_DB_PATH": str(db_path)}

    result = subprocess.run(
        [sys.executable, "-m", "jarvis.domains.finance.production_smoke_gate"],
        cwd=os.getcwd(),
        env=env,
        capture_output=True,
        text=True,
        check=False,
    )

    assert result.returncode == 0, result.stderr
    assert json.loads(result.stdout)["accepted"] is True
    assert not db_path.exists()
