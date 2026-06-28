"""Production finance acceptance gate contract tests."""

import copy

import pytest

from jarvis.domains.finance.acceptance_gate import (
    evaluate_finance_acceptance,
    run_local_acceptance_gate,
)


@pytest.fixture(scope="module")
def accepted_result() -> dict:
    result = run_local_acceptance_gate()
    assert result["accepted"] is True, result["errors"]
    return result


def test_finance_acceptance_gate_passes_current_transparent_state(
    accepted_result: dict,
) -> None:
    coverage = accepted_result["coverage"]
    summary = coverage["sections"]["coverage_summary"]

    assert coverage["verdict"] == "DATA_TRANSPARENT"
    assert coverage["blockers"] == []
    assert summary["universe_type"] == "CURATED_EXPANDED_UNIVERSE"
    assert summary["total_etf_candidates_configured"] >= 18
    assert (
        summary["current_legs_with_validated_research"]
        == summary["total_current_recommendation_legs"]
    )


def test_finance_acceptance_gate_rejects_blocked_coverage(
    accepted_result: dict,
) -> None:
    coverage = copy.deepcopy(accepted_result["coverage"])
    coverage["verdict"] = "BLOCKED"
    coverage["blockers"] = ["fixture blocker"]

    errors = evaluate_finance_acceptance(coverage)

    assert any("DATA_TRANSPARENT" in error for error in errors)
    assert any("blockers" in error for error in errors)


def test_finance_acceptance_gate_rejects_safety_flag_regression(
    accepted_result: dict,
) -> None:
    coverage = copy.deepcopy(accepted_result["coverage"])
    coverage["sections"]["safety"]["broker_connection"] = True

    errors = evaluate_finance_acceptance(coverage)

    assert any("broker_connection" in error for error in errors)


def test_finance_acceptance_gate_rejects_stale_quality_etf_evidence(
    accepted_result: dict,
) -> None:
    coverage = copy.deepcopy(accepted_result["coverage"])
    quality = next(
        leg
        for leg in coverage["sections"]["research_evidence_provenance"]["legs"]
        if leg["asset"] == "quality_etf"
    )
    quality["evidence_matches_current_instrument"] = False
    for record in quality["validation_records"]:
        if record["field_name"] == "market_data_source":
            record["instrument"] = "IWQU.L"

    errors = evaluate_finance_acceptance(coverage)

    assert any("IS3Q.DE" in error for error in errors)


def test_finance_acceptance_gate_rejects_null_quality_etf_instrument(
    accepted_result: dict,
) -> None:
    coverage = copy.deepcopy(accepted_result["coverage"])
    quality = next(
        leg
        for leg in coverage["sections"]["research_evidence_provenance"]["legs"]
        if leg["asset"] == "quality_etf"
    )
    quality["evidence_matches_current_instrument"] = False
    for record in quality["validation_records"]:
        if record["field_name"] == "market_data_source":
            record["instrument"] = None

    errors = evaluate_finance_acceptance(coverage)

    assert any("IS3Q.DE" in error for error in errors)
