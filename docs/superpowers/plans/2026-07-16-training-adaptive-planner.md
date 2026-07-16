# PHOENIX Training Adaptive Planner Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a deterministic, versioned weekly Training planner that lets the user move, skip, and replace training through previewed replans while PHOENIX protects recovery, calendar, progression, and pain-safety rules.

**Architecture:** Pure domain modules own canonical contracts, baseline planning, constraints, validation, and evidence-driven adaptation. SQLite stores immutable plan receipts plus lifecycle events; FastAPI exposes current-plan and proposal workflows. The existing holographic Training cockpit remains the daily entry surface and opens an orange full-screen Training Control Room for week planning and adaptation.

**Tech Stack:** Python 3.11, dataclasses, FastAPI, Pydantic, SQLite, pytest, React 18, Vite, Node test runner, existing PHOENIX holographic UI tokens.

## Global Constraints

- Begin execution in an isolated `codex/training-adaptive-planner` worktree created with the `using-git-worktrees` skill; do not alter or revert unrelated changes in the dirty main checkout.
- Follow test-driven development for every behavioral change: failing test, observed failure, minimal implementation, passing focused test, then broader verification.
- The planner must be deterministic and side-effect free; identical canonical inputs must produce identical plans and hashes.
- The conversational layer may compile user intent into typed constraints but may not create or activate workouts directly.
- User-requested and PHOENIX-initiated non-emergency changes require a before/after preview and explicit apply action.
- Pain, limping, sharp-pain, and next-day-worsening flags immediately block affected loaded and explosive work.
- Only one active plan may exist for one ISO training week; apply must atomically supersede its parent and be idempotent.
- Preserve the existing Training orange theme, holographic typography, scanlines, sharp borders, and technical spacing.
- Keep `START SESSION` primary and add `ADAPT WEEK` as the secondary cockpit action.
- Do not redesign `ActiveSession.jsx` in this plan; its review begins only after authoritative planner data is live.
- Use green only for validated changes and successful checks, yellow for recoverable warnings, and red for hard safety blocks.
- Verify desktop and mobile layouts for overlap, clipping, stable dimensions, and readable week cells before completion.

## File Structure

### New Backend Files

- `jarvis/domains/training/plan_contracts.py` — immutable planner dataclasses, enums, canonical encoding, and receipt hashing.
- `jarvis/domains/training/adaptive_planner.py` — deterministic baseline generation, constraint application, validation, and proposal construction.
- `jarvis/domains/training/plan_evidence.py` — converts readiness, session history, progression, calendar, equipment, and preferences into planner evidence.
- `jarvis/domains/training/plan_acceptance.py` — replay and shadow-promotion evidence checks.
- `jarvis/domains/training/tests/test_plan_contracts.py` — canonical contract tests.
- `jarvis/domains/training/tests/test_adaptive_planner.py` — baseline, move, skip, replace, recovery, and safety tests.
- `jarvis/domains/training/tests/test_plan_evidence.py` — progression and evidence normalization tests.
- `jarvis/domains/training/tests/test_plan_acceptance.py` — replay and promotion-gate tests.
- `jarvis/api/tests/test_training_plan_routes.py` — proposal lifecycle API tests.

### Modified Backend Files

- `jarvis/domains/training/constitution.json` — version 1 planner policy, movement families, recovery spacing, and adaptation limits.
- `jarvis/domains/training/data_contracts.py` — retain existing route contracts; import or re-export plan types only when existing callers require it.
- `jarvis/data/database.py` — plan receipt and lifecycle schemas plus atomic persistence functions.
- `jarvis/data/tests/test_database.py` — immutable plan persistence and lifecycle tests.
- `jarvis/api/routers/training.py` — plan dependencies, proposal models, and seven plan endpoints.

### New Frontend Files

- `pwa/src/components/holo/subs/TrainingControlRoom.jsx` — full-screen shell and tab orchestration.
- `pwa/src/components/holo/subs/TrainingWeekView.jsx` — authoritative seven-day plan.
- `pwa/src/components/holo/subs/TrainingAdaptView.jsx` — quick actions, intent input, interpreted constraints, preview, apply, and reject.
- `pwa/src/components/holo/subs/TrainingPlanHistory.jsx` — plan-version ledger.
- `pwa/src/components/holo/subs/trainingPlannerViewModel.js` — API-to-view normalization and status tones.
- `pwa/src/components/holo/subs/trainingPlannerViewModel.test.js` — view-model tests.
- `pwa/src/components/holo/subs/trainingControlRoomContract.test.js` — static UI safety and design contracts.

### Modified Frontend Files

- `pwa/src/api/client.js` — plan API functions.
- `pwa/src/components/holo/HoloCommand.jsx` — render `training-room` sub-screen.
- `pwa/src/components/holo/holoDomains.js` — add `ADAPT WEEK` after `START SESSION`.
- `pwa/src/components/holo/holo.css` — responsive orange Control Room layout.

---

### Task 1: Canonical Planner Contracts and Constitution Policy

**Files:**
- Create: `jarvis/domains/training/plan_contracts.py`
- Create: `jarvis/domains/training/tests/test_plan_contracts.py`
- Modify: `jarvis/domains/training/constitution.json`

**Interfaces:**
- Produces: `TrainingConstraint`, `PlanDay`, `PlanValidation`, `WeeklyPlanReceipt`, `canonical_hash(value)`, and `iso_cycle_id(day)`.
- Consumes: only Python standard-library types.

- [ ] **Step 1: Write failing canonical and validation tests**

```python
from datetime import date

import pytest

from jarvis.domains.training.plan_contracts import (
    PlanDay,
    TrainingConstraint,
    WeeklyPlanReceipt,
    canonical_hash,
    iso_cycle_id,
)


def test_canonical_hash_is_order_independent_and_type_sensitive():
    assert canonical_hash({"b": 2, "a": 1}) == canonical_hash({"a": 1, "b": 2})
    assert canonical_hash({"days": ["mon"]}) != canonical_hash({"days": ("mon",)})


def test_plan_receipt_rejects_duplicate_dates():
    day = PlanDay(
        date=date(2026, 7, 20),
        session_type="high_intensity",
        objective="jump_strength",
        exercises=(),
        estimated_minutes=60,
    )
    with pytest.raises(ValueError, match="unique dates"):
        WeeklyPlanReceipt.create(
            parent_plan_id=None,
            constitution_version="1",
            planner_version="adaptive-v1",
            cycle_id="2026-W30",
            days=(day, day),
            constraints=(),
            validations=(),
            created_at="2026-07-20T06:00:00Z",
            status="proposed",
        )


def test_iso_cycle_id_uses_iso_week():
    assert iso_cycle_id(date(2026, 7, 20)) == "2026-W30"
```

- [ ] **Step 2: Run the focused test and observe the import failure**

Run: `python -m pytest jarvis/domains/training/tests/test_plan_contracts.py -q`

Expected: FAIL because `plan_contracts.py` does not exist.

- [ ] **Step 3: Implement immutable contracts and canonical hashing**

```python
# jarvis/domains/training/plan_contracts.py
from __future__ import annotations

from dataclasses import asdict, dataclass
from datetime import date
from hashlib import sha256
import json
from typing import Any, Literal, Mapping
from uuid import NAMESPACE_URL, uuid5

PlanStatus = Literal["proposed", "active", "superseded", "completed", "rejected"]
ConstraintKind = Literal[
    "unavailable", "move_session", "skip_session", "replace_exercise",
    "time_limit", "equipment_available", "exercise_preference",
]


def _canonical(value: Any) -> Any:
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

    @classmethod
    def from_mapping(cls, kind: ConstraintKind, source: str, values: Mapping[str, Any]):
        return cls(kind=kind, source=source, values=tuple(sorted(values.items())))


@dataclass(frozen=True)
class PlanDay:
    date: date
    session_type: str
    objective: str
    exercises: tuple[dict[str, Any], ...]
    estimated_minutes: int
    change_reason: str | None = None


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
        days = tuple(values["days"])
        if len({day.date for day in days}) != len(days):
            raise ValueError("Plan days must use unique dates")
        unsigned = {**values, "days": tuple(asdict(day) for day in days)}
        input_hash = canonical_hash({"days": unsigned["days"], "constraints": values["constraints"]})
        plan_id = str(uuid5(NAMESPACE_URL, f"training-plan:{input_hash}:{values['cycle_id']}"))
        receipt_hash = canonical_hash({**unsigned, "plan_id": plan_id, "input_hash": input_hash})
        return cls(plan_id=plan_id, input_hash=input_hash, receipt_hash=receipt_hash, **values)
```

- [ ] **Step 4: Add explicit planner policy to the constitution**

Change `version` from `"0"` to `"1"` and add:

```json
"adaptive_planner": {
  "version": "adaptive-v1",
  "minimum_recovery_hours": {"high_neural_to_high_neural": 36, "jump_to_high_intensity": 36},
  "maximum_weekly_volume_increase_pct": 10,
  "maximum_session_volume_reduction_pct": 40,
  "pain_block_flags": ["sharp_pain", "limping", "next_day_worsening"],
  "movement_families": {
    "knee_extension": ["back_squat", "split_squat", "leg_press"],
    "posterior_chain": ["hip_thrust", "rdl", "back_extension"],
    "explosive": ["hex_bar_jump", "power_clean", "approach_jump"]
  }
}
```

- [ ] **Step 5: Run focused and existing Training contract tests**

Run: `python -m pytest jarvis/domains/training/tests/test_plan_contracts.py jarvis/domains/training/tests/test_training_engine.py -q`

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add jarvis/domains/training/plan_contracts.py jarvis/domains/training/tests/test_plan_contracts.py jarvis/domains/training/constitution.json
git commit -m "feat(training): add adaptive plan contracts"
```

---

### Task 2: Deterministic Baseline Weekly Planner

**Files:**
- Create: `jarvis/domains/training/adaptive_planner.py`
- Create: `jarvis/domains/training/tests/test_adaptive_planner.py`

**Interfaces:**
- Consumes: `PlanDay`, `PlanValidation`, `TrainingConstraint`, `WeeklyPlanReceipt`, and existing `engine.plan_week_sessions`.
- Produces: `PlanningSnapshot`, `generate_weekly_plan(constitution, snapshot, constraints=())`, and `validate_plan(days, policy)`.

- [ ] **Step 1: Write failing baseline and determinism tests**

```python
from datetime import date

from jarvis.domains.training.adaptive_planner import PlanningSnapshot, generate_weekly_plan


def snapshot():
    return PlanningSnapshot(
        week_start=date(2026, 7, 20),
        created_at="2026-07-20T06:00:00Z",
        completed_sessions=(),
        readiness=None,
        calendar_events=(),
        progression={},
        equipment=("barbell", "rack", "hex_bar"),
        preferences=(),
    )


def test_baseline_plan_has_seven_ordered_days(training_constitution):
    plan = generate_weekly_plan(training_constitution, snapshot())
    assert len(plan.days) == 7
    assert tuple(day.date for day in plan.days) == tuple(
        date(2026, 7, 20 + offset) for offset in range(7)
    )


def test_identical_snapshot_produces_identical_receipt(training_constitution):
    first = generate_weekly_plan(training_constitution, snapshot())
    second = generate_weekly_plan(training_constitution, snapshot())
    assert first.plan_id == second.plan_id
    assert first.receipt_hash == second.receipt_hash
```

- [ ] **Step 2: Run and observe missing planner failure**

Run: `python -m pytest jarvis/domains/training/tests/test_adaptive_planner.py -q`

Expected: FAIL because `adaptive_planner.py` does not exist.

- [ ] **Step 3: Implement baseline generation and validation**

```python
# jarvis/domains/training/adaptive_planner.py
from dataclasses import dataclass
from datetime import date
from typing import Any, Mapping

from .engine import plan_week_sessions
from .plan_contracts import PlanDay, PlanValidation, TrainingConstraint, WeeklyPlanReceipt, iso_cycle_id

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
    validations = [PlanValidation("seven_unique_days", len(days) == 7 and len({d.date for d in days}) == 7, "hard", "Plan contains seven unique dates")]
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
```

- [ ] **Step 4: Run focused tests and all existing Training domain tests**

Run: `python -m pytest jarvis/domains/training/tests/test_adaptive_planner.py jarvis/domains/training/tests -q`

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add jarvis/domains/training/adaptive_planner.py jarvis/domains/training/tests/test_adaptive_planner.py
git commit -m "feat(training): generate deterministic weekly plans"
```

---

### Task 3: Move, Skip, Replace, Time, Equipment, and Preference Constraints

**Files:**
- Modify: `jarvis/domains/training/adaptive_planner.py`
- Modify: `jarvis/domains/training/tests/test_adaptive_planner.py`

**Interfaces:**
- Consumes: `TrainingConstraint` values defined in Task 1.
- Produces: `apply_constraints(days, constraints, constitution)` and complete before/after reasons on changed `PlanDay` values.

- [ ] **Step 1: Add failing move and skip tests**

```python
def test_move_today_to_tomorrow_replans_downstream_week(training_constitution):
    move = TrainingConstraint.from_mapping(
        "move_session", "user", {"source_date": "2026-07-20", "target_date": "2026-07-21"}
    )
    plan = generate_weekly_plan(training_constitution, snapshot(), (move,))
    monday, tuesday, wednesday = plan.days[:3]
    assert monday.session_type == "rest"
    assert tuesday.objective == "jump_strength"
    assert tuesday.change_reason == "moved_from:2026-07-20"
    assert wednesday.change_reason is not None


def test_skip_does_not_double_next_session(training_constitution):
    skip = TrainingConstraint.from_mapping("skip_session", "user", {"date": "2026-07-20"})
    plan = generate_weekly_plan(training_constitution, snapshot(), (skip,))
    assert plan.days[0].session_type == "rest"
    assert plan.days[1].estimated_minutes <= 60
```

- [ ] **Step 2: Run tests and observe unchanged baseline failures**

Run: `python -m pytest jarvis/domains/training/tests/test_adaptive_planner.py -q`

Expected: FAIL because constraints are not applied.

- [ ] **Step 3: Implement typed constraint dispatch**

```python
def _values(constraint):
    return dict(constraint.values)


def apply_constraints(days, constraints, constitution):
    planned = {day.date.isoformat(): day for day in days}
    for constraint in constraints:
        values = _values(constraint)
        if constraint.kind == "move_session":
            source, target = values["source_date"], values["target_date"]
            moving = planned[source]
            displaced = planned[target]
            planned[source] = replace(planned[source], session_type="rest", objective="recovery", exercises=(), estimated_minutes=0, change_reason=f"moved_to:{target}")
            planned[target] = replace(moving, date=date.fromisoformat(target), change_reason=f"moved_from:{source}")
            if displaced.session_type != "rest":
                next_key = (date.fromisoformat(target) + timedelta(days=1)).isoformat()
                if next_key in planned:
                    planned[next_key] = replace(planned[next_key], estimated_minutes=min(planned[next_key].estimated_minutes, 40), change_reason=f"volume_reduced_after_move:{target}")
        elif constraint.kind == "skip_session":
            key = values["date"]
            planned[key] = replace(planned[key], session_type="rest", objective="recovery", exercises=(), estimated_minutes=0, change_reason="user_skip")
        elif constraint.kind == "time_limit":
            key = values["date"]
            planned[key] = replace(planned[key], estimated_minutes=min(planned[key].estimated_minutes, int(values["minutes"])), change_reason="time_limit")
        elif constraint.kind == "replace_exercise":
            planned = _replace_exercise(planned, values, constitution)
        elif constraint.kind in {"equipment_available", "exercise_preference", "unavailable"}:
            planned = _apply_availability_or_preference(planned, constraint, constitution)
    return tuple(planned[key] for key in sorted(planned))
```

Add `replace` and `timedelta` imports. Implement `_replace_exercise` using the exact `movement_families` map and reject replacements outside the same family with `ValueError("Replacement must preserve movement family")`. Implement `unavailable` as a rest day and equipment/preference constraints as deterministic first-valid substitutions sorted by configured family order.

- [ ] **Step 4: Add and pass replacement boundary tests**

```python
def test_replacement_preserves_movement_family(training_constitution):
    constraint = TrainingConstraint.from_mapping(
        "replace_exercise", "user", {"date": "2026-07-20", "from": "back_squat", "to": "split_squat"}
    )
    plan = generate_weekly_plan(training_constitution, snapshot(), (constraint,))
    assert plan.days[0].change_reason == "exercise_replaced:back_squat:split_squat"


def test_replacement_rejects_different_movement_family(training_constitution):
    constraint = TrainingConstraint.from_mapping(
        "replace_exercise", "user", {"date": "2026-07-20", "from": "back_squat", "to": "power_clean"}
    )
    with pytest.raises(ValueError, match="movement family"):
        generate_weekly_plan(training_constitution, snapshot(), (constraint,))
```

Run: `python -m pytest jarvis/domains/training/tests/test_adaptive_planner.py -q`

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add jarvis/domains/training/adaptive_planner.py jarvis/domains/training/tests/test_adaptive_planner.py
git commit -m "feat(training): adapt complete weekly plans"
```

---

### Task 4: Evidence-Driven Progression, Recovery, Calendar, and Pain Safety

**Files:**
- Create: `jarvis/domains/training/plan_evidence.py`
- Create: `jarvis/domains/training/tests/test_plan_evidence.py`
- Modify: `jarvis/domains/training/adaptive_planner.py`
- Modify: `jarvis/domains/training/tests/test_adaptive_planner.py`

**Interfaces:**
- Consumes: existing readiness rows, `progression.calculate_progression`, calendar event dictionaries, session logs, equipment, and preferences.
- Produces: `build_planning_snapshot(...)`, `pain_blocked_areas(readiness)`, and additional hard/warning `PlanValidation` records.

- [ ] **Step 1: Write failing evidence normalization tests**

```python
def test_sharp_pain_creates_hard_loaded_work_block():
    snapshot = build_planning_snapshot(
        week_start=date(2026, 7, 20),
        created_at="2026-07-20T06:00:00Z",
        sessions=[],
        readiness={"knee": 4, "sharp_pain": True, "limping": False, "next_day_worsening": False},
        calendar_events=[],
        equipment=["barbell", "rack"],
        preferences={},
    )
    assert snapshot.safety_blocks == ("knee",)


def test_progression_uses_existing_session_history():
    snapshot = build_planning_snapshot(
        week_start=date(2026, 7, 20),
        created_at="2026-07-20T06:00:00Z",
        sessions=[logged_bench_session(reps=5, target=5, weight=60)],
        readiness=None,
        calendar_events=[],
        equipment=["barbell", "bench"],
        preferences={},
    )
    assert snapshot.progression["Bench Press"]["suggested_kg"] == 62.5
```

- [ ] **Step 2: Run and observe missing evidence module failure**

Run: `python -m pytest jarvis/domains/training/tests/test_plan_evidence.py -q`

Expected: FAIL because `plan_evidence.py` does not exist.

- [ ] **Step 3: Implement evidence normalization**

```python
from jarvis.domains.training.progression import calculate_progression
from jarvis.domains.training.adaptive_planner import PlanningSnapshot

AREA_KEYS = ("knee", "ankle", "hip", "hamstring", "calf_achilles", "lower_back_pelvic")


def pain_blocked_areas(readiness):
    if not readiness:
        return ()
    hard_flag = any(bool(readiness.get(key)) for key in ("sharp_pain", "limping", "next_day_worsening"))
    if not hard_flag:
        return ()
    return tuple(key for key in AREA_KEYS if int(readiness.get(key, 0)) > 0) or ("global",)


def build_planning_snapshot(*, week_start, created_at, sessions, readiness, calendar_events, equipment, preferences):
    return PlanningSnapshot(
        week_start=week_start,
        created_at=created_at,
        completed_sessions=tuple(sessions),
        readiness=readiness,
        calendar_events=tuple(calendar_events),
        progression=calculate_progression(sessions),
        equipment=tuple(sorted(set(equipment))),
        preferences=tuple(sorted(preferences.items())),
        safety_blocks=pain_blocked_areas(readiness),
    )
```

Add `safety_blocks: tuple[str, ...] = ()` to `PlanningSnapshot`.

- [ ] **Step 4: Add failing planner safety and recovery tests**

```python
def test_pain_block_routes_high_neural_day_to_recovery(training_constitution):
    unsafe = replace(snapshot(), readiness={"knee": 5, "sharp_pain": True}, safety_blocks=("knee",))
    plan = generate_weekly_plan(training_constitution, unsafe)
    assert plan.days[0].session_type == "recovery"
    assert any(row.rule == "pain_block" and row.passed for row in plan.validations)


def test_move_preserves_minimum_high_neural_spacing(training_constitution):
    move = TrainingConstraint.from_mapping("move_session", "user", {"source_date": "2026-07-20", "target_date": "2026-07-21"})
    plan = generate_weekly_plan(training_constitution, snapshot(), (move,))
    high_neural_dates = [day.date for day in plan.days if day.session_type in {"high_intensity", "jump"}]
    assert all((later - earlier).days >= 2 for earlier, later in zip(high_neural_dates, high_neural_dates[1:]))
```

- [ ] **Step 5: Implement safety-first ordering and validation**

Apply constraints first, then:

1. Replace affected loaded or explosive days with `session_type="recovery"`, `objective="pain_safe_recovery"`, no loaded exercises, and `change_reason="hard_pain_block"`.
2. Remove or reduce downstream high-neural sessions until configured spacing passes.
3. Convert calendar hard-conflict dates to recovery.
4. Apply progression only after safety and calendar routing.
5. Emit explicit `pain_block`, `calendar_conflicts`, `recovery_spacing`, and `weekly_volume_change` validations.

Run: `python -m pytest jarvis/domains/training/tests/test_plan_evidence.py jarvis/domains/training/tests/test_adaptive_planner.py -q`

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add jarvis/domains/training/plan_evidence.py jarvis/domains/training/tests/test_plan_evidence.py jarvis/domains/training/adaptive_planner.py jarvis/domains/training/tests/test_adaptive_planner.py
git commit -m "feat(training): adapt plans from recovery evidence"
```

---

### Task 5: Immutable Plan Ledger and Atomic Lifecycle

**Files:**
- Modify: `jarvis/data/database.py`
- Modify: `jarvis/data/tests/test_database.py`

**Interfaces:**
- Consumes: serialized `WeeklyPlanReceipt` dictionaries.
- Produces: `save_training_plan_receipt`, `get_training_plan_receipt`, `get_active_training_plan`, `list_training_plan_receipts`, `apply_training_plan_proposal`, and `reject_training_plan_proposal`.

- [ ] **Step 1: Write failing schema and lifecycle tests**

```python
def test_training_plan_receipt_round_trips_immutable_payload(self):
    receipt = self._training_plan_receipt(plan_id="plan-1", status="proposed")
    database.save_training_plan_receipt(receipt)
    stored = database.get_training_plan_receipt("plan-1")
    assert stored["payload"] == receipt
    assert stored["status"] == "proposed"


def test_apply_atomically_supersedes_parent_and_is_idempotent(self):
    database.save_training_plan_receipt(self._training_plan_receipt(plan_id="plan-1", status="active"))
    database.save_training_plan_receipt(self._training_plan_receipt(plan_id="plan-2", parent_plan_id="plan-1", status="proposed"))
    first = database.apply_training_plan_proposal("plan-2")
    second = database.apply_training_plan_proposal("plan-2")
    assert first["status"] == second["status"] == "active"
    assert database.get_training_plan_receipt("plan-1")["status"] == "superseded"
    assert database.get_active_training_plan("2026-W30")["plan_id"] == "plan-2"
```

- [ ] **Step 2: Run and observe missing database functions**

Run: `python -m pytest jarvis/data/tests/test_database.py -k training_plan -q`

Expected: FAIL because the plan tables and functions do not exist.

- [ ] **Step 3: Add receipt and lifecycle tables**

```sql
CREATE TABLE IF NOT EXISTS training_plan_receipts (
    plan_id TEXT PRIMARY KEY,
    cycle_id TEXT NOT NULL,
    parent_plan_id TEXT,
    constitution_version TEXT NOT NULL,
    planner_version TEXT NOT NULL,
    input_hash TEXT NOT NULL,
    receipt_hash TEXT NOT NULL,
    payload_json TEXT NOT NULL,
    created_at TEXT NOT NULL,
    persisted_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS training_plan_lifecycle_events (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    plan_id TEXT NOT NULL,
    status TEXT NOT NULL CHECK(status IN ('proposed','active','superseded','completed','rejected')),
    reason TEXT,
    changed_at TEXT NOT NULL,
    superseded_by TEXT,
    UNIQUE(plan_id, status, reason, superseded_by)
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_training_one_active_cycle
ON training_plan_lifecycle_events(plan_id, status)
WHERE status = 'active';
```

Enforce the one-active-plan-per-cycle invariant inside `BEGIN IMMEDIATE` because the event table alone cannot express it across joined receipt rows.

- [ ] **Step 4: Implement canonical persistence and atomic apply**

```python
def apply_training_plan_proposal(plan_id: str) -> dict[str, Any]:
    connection = get_db()
    try:
        connection.execute("BEGIN IMMEDIATE")
        proposal = _training_plan_record_for_update(connection, plan_id)
        if proposal["status"] == "active":
            connection.commit()
            return proposal
        if proposal["status"] != "proposed":
            raise ValueError("Only proposed training plans can be applied")
        active = _active_training_plan_for_cycle(connection, proposal["cycle_id"])
        if active is not None:
            _insert_training_plan_event(connection, active["plan_id"], "superseded", "Approved replacement", superseded_by=plan_id)
        _insert_training_plan_event(connection, plan_id, "active", "User approved proposal")
        connection.commit()
        return get_training_plan_receipt(plan_id)
    except Exception:
        connection.rollback()
        raise
    finally:
        connection.close()
```

Use existing canonical database encoding helpers for `payload_json`; verify stored bytes and `receipt_hash` on write and read. Add append-only triggers that reject updates and deletes from `training_plan_receipts`.

- [ ] **Step 5: Run database and Training tests**

Run: `python -m pytest jarvis/data/tests/test_database.py -k "training_plan or training_readiness" -q`

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add jarvis/data/database.py jarvis/data/tests/test_database.py
git commit -m "feat(training): persist immutable weekly plans"
```

---

### Task 6: Proposal, Apply, Reject, History, Rules, and Intent APIs

**Files:**
- Modify: `jarvis/api/routers/training.py`
- Create: `jarvis/api/tests/test_training_plan_routes.py`

**Interfaces:**
- Consumes: planner, evidence builder, plan ledger, current Training constitution, current session/readiness/history/calendar data.
- Produces: `GET /training/plan/current`, `POST /training/plan/proposals`, `GET /training/plan/proposals/{id}`, `POST /training/plan/proposals/{id}/apply`, `POST /training/plan/proposals/{id}/reject`, `GET /training/plans/history`, and `GET /training/rules`.

- [ ] **Step 1: Write failing route lifecycle tests**

```python
def test_move_proposal_returns_before_after_without_activation(client, seeded_active_plan):
    response = client.post("/training/plan/proposals", json={
        "constraints": [{
            "kind": "move_session",
            "source": "user",
            "values": {"source_date": "2026-07-20", "target_date": "2026-07-21"},
        }]
    })
    assert response.status_code == 200
    body = response.json()
    assert body["status"] == "proposed"
    assert body["parent_plan_id"] == seeded_active_plan
    assert body["diff"]["changed_days"]
    assert client.get("/training/plan/current").json()["plan_id"] == seeded_active_plan


def test_apply_makes_proposal_authoritative(client, seeded_proposal):
    applied = client.post(f"/training/plan/proposals/{seeded_proposal}/apply")
    assert applied.status_code == 200
    assert applied.json()["status"] == "active"
    assert client.get("/training/plan/current").json()["plan_id"] == seeded_proposal


def test_hard_safety_block_disables_apply(client, pain_blocked_proposal):
    response = client.post(f"/training/plan/proposals/{pain_blocked_proposal}/apply")
    assert response.status_code == 409
    assert "hard safety" in response.json()["detail"].lower()
```

- [ ] **Step 2: Run and observe 404 failures**

Run: `python -m pytest jarvis/api/tests/test_training_plan_routes.py -q`

Expected: FAIL with 404 for missing routes.

- [ ] **Step 3: Add Pydantic request models and structured proposal route**

```python
class TrainingConstraintRequest(BaseModel):
    kind: Literal["unavailable", "move_session", "skip_session", "replace_exercise", "time_limit", "equipment_available", "exercise_preference"]
    source: Literal["user", "phoenix", "safety"] = "user"
    values: dict[str, Any]


class TrainingPlanProposalRequest(BaseModel):
    constraints: list[TrainingConstraintRequest] = Field(min_length=1, max_length=12)


@router.post("/plan/proposals")
def propose_training_plan(request: TrainingPlanProposalRequest, constitution: dict = Depends(get_training_constitution)) -> dict:
    active = database.get_active_training_plan(_current_cycle())
    constraints = tuple(
        TrainingConstraint.from_mapping(item.kind, item.source, item.values)
        for item in request.constraints
    )
    snapshot = _current_planning_snapshot()
    proposal = generate_weekly_plan(constitution, snapshot, constraints)
    payload = _serialize_plan(proposal, parent_plan_id=active["plan_id"] if active else None)
    database.save_training_plan_receipt(payload)
    return _proposal_projection(payload, active)
```

Add exact constraint validation: source and target dates must be within the same displayed planning horizon; time limits must be 15–180 minutes; replacements require `from` and `to`; equipment lists must contain non-empty strings.

- [ ] **Step 4: Add apply, reject, current, detail, history, and rules routes**

Apply returns 409 when any hard validation has `passed=false`. Reject appends `rejected` without modifying the active parent. Rules returns the planner section of the constitution plus active preferences and temporary constraints; it never exposes secrets or raw prompts.

- [ ] **Step 5: Add constrained intent compilation**

Add `intent: str | None` to `TrainingPlanProposalRequest`. Compile these exact supported forms before optional AI assistance:

```python
MOVE_PATTERN = re.compile(r"(?:move|train).*?(today|\d{4}-\d{2}-\d{2}).*?(tomorrow|\d{4}-\d{2}-\d{2})", re.I)
SKIP_PATTERN = re.compile(r"skip.*?(today|tomorrow|\d{4}-\d{2}-\d{2})", re.I)


def compile_training_intent(intent: str, today: date) -> tuple[TrainingConstraint, ...]:
    if match := MOVE_PATTERN.search(intent):
        source = _resolve_relative_date(match.group(1), today)
        target = _resolve_relative_date(match.group(2), today)
        return (TrainingConstraint.from_mapping("move_session", "user", {"source_date": source.isoformat(), "target_date": target.isoformat()}),)
    if match := SKIP_PATTERN.search(intent):
        target = _resolve_relative_date(match.group(1), today)
        return (TrainingConstraint.from_mapping("skip_session", "user", {"date": target.isoformat()}),)
    raise HTTPException(422, "Request could not be translated into a supported training constraint")
```

The response must echo `interpreted_constraints`; intent compilation cannot call apply.

- [ ] **Step 6: Run all Training API tests**

Run: `python -m pytest jarvis/api/tests/test_training_plan_routes.py jarvis/api/tests/test_training_routes.py jarvis/api/tests/test_training_tracker.py -q`

Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add jarvis/api/routers/training.py jarvis/api/tests/test_training_plan_routes.py
git commit -m "feat(training): expose adaptive plan lifecycle"
```

---

### Task 7: Frontend API and Planner View Model

**Files:**
- Modify: `pwa/src/api/client.js`
- Create: `pwa/src/components/holo/subs/trainingPlannerViewModel.js`
- Create: `pwa/src/components/holo/subs/trainingPlannerViewModel.test.js`

**Interfaces:**
- Consumes: Task 6 JSON contracts.
- Produces: `getTrainingCurrentPlan`, `postTrainingPlanProposal`, `getTrainingPlanProposal`, `applyTrainingPlanProposal`, `rejectTrainingPlanProposal`, `getTrainingPlanHistory`, `getTrainingRules`, `normalizeTrainingPlan`, `planTone`, and `buildPlanDiff`.

- [ ] **Step 1: Write failing view-model tests**

```javascript
import test from 'node:test'
import assert from 'node:assert/strict'
import { buildPlanDiff, normalizeTrainingPlan, planTone } from './trainingPlannerViewModel.js'

test('normalizes seven days in chronological order', () => {
  const plan = normalizeTrainingPlan({ plan_id: 'p1', status: 'active', days: [
    { date: '2026-07-21', session_type: 'general' },
    { date: '2026-07-20', session_type: 'high_intensity' },
  ] })
  assert.deepEqual(plan.days.map(day => day.date), ['2026-07-20', '2026-07-21'])
})

test('hard failed validation uses red tone and disables apply', () => {
  const plan = normalizeTrainingPlan({ status: 'proposed', validations: [
    { rule: 'pain_block', passed: false, severity: 'hard', detail: 'Sharp knee pain' },
  ] })
  assert.equal(planTone(plan), 'blocked')
  assert.equal(plan.canApply, false)
})

test('diff identifies moved and reduced days', () => {
  const diff = buildPlanDiff(beforeFixture, afterFixture)
  assert.deepEqual(diff.changedDays.map(day => day.date), ['2026-07-20', '2026-07-21', '2026-07-22'])
})
```

- [ ] **Step 2: Run and observe module-not-found failure**

Run: `cd pwa && node --test src/components/holo/subs/trainingPlannerViewModel.test.js`

Expected: FAIL because the view model does not exist.

- [ ] **Step 3: Add API functions**

```javascript
export const getTrainingCurrentPlan = () => apiFetch('/training/plan/current')
export const getTrainingPlanProposal = id => apiFetch(`/training/plan/proposals/${encodeURIComponent(id)}`)
export const postTrainingPlanProposal = payload => apiFetch('/training/plan/proposals', { method: 'POST', body: JSON.stringify(payload) })
export const applyTrainingPlanProposal = id => apiFetch(`/training/plan/proposals/${encodeURIComponent(id)}/apply`, { method: 'POST' })
export const rejectTrainingPlanProposal = id => apiFetch(`/training/plan/proposals/${encodeURIComponent(id)}/reject`, { method: 'POST' })
export const getTrainingPlanHistory = () => apiFetch('/training/plans/history')
export const getTrainingRules = () => apiFetch('/training/rules')
```

- [ ] **Step 4: Implement pure view normalization**

```javascript
export function normalizeTrainingPlan(raw = {}) {
  const validations = Array.isArray(raw.validations) ? raw.validations : []
  const hardFailures = validations.filter(row => row.severity === 'hard' && row.passed === false)
  return {
    ...raw,
    days: [...(Array.isArray(raw.days) ? raw.days : [])].sort((a, b) => String(a.date).localeCompare(String(b.date))),
    validations,
    hardFailures,
    canApply: raw.status === 'proposed' && hardFailures.length === 0,
  }
}

export const planTone = plan => plan.hardFailures?.length ? 'blocked' : plan.status === 'active' ? 'active' : 'proposal'

export function buildPlanDiff(before = {}, after = {}) {
  const prior = new Map((before.days || []).map(day => [day.date, day]))
  return {
    changedDays: (after.days || []).filter(day => JSON.stringify(prior.get(day.date) || null) !== JSON.stringify(day)),
  }
}
```

- [ ] **Step 5: Run view-model and existing PWA tests**

Run: `cd pwa && node --test src/components/holo/subs/trainingPlannerViewModel.test.js src/components/training/trainingViewModel.test.js`

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add pwa/src/api/client.js pwa/src/components/holo/subs/trainingPlannerViewModel.js pwa/src/components/holo/subs/trainingPlannerViewModel.test.js
git commit -m "feat(training): add planner client contracts"
```

---

### Task 8: Orange Training Control Room Week, History, and Rules Views

**Files:**
- Create: `pwa/src/components/holo/subs/TrainingControlRoom.jsx`
- Create: `pwa/src/components/holo/subs/TrainingWeekView.jsx`
- Create: `pwa/src/components/holo/subs/TrainingPlanHistory.jsx`
- Create: `pwa/src/components/holo/subs/trainingControlRoomContract.test.js`
- Modify: `pwa/src/components/holo/holo.css`

**Interfaces:**
- Consumes: Task 7 API and normalized plan values.
- Produces: `TrainingControlRoom({ onClose })` and reusable Week, History, and Rules views.

- [ ] **Step 1: Write failing static UI contract tests**

```javascript
import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const room = readFileSync(new URL('./TrainingControlRoom.jsx', import.meta.url), 'utf8')
const css = readFileSync(new URL('../holo.css', import.meta.url), 'utf8')

test('control room exposes the approved four-view hierarchy', () => {
  for (const label of ['WEEK', 'ADAPT', 'HISTORY', 'RULES']) assert.match(room, new RegExp(label))
})

test('control room preserves orange training identity', () => {
  assert.match(room, /phx-scope-training/)
  assert.match(css, /training-control-room/)
  assert.doesNotMatch(room, /financeReadability/)
})

test('week cells use stable responsive dimensions', () => {
  assert.match(css, /grid-template-columns:\s*repeat\(7/)
  assert.match(css, /@media[^}]*max-width/s)
})
```

- [ ] **Step 2: Run and observe missing component failures**

Run: `cd pwa && node --test src/components/holo/subs/trainingControlRoomContract.test.js`

Expected: FAIL because the files do not exist.

- [ ] **Step 3: Implement the Control Room shell**

```jsx
export default function TrainingControlRoom({ onClose }) {
  const [tab, setTab] = useState('WEEK')
  const [plan, setPlan] = useState(null)
  const [history, setHistory] = useState([])
  const [rules, setRules] = useState(null)
  const [error, setError] = useState('')

  useEffect(() => {
    let alive = true
    Promise.all([getTrainingCurrentPlan(), getTrainingPlanHistory(), getTrainingRules()])
      .then(([current, past, activeRules]) => {
        if (!alive) return
        setPlan(normalizeTrainingPlan(current))
        setHistory(past.items || [])
        setRules(activeRules)
      })
      .catch(err => alive && setError(err?.message || 'Training plan unavailable.'))
    return () => { alive = false }
  }, [])

  return (
    <SubShell title="TRAINING // CONTROL ROOM" sub="ADAPTIVE WEEK · PLAN · REVIEW" onClose={onClose}>
      <main className="phx-scope-training training-control-room">
        <nav className="training-control-tabs">
          {['WEEK', 'ADAPT', 'HISTORY', 'RULES'].map(value => (
            <button key={value} className={tab === value ? 'active' : ''} onClick={() => setTab(value)}>{value}</button>
          ))}
        </nav>
        {error && <div className="training-plan-error">{error}</div>}
        {tab === 'WEEK' && <TrainingWeekView plan={plan} />}
        {tab === 'HISTORY' && <TrainingPlanHistory items={history} />}
        {tab === 'RULES' && <TrainingRulesView rules={rules} />}
        {tab === 'ADAPT' && <TrainingAdaptView activePlan={plan} onApplied={setPlan} />}
      </main>
    </SubShell>
  )
}
```

- [ ] **Step 4: Implement readable Week, History, and Rules views**

`TrainingWeekView` renders exactly seven stable day cells, active/proposed version metadata, changed-day markers, session objective, duration, and validation summary. `TrainingPlanHistory` renders plan version, lifecycle status, creation time, parent link, and reason summary. `TrainingRulesView` renders objective, recovery spacing, adaptation limits, movement families, preferences, and temporary constraints without editable raw JSON.

- [ ] **Step 5: Add responsive orange CSS**

```css
.training-control-room { --training-accent: #ff8734; color: var(--text); }
.training-control-tabs { display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); border: 1px solid rgba(255,135,52,.28); }
.training-week-grid { display: grid; grid-template-columns: repeat(7, minmax(112px, 1fr)); gap: 1px; overflow-x: auto; }
.training-week-day { min-height: 148px; border: 1px solid rgba(255,135,52,.18); background: rgba(5,14,17,.88); }
.training-week-day.changed { border-color: rgba(53,227,154,.62); }
@media (max-width: 760px) {
  .training-control-tabs { grid-template-columns: repeat(2, minmax(0, 1fr)); }
  .training-week-grid { grid-template-columns: repeat(7, 118px); }
}
```

- [ ] **Step 6: Run contracts and build**

Run: `cd pwa && node --test src/components/holo/subs/trainingControlRoomContract.test.js src/components/holo/subs/trainingPlannerViewModel.test.js && npm run build`

Expected: all tests PASS and Vite build exits 0.

- [ ] **Step 7: Commit**

```bash
git add pwa/src/components/holo/subs/TrainingControlRoom.jsx pwa/src/components/holo/subs/TrainingWeekView.jsx pwa/src/components/holo/subs/TrainingPlanHistory.jsx pwa/src/components/holo/subs/trainingControlRoomContract.test.js pwa/src/components/holo/holo.css
git commit -m "feat(training): build orange planning control room"
```

---

### Task 9: Adaptation Preview, Apply Flow, and Cockpit Entry Point

**Files:**
- Create: `pwa/src/components/holo/subs/TrainingAdaptView.jsx`
- Modify: `pwa/src/components/holo/subs/TrainingControlRoom.jsx`
- Modify: `pwa/src/components/holo/subs/trainingControlRoomContract.test.js`
- Modify: `pwa/src/components/holo/HoloCommand.jsx`
- Modify: `pwa/src/components/holo/holoDomains.js`
- Modify: `pwa/src/components/holo/holo.css`

**Interfaces:**
- Consumes: Task 7 APIs and Task 8 room shell.
- Produces: quick move/skip/replace controls, intent proposal, before/after preview, safe apply/reject, and the `training-room` Holo sub-screen.

- [ ] **Step 1: Add failing interaction contract tests**

```javascript
test('cockpit keeps start primary and adds adapt week second', () => {
  const domains = readFileSync(new URL('../holoDomains.js', import.meta.url), 'utf8')
  const start = domains.indexOf('▶ START SESSION')
  const adapt = domains.indexOf('ADAPT WEEK')
  assert.ok(start >= 0 && adapt > start)
  assert.match(domains, /ADAPT WEEK[^\n]*training-room/)
})

test('adapt view previews before apply and blocks hard failures', () => {
  const adapt = readFileSync(new URL('./TrainingAdaptView.jsx', import.meta.url), 'utf8')
  assert.match(adapt, /BEFORE/)
  assert.match(adapt, /AFTER/)
  assert.match(adapt, /interpreted_constraints/)
  assert.match(adapt, /disabled={!proposal\.canApply/)
  assert.match(adapt, /APPLY PLAN/)
})
```

- [ ] **Step 2: Run and observe missing flow failures**

Run: `cd pwa && node --test src/components/holo/subs/trainingControlRoomContract.test.js`

Expected: FAIL because `TrainingAdaptView.jsx` and `ADAPT WEEK` do not exist.

- [ ] **Step 3: Implement quick actions and intent proposal**

```jsx
export default function TrainingAdaptView({ activePlan, onApplied }) {
  const [intent, setIntent] = useState('')
  const [proposal, setProposal] = useState(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  async function propose(payload) {
    setBusy(true); setError('')
    try {
      const raw = await postTrainingPlanProposal(payload)
      setProposal(normalizeTrainingPlan(raw))
    } catch (err) {
      setError(err?.message || 'PHOENIX could not build a valid replan.')
    } finally { setBusy(false) }
  }

  async function apply() {
    if (!proposal?.canApply || busy) return
    setBusy(true)
    try {
      const active = normalizeTrainingPlan(await applyTrainingPlanProposal(proposal.plan_id))
      onApplied(active); setProposal(null); setIntent('')
    } catch (err) {
      setError(err?.message || 'Plan apply failed. The active plan was not changed.')
    } finally { setBusy(false) }
  }

  const hardFailure = proposal?.validations?.some(row => row.severity === 'hard' && !row.passed)

  return (
    <section className="training-adapt-view">
      <div className="training-adapt-actions" role="group" aria-label="Adaptation type">
        {['MOVE', 'SKIP', 'REPLACE'].map(kind => (
          <button key={kind} type="button" onClick={() => setMode(kind)} aria-pressed={mode === kind}>
            {kind}
          </button>
        ))}
      </div>
      <form onSubmit={event => { event.preventDefault(); propose({ intent }) }}>
        <label htmlFor="training-adapt-intent">Tell PHOENIX what changed</label>
        <input id="training-adapt-intent" value={intent} onChange={event => setIntent(event.target.value)} />
        <button type="submit" disabled={!intent.trim() || busy}>PREVIEW REPLAN</button>
      </form>
      {error && <p role="alert">{error}</p>}
      {proposal && (
        <TrainingPlanPreview
          proposal={proposal}
          onReject={async () => { await rejectTrainingPlanProposal(proposal.plan_id); setProposal(null) }}
          onApply={apply}
          applyDisabled={!proposal.canApply || hardFailure || busy}
        />
      )}
    </section>
  )
}
```

Add `mode` state plus typed date and exercise fields below the action group; submitting those controls calls `propose({ constraints: [...] })`, while natural language calls `propose({ intent })`. Implement `TrainingPlanPreview` in the same file with changed-day rows that show date, before session, after session, reason, and validation status. It must also show the interpreted constraints and every validation, expose `REJECT` and `APPLY PLAN` commands, and put focus on its heading when a proposal arrives. Apply remains disabled for hard failures; reject calls the reject endpoint and clears the preview.

- [ ] **Step 4: Add the cockpit entry and room render**

In `holoDomains.js`:

```javascript
heroActions: [
  { label: '▶ START SESSION', sub: 'session', primary: true },
  { label: 'ADAPT WEEK', sub: 'training-room' },
  { label: 'READINESS', sub: 'readiness' },
  { label: 'LOG SLEEP', sub: 'sleep' },
]
```

In `HoloCommand.jsx`:

```jsx
import TrainingControlRoom from './subs/TrainingControlRoom'

{sub === 'training-room' && <TrainingControlRoom {...subProps} />}
```

Do not modify `SessionSub` or `ActiveSession.jsx`.

- [ ] **Step 5: Run PWA contracts and build**

Run: `cd pwa && node --test src/components/holo/subs/trainingControlRoomContract.test.js src/components/holo/subs/trainingPlannerViewModel.test.js src/components/training/trainingUiContract.test.js && npm run build`

Expected: PASS and successful build.

- [ ] **Step 6: Commit**

```bash
git add pwa/src/components/holo/subs/TrainingAdaptView.jsx pwa/src/components/holo/subs/TrainingControlRoom.jsx pwa/src/components/holo/subs/trainingControlRoomContract.test.js pwa/src/components/holo/HoloCommand.jsx pwa/src/components/holo/holoDomains.js pwa/src/components/holo/holo.css
git commit -m "feat(training): preview and apply adaptive weeks"
```

---

### Task 10: Replay Gate, Shadow Rollout, and End-to-End Verification

**Files:**
- Create: `jarvis/domains/training/plan_acceptance.py`
- Create: `jarvis/domains/training/tests/test_plan_acceptance.py`
- Modify: `jarvis/api/routers/training.py`
- Modify: `jarvis/api/tests/test_training_plan_routes.py`
- Modify: `docs/superpowers/specs/2026-07-16-training-adaptive-planner-design.md` only if implementation proves a contract correction is necessary; record the correction explicitly.

**Interfaces:**
- Consumes: persisted plan details and canonical planner inputs.
- Produces: `replay_training_plan(receipt)`, `evaluate_training_shadow(receipts)`, and explicit `PHOENIX_TRAINING_PLANNER_MODE=shadow|live` plus acceptance evidence gating.

- [ ] **Step 1: Write failing replay and promotion tests**

```python
def test_serialized_plan_replays_to_identical_hash(active_plan_fixture):
    replayed = replay_training_plan(json.loads(json.dumps(active_plan_fixture)))
    assert replayed.receipt_hash == active_plan_fixture["receipt_hash"]


def test_live_mode_requires_accepted_current_versions(monkeypatch):
    monkeypatch.setenv("PHOENIX_TRAINING_PLANNER_MODE", "live")
    monkeypatch.delenv("PHOENIX_TRAINING_PLANNER_ACCEPTANCE_JSON", raising=False)
    assert training_planner_acceptance_status()["accepted"] is False


def test_shadow_gate_rejects_hard_rule_violation():
    result = evaluate_training_shadow([shadow_receipt(hard_failure=True)])
    assert result["accepted"] is False
    assert "hard_rule_violations" in result["reasons"]
```

- [ ] **Step 2: Run and observe missing acceptance module failure**

Run: `python -m pytest jarvis/domains/training/tests/test_plan_acceptance.py -q`

Expected: FAIL because `plan_acceptance.py` does not exist.

- [ ] **Step 3: Implement replay and acceptance checks**

`evaluate_training_shadow` must require:

- Deterministic receipt and input hashes.
- Current `adaptive-v1` planner and constitution version `1`.
- No failed hard validations.
- No pain-blocked loaded or explosive exercise.
- Minimum recovery spacing.
- One active or proposed plan per tested cycle.
- No direct execution or session-log side effects.
- At least the move, skip, equipment-limited, fatigue-reduced, calendar-blocked, and pain-blocked fixtures.

`training_planner_acceptance_status` reads `PHOENIX_TRAINING_PLANNER_ACCEPTANCE_JSON` and requires `accepted=true`, matching versions, an evidence ID, and a non-empty fixture summary.

- [ ] **Step 4: Gate live authority in the API**

When mode is `shadow`, proposals persist but cannot supersede the existing schedule; the API marks them `authoritative=false`. When mode is `live`, proposal apply returns 503 unless the acceptance status passes. No mode may write session logs or external calendar actions.

- [ ] **Step 5: Run complete local verification**

Run:

```bash
python -m pytest jarvis/domains/training/tests jarvis/api/tests/test_training_routes.py jarvis/api/tests/test_training_tracker.py jarvis/api/tests/test_training_plan_routes.py jarvis/data/tests/test_database.py -q
cd pwa && npm test -- --run && npm run build
git diff --check
```

Expected: all tests PASS, Vite build exits 0, and diff check is clean.

- [ ] **Step 6: Start local servers and complete browser QA**

Start FastAPI and Vite on unused local ports. Use the in-app browser and verify at desktop and mobile viewports:

1. Training cockpit remains orange and recognizable.
2. `START SESSION` is still primary.
3. `ADAPT WEEK` opens the Control Room.
4. Week, Adapt, History, and Rules render without overlap.
5. “Move today to tomorrow” produces three visible changed-day rows when downstream recovery changes.
6. Apply is disabled for hard pain failures.
7. Applying a valid proposal changes the active version and history atomically.
8. Browser console has no errors.

- [ ] **Step 7: Deploy shadow and collect evidence**

Set `PHOENIX_TRAINING_PLANNER_MODE=shadow`, deploy Railway from the explicit worktree root, and deploy the PWA preview. Generate and replay real shadow plans through the public detail endpoint. Do not set live acceptance until all required fixture and real-data evidence passes.

- [ ] **Step 8: Promote only after evidence passes**

Set explicit acceptance JSON, switch Railway to `live`, redeploy, and verify the public API and PWA show the same active plan ID, version, dates, sessions, validations, and reasons. Confirm again that no session was executed or logged automatically.

- [ ] **Step 9: Commit final gate and verification artifacts**

```bash
git add jarvis/domains/training/plan_acceptance.py jarvis/domains/training/tests/test_plan_acceptance.py jarvis/api/routers/training.py jarvis/api/tests/test_training_plan_routes.py
git commit -m "test(training): gate adaptive planner promotion"
```

---

## Final Completion Checklist

- [ ] All ten task commits exist and contain only scoped Training changes.
- [ ] Backend Training, API, and database suites pass.
- [ ] PWA tests and production build pass.
- [ ] `git diff --check` is clean.
- [ ] A real shadow plan replays to identical input and receipt hashes.
- [ ] Live mode is impossible without explicit version-matched acceptance evidence.
- [ ] Desktop and mobile browser QA passes with no overlap or console errors.
- [ ] The cockpit preserves the orange theme and keeps `START SESSION` primary.
- [ ] `ADAPT WEEK` opens the full-screen Training Control Room.
- [ ] A move request replans the affected week and requires preview approval.
- [ ] Pain flags block affected loaded and explosive work.
- [ ] Plan history explains every version and reason.
- [ ] `ActiveSession.jsx` remains unchanged except for a future separately approved plan.
