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
    "lower_power": 75,
    "push_volume": 70,
    "pull_volume": 70,
    "jump_elastic": 60,
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


def _recovery_index(intents: tuple[str, ...], week_start: date, calendar_events) -> int:
    week_end = week_start + timedelta(days=6)
    hard_dates = sorted(
        event_date
        for event in calendar_events
        if (event_date := _event_date(event)) is not None
        and week_start <= event_date <= week_end
        and (bool(event.get("hard_conflict")) or str(event.get("severity", "")).lower() == "hard")
    )
    if hard_dates:
        return (hard_dates[0] - week_start).days
    return intents.index("lower_power") + 1


def place_recovery(
    intents: tuple[str, ...], week_start: date, calendar_events
) -> tuple[str | None, ...]:
    dated = list(intents)
    dated.insert(_recovery_index(intents, week_start, calendar_events), None)
    return tuple(dated)


def _priority_for(family: str) -> str:
    if family in _REQUIRED_FAMILIES:
        return "required"
    if family in _OPTIONAL_FAMILIES:
        return "optional"
    if family in _PRIMARY_FAMILIES:
        return "primary"
    return "accessory"


def _exercise_payload(name: str, family: str, equipment: Mapping[str, Any]) -> dict[str, Any]:
    priority = _priority_for(family)
    sets, reps = _PRESCRIPTION_BY_FAMILY.get(family, (3, 8 if priority == "primary" else 12))
    return {
        "name": name,
        "movement_family": family,
        "priority": priority,
        "sets": sets,
        "reps": reps,
        "equipment": tuple(equipment[name]),
    }


def _build_plan_day(constitution: Mapping[str, Any], intent: str | None) -> PlanDay:
    if intent is None:
        return PlanDay(
            date=date.min,
            session_type="recovery",
            objective="recovery",
            exercises=(),
            estimated_minutes=0,
            decision_reasons=("baseline_recovery",),
        )

    policy = constitution["adaptive_planner"]
    families = policy["session_templates"][intent]
    exercises = tuple(
        _exercise_payload(
            policy["movement_families"][family][0],
            family,
            policy["exercise_equipment"],
        )
        for family in families
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
    dated = place_recovery(intents, snapshot.week_start, snapshot.calendar_events)
    return tuple(
        replace(_build_plan_day(constitution, intent), date=snapshot.week_start + timedelta(days=index))
        for index, intent in enumerate(dated)
    )
