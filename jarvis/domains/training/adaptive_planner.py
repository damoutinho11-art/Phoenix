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
    planned[key] = replace(
        day,
        exercises=exercises,
        change_reason=f"exercise_replaced:{source}:{target}",
    )
    return planned


def _equipment_for(exercise):
    return {
        "back_squat": {"barbell", "rack"},
        "split_squat": {"barbell"},
        "leg_press": {"leg_press"},
        "hip_thrust": {"barbell"},
        "rdl": {"barbell"},
        "back_extension": set(),
        "hex_bar_jump": {"hex_bar"},
        "power_clean": {"barbell", "rack"},
        "approach_jump": set(),
    }.get(exercise, set())


def _first_available_substitute(exercise, available, movement_families, excluded=()):
    family = _movement_family(exercise, movement_families)
    if family is None:
        return None
    excluded = set(excluded)
    for candidate in movement_families[family]:
        if candidate not in excluded and _equipment_for(candidate) <= available:
            return candidate
    return None


def _apply_availability_or_preference(planned, constraint, constitution):
    values = _values(constraint)
    movement_families = constitution["adaptive_planner"]["movement_families"]
    if constraint.kind == "unavailable":
        key = values["date"]
        planned[key] = replace(
            planned[key],
            session_type="rest",
            objective="recovery",
            exercises=(),
            estimated_minutes=0,
            change_reason="unavailable",
        )
        return planned

    keys = (values["date"],) if "date" in values else tuple(sorted(planned))
    for key in keys:
        day = planned[key]
        replacements = []
        for exercise in day.exercises:
            source = exercise.get("name")
            if constraint.kind == "equipment_available":
                available = set(values["equipment"])
                target = _first_available_substitute(source, available, movement_families)
                reason = "equipment_substituted"
            else:
                preferred = values["exercise"]
                preference = values["avoid_or_prefer"]
                if _movement_family(source, movement_families) != _movement_family(preferred, movement_families):
                    target = None
                elif preference == "avoid" and source == preferred:
                    target = _first_available_substitute(
                        source,
                        set().union(*(_equipment_for(name) for name in movement_families[_movement_family(source, movement_families)])),
                        movement_families,
                        excluded=(preferred,),
                    )
                elif preference == "prefer":
                    target = preferred
                else:
                    target = None
                reason = "preference_substituted"
            replacements.append((source, target, reason))

        changed = next((item for item in replacements if item[1] and item[1] != item[0]), None)
        if changed:
            source, target, reason = changed
            exercises = tuple(
                {**exercise, "name": target} if exercise.get("name") == source else exercise
                for exercise in day.exercises
            )
            planned[key] = replace(
                day,
                exercises=exercises,
                change_reason=f"{reason}:{source}:{target}",
            )
    return planned


def apply_constraints(days, constraints, constitution):
    planned = {day.date.isoformat(): day for day in days}
    for constraint in constraints:
        values = _values(constraint)
        if constraint.kind == "move_session":
            source, target = values["source_date"], values["target_date"]
            moving = planned[source]
            displaced = planned[target]
            planned[source] = replace(
                planned[source],
                session_type="rest",
                objective="recovery",
                exercises=(),
                estimated_minutes=0,
                change_reason=f"moved_to:{target}",
            )
            planned[target] = replace(
                moving,
                date=date.fromisoformat(target),
                change_reason=f"moved_from:{source}",
            )
            if displaced.session_type != "rest":
                next_key = (date.fromisoformat(target) + timedelta(days=1)).isoformat()
                if next_key in planned:
                    planned[next_key] = replace(
                        planned[next_key],
                        estimated_minutes=min(planned[next_key].estimated_minutes, 40),
                        change_reason=f"volume_reduced_after_move:{target}",
                    )
        elif constraint.kind == "skip_session":
            key = values["date"]
            planned[key] = replace(
                planned[key],
                session_type="rest",
                objective="recovery",
                exercises=(),
                estimated_minutes=0,
                change_reason="user_skip",
            )
        elif constraint.kind == "time_limit":
            key = values["date"]
            planned[key] = replace(
                planned[key],
                estimated_minutes=min(planned[key].estimated_minutes, int(values["minutes"])),
                change_reason="time_limit",
            )
        elif constraint.kind == "replace_exercise":
            planned = _replace_exercise(planned, values, constitution)
        elif constraint.kind in {"equipment_available", "exercise_preference", "unavailable"}:
            planned = _apply_availability_or_preference(planned, constraint, constitution)
    return tuple(planned[key] for key in sorted(planned))


def generate_weekly_plan(constitution, snapshot, constraints=()):
    sessions = plan_week_sessions(constitution, snapshot.week_start)
    days = tuple(
        PlanDay(
            date=session.date,
            session_type=session.session_type.value,
            objective=_objective(session.session_type.value),
            exercises=(),
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
