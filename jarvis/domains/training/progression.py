"""Pure workout progression logic.

This module accepts already-loaded session dictionaries. It deliberately has
no database, API, or framework imports.
"""

from __future__ import annotations

from datetime import date
import json
import math
from typing import Any, Mapping

from .performance_hybrid import HYBRID_SEQUENCE

_LOWER_SESSION_TYPES = {"legs", "lower"}
_PLAN_CLAIM_FIELDS = (
    "plan_provenance",
    "plan_id",
    "receipt_hash",
    "planned_date",
    "plan_date",
)
_HYBRID_CLAIM_FIELDS = (
    "session_intent",
    "sequence_position",
    "sequence_length",
)
_LEGACY_EVIDENCE = "legacy"
_PLANNED_EVIDENCE = "planned"
_MALFORMED_EVIDENCE = "malformed"
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


def _finite_number(value: Any, *, positive: bool = False) -> float | None:
    if isinstance(value, bool) or not isinstance(value, (int, float)):
        return None
    numeric = float(value)
    if not math.isfinite(numeric):
        return None
    if positive and numeric <= 0:
        return None
    if not positive and numeric < 0:
        return None
    return numeric


def _actual_results(exercise: dict[str, Any]) -> tuple[bool, bool]:
    sets = _sets(exercise)
    if not sets:
        return False, False

    exercise_target = exercise.get("target_reps")
    for logged_set in sets:
        if not isinstance(logged_set, dict):
            return False, False
        target = logged_set.get("target_reps", exercise_target)
        target_reps = _finite_number(target, positive=True)
        actual_reps = _finite_number(logged_set.get("reps"))
        actual_load = _finite_number(logged_set.get("weight_kg"))
        if target_reps is None or actual_reps is None or actual_load is None:
            return False, False
        if actual_reps < target_reps:
            return True, False
    return True, True


def _working_weight(exercise: dict[str, Any]) -> float | None:
    weights = []
    for logged_set in _sets(exercise):
        if not isinstance(logged_set, dict):
            continue
        weight = _finite_number(logged_set.get("weight_kg"))
        if weight is not None:
            weights.append(weight)
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


def _session_rpe(session: dict[str, Any]) -> tuple[bool, float | None]:
    value = _completion_evidence(session).get("rpe", session.get("rpe"))
    rpe = _finite_number(value, positive=True)
    if rpe is None or rpe > 10:
        return False, None
    return True, rpe


def _planned_evidence_kind(session: dict[str, Any]) -> str:
    claims_plan = any(field in session for field in _PLAN_CLAIM_FIELDS)
    claims_hybrid = any(field in session for field in _HYBRID_CLAIM_FIELDS)
    if not claims_plan and not claims_hybrid:
        return _LEGACY_EVIDENCE

    provenance = session.get("plan_provenance")
    if not isinstance(provenance, Mapping):
        return _MALFORMED_EVIDENCE
    plan_id = provenance.get("plan_id")
    receipt_hash = provenance.get("receipt_hash")
    planned_date = provenance.get("date", provenance.get("plan_date"))
    if (
        not isinstance(plan_id, str)
        or not plan_id.strip()
        or not isinstance(receipt_hash, str)
        or not receipt_hash.strip()
    ):
        return _MALFORMED_EVIDENCE
    try:
        parsed_planned_date = date.fromisoformat(str(planned_date))
        completed_date = date.fromisoformat(str(session.get("date")))
    except (TypeError, ValueError):
        return _MALFORMED_EVIDENCE
    if parsed_planned_date != completed_date:
        return _MALFORMED_EVIDENCE

    top_level_matches = (
        ("plan_id", plan_id),
        ("receipt_hash", receipt_hash),
        ("planned_date", parsed_planned_date.isoformat()),
        ("plan_date", parsed_planned_date.isoformat()),
    )
    if any(
        field in session and str(session[field]) != expected
        for field, expected in top_level_matches
    ):
        return _MALFORMED_EVIDENCE

    if not claims_hybrid:
        return _PLANNED_EVIDENCE
    intent = session.get("session_intent")
    position = session.get("sequence_position")
    sequence_length = session.get("sequence_length")
    if (
        not isinstance(intent, str)
        or not intent.strip()
        or type(position) is not int
        or position not in range(1, len(HYBRID_SEQUENCE) + 1)
        or type(sequence_length) is not int
        or sequence_length != len(HYBRID_SEQUENCE)
        or intent != HYBRID_SEQUENCE[position - 1]
    ):
        return _MALFORMED_EVIDENCE
    return _PLANNED_EVIDENCE


def _progression_evidence(
    session: dict[str, Any],
) -> tuple[str, bool, float | None]:
    evidence_kind = _planned_evidence_kind(session)
    if evidence_kind == _LEGACY_EVIDENCE:
        return evidence_kind, True, None
    if evidence_kind == _MALFORMED_EVIDENCE:
        return evidence_kind, False, None
    rpe_valid, rpe = _session_rpe(session)
    return evidence_kind, rpe_valid, rpe


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

        latest_valid, latest_hit = _actual_results(latest_exercise)
        previous_valid = False
        previous_hit = False
        previous_session_valid = False
        if len(exercise_history) >= 2:
            previous_session, previous_exercise = exercise_history[1]
            previous_valid, previous_hit = _actual_results(previous_exercise)
            _, previous_session_valid, _ = _progression_evidence(previous_session)
        evidence_kind, session_valid, rpe = _progression_evidence(latest_session)
        missed_twice = (
            latest_valid
            and session_valid
            and not latest_hit
            and len(exercise_history) >= 2
            and previous_valid
            and previous_session_valid
            and not previous_hit
        )
        pain_evidence = _has_pain_evidence(latest_session)

        if pain_evidence:
            suggested = current_weight
            load_delta = 0.0
            action = "hold"
            reason = "pain_evidence"
            basis = "Pain evidence recorded; hold current weight."
        elif not latest_valid or not session_valid:
            suggested = current_weight
            load_delta = 0.0
            action = "hold_or_reduce"
            reason = "invalid_evidence"
            basis = "Progression evidence is incomplete or invalid; hold current weight."
        elif latest_hit and (evidence_kind == _LEGACY_EVIDENCE or rpe <= 8):
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
            reason = (
                "high_rpe"
                if evidence_kind == _PLANNED_EVIDENCE and rpe >= 9
                else "missed_reps"
            )
            basis = (
                "RPE was 9 or higher; hold current weight."
                if reason == "high_rpe"
                else "Target reps missed; hold current weight."
            )

        suggestion = {
            "suggested_kg": suggested,
            "basis": basis,
            "deload": missed_twice,
        }
        if evidence_kind != _LEGACY_EVIDENCE:
            suggestion.update(
                {
                    "action": action,
                    "load_delta_kg": load_delta,
                    "reason": reason,
                }
            )
        suggestions[display_names[key]] = suggestion

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
