# PHOENIX Training Adaptive Planner Design

**Date:** 2026-07-16

**Status:** Approved design

**Primary user:** The owner of PHOENIX

**Primary objective:** Make PHOENIX an autonomous, user-steerable training coach that adapts the full week while protecting the dunk objective and training safety.

## Problem

Training already provides a constitution, scheduled sessions, readiness scans, recovery data, session routing, progression suggestions, history, and calendar conflict checks. These capabilities do not yet operate as one authoritative coaching system. The current program is largely static, and changing one day does not reliably regenerate the affected week.

The user needs to be able to say, for example, "I do not want to train today; move it to tomorrow." PHOENIX must treat that request as a planning constraint, rebuild the week, preserve useful stimuli, protect recovery spacing, explain every consequential change, and wait for approval before activating the revision.

## Product Principles

1. **Autonomous programming, user-controlled constraints.** PHOENIX owns exercise selection, ordering, volume, intensity, progression, and recovery logic. The user controls availability, preferences, equipment, schedule changes, and other real-world constraints.
2. **Replan the system, not one calendar cell.** A moved or skipped session causes the affected week to be regenerated rather than patched locally.
3. **Deterministic authority.** Structured, testable planner logic produces the plan. The conversational layer interprets requests and explains outcomes but never invents workouts directly.
4. **Preview before authority.** User requests and PHOENIX-initiated optimizations produce a before/after preview. A new plan becomes authoritative only after one explicit apply action.
5. **Safety blocks are immediate.** Pain or injury warning flags block loaded and explosive work without waiting for plan approval. The system routes to a conservative alternative and explains the block.
6. **Every change is auditable.** PHOENIX stores what changed, why it changed, which inputs caused it, and which plan version it replaced.

## Scope

### Included

- Generate one authoritative seven-day training plan.
- Adapt the week from readiness, soreness, pain flags, logged performance, recovery, calendar conflicts, available time, available equipment, and preferences.
- Support quick actions: `MOVE`, `SKIP`, and `REPLACE`.
- Support natural-language change requests that compile into structured constraints.
- Preview all non-emergency plan changes before activation.
- Version and persist plans, proposals, approvals, supersessions, and reasons.
- Show plan history and readable active rules.
- Add an `ADAPT WEEK` entry point to the existing Training cockpit.
- Build an orange Training Control Room consistent with the existing holographic interface.

### Deferred

- Redesigning the active `START SESSION` experience.
- Automatic wearable integrations.
- Clinical diagnosis, rehabilitation prescriptions, or claims that PHOENIX can clear an injury.
- Social features, coach marketplaces, or shared programming.

After the Control Room is operating on authoritative planner data, `START SESSION` will receive a separate design and implementation pass.

## System Architecture

### 1. Training Constitution

The constitution defines hard and soft planning boundaries:

- Dunk objective and attempt window.
- Training phases and progression limits.
- Required weekly stimuli.
- Minimum recovery spacing.
- Heavy, explosive, general, recovery, and rest session classes.
- Pain and injury blocks.
- Calendar conflict policy.
- Exercise eligibility and substitution families.
- Maximum weekly and per-session volume changes.
- Deload authority.
- User preference and equipment constraints.

The constitution is versioned. Every plan receipt records the constitution version used to create it.

### 2. Adaptive Weekly Planner

The planner receives a canonical snapshot containing:

- Current date, phase, and week.
- Active constitution.
- Recent completed, skipped, and partial sessions.
- Exercise-level set, repetition, load, and effort history.
- Readiness, sleep, soreness, and pain flags.
- Jump and strength performance trends.
- Calendar availability and performance conflicts.
- Equipment and location availability.
- Long-term preferences and temporary constraints.
- The currently authoritative plan, when one exists.

It returns an ordered seven-day plan, validation results, rationale codes, and alternatives rejected by hard constraints. The same canonical input must always produce the same output.

### 3. Change Engine

The change engine converts user intent into typed constraints such as:

- `unavailable(date)`
- `move_session(source_date, target_date)`
- `skip_session(date)`
- `replace_exercise(session_id, exercise_id, reason)`
- `time_limit(date, minutes)`
- `equipment_available(date, equipment)`
- `exercise_preference(exercise, avoid_or_prefer)`

Natural language is accepted only after it has been compiled into one or more visible structured constraints. The planner, not the language model, calculates the new week.

### 4. Plan Ledger

The ledger stores immutable plan receipts and separate lifecycle events. A receipt contains:

- Plan ID and version.
- Parent plan ID.
- Constitution and planner versions.
- Canonical input hash.
- Created and valid dates.
- Seven planned days and their sessions.
- Applied constraints.
- Safety and recovery checks.
- Reason codes and human-readable explanation.
- Proposal status: `proposed`, `active`, `superseded`, `completed`, or `rejected`.
- Approval timestamp when applicable.

Only one active plan may exist for a given training week. Applying a proposal supersedes the previous active version atomically.

## Planning Behavior

### Weekly Generation

PHOENIX generates or refreshes the authoritative week from current evidence. It preserves the phase objective while selecting the exact session arrangement that best fits constraints and recovery.

### Daily Readiness

Before a session, PHOENIX compares the latest readiness evidence with the authoritative plan. Material changes create a proposed revision. The user sees the changed session and any downstream weekly effects before applying it.

### Move Example

For "move today's training to tomorrow":

1. Record today as unavailable for the requested session.
2. Place the session objective on tomorrow if tomorrow passes hard checks.
3. Recalculate spacing for every later heavy or explosive session.
4. Move, reduce, replace, or remove conflicting downstream work.
5. Preserve essential weekly stimuli without compressing missed volume into unsafe sessions.
6. Return a before/after diff and validation summary.
7. Activate the revision only after `APPLY PLAN`.

### Skip Behavior

Skipping records an intentional missed session. PHOENIX may recover the most valuable stimulus later only when spacing, volume, and calendar checks pass. It does not automatically double the next session.

### Exercise Replacement

Replacement uses constitution-defined movement families, joint demands, equipment needs, and session objectives. A preference-based replacement remains active as a user constraint until removed. A temporary equipment replacement applies only to its specified dates or location.

### Automatic Progression

PHOENIX may change exercises, sets, intensity, and deload timing when supported by logged performance or recovery evidence. Every automatic proposal names its trigger and expected programming effect. It cannot exceed constitution limits.

## Safety and Failure Behavior

- Pain or injury warning flags immediately block loaded and explosive work affecting the flagged area.
- A blocked session routes to a conservative recovery or unaffected-area alternative; it does not claim to treat or clear an injury.
- Missing readiness or calendar evidence causes a conservative proposal and a visible data-quality warning.
- Invalid or ambiguous natural-language requests do not change the plan. PHOENIX shows the interpreted constraint and asks for correction.
- If no valid replan exists, the current active plan remains unchanged and the proposal explains the conflicting hard rules.
- Database or API failures never silently activate a proposal.
- Duplicate apply requests are idempotent.

## User Experience

### Existing Training Cockpit

The current holographic Training cockpit remains the primary glanceable screen. It answers: "What should I do now?"

- `START SESSION` remains the primary action.
- Add `ADAPT WEEK` directly below it.
- Keep `READINESS` and `LOG SLEEP` as secondary actions.
- Show the active plan version and a concise status signal without adding a dense planner to the cockpit.

### Training Control Room

`ADAPT WEEK` opens a full-screen Training Control Room with four views:

1. **WEEK** — authoritative seven-day plan, plan version, session details, and changed-day markers.
2. **ADAPT** — quick actions, natural-language request input, interpreted constraints, before/after diff, safety checks, and `APPLY PLAN`.
3. **HISTORY** — completed sessions and the complete plan revision ledger.
4. **RULES** — readable objective, progression boundaries, recovery rules, preferences, equipment constraints, and active temporary constraints.

### Visual Direction

- Preserve the existing Training orange theme.
- Reuse the current holographic HUD typography, scanlines, sharp borders, technical spacing, and orange status hierarchy.
- Use green only for validated changes and successful checks, yellow for recoverable warnings, and red for hard safety blocks.
- Keep the cockpit immersive and sparse; place dense planning information in the Control Room.
- Match Finance Control Room interaction quality without copying its cyan identity.
- Support desktop and mobile without overlapping text, unstable dimensions, or horizontally compressed week cells.

## API Surface

The implementation should expose contracts equivalent to:

- `GET /training/plan/current`
- `POST /training/plan/proposals`
- `GET /training/plan/proposals/{proposal_id}`
- `POST /training/plan/proposals/{proposal_id}/apply`
- `POST /training/plan/proposals/{proposal_id}/reject`
- `GET /training/plans/history`
- `GET /training/rules`

The proposal request accepts structured constraints. A separate intent endpoint may translate natural language into those constraints, but it may not activate a plan.

Existing readiness, recovery, history, calendar, and session-log routes remain source inputs and are reused where their contracts are sound.

## Testing Strategy

### Planner Tests

- Identical canonical inputs produce identical plans and hashes.
- Moving a session replans all affected days.
- Skipping never doubles the next session automatically.
- Minimum recovery spacing is preserved.
- Essential weekly stimuli are preserved when feasible.
- Calendar hard blocks cannot be bypassed.
- Equipment and time constraints select valid substitutions.
- Performance evidence triggers bounded progression.
- Fatigue evidence triggers bounded reduction or deload.
- Pain flags block affected loaded and explosive work.
- No-valid-plan scenarios fail closed with explicit reasons.

### Lifecycle and API Tests

- Only one active plan exists per week.
- Applying a proposal atomically supersedes its parent.
- Repeated apply requests are idempotent.
- Rejected and superseded proposals cannot become active.
- History preserves immutable plan and reason data.
- Natural-language translation cannot directly activate a plan.

### Frontend Tests

- The cockpit exposes `ADAPT WEEK` without displacing `START SESSION`.
- The Control Room renders all four views.
- Before/after changes and safety checks are visible before apply.
- Hard blocks cannot display an enabled apply action.
- Desktop and mobile layouts preserve hierarchy and do not overlap.
- Orange Training identity remains distinct from Finance and other domains.

## Rollout

1. Add versioned planner and ledger contracts behind the existing Training routes.
2. Replay fixtures for normal, moved, skipped, fatigued, equipment-limited, calendar-blocked, and pain-blocked weeks.
3. Build the Control Room against deterministic fixture data.
4. Connect it to persisted proposals and active plans.
5. Add `ADAPT WEEK` to the cockpit.
6. Run browser QA on desktop and mobile.
7. Observe planner recommendations without replacing the current schedule.
8. Promote the planner to authoritative after replay and safety acceptance passes.
9. Begin the separate `START SESSION` design review using real authoritative plan data.

## Acceptance Criteria

- The user can move today's session to tomorrow and receive a complete revised-week preview.
- The preview explains every changed day and validates recovery and calendar constraints.
- Applying the proposal creates one authoritative version and supersedes the prior plan.
- PHOENIX can adapt exercises, volume, intensity, and deload timing from recorded evidence within constitution limits.
- Pain flags hard-block affected loaded or explosive work.
- Every plan and revision is deterministic, versioned, persisted, and auditable.
- The existing cockpit remains recognizable, with `START SESSION` primary and `ADAPT WEEK` secondary.
- The Control Room matches the current premium holographic design and preserves the orange Training theme.
- The initial implementation does not redesign `START SESSION`; that review begins after the planner is operational.
