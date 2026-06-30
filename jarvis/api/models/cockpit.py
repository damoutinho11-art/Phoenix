from datetime import datetime
from enum import Enum
from math import isfinite

from pydantic import BaseModel, field_validator


class Freshness(str, Enum):
    FRESH = "fresh"
    STALE = "stale"
    UNKNOWN = "unknown"


class Confidence(str, Enum):
    HIGH = "high"
    MEDIUM = "medium"
    LOW = "low"
    UNKNOWN = "unknown"


class HistoryStatus(str, Enum):
    READY = "READY"
    INSUFFICIENT_HISTORY = "INSUFFICIENT_HISTORY"
    EMPTY = "EMPTY"


class CockpitMeta(BaseModel):
    as_of: str
    generated_at: datetime
    source: str
    freshness: Freshness
    confidence: Confidence
    history_status: HistoryStatus


class SeriesPoint(BaseModel):
    at: str
    value: float
    source: str

    @field_validator("value")
    @classmethod
    def value_must_be_finite(cls, value: float) -> float:
        if not isfinite(value):
            raise ValueError("series values must be finite")
        return value


class MetricSeries(BaseModel):
    key: str
    label: str
    unit: str
    points: list[SeriesPoint]
