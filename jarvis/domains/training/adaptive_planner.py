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

_HIGH_NEURAL_SESSION_TYPES = frozenset({"high_intensity", "jump", "peak", "attempt"})


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
    safety_blocks: tuple[str, ...] = ()


def _objective(session_type: str) -> str:
    return {
        "high_intensity": "jump_strength",
        "jump": "jump_skill",
        "general": "general_strength",
        "iso_only": "joint_capacity",
        "rest": "recovery",
    }.get(session_type, session_type)


def _format_number(value):
    return f"{value:g}"


def _minimum_recovery_hours(policy):
    values = policy.get("minimum_recovery_hours", {})
    if not isinstance(values, Mapping):
        return 0.0
    return max((float(value) for value in values.values()), default=0.0)


def _volume_minutes(days):
    return sum(day.estimated_minutes for day in days)


def _calendar_detail(dates):
    return ", ".join(day.isoformat() for day in dates) or "none"


def validate_plan(
    days,
    policy,
    *,
    baseline_days=None,
    safety_blocks=(),
    pain_routed_dates=(),
    calendar_conflict_dates=(),
):
    minimum_recovery_hours = _minimum_recovery_hours(policy)
    high_neural_days = [day for day in days if day.session_type in _HIGH_NEURAL_SESSION_TYPES]
    spacing_passed = all(
        (later.date - earlier.date).total_seconds() / 3600 >= minimum_recovery_hours
        for earlier, later in zip(high_neural_days, high_neural_days[1:])
    )
    baseline_minutes = _volume_minutes(baseline_days or days)
    planned_minutes = _volume_minutes(days)
    maximum_increase_pct = float(policy.get("maximum_weekly_volume_increase_pct", 0))
    maximum_minutes = baseline_minutes * (1 + maximum_increase_pct / 100)
    volume_change_pct = (
        (planned_minutes - baseline_minutes) / baseline_minutes * 100
        if baseline_minutes
        else 0.0
    )
    pain_passed = not safety_blocks or not high_neural_days
    if not safety_blocks:
        pain_detail = "No hard pain block is active."
    elif pain_routed_dates:
        pain_detail = (
            f"Hard pain block for {', '.join(safety_blocks)} routed high-neural work "
            f"to recovery: {_calendar_detail(pain_routed_dates)}."
        )
    else:
        pain_detail = (
            f"Hard pain block for {', '.join(safety_blocks)} required no additional routing; "
            "no high-neural work remained after constraints."
        )
    calendar_passed = all(
        day.session_type == "recovery"
        for day in days
        if day.date in calendar_conflict_dates
    )
    validations = [
        PlanValidation(
            "seven_unique_days",
            len(days) == 7 and len({day.date for day in days}) == 7,
            "hard",
            "Plan contains seven unique dates",
        ),
        PlanValidation(
            "pain_block",
            pain_passed,
            "hard",
            pain_detail,
        ),
        PlanValidation(
            "calendar_conflicts",
            calendar_passed,
            "hard",
            (
                "No calendar hard conflicts."
                if not calendar_conflict_dates
                else (
                    "Calendar hard-conflict dates are recovery-safe: "
                    f"{_calendar_detail(calendar_conflict_dates)}."
                )
            ),
        ),
        PlanValidation(
            "recovery_spacing",
            spacing_passed,
            "hard",
            (
                "High-neural sessions are separated by at least "
                f"{_format_number(minimum_recovery_hours)} hours."
            ),
        ),
        PlanValidation(
            "weekly_volume_change",
            planned_minutes <= maximum_minutes,
            "warning",
            (
                f"Planned weekly volume is {planned_minutes} minutes versus {baseline_minutes} "
                f"minutes baseline ({volume_change_pct:+.1f}%; cap "
                f"+{_format_number(maximum_increase_pct)}%)."
            ),
        ),
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


def _route_to_recovery(day, objective, reason):
    return _update_for_change(
        day,
        reason,
        session_type="recovery",
        objective=objective,
        exercises=(),
        estimated_minutes=0,
    )


def _apply_pain_blocks(days, safety_blocks):
    if not safety_blocks:
        return days, ()
    planned = []
    routed_dates = []
    for day in days:
        if day.session_type in _HIGH_NEURAL_SESSION_TYPES:
            planned.append(_route_to_recovery(day, "pain_safe_recovery", "hard_pain_block"))
            routed_dates.append(day.date)
        else:
            planned.append(day)
    return tuple(planned), tuple(routed_dates)


def _safety_blocks(snapshot):
    # Import lazily because the evidence module constructs PlanningSnapshot values.
    from .plan_evidence import pain_blocked_areas

    return tuple(sorted(set(snapshot.safety_blocks) | set(pain_blocked_areas(snapshot.readiness))))


def _event_date(event):
    value = event.get("training_date", event.get("date"))
    if isinstance(value, date):
        return value
    try:
        return date.fromisoformat(str(value))
    except (TypeError, ValueError):
        return None


def _calendar_hard_conflict_dates(days, calendar_events):
    plan_dates = {day.date for day in days}
    high_neural_dates = {
        day.date for day in days if day.session_type in _HIGH_NEURAL_SESSION_TYPES
    }
    hard_conflicts = set()
    for event in calendar_events:
        event_date = _event_date(event)
        if event_date is None:
            continue
        if str(event.get("severity", "")).lower() == "hard" or bool(
            event.get("hard_conflict")
        ):
            if event_date in plan_dates:
                hard_conflicts.add(event_date)
        elif str(event.get("event_type", "")).lower() == "performance":
            for candidate in (event_date - timedelta(days=1), event_date):
                if candidate in high_neural_dates:
                    hard_conflicts.add(candidate)
    return tuple(sorted(hard_conflicts))


def _apply_calendar_hard_conflicts(days, conflict_dates, protected_dates=()):
    protected_dates = set(protected_dates)
    return tuple(
        _route_to_recovery(day, "calendar_recovery", "calendar_hard_conflict")
        if day.date in conflict_dates and day.date not in protected_dates
        else day
        for day in days
    )


def _apply_recovery_spacing(days, policy):
    minimum_recovery_hours = _minimum_recovery_hours(policy)
    planned = []
    previous_high_neural = None
    for day in days:
        if (
            day.session_type in _HIGH_NEURAL_SESSION_TYPES
            and previous_high_neural is not None
            and (day.date - previous_high_neural.date).total_seconds() / 3600
            < minimum_recovery_hours
        ):
            planned.append(
                _route_to_recovery(
                    day,
                    "recovery_spacing",
                    f"recovery_spacing:{previous_high_neural.date.isoformat()}",
                )
            )
            continue
        planned.append(day)
        if day.session_type in _HIGH_NEURAL_SESSION_TYPES:
            previous_high_neural = day
    return tuple(planned)


def _progression_key(value):
    return "".join(character for character in str(value).casefold() if character.isalnum())


def _apply_progression(days, progression):
    by_exercise = {}
    for name, values in sorted(
        progression.items(), key=lambda item: (_progression_key(item[0]), str(item[0]))
    ):
        by_exercise.setdefault(_progression_key(name), values)
    planned = []
    for day in days:
        if day.session_type in {"recovery", "rest"}:
            planned.append(day)
            continue
        exercises = []
        reasons = []
        for exercise in day.exercises:
            suggestion = by_exercise.get(_progression_key(exercise.get("name", "")))
            if not suggestion or "suggested_kg" not in suggestion:
                exercises.append(exercise)
                continue
            suggested_kg = suggestion["suggested_kg"]
            updated = {
                **exercise,
                "suggested_kg": suggested_kg,
                "progression_basis": suggestion.get("basis", ""),
                "deload": bool(suggestion.get("deload", False)),
            }
            exercises.append(updated)
            if updated != exercise:
                reasons.append(
                    f"progression_applied:{exercise['name']}:{_format_number(float(suggested_kg))}kg"
                )
        planned.append(_apply_exercise_updates(day, tuple(exercises), reasons))
    return tuple(planned)


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
    baseline_days = days
    days = apply_constraints(days, constraints, constitution)
    safety_blocks = _safety_blocks(snapshot)
    days, pain_routed_dates = _apply_pain_blocks(days, safety_blocks)
    calendar_conflict_dates = _calendar_hard_conflict_dates(days, snapshot.calendar_events)
    days = _apply_calendar_hard_conflicts(days, calendar_conflict_dates, pain_routed_dates)
    days = _apply_recovery_spacing(days, policy)
    days = _apply_progression(days, snapshot.progression)
    validations = validate_plan(
        days,
        policy,
        baseline_days=baseline_days,
        safety_blocks=safety_blocks,
        pain_routed_dates=pain_routed_dates,
        calendar_conflict_dates=calendar_conflict_dates,
    )
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
