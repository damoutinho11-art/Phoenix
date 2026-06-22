"""Risk metrics for local market data fixtures."""

from __future__ import annotations

import math
from dataclasses import dataclass
from datetime import timedelta

from .data_contracts import NormalizedMarketDataSnapshot, NormalizedMarketSeries, NormalizedPricePoint


WINDOW_DAYS = {
    "return_1m": 30,
    "return_3m": 90,
    "return_6m": 180,
    "return_12m": 365,
}


@dataclass(frozen=True)
class RiskMetricResult:
    asset_id: str
    currency: str
    latest_price: float
    return_1m: float | None
    return_3m: float | None
    return_6m: float | None
    return_12m: float | None
    annualized_volatility: float | None
    max_drawdown: float
    distance_from_high: float
    data_points: int
    oldest_date: str
    latest_date: str
    warnings: tuple[str, ...]

    def to_dict(self) -> dict[str, object]:
        return {
            "asset_id": self.asset_id,
            "currency": self.currency,
            "latest_price": self.latest_price,
            "return_1m": self.return_1m,
            "return_3m": self.return_3m,
            "return_6m": self.return_6m,
            "return_12m": self.return_12m,
            "annualized_volatility": self.annualized_volatility,
            "max_drawdown": self.max_drawdown,
            "distance_from_high": self.distance_from_high,
            "data_points": self.data_points,
            "oldest_date": self.oldest_date,
            "latest_date": self.latest_date,
            "warnings": list(self.warnings),
        }


def _round_metric(value: float) -> float:
    return round(value, 6)


def _price_on_or_before(
    prices: tuple[NormalizedPricePoint, ...],
    target_date,
) -> NormalizedPricePoint | None:
    candidates = [point for point in prices if point.date <= target_date]
    if not candidates:
        return None
    return candidates[-1]


def _window_return(
    prices: tuple[NormalizedPricePoint, ...],
    latest: NormalizedPricePoint,
    days: int,
) -> float | None:
    start = _price_on_or_before(prices, latest.date - timedelta(days=days))
    if start is None:
        return None
    return _round_metric((latest.close / start.close) - 1.0)


def _annualized_volatility(prices: tuple[NormalizedPricePoint, ...]) -> float | None:
    returns = []
    for previous, current in zip(prices, prices[1:]):
        returns.append(math.log(current.close / previous.close))
    if len(returns) < 2:
        return None
    mean = sum(returns) / len(returns)
    variance = sum((value - mean) ** 2 for value in returns) / (len(returns) - 1)
    return _round_metric(math.sqrt(variance) * math.sqrt(252))


def _max_drawdown(prices: tuple[NormalizedPricePoint, ...]) -> float:
    high = prices[0].close
    max_drawdown = 0.0
    for point in prices:
        high = max(high, point.close)
        drawdown = (point.close / high) - 1.0
        max_drawdown = min(max_drawdown, drawdown)
    return _round_metric(max_drawdown)


def compute_risk_metrics_for_series(series: NormalizedMarketSeries, as_of) -> RiskMetricResult:
    prices = series.prices
    latest = prices[-1]
    high = max(point.close for point in prices)
    warnings: list[str] = []

    returns: dict[str, float | None] = {}
    for metric_name, days in WINDOW_DAYS.items():
        value = _window_return(prices, latest, days)
        returns[metric_name] = value
        if value is None:
            warnings.append(f"{series.asset_id}: insufficient data for {metric_name}.")

    freshness_days = (as_of - latest.date).days
    if series.source_metadata and series.source_metadata.freshness_days is not None:
        freshness_days = series.source_metadata.freshness_days
    if freshness_days > 7:
        warnings.append(f"{series.asset_id}: latest price is older than 7 days from as_of.")
    if len(prices) < 10:
        warnings.append(f"{series.asset_id}: fewer than 10 price points available.")
    if series.currency != "EUR":
        warnings.append(f"{series.asset_id}: currency is {series.currency}; base currency is EUR.")

    volatility = _annualized_volatility(prices)
    if volatility is None:
        warnings.append(f"{series.asset_id}: insufficient data for annualized volatility.")

    return RiskMetricResult(
        asset_id=series.asset_id,
        currency=series.currency,
        latest_price=_round_metric(latest.close),
        return_1m=returns["return_1m"],
        return_3m=returns["return_3m"],
        return_6m=returns["return_6m"],
        return_12m=returns["return_12m"],
        annualized_volatility=volatility,
        max_drawdown=_max_drawdown(prices),
        distance_from_high=_round_metric((latest.close / high) - 1.0),
        data_points=len(prices),
        oldest_date=prices[0].date.isoformat(),
        latest_date=latest.date.isoformat(),
        warnings=tuple(warnings),
    )


def compute_market_risk_metrics(snapshot: NormalizedMarketDataSnapshot) -> list[RiskMetricResult]:
    return [compute_risk_metrics_for_series(series, snapshot.as_of) for series in snapshot.series]
