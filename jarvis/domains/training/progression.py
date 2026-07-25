"""Pure workout progression logic.

This module accepts already-loaded session dictionaries. It deliberately has
no database, API, or framework imports.
"""

from __future__ import annotations

import json
from typing import Any

_LOWER_SESSION_TYPES = {"legs", "lower"}
_LOWER_EXERCISE_TERMS = {
    "calf",
    "clean",
    "deadlift",
    "good morning",
    "hamstring",
    "hex bar",
    "hip thrust",
    "leg",
    "lunge",
    "quad",
    "rdl",
    "squat",
}


def _exercises(session: dict[str, Any]) -> list[dict[str, Any]]:
    value = session.get("exercises", [])
    if isinstance(value, str):
        try:
            value = json.loads(value)
        except (TypeError, ValueError):
            return []
    return value if isinstance(value, list) else []


def _sets(exercise: dict[str, Any]) -> list[dict[str, Any]]:
    value = exercise.get("sets", [])
    return value if isinstance(value, list) else []


def _target_hit(exercise: dict[str, Any]) -> bool:
    sets = _sets(exercise)
    if not sets:
        return False

    exercise_target = exercise.get("target_reps")
    for logged_set in sets:
        target = logged_set.get("target_reps", exercise_target)
        if target is None:
            if logged_set.get("completed") is False:
                return False
            continue
        try:
            if float(logged_set.get("reps", 0)) < float(target):
                return False
        except (TypeError, ValueError):
            return False
    return True


def _working_weight(exercise: dict[str, Any]) -> float | None:
    weights = []
    for logged_set in _sets(exercise):
        try:
            weights.append(float(logged_set["weight_kg"]))
        except (KeyError, TypeError, ValueError):
            continue
    return max(weights) if weights else None


def _increment(session: dict[str, Any], exercise: dict[str, Any]) -> float:
    region = str(exercise.get("body_region", "")).strip().lower()
    session_type = str(session.get("session_type", "")).strip().lower()
    name = str(exercise.get("name", "")).strip().lower()
    is_lower = (
        region == "lower"
        or session_type in _LOWER_SESSION_TYPES
        or any(term in name for term in _LOWER_EXERCISE_TERMS)
    )
    return 5.0 if is_lower else 2.5


def _completion_evidence(session: dict[str, Any]) -> dict[str, Any]:
    value = session.get("completion_evidence", {})
    return value if isinstance(value, dict) else {}


def _session_rpe(session: dict[str, Any]) -> float | None:
    value = _completion_evidence(session).get("rpe", session.get("rpe"))
    try:
        return float(value)
    except (TypeError, ValueError):
        return None


def _has_pain_evidence(session: dict[str, Any]) -> bool:
    evidence = _completion_evidence(session)
    return bool(
        evidence.get("pain_confirmed", session.get("pain_confirmed", False))
        or evidence.get("pain_body_areas", session.get("pain_body_areas", ()))
    )


def _session_order_key(session: dict[str, Any]) -> tuple[str, int]:
    try:
        row_id = int(session.get("id", 0))
    except (TypeError, ValueError):
        row_id = 0
    return str(session.get("date", "")), row_id


def calculate_progression(
    session_log: list[dict[str, Any]],
) -> dict[str, dict[str, Any]]:
    """Return the next suggested weight for every exercise in session history.

    Sessions are normalized newest-first using their ISO date and row id. The
    latest occurrence supplies the current working weight. Two consecutive
    misses are evaluated from the latest two occurrences of that exercise.
    """
    ordered_sessions = sorted(
        session_log,
        key=_session_order_key,
        reverse=True,
    )

    occurrences: dict[str, list[tuple[dict[str, Any], dict[str, Any]]]] = {}
    display_names: dict[str, str] = {}
    for session in ordered_sessions:
        for exercise in _exercises(session):
            name = str(exercise.get("name", "")).strip()
            if not name:
                continue
            key = name.casefold()
            display_names.setdefault(key, name)
            occurrences.setdefault(key, []).append((session, exercise))

    suggestions: dict[str, dict[str, Any]] = {}
    for key, exercise_history in occurrences.items():
        latest_session, latest_exercise = exercise_history[0]
        current_weight = _working_weight(latest_exercise)
        if current_weight is None:
            continue

        latest_hit = _target_hit(latest_exercise)
        missed_twice = (
            not latest_hit
            and len(exercise_history) >= 2
            and not _target_hit(exercise_history[1][1])
        )
        rpe = _session_rpe(latest_session)
        pain_evidence = _has_pain_evidence(latest_session)

        if pain_evidence:
            suggested = current_weight
            load_delta = 0.0
            action = "hold"
            reason = "pain_evidence"
            basis = "Pain evidence recorded; hold current weight."
        elif latest_hit and (rpe is None or rpe <= 8):
            increment = _increment(latest_session, latest_exercise)
            suggested = current_weight + increment
            load_delta = increment
            action = "increase"
            reason = "targets_completed"
            basis = f"All sets hit target reps; add {increment:g}kg."
        elif missed_twice:
            suggested = current_weight
            load_delta = 0.0
            action = "hold_or_reduce"
            reason = "missed_reps"
            basis = "Target reps missed in 2 consecutive sessions; deload recommended."
        else:
            suggested = current_weight
            load_delta = 0.0
            action = "hold_or_reduce"
            reason = "high_rpe" if rpe is not None and rpe >= 9 else "missed_reps"
            basis = (
                "RPE was 9 or higher; hold current weight."
                if reason == "high_rpe"
                else "Target reps missed; hold current weight."
            )

        suggestions[display_names[key]] = {
            "suggested_kg": suggested,
            "action": action,
            "load_delta_kg": load_delta,
            "reason": reason,
            "basis": basis,
            "deload": missed_twice,
        }

    return suggestions


def get_next_week_suggestions(
    session_log: list[dict[str, Any]],
) -> dict[str, dict[str, Any]]:
    """Named entry point used by the API history route."""
    return calculate_progression(session_log)


def build_jump_progression(jump_log: list[dict[str, Any]]) -> list[dict[str, Any]]:
    """Pivot jump rows into one chart-friendly record per date."""
    by_date: dict[str, dict[str, Any]] = {}
    for jump in jump_log:
        jump_date = str(jump.get("date", ""))
        jump_type = str(jump.get("jump_type", "")).lower()
        if not jump_date or jump_type not in {"approach", "standing"}:
            continue
        try:
            height = float(jump["height_cm"])
        except (KeyError, TypeError, ValueError):
            continue
        point = by_date.setdefault(jump_date, {"date": jump_date})
        point[jump_type] = max(float(point.get(jump_type, height)), height)
    return [by_date[jump_date] for jump_date in sorted(by_date)]
