"""Controlled universe expansion and fail-soft resolver tests."""

import sys
from types import SimpleNamespace
from unittest.mock import patch

from jarvis.domains.finance import market_data


def test_etf_universe_has_required_candidate_shape_and_size() -> None:
    candidates = [
        (sleeve, candidate)
        for sleeve, configured in market_data.ETF_CANDIDATE_TICKERS.items()
        for candidate in configured
    ]

    assert len(candidates) >= 15
    for sleeve, candidate in candidates:
        assert candidate["sleeve"] == sleeve
        assert candidate["symbol"]
        assert candidate["label"]
        assert isinstance(candidate["keywords"], list) and candidate["keywords"]


def test_candidate_quote_fetch_is_fail_soft_for_every_configured_candidate() -> None:
    class BrokenTicker:
        @property
        def fast_info(self):
            raise RuntimeError("offline")

    fake_yfinance = SimpleNamespace(Ticker=lambda symbol: BrokenTicker())
    with patch.dict(sys.modules, {"yfinance": fake_yfinance}), patch.object(
        market_data, "_fetch_fx_rates", return_value={}
    ):
        result = market_data.fetch_etf_candidate_quotes("global_core_etf")

    assert len(result["candidates"]) == len(
        market_data.ETF_CANDIDATE_TICKERS["global_core_etf"]
    )
    assert all(candidate["fetch_status"] == "failed" for candidate in result["candidates"])


def test_resolver_deterministically_prefers_high_confidence_verified_candidate() -> None:
    candidates = [
        {
            **candidate,
            "raw_price": 100.0,
            "currency": "EUR",
            "eur_price": 100.0,
            "market_data_source": "yfinance",
            "fetch_status": "ok",
        }
        for candidate in market_data.ETF_CANDIDATE_TICKERS["quality_etf"][:2]
    ]
    broker = {
        "candidates": [
            {
                "symbol": candidates[0]["symbol"],
                "lightyear_available": False,
                "lightyear_confidence": "medium",
                "broker_source": "lightyear_public_fund_screener",
            },
            {
                "symbol": candidates[1]["symbol"],
                "lightyear_available": True,
                "lightyear_confidence": "high",
                "broker_source": "lightyear_public_fund_screener",
            },
        ]
    }
    with patch.object(
        market_data,
        "resolve_best_yfinance_candidate",
        return_value={
            "sleeve_key": "quality_etf",
            "selected_symbol": candidates[0]["symbol"],
            "selected_label": candidates[0]["label"],
            "candidates": [
                {**candidate, "score_components": market_data._score_candidate(candidate, index)}
                for index, candidate in enumerate(candidates)
            ],
            "confidence": "high",
            "source": "yfinance",
            "broker_verification": "not_verified",
            "confirmation_required": True,
            "reason": "fixture",
        },
    ), patch(
        "jarvis.domains.finance.lightyear_catalog.verify_lightyear_candidates",
        return_value=broker,
    ):
        result = market_data.resolve_best_etf_candidate_with_broker_check("quality_etf")

    assert result["selected_symbol"] == candidates[1]["symbol"]
    assert result["broker_verification"] == "verified"
    assert result["broker_source"] == "lightyear_public_fund_screener"
