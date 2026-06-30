"""Deterministic production-readiness gate for PHOENIX finance.

Default execution is offline-safe: it uses a temporary SQLite database and
mocked market-resolution results while exercising the real local API route.
An optional ``--live-url`` performs a read-only production coverage check.
"""

from __future__ import annotations

import argparse
import json
import tempfile
from pathlib import Path
from typing import Any
from urllib.request import urlopen
from unittest.mock import patch

from fastapi.testclient import TestClient

from jarvis.data import database
from jarvis.domains.finance import engine
from jarvis.domains.finance.market_data import ETF_CANDIDATE_TICKERS


_FALSE_SAFETY_FLAGS = (
    "broker_connection",
    "orders_created",
    "trades_executed",
    "portfolio_state_updated",
    "recommendation_overridden",
)


def current_etf_asset(sections: dict[str, Any]) -> str | None:
    """Return the single ETF asset in current recommendation provenance."""
    assets = [
        leg.get("asset")
        for leg in (
            (sections.get("recommendation_data_provenance") or {}).get("legs") or []
        )
        if leg.get("asset") in ETF_CANDIDATE_TICKERS
    ]
    return assets[0] if len(assets) == 1 else None


def evaluate_finance_acceptance(coverage: dict[str, Any]) -> list[str]:
    """Return contract violations; an empty list means the gate passes."""
    errors: list[str] = []
    sections = coverage.get("sections") or {}
    summary = sections.get("coverage_summary") or {}
    safety = sections.get("safety") or {}
    recommendation_legs = {
        leg.get("asset"): leg
        for leg in ((sections.get("recommendation_data_provenance") or {}).get("legs") or [])
    }
    research_legs = {
        leg.get("asset"): leg
        for leg in ((sections.get("research_evidence_provenance") or {}).get("legs") or [])
    }

    if coverage.get("verdict") != "DATA_TRANSPARENT":
        errors.append("coverage verdict must be DATA_TRANSPARENT")
    if coverage.get("blockers"):
        errors.append("coverage blockers must be empty")
    if summary.get("universe_type") != "CURATED_EXPANDED_UNIVERSE":
        errors.append("universe_type must be CURATED_EXPANDED_UNIVERSE")
    if int(summary.get("total_etf_candidates_configured") or 0) < 18:
        errors.append("total_etf_candidates_configured must be at least 18")
    if summary.get("current_legs_with_validated_research") != summary.get(
        "total_current_recommendation_legs"
    ):
        errors.append("every current recommendation leg must have validated research")

    btc = research_legs.get("btc") or {}
    btc_records = btc.get("validation_records") or []
    if btc.get("expected_instrument") != "BTC-USD" or not btc.get(
        "evidence_matches_current_instrument"
    ):
        errors.append("BTC evidence must match BTC-USD")
    if not any(
        record.get("instrument") == "BTC-USD"
        and record.get("status") == "PASS"
        and record.get("provenance_classification") == "LIVE_MARKET_FETCH"
        for record in btc_records
    ):
        errors.append("BTC-USD requires a PASS LIVE_MARKET_FETCH record")

    etf_asset = current_etf_asset(sections)
    if etf_asset is None:
        errors.append("exactly one current ETF recommendation leg is required")
    selected_etf = (
        (recommendation_legs.get(etf_asset) or {}).get("resolved_candidate") or {}
    ).get("symbol")
    if not selected_etf:
        errors.append(f"{etf_asset or 'ETF'} selected instrument must be present")
    etf = research_legs.get(etf_asset) or {}
    etf_records = etf.get("validation_records") or []
    if etf.get("expected_instrument") != selected_etf or not etf.get(
        "evidence_matches_current_instrument"
    ):
        errors.append(f"{etf_asset or 'ETF'} evidence must match current instrument {selected_etf or '<missing>'}")
    if not any(
        record.get("field_name") == "market_data_source"
        and record.get("instrument") == selected_etf
        and record.get("status") == "PASS"
        and record.get("provenance_classification") == "LIVE_MARKET_FETCH"
        for record in etf_records
    ):
        errors.append(f"{etf_asset or 'ETF'} requires instrument-matched live evidence for {selected_etf or '<missing>'}")

    for flag in _FALSE_SAFETY_FLAGS:
        if safety.get(flag) is not False:
            errors.append(f"safety flag {flag} must be false")
    return errors


def _resolution(sleeve: str) -> dict[str, Any]:
    candidates = []
    for configured in ETF_CANDIDATE_TICKERS[sleeve]:
        candidate = {
            **configured,
            "raw_price": 100.0,
            "currency": "EUR",
            "eur_price": 100.0,
            "market_data_source": "yfinance",
            "fetch_status": "ok",
            "lightyear_available": False,
            "lightyear_confidence": "unresolved",
            "broker_source": "lightyear_public_fund_screener",
            "selected": False,
        }
        candidates.append(candidate)
    selected = candidates[0]
    selected.update(
        selected=True,
        lightyear_available=True,
        lightyear_confidence="high",
    )
    return {
        "selected_candidate": selected,
        "candidates": candidates,
        "source": "yfinance",
        "broker_source": "lightyear_public_fund_screener",
        "broker_verification": "verified",
        "confirmation_required": True,
        "confidence": "high",
        "reason": "Deterministic acceptance fixture.",
    }


def _create_validated_memo(asset: str, sleeve: str | None, records: list[dict]) -> None:
    memo_id = database.create_research_memo(
        {
            "asset": asset,
            "sleeve": sleeve,
            "title": f"{asset} acceptance evidence",
            "thesis": "Deterministic acceptance-gate evidence.",
            "risks": ["Acceptance fixture only"],
            "data_confidence": "HIGH",
            "verdict": "WATCH",
            "sources": [],
            "validation": {},
            "status": "active",
            "notes": None,
        }
    )
    for record in records:
        database.create_research_validation_record(
            {
                "memo_id": memo_id,
                "asset": asset,
                "check_type": record.get("check_type", "SOURCE_CONFIDENCE"),
                "field_name": record["field_name"],
                "source_primary": record["source_primary"],
                "status": "PASS",
                "confidence": "high",
                "raw_json": record.get("raw_json") or {},
            }
        )
    database.evaluate_research_memo_quality(memo_id)


def _seed_acceptance_evidence() -> None:
    marker = "PHOENIX_EVIDENCE_GENERATOR_V1"
    _create_validated_memo(
        "btc",
        None,
        [
            {
                "field_name": "market_data_source",
                "source_primary": "PHOENIX crypto price adapter / yfinance",
                "raw_json": {
                    "generated_by": marker,
                    "adapter": "crypto_price_adapter_v1",
                    "symbol": "BTC-USD",
                    "source": "yfinance",
                    "fetch_status": "success",
                },
            },
            {
                "check_type": "MANUAL_REVIEW",
                "field_name": "acceptance_cross_check",
                "source_primary": "Acceptance fixture",
            },
        ],
    )
    for sleeve, configured in ETF_CANDIDATE_TICKERS.items():
        ticker = configured[0]["symbol"]
        _create_validated_memo(
            sleeve,
            sleeve,
            [
            {
                "field_name": "market_data_source",
                "source_primary": "PHOENIX ETF source adapter / yfinance",
                "raw_json": {
                    "generated_by": marker,
                    "adapter": "etf_source_adapter_v1",
                    "ticker": ticker,
                    "source": "yfinance",
                    "fetch_status": "ok",
                },
            },
            {
                "field_name": "broker_source",
                "source_primary": "PHOENIX ETF source adapter / Lightyear public catalogue",
                "raw_json": {
                    "generated_by": marker,
                    "adapter": "etf_source_adapter_v1",
                    "ticker": ticker,
                    "fetch_status": "verified",
                },
            },
            ],
        )


def run_local_acceptance_gate() -> dict[str, Any]:
    """Exercise the real local coverage route with deterministic offline inputs."""
    original_db_path = database.DB_PATH
    portfolio_path = engine.DEFAULT_PORTFOLIO_STATE_PATH
    portfolio_before = portfolio_path.read_bytes()
    with tempfile.TemporaryDirectory(prefix="phoenix-finance-gate-") as directory:
        database.DB_PATH = Path(directory) / "acceptance.db"
        try:
            from jarvis.api.main import app

            database.init_db()
            _seed_acceptance_evidence()
            ledger_before = database.get_finance_transactions()
            with patch(
                "jarvis.api.routers.finance.resolve_best_etf_candidate_with_broker_check",
                side_effect=_resolution,
            ), patch(
                "jarvis.api.routers.finance.detect_market_regime",
                return_value="risk_on",
            ):
                response = TestClient(app).get("/finance/data-coverage")
            response.raise_for_status()
            coverage = response.json()
            errors = evaluate_finance_acceptance(coverage)
            if portfolio_path.read_bytes() != portfolio_before:
                errors.append("acceptance gate mutated portfolio_state.json")
            if database.get_finance_transactions() != ledger_before:
                errors.append("acceptance gate created or changed ledger transactions")
            return {
                "mode": "local_offline",
                "accepted": not errors,
                "errors": errors,
                "coverage": coverage,
            }
        finally:
            database.DB_PATH = original_db_path


def run_live_acceptance_gate(base_url: str) -> dict[str, Any]:
    """Read and validate a deployed coverage endpoint without any writes."""
    url = f"{base_url.rstrip('/')}/finance/data-coverage"
    with urlopen(url, timeout=120) as response:  # noqa: S310 - explicit CLI opt-in URL
        coverage = json.loads(response.read().decode("utf-8"))
    errors = evaluate_finance_acceptance(coverage)
    return {
        "mode": "live_read_only",
        "url": url,
        "accepted": not errors,
        "errors": errors,
        "coverage": coverage,
    }


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description="Run the PHOENIX finance acceptance gate.")
    parser.add_argument(
        "--live-url",
        help="Opt in to a read-only deployed /finance/data-coverage check.",
    )
    args = parser.parse_args(argv)
    result = (
        run_live_acceptance_gate(args.live_url)
        if args.live_url
        else run_local_acceptance_gate()
    )
    coverage = result["coverage"]
    summary = (coverage.get("sections") or {}).get("coverage_summary") or {}
    output = {
        "accepted": result["accepted"],
        "mode": result["mode"],
        "errors": result["errors"],
        "verdict": coverage.get("verdict"),
        "blockers": coverage.get("blockers"),
        "universe_type": summary.get("universe_type"),
        "total_etf_candidates_configured": summary.get(
            "total_etf_candidates_configured"
        ),
        "validated_recommendation_legs": summary.get(
            "current_legs_with_validated_research"
        ),
        "total_recommendation_legs": summary.get(
            "total_current_recommendation_legs"
        ),
    }
    print(json.dumps(output, indent=2))
    return 0 if result["accepted"] else 1


if __name__ == "__main__":
    raise SystemExit(main())
