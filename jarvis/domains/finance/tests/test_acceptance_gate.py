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


def test_finance_acceptance_gate_rejects_stale_current_etf_evidence(
    accepted_result: dict,
) -> None:
    coverage = copy.deepcopy(accepted_result["coverage"])
    etf = next(
        leg
        for leg in coverage["sections"]["research_evidence_provenance"]["legs"]
        if leg["asset"] == "growth_nasdaq_etf"
    )
    etf["evidence_matches_current_instrument"] = False
    for record in etf["validation_records"]:
        if record["field_name"] == "market_data_source":
            record["instrument"] = "IWQU.L"

    errors = evaluate_finance_acceptance(coverage)

    assert any("CNDX.L" in error for error in errors)


def test_finance_acceptance_gate_rejects_null_current_etf_instrument(
    accepted_result: dict,
) -> None:
    coverage = copy.deepcopy(accepted_result["coverage"])
    etf = next(
        leg
        for leg in coverage["sections"]["research_evidence_provenance"]["legs"]
        if leg["asset"] == "growth_nasdaq_etf"
    )
    etf["evidence_matches_current_instrument"] = False
    for record in etf["validation_records"]:
        if record["field_name"] == "market_data_source":
            record["instrument"] = None

    errors = evaluate_finance_acceptance(coverage)

    assert any("CNDX.L" in error for error in errors)


def test_finance_acceptance_gate_accepts_synthetic_quality_leg(accepted_result: dict) -> None:
    coverage = copy.deepcopy(accepted_result["coverage"])
    for section in ("recommendation_data_provenance", "research_evidence_provenance"):
        leg = next(iter(coverage["sections"][section]["legs"]))
        if leg["asset"] == "btc":
            leg = coverage["sections"][section]["legs"][1]
        leg["asset"] = "quality_etf"
        if section == "recommendation_data_provenance":
            leg["resolved_candidate"]["symbol"] = "IS3Q.DE"
        else:
            leg["expected_instrument"] = "IS3Q.DE"
            for record in leg["validation_records"]:
                if record["field_name"] == "market_data_source":
                    record["instrument"] = "IS3Q.DE"
    assert evaluate_finance_acceptance(coverage) == []


def _synthetic_quality_coverage(accepted_result: dict) -> dict:
    coverage = copy.deepcopy(accepted_result["coverage"])
    recommendation = next(
        leg
        for leg in coverage["sections"]["recommendation_data_provenance"]["legs"]
        if leg["asset"] == "growth_nasdaq_etf"
    )
    research = next(
        leg
        for leg in coverage["sections"]["research_evidence_provenance"]["legs"]
        if leg["asset"] == "growth_nasdaq_etf"
    )
    recommendation["asset"] = research["asset"] = "quality_etf"
    recommendation["resolved_candidate"]["symbol"] = "IS3Q.DE"
    research["expected_instrument"] = "IS3Q.DE"
    for record in research["validation_records"]:
        if record["field_name"] == "market_data_source":
            record["instrument"] = "IS3Q.DE"
    return coverage


def test_finance_acceptance_gate_rejects_fully_null_selected_etf_instrument(
    accepted_result: dict,
) -> None:
    coverage = copy.deepcopy(accepted_result["coverage"])
    recommendation = next(
        leg
        for leg in coverage["sections"]["recommendation_data_provenance"]["legs"]
        if leg["asset"] == "growth_nasdaq_etf"
    )
    research = next(
        leg
        for leg in coverage["sections"]["research_evidence_provenance"]["legs"]
        if leg["asset"] == "growth_nasdaq_etf"
    )
    recommendation["resolved_candidate"]["symbol"] = None
    research["expected_instrument"] = None
    research["evidence_matches_current_instrument"] = True
    for record in research["validation_records"]:
        if record["field_name"] == "market_data_source":
            record["instrument"] = None

    errors = evaluate_finance_acceptance(coverage)

    assert any("selected instrument" in error for error in errors)


@pytest.mark.parametrize("instrument", ["IWQU.L", None])
def test_finance_acceptance_gate_rejects_synthetic_quality_stale_or_null_evidence(
    accepted_result: dict, instrument: str | None,
) -> None:
    coverage = _synthetic_quality_coverage(accepted_result)
    research = next(
        leg
        for leg in coverage["sections"]["research_evidence_provenance"]["legs"]
        if leg["asset"] == "quality_etf"
    )
    research["evidence_matches_current_instrument"] = False
    for record in research["validation_records"]:
        if record["field_name"] == "market_data_source":
            record["instrument"] = instrument

    errors = evaluate_finance_acceptance(coverage)

    assert any("quality_etf evidence must match current instrument IS3Q.DE" in error for error in errors)
