from datetime import datetime, timezone

import pytest
from pydantic import ValidationError

from jarvis.api.models.cockpit import CockpitMeta, MetricSeries, SeriesPoint


def test_meta_serializes_truthful_history_status() -> None:
    meta = CockpitMeta(
        as_of="2026-06-30",
        generated_at=datetime(2026, 6, 30, 8, 0, tzinfo=timezone.utc),
        source="real_sqlite",
        freshness="fresh",
        confidence="high",
        history_status="INSUFFICIENT_HISTORY",
    )
    assert meta.model_dump(mode="json")["history_status"] == "INSUFFICIENT_HISTORY"


def test_series_accepts_only_real_explicit_points() -> None:
    series = MetricSeries(
        key="portfolio_total",
        label="Portfolio total",
        unit="EUR",
        points=[
            SeriesPoint(
                at="2026-06-30T08:00:00Z",
                value=1248.32,
                source="real_sqlite",
            )
        ],
    )
    assert series.points[0].value == 1248.32


def test_series_rejects_non_finite_values() -> None:
    with pytest.raises(ValidationError):
        SeriesPoint(at="2026-06-30", value=float("nan"), source="test")
