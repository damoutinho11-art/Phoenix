"""Normalize logged evidence into deterministic planning inputs."""

from __future__ import annotations

from datetime import date
import json
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


def _session_content_key(session: Mapping[str, Any]) -> str:
    return json.dumps(session, default=str, separators=(",", ":"), sort_keys=True)


def _active_receipt(active_plan: Any) -> Mapping[str, Any] | None:
    if active_plan is None:
        return None
    if hasattr(active_plan, "to_mapping"):
        active_plan = active_plan.to_mapping()
    if not isinstance(active_plan, Mapping):
        return None
    payload = active_plan.get("payload")
    if isinstance(payload, Mapping):
        if active_plan.get("plan_id") != payload.get("plan_id"):
            return None
        return payload
    return active_plan


def _planned_date(session: Mapping[str, Any]) -> date | None:
    provenance = session.get("plan_provenance")
    value = (
        provenance.get("date", provenance.get("plan_date"))
        if isinstance(provenance, Mapping)
        else session.get("planned_date", session.get("plan_date"))
    )
    try:
        return date.fromisoformat(str(value))
    except (TypeError, ValueError):
        return None


def _session_plan_id(session: Mapping[str, Any]) -> Any:
    provenance = session.get("plan_provenance")
    return (
        provenance.get("plan_id")
        if isinstance(provenance, Mapping)
        else session.get("plan_id")
    )


def _session_receipt_hash(session: Mapping[str, Any]) -> Any:
    provenance = session.get("plan_provenance")
    return (
        provenance.get("receipt_hash")
        if isinstance(provenance, Mapping)
        else session.get("receipt_hash")
    )


def _sequence_evidence(
    sessions: Sequence[Mapping[str, Any]],
    active_plan: Any,
) -> tuple[int, str | None]:
    receipt = _active_receipt(active_plan)
    if receipt is None:
        return 1, None
    plan_id = receipt.get("plan_id")
    days = receipt.get("days")
    if (
        not isinstance(plan_id, str)
        or not plan_id.strip()
        or not isinstance(days, (list, tuple))
    ):
        return 1, None

    planned_days: dict[date, Mapping[str, Any]] = {}
    for day_value in days:
        if not isinstance(day_value, Mapping):
            return 1, None
        try:
            planned_date = date.fromisoformat(str(day_value.get("date")))
        except (TypeError, ValueError):
            return 1, None
        if planned_date in planned_days:
            return 1, None
        planned_days[planned_date] = day_value

    valid_completions = []
    for session in sessions:
        if not isinstance(session, Mapping) or _session_plan_id(session) != plan_id:
            continue
        planned_date = _planned_date(session)
        planned_day = planned_days.get(planned_date)
        if planned_day is None:
            continue
        intent = session.get("session_intent")
        position = session.get("sequence_position")
        sequence_length = session.get("sequence_length")
        if (
            not isinstance(intent, str)
            or not intent.strip()
            or type(position) is not int
            or position not in range(1, 7)
            or type(sequence_length) is not int
            or sequence_length != 6
            or planned_day.get("session_intent") != intent
            or planned_day.get("sequence_position") != position
            or planned_day.get("sequence_length") != sequence_length
        ):
            continue
        receipt_hash = receipt.get("receipt_hash")
        evidence_hash = _session_receipt_hash(session)
        if receipt_hash is not None and evidence_hash != receipt_hash:
            continue
        valid_completions.append((planned_date, position))

    if not valid_completions:
        return 1, None
    _, latest_position = max(valid_completions)
    return latest_position % 6 + 1, plan_id


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
    active_plan: Any = None,
) -> PlanningSnapshot:
    """Construct the canonical planner input from current evidence."""
    completed_sessions = tuple(sorted(sessions, key=_session_content_key))
    sequence_cursor, sequence_source_plan_id = _sequence_evidence(
        completed_sessions,
        active_plan,
    )
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
        sequence_cursor=sequence_cursor,
        sequence_source_plan_id=sequence_source_plan_id,
    )
