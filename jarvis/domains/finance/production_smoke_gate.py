"""Read-only cross-endpoint smoke gate for deployed PHOENIX finance APIs."""

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
from jarvis.domains.finance import acceptance_gate, engine
from jarvis.domains.finance.acceptance_gate import evaluate_finance_acceptance


_FALSE_SAFETY_FLAGS = (
    "broker_connection",
    "orders_created",
    "trades_executed",
    "portfolio_state_updated",
    "recommendation_overridden",
)


def _symbol(candidate: Any) -> str | None:
    return candidate.get("symbol") if isinstance(candidate, dict) else None


def _items_by_asset(checklist: dict[str, Any]) -> dict[str, dict[str, Any]]:
    return {
        item.get("asset"): item
        for item in (checklist.get("checklist_items") or [])
        if isinstance(item, dict) and item.get("asset")
    }


def evaluate_production_smoke(
    coverage: dict[str, Any], checklist: dict[str, Any]
) -> list[str]:
    """Return coverage/checklist contract violations; empty means accepted."""
    errors = list(evaluate_finance_acceptance(coverage))
    sections = coverage.get("sections") or {}
    sleeves = ((sections.get("etf_candidate_universe") or {}).get("sleeves") or {})
    etf_asset = acceptance_gate.current_etf_asset(sections)
    etf = sleeves.get(etf_asset) or {}
    research_winner = etf.get("research_winner")
    checklist_candidate = etf.get("checklist_candidate")
    selected_candidate = etf.get("selected_candidate")
    research_symbol = _symbol(research_winner)
    checklist_symbol = _symbol(checklist_candidate)
    selected_symbol = _symbol(selected_candidate)

    if not research_symbol:
        errors.append(f"{etf_asset or 'ETF'} research_winner must be present")
    if not checklist_symbol:
        errors.append(f"{etf_asset or 'ETF'} checklist_candidate must be present")
    if selected_symbol != checklist_symbol:
        errors.append(f"{etf_asset or 'ETF'} selected_candidate must equal checklist_candidate")
    if checklist_candidate and checklist_candidate.get(
        "broker_availability_status"
    ) != "public_verified":
        errors.append(f"{etf_asset or 'ETF'} checklist_candidate must be public_verified")

    recommendation_quality = next(
        (
            leg
            for leg in (
                (sections.get("recommendation_data_provenance") or {}).get("legs")
                or []
            )
            if leg.get("asset") == etf_asset
        ),
        {},
    )
    resolved_symbol = _symbol(recommendation_quality.get("resolved_candidate"))
    if resolved_symbol != checklist_symbol:
        errors.append(
            f"{etf_asset or 'ETF'} recommendation resolved_candidate must equal checklist_candidate"
        )

    if research_symbol and research_symbol != checklist_symbol:
        if not str(etf.get("selection_gap_reason") or "").strip():
            errors.append(
                f"{etf_asset or 'ETF'} selection_gap_reason is required when research and checklist candidates differ"
            )
        if research_winner.get("broker_availability_status") not in {
            "not_publicly_verified",
            "public_verified",
        }:
            errors.append(
                f"{etf_asset or 'ETF'} research_winner must expose broker_availability_status"
            )

    checklist_items = _items_by_asset(checklist)
    etf_item = checklist_items.get(etf_asset) or {}
    manual_symbol = etf_item.get("symbol") or etf_item.get("ticker")
    if research_symbol != checklist_symbol and manual_symbol == research_symbol:
        errors.append(
            f"manual checklist must not use the {etf_asset or 'ETF'} research winner when it differs from the checklist candidate"
        )
    if manual_symbol != checklist_symbol:
        errors.append(
            f"manual checklist {etf_asset or 'ETF'} symbol must equal the current checklist candidate"
        )
    if etf_item.get("checklist_eligible") is not True:
        errors.append(f"manual checklist {etf_asset or 'ETF'} item must be checklist_eligible")

    btc = checklist_items.get("btc") or {}
    if btc.get("route") != "lhv_crypto" or btc.get("platform") != "LHV Crypto":
        errors.append("BTC checklist item must remain manual-only through LHV Crypto")

    items = list(checklist_items.values())
    if checklist.get("checklist_status") == "READY_FOR_MANUAL_REVIEW" and any(
        item.get("checklist_eligible") is not True for item in items
    ):
        errors.append(
            "READY_FOR_MANUAL_REVIEW requires every checklist item to be eligible"
        )

    checklist_safety = checklist.get("safety_flags") or {}
    for flag in _FALSE_SAFETY_FLAGS:
        if checklist_safety.get(flag) is not False:
            errors.append(f"manual checklist safety flag {flag} must be false")
    return errors


def _smoke_resolution(sleeve: str) -> dict[str, Any]:
    """Add the Phase 1 role split to the deterministic acceptance fixture."""
    resolution = acceptance_gate._resolution(sleeve)
    selected_symbol = _symbol(resolution.get("selected_candidate"))
    candidates = []
    for candidate in resolution.get("candidates") or []:
        public_verified = candidate.get("symbol") == selected_symbol
        candidates.append(
            {
                **candidate,
                "broker_availability_status": (
                    "public_verified" if public_verified else "not_publicly_verified"
                ),
            }
        )
    selected = next(
        (candidate for candidate in candidates if candidate.get("symbol") == selected_symbol),
        None,
    )
    research = candidates[1] if len(candidates) > 1 else (candidates[0] if candidates else None)
    checklist_candidate = (
        {
            **selected,
            "role": "checklist_candidate",
            "alias_for": "checklist_candidate",
        }
        if selected
        else None
    )
    research_winner = (
        {**research, "role": "research_winner"} if research else None
    )
    research_symbol = _symbol(research_winner)
    same_candidate = bool(research_symbol and research_symbol == selected_symbol)
    selection_gap_reason = (
        f"Research winner {research_symbol} is also the publicly verified checklist candidate."
        if same_candidate
        else (
            f"Research winner {research_symbol} is not publicly verified on Lightyear, "
            f"so Phase 1 selected {selected_symbol} for the manual checklist."
        )
    )
    return {
        **resolution,
        "candidates": candidates,
        "research_winner": research_winner,
        "checklist_candidate": checklist_candidate,
        "selected_candidate": (
            dict(checklist_candidate) if checklist_candidate else None
        ),
        "research_winner_is_checklist_candidate": same_candidate,
        "research_winner_reason": "Highest deterministic product/research score in the smoke fixture.",
        "checklist_candidate_reason": "Highest publicly verified candidate in the smoke fixture.",
        "selection_gap_reason": selection_gap_reason,
    }


def _compact_result(
    mode: str,
    coverage: dict[str, Any],
    checklist: dict[str, Any],
    errors: list[str],
) -> dict[str, Any]:
    sections = coverage.get("sections") or {}
    etf_asset = acceptance_gate.current_etf_asset(sections)
    etf = (((sections.get("etf_candidate_universe") or {}).get("sleeves") or {}).get(etf_asset) or {})
    etf_item = _items_by_asset(checklist).get(etf_asset) or {}
    coverage_safety = sections.get("safety") or {}
    checklist_safety = checklist.get("safety_flags") or {}
    safety = {
        flag: bool(coverage_safety.get(flag) or checklist_safety.get(flag))
        for flag in _FALSE_SAFETY_FLAGS
    }
    return {
        "accepted": not errors,
        "mode": mode,
        "errors": errors,
        "coverage_verdict": coverage.get("verdict"),
        "checklist_status": checklist.get("checklist_status"),
        "etf_asset": etf_asset,
        "etf_research_winner": _symbol(etf.get("research_winner")),
        "etf_checklist_candidate": _symbol(etf.get("checklist_candidate")),
        "etf_manual_checklist_symbol": etf_item.get("symbol") or etf_item.get("ticker"),
        "quality_research_winner": _symbol(etf.get("research_winner")),
        "quality_checklist_candidate": _symbol(etf.get("checklist_candidate")),
        "quality_manual_checklist_symbol": etf_item.get("symbol") or etf_item.get("ticker"),
        "safety": safety,
    }


def run_local_smoke_gate() -> dict[str, Any]:
    """Exercise both real routes with deterministic offline, read-only inputs."""
    original_db_path = database.DB_PATH
    portfolio_path = engine.DEFAULT_PORTFOLIO_STATE_PATH
    portfolio_before = portfolio_path.read_bytes()
    with tempfile.TemporaryDirectory(prefix="phoenix-finance-smoke-") as directory:
        database.DB_PATH = Path(directory) / "smoke.db"
        try:
            from jarvis.api.main import app

            database.init_db()
            acceptance_gate._seed_acceptance_evidence()
            ledger_before = database.get_finance_transactions()
            snapshots_before = database.list_finance_portfolio_snapshots()
            with patch(
                "jarvis.api.routers.finance.resolve_best_etf_candidate_with_broker_check",
                side_effect=_smoke_resolution,
            ), patch(
                "jarvis.api.routers.finance.detect_market_regime",
                return_value="risk_on",
            ):
                client = TestClient(app)
                coverage_response = client.get("/finance/data-coverage")
                checklist_response = client.get("/finance/manual-buy-checklist")
            coverage_response.raise_for_status()
            checklist_response.raise_for_status()
            coverage = coverage_response.json()
            checklist = checklist_response.json()
            errors = evaluate_production_smoke(coverage, checklist)
            if portfolio_path.read_bytes() != portfolio_before:
                errors.append("production smoke gate mutated portfolio_state.json")
            if database.get_finance_transactions() != ledger_before:
                errors.append("production smoke gate created or changed ledger transactions")
            if database.list_finance_portfolio_snapshots() != snapshots_before:
                errors.append("production smoke gate created or changed portfolio snapshots")
            return _compact_result("local_offline", coverage, checklist, errors)
        finally:
            database.DB_PATH = original_db_path


def _read_json(url: str) -> dict[str, Any]:
    with urlopen(url, timeout=120) as response:  # noqa: S310 - explicit CLI opt-in
        return json.loads(response.read().decode("utf-8"))


def run_live_smoke_gate(base_url: str) -> dict[str, Any]:
    """Read and cross-check both deployed finance endpoints without writes."""
    base = base_url.rstrip("/")
    coverage = _read_json(f"{base}/finance/data-coverage")
    checklist = _read_json(f"{base}/finance/manual-buy-checklist")
    errors = evaluate_production_smoke(coverage, checklist)
    return _compact_result("live_read_only", coverage, checklist, errors)


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(
        description="Run the PHOENIX production finance smoke gate."
    )
    parser.add_argument(
        "--live-url",
        help="Opt in to read-only deployed finance endpoint checks.",
    )
    args = parser.parse_args(argv)
    result = (
        run_live_smoke_gate(args.live_url)
        if args.live_url
        else run_local_smoke_gate()
    )
    print(json.dumps(result, indent=2))
    return 0 if result["accepted"] else 1


if __name__ == "__main__":
    raise SystemExit(main())
