"""Training API routes. Routers call engines; no business logic lives here."""

from datetime import date, timedelta
import re
from typing import Any, Literal, Mapping

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, ConfigDict, Field, model_validator

from jarvis.api.dependencies import get_training_constitution
from jarvis.api import ai_gateway
from jarvis.core import clock
from jarvis.data import database
from jarvis.domains.calendar import plaan_live
from jarvis.domains.calendar.tests.fixtures import LIVE_SNAPSHOT_RAW
from jarvis.domains.training import engine, joint_capacity, progression
from jarvis.domains.training.adaptive_planner import generate_weekly_plan
from jarvis.domains.training.data_contracts import (
    BodyAreaDiscomfort,
    PlannedSession,
    ReadinessScan,
    TrainingConflict,
    TrainingStatus,
)
from jarvis.domains.training.plan_contracts import (
    TrainingConstraint,
    WeeklyPlanReceipt,
    iso_cycle_id,
)
from jarvis.domains.training.plan_evidence import build_planning_snapshot
from jarvis.domains.training.plan_acceptance import (
    training_planner_acceptance_status,
    training_planner_mode,
)

router = APIRouter()

_SESSION_DISPLAY = {
    "high_intensity": "HIGH INTENSITY (Lower)",
    "general": "UPPER BODY (General)",
    "jump": "JUMP SESSION",
    "iso_only": "ISO ONLY",
    "rest": "REST",
    "deload": "DELOAD",
    "peak": "PEAK SESSION",
    "attempt": "DUNK ATTEMPT",
}

MOVE_PATTERN = re.compile(
    r"(?:move|train).*?(today|\d{4}-\d{2}-\d{2}).*?(tomorrow|\d{4}-\d{2}-\d{2})",
    re.I,
)
SKIP_PATTERN = re.compile(r"skip.*?(today|tomorrow|\d{4}-\d{2}-\d{2})", re.I)

ConstraintKind = Literal[
    "unavailable",
    "move_session",
    "skip_session",
    "replace_exercise",
    "time_limit",
    "equipment_available",
    "exercise_preference",
]
PlanStatus = Literal["proposed", "active", "superseded", "completed", "rejected"]
_PUBLIC_ADAPTIVE_PLANNER_FIELDS = (
    "version",
    "minimum_recovery_hours",
    "maximum_weekly_volume_increase_pct",
    "maximum_session_volume_reduction_pct",
    "pain_block_flags",
    "movement_families",
    "exercise_equipment",
)
_AUTHORITATIVE_CALENDAR_SOURCES = frozenset(
    {"env_json", "local_file", "manual_import", "read_only_url"}
)
_CALENDAR_ROUTING_EVENT_TYPES = frozenset({"performance"})
_CALENDAR_ROUTING_SEVERITIES = frozenset({"hard", "warning", "info"})


class CalendarEvidenceUnavailable(RuntimeError):
    """Raised when the read-only calendar boundary cannot provide valid evidence."""


class TrainingConstraintRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")

    kind: ConstraintKind
    source: Literal["user", "phoenix", "safety"] = "user"
    values: dict[str, Any]


class TrainingPlanProposalRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")

    constraints: list[TrainingConstraintRequest] = Field(default_factory=list, max_length=12)
    intent: str | None = Field(default=None, max_length=500)

    @model_validator(mode="after")
    def require_constraint_or_intent(self):
        if not self.constraints and not (self.intent and self.intent.strip()):
            raise ValueError("At least one training constraint or intent is required")
        return self


class TrainingConstraintResponse(BaseModel):
    kind: ConstraintKind
    source: Literal["user", "phoenix", "safety"]
    values: dict[str, Any]


class TrainingPlanDayResponse(BaseModel):
    date: str
    session_type: str
    objective: str
    exercises: list[dict[str, Any]]
    estimated_minutes: int
    change_reason: str | None = None


class TrainingPlanValidationResponse(BaseModel):
    rule: str
    passed: bool
    severity: Literal["hard", "warning", "info"]
    detail: str


class TrainingPlanResponse(BaseModel):
    plan_id: str
    parent_plan_id: str | None
    constitution_version: str
    planner_version: str
    cycle_id: str
    days: list[TrainingPlanDayResponse]
    constraints: list[TrainingConstraintResponse]
    validations: list[TrainingPlanValidationResponse]
    created_at: str
    status: PlanStatus
    input_hash: str
    receipt_hash: str
    reason: str | None = None
    changed_at: str | None = None
    superseded_by: str | None = None


class TrainingPlanChangedDayResponse(BaseModel):
    date: str
    before: TrainingPlanDayResponse | None
    after: TrainingPlanDayResponse | None
    reason: str | None = None


class TrainingPlanDiffResponse(BaseModel):
    changed_days: list[TrainingPlanChangedDayResponse]


class TrainingPlanProposalResponse(TrainingPlanResponse):
    authoritative: bool
    before: TrainingPlanResponse | None
    after: TrainingPlanResponse
    diff: TrainingPlanDiffResponse
    interpreted_constraints: list[TrainingConstraintResponse]


class TrainingPlanHistoryResponse(BaseModel):
    items: list[TrainingPlanResponse]


class TrainingRulesResponse(BaseModel):
    objective: str
    planner_version: str
    planner: dict[str, Any]
    recovery_spacing: dict[str, int]
    adaptation_limits: dict[str, int | float]
    movement_families: dict[str, list[str]]
    preferences: list[TrainingConstraintResponse]
    temporary_constraints: list[TrainingConstraintResponse]
    active_plan_id: str | None


class ExerciseSetLog(BaseModel):
    reps: int = Field(ge=0)
    weight_kg: float = Field(ge=0)
    target_reps: int | None = Field(default=None, ge=1)


class ExerciseLog(BaseModel):
    name: str = Field(min_length=1)
    sets: list[ExerciseSetLog] = Field(min_length=1)
    target_reps: int | None = Field(default=None, ge=1)
    body_region: Literal["upper", "lower"] | None = None


class SessionLogRequest(BaseModel):
    date: date
    session_type: Literal["Push", "Pull", "Legs", "Upper", "Lower"]
    week_number: int | None = Field(default=None, ge=1, le=10)
    exercises: list[ExerciseLog] = Field(min_length=1)
    notes: str | None = None


class JumpLogRequest(BaseModel):
    date: date
    jump_type: Literal["approach", "standing"]
    height_cm: float = Field(gt=0, le=200)
    notes: str | None = None


class ReadinessScanRequest(BaseModel):
    knee: int = Field(ge=0, le=10)
    ankle: int = Field(ge=0, le=10)
    hip: int = Field(ge=0, le=10)
    hamstring: int = Field(ge=0, le=10)
    calf_achilles: int = Field(ge=0, le=10)
    lower_back_pelvic: int = Field(ge=0, le=10)
    note: str | None = Field(default=None, max_length=500)
    sharp_pain: bool = False
    limping: bool = False
    next_day_worsening: bool = False


class CapacityBlockLogRequest(BaseModel):
    block_key: Literal[
        "sled_balance", "squat_balance", "pelvic_control", "jump_balance", "recovery_reset"
    ]
    completed: bool
    minutes: int | None = Field(default=None, ge=1, le=180)
    notes: str | None = Field(default=None, max_length=500)


class JumpBalanceLogRequest(BaseModel):
    plant_pattern: Literal[
        "one_foot_left", "one_foot_right", "two_foot_left_right", "two_foot_right_left"
    ]
    rep_count: int = Field(ge=1, le=10)
    jump_variant: Literal["arms_free", "ball_in_hand"]
    height_cm: float | None = Field(default=None, gt=0, le=400)
    video_note: str | None = Field(default=None, max_length=500)
    quality: dict[str, Any] = Field(default_factory=dict)
    notes: str | None = Field(default=None, max_length=500)

_TRAINING_BRIEF_SYSTEM = """\
You are PHOENIX, a personal training assistant following the Isiah Rivera Long Conjugate Sequence System. You are concise, direct, and motivating without being cheesy. Maximum 4 sentences. Always end with the session type for today. Never invent data.\
"""


def _fmt(name: str) -> str:
    """snake_case → Title Case display name."""
    return name.replace("_", " ").title()


def _resolve_exercises(session: dict, constitution: dict) -> list[dict]:
    """Build a display-ready exercise list from a serialized session + constitution."""
    stype = session.get("session_type", "")
    ww = session.get("working_weights")
    phase = session.get("phase", "month_1")
    meso = constitution.get("mesocycle_progression", {}).get(phase, {})

    if stype == "high_intensity" and ww:
        sets = ww["sets"]
        reps = ww["reps"]
        return [
            {"name": _fmt(ww["explosive_exercise"]),       "label": f'{ww["explosive_kg"]}kg',       "sets_reps": f'{sets}×{reps}'},
            {"name": _fmt(ww["knee_extension_exercise"]),  "label": f'{ww["knee_extension_kg"]}kg',  "sets_reps": f'{sets}×{reps}'},
            {"name": _fmt(ww["posterior_chain_exercise"]), "label": f'{ww["posterior_chain_kg"]}kg', "sets_reps": f'{sets}×{reps}'},
            {"name": _fmt(ww["lower_leg_exercise"]),       "label": f'{ww["lower_leg_kg"]}kg',       "sets_reps": f'{sets}×{reps}'},
        ]

    if stype == "general":
        iso = constitution.get("iso_protocol", {})
        iso_label = f'{iso.get("sets","3-5")}×{iso.get("duration_seconds","30")}s'
        return [
            {"name": "Shoulder Rehab",                           "label": "Pre-hab",   "sets_reps": iso_label},
            {"name": _fmt(meso.get("general_push", "bench_press")), "label": "Hypertrophy", "sets_reps": "3×10"},
            {"name": _fmt(meso.get("general_pull", "lat_pulldown")), "label": "Hypertrophy", "sets_reps": "3×10"},
            {"name": _fmt(meso.get("general_shoulder", "lateral_raise")), "label": "Hypertrophy", "sets_reps": "3×15"},
        ]

    if stype in ("iso_only", "peak", "attempt"):
        iso = constitution.get("iso_protocol", {})
        iso_label = f'{iso.get("sets","3-5")}×{iso.get("duration_seconds","30")}s @ {iso.get("effort_pct",70)}%'
        return [{"name": "Knee Extension Isometrics", "label": iso_label, "sets_reps": ""}]

    if stype == "jump":
        return [
            {"name": "Knee Extension ISO",    "label": "Activation", "sets_reps": ""},
            {"name": "Dynamic Flexibility",   "label": "Warmup",     "sets_reps": ""},
            {"name": "Sprint Development",    "label": "CNS Primer", "sets_reps": ""},
            {"name": "Jumps 10→100%",         "label": "Ramp",       "sets_reps": ""},
            {"name": "Max Approach Jumps",    "label": "MAX",        "sets_reps": ""},
        ]

    return []


def _serialize_working_weights(ww) -> dict | None:
    if ww is None:
        return None
    return {
        "explosive_exercise": ww.explosive_exercise,
        "explosive_kg": ww.explosive_kg,
        "knee_extension_exercise": ww.knee_extension_exercise,
        "knee_extension_kg": ww.knee_extension_kg,
        "posterior_chain_exercise": ww.posterior_chain_exercise,
        "posterior_chain_kg": ww.posterior_chain_kg,
        "lower_leg_exercise": ww.lower_leg_exercise,
        "lower_leg_kg": ww.lower_leg_kg,
        "sets": ww.sets,
        "reps": ww.reps,
        "intensity_pct": ww.intensity_pct,
        "top_set_note": ww.top_set_note,
    }


def _serialize_session(s: PlannedSession) -> dict:
    v = s.session_type.value
    return {
        "date": s.date.isoformat(),
        "session_type": v,
        "display_name": _SESSION_DISPLAY.get(v, v.upper()),
        "phase": s.phase.value,
        "week_of_mesocycle": s.week_of_mesocycle,
        "working_weights": _serialize_working_weights(s.working_weights),
        "session_order": s.session_order,
        "notes": s.notes,
    }


def _serialize_conflict(c: TrainingConflict) -> dict:
    return {
        "conflict_type": c.conflict_type,
        "severity": c.severity,
        "training_date": c.training_date.isoformat(),
        "session_type": c.session_type.value,
        "opera_event_title": c.opera_event_title,
        "opera_event_date": c.opera_event_date.isoformat(),
        "detail": c.detail,
        "suggestion": c.suggestion,
    }


def _serialize_status(status: TrainingStatus) -> dict:
    g = status.dunk_goal
    c = status.cut_status
    return {
        "as_of": status.as_of.isoformat(),
        "dunk_goal": {
            "deadline": g.deadline.isoformat(),
            "attempt_window_start": g.attempt_window_start.isoformat(),
            "days_to_attempt": g.days_to_attempt,
            "days_to_deadline": g.days_to_deadline,
            "weeks_to_attempt": round(g.weeks_to_attempt, 2),
            "current_phase": g.current_phase.value,
            "current_mesocycle_week": g.current_mesocycle_week,
            "on_track": g.on_track,
        },
        "cut_status": {
            "active": c.active,
            "end_date": c.end_date.isoformat(),
            "days_remaining": c.days_remaining,
            "current_bodyweight_kg": c.current_bodyweight_kg,
            "current_bf_pct": c.current_bf_pct,
            "target_bf_pct": c.target_bf_pct,
            "estimated_fat_to_lose_kg": c.estimated_fat_to_lose_kg,
        },
        "today_session": _serialize_session(status.today_session),
        "week_sessions": [_serialize_session(s) for s in status.week_sessions],
        "conflicts": [_serialize_conflict(c) for c in status.conflicts],
        "has_hard_conflicts": status.has_hard_conflicts,
        "fatigue_warning": status.fatigue_warning,
    }


def _scan_from_values(values: dict[str, Any] | ReadinessScanRequest) -> ReadinessScan:
    get = values.get if isinstance(values, dict) else lambda key, default=None: getattr(values, key, default)
    return ReadinessScan(
        discomfort=BodyAreaDiscomfort(
            knee=get("knee"),
            ankle=get("ankle"),
            hip=get("hip"),
            hamstring=get("hamstring"),
            calf_achilles=get("calf_achilles"),
            lower_back_pelvic=get("lower_back_pelvic"),
        ),
        note=get("note"),
        sharp_pain=bool(get("sharp_pain", False)),
        limping=bool(get("limping", False)),
        next_day_worsening=bool(get("next_day_worsening", False)),
    )


def _serialize_route(result) -> dict:
    return {
        "readiness_status": result.readiness_status.value,
        "readiness_required": result.readiness_required,
        "high_neural_allowed": result.high_neural_allowed,
        "planned_session": result.planned_session,
        "capacity_blocks": [
            {
                "key": block.key,
                "label": block.label,
                "purpose": block.purpose,
                "exercises": list(block.exercises),
            }
            for block in result.capacity_blocks
        ],
        "substitutions": [
            {"area": item.area, "reason": item.reason, "action": item.action}
            for item in result.substitutions
        ],
        "show_jump_balance": result.show_jump_balance,
        "show_recovery_reset": result.show_recovery_reset,
        "safety_note": result.safety_note,
    }


def _current_status(constitution: dict) -> tuple[TrainingStatus, dict]:
    latest_kg = database.get_latest_weight_kg()
    effective = (
        {**constitution, "current_bodyweight_kg": latest_kg} if latest_kg else constitution
    )
    status = engine.check_training(
        effective,
        today=clock.today(),
        opera_snapshot_raw=LIVE_SNAPSHOT_RAW,
    )
    return status, effective


def _planning_horizon(today: date | None = None) -> tuple[date, date]:
    current = today or clock.today()
    week_start = current - timedelta(days=current.weekday())
    return week_start, week_start + timedelta(days=6)


def _current_cycle() -> str:
    week_start, _ = _planning_horizon()
    return iso_cycle_id(week_start)


def _resolve_relative_date(value: str, today: date) -> date:
    lowered = value.casefold()
    if lowered == "today":
        return today
    if lowered == "tomorrow":
        return today + timedelta(days=1)
    try:
        return date.fromisoformat(value)
    except (TypeError, ValueError) as exc:
        raise HTTPException(status_code=422, detail=f"Invalid training date: {value}") from exc


def compile_training_intent(intent: str, today: date) -> tuple[TrainingConstraint, ...]:
    if match := MOVE_PATTERN.search(intent):
        source = _resolve_relative_date(match.group(1), today)
        target = _resolve_relative_date(match.group(2), today)
        return (
            TrainingConstraint.from_mapping(
                "move_session",
                "user",
                {"source_date": source.isoformat(), "target_date": target.isoformat()},
            ),
        )
    if match := SKIP_PATTERN.search(intent):
        target = _resolve_relative_date(match.group(1), today)
        return (
            TrainingConstraint.from_mapping(
                "skip_session", "user", {"date": target.isoformat()}
            ),
        )
    raise HTTPException(
        status_code=422,
        detail="Request could not be translated into a supported training constraint",
    )


def _required_non_empty_string(values: Mapping[str, Any], field: str) -> str:
    value = values.get(field)
    if not isinstance(value, str) or not value.strip():
        raise HTTPException(
            status_code=422,
            detail=f"Training constraint field '{field}' must be a non-empty string",
        )
    return value.strip()


def _horizon_date(values: Mapping[str, Any], field: str, week_start: date, week_end: date) -> str:
    raw = _required_non_empty_string(values, field)
    try:
        parsed = date.fromisoformat(raw)
    except ValueError as exc:
        raise HTTPException(
            status_code=422,
            detail=f"Training constraint field '{field}' must be an ISO date",
        ) from exc
    if not week_start <= parsed <= week_end:
        raise HTTPException(
            status_code=422,
            detail=(
                f"Training constraint date '{field}' must be within displayed planning "
                f"horizon {week_start.isoformat()} to {week_end.isoformat()}"
            ),
        )
    return parsed.isoformat()


def _validated_constraint(constraint: TrainingConstraint, week_start: date, week_end: date) -> TrainingConstraint:
    values = dict(constraint.values)
    normalized = dict(values)

    if constraint.kind == "move_session":
        normalized["source_date"] = _horizon_date(values, "source_date", week_start, week_end)
        normalized["target_date"] = _horizon_date(values, "target_date", week_start, week_end)
    elif constraint.kind in {"unavailable", "skip_session", "time_limit", "replace_exercise"}:
        normalized["date"] = _horizon_date(values, "date", week_start, week_end)
    elif constraint.kind in {"equipment_available", "exercise_preference"} and "date" in values:
        normalized["date"] = _horizon_date(values, "date", week_start, week_end)

    if constraint.kind == "time_limit":
        minutes = values.get("minutes")
        if isinstance(minutes, bool) or not isinstance(minutes, int) or not 15 <= minutes <= 180:
            raise HTTPException(
                status_code=422,
                detail="Training time limit must be between 15 and 180 minutes",
            )
        normalized["minutes"] = minutes
    elif constraint.kind == "replace_exercise":
        normalized["from"] = _required_non_empty_string(values, "from")
        normalized["to"] = _required_non_empty_string(values, "to")
    elif constraint.kind == "equipment_available":
        equipment = values.get("equipment")
        if (
            not isinstance(equipment, (list, tuple))
            or not equipment
            or any(not isinstance(item, str) or not item.strip() for item in equipment)
        ):
            raise HTTPException(
                status_code=422,
                detail="Available equipment must be a non-empty list of non-empty strings",
            )
        normalized["equipment"] = [item.strip() for item in equipment]
    elif constraint.kind == "exercise_preference":
        normalized["exercise"] = _required_non_empty_string(values, "exercise")
        preference = values.get("avoid_or_prefer")
        if preference not in {"avoid", "prefer"}:
            raise HTTPException(
                status_code=422,
                detail="Exercise preference must be either 'avoid' or 'prefer'",
            )

    return TrainingConstraint.from_mapping(constraint.kind, constraint.source, normalized)


def _compile_proposal_constraints(request: TrainingPlanProposalRequest) -> tuple[TrainingConstraint, ...]:
    week_start, week_end = _planning_horizon()
    constraints = [
        TrainingConstraint.from_mapping(item.kind, item.source, item.values)
        for item in request.constraints
    ]
    if request.intent and request.intent.strip():
        constraints.extend(compile_training_intent(request.intent.strip(), clock.today()))
    if len(constraints) > 12:
        raise HTTPException(status_code=422, detail="At most 12 training constraints are allowed")
    return tuple(
        _validated_constraint(constraint, week_start, week_end)
        for constraint in constraints
    )


def _json_value(value: Any) -> Any:
    if isinstance(value, Mapping):
        return {key: _json_value(item) for key, item in value.items()}
    if isinstance(value, (list, tuple)):
        return [_json_value(item) for item in value]
    if isinstance(value, date):
        return value.isoformat()
    return value


def _serialize_plan_receipt(receipt: WeeklyPlanReceipt) -> dict[str, Any]:
    return {
        "plan_id": receipt.plan_id,
        "parent_plan_id": receipt.parent_plan_id,
        "constitution_version": receipt.constitution_version,
        "planner_version": receipt.planner_version,
        "cycle_id": receipt.cycle_id,
        "days": [
            {
                "date": day.date.isoformat(),
                "session_type": day.session_type,
                "objective": day.objective,
                "exercises": [_json_value(exercise) for exercise in day.exercises],
                "estimated_minutes": day.estimated_minutes,
                "change_reason": day.change_reason,
            }
            for day in receipt.days
        ],
        "constraints": [
            {
                "kind": constraint.kind,
                "source": constraint.source,
                "values": _json_value(dict(constraint.values)),
            }
            for constraint in receipt.constraints
        ],
        "validations": [
            {
                "rule": validation.rule,
                "passed": validation.passed,
                "severity": validation.severity,
                "detail": validation.detail,
            }
            for validation in receipt.validations
        ],
        "created_at": receipt.created_at,
        "status": receipt.status,
        "input_hash": receipt.input_hash,
        "receipt_hash": receipt.receipt_hash,
    }


def _with_parent(receipt: WeeklyPlanReceipt, parent_plan_id: str | None) -> WeeklyPlanReceipt:
    if receipt.parent_plan_id == parent_plan_id:
        return receipt
    return WeeklyPlanReceipt.create(
        parent_plan_id=parent_plan_id,
        constitution_version=receipt.constitution_version,
        planner_version=receipt.planner_version,
        cycle_id=receipt.cycle_id,
        days=receipt.days,
        constraints=receipt.constraints,
        validations=receipt.validations,
        created_at=receipt.created_at,
        status=receipt.status,
    )


def _plan_projection(record: Mapping[str, Any]) -> dict[str, Any]:
    payload = dict(record["payload"])
    payload.update(
        {
            "status": record["status"],
            "reason": record.get("reason"),
            "changed_at": record.get("changed_at"),
            "superseded_by": record.get("superseded_by"),
        }
    )
    return payload


def _plan_diff(before: Mapping[str, Any] | None, after: Mapping[str, Any]) -> dict[str, Any]:
    before_days = {
        item["date"]: item for item in (before.get("days", []) if before else [])
    }
    after_days = {item["date"]: item for item in after.get("days", [])}
    changed_days = []
    for day_value in sorted(set(before_days) | set(after_days)):
        prior = before_days.get(day_value)
        current = after_days.get(day_value)
        if prior != current:
            changed_days.append(
                {
                    "date": day_value,
                    "before": prior,
                    "after": current,
                    "reason": current.get("change_reason") if current else None,
                }
            )
    return {"changed_days": changed_days}


def _proposal_projection(
    proposal: Mapping[str, Any], parent: Mapping[str, Any] | None
) -> dict[str, Any]:
    after = _plan_projection(proposal)
    before = _plan_projection(parent) if parent else None
    return {
        **after,
        "authoritative": (
            training_planner_mode() == "live"
            and training_planner_acceptance_status()["accepted"] is True
        ),
        "before": before,
        "after": after,
        "diff": _plan_diff(before, after),
        "interpreted_constraints": after["constraints"],
    }


def _active_constraint_groups(active: Mapping[str, Any] | None) -> tuple[list[dict], list[dict]]:
    constraints = list(active["payload"].get("constraints", [])) if active else []
    preferences = [item for item in constraints if item.get("kind") == "exercise_preference"]
    temporary = [item for item in constraints if item.get("kind") != "exercise_preference"]
    return preferences, temporary


def _public_adaptive_planner_policy(policy: Mapping[str, Any]) -> dict[str, Any]:
    return {field: policy[field] for field in _PUBLIC_ADAPTIVE_PLANNER_FIELDS}


def _current_calendar_events() -> list[dict[str, Any]]:
    try:
        latest_import = database.get_latest_calendar_snapshot_import()
        imported_snapshot = latest_import.get("snapshot") if latest_import else None
        resolved = plaan_live.resolve_snapshot_raw(
            LIVE_SNAPSHOT_RAW,
            imported_snapshot=imported_snapshot,
        )
        if not isinstance(resolved, tuple) or len(resolved) != 2:
            raise CalendarEvidenceUnavailable
        calendar_snapshot_raw, source_status = resolved
        if not isinstance(calendar_snapshot_raw, Mapping):
            raise CalendarEvidenceUnavailable
        calendar_events = calendar_snapshot_raw.get("events")
        if not isinstance(calendar_events, list):
            raise CalendarEvidenceUnavailable
        if not isinstance(source_status, Mapping):
            raise CalendarEvidenceUnavailable
        if source_status.get("active_source") not in _AUTHORITATIVE_CALENDAR_SOURCES:
            raise CalendarEvidenceUnavailable
        validated_events = []
        for event in calendar_events:
            if not isinstance(event, Mapping):
                raise CalendarEvidenceUnavailable
            event_date = event.get("training_date", event.get("date"))
            if not isinstance(event_date, str):
                raise CalendarEvidenceUnavailable
            date.fromisoformat(event_date)
            validated_event = dict(event)
            for field, recognized_values in (
                ("event_type", _CALENDAR_ROUTING_EVENT_TYPES),
                ("severity", _CALENDAR_ROUTING_SEVERITIES),
            ):
                if field not in event:
                    continue
                if not isinstance(event[field], str) or not event[field].strip():
                    raise CalendarEvidenceUnavailable
                normalized_value = event[field].strip().lower()
                if field == "severity" and normalized_value not in recognized_values:
                    raise CalendarEvidenceUnavailable
                if normalized_value in recognized_values:
                    validated_event[field] = normalized_value
            if "hard_conflict" in event and not isinstance(event["hard_conflict"], bool):
                raise CalendarEvidenceUnavailable
            validated_events.append(validated_event)
        return validated_events
    except CalendarEvidenceUnavailable:
        raise
    except Exception as exc:
        raise CalendarEvidenceUnavailable from exc


def _current_planning_snapshot(constitution: Mapping[str, Any], active: Mapping[str, Any] | None):
    week_start, _ = _planning_horizon()
    preferences, _ = _active_constraint_groups(active)
    preference_map = {
        f"{item['values'].get('avoid_or_prefer', 'prefer')}:{item['values'].get('exercise', '')}": True
        for item in preferences
    }
    configured_equipment = {
        equipment
        for requirements in constitution["adaptive_planner"]["exercise_equipment"].values()
        for equipment in requirements
    }
    calendar_events = _current_calendar_events()
    return build_planning_snapshot(
        week_start=week_start,
        created_at=clock.utc_now_iso(),
        sessions=database.get_sessions(),
        readiness=database.get_latest_training_readiness_scan(),
        calendar_events=calendar_events,
        equipment=sorted(configured_equipment),
        preferences=preference_map,
    )


def _training_plan_record_or_404(plan_id: str) -> dict[str, Any]:
    try:
        record = database.get_training_plan_receipt(plan_id)
    except Exception as exc:
        raise HTTPException(
            status_code=503, detail="Training plan storage unavailable"
        ) from exc
    if record is None:
        raise HTTPException(status_code=404, detail="Training plan proposal not found")
    return record


def _build_brief_user_message(status: dict) -> str:
    g = status["dunk_goal"]
    c = status["cut_status"]
    sess = status["today_session"]
    ww = sess.get("working_weights")

    lines = [
        f"Training status as of {status['as_of']}:",
        f"Phase: {g['current_phase']}, week {g['current_mesocycle_week']} of mesocycle",
        f"Days to dunk attempt: {g['days_to_attempt']} ({g['weeks_to_attempt']:.1f} weeks)",
        "",
        f"Today: {sess['session_type'].upper()} session",
    ]

    if ww:
        lines += [
            f"Working weights ({ww['intensity_pct']}% intensity, {ww['sets']}×{ww['reps']}):",
            f"  {ww['explosive_exercise']}: {ww['explosive_kg']}kg",
            f"  {ww['knee_extension_exercise']}: {ww['knee_extension_kg']}kg",
            f"  {ww['posterior_chain_exercise']}: {ww['posterior_chain_kg']}kg",
            f"  {ww['lower_leg_exercise']}: {ww['lower_leg_kg']}kg",
            f"  {ww['top_set_note']}",
        ]

    lines += [
        "",
        f"Cut: {'active' if c['active'] else 'ended'}. {c['days_remaining']} days remaining.",
        f"Body fat: {c['current_bf_pct']}% → target {c['target_bf_pct']}%"
        f" ({c['estimated_fat_to_lose_kg']}kg to lose)",
    ]

    if status["has_hard_conflicts"]:
        lines.append(f"⚠ CONFLICT: {status['conflicts'][0]['detail']}")
    elif status["fatigue_warning"]:
        lines.append(f"Note: {status['fatigue_warning']}")

    lines += ["", "Provide a brief, direct training summary for today."]
    return "\n".join(lines)


@router.get("/plan/current", response_model=TrainingPlanResponse)
def current_training_plan() -> dict[str, Any]:
    try:
        active = database.get_active_training_plan(_current_cycle())
    except Exception as exc:
        raise HTTPException(
            status_code=503, detail="Training plan storage unavailable"
        ) from exc
    if active is None:
        raise HTTPException(
            status_code=404,
            detail="No active training plan for the current horizon",
        )
    return _plan_projection(active)


@router.post("/plan/proposals", response_model=TrainingPlanProposalResponse)
def propose_training_plan(
    request: TrainingPlanProposalRequest,
    constitution: dict = Depends(get_training_constitution),
) -> dict[str, Any]:
    constraints = _compile_proposal_constraints(request)
    try:
        active = database.get_active_training_plan(_current_cycle())
        snapshot = _current_planning_snapshot(constitution, active)
    except CalendarEvidenceUnavailable as exc:
        raise HTTPException(
            status_code=503, detail="Training plan calendar evidence unavailable"
        ) from exc
    except Exception as exc:
        raise HTTPException(
            status_code=503, detail="Training plan storage unavailable"
        ) from exc

    try:
        proposal = generate_weekly_plan(constitution, snapshot, constraints)
        proposal = _with_parent(
            proposal, active["plan_id"] if active is not None else None
        )
    except ValueError as exc:
        if "hard rules" in str(exc).lower():
            raise HTTPException(
                status_code=409,
                detail=f"No valid training plan could be generated: {exc}",
            ) from exc
        raise HTTPException(
            status_code=422, detail=f"Invalid training constraints: {exc}"
        ) from exc
    except Exception as exc:
        raise HTTPException(
            status_code=503, detail="Training planner unavailable"
        ) from exc

    try:
        stored = database.save_training_plan_receipt(_serialize_plan_receipt(proposal))
    except ValueError as exc:
        raise HTTPException(status_code=409, detail=str(exc)) from exc
    except Exception as exc:
        raise HTTPException(
            status_code=503, detail="Training plan storage unavailable"
        ) from exc
    return _proposal_projection(stored, active)


@router.get(
    "/plan/proposals/{proposal_id}",
    response_model=TrainingPlanProposalResponse,
)
def training_plan_proposal(proposal_id: str) -> dict[str, Any]:
    proposal = _training_plan_record_or_404(proposal_id)
    parent = None
    parent_plan_id = proposal["parent_plan_id"]
    if parent_plan_id:
        try:
            parent = database.get_training_plan_receipt(parent_plan_id)
        except Exception as exc:
            raise HTTPException(
                status_code=503, detail="Training plan storage unavailable"
            ) from exc
        if parent is None:
            raise HTTPException(
                status_code=409,
                detail="Training plan proposal parent is unavailable",
            )
    return _proposal_projection(proposal, parent)


@router.post(
    "/plan/proposals/{proposal_id}/apply",
    response_model=TrainingPlanResponse,
)
def apply_training_plan(proposal_id: str) -> dict[str, Any]:
    proposal = _training_plan_record_or_404(proposal_id)
    if training_planner_mode() != "live":
        raise HTTPException(
            status_code=409,
            detail="Training planner is in shadow mode; proposal cannot be applied",
        )
    if training_planner_acceptance_status()["accepted"] is not True:
        raise HTTPException(
            status_code=503,
            detail="Training planner live acceptance evidence is unavailable",
        )
    if proposal["status"] == "active":
        return _plan_projection(proposal)
    if proposal["status"] != "proposed":
        raise HTTPException(
            status_code=409,
            detail="Only proposed training plans can be applied",
        )
    hard_failures = [
        validation
        for validation in proposal["payload"].get("validations", [])
        if validation.get("severity") == "hard" and validation.get("passed") is False
    ]
    if hard_failures:
        details = "; ".join(str(item.get("detail", "")) for item in hard_failures)
        raise HTTPException(
            status_code=409,
            detail=f"Hard safety validation failed; proposal cannot be applied: {details}",
        )
    try:
        applied = database.apply_training_plan_proposal(proposal_id)
    except ValueError as exc:
        raise HTTPException(status_code=409, detail=str(exc)) from exc
    except Exception as exc:
        raise HTTPException(
            status_code=503, detail="Training plan storage unavailable"
        ) from exc
    return _plan_projection(applied)


@router.post(
    "/plan/proposals/{proposal_id}/reject",
    response_model=TrainingPlanResponse,
)
def reject_training_plan(proposal_id: str) -> dict[str, Any]:
    proposal = _training_plan_record_or_404(proposal_id)
    if proposal["status"] == "rejected":
        return _plan_projection(proposal)
    if proposal["status"] != "proposed":
        raise HTTPException(
            status_code=409,
            detail="Only proposed training plans can be rejected",
        )
    try:
        rejected = database.reject_training_plan_proposal(proposal_id)
    except ValueError as exc:
        raise HTTPException(status_code=409, detail=str(exc)) from exc
    except Exception as exc:
        raise HTTPException(
            status_code=503, detail="Training plan storage unavailable"
        ) from exc
    return _plan_projection(rejected)


@router.get("/plans/history", response_model=TrainingPlanHistoryResponse)
def training_plan_history() -> dict[str, Any]:
    try:
        records = database.list_training_plan_receipts()
    except Exception as exc:
        raise HTTPException(
            status_code=503, detail="Training plan storage unavailable"
        ) from exc
    return {"items": [_plan_projection(record) for record in records]}


@router.get("/rules", response_model=TrainingRulesResponse)
def training_rules(
    constitution: dict = Depends(get_training_constitution),
) -> dict[str, Any]:
    try:
        active = database.get_active_training_plan(_current_cycle())
    except Exception as exc:
        raise HTTPException(
            status_code=503, detail="Training plan storage unavailable"
        ) from exc
    preferences, temporary_constraints = _active_constraint_groups(active)
    policy = _public_adaptive_planner_policy(constitution["adaptive_planner"])
    return {
        "objective": constitution["goal"],
        "planner_version": str(policy["version"]),
        "planner": policy,
        "recovery_spacing": dict(policy["minimum_recovery_hours"]),
        "adaptation_limits": {
            "maximum_weekly_volume_increase_pct": policy[
                "maximum_weekly_volume_increase_pct"
            ],
            "maximum_session_volume_reduction_pct": policy[
                "maximum_session_volume_reduction_pct"
            ],
        },
        "movement_families": {
            name: list(exercises)
            for name, exercises in policy["movement_families"].items()
        },
        "preferences": preferences,
        "temporary_constraints": temporary_constraints,
        "active_plan_id": active["plan_id"] if active else None,
    }


@router.get("/status")
def training_status(
    constitution: dict = Depends(get_training_constitution),
) -> dict:
    status, constitution = _current_status(constitution)
    result = _serialize_status(status)
    result["today_session"]["exercises"] = _resolve_exercises(result["today_session"], constitution)

    weight_history_raw = database.get_weight_history(days=90)
    wh = [{"date": e["log_date"], "weight_kg": e["weight_kg"]} for e in weight_history_raw]
    result["cut_status"]["weight_history"] = wh

    weekly_delta_kg = None
    avg_weekly_loss_kg = None
    if len(wh) >= 2:
        latest_w = wh[-1]["weight_kg"]
        cutoff_date = (clock.today() - timedelta(days=8)).isoformat()
        older_w = next((e["weight_kg"] for e in reversed(wh[:-1]) if e["date"] <= cutoff_date), None)
        if older_w is not None:
            weekly_delta_kg = round(latest_w - older_w, 2)
        days_span = (date.fromisoformat(wh[-1]["date"]) - date.fromisoformat(wh[0]["date"])).days
        if days_span >= 7:
            avg_weekly_loss_kg = round((wh[0]["weight_kg"] - latest_w) / (days_span / 7), 2)
    result["cut_status"]["weekly_delta_kg"] = weekly_delta_kg
    result["cut_status"]["avg_weekly_loss_kg"] = avg_weekly_loss_kg

    return result


@router.post("/readiness-scan")
def create_readiness_scan(request: ReadinessScanRequest) -> dict:
    scan = _scan_from_values(request)
    status = joint_capacity.classify_readiness(scan)
    payload = request.model_dump()
    payload.update(
        {
            "scan_date": clock.today().isoformat(),
            "readiness_status": status.value,
        }
    )
    scan_id = database.save_training_readiness_scan(payload)
    return {"status": "logged", "scan_id": scan_id, **payload}


@router.get("/routed-session")
def routed_training_session(
    explicit_reset: bool = False,
    constitution: dict = Depends(get_training_constitution),
) -> dict:
    status, effective = _current_status(constitution)
    session = _serialize_session(status.today_session)
    session["exercises"] = _resolve_exercises(session, effective)
    row = database.get_latest_training_readiness_scan(clock.today().isoformat())
    scan = _scan_from_values(row) if row else None
    route = joint_capacity.route_session(session, scan, explicit_reset=explicit_reset)
    result = _serialize_route(route)
    result["readiness_scan"] = row
    return result


@router.post("/log/session")
def create_session_log(request: SessionLogRequest) -> dict:
    session_id = database.log_session(
        session_date=request.date,
        session_type=request.session_type,
        week_number=request.week_number,
        exercises=[exercise.model_dump(exclude_none=True) for exercise in request.exercises],
        notes=request.notes,
    )
    return {
        "status": "logged",
        "session_id": session_id,
        "date": request.date.isoformat(),
    }


@router.post("/log/jump")
def create_jump_log(request: JumpLogRequest) -> dict:
    jump_id = database.log_jump(
        jump_date=request.date,
        jump_type=request.jump_type,
        height_cm=request.height_cm,
        notes=request.notes,
    )
    return {
        "status": "logged",
        "jump_id": jump_id,
        "date": request.date.isoformat(),
    }


@router.post("/log/capacity-block")
def create_capacity_block_log(request: CapacityBlockLogRequest) -> dict:
    capacity_log_id = database.save_training_capacity_log(
        {
            "log_date": clock.today().isoformat(),
            "block_key": request.block_key,
            "completion": {
                "completed": request.completed,
                **({"minutes": request.minutes} if request.minutes is not None else {}),
            },
            "notes": request.notes,
        }
    )
    return {"status": "logged", "capacity_log_id": capacity_log_id}


@router.post("/log/jump-balance")
def create_jump_balance_log(request: JumpBalanceLogRequest) -> dict:
    jump_balance_log_id = database.save_training_jump_balance_log(
        {
            "log_date": clock.today().isoformat(),
            **request.model_dump(),
        }
    )
    return {"status": "logged", "jump_balance_log_id": jump_balance_log_id}


@router.get("/history")
def training_history() -> dict:
    sessions = database.get_sessions()
    jumps = database.get_jumps()
    return {
        "sessions": sessions,
        "jump_progression": progression.build_jump_progression(jumps),
        "next_week_suggestions": progression.get_next_week_suggestions(sessions),
        "readiness_scans": database.list_training_readiness_scans(),
        "capacity_logs": database.list_training_capacity_logs(),
        "jump_balance_logs": database.list_training_jump_balance_logs(),
    }


@router.get("/brief")
def training_brief(
    constitution: dict = Depends(get_training_constitution),
) -> dict:
    status = engine.check_training(
        constitution,
        today=clock.today(),
        opera_snapshot_raw=LIVE_SNAPSHOT_RAW,
    )
    status_dict = _serialize_status(status)
    user_message = _build_brief_user_message(status_dict)

    try:
        result = ai_gateway.generate_text(
            system_prompt=_TRAINING_BRIEF_SYSTEM,
            messages=[{"role": "user", "content": user_message}],
            max_tokens=256,
        )
        brief_text = result.text if result.ok else (
            "AI training brief unavailable. Raw training status available via /training/status."
        )
    except Exception:
        brief_text = (
            "Unable to generate brief. "
            "Raw training status available via /training/status."
        )

    return {"brief": brief_text, "requires_approval": True}


class SleepLogRequest(BaseModel):
    event_type: Literal["bedtime", "wakeup"]


class SleepDurationRequest(BaseModel):
    minutes: int = Field(ge=60, le=960)


class SorenessLogRequest(BaseModel):
    score: int = Field(ge=0, le=5)


@router.post("/log/sleep")
def log_sleep(request: SleepLogRequest) -> dict:
    event_id = database.log_sleep_event(request.event_type)
    return {"status": "logged", "event_type": request.event_type, "id": event_id}


@router.post("/log/sleep-duration")
def log_sleep_duration(request: SleepDurationRequest) -> dict:
    """Duration-based sleep log: stores a backdated bedtime→wakeup pair."""
    pair = database.log_sleep_duration(request.minutes)
    return {"status": "logged", "minutes": request.minutes, **pair}


@router.post("/log/soreness")
def log_soreness(request: SorenessLogRequest) -> dict:
    row_id = database.log_soreness(request.score)
    return {"status": "logged", "score": request.score, "id": row_id}


@router.get("/recovery")
def get_recovery() -> dict:
    sleep = database.get_last_sleep()
    soreness = database.get_last_soreness()
    sleep_score = sleep["score"] if sleep else None
    soreness_score = soreness["pct"] if soreness else None
    scores = [s for s in [sleep_score, soreness_score] if s is not None]
    overall = int(sum(scores) / len(scores)) if scores else None
    return {
        "overall": overall,
        "sleep": {"available": bool(sleep), **(sleep or {})},
        "soreness": {"available": bool(soreness), **(soreness or {})},
    }
