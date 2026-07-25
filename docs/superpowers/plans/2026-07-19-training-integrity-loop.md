# Training Integrity Loop Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the active adaptive Training plan the only operational source for today’s workout, collect real readiness and completion evidence, and grant Phoenix authority only after deterministic runtime replay.

**Architecture:** A focused operational projection module converts the immutable active plan receipt into the one session contract consumed by `/training/status`, `/training/routed-session`, and both Training session UIs. Planned-session completion is written atomically to the existing session log plus a new provenance/evidence table, while planner acceptance becomes a global engine certificate and each proposal is independently replayed before it can be shown or applied as authoritative. The Holo Training view keeps its orange visual language but explicitly renders loading, unavailable, plan-required, readiness-required, active, and completion states from API data.

**Tech Stack:** Python 3.12, FastAPI, Pydantic v2, SQLite, pytest, React 18, Vite 5, Node test runner, Playwright/Chrome for visual QA.

## Global Constraints

- The active adaptive receipt is the sole source of runnable Training sessions.
- A missing active plan must produce `operational_state: "plan_required"`; legacy engine sessions must never become runnable fallbacks.
- The existing Finance changes in `jarvis/domains/finance/portfolio_state.json` are unrelated and must not be staged, reverted, or modified.
- Readiness requires six 0–10 body-area scores, three explicit safety flags, and an optional note of at most 500 characters.
- Planned completion requires RPE 1–10 and explicit pain confirmation; notes remain optional.
- One plan day can create at most one completion record; retries return the original record.
- Planner live authority requires live mode, valid global acceptance evidence, current versions, deterministic replay identity, passing hard validations, and a matching active parent.
- Phoenix recommends and adapts; it performs no external order, calendar, or training action.
- Railway remains in shadow mode until real calendar evidence is restored and the complete acceptance gate passes.
- Preserve the existing premium orange Training visual language and responsive desktop/mobile layout.

---

## File Map

- Create `jarvis/domains/training/operational_plan.py`: pure conversion and validation of an active receipt’s dated `PlanDay` into a frontend/API session projection.
- Create `jarvis/domains/training/tests/test_operational_plan.py`: pure projection coverage for work, rest, missing day, and malformed receipt cases.
- Modify `jarvis/api/routers/training.py`: source status/routing from the active plan, validate plan-linked completions, and use runtime replay authority.
- Modify `jarvis/api/tests/test_training_routes.py`: API contracts for plan-required, active-plan routing, readiness gating, and provenance.
- Modify `jarvis/data/database.py`: add the append-only `training_session_evidence` table and atomic idempotent planned-session write/read helpers.
- Modify `jarvis/api/tests/test_training_tracker.py`: persistence, idempotency, and completion-validation coverage.
- Modify `jarvis/domains/training/plan_acceptance.py`: remove exact proposal IDs from global evidence and expose runtime proposal replay validation.
- Modify `jarvis/domains/training/tests/test_plan_acceptance.py`: global certificate and tamper/stale-version replay tests.
- Modify `jarvis/api/tests/test_training_plan_routes.py`: proposal authority and apply-time replay/parent tests.
- Modify `pwa/src/api/client.js`: add routed-session, readiness-scan, history, and plan-linked completion client calls.
- Create `pwa/src/components/holo/trainingLive.js`: normalize Training endpoint states and build truthful Holo view/session/readiness models.
- Create `pwa/src/components/holo/trainingLive.test.js`: frontend source-state and session-payload unit tests.
- Modify `pwa/src/components/holo/useHoloData.js`: retain Training loading/error state and fetch routed session/history.
- Modify `pwa/src/components/holo/holoLive.js`: apply only normalized real Training state and replace every Training panel.
- Modify `pwa/src/components/holo/HoloCommand.jsx`: pass live routed data and refresh callbacks to Training subviews.
- Modify `pwa/src/components/holo/subs/TrainingSubs.jsx`: replace fixture readiness/session behavior with API-backed forms and completion check.
- Modify `pwa/src/components/training/ActiveSession.jsx`: consume the same operational session contract and surface write failures.
- Modify `pwa/src/components/holo/holoDomains.js`: remove Training readiness/session fixtures from production exports.
- Add or modify focused Node contract tests beside the changed Holo components.
- Modify `docs/superpowers/specs/2026-07-19-training-integrity-loop-design.md` only if implementation reveals a contract clarification; behavior must not drift silently.
- Modify `.superpowers/sdd/task-10-report.md`: record the new verification and shadow deployment without claiming live authority.

---

### Task 1: Active Plan Operational Projection

**Files:**
- Create: `jarvis/domains/training/operational_plan.py`
- Create: `jarvis/domains/training/tests/test_operational_plan.py`
- Modify: `jarvis/api/routers/training.py`
- Modify: `jarvis/api/tests/test_training_routes.py`

**Interfaces:**
- Consumes: persisted receipt mappings returned by `database.get_active_training_plan(cycle_id)` and `clock.today()`.
- Produces: `project_plan_day(receipt: Mapping[str, Any] | None, target_date: date) -> dict[str, Any]` with `operational_state`, `plan_provenance`, and `session` keys.
- Produces: `/training/status.today_session` and `/training/routed-session.session` from the same projected plan day.

- [ ] **Step 1: Write failing pure projection tests**

```python
def test_projects_today_from_active_receipt(active_receipt):
    result = project_plan_day(active_receipt, date(2026, 7, 20))
    assert result["operational_state"] == "active_plan"
    assert result["plan_provenance"] == {
        "plan_id": active_receipt["plan_id"],
        "receipt_hash": active_receipt["receipt_hash"],
        "date": "2026-07-20",
    }
    assert result["session"]["session_type"] == "high_intensity"
    assert result["session"]["exercises"] == active_receipt["days"][0]["exercises"]


def test_missing_active_receipt_requires_plan():
    assert project_plan_day(None, date(2026, 7, 20)) == {
        "operational_state": "plan_required",
        "plan_provenance": None,
        "session": None,
    }


def test_active_receipt_without_target_day_fails_closed(active_receipt):
    result = project_plan_day(active_receipt, date(2026, 8, 1))
    assert result["operational_state"] == "plan_required"
    assert result["session"] is None
```

- [ ] **Step 2: Run the pure tests and verify RED**

Run: `python -m pytest jarvis/domains/training/tests/test_operational_plan.py -q`

Expected: collection fails because `jarvis.domains.training.operational_plan` does not exist.

- [ ] **Step 3: Implement the pure projection**

```python
def project_plan_day(receipt, target_date):
    if receipt is None:
        return _plan_required()
    target = target_date.isoformat()
    day = next((item for item in receipt.get("days", ()) if item.get("date") == target), None)
    if day is None:
        return _plan_required()
    session = {
        "date": target,
        "session_type": day["session_type"],
        "display_name": day["objective"].replace("_", " ").title(),
        "objective": day["objective"],
        "exercises": [dict(item) for item in day.get("exercises", ())],
        "estimated_minutes": day["estimated_minutes"],
        "change_reason": day.get("change_reason"),
        "is_rest": day["session_type"] in {"rest", "recovery"},
    }
    return {
        "operational_state": "active_plan",
        "plan_provenance": {
            "plan_id": receipt["plan_id"],
            "receipt_hash": receipt["receipt_hash"],
            "date": target,
        },
        "session": session,
    }
```

- [ ] **Step 4: Write failing route tests for the shared source**

```python
def test_status_requires_plan_instead_of_returning_legacy_session():
    with patch("jarvis.api.routers.training.database.get_active_training_plan", return_value=None):
        body = client.get("/training/status").json()
    assert body["operational_state"] == "plan_required"
    assert body["today_session"] is None


def test_status_and_routed_session_share_active_plan_day(active_receipt):
    with patch("jarvis.api.routers.training.database.get_active_training_plan", return_value=active_receipt), \
         patch("jarvis.api.routers.training.clock.today", return_value=date(2026, 7, 20)), \
         patch("jarvis.api.routers.training.database.get_latest_training_readiness_scan", return_value=None):
        status = client.get("/training/status").json()
        routed = client.get("/training/routed-session").json()
    assert status["today_session"] == routed["session"]
    assert routed["plan_provenance"] == status["plan_provenance"]
```

- [ ] **Step 5: Run route tests and verify RED**

Run: `python -m pytest jarvis/api/tests/test_training_routes.py -q`

Expected: failures show legacy `today_session` is still returned and routed output lacks plan provenance.

- [ ] **Step 6: Wire both routes to `project_plan_day`**

Keep legacy mission/cut calculations as non-operational context, then overwrite `today_session` and `week_sessions` from the active receipt. Return `409` from `/training/routed-session` with `detail: "Active training plan required"` when no dated plan day exists. Pass the projected session through `joint_capacity.route_session` and include `session`, `operational_state`, and `plan_provenance` in its response.

- [ ] **Step 7: Run focused and neighboring tests**

Run: `python -m pytest jarvis/domains/training/tests/test_operational_plan.py jarvis/api/tests/test_training_routes.py jarvis/api/tests/test_training_plan_routes.py -q`

Expected: all selected tests pass; old status expectations are updated to the explicit plan-required contract.

- [ ] **Step 8: Commit the operational source**

```powershell
git add jarvis/domains/training/operational_plan.py jarvis/domains/training/tests/test_operational_plan.py jarvis/api/routers/training.py jarvis/api/tests/test_training_routes.py
git commit -m "feat(training): drive sessions from active plans"
```

---

### Task 2: Idempotent Plan-Linked Completion Evidence

**Files:**
- Modify: `jarvis/data/database.py`
- Modify: `jarvis/api/routers/training.py`
- Modify: `jarvis/api/tests/test_training_tracker.py`

**Interfaces:**
- Consumes: Task 1 `plan_provenance` and projected session.
- Produces: `database.log_planned_session(..., plan_id: str, receipt_hash: str, plan_date: date | str, duration_seconds: int, rpe: int, pain_confirmed: bool, pain_body_areas: list[str], notes: str | None) -> tuple[int, bool]`, where the boolean reports whether a new row was created.
- Produces: `POST /training/log/session` response with `status`, `session_id`, `date`, `idempotent_replay`, and `plan_provenance`.

- [ ] **Step 1: Write failing database tests**

```python
def test_planned_session_write_persists_completion_evidence(self):
    session_id, replay = database.log_planned_session(
        session_date="2026-07-20", session_type="high_intensity", week_number=None,
        exercises=[_exercise()], plan_id="plan-1", receipt_hash="receipt-1",
        plan_date="2026-07-20", duration_seconds=2700, rpe=8,
        pain_confirmed=False, pain_body_areas=[], notes="Clean session",
    )
    assert replay is False
    row = database.get_sessions()[0]
    assert row["plan_provenance"]["plan_id"] == "plan-1"
    assert row["completion_evidence"]["rpe"] == 8


def test_planned_session_write_is_idempotent_per_plan_day(self):
    first = database.log_planned_session(**planned_session_values)
    second = database.log_planned_session(**planned_session_values)
    assert first == (second[0], False)
    assert second[1] is True
    assert len(database.get_sessions()) == 1
```

- [ ] **Step 2: Run tracker tests and verify RED**

Run: `python -m pytest jarvis/api/tests/test_training_tracker.py -q`

Expected: failures report that `log_planned_session` and evidence fields do not exist.

- [ ] **Step 3: Add the schema and atomic helper**

Add this table to `_SCHEMA`:

```sql
CREATE TABLE IF NOT EXISTS training_session_evidence (
    session_id INTEGER PRIMARY KEY,
    plan_id TEXT NOT NULL,
    receipt_hash TEXT NOT NULL,
    plan_date TEXT NOT NULL,
    duration_seconds INTEGER NOT NULL CHECK(duration_seconds >= 0),
    rpe INTEGER NOT NULL CHECK(rpe BETWEEN 1 AND 10),
    pain_confirmed INTEGER NOT NULL CHECK(pain_confirmed IN (0, 1)),
    pain_body_areas_json TEXT NOT NULL DEFAULT '[]',
    created_at TEXT NOT NULL,
    UNIQUE(plan_id, plan_date)
);
```

Implement `log_planned_session` with one SQLite transaction: check the unique plan/day row, return its session ID on retry, otherwise insert `session_log` and `training_session_evidence`, then commit. Extend `get_sessions` to attach `plan_provenance` and `completion_evidence` when an evidence row exists while preserving legacy rows.

- [ ] **Step 4: Write failing API validation and provenance tests**

```python
def test_planned_completion_requires_rpe_and_pain_confirmation(active_receipt):
    response = client.post("/training/log/session", json=planned_payload_without_completion)
    assert response.status_code == 422


def test_planned_completion_rejects_receipt_mismatch(active_receipt):
    response = client.post("/training/log/session", json={**planned_payload, "receipt_hash": "wrong"})
    assert response.status_code == 409


def test_planned_completion_returns_idempotent_replay(active_receipt):
    first = client.post("/training/log/session", json=planned_payload)
    second = client.post("/training/log/session", json=planned_payload)
    assert first.status_code == second.status_code == 200
    assert second.json()["session_id"] == first.json()["session_id"]
    assert second.json()["idempotent_replay"] is True
```

- [ ] **Step 5: Run API tests and verify RED**

Run: `python -m pytest jarvis/api/tests/test_training_tracker.py -q`

Expected: the current request model rejects new provenance fields or accepts incomplete planned completion evidence.

- [ ] **Step 6: Extend the request and enforce the active receipt**

Add optional legacy-compatible request fields `plan_id`, `receipt_hash`, `duration_seconds`, `rpe`, `pain_confirmed`, and `pain_body_areas`. When any plan provenance field is present, require all plan/completion fields, load the active plan, project the request date, verify plan ID/hash/date/session type, and call `log_planned_session`. Keep the old `database.log_session` path only for explicitly legacy callers without plan provenance; Holo and `ActiveSession` will stop using it in Task 5.

- [ ] **Step 7: Run focused tests**

Run: `python -m pytest jarvis/api/tests/test_training_tracker.py jarvis/api/tests/test_training_routes.py -q`

Expected: all selected tests pass, including migration against a newly initialized SQLite database and legacy history compatibility.

- [ ] **Step 8: Commit completion evidence**

```powershell
git add jarvis/data/database.py jarvis/api/routers/training.py jarvis/api/tests/test_training_tracker.py
git commit -m "feat(training): persist plan-linked completion evidence"
```

---

### Task 3: Runtime Deterministic Proposal Authority

**Files:**
- Modify: `jarvis/domains/training/plan_acceptance.py`
- Modify: `jarvis/domains/training/tests/test_plan_acceptance.py`
- Modify: `jarvis/api/routers/training.py`
- Modify: `jarvis/api/tests/test_training_plan_routes.py`

**Interfaces:**
- Consumes: persisted canonical proposal mappings and global acceptance evidence.
- Produces: `validate_runtime_proposal(receipt: Mapping[str, Any], *, active_parent_id: str | None) -> tuple[bool, tuple[str, ...]]`.
- Produces: proposal `authoritative: true` only when live mode, global acceptance, runtime replay, hard validations, current versions, and parent identity all pass.

- [ ] **Step 1: Replace allowlist expectations with failing certificate tests**

```python
def test_acceptance_certificate_does_not_embed_proposal_ids(evidence):
    assert evidence["accepted"] is True
    assert "accepted_proposals" not in evidence


def test_runtime_validation_accepts_fresh_deterministic_receipt(receipt):
    accepted, reasons = validate_runtime_proposal(receipt, active_parent_id=receipt["parent_plan_id"])
    assert accepted is True
    assert reasons == ()


def test_runtime_validation_rejects_tampered_days(receipt):
    receipt["days"][0]["objective"] = "tampered"
    accepted, reasons = validate_runtime_proposal(receipt, active_parent_id=receipt["parent_plan_id"])
    assert accepted is False
    assert "runtime_replay_failed" in reasons
```

- [ ] **Step 2: Run acceptance tests and verify RED**

Run: `python -m pytest jarvis/domains/training/tests/test_plan_acceptance.py -q`

Expected: evidence still contains `accepted_proposals` and runtime validation is unavailable.

- [ ] **Step 3: Implement global certificate plus per-receipt replay**

Remove `accepted_proposals` from `evaluate_training_shadow`, `training_planner_acceptance_status`, and `_closed_status`. `validate_runtime_proposal` must reject stale planner/constitution versions, replay exceptions or identity differences, malformed/failed hard validations, and parent mismatch. It must return stable reason codes rather than raising.

- [ ] **Step 4: Write failing route authority tests**

```python
def test_live_replayed_proposal_is_authoritative_without_exact_allowlist(...):
    response = client.get(f"/training/plan/proposals/{proposal_id}")
    assert response.json()["authoritative"] is True


def test_apply_replays_persisted_proposal_before_atomic_activation(...):
    tamper_persisted_receipt_days(proposal_id)
    response = client.post(f"/training/plan/proposals/{proposal_id}/apply")
    assert response.status_code == 409
    assert "runtime replay" in response.json()["detail"].lower()


def test_apply_rejects_parent_that_is_no_longer_active(...):
    response = client.post(f"/training/plan/proposals/{stale_child_id}/apply")
    assert response.status_code == 409
```

- [ ] **Step 5: Run plan route tests and verify RED**

Run: `python -m pytest jarvis/api/tests/test_training_plan_routes.py -q`

Expected: the exact proposal allowlist controls authority and apply.

- [ ] **Step 6: Replace `_proposal_is_allowlisted` with runtime validation**

Use one router helper to combine live mode, global certificate, current active parent ID, and `validate_runtime_proposal`. Re-run it immediately before `database.apply_training_plan_proposal`; do not trust the earlier preview calculation. Return `409` for proposal-specific replay/parent failures and `503` only when global acceptance evidence is unavailable.

- [ ] **Step 7: Run all planner tests**

Run: `python -m pytest jarvis/domains/training/tests/test_plan_acceptance.py jarvis/api/tests/test_training_plan_routes.py -q`

Expected: all tests pass with no proposal identity embedded in environment evidence.

- [ ] **Step 8: Commit runtime authority**

```powershell
git add jarvis/domains/training/plan_acceptance.py jarvis/domains/training/tests/test_plan_acceptance.py jarvis/api/routers/training.py jarvis/api/tests/test_training_plan_routes.py
git commit -m "feat(training): replay proposals at authority boundary"
```

---

### Task 4: Truthful Training Source Models

**Files:**
- Create: `pwa/src/components/holo/trainingLive.js`
- Create: `pwa/src/components/holo/trainingLive.test.js`
- Modify: `pwa/src/api/client.js`
- Modify: `pwa/src/components/holo/useHoloData.js`
- Modify: `pwa/src/components/holo/holoLive.js`
- Modify: `pwa/src/components/holo/holoDomains.js`
- Modify: focused Holo contract tests that import these modules.

**Interfaces:**
- Consumes: `/training/status`, `/training/routed-session`, and `/training/history` results plus loading/error flags.
- Produces: `normalizeTrainingLive({ status, routed, history, loading, error }) -> { state, status, routed, history, message }`.
- Produces: `buildTrainingDomain(baseDomain, liveModel) -> domain` that replaces all four Training panels and never retains Training fixture metrics.

- [ ] **Step 1: Write failing frontend source-state tests**

```javascript
test('backend failure produces an unavailable model without fixture values', () => {
  const model = normalizeTrainingLive({ status: null, routed: null, history: null, loading: false, error: 'offline' })
  assert.equal(model.state, 'unavailable')
  const domain = buildTrainingDomain(structuredClone(DOMAINS.training), model)
  assert.doesNotMatch(JSON.stringify(domain), /53|31\.5|82%/)
  assert.match(domain.heroLabel, /DATA UNAVAILABLE/)
})

test('plan-required is distinct from a rest day', () => {
  const model = normalizeTrainingLive({ status: { operational_state: 'plan_required' }, loading: false })
  assert.equal(model.state, 'plan_required')
})

test('active model uses only API history for compliance telemetry', () => {
  const model = normalizeTrainingLive({ status, routed, history, loading: false })
  const domain = buildTrainingDomain(structuredClone(DOMAINS.training), model)
  assert.match(JSON.stringify(domain.panels[2]), /2 COMPLETED/)
})
```

- [ ] **Step 2: Run Node tests and verify RED**

Run: `npm test -- --test-name-pattern="Training live"` from `pwa`.

Expected: module imports fail because `trainingLive.js` does not exist.

- [ ] **Step 3: Implement normalized states and complete domain replacement**

Represent `loading`, `unavailable`, `plan_required`, `readiness_required`, `rest`, and `ready` explicitly. Build hero chips, briefing, readout, all four panels, and feed from API values or honest unavailable copy. No numeric Training fallback may be read from `DOMAINS.training`.

- [ ] **Step 4: Extend the API client and Holo fetch state**

```javascript
export const getTrainingRoutedSession = () => apiFetch('/training/routed-session')
export const postTrainingReadinessScan = body => apiFetch('/training/readiness-scan', { method: 'POST', body: JSON.stringify(body) })
export const getTrainingHistory = () => apiFetch('/training/history')
export const logTrainingSession = body => apiFetch('/training/log/session', { method: 'POST', body: JSON.stringify(body) })
```

Change `useHoloData` so Training has `{status, routed, history, loading, error}` and a `refreshTraining()` callback. A routed-session `409` caused by `plan_required` becomes a modeled state, not a swallowed exception.

- [ ] **Step 5: Remove Training fixtures from the production path**

Route Holo Training through `buildTrainingDomain`, delete `mapSessionExercises`, remove `SESSION_EXERCISES` and `READINESS_GAUGES` exports, and update contract tests to reject those identifiers in Training production modules.

- [ ] **Step 6: Run frontend unit tests and build**

Run: `npm test` from `pwa`.

Expected: all Node tests pass.

Run: `npm run build` from `pwa`.

Expected: Vite exits 0 without missing exports.

- [ ] **Step 7: Commit truthful source models**

```powershell
git add pwa/src/api/client.js pwa/src/components/holo/trainingLive.js pwa/src/components/holo/trainingLive.test.js pwa/src/components/holo/useHoloData.js pwa/src/components/holo/holoLive.js pwa/src/components/holo/holoDomains.js pwa/src/components/holo/*.test.js
git commit -m "feat(training): remove operational fixture fallbacks"
```

---

### Task 5: Real Readiness and Session Completion UI

**Files:**
- Modify: `pwa/src/components/holo/HoloCommand.jsx`
- Modify: `pwa/src/components/holo/subs/TrainingSubs.jsx`
- Create: `pwa/src/components/holo/subs/trainingSessionModel.js`
- Create: `pwa/src/components/holo/subs/trainingSessionModel.test.js`
- Modify: `pwa/src/components/training/ActiveSession.jsx`
- Modify: component contract tests beside the changed files.

**Interfaces:**
- Consumes: Task 4 Training live model and `refreshTraining()`.
- Produces: `buildReadinessPayload(form)`, `buildCompletionPayload({ routed, sets, elapsedSeconds, rpe, painConfirmed, painBodyAreas, notes })`, and `canCompleteSession(state)` pure helpers.
- Produces: readiness submission that refetches routing before session start and completion submission that remains open on API failure.

- [ ] **Step 1: Write failing readiness and completion model tests**

```javascript
test('readiness payload carries all six scores and explicit safety flags', () => {
  assert.deepEqual(buildReadinessPayload(readinessForm), {
    knee: 1, ankle: 0, hip: 2, hamstring: 1, calf_achilles: 0,
    lower_back_pelvic: 2, sharp_pain: false, limping: false,
    next_day_worsening: false, note: 'Normal stiffness',
  })
})

test('completion remains blocked until rpe and pain confirmation are explicit', () => {
  assert.equal(canCompleteSession({ allSetsDone: true, rpe: null, painAnswered: false }), false)
  assert.equal(canCompleteSession({ allSetsDone: true, rpe: 8, painAnswered: true }), true)
})

test('completion payload binds results to routed plan provenance', () => {
  const payload = buildCompletionPayload(completionState)
  assert.equal(payload.plan_id, routed.plan_provenance.plan_id)
  assert.equal(payload.receipt_hash, routed.plan_provenance.receipt_hash)
  assert.equal(payload.rpe, 8)
  assert.equal(payload.pain_confirmed, false)
})
```

- [ ] **Step 2: Run model tests and verify RED**

Run: `node --test src/components/holo/subs/trainingSessionModel.test.js` from `pwa`.

Expected: module import fails because the pure model does not exist.

- [ ] **Step 3: Implement the pure UI model**

Normalize exercise prescriptions without inventing sets or reps. The runner must display only plan fields supplied by the API; malformed exercises block start with `SESSION DATA UNAVAILABLE`. Build logged set results into the existing backend `ExerciseLog` shape.

- [ ] **Step 4: Replace `ReadinessSub` with an orange API-backed form**

Render six compact 0–10 numeric steppers/sliders, three checkboxes, optional note, submit state, and inline API error. On successful `postTrainingReadinessScan`, call `refreshTraining`, show the server classification, and enable the session only from the refreshed routed response. Keep the body-map visual as an ambient aid, not a source of fake telemetry.

- [ ] **Step 5: Replace `SessionSub` fallback and completion behavior**

Remove `exercises || SESSION_EXERCISES`. Render explicit plan-required, readiness-required, rest, and unavailable states. After the final set, replace the action control with a completion check containing RPE 1–10, a required Yes/No pain choice, conditional body-area checkboxes when pain is Yes, and optional notes. POST once, keep controls disabled while pending, display retry-safe success, and leave the form open with its values intact on failure.

- [ ] **Step 6: Align `ActiveSession` to the same contract**

Consume `/training/routed-session`, use `buildCompletionPayload`, remove legacy fallback scheduling, and show log failures rather than closing optimistically. Both session entry points must submit identical plan provenance and evidence fields.

- [ ] **Step 7: Run frontend tests and build**

Run: `npm test` from `pwa`.

Expected: all Node tests pass, including source scans proving `SESSION_EXERCISES`, `READINESS_GAUGES`, `82%`, and local-only completion are absent from Training operational components.

Run: `npm run build` from `pwa`.

Expected: Vite exits 0.

- [ ] **Step 8: Commit the operational UI**

```powershell
git add pwa/src/components/holo/HoloCommand.jsx pwa/src/components/holo/subs/TrainingSubs.jsx pwa/src/components/holo/subs/trainingSessionModel.js pwa/src/components/holo/subs/trainingSessionModel.test.js pwa/src/components/training/ActiveSession.jsx pwa/src/components/**/*.test.js
git commit -m "feat(training): capture real readiness and completion"
```

---

### Task 6: End-to-End Verification and Shadow Deployment

**Files:**
- Modify: `.superpowers/sdd/task-10-report.md`
- Create or modify: `.superpowers/sdd/runtime/qa-training.cjs`
- Create: `.superpowers/sdd/runtime/training-integrity-desktop.png`
- Create: `.superpowers/sdd/runtime/training-integrity-mobile.png`

**Interfaces:**
- Consumes: all prior tasks.
- Produces: fresh test/build evidence, visual screenshots, source assertions, and a Railway shadow deployment record.

- [ ] **Step 1: Run the complete backend matrix**

Run: `python -m pytest jarvis/domains/training/tests jarvis/api/tests/test_training_routes.py jarvis/api/tests/test_training_tracker.py jarvis/api/tests/test_training_plan_routes.py jarvis/data/tests -q`

Expected: exit 0 with zero failures.

- [ ] **Step 2: Run the complete frontend matrix**

Run: `npm test` from `pwa`.

Expected: exit 0 with zero failures.

Run: `npm run build` from `pwa`.

Expected: Vite exits 0 and emits `pwa/dist`.

- [ ] **Step 3: Run production-source integrity scans**

Run: `rg -n 'SESSION_EXERCISES|READINESS_GAUGES|READINESS GATE.*82|fixture fallback' pwa/src/components/holo pwa/src/components/training`

Expected: no production matches; test descriptions may be excluded with `-g '!*.test.js'`.

Run: `rg -n '_proposal_is_allowlisted|accepted_proposals' jarvis/api/routers/training.py jarvis/domains/training/plan_acceptance.py`

Expected: no matches.

- [ ] **Step 4: Start the local production build and run browser QA**

Start backend and `vite preview` on unused local ports. Use Playwright with desktop `1440x900` and mobile `390x844` viewports to verify: Training main screen, plan-required state, unavailable state, readiness form, routed session, final-set completion check, and API-error persistence. Assert no horizontal overflow, no overlapping controls, non-empty orange reactor pixels, and readable text.

- [ ] **Step 5: Inspect both screenshots**

Open `.superpowers/sdd/runtime/training-integrity-desktop.png` and `.superpowers/sdd/runtime/training-integrity-mobile.png`. Confirm the orange Training hierarchy remains consistent with the main projection and that completion/readiness controls fit without nested cards or text clipping.

- [ ] **Step 6: Deploy backend in Railway shadow mode**

Confirm `PHOENIX_TRAINING_PLANNER_MODE=shadow`, deploy the verified commit, wait for Railway success, and check `/health`, `/training/status`, and `/training/plan/proposals` fail closed when calendar evidence is unavailable. Do not switch to live mode.

- [ ] **Step 7: Deploy the verified PWA preview**

Deploy `pwa/dist` to a protected Vercel preview, open it, and repeat the desktop Training smoke path against the Railway shadow backend.

- [ ] **Step 8: Record exact evidence and commit**

Add test counts, build result, screenshot paths, Railway deployment ID/status, Vercel preview URL, planner mode, and the remaining calendar/OAuth blocker to `.superpowers/sdd/task-10-report.md`.

```powershell
git add .superpowers/sdd/task-10-report.md .superpowers/sdd/runtime/qa-training.cjs .superpowers/sdd/runtime/training-integrity-desktop.png .superpowers/sdd/runtime/training-integrity-mobile.png
git commit -m "docs(training): record integrity loop verification"
```

- [ ] **Step 9: Push the branch**

Run: `git push origin codex/training-adaptive-planner`

Expected: the remote branch advances to the verification commit. Report the real calendar/OAuth blocker clearly; do not describe Training as live-authoritative while Railway remains in shadow.

