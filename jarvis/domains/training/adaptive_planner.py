from dataclasses import dataclass, replace
from datetime import date, timedelta
from typing import Any, Mapping

from .engine import plan_week_sessions
from .plan_contracts import (
    PlanDay,
    PlanValidation,
    TrainingConstraint,
    WeeklyPlanReceipt,
    iso_cycle_id,
)

PLANNER_VERSION = "adaptive-v1"

_PHASE_EXERCISE_KEYS = {
    "explosive_lift": "explosive_exercise",
    "knee_extension_lift": "knee_extension",
    "posterior_chain": "posterior_chain",
    "lower_leg": "lower_leg",
    "push": "general_push",
    "pull": "general_pull",
    "shoulder": "general_shoulder",
}


@dataclass(frozen=True)
class PlanningSnapshot:
    week_start: date
    created_at: str
    completed_sessions: tuple[dict[str, Any], ...]
    readiness: dict[str, Any] | None
    calendar_events: tuple[dict[str, Any], ...]
    progression: Mapping[str, dict[str, Any]]
    equipment: tuple[str, ...]
    preferences: tuple[tuple[str, Any], ...]


def _objective(session_type: str) -> str:
    return {
        "high_intensity": "jump_strength",
        "jump": "jump_skill",
        "general": "general_strength",
        "iso_only": "joint_capacity",
        "rest": "recovery",
    }.get(session_type, session_type)


def validate_plan(days, policy):
    validations = [
        PlanValidation(
            "seven_unique_days",
            len(days) == 7 and len({day.date for day in days}) == 7,
            "hard",
            "Plan contains seven unique dates",
        )
    ]
    return tuple(validations)


def _values(constraint):
    return dict(constraint.values)


def _compose_reason(existing_reason, reason):
    return f"{existing_reason};{reason}" if existing_reason else reason


def _append_reason(day, reason):
    return replace(day, change_reason=_compose_reason(day.change_reason, reason))


def _update_for_change(day, reason, **changes):
    updated = replace(day, **changes)
    return _append_reason(updated, reason) if updated != day else day


def _movement_family(exercise, movement_families):
    for family, exercises in movement_families.items():
        if exercise in exercises:
            return family
    return None


def _replace_exercise(planned, values, constitution):
    movement_families = constitution["adaptive_planner"]["movement_families"]
    source, target = values["from"], values["to"]
    source_family = _movement_family(source, movement_families)
    target_family = _movement_family(target, movement_families)
    if source_family is None or source_family != target_family:
        raise ValueError("Replacement must preserve movement family")

    key = values["date"]
    day = planned[key]
    exercises = tuple(
        {**exercise, "name": target} if exercise.get("name") == source else exercise
        for exercise in day.exercises
    )
    planned[key] = _update_for_change(
        day,
        f"exercise_replaced:{source}:{target}",
        exercises=exercises,
    )
    return planned


def _equipment_for(exercise, exercise_equipment):
    requirements = exercise_equipment.get(exercise)
    return set(requirements) if requirements is not None else None


def _first_available_substitute(
    exercise,
    available,
    movement_families,
    exercise_equipment,
    excluded=(),
):
    family = _movement_family(exercise, movement_families)
    if family is None:
        return None
    excluded = set(excluded)
    for candidate in movement_families[family]:
        requirements = _equipment_for(candidate, exercise_equipment)
        if candidate not in excluded and requirements is not None and requirements <= available:
            return candidate
    return None


def _first_configured_substitute(exercise, movement_families, exercise_equipment, excluded=()):
    family = _movement_family(exercise, movement_families)
    if family is None:
        return None
    excluded = set(excluded)
    for candidate in movement_families[family]:
        if candidate not in excluded and _equipment_for(candidate, exercise_equipment) is not None:
            return candidate
    return None


def _apply_exercise_updates(day, exercises, reasons):
    updated = replace(day, exercises=exercises) if exercises != day.exercises else day
    for reason in reasons:
        updated = _append_reason(updated, reason)
    return updated


def _apply_availability_or_preference(planned, constraint, constitution):
    values = _values(constraint)
    policy = constitution["adaptive_planner"]
    movement_families = policy["movement_families"]
    exercise_equipment = policy["exercise_equipment"]
    if constraint.kind == "unavailable":
        key = values["date"]
        planned[key] = _update_for_change(
            planned[key],
            "unavailable",
            session_type="rest",
            objective="recovery",
            exercises=(),
            estimated_minutes=0,
        )
        return planned

    keys = (values["date"],) if "date" in values else tuple(sorted(planned))
    for key in keys:
        day = planned[key]
        exercises = []
        reasons = []
        for exercise in day.exercises:
            source = exercise.get("name")
            if constraint.kind == "equipment_available":
                available = set(values["equipment"])
                requirements = _equipment_for(source, exercise_equipment)
                if requirements is None:
                    exercises.append(exercise)
                    reasons.append(f"equipment_retained:{source}:unknown_equipment")
                    continue
                if requirements <= available:
                    exercises.append(exercise)
                    continue
                target = _first_available_substitute(
                    source,
                    available,
                    movement_families,
                    exercise_equipment,
                )
                if target is None or target == source:
                    exercises.append(exercise)
                    reasons.append(f"equipment_retained:{source}:no_valid_substitute")
                    continue
                exercises.append({**exercise, "name": target})
                reasons.append(f"equipment_substituted:{source}:{target}")
            else:
                preferred = values["exercise"]
                preference = values["avoid_or_prefer"]
                source_family = _movement_family(source, movement_families)
                preferred_family = _movement_family(preferred, movement_families)
                if (
                    source_family is None
                    or preferred_family is None
                    or source_family != preferred_family
                ):
                    target = None
                elif preference == "avoid" and source == preferred:
                    target = _first_configured_substitute(
                        source,
                        movement_families,
                        exercise_equipment,
                        excluded=(preferred,),
                    )
                elif preference == "prefer":
                    target = preferred if _equipment_for(preferred, exercise_equipment) is not None else None
                else:
                    target = None
                if target is None or target == source:
                    exercises.append(exercise)
                    continue
                exercises.append({**exercise, "name": target})
                reasons.append(f"preference_substituted:{source}:{target}")

        planned[key] = _apply_exercise_updates(day, tuple(exercises), reasons)
    return planned


def apply_constraints(days, constraints, constitution):
    planned = {day.date.isoformat(): day for day in days}
    for constraint in constraints:
        values = _values(constraint)
        if constraint.kind == "move_session":
            source, target = values["source_date"], values["target_date"]
            if source == target:
                continue
            moving = planned[source]
            displaced = planned[target]
            planned[source] = _update_for_change(
                planned[source],
                f"moved_to:{target}",
                session_type="rest",
                objective="recovery",
                exercises=(),
                estimated_minutes=0,
            )
            planned[target] = _update_for_change(
                moving,
                f"moved_from:{source}",
                date=date.fromisoformat(target),
            )
            if displaced.session_type != "rest":
                next_key = (date.fromisoformat(target) + timedelta(days=1)).isoformat()
                if next_key in planned:
                    planned[next_key] = _update_for_change(
                        planned[next_key],
                        f"volume_reduced_after_move:{target}",
                        estimated_minutes=min(planned[next_key].estimated_minutes, 40),
                    )
        elif constraint.kind == "skip_session":
            key = values["date"]
            planned[key] = _update_for_change(
                planned[key],
                "user_skip",
                session_type="rest",
                objective="recovery",
                exercises=(),
                estimated_minutes=0,
            )
        elif constraint.kind == "time_limit":
            key = values["date"]
            planned[key] = _update_for_change(
                planned[key],
                "time_limit",
                estimated_minutes=min(planned[key].estimated_minutes, int(values["minutes"])),
            )
        elif constraint.kind == "replace_exercise":
            planned = _replace_exercise(planned, values, constitution)
        elif constraint.kind in {"equipment_available", "exercise_preference", "unavailable"}:
            planned = _apply_availability_or_preference(planned, constraint, constitution)
    return tuple(planned[key] for key in sorted(planned))


def _session_exercises(session, constitution):
    phase_prescription = constitution["mesocycle_progression"].get(session.phase.value, {})
    return tuple(
        {"name": phase_prescription.get(_PHASE_EXERCISE_KEYS.get(group), group)}
        for group in session.session_order
    )


def generate_weekly_plan(constitution, snapshot, constraints=()):
    sessions = plan_week_sessions(constitution, snapshot.week_start)
    days = tuple(
        PlanDay(
            date=session.date,
            session_type=session.session_type.value,
            objective=_objective(session.session_type.value),
            exercises=_session_exercises(session, constitution),
            estimated_minutes=0 if session.session_type.value == "rest" else 60,
        )
        for session in sessions
    )
    policy = constitution["adaptive_planner"]
    days = apply_constraints(days, constraints, constitution)
    validations = validate_plan(days, policy)
    if any(not row.passed and row.severity == "hard" for row in validations):
        raise ValueError("Baseline weekly plan violates hard rules")
    return WeeklyPlanReceipt.create(
        parent_plan_id=None,
        constitution_version=str(constitution["version"]),
        planner_version=PLANNER_VERSION,
        cycle_id=iso_cycle_id(snapshot.week_start),
        days=days,
        constraints=tuple(constraints),
        validations=validations,
        created_at=snapshot.created_at,
        status="proposed",
    )
