from dataclasses import dataclass
from datetime import date
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
