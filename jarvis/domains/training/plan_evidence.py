"""Normalize logged evidence into deterministic planning inputs."""

from __future__ import annotations

from datetime import date
from typing import Any, Mapping, Sequence

from .adaptive_planner import PlanningSnapshot
from .progression import calculate_progression

AREA_KEYS = (
    "knee",
    "ankle",
    "hip",
    "hamstring",
    "calf_achilles",
    "lower_back_pelvic",
)
_HARD_PAIN_FLAGS = ("pain", "sharp_pain", "limping", "next_day_worsening")


def pain_blocked_areas(readiness: Mapping[str, Any] | None) -> tuple[str, ...]:
    """Return the affected areas when a hard pain signal is present."""
    if not readiness or not any(bool(readiness.get(flag)) for flag in _HARD_PAIN_FLAGS):
        return ()
    return tuple(
        area for area in AREA_KEYS if int(readiness.get(area, 0)) > 0
    ) or ("global",)


def build_planning_snapshot(
    *,
    week_start: date,
    created_at: str,
    sessions: Sequence[dict[str, Any]],
    readiness: dict[str, Any] | None,
    calendar_events: Sequence[dict[str, Any]],
    equipment: Sequence[str],
    preferences: Mapping[str, Any],
) -> PlanningSnapshot:
    """Construct the canonical planner input from current evidence."""
    completed_sessions = tuple(sessions)
    return PlanningSnapshot(
        week_start=week_start,
        created_at=created_at,
        completed_sessions=completed_sessions,
        readiness=readiness,
        calendar_events=tuple(calendar_events),
        progression=calculate_progression(list(completed_sessions)),
        equipment=tuple(sorted(set(equipment))),
        preferences=tuple(sorted(preferences.items())),
        safety_blocks=pain_blocked_areas(readiness),
    )
