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


def _freeze(value: Any) -> Any:
    if isinstance(value, Mapping):
        return MappingProxyType({key: _freeze(item) for key, item in value.items()})
    if isinstance(value, (list, tuple)):
        return tuple(_freeze(item) for item in value)
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
        object.__setattr__(self, "values", tuple((key, _freeze(value)) for key, value in self.values))

    @classmethod
    def from_mapping(cls, kind: ConstraintKind, source: str, values: Mapping[str, Any]):
        return cls(kind=kind, source=source, values=tuple(sorted(values.items())))


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
        unsigned = {**values, "days": days}
        input_hash = canonical_hash({"days": unsigned["days"], "constraints": values["constraints"]})
        plan_id = str(uuid5(NAMESPACE_URL, f"training-plan:{input_hash}:{values['cycle_id']}"))
        receipt_hash = canonical_hash({**unsigned, "plan_id": plan_id, "input_hash": input_hash})
        return cls(plan_id=plan_id, input_hash=input_hash, receipt_hash=receipt_hash, **values)
