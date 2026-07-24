# Phoenix Training Performance Hybrid Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build and ship an autonomous six-session Push/Pull performance hybrid with a movable recovery day, evidence-backed progression, and the approved orange Training Control Room design.

**Architecture:** Add a pure `performance_hybrid` domain module that owns sequence intent, templates, and placement while preserving the existing broad `session_type` safety contract. Extend immutable plan/session evidence with hybrid intent and sequence position, then project those authoritative fields into the existing WEEK, ADAPT, readiness, and active-session workflows.

**Tech Stack:** Python 3.11, FastAPI, Pydantic, SQLite, pytest, React, Vite, Node test runner, CSS, Railway, Vercel.

## Global Constraints

- Constitution version is exactly `2`; planner version is exactly `adaptive-v2`.
- The ordered training cycle is `push_strength`, `pull_strength`, `lower_power`, `push_volume`, `pull_volume`, `jump_elastic`.
- One recovery day is inserted into each seven-day plan and does not consume a sequence position.
- Lower Power and Jump / Elastic require at least 36 hours of separation and target 48 hours.
- Push/Pull sessions target 60-75 minutes and may compress to 40-50 minutes by removing low-priority accessories.
- Phoenix may substitute only inside the same approved movement family and available equipment profile.
- The dunk goal, pain blocks, calendar hard conflicts, readiness gates, deload, peak, and attempt freshness override bodybuilding volume.
- Existing receipts remain readable and immutable; no active plan is silently rewritten.
- Keep `START SESSION` primary and keep the four Control Room tabs: `WEEK`, `ADAPT`, `HISTORY`, `RULES`.
- Preserve the approved dark instrument surface, orange Training identity, compact telemetry, restrained glow, keyboard access, reduced motion, and stable 1440x900 and 390x844 layouts.
- No production fixture sessions, synthetic readiness, or hard-coded UI plan labels.
- Leave `jarvis/domains/finance/portfolio_state.json` untouched and unstaged.

---

## File Structure

- Create `jarvis/domains/training/performance_hybrid.py`: pure session-intent definitions, templates, sequence advancement, recovery placement, compression, and phase transforms.
- Create `jarvis/domains/training/tests/test_performance_hybrid.py`: focused pure-domain tests.
- Modify `jarvis/domains/training/constitution.json`: constitution v2 hybrid policy, movement families, equipment, and templates.
- Modify `jarvis/domains/training/plan_contracts.py`: additive immutable hybrid fields on plan days and planner snapshots.
- Modify `jarvis/domains/training/plan_evidence.py`: derive sequence cursor from authoritative active-plan and completion evidence.
- Modify `jarvis/domains/training/adaptive_planner.py`: generate v2 hybrid baseline days and apply existing safety/constraint/progression pipeline.
- Modify `jarvis/domains/training/progression.py`: calculate actual-result progression for hybrid movement families.
- Modify `jarvis/domains/training/plan_acceptance.py`: v2 replay and promotion constants/fixtures.
- Modify `jarvis/api/routers/training.py`: expose hybrid rules, normalize active sequence state, validate completion linkage.
- Modify `jarvis/data/database.py`: additive session evidence columns and migration.
- Modify `jarvis/api/tests/test_training_plan_routes.py`, `jarvis/api/tests/test_training_tracker.py`, and `jarvis/data/tests/test_database.py`: route, lifecycle, and persistence coverage.
- Modify `pwa/src/components/holo/subs/trainingControlRoomViewModel.js`: normalize authoritative week slots and decision evidence.
- Modify `pwa/src/components/holo/subs/TrainingWeekView.jsx`: approved sequence rail, mission, and Phoenix Decision panel.
- Modify `pwa/src/components/holo/subs/trainingSessionModel.js` and `TrainingSubs.jsx`: preserve hybrid sequence evidence through actual completion.
- Modify `pwa/src/components/holo/trainingLive.js`: show backend hybrid identity and position on the main Training screen.
- Modify `pwa/src/components/holo/holo.css`: approved responsive orange layout.
- Modify focused Training frontend tests: model, contract, live, and integration coverage.

---

### Task 1: Immutable Hybrid Contracts

**Files:**
- Modify: `jarvis/domains/training/plan_contracts.py`
- Test: `jarvis/domains/training/tests/test_plan_contracts.py`

**Interfaces:**
- Produces: `PlanDay.session_intent`, `PlanDay.sequence_position`, `PlanDay.sequence_length`, `PlanDay.decision_reasons`, and `PlanDay.high_neural`.
- Produces: `PlannerInputSnapshot.sequence_cursor` and `PlannerInputSnapshot.sequence_source_plan_id`.
- Preserves: decoding legacy mappings where every new field is absent.

- [ ] **Step 1: Write failing round-trip and legacy tests**

```python
def test_hybrid_plan_day_round_trips_sequence_evidence():
    day = PlanDay(
        date=date(2026, 7, 27),
        session_type="general",
        objective="push_strength",
        exercises=(),
        estimated_minutes=65,
        session_intent="push_strength",
        sequence_position=1,
        sequence_length=6,
        decision_reasons=("sequence_resumed",),
        high_neural=False,
    )
    restored = WeeklyPlanReceipt.from_mapping(receipt_with(day).to_mapping())
    assert restored.days[0].session_intent == "push_strength"
    assert restored.days[0].decision_reasons == ("sequence_resumed",)


def test_legacy_plan_day_defaults_hybrid_fields_to_unset():
    restored = WeeklyPlanReceipt.from_mapping(legacy_v1_receipt_mapping())
    assert restored.days[0].session_intent is None
    assert restored.days[0].sequence_position is None
```

- [ ] **Step 2: Run the focused tests and confirm RED**

Run: `python -m pytest jarvis/domains/training/tests/test_plan_contracts.py -q`

Expected: FAIL because the additive hybrid fields do not exist.

- [ ] **Step 3: Implement strict additive fields**

```python
@dataclass(frozen=True)
class PlanDay:
    date: date
    session_type: str
    objective: str
    exercises: tuple[Mapping[str, Any], ...]
    estimated_minutes: int
    change_reason: str | None = None
    session_intent: str | None = None
    sequence_position: int | None = None
    sequence_length: int | None = None
    decision_reasons: tuple[str, ...] = ()
    high_neural: bool = False

    def __post_init__(self):
        object.__setattr__(self, "exercises", tuple(_freeze(item) for item in self.exercises))
        object.__setattr__(self, "decision_reasons", tuple(self.decision_reasons))
        if self.sequence_position is not None and self.sequence_position not in range(1, 7):
            raise ValueError("Hybrid sequence position must be between 1 and 6")
```

Add `sequence_cursor: int = 1` and `sequence_source_plan_id: str | None = None` to `PlannerInputSnapshot`, include both in `to_mapping`, and default both during `from_mapping`.

- [ ] **Step 4: Run the focused tests and confirm GREEN**

Run: `python -m pytest jarvis/domains/training/tests/test_plan_contracts.py -q`

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add jarvis/domains/training/plan_contracts.py jarvis/domains/training/tests/test_plan_contracts.py
git commit -m "feat(training): add hybrid plan evidence contracts"
```

---

### Task 2: Pure Performance Hybrid Sequence

**Files:**
- Create: `jarvis/domains/training/performance_hybrid.py`
- Create: `jarvis/domains/training/tests/test_performance_hybrid.py`
- Modify: `jarvis/domains/training/constitution.json`

**Interfaces:**
- Produces: `HYBRID_SEQUENCE: tuple[str, ...]`.
- Produces: `build_hybrid_week(constitution, snapshot) -> tuple[PlanDay, ...]`.
- Consumes: Task 1 `PlanDay` and `PlannerInputSnapshot`.

- [ ] **Step 1: Write failing sequence and template tests**

```python
def test_builds_six_ordered_intents_plus_one_recovery(training_constitution_v2):
    days = build_hybrid_week(training_constitution_v2, snapshot(sequence_cursor=1))
    intents = [day.session_intent for day in days if day.session_intent]
    assert intents == list(HYBRID_SEQUENCE)
    assert sum(day.session_type == "recovery" for day in days) == 1


def test_push_strength_uses_approved_template_and_duration(training_constitution_v2):
    day = next(day for day in build_hybrid_week(training_constitution_v2, snapshot()) if day.session_intent == "push_strength")
    assert [item["movement_family"] for item in day.exercises] == [
        "horizontal_push", "vertical_push", "lateral_delt", "triceps"
    ]
    assert 60 <= day.estimated_minutes <= 75
```

- [ ] **Step 2: Run the new test file and confirm RED**

Run: `python -m pytest jarvis/domains/training/tests/test_performance_hybrid.py -q`

Expected: collection FAIL because `performance_hybrid` does not exist.

- [ ] **Step 3: Add constitution v2 policy**

Set:

```json
{
  "version": "2",
  "adaptive_planner": {
    "version": "adaptive-v2",
    "program": "performance_hybrid",
    "hybrid_sequence": [
      "push_strength",
      "pull_strength",
      "lower_power",
      "push_volume",
      "pull_volume",
      "jump_elastic"
    ],
    "preferred_lower_spacing_hours": 48
  }
}
```

Define these exact ordered template families:

```json
{
  "push_strength": ["horizontal_push", "vertical_push", "lateral_delt", "triceps"],
  "pull_strength": ["vertical_pull", "horizontal_pull", "rear_delt", "biceps"],
  "lower_power": ["knee_isometric", "explosive", "knee_extension", "posterior_chain", "lower_leg"],
  "push_volume": ["incline_push", "vertical_push", "chest_isolation", "lateral_delt", "triceps"],
  "pull_volume": ["supported_horizontal_pull", "vertical_pull", "rear_delt", "upper_back", "biceps"],
  "jump_elastic": ["dynamic_warmup", "sprint_mechanics", "progressive_jump", "approach_jump"]
}
```

Map each family to an ordered approved exercise list. The first compatible exercise is the default:

```json
{
  "horizontal_push": ["bench_press", "dumbbell_bench_press"],
  "incline_push": ["incline_dumbbell_press", "incline_bench_press"],
  "vertical_push": ["overhead_press", "seated_dumbbell_press"],
  "horizontal_pull": ["barbell_row", "one_arm_dumbbell_row"],
  "supported_horizontal_pull": ["chest_supported_dumbbell_row", "cable_row"],
  "vertical_pull": ["weighted_pullup", "lat_pulldown"],
  "rear_delt": ["face_pull", "rear_delt_fly"],
  "upper_back": ["face_pull", "cable_row"],
  "biceps": ["bicep_curl", "hammer_curl"],
  "triceps": ["tricep_pushdown", "overhead_tricep_extension"]
}
```

Primary compounds use priority `primary`; preparation uses `required`; isolation and arm work use `accessory`; the final isolation block uses `optional`. Add every named exercise to `exercise_equipment`.

- [ ] **Step 4: Implement deterministic baseline generation**

```python
HYBRID_SEQUENCE = (
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


def build_hybrid_week(constitution, snapshot):
    intents = rotate_sequence(HYBRID_SEQUENCE, snapshot.sequence_cursor)
    dated = place_recovery(intents, snapshot.week_start, snapshot.calendar_events)
    return tuple(build_plan_day(constitution, item, index) for index, item in enumerate(dated))
```

Ensure ordering is deterministic, recovery has no sequence position, and all exercise dictionaries include `name`, `movement_family`, `priority`, `sets`, `reps`, and equipment-derived provenance.

- [ ] **Step 5: Run the new tests and confirm GREEN**

Run: `python -m pytest jarvis/domains/training/tests/test_performance_hybrid.py -q`

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add jarvis/domains/training/performance_hybrid.py jarvis/domains/training/tests/test_performance_hybrid.py jarvis/domains/training/constitution.json
git commit -m "feat(training): define performance hybrid sequence"
```

---

### Task 3: Recovery Placement, Compression, And Phase Rules

**Files:**
- Modify: `jarvis/domains/training/performance_hybrid.py`
- Modify: `jarvis/domains/training/tests/test_performance_hybrid.py`

**Interfaces:**
- Produces: `place_recovery(...)`, `compress_session(day, minutes)`, and `apply_phase_rules(days, phase, week)`.
- Preserves: six-session ordering even when recovery moves.

- [ ] **Step 1: Write failing behavior tests**

```python
def test_recovery_targets_48_hours_between_lower_and_jump(training_constitution_v2):
    days = build_hybrid_week(training_constitution_v2, snapshot(sequence_cursor=3))
    lower = next(day for day in days if day.session_intent == "lower_power")
    jump = next(day for day in days if day.session_intent == "jump_elastic")
    assert (jump.date - lower.date).days >= 2


def test_40_minute_compression_removes_accessories_not_primary_work(plan_day):
    compressed = compress_session(plan_day, 40)
    assert compressed.estimated_minutes == 40
    assert any(item["priority"] == "primary" for item in compressed.exercises)
    assert len(compressed.exercises) < len(plan_day.exercises)
    assert "time_compressed" in compressed.decision_reasons


def test_peak_removes_loaded_lower_and_keeps_upper_maintenance(training_constitution_v2):
    days = apply_phase_rules(baseline_days(), phase="peak", week=1)
    assert not any(day.session_intent == "lower_power" for day in days)
    assert all(day.estimated_minutes <= 45 for day in days if day.session_type == "general")
```

- [ ] **Step 2: Run and confirm RED**

Run: `python -m pytest jarvis/domains/training/tests/test_performance_hybrid.py -q`

Expected: FAIL on spacing, compression, and phase behavior.

- [ ] **Step 3: Implement ranked recovery placement**

Use this deterministic ranking:

```python
def recovery_score(candidate, dated_intents, calendar_events, readiness):
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
```

Select with `max(candidates, key=lambda day: (*recovery_score(day, ...), -day.toordinal()))`, so the earlier date wins an otherwise exact tie. Hard-conflict dates are recovery-only candidates and outrank preferences. Mark one of `recovery_placed:calendar`, `recovery_placed:lower_spacing`, `recovery_placed:fatigue`, or `recovery_placed:default`.

- [ ] **Step 4: Implement priority compression and phase transforms**

Compression uses:

```python
REMOVAL_ORDER = ("optional", "accessory")

def compress_session(day, minutes):
    exercises = list(day.exercises)
    for priority in REMOVAL_ORDER:
        while estimate_minutes(exercises) > minutes:
            index = last_index(exercises, lambda item: item["priority"] == priority)
            if index is None:
                break
            exercises.pop(index)
    return replace(
        day,
        exercises=tuple(exercises),
        estimated_minutes=max(40, min(minutes, estimate_minutes(exercises))),
        decision_reasons=(*day.decision_reasons, "time_compressed"),
    )
```

For `peak`, remove `lower_power`, cap general sessions at 45 minutes, and keep `jump_elastic` without extra max-effort volume. For `attempt`, remove `lower_power`, cap general sessions at 30 minutes, and keep only required jump preparation plus the scheduled attempt exposure.

- [ ] **Step 5: Run and confirm GREEN**

Run: `python -m pytest jarvis/domains/training/tests/test_performance_hybrid.py -q`

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add jarvis/domains/training/performance_hybrid.py jarvis/domains/training/tests/test_performance_hybrid.py
git commit -m "feat(training): adapt hybrid recovery and phase load"
```

---

### Task 4: Planner Integration And Actual-Result Progression

**Files:**
- Modify: `jarvis/domains/training/adaptive_planner.py`
- Modify: `jarvis/domains/training/progression.py`
- Modify: `jarvis/domains/training/plan_evidence.py`
- Modify: `jarvis/domains/training/tests/test_adaptive_planner.py`
- Modify: `jarvis/domains/training/tests/test_plan_evidence.py`

**Interfaces:**
- Consumes: `build_hybrid_week`.
- Produces: `adaptive-v2` receipts with complete hybrid metadata.
- Produces: sequence cursor derived from authoritative completion evidence.

- [ ] **Step 1: Write failing planner tests**

```python
def test_v2_receipt_uses_hybrid_baseline_and_version(training_constitution_v2):
    receipt = generate_weekly_plan(training_constitution_v2, planning_snapshot())
    assert receipt.planner_version == "adaptive-v2"
    assert receipt.constitution_version == "2"
    assert [day.sequence_position for day in receipt.days if day.session_intent] == [1, 2, 3, 4, 5, 6]


def test_completed_position_advances_next_sequence_without_doubling(training_constitution_v2):
    snapshot = build_planning_snapshot(
        sessions=[completed_hybrid_session(position=2, intent="pull_strength")],
        active_plan=active_hybrid_plan(),
    )
    receipt = generate_weekly_plan(training_constitution_v2, snapshot)
    first = next(day for day in receipt.days if day.session_intent)
    assert first.sequence_position == 3
    assert first.session_intent == "lower_power"
```

- [ ] **Step 2: Run and confirm RED**

Run: `python -m pytest jarvis/domains/training/tests/test_adaptive_planner.py jarvis/domains/training/tests/test_plan_evidence.py -q`

Expected: FAIL because the planner still builds legacy weekday sessions and snapshots lack a cursor.

- [ ] **Step 3: Branch baseline generation by constitution version**

```python
def _baseline_days(constitution, snapshot):
    if (
        str(constitution.get("version")) == "2"
        and constitution.get("adaptive_planner", {}).get("program") == "performance_hybrid"
    ):
        return build_hybrid_week(constitution, snapshot)
    return _legacy_plan_days(constitution, snapshot)
```

Set receipt planner version from the constitution policy rather than an unrelated hard-coded constant. Keep legacy decoding paths unchanged.

- [ ] **Step 4: Derive cursor and progression from trusted evidence**

`build_planning_snapshot` accepts `active_plan`. It validates completed session `plan_id`, planned date, `session_intent`, and `sequence_position` against that receipt before advancing. Unlinked or malformed history does not move the cursor.

Progression uses actual reps/load, target reps, RPE, and pain evidence:

```python
if pain_flags:
    return {"action": "hold", "reason": "pain_evidence"}
if completed_all_targets and rpe <= 8:
    return {"action": "increase", "load_delta_kg": smallest_increment}
if rpe >= 9 or missed_reps:
    return {"action": "hold_or_reduce", "load_delta_kg": 0}
```

- [ ] **Step 5: Run focused planner evidence tests**

Run: `python -m pytest jarvis/domains/training/tests/test_adaptive_planner.py jarvis/domains/training/tests/test_plan_evidence.py -q`

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add jarvis/domains/training/adaptive_planner.py jarvis/domains/training/progression.py jarvis/domains/training/plan_evidence.py jarvis/domains/training/tests/test_adaptive_planner.py jarvis/domains/training/tests/test_plan_evidence.py
git commit -m "feat(training): generate hybrid plans from actual evidence"
```

---

### Task 5: Persist And Validate Sequence Completion

**Files:**
- Modify: `jarvis/data/database.py`
- Modify: `jarvis/api/routers/training.py`
- Modify: `jarvis/data/tests/test_database.py`
- Modify: `jarvis/api/tests/test_training_tracker.py`

**Interfaces:**
- Extends `SessionLogRequest` with `session_intent: str | None`, `sequence_position: int | None`, and `sequence_length: int | None`.
- Validates hybrid fields against the referenced active plan day before writing.

- [ ] **Step 1: Write failing migration and API lifecycle tests**

```python
def test_hybrid_completion_persists_sequence_evidence(client, active_hybrid_plan):
    response = client.post("/training/session", json=hybrid_completion(position=3))
    assert response.status_code == 200
    row = client.get("/training/history").json()["sessions"][0]
    assert row["session_intent"] == "lower_power"
    assert row["sequence_position"] == 3


def test_completion_rejects_sequence_position_not_matching_plan(client, active_hybrid_plan):
    response = client.post("/training/session", json=hybrid_completion(position=5))
    assert response.status_code == 409
```

- [ ] **Step 2: Run and confirm RED**

Run: `python -m pytest jarvis/data/tests/test_database.py jarvis/api/tests/test_training_tracker.py -q`

Expected: FAIL because storage and request models omit hybrid sequence evidence.

- [ ] **Step 3: Add idempotent columns and typed request fields**

Add nullable columns through the existing migration helper:

```python
{
    "session_intent": "TEXT",
    "sequence_position": "INTEGER",
    "sequence_length": "INTEGER",
}
```

Extend `SessionLogRequest` with:

```python
session_intent: str | None = None
sequence_position: int | None = Field(default=None, ge=1, le=6)
sequence_length: int | None = Field(default=None, ge=6, le=6)
```

Include all three fields in the existing insert parameter list, row mapping, and `/training/history` serialization.

- [ ] **Step 4: Validate against authoritative plan day**

Before insert, load the referenced plan receipt and locate `planned_date`. Require exact intent and sequence values for v2 plan-driven sessions; keep legacy sessions nullable. Return `409` on mismatches and preserve current idempotency behavior.

- [ ] **Step 5: Run and confirm GREEN**

Run: `python -m pytest jarvis/data/tests/test_database.py jarvis/api/tests/test_training_tracker.py -q`

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add jarvis/data/database.py jarvis/api/routers/training.py jarvis/data/tests/test_database.py jarvis/api/tests/test_training_tracker.py
git commit -m "feat(training): persist hybrid sequence completion"
```

---

### Task 6: Replay Authority And Public Rules

**Files:**
- Modify: `jarvis/domains/training/plan_acceptance.py`
- Modify: `jarvis/domains/training/tests/test_plan_acceptance.py`
- Modify: `jarvis/api/routers/training.py`
- Modify: `jarvis/api/tests/test_training_plan_routes.py`

**Interfaces:**
- Sets current promotion versions to constitution `2` and planner `adaptive-v2`.
- Adds behavior-inferred fixtures for hybrid sequence, movable recovery, compression, phase behavior, equipment, pain, calendar, and completion advancement.
- Exposes public hybrid policy without private acceptance evidence.

- [ ] **Step 1: Write failing acceptance and rules tests**

```python
def test_acceptance_requires_all_hybrid_behavior_categories(training_constitution_v2):
    evidence = evaluate_shadow_receipts(incomplete_hybrid_fixture_receipts())
    assert evidence.accepted is False
    assert "hybrid_recovery" in evidence.missing_categories


def test_public_rules_expose_program_without_private_receipts(client):
    planner = client.get("/training/plan/rules").json()["planner"]
    assert planner["version"] == "adaptive-v2"
    assert planner["program"] == "performance_hybrid"
    assert planner["hybrid_sequence"][-1] == "jump_elastic"
    assert "acceptance_bundle" not in planner


def test_v2_autonomous_proposal_does_not_require_user_constraints(client):
    response = client.post("/training/plan/proposals", json={"constraints": []})
    assert response.status_code == 200
    assert response.json()["planner_version"] == "adaptive-v2"
```

- [ ] **Step 2: Run and confirm RED**

Run: `python -m pytest jarvis/domains/training/tests/test_plan_acceptance.py jarvis/api/tests/test_training_plan_routes.py -q`

Expected: FAIL on old version constants and missing hybrid fixture inference.

- [ ] **Step 3: Implement v2 replay categories and public policy**

Infer exactly these v2 categories from typed input/output behavior:

```python
HYBRID_REQUIRED_CATEGORIES = frozenset({
    "sequence",
    "recovery_placement",
    "time_compression",
    "equipment_substitution",
    "fatigue_deload",
    "calendar_conflict",
    "pain_block",
    "phase_peak",
    "missed_session",
    "completion_advance",
})
```

Never consume caller fixture labels. Keep bounded evidence decoding, exact allowlisting, and side-effect proofs unchanged. Public rules include only sequence, minimum/preferred spacing, duration ranges, movement families, phase behavior, and safety flags.

Change `TrainingPlanProposalRequest.constraints` from a minimum length of one to a default empty list. An empty v2 request means “Phoenix generates the next evidence-backed weekly proposal”; it does not bypass calendar, readiness, safety, replay, or apply gates. Replace the legacy route assertion that empty constraints return `422` with the autonomous v2 proposal test above.

- [ ] **Step 4: Run and confirm GREEN**

Run: `python -m pytest jarvis/domains/training/tests/test_plan_acceptance.py jarvis/api/tests/test_training_plan_routes.py -q`

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add jarvis/domains/training/plan_acceptance.py jarvis/domains/training/tests/test_plan_acceptance.py jarvis/api/routers/training.py jarvis/api/tests/test_training_plan_routes.py
git commit -m "feat(training): gate hybrid planner authority"
```

---

### Task 7: Authoritative Hybrid Week View

**Files:**
- Modify: `pwa/src/components/holo/subs/trainingControlRoomViewModel.js`
- Modify: `pwa/src/components/holo/subs/TrainingWeekView.jsx`
- Modify: `pwa/src/components/holo/subs/trainingControlRoomContract.test.js`
- Create: `pwa/src/components/holo/subs/trainingHybridWeekViewModel.test.js`
- Create: `pwa/src/components/holo/subs/trainingHybridWeekViewModel.js`

**Interfaces:**
- Produces: `buildHybridWeekPresentation(plan, todayIso)` with seven slots, active mission, and decision rows.
- Consumes only receipt fields; it never derives session identity from dates or position.

- [ ] **Step 1: Write failing presentation tests**

```javascript
test('builds seven dated slots with six intents and movable recovery', () => {
  const model = buildHybridWeekPresentation(activeHybridPlan, '2026-07-29')
  assert.equal(model.slots.length, 7)
  assert.equal(model.slots.filter(slot => slot.sequencePosition !== null).length, 6)
  assert.equal(model.today.intent, 'lower_power')
})

test('withholds Phoenix reasoning when backend evidence is malformed', () => {
  const model = buildHybridWeekPresentation(planWithObjectDecisionReason, '2026-07-29')
  assert.deepEqual(model.decisions, [])
})
```

- [ ] **Step 2: Run and confirm RED**

Run: `node --test src/components/holo/subs/trainingHybridWeekViewModel.test.js`

Expected: collection FAIL because the model does not exist.

- [ ] **Step 3: Implement fail-closed presentation normalization**

Return this stable shape:

```javascript
{
  slots: [{
    date: '2026-07-27',
    lifecycle: 'complete|today|queued|recovery|empty',
    intent: 'push_strength|null',
    label: 'PUSH A|null',
    durationMinutes: 65,
    sequencePosition: 1,
    sequenceLength: 6,
    highNeural: false,
    exercises: [],
    decisionReasons: [],
  }],
  today: slotOrNull,
  decisions: [{ code: 'recovery_placed:lower_spacing', label: 'LOWER-BODY SPACING' }],
}
```

Only map the six exact intent values to display labels. Unknown or missing values produce `label: null`; non-string reasons are discarded.

- [ ] **Step 4: Rebuild WEEK from the approved hierarchy**

Render this hierarchy:

1. existing plan metadata;
2. `ACTIVE SEQUENCE` seven-slot rail;
3. `TODAY'S MISSION` exercise list;
4. `PHOENIX DECISION` evidence panel;
5. existing validation summary.

Keep loading, error, empty, legacy-plan, keyboard, and semantic heading behavior.

- [ ] **Step 5: Run focused frontend tests**

Run: `node --test src/components/holo/subs/trainingHybridWeekViewModel.test.js src/components/holo/subs/trainingControlRoomContract.test.js`

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add pwa/src/components/holo/subs/trainingHybridWeekViewModel.js pwa/src/components/holo/subs/trainingHybridWeekViewModel.test.js pwa/src/components/holo/subs/trainingControlRoomViewModel.js pwa/src/components/holo/subs/TrainingWeekView.jsx pwa/src/components/holo/subs/trainingControlRoomContract.test.js
git commit -m "feat(training): present authoritative hybrid week"
```

---

### Task 8: Main Screen, Active Session, And Orange Visual Contract

**Files:**
- Modify: `pwa/src/components/holo/trainingLive.js`
- Modify: `pwa/src/components/holo/trainingLive.test.js`
- Modify: `pwa/src/components/holo/subs/trainingSessionModel.js`
- Modify: `pwa/src/components/holo/subs/trainingSessionModel.test.js`
- Modify: `pwa/src/components/holo/subs/TrainingSubs.jsx`
- Modify: `pwa/src/components/holo/trainingLiveIntegration.test.js`
- Modify: `pwa/src/components/holo/holo.css`
- Modify: `pwa/src/components/holo/subs/trainingControlRoomContract.test.js`

**Interfaces:**
- Main screen displays authoritative intent and `sequence_position / sequence_length`.
- Completion payload forwards exact hybrid evidence already verified in the routed plan.

- [ ] **Step 1: Write failing live/session/visual contract tests**

```javascript
test('main Training mission uses backend hybrid identity and position', () => {
  const model = buildTrainingLiveModel(statusWithHybridLowerPower)
  assert.equal(model.heroTitle, 'LOWER POWER')
  assert.match(model.heroBrief, /SEQUENCE 03 OF 06/)
})

test('completion forwards plan-linked hybrid evidence', () => {
  const payload = buildCompletionPayload({ plan, exercises, setResults, rpe: 8, pain })
  assert.equal(payload.session_intent, 'lower_power')
  assert.equal(payload.sequence_position, 3)
})
```

Add source-contract assertions for the orange sequence rail, Phoenix Decision panel, stable desktop seven-column grid, mobile two-column or snap geometry, focus-visible styles, and reduced-motion override.

- [ ] **Step 2: Run and confirm RED**

Run:

```bash
node --test src/components/holo/trainingLive.test.js src/components/holo/subs/trainingSessionModel.test.js src/components/holo/trainingLiveIntegration.test.js src/components/holo/subs/trainingControlRoomContract.test.js
```

Expected: FAIL on missing hybrid identity, completion fields, and visual selectors.

- [ ] **Step 3: Wire authoritative hybrid fields**

Use `session.session_intent`, `sequence_position`, and `sequence_length` directly. Missing values render legacy-neutral copy. Do not infer Push/Pull identity from exercises.

- [ ] **Step 4: Implement the approved orange layout**

Use existing Training CSS variables. Desktop uses seven stable tracks. Mobile uses two stable columns or horizontal snap based on the current Control Room breakpoint. Preserve compact type, restrained glow, no nested decorative cards, no text overlap, and reduced-motion behavior.

Add exact selectors:

```css
.training-hybrid-sequence { display:grid; grid-template-columns:repeat(7,minmax(0,1fr)); }
.training-hybrid-slot { min-width:0; min-height:126px; }
.training-hybrid-slot.current { border-color:var(--training-accent); }
.training-hybrid-detail { display:grid; grid-template-columns:minmax(0,1.65fr) minmax(260px,.75fr); }
@media (max-width: 760px) {
  .training-hybrid-sequence { grid-template-columns:repeat(2,minmax(0,1fr)); }
  .training-hybrid-detail { grid-template-columns:1fr; }
}
@media (prefers-reduced-motion: reduce) {
  .training-hybrid-slot { animation:none; transition:none; }
}
```

- [ ] **Step 5: Run focused tests and production build**

Run:

```bash
node --test src/components/holo/trainingLive.test.js src/components/holo/subs/trainingSessionModel.test.js src/components/holo/trainingLiveIntegration.test.js src/components/holo/subs/trainingControlRoomContract.test.js
npm run build
```

Expected: all focused tests PASS and Vite exits 0.

- [ ] **Step 6: Commit**

```bash
git add pwa/src/components/holo/trainingLive.js pwa/src/components/holo/trainingLive.test.js pwa/src/components/holo/subs/trainingSessionModel.js pwa/src/components/holo/subs/trainingSessionModel.test.js pwa/src/components/holo/subs/TrainingSubs.jsx pwa/src/components/holo/trainingLiveIntegration.test.js pwa/src/components/holo/holo.css pwa/src/components/holo/subs/trainingControlRoomContract.test.js
git commit -m "feat(training): ship hybrid session experience"
```

---

### Task 9: End-To-End Verification, Visual QA, And Shadow Release

**Files:**
- Modify: `jarvis/api/tests/test_training_tracker.py`
- Modify: `.superpowers/sdd/task-10-report.md`

**Interfaces:**
- Verifies: proposal -> active hybrid plan -> readiness -> routed session -> actual completion -> next sequence proposal.
- Deploys: planner in `shadow`, never directly to `live`.

- [ ] **Step 1: Add the full lifecycle regression**

```python
def test_hybrid_integrity_loop_advances_from_actual_completion(client):
    active = activate_hybrid_plan(client, sequence_cursor=1)
    complete_readiness(client, planned_date=active["days"][0]["date"])
    routed = client.get("/training/routed-session").json()
    assert routed["planned_session"]["session_intent"] == "push_strength"
    complete_with_actual_deviation(client, routed, reps=7, weight_kg=57.5, rpe=8)
    proposal = client.post("/training/plan/proposals", json={"constraints": []}).json()
    first_training_day = next(day for day in proposal["days"] if day["session_intent"])
    assert first_training_day["sequence_position"] == 2
    assert first_training_day["session_intent"] == "pull_strength"
```

- [ ] **Step 2: Run all Training verification**

Run:

```bash
python -m pytest jarvis/domains/training/tests jarvis/api/tests/test_training_plan_routes.py jarvis/api/tests/test_training_tracker.py jarvis/data/tests/test_database.py -q
node --test src/components/training/trainingViewModel.test.js src/components/training/trainingUiContract.test.js src/components/holo/trainingLiveIntegration.test.js src/components/holo/trainingLive.test.js src/components/holo/subs/trainingSessionModel.test.js src/components/holo/subs/trainingPlannerViewModel.test.js src/components/holo/subs/trainingControlRoomContract.test.js src/components/holo/subs/trainingAdaptViewModel.test.js src/components/holo/subs/trainingHybridWeekViewModel.test.js
npm run build
git diff --check
```

Expected: all Training tests PASS, build exits 0, and diff check exits 0. Record any unrelated baseline failure without changing its files.

- [ ] **Step 3: Run browser visual QA**

At 1440x900 and 390x844 inspect:

- main Training mission;
- WEEK sequence rail;
- Phoenix Decision panel;
- ADAPT before/after;
- readiness;
- active session;
- completion check.

Verify no overlap, clipping, blank panels, hidden actions, unstable dimensions, or non-orange Training identity. Verify keyboard focus and reduced motion.

- [ ] **Step 4: Deploy clean snapshots in shadow**

Keep `PHOENIX_TRAINING_PLANNER_MODE=shadow`. Deploy a clean committed backend snapshot to Railway and a matching PWA snapshot to Vercel. Confirm:

```bash
curl -fsS https://phoenix-production-1fb2.up.railway.app/health
curl -fsS https://phoenix-production-1fb2.up.railway.app/training/status
curl -fsS https://pwa-ochre-theta.vercel.app/
```

Expected: backend health `ok`, truthful Training state, and production HTML with the new generated bundle.

- [ ] **Step 5: Collect real shadow evidence**

Reconnect the read-only calendar if still expired. Generate a real hybrid proposal, replay it, confirm no side effects, complete one real session, and verify the next snapshot advances the sequence from persisted evidence.

- [ ] **Step 6: Update the release report and commit**

Record exact test counts, visual viewport evidence, deployment IDs, shadow mode, calendar authority, and any remaining promotion blocker in `.superpowers/sdd/task-10-report.md`.

```bash
git add jarvis/api/tests/test_training_tracker.py .superpowers/sdd/task-10-report.md
git commit -m "test(training): verify hybrid integrity loop"
```

- [ ] **Step 7: Request final review before live promotion**

Do not change the planner to `live` until the implementation, specification, visual quality, replay evidence, and real completion evidence have passed independent review.
