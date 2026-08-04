from dataclasses import replace
from datetime import date, timedelta
from typing import Any, Mapping

from .plan_contracts import PlanDay, PlannerInputSnapshot


HYBRID_SEQUENCE: tuple[str, ...] = (
    "push_strength",
    "pull_strength",
    "lower_power",
    "push_volume",
    "pull_volume",
    "jump_elastic",
)

SESSION_TYPE_BY_INTENT = {
    "push_strength": "general",
    "pull_strength": "general",
    "lower_power": "high_intensity",
    "push_volume": "general",
    "pull_volume": "general",
    "jump_elastic": "jump",
}

_SESSION_MINUTES = {
    "push_strength": 65,
    "pull_strength": 65,
    "lower_power": 70,
    "push_volume": 70,
    "pull_volume": 70,
    "jump_elastic": 60,
}
_SESSION_BLOCK_MINUTES = {
    "push_strength": (22, 18, 10, 15),
    "pull_strength": (20, 22, 8, 15),
    "lower_power": (8, 15, 20, 17, 10),
    "push_volume": (20, 15, 12, 10, 13),
    "pull_volume": (20, 18, 12, 10, 10),
    "jump_elastic": (10, 10, 15, 25),
}
_REQUIRED_FAMILIES = frozenset({"knee_isometric", "dynamic_warmup", "sprint_mechanics"})
_OPTIONAL_FAMILIES = frozenset({"triceps", "biceps"})
_PRIMARY_FAMILIES = frozenset(
    {
        "horizontal_push",
        "vertical_push",
        "vertical_pull",
        "horizontal_pull",
        "supported_horizontal_pull",
        "incline_push",
        "explosive",
        "knee_extension",
        "posterior_chain",
        "approach_jump",
    }
)
_PRESCRIPTION_BY_FAMILY = {
    "knee_isometric": (3, 30),
    "dynamic_warmup": (2, 10),
    "sprint_mechanics": (3, 20),
    "explosive": (4, 3),
    "progressive_jump": (4, 3),
    "approach_jump": (5, 3),
}
REMOVAL_ORDER = ("optional", "accessory")


def rotate_sequence(sequence: tuple[str, ...], cursor: int) -> tuple[str, ...]:
    start = cursor - 1
    return sequence[start:] + sequence[:start]


def _event_date(event: Mapping[str, Any]) -> date | None:
    value = event.get("training_date", event.get("date"))
    if isinstance(value, date):
        return value
    try:
        return date.fromisoformat(str(value))
    except (TypeError, ValueError):
        return None


def has_hard_calendar_conflict(candidate: date, calendar_events) -> bool:
    return any(
        _event_date(event) == candidate
        and (
            bool(event.get("hard_conflict"))
            or str(event.get("severity", "")).lower() == "hard"
        )
        for event in calendar_events
    )


def is_between_lower_and_jump(
    candidate: date, dated_intents: tuple[tuple[date, str | None], ...]
) -> bool:
    dates_by_intent = {intent: scheduled for scheduled, intent in dated_intents}
    lower = dates_by_intent.get("lower_power")
    jump = dates_by_intent.get("jump_elastic")
    return lower is not None and jump is not None and min(lower, jump) < candidate < max(lower, jump)


def follows_high_neural(
    candidate: date, dated_intents: tuple[tuple[date, str | None], ...]
) -> bool:
    previous_intent = dict(dated_intents).get(candidate - timedelta(days=1))
    return previous_intent is not None and SESSION_TYPE_BY_INTENT[previous_intent] in {
        "high_intensity",
        "jump",
    }


def recovery_score(
    candidate: date,
    dated_intents: tuple[tuple[date, str | None], ...],
    calendar_events,
    readiness: Mapping[str, Any] | None,
) -> tuple[int, int, int]:
    if has_hard_calendar_conflict(candidate, calendar_events):
        return (100, 0, 0)
    separates_lower_and_jump = is_between_lower_and_jump(candidate, dated_intents)
    after_high_neural = follows_high_neural(candidate, dated_intents)
    fatigue = int((readiness or {}).get("fatigue_score", 0))
    return (
        80 if separates_lower_and_jump else 0,
        40 if after_high_neural else 0,
        fatigue,
    )


def _dated_intents_for_candidate(
    intents: tuple[str, ...], week_start: date, candidate: date
) -> tuple[tuple[date, str | None], ...]:
    dated = list(intents)
    dated.insert((candidate - week_start).days, None)
    return tuple(
        (week_start + timedelta(days=index), intent)
        for index, intent in enumerate(dated)
    )


def _recovery_placement(
    intents: tuple[str, ...],
    week_start: date,
    calendar_events,
    readiness: Mapping[str, Any] | None = None,
) -> tuple[int, str]:
    candidates = tuple(week_start + timedelta(days=index) for index in range(7))

    def score(candidate: date) -> tuple[int, int, int]:
        return recovery_score(
            candidate,
            _dated_intents_for_candidate(intents, week_start, candidate),
            calendar_events,
            readiness,
        )

    selected = max(candidates, key=lambda day: (*score(day), -day.toordinal()))
    selected_score = score(selected)
    if has_hard_calendar_conflict(selected, calendar_events):
        reason = "recovery_placed:calendar"
    elif selected_score[0]:
        reason = "recovery_placed:lower_spacing"
    elif selected_score[2]:
        reason = "recovery_placed:fatigue"
    else:
        reason = "recovery_placed:default"
    return (selected - week_start).days, reason


def place_recovery(
    intents: tuple[str, ...],
    week_start: date,
    calendar_events,
    readiness: Mapping[str, Any] | None = None,
) -> tuple[str | None, ...]:
    dated = list(intents)
    recovery_index, _ = _recovery_placement(
        intents, week_start, calendar_events, readiness
    )
    dated.insert(recovery_index, None)
    return tuple(dated)


def estimate_minutes(exercises) -> int:
    return sum(item["estimated_minutes"] for item in exercises)


def last_index(items, predicate) -> int | None:
    for index in range(len(items) - 1, -1, -1):
        if predicate(items[index]):
            return index
    return None


def compress_session(day: PlanDay, minutes: int) -> PlanDay:
    exercises = list(day.exercises)
    for priority in REMOVAL_ORDER:
        while estimate_minutes(exercises) > minutes:
            index = last_index(exercises, lambda item: item["priority"] == priority)
            if index is None:
                break
            exercises.pop(index)
        if estimate_minutes(exercises) <= minutes:
            break
    estimated_minutes = estimate_minutes(exercises)
    return replace(
        day,
        exercises=tuple(exercises),
        estimated_minutes=estimated_minutes,
        decision_reasons=(
            *day.decision_reasons,
            "time_compressed:floor_preserved"
            if estimated_minutes > minutes
            else "time_compressed",
        ),
    )


def _attempt_jump_session(day: PlanDay) -> PlanDay:
    exercises = tuple(
        item
        for item in day.exercises
        if item["priority"] == "required" or item["movement_family"] == "approach_jump"
    )
    return replace(
        day,
        exercises=exercises,
        estimated_minutes=estimate_minutes(exercises),
        decision_reasons=(*day.decision_reasons, "phase_attempt_exposure"),
    )


def _with_phase_reason(day: PlanDay, reason: str) -> PlanDay:
    return replace(
        day,
        decision_reasons=(*day.decision_reasons, reason),
    )


def _phase_maintenance_session(day: PlanDay, phase: str) -> PlanDay:
    cap = 45 if phase == "peak" else 30
    exercises = []
    primary_count = 0
    can_consider_primary = True
    for item in day.exercises:
        priority = item["priority"]
        if priority == "required":
            if estimate_minutes(exercises) + item["estimated_minutes"] <= cap:
                exercises.append(item)
            continue
        if priority != "primary" or not can_consider_primary:
            continue
        if estimate_minutes(exercises) + item["estimated_minutes"] > cap:
            can_consider_primary = False
            continue
        exercises.append(item)
        primary_count += 1
        if phase == "attempt":
            can_consider_primary = False
    if primary_count == 0:
        raise ValueError("Phase maintenance requires a primary movement within its cap")
    return replace(
        day,
        exercises=tuple(exercises),
        estimated_minutes=estimate_minutes(exercises),
        decision_reasons=(*day.decision_reasons, f"phase_maintenance:{phase}"),
    )


def _recovery_from_lower(day: PlanDay, phase: str) -> PlanDay:
    return replace(
        day,
        session_type="recovery",
        objective="recovery",
        exercises=(),
        estimated_minutes=0,
        session_intent=None,
        sequence_position=None,
        sequence_length=None,
        high_neural=False,
        decision_reasons=(*day.decision_reasons, f"phase_lower_removed:{phase}"),
    )


def apply_phase_rules(
    days: tuple[PlanDay, ...], phase: str, week: int
) -> tuple[PlanDay, ...]:
    del week
    if phase not in {"peak", "attempt"}:
        return tuple(days)

    transformed = tuple(
        _recovery_from_lower(day, phase)
        if day.session_intent == "lower_power"
        else day
        for day in days
    )
    if phase == "peak":
        return tuple(
            _phase_maintenance_session(day, phase)
            if day.session_type == "general"
            else _with_phase_reason(
                compress_session(day, 45), "phase_jump_volume_limited:peak"
            )
            if day.session_intent == "jump_elastic"
            else day
            for day in transformed
        )

    return tuple(
        _attempt_jump_session(day)
        if day.session_intent == "jump_elastic"
        else _phase_maintenance_session(day, phase)
        if day.session_type == "general"
        else day
        for day in transformed
    )


def _priority_for(family: str) -> str:
    if family in _REQUIRED_FAMILIES:
        return "required"
    if family in _OPTIONAL_FAMILIES:
        return "optional"
    if family in _PRIMARY_FAMILIES:
        return "primary"
    return "accessory"


def _exercise_payload(
    name: str,
    family: str,
    equipment: Mapping[str, Any],
    estimated_minutes: int,
) -> dict[str, Any]:
    priority = _priority_for(family)
    sets, reps = _PRESCRIPTION_BY_FAMILY.get(family, (3, 8 if priority == "primary" else 12))
    return {
        "name": name,
        "movement_family": family,
        "priority": priority,
        "sets": sets,
        "reps": reps,
        "equipment": tuple(equipment[name]),
        "estimated_minutes": estimated_minutes,
    }


def _first_compatible_exercise(
    family: str,
    movement_families: Mapping[str, tuple[str, ...]],
    exercise_equipment: Mapping[str, tuple[str, ...]],
    available_equipment: tuple[str, ...],
) -> str:
    approved = movement_families[family]
    if not available_equipment:
        return approved[0]
    available = set(available_equipment)
    for exercise in approved:
        if set(exercise_equipment[exercise]) <= available:
            return exercise
    raise ValueError(f"No compatible exercise for movement family '{family}'")


def _build_plan_day(
    constitution: Mapping[str, Any],
    intent: str | None,
    available_equipment: tuple[str, ...],
    recovery_reason: str,
) -> PlanDay:
    if intent is None:
        return PlanDay(
            date=date.min,
            session_type="recovery",
            objective="recovery",
            exercises=(),
            estimated_minutes=0,
            decision_reasons=(recovery_reason,),
        )

    policy = constitution["adaptive_planner"]
    families = policy["session_templates"][intent]
    budgets = _SESSION_BLOCK_MINUTES[intent]
    if len(budgets) != len(families):
        raise ValueError(f"Session budget count does not match '{intent}' template")
    if sum(budgets) != _SESSION_MINUTES[intent]:
        raise ValueError(f"Session budget sum does not match '{intent}' duration")
    exercises = tuple(
        _exercise_payload(
            _first_compatible_exercise(
                family,
                policy["movement_families"],
                policy["exercise_equipment"],
                available_equipment,
            ),
            family,
            policy["exercise_equipment"],
            estimated_minutes,
        )
        for family, estimated_minutes in zip(families, budgets)
    )
    return PlanDay(
        date=date.min,
        session_type=SESSION_TYPE_BY_INTENT[intent],
        objective=intent,
        exercises=exercises,
        estimated_minutes=_SESSION_MINUTES[intent],
        session_intent=intent,
        sequence_position=HYBRID_SEQUENCE.index(intent) + 1,
        sequence_length=len(HYBRID_SEQUENCE),
        decision_reasons=("sequence_resumed",),
        high_neural=SESSION_TYPE_BY_INTENT[intent] in {"high_intensity", "jump"},
    )


def build_hybrid_week(
    constitution: Mapping[str, Any], snapshot: PlannerInputSnapshot
) -> tuple[PlanDay, ...]:
    intents = rotate_sequence(HYBRID_SEQUENCE, snapshot.sequence_cursor)
    dated = place_recovery(
        intents, snapshot.week_start, snapshot.calendar_events, snapshot.readiness
    )
    _, recovery_reason = _recovery_placement(
        intents, snapshot.week_start, snapshot.calendar_events, snapshot.readiness
    )
    return tuple(
        replace(
            _build_plan_day(
                constitution, intent, snapshot.equipment, recovery_reason
            ),
            date=snapshot.week_start + timedelta(days=index),
        )
        for index, intent in enumerate(dated)
    )
