# Phoenix Training Joint Capacity Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Integrate a deterministic readiness scan, joint-capacity routing, pain-aware substitutions, Jump Balance, and Recovery Reset into the existing Long Conjugate Training flow.

**Architecture:** A pure `joint_capacity` domain service classifies readiness and routes existing planned sessions. Additive SQLite helpers persist explicit scans and logs; additive Training API endpoints expose the result; existing Training screens render those backend contracts using the premium cockpit design language.

**Tech Stack:** Python 3, dataclasses/enums, FastAPI/Pydantic, SQLite, pytest, React 18, Vite, Node test runner.

## Global Constraints

- Extend Long Conjugate; do not create a separate rehab system.
- Core routing is deterministic and AI-independent.
- No medical claims, diagnosis, treatment, guaranteed healing, guaranteed dunk progress, “bulletproof” language, or extreme depth-jump programming.
- No Finance, Nutrition, Calendar, or Home behavior changes.
- No broker, trading, Plaan, Google-write, or unrelated state mutation.
- Do not commit runtime databases, portfolio state, service workers, or Finance diff artifacts.
- Use the existing shared clock boundary for date-sensitive behavior.

---

## File map

- Create `jarvis/domains/training/joint_capacity.py`: pure readiness classification, capacity library, and session routing.
- Modify `jarvis/domains/training/data_contracts.py`: typed readiness and routing structures.
- Create `jarvis/domains/training/tests/test_joint_capacity.py`: threshold, flag, library, gating, reset, and copy contracts.
- Modify `jarvis/data/database.py`: three additive tables and explicit persistence helpers.
- Modify `jarvis/data/tests/test_database.py`: migration and persistence tests.
- Modify `jarvis/api/routers/training.py`: request models and additive endpoints.
- Modify `jarvis/api/tests/test_training_routes.py`: API validation and deterministic response tests.
- Modify `pwa/src/api/client.js`: read/write client functions for new Training endpoints.
- Create `pwa/src/components/training/trainingViewModel.js`: pure display helpers and safe fallbacks.
- Create `pwa/src/components/training/trainingViewModel.test.js`: frontend routing/display contract tests.
- Modify `pwa/src/components/training/TrainingMetrics.jsx`: readiness and routed cockpit.
- Modify `pwa/src/components/training/ActiveSession.jsx`: gate and render routed exercises.
- Modify `pwa/src/components/training/JumpLog.jsx`: four-plant and quality logging.

### Task 1: Pure readiness classification and typed contracts

**Interfaces:**
- Produces `BodyAreaDiscomfort`, `ReadinessStatus`, `ReadinessScan`, `CapacityBlockRecommendation`, `SessionRoutingResult`.
- Produces `classify_readiness(scan: ReadinessScan | None) -> ReadinessStatus`.

- [ ] Write failing tests in `test_joint_capacity.py` for no scan, score boundaries 2/3/4/5/6/7, and sharp-pain/limping/worsening overrides.
- [ ] Run `python -m pytest jarvis/domains/training/tests/test_joint_capacity.py -q` and confirm import/behavior failures.
- [ ] Add enum/dataclass contracts and the minimal classifier.
- [ ] Re-run the focused test and confirm all classification cases pass.
- [ ] Refactor validation so every score is numeric and within 0–10 while preserving green tests.

Expected classifier shape:

```python
def classify_readiness(scan: ReadinessScan | None) -> ReadinessStatus:
    if scan is None:
        return ReadinessStatus.UNCHECKED
    if scan.sharp_pain or scan.limping or scan.next_day_worsening:
        return ReadinessStatus.RECOVERY_ONLY
    peak = max(scan.discomfort.values())
    if peak >= 7:
        return ReadinessStatus.RECOVERY_ONLY
    if peak >= 5:
        return ReadinessStatus.REGRESS
    if peak >= 3:
        return ReadinessStatus.CAUTION
    return ReadinessStatus.CLEAR
```

### Task 2: Capacity library and session router

**Interfaces:**
- Consumes `ReadinessScan`, `ReadinessStatus`, and serialized existing session dictionaries.
- Produces `route_session(session: dict, scan: ReadinessScan | None, *, explicit_reset: bool = False) -> SessionRoutingResult`.

- [ ] Add failing tests for Sled Balance alternatives, all six Squat Balance zones, Pelvic Control options, four Jump Balance plants, ten-rep cap, body-area substitutions, reset visibility, and high-neural unchecked gating.
- [ ] Add a forbidden-copy test scanning all emitted labels/cues for `bulletproof`, `heal your`, `safe for everyone`, `push through pain`, and `guaranteed`.
- [ ] Run the domain test and confirm failures describe missing routing/library behavior.
- [ ] Implement immutable capacity definitions and minimal routing rules.
- [ ] Re-run focused tests and existing `jarvis/domains/training/tests`.
- [ ] Refactor duplicate exercise records into small builders without changing output.

Required routing outputs include:

```python
{
    "readiness_status": "caution",
    "readiness_required": False,
    "planned_session": session,
    "capacity_blocks": [...],
    "substitutions": [{"area": "knee", "reason": "...", "action": "..."}],
    "show_jump_balance": False,
    "show_recovery_reset": False,
    "safety_note": "This is performance guidance, not a diagnosis.",
}
```

### Task 3: SQLite persistence

**Interfaces:**
- Produces `save_training_readiness_scan(payload: dict) -> int`, `get_latest_training_readiness_scan(on_date: str | None = None) -> dict | None`, `list_training_readiness_scans(limit: int = 50) -> list[dict]`.
- Produces corresponding save/list helpers for capacity and jump-balance logs.

- [ ] Add failing database tests asserting all three tables exist after `init_db`.
- [ ] Add failing round-trip and newest-first tests using a temporary database.
- [ ] Add `CREATE TABLE IF NOT EXISTS` migrations with indexes on date/created time.
- [ ] Implement parameterized insert/select helpers; JSON-encode structured completion and quality fields.
- [ ] Re-run database tests and confirm no existing schema tests regress.

The readiness table stores six scores, note, three conservative flags, classified status, scan date, and creation timestamp. Jump plant values are constrained by application validation to `one_foot_left`, `one_foot_right`, `two_foot_left_right`, or `two_foot_right_left`.

### Task 4: Additive Training API

**Interfaces:**
- `POST /training/readiness-scan`
- `GET /training/routed-session`
- `POST /training/log/capacity-block`
- `POST /training/log/jump-balance`
- existing `GET /training/history` gains additive arrays.

- [ ] Write failing API tests for 0–10 validation, scan persistence, same-day routed lookup, unchecked routing, high-neural gating, capacity logging, four valid plants, invalid plant rejection, and additive history.
- [ ] Run `python -m pytest jarvis/api/tests/test_training_routes.py -q` and confirm endpoint failures.
- [ ] Add Pydantic request models with strict literals and bounded numeric fields.
- [ ] Extract the existing current-session serialization to a private helper reused by `/status` and `/routed-session`.
- [ ] Implement routes as thin calls to database and `joint_capacity`.
- [ ] Re-run route tests and focused Training tests.

The routed endpoint uses `clock.today()`, only accepts a readiness scan from that date, and never calls the AI gateway.

### Task 5: Frontend client and pure view model

**Interfaces:**
- Produces `getTrainingRoutedSession`, `postTrainingReadinessScan`, `postTrainingCapacityBlock`, `postTrainingJumpBalance` in `client.js`.
- Produces pure helpers `readinessTone`, `formatRouteReason`, and `canStartHighNeural`.

- [ ] Write failing Node tests showing unchecked high-neural routes cannot start and safe missing-data labels remain honest.
- [ ] Run `npm test -- src/components/training/trainingViewModel.test.js` and confirm missing-module failures.
- [ ] Implement the small pure view model and API functions.
- [ ] Re-run Node tests.

`canStartHighNeural(route)` returns false only when `route.readiness_required` is true and status is `unchecked` or `recovery_only`; it never reconstructs backend threshold logic.

### Task 6: Training cockpit integration

**Interfaces:**
- Consumes only the additive Training API contracts and existing Training navigation callbacks.
- Produces readiness, route, capacity, substitution, reset, pelvic-control, and jump-balance panels.

- [ ] Add a failing frontend source-contract test asserting the required labels and safety copy are present and forbidden copy is absent.
- [ ] Update `TrainingMetrics.jsx` to fetch status plus routed session, collect six scores, submit a scan, and refresh the route.
- [ ] Render `Today’s Route`, `Joint Capacity Block`, `Sled Balance`, `Squat Balance`, `Pelvic Control`, and conditional `Recovery Reset`/`Jump Balance` cards.
- [ ] Preserve bottom padding, mobile wrapping, accessible buttons, and honest loading/error/empty states.
- [ ] Run Node tests and Vite build.

The frontend must display backend-provided status/reasons and must not duplicate threshold or substitution logic.

### Task 7: Active session and Jump Balance logging

**Interfaces:**
- `ActiveSession` consumes a routed session and blocks the start control when backend gating says readiness is required.
- `JumpLog` submits one supported plant plus optional height, video note, and quality observations.

- [ ] Add failing source/view-model tests for gate messaging and four plant options.
- [ ] Update `ActiveSession.jsx` to load the routed session and replace max-output items with backend substitutions/regressions.
- [ ] Update `JumpLog.jsx` with the four plants, arms-free/ball-in-hand mode, optional rim/dunk height, and quality fields.
- [ ] Keep one quality rep valid and enforce a maximum of ten reps per plant in the form/API.
- [ ] Run Node tests and Vite build.

### Task 8: Full review and verification

- [ ] Run focused domain tests: `python -m pytest jarvis/domains/training/tests -q`.
- [ ] Run Training API tests: `python -m pytest jarvis/api/tests/test_training_routes.py -q`.
- [ ] Run database tests: `python -m pytest jarvis/data/tests/test_database.py -q`.
- [ ] Run the full backend suite: `python -m pytest -q`.
- [ ] Run `python -m compileall -q jarvis`.
- [ ] Run frontend tests and build: `cd pwa; npm test; npm run build`.
- [ ] Run existing Finance acceptance/smoke gates locally to prove the locked domain is unchanged.
- [ ] Run `git diff --check`, inspect `git diff --stat`, and confirm no forbidden artifacts or unrelated domain files are staged.
- [ ] Review every emitted Training string for medical/marketing claims and every routed high-neural path for conservative gating.
- [ ] Commit only approved files with `git commit -m "Add Training readiness and joint capacity routing"`.
- [ ] Push `codex/training-joint-capacity` only after all checks pass and report the hash/status.

## Self-review

- Spec coverage: every readiness threshold, conservative observation flag, six-zone map, Sled alternative, four jump plants, pelvic-control option, reset condition, persistence endpoint, UI panel, copy rule, and non-goal maps to a task above.
- Placeholder scan: no TBD/TODO/follow-up placeholders remain.
- Type consistency: domain status values and API/frontend keys use the same snake_case contract; frontend does not recalculate routing.
- Scope: all planned production changes are inside Training, shared database schema/helpers, Training API, Training client, and Training tests/docs.
