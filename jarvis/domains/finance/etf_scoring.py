"""Offline ETF sleeve scoring for PHOENIX Portfolio OS v0.2."""

from __future__ import annotations

import json
from pathlib import Path
from typing import Any


ETF_SLEEVES = {"global_core_etf", "growth_nasdaq_etf", "quality_etf"}


def load_etf_universe(path: str | Path = "etf_universe.json") -> dict[str, Any]:
    with Path(path).open("r", encoding="utf-8") as file:
        return json.load(file)


def allocation_gap_score(
    current_weight: float, target_weight: float, max_band: float
) -> tuple[float, list[str]]:
    warnings = []
    if current_weight > max_band:
        warnings.append("Sleeve is above max band; ETF score forced to 0.")
        return 0.0, warnings
    if current_weight >= target_weight:
        return 0.0, warnings

    gap = target_weight - current_weight
    return min(100.0, max(0.0, (gap / target_weight) * 100.0)), warnings


def score_etf_sleeve(
    sleeve: str, config: dict[str, Any], current_weight: float
) -> dict[str, Any]:
    target_weight = float(config["target"])
    min_band, max_band = [float(value) for value in config["allowed_band"]]
    warnings = []

    enabled = bool(config.get("enabled", False))
    gap = target_weight - current_weight
    gap_component, gap_warnings = allocation_gap_score(
        current_weight, target_weight, max_band
    )
    warnings.extend(gap_warnings)

    if not enabled:
        warnings.append("ETF sleeve is disabled; ETF score forced to 0.")

    inverse_concentration = 100.0 - float(config["concentration_penalty"])
    components = {
        "allocation_gap_score": round(gap_component, 4),
        "momentum_score": float(config["momentum_score"]),
        "valuation_risk_score": float(config["valuation_risk_score"]),
        "inverse_concentration_score": inverse_concentration,
        "fee_liquidity_score": float(config["fee_liquidity_score"]),
    }

    if enabled and not gap_warnings:
        final_score = (
            0.45 * components["allocation_gap_score"]
            + 0.25 * components["momentum_score"]
            + 0.15 * components["valuation_risk_score"]
            + 0.10 * components["inverse_concentration_score"]
            + 0.05 * components["fee_liquidity_score"]
        )
    else:
        final_score = 0.0

    return {
        "sleeve": sleeve,
        "role": config["role"],
        "preferred_candidate": config["preferred_candidate"],
        "fallback_candidate": config.get("fallback_candidate"),
        "current_weight": current_weight,
        "target_weight": target_weight,
        "allocation_gap": gap,
        "allowed_band": [min_band, max_band],
        "enabled": enabled,
        "score_components": components,
        "final_score": round(final_score, 4),
        "warnings": warnings,
    }


def score_etf_universe(
    universe: dict[str, Any], current_weights: dict[str, float]
) -> dict[str, dict[str, Any]]:
    return {
        sleeve: score_etf_sleeve(sleeve, config, current_weights.get(sleeve, 0.0))
        for sleeve, config in universe.items()
    }


def rank_eligible_etfs(scores: dict[str, dict[str, Any]]) -> list[dict[str, Any]]:
    eligible = [
        score
        for score in scores.values()
        if score["enabled"] and score["final_score"] > 0
    ]
    eligible.sort(key=lambda item: (-item["final_score"], item["sleeve"]))
    return eligible
