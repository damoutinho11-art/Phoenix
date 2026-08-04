"""Normalize logged evidence into deterministic planning inputs."""

from __future__ import annotations

from datetime import date
import json
import math
from typing import Any, Mapping, Sequence

from .adaptive_planner import PlanningSnapshot
from .performance_hybrid import HYBRID_SEQUENCE
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
_SEQUENCE_LENGTH = len(HYBRID_SEQUENCE)


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


def _active_sequence_start(
    receipt: Mapping[str, Any],
) -> tuple[int, str | None]:
    plan_id = receipt.get("plan_id")
    if (
        receipt.get("constitution_version") != "2"
        or receipt.get("planner_version") != "adaptive-v2"
        or not isinstance(plan_id, str)
        or not plan_id.strip()
    ):
        return 1, None

    replay_inputs = receipt.get("replay_inputs")
    snapshot = (
        replay_inputs.get("snapshot")
        if isinstance(replay_inputs, Mapping)
        else None
    )
    explicit_cursor = (
        snapshot.get("sequence_cursor")
        if isinstance(snapshot, Mapping)
        else None
    )
    if (
        type(explicit_cursor) is int
        and explicit_cursor in range(1, _SEQUENCE_LENGTH + 1)
    ):
        return explicit_cursor, plan_id

    dated_training_days: list[tuple[date, int]] = []
    days = receipt.get("days")
    if not isinstance(days, (list, tuple)):
        return 1, None
    for day_value in days:
        if not isinstance(day_value, Mapping):
            return 1, None
        position = day_value.get("sequence_position")
        if position is None:
            continue
        intent = day_value.get("session_intent")
        sequence_length = day_value.get("sequence_length")
        try:
            planned_date = date.fromisoformat(str(day_value.get("date")))
        except (TypeError, ValueError):
            return 1, None
        if (
            type(position) is not int
            or position not in range(1, _SEQUENCE_LENGTH + 1)
            or type(sequence_length) is not int
            or sequence_length != _SEQUENCE_LENGTH
            or intent != HYBRID_SEQUENCE[position - 1]
        ):
            return 1, None
        dated_training_days.append((planned_date, position))
    if not dated_training_days:
        return 1, None
    return min(dated_training_days)[1], plan_id


def _consumed_session_keys(receipt: Mapping[str, Any]) -> set[str]:
    replay_inputs = receipt.get("replay_inputs")
    snapshot = (
        replay_inputs.get("snapshot")
        if isinstance(replay_inputs, Mapping)
        else None
    )
    completed_sessions = (
        snapshot.get("completed_sessions")
        if isinstance(snapshot, Mapping)
        else None
    )
    if not isinstance(completed_sessions, (list, tuple)):
        return set()
    return {
        _session_content_key(session)
        for session in completed_sessions
        if isinstance(session, Mapping)
    }


def _finite_number(value: Any, *, positive: bool = False) -> bool:
    if isinstance(value, bool) or not isinstance(value, (int, float)):
        return False
    numeric = float(value)
    return math.isfinite(numeric) and (numeric > 0 if positive else numeric >= 0)


def _has_actual_completion_proof(session: Mapping[str, Any]) -> bool:
    evidence = session.get("completion_evidence")
    if not isinstance(evidence, Mapping):
        return False
    duration = evidence.get("duration_seconds")
    rpe = evidence.get("rpe")
    pain_confirmed = evidence.get("pain_confirmed")
    pain_body_areas = evidence.get("pain_body_areas")
    if (
        type(duration) is not int
        or duration not in range(0, 86401)
        or type(rpe) is not int
        or rpe not in range(1, 11)
        or type(pain_confirmed) is not bool
        or not isinstance(pain_body_areas, (list, tuple))
        or any(area not in AREA_KEYS for area in pain_body_areas)
        or (pain_confirmed and not pain_body_areas)
    ):
        return False

    exercises = session.get("exercises")
    if not isinstance(exercises, (list, tuple)) or not exercises:
        return False
    for exercise in exercises:
        if not isinstance(exercise, Mapping):
            return False
        name = exercise.get("name")
        sets = exercise.get("sets")
        if (
            not isinstance(name, str)
            or not name.strip()
            or not isinstance(sets, (list, tuple))
            or not sets
        ):
            return False
        for logged_set in sets:
            if (
                not isinstance(logged_set, Mapping)
                or not _finite_number(logged_set.get("reps"))
                or not _finite_number(logged_set.get("weight_kg"))
            ):
                return False
    return True


def _sequence_evidence(
    sessions: Sequence[Mapping[str, Any]],
    active_plan: Any,
) -> tuple[int, str | None]:
    receipt = _active_receipt(active_plan)
    if receipt is None:
        return 1, None
    starting_cursor, source_plan_id = _active_sequence_start(receipt)
    if source_plan_id is None:
        return 1, None
    plan_id = receipt.get("plan_id")
    days = receipt.get("days")
    if (
        not isinstance(days, (list, tuple))
    ):
        return starting_cursor, source_plan_id

    planned_days: dict[date, Mapping[str, Any]] = {}
    for day_value in days:
        if not isinstance(day_value, Mapping):
            return starting_cursor, source_plan_id
        try:
            planned_date = date.fromisoformat(str(day_value.get("date")))
        except (TypeError, ValueError):
            return starting_cursor, source_plan_id
        if planned_date in planned_days:
            return starting_cursor, source_plan_id
        planned_days[planned_date] = day_value

    consumed_keys = _consumed_session_keys(receipt)
    valid_completion_dates: set[date] = set()
    for session in sessions:
        if (
            not isinstance(session, Mapping)
            or _session_content_key(session) in consumed_keys
            or not _has_actual_completion_proof(session)
            or _session_plan_id(session) != plan_id
        ):
            continue
        planned_date = _planned_date(session)
        planned_day = planned_days.get(planned_date)
        if planned_day is None:
            continue
        try:
            completed_date = date.fromisoformat(str(session.get("date")))
        except (TypeError, ValueError):
            continue
        if completed_date != planned_date:
            continue
        intent = session.get("session_intent")
        position = session.get("sequence_position")
        sequence_length = session.get("sequence_length")
        if (
            not isinstance(intent, str)
            or not intent.strip()
            or type(position) is not int
            or position not in range(1, _SEQUENCE_LENGTH + 1)
            or type(sequence_length) is not int
            or sequence_length != _SEQUENCE_LENGTH
            or intent != HYBRID_SEQUENCE[position - 1]
            or planned_day.get("session_intent") != intent
            or planned_day.get("sequence_position") != position
            or planned_day.get("sequence_length") != sequence_length
        ):
            continue
        receipt_hash = receipt.get("receipt_hash")
        evidence_hash = _session_receipt_hash(session)
        if receipt_hash is not None and evidence_hash != receipt_hash:
            continue
        valid_completion_dates.add(planned_date)

    next_position = starting_cursor
    for planned_date, planned_day in sorted(planned_days.items()):
        position = planned_day.get("sequence_position")
        if position is None:
            continue
        if type(position) is not int or position != next_position:
            return starting_cursor, source_plan_id
        if planned_date not in valid_completion_dates:
            break
        next_position = next_position % _SEQUENCE_LENGTH + 1
    return next_position, plan_id


def next_sequence_position(
    sessions: Sequence[Mapping[str, Any]],
    active_plan: Any,
) -> int:
    """Return the next executable hybrid position from contiguous actual evidence."""
    return _sequence_evidence(sessions, active_plan)[0]


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
