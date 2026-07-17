from __future__ import annotations

from dataclasses import dataclass, fields, is_dataclass
from datetime import date
from hashlib import sha256
import json
from types import MappingProxyType
from typing import Any, Literal, Mapping
from uuid import NAMESPACE_URL, uuid5

PlanStatus = Literal["proposed", "active", "superseded", "completed", "rejected"]
ConstraintKind = Literal[
    "unavailable", "move_session", "skip_session", "replace_exercise",
    "time_limit", "equipment_available", "exercise_preference",
]
_CONSTRAINT_KINDS = frozenset(
    {
        "unavailable",
        "move_session",
        "skip_session",
        "replace_exercise",
        "time_limit",
        "equipment_available",
        "exercise_preference",
    }
)
_CONSTRAINT_SOURCES = frozenset({"user", "phoenix", "safety"})


def _freeze(value: Any) -> Any:
    if isinstance(value, Mapping):
        return MappingProxyType({key: _freeze(item) for key, item in value.items()})
    if isinstance(value, (list, tuple)):
        return tuple(_freeze(item) for item in value)
    return value


def _plain(value: Any) -> Any:
    if isinstance(value, Mapping):
        return {key: _plain(item) for key, item in value.items()}
    if isinstance(value, tuple):
        return [_plain(item) for item in value]
    if isinstance(value, date):
        return value.isoformat()
    return value


def _canonical(value: Any) -> Any:
    if is_dataclass(value) and not isinstance(value, type):
        contract_type = f"{type(value).__module__}.{type(value).__qualname__}"
        return {
            "type": "dataclass",
            "name": contract_type,
            "fields": [[field.name, _canonical(getattr(value, field.name))] for field in fields(value)],
        }
    if isinstance(value, Mapping):
        return {"type": "mapping", "items": [[key, _canonical(item)] for key, item in sorted(value.items())]}
    if isinstance(value, tuple):
        return {"type": "tuple", "items": [_canonical(item) for item in value]}
    if isinstance(value, list):
        return {"type": "list", "items": [_canonical(item) for item in value]}
    if isinstance(value, date):
        return {"type": "date", "value": value.isoformat()}
    if value is None or isinstance(value, (str, int, float, bool)):
        return value
    raise TypeError(f"Unsupported canonical value: {type(value).__name__}")


def canonical_hash(value: Mapping[str, Any]) -> str:
    encoded = json.dumps(_canonical(value), sort_keys=True, separators=(",", ":"), allow_nan=False).encode("ascii")
    return sha256(encoded).hexdigest()


def iso_cycle_id(day: date) -> str:
    year, week, _ = day.isocalendar()
    return f"{year}-W{week:02d}"


@dataclass(frozen=True)
class TrainingConstraint:
    kind: ConstraintKind
    source: Literal["user", "phoenix", "safety"]
    values: tuple[tuple[str, Any], ...]

    def __post_init__(self):
        if self.kind not in _CONSTRAINT_KINDS or self.source not in _CONSTRAINT_SOURCES:
            raise ValueError("Training constraint has an invalid kind or source")
        object.__setattr__(self, "values", tuple((key, _freeze(value)) for key, value in self.values))

    @classmethod
    def from_mapping(cls, kind: ConstraintKind, source: str, values: Mapping[str, Any]):
        return cls(kind=kind, source=source, values=tuple(sorted(values.items())))

    def to_mapping(self) -> dict[str, Any]:
        return {
            "kind": self.kind,
            "source": self.source,
            "values": _plain(dict(self.values)),
        }


@dataclass(frozen=True)
class PlannerInputSnapshot:
    week_start: date
    created_at: str
    completed_sessions: tuple[Mapping[str, Any], ...]
    readiness: Mapping[str, Any] | None
    calendar_events: tuple[Mapping[str, Any], ...]
    progression: Mapping[str, Mapping[str, Any]]
    equipment: tuple[str, ...]
    preferences: tuple[tuple[str, Any], ...]
    safety_blocks: tuple[str, ...] = ()

    def __post_init__(self):
        object.__setattr__(
            self,
            "completed_sessions",
            tuple(_freeze(session) for session in self.completed_sessions),
        )
        object.__setattr__(self, "readiness", _freeze(self.readiness))
        object.__setattr__(
            self,
            "calendar_events",
            tuple(_freeze(event) for event in self.calendar_events),
        )
        object.__setattr__(self, "progression", _freeze(self.progression))
        object.__setattr__(self, "equipment", tuple(self.equipment))
        object.__setattr__(
            self,
            "preferences",
            tuple((str(key), _freeze(value)) for key, value in self.preferences),
        )
        object.__setattr__(self, "safety_blocks", tuple(self.safety_blocks))

    def to_mapping(self) -> dict[str, Any]:
        return {
            "week_start": self.week_start.isoformat(),
            "created_at": self.created_at,
            "completed_sessions": _plain(self.completed_sessions),
            "readiness": _plain(self.readiness),
            "calendar_events": _plain(self.calendar_events),
            "progression": _plain(self.progression),
            "equipment": list(self.equipment),
            "preferences": _plain(self.preferences),
            "safety_blocks": list(self.safety_blocks),
        }

    @classmethod
    def from_mapping(cls, value: Mapping[str, Any]) -> "PlannerInputSnapshot":
        if not isinstance(value, Mapping):
            raise ValueError("Replay snapshot must be a mapping")
        try:
            week_start = date.fromisoformat(value["week_start"])
            created_at = value["created_at"]
            completed_sessions = tuple(value.get("completed_sessions", ()))
            readiness = value.get("readiness")
            calendar_events = tuple(value.get("calendar_events", ()))
            progression = value.get("progression", {})
            equipment = tuple(value.get("equipment", ()))
            preferences = tuple(tuple(item) for item in value.get("preferences", ()))
            safety_blocks = tuple(value.get("safety_blocks", ()))
        except (KeyError, TypeError, ValueError) as exc:
            raise ValueError("Malformed replay snapshot") from exc
        if not isinstance(created_at, str) or not isinstance(progression, Mapping):
            raise ValueError("Malformed replay snapshot")
        if any(not isinstance(item, Mapping) for item in completed_sessions):
            raise ValueError("Malformed replay completed sessions")
        if readiness is not None and not isinstance(readiness, Mapping):
            raise ValueError("Malformed replay readiness")
        if any(not isinstance(item, Mapping) for item in calendar_events):
            raise ValueError("Malformed replay calendar events")
        return cls(
            week_start=week_start,
            created_at=created_at,
            completed_sessions=completed_sessions,
            readiness=readiness,
            calendar_events=calendar_events,
            progression=progression,
            equipment=equipment,
            preferences=preferences,
            safety_blocks=safety_blocks,
        )


@dataclass(frozen=True)
class TrainingPlanReplayInputs:
    constitution: Mapping[str, Any]
    snapshot: PlannerInputSnapshot
    constraints: tuple[TrainingConstraint, ...]

    def __post_init__(self):
        if not isinstance(self.constitution, Mapping):
            raise ValueError("Replay constitution must be a mapping")
        if not isinstance(self.snapshot, PlannerInputSnapshot):
            raise ValueError("Replay snapshot must use PlannerInputSnapshot")
        object.__setattr__(self, "constitution", _freeze(self.constitution))
        object.__setattr__(self, "constraints", tuple(self.constraints))
        if any(not isinstance(item, TrainingConstraint) for item in self.constraints):
            raise ValueError("Replay constraints must use TrainingConstraint")

    def to_mapping(self) -> dict[str, Any]:
        return {
            "constitution": _plain(self.constitution),
            "snapshot": self.snapshot.to_mapping(),
            "constraints": [constraint.to_mapping() for constraint in self.constraints],
        }

    @classmethod
    def from_mapping(cls, value: Mapping[str, Any]) -> "TrainingPlanReplayInputs":
        if not isinstance(value, Mapping):
            raise ValueError("Replay inputs must be a mapping")
        constitution = value.get("constitution")
        snapshot = value.get("snapshot")
        raw_constraints = value.get("constraints")
        if (
            not isinstance(constitution, Mapping)
            or not isinstance(snapshot, Mapping)
            or not isinstance(raw_constraints, (list, tuple))
        ):
            raise ValueError("Malformed replay inputs")
        constraints = []
        for item in raw_constraints:
            if not isinstance(item, Mapping) or not isinstance(item.get("values"), Mapping):
                raise ValueError("Malformed replay constraint")
            constraints.append(
                TrainingConstraint.from_mapping(
                    item.get("kind"),
                    item.get("source"),
                    item["values"],
                )
            )
        return cls(
            constitution=constitution,
            snapshot=PlannerInputSnapshot.from_mapping(snapshot),
            constraints=tuple(constraints),
        )


@dataclass(frozen=True)
class PlanDay:
    date: date
    session_type: str
    objective: str
    exercises: tuple[Mapping[str, Any], ...]
    estimated_minutes: int
    change_reason: str | None = None

    def __post_init__(self):
        object.__setattr__(self, "exercises", tuple(_freeze(exercise) for exercise in self.exercises))


@dataclass(frozen=True)
class PlanValidation:
    rule: str
    passed: bool
    severity: Literal["hard", "warning", "info"]
    detail: str


@dataclass(frozen=True)
class WeeklyPlanReceipt:
    plan_id: str
    parent_plan_id: str | None
    constitution_version: str
    planner_version: str
    cycle_id: str
    days: tuple[PlanDay, ...]
    constraints: tuple[TrainingConstraint, ...]
    validations: tuple[PlanValidation, ...]
    replay_inputs: TrainingPlanReplayInputs
    created_at: str
    status: PlanStatus
    input_hash: str
    receipt_hash: str

    @classmethod
    def create(cls, **values):
        values = {
            **values,
            "days": tuple(values["days"]),
            "constraints": tuple(values["constraints"]),
            "validations": tuple(values["validations"]),
        }
        days = values["days"]
        if len({day.date for day in days}) != len(days):
            raise ValueError("Plan days must use unique dates")
        replay_inputs = values.get("replay_inputs")
        if not isinstance(replay_inputs, TrainingPlanReplayInputs):
            raise ValueError("Plan receipt requires canonical replay inputs")
        if values["constraints"] != replay_inputs.constraints:
            raise ValueError("Receipt constraints must match replay inputs")
        constitution = replay_inputs.constitution
        policy = constitution.get("adaptive_planner", {})
        if str(constitution.get("version")) != values["constitution_version"]:
            raise ValueError("Receipt constitution version must match replay inputs")
        if not isinstance(policy, Mapping) or str(policy.get("version")) != values["planner_version"]:
            raise ValueError("Receipt planner version must match replay inputs")
        if iso_cycle_id(replay_inputs.snapshot.week_start) != values["cycle_id"]:
            raise ValueError("Receipt cycle must match replay inputs")
        if replay_inputs.snapshot.created_at != values["created_at"]:
            raise ValueError("Receipt timestamp must match replay inputs")
        unsigned = {**values, "days": days}
        input_hash = canonical_hash({"replay_inputs": replay_inputs})
        plan_id = str(uuid5(NAMESPACE_URL, f"training-plan:{input_hash}:{values['cycle_id']}"))
        receipt_hash = canonical_hash({**unsigned, "plan_id": plan_id, "input_hash": input_hash})
        return cls(plan_id=plan_id, input_hash=input_hash, receipt_hash=receipt_hash, **values)

    def to_mapping(self) -> dict[str, Any]:
        return {
            "plan_id": self.plan_id,
            "parent_plan_id": self.parent_plan_id,
            "constitution_version": self.constitution_version,
            "planner_version": self.planner_version,
            "cycle_id": self.cycle_id,
            "days": [
                {
                    "date": day.date.isoformat(),
                    "session_type": day.session_type,
                    "objective": day.objective,
                    "exercises": _plain(day.exercises),
                    "estimated_minutes": day.estimated_minutes,
                    "change_reason": day.change_reason,
                }
                for day in self.days
            ],
            "constraints": [item.to_mapping() for item in self.constraints],
            "validations": [
                {
                    "rule": row.rule,
                    "passed": row.passed,
                    "severity": row.severity,
                    "detail": row.detail,
                }
                for row in self.validations
            ],
            "replay_inputs": self.replay_inputs.to_mapping(),
            "created_at": self.created_at,
            "status": self.status,
            "input_hash": self.input_hash,
            "receipt_hash": self.receipt_hash,
        }

    @classmethod
    def from_mapping(cls, value: Mapping[str, Any]) -> "WeeklyPlanReceipt":
        if not isinstance(value, Mapping) or "replay_inputs" not in value:
            raise ValueError("Plan receipt is missing canonical replay inputs")
        try:
            days = tuple(
                PlanDay(
                    date=date.fromisoformat(item["date"]),
                    session_type=item["session_type"],
                    objective=item["objective"],
                    exercises=tuple(item.get("exercises", ())),
                    estimated_minutes=item["estimated_minutes"],
                    change_reason=item.get("change_reason"),
                )
                for item in value["days"]
            )
            constraints = tuple(
                TrainingConstraint.from_mapping(
                    item["kind"], item["source"], item["values"]
                )
                for item in value["constraints"]
            )
            validations = tuple(
                PlanValidation(
                    rule=item["rule"],
                    passed=item["passed"],
                    severity=item["severity"],
                    detail=item["detail"],
                )
                for item in value["validations"]
            )
            replay_inputs = TrainingPlanReplayInputs.from_mapping(value["replay_inputs"])
            receipt = cls.create(
                parent_plan_id=value.get("parent_plan_id"),
                constitution_version=value["constitution_version"],
                planner_version=value["planner_version"],
                cycle_id=value["cycle_id"],
                days=days,
                constraints=constraints,
                validations=validations,
                replay_inputs=replay_inputs,
                created_at=value["created_at"],
                status=value["status"],
            )
        except (KeyError, TypeError, ValueError) as exc:
            raise ValueError("Malformed plan receipt") from exc
        if (
            value.get("plan_id") != receipt.plan_id
            or value.get("input_hash") != receipt.input_hash
            or value.get("receipt_hash") != receipt.receipt_hash
        ):
            raise ValueError("Plan receipt identity does not match canonical content")
        return receipt
