"""Read-only finance data coverage and provenance contract tests."""

from pathlib import Path
from unittest.mock import patch

import pytest
from fastapi.testclient import TestClient

from jarvis.api.main import app
from jarvis.data import database
from jarvis.domains.finance import engine
from jarvis.domains.finance.market_data import ETF_CANDIDATE_TICKERS, TICKER_MAP


client = TestClient(app)


def _resolution(sleeve: str) -> dict:
    candidates = []
    for index, configured in enumerate(ETF_CANDIDATE_TICKERS[sleeve]):
        candidates.append(
            {
                **configured,
                "raw_price": 100.0 + index,
                "currency": "EUR",
                "eur_price": 100.0 + index,
                "market_data_source": "yfinance",
                "fetch_status": "ok",
                "lightyear_available": index == 0,
                "lightyear_confidence": "high" if index == 0 else "unresolved",
                "broker_source": "lightyear_public_fund_screener",
                "selected": index == 0,
            }
        )
    return {
        "selected_candidate": candidates[0],
        "candidates": candidates,
        "source": "yfinance",
        "broker_source": "lightyear_public_fund_screener",
        "broker_verification": "verified",
        "confirmation_required": True,
        "confidence": "high",
        "reason": "test fixture",
    }


@pytest.fixture(autouse=True)
def isolated_environment(tmp_path: Path, monkeypatch: pytest.MonkeyPatch):
    monkeypatch.setattr(database, "DB_PATH", tmp_path / "coverage.db")
    database.init_db()
    with patch(
        "jarvis.api.routers.finance.resolve_best_etf_candidate_with_broker_check",
        side_effect=_resolution,
    ), patch(
        "jarvis.api.routers.finance.detect_market_regime", return_value="risk_on"
    ):
        yield


def _coverage() -> dict:
    response = client.get("/finance/data-coverage")
    assert response.status_code == 200
    return response.json()


def test_reports_configured_yfinance_ticker_map_and_crypto_count() -> None:
    data = _coverage()
    sources = data["sections"]["live_price_sources"]
    summary = data["sections"]["coverage_summary"]

    assert sources["source_name"] == "yfinance"
    assert sources["supported_tickers"] == TICKER_MAP
    assert summary["total_live_price_tickers_configured"] == len(TICKER_MAP)
    assert summary["total_crypto_tickers_configured"] == 3


def test_reports_every_etf_candidate_and_small_curated_universe() -> None:
    data = _coverage()
    universe = data["sections"]["etf_candidate_universe"]
    summary = data["sections"]["coverage_summary"]

    assert set(universe["sleeves"]) == set(ETF_CANDIDATE_TICKERS)
    for sleeve, candidates in ETF_CANDIDATE_TICKERS.items():
        assert universe["sleeves"][sleeve]["candidate_count"] == len(candidates)
    assert summary["total_active_etf_sleeves"] == 3
    assert summary["total_etf_candidates_configured"] == 9
    assert summary["universe_type"] == "CURATED_SMALL_UNIVERSE"
    assert any("fewer than 10 ETF candidates" in warning for warning in data["warnings"])


def test_reports_current_recommendation_provenance() -> None:
    data = _coverage()
    legs = data["sections"]["recommendation_data_provenance"]["legs"]
    quality = next(leg for leg in legs if leg["asset"] == "quality_etf")
    btc = next(leg for leg in legs if leg["asset"] == "btc")

    assert quality["provenance_classification"] == "CONFIGURED_CANDIDATE_LIVE_PRICE"
    assert quality["market_data_source"] == "yfinance"
    assert quality["broker_source"] == "lightyear_public_fund_screener"
    assert quality["resolved_candidate"]["symbol"]
    assert quality["broad_search"] is False
    assert btc["provenance_classification"] == "STATIC_CONFIG"


def test_reports_linked_research_evidence_provenance() -> None:
    memo_id = database.create_research_memo(
        {
            "asset": "btc",
            "sleeve": None,
            "title": "BTC evidence",
            "thesis": "Evidence provenance test.",
            "risks": ["Volatility"],
            "data_confidence": "HIGH",
            "verdict": "WATCH",
            "sources": [],
            "validation": {},
            "status": "active",
            "notes": None,
        }
    )
    for field_name, raw_json in (
        (
            "market_data_source",
            {
                "generated_by": "PHOENIX_EVIDENCE_GENERATOR_V1",
                "adapter": "crypto_price_adapter_v1",
                "fetch_status": "success",
                "timestamp": "2026-06-28T10:00:00+00:00",
            },
        ),
        ("manual_cross_check", {}),
    ):
        database.create_research_validation_record(
            {
                "memo_id": memo_id,
                "asset": "btc",
                "check_type": "SOURCE_CONFIDENCE",
                "field_name": field_name,
                "source_primary": (
                    "PHOENIX crypto price adapter / yfinance"
                    if raw_json
                    else "User-reviewed source"
                ),
                "status": "PASS",
                "confidence": "high",
                "raw_json": raw_json,
            }
        )
    database.evaluate_research_memo_quality(memo_id)

    data = _coverage()
    btc = next(
        leg
        for leg in data["sections"]["research_evidence_provenance"]["legs"]
        if leg["asset"] == "btc"
    )
    classes = {record["provenance_classification"] for record in btc["validation_records"]}

    assert btc["memo_id"] == memo_id
    assert btc["research_quality_status"] == "VALIDATED"
    assert btc["evidence_status"] == "EVIDENCE_STRONG"
    assert classes == {"LIVE_MARKET_FETCH", "MANUAL"}


def test_opaque_recommendation_data_blocks_transparency(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(
        "jarvis.api.routers.finance._safe_etf_resolution",
        lambda sleeve: {
            "selected_candidate": None,
            "candidates": [],
            "source": None,
            "broker_source": None,
            "broker_verification": "not_verified",
            "confirmation_required": True,
        },
    )

    data = _coverage()

    assert data["verdict"] == "BLOCKED"
    assert any("unknown provenance" in blocker for blocker in data["blockers"])


def test_safety_flags_and_read_only_state() -> None:
    portfolio_path = engine.DEFAULT_PORTFOLIO_STATE_PATH
    portfolio_before = portfolio_path.read_bytes()
    ledger_before = database.get_finance_transactions()
    briefs_before = database.get_brief_history()

    data = _coverage()

    assert data["sections"]["safety"] == {
        "read_only_audit": True,
        "broker_connection": False,
        "orders_created": False,
        "trades_executed": False,
        "portfolio_state_updated": False,
        "recommendation_overridden": False,
    }
    assert portfolio_path.read_bytes() == portfolio_before
    assert database.get_finance_transactions() == ledger_before == []
    assert database.get_brief_history() == briefs_before == []
