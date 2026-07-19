# Training Integrity Loop Design

**Status:** Approved direction
**Date:** 2026-07-19
**Scope:** Training only

## Objective

Phoenix owns weekly Training decisions while the user performs the sessions. The active adaptive plan must drive the session shown by the primary Holo workflow, readiness must be evidence-backed, completed work must return to planner evidence, and new valid proposals must not require a manual environment update per week.

The orange Training identity and the existing Week, Adapt, History, and Rules Control Room remain. Railway stays in shadow until public calendar evidence and the complete operational loop pass.

## Non-Negotiable Truth Contract

- Production Training UI never presents fixture values as current data.
- Missing or failed Training sources render an explicit unavailable or unchecked state.
- High-neural clearance appears only when the backend routed-session response grants it from a current readiness scan.
- The active persisted weekly plan is the source for today's session and the seven-day horizon.
- Session completion is not recorded until the user confirms RPE, pain signals, and optional notes.
- Phoenix never invents calendar evidence and never promotes itself to live.
- No Training action writes to an external calendar.

## Architecture

### 1. One Operational Plan Source

Add a focused plan-to-session projection in the Training domain. Given the current active plan and date, it returns the exact plan day in the existing session response shape, including `plan_id`, `receipt_hash`, `planner_version`, and `change_reason` provenance.

`GET /training/status` and `GET /training/routed-session` both consume this projection. When the current cycle has no active plan, they return an explicit `plan_required` state for the Holo workflow instead of silently substituting the legacy constitution schedule. Legacy engine calculations may continue to supply mission and cut context, but not the operational exercise queue.

### 2. Evidence-Backed Holo State

`useHoloData` exposes Training loading, ready, empty, and error states instead of swallowing Training fetch failures. The Training domain mapper replaces every fixture-derived panel when live data is ready and replaces the entire Training projection with an unavailable presentation otherwise.

The fixed `53 days`, `82%`, `7H 40M`, `31.5 inch`, `78.4KG`, static telemetry graph, and fixture session queue cannot reach the production Training route. When no real telemetry series exists, the panel states `NO RECORDED TELEMETRY` rather than drawing a synthetic trend.

### 3. Readiness And Routing

The orange `READINESS` action becomes a real readiness workflow. It loads `/training/routed-session`, shows the latest scan and backend status, and provides inputs for the six body areas plus sharp pain, limping, next-day worsening, and a note. Submission posts `/training/readiness-scan`, then refetches the routed session.

Only backend statuses that permit the current session render clearance. Unchecked, recovery-only, regress, unavailable, and malformed responses fail closed. The body visualization remains, but its highlights and copy derive only from the submitted scan.

### 4. Plan-Driven Session And Completion Evidence

The primary `START SESSION` action loads the routed active-plan session. It has no fixture exercise fallback. A missing plan routes the user to `ADAPT WEEK`; an unchecked high-neural day routes to `READINESS`; a recovery route displays the backend substitutions.

After the final set, Phoenix opens a completion check requiring session RPE from 1 through 10 and explicit confirmation of pain signals. Notes remain optional. Confirming once posts a session record containing:

- active `plan_id` and `receipt_hash`;
- planned date, session type, and exercise/set results;
- elapsed duration and session RPE;
- sharp pain, limping, next-day worsening, and affected body areas;
- optional notes.

The write is idempotent for one plan day. A failed write leaves the completion check open and never shows `RECORDED`. The next planning snapshot consumes this persisted evidence.

### 5. Version Acceptance And Per-Proposal Replay

Environment acceptance certifies the current planner implementation, constitution version, fixture behavior coverage, replay purity, and side-effect boundary. It no longer contains an allowlist of future proposal IDs.

Each Apply request independently:

1. loads the persisted proposal and canonical replay inputs;
2. checks current planner and constitution versions;
3. deterministically replays the exact receipt;
4. requires identical plan, input, receipt, days, constraints, and validations;
5. revalidates every expected hard rule;
6. confirms the proposal parent is still the active plan;
7. atomically activates the proposal.

The proposal API sets `authoritative=true` only when mode is live, global version acceptance passes, and that exact persisted proposal passes runtime replay. Shadow mode remains non-authoritative and cannot Apply.

## Data And API Changes

- Extend session persistence with plan provenance, duration, RPE, and pain evidence using additive database migration columns.
- Extend `SessionLogRequest` with strict typed fields and reject missing provenance for plan-driven sessions.
- Return plan provenance and an explicit operational state from Training status and routed-session endpoints.
- Keep existing plan history immutable; session records reference plans rather than rewriting receipts.
- Remove `accepted_proposals` from acceptance evidence and replace it with runtime proposal replay status.

## UI Behavior

- Preserve the orange palette, compact typography, four Control Room tabs, and primary `START SESSION` placement.
- Keep the Control Room where it is: opened by `ADAPT WEEK` from the Training cockpit.
- Display a small source state in the Training cockpit: `ACTIVE PLAN`, `PLAN REQUIRED`, `READINESS REQUIRED`, or `SOURCE UNAVAILABLE`.
- Never use green for an unchecked or unavailable state.
- Keep desktop and 390px mobile layouts overlap-free and keyboard accessible.

## Failure Handling

- Backend unavailable: Training displays `SOURCE UNAVAILABLE`; Start and readiness-dependent actions are disabled.
- No active plan: display `PLAN REQUIRED` and keep `ADAPT WEEK` available.
- Calendar unavailable: proposal generation returns the existing fail-closed 503 and explains that calendar reconnection is required.
- Readiness missing: high-neural Start is blocked and directs to the scan.
- Session write failure: preserve local completion evidence and offer retry without duplicating logs.
- Acceptance unavailable or replay mismatch: Apply remains disabled in the PWA and rejected by the API.

## Verification

- TDD for plan-to-session projection, status routing, session persistence, runtime replay authority, and every fail-closed state.
- Backend regression matrix for Training domain, routes, tracker, plan lifecycle, and database.
- Frontend model and contract tests proving no fixture Training values or fallback exercises remain in the production path.
- Browser QA at 1440x900 and 390x844 for cockpit, readiness, session, completion check, and Control Room.
- Public shadow verification after Google Calendar read-only access is restored.
- Live promotion only after real shadow plans replay identically and session completion feeds the next snapshot without external side effects.

## Out Of Scope

- Automatic exercise execution, wearable integrations, medical diagnosis, or calendar writes.
- Redesigning Finance, Nutrition, Calendar, the global Holo scene, or the orange Training visual language.
- Replacing the established Training constitution or progression model beyond the evidence flow required here.
