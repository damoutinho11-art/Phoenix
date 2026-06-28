"""Normalized read-only data contracts for PHOENIX source adapters."""

from __future__ import annotations

from dataclasses import dataclass
from datetime import date


SOURCE_QUALITY_VALUES = {
    "fixture",
    "manual_csv",
    "export_file",
    "api_snapshot",
    "api_historical",
}


@dataclass(frozen=True)
class SourceMetadata:
    source_id: str
    source_name: str
    source_quality: str
    as_of: date
    retrieved_at: date | None = None
    freshness_days: int | None = None
    read_only: bool = True

    def __post_init__(self) -> None:
        if self.source_quality not in SOURCE_QUALITY_VALUES:
            raise ValueError(f"source_quality {self.source_quality} is not supported.")
        if not self.read_only:
            raise ValueError("source metadata must be read-only.")


@dataclass(frozen=True)
class NormalizedPricePoint:
    date: date
    close: float


@dataclass(frozen=True)
class NormalizedMarketSeries:
    asset_id: str
    currency: str
    prices: tuple[NormalizedPricePoint, ...]
    source_metadata: SourceMetadata | None = None


@dataclass(frozen=True)
class NormalizedMarketDataSnapshot:
    as_of: date
    base_currency: str
    series: tuple[NormalizedMarketSeries, ...]
    source_metadata: SourceMetadata | None = None


@dataclass(frozen=True)
class NormalizedPortfolioAccount:
    account_id: str
    platform: str
    role: str
    currency: str
    source_metadata: SourceMetadata | None = None


@dataclass(frozen=True)
class NormalizedPortfolioHolding:
    account_id: str
    asset_id: str
    asset_type: str
    market_value: float
    currency: str
    classification: str | None = None


@dataclass(frozen=True)
class NormalizedPortfolioSnapshot:
    as_of: date
    base_currency: str
    accounts: tuple[NormalizedPortfolioAccount, ...]
    holdings: tuple[NormalizedPortfolioHolding, ...]
    source_metadata: SourceMetadata | None = None


@dataclass(frozen=True)
class NormalizedTransaction:
    transaction_id: str
    account_id: str
    asset_id: str
    transaction_type: str
    trade_date: date
    amount: float
    currency: str
    source_metadata: SourceMetadata | None = None
