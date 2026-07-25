# Phoenix Training Performance Hybrid Design

Date: 2026-07-24
Status: Approved for implementation planning

## Objective

Replace the current fixed weekday Long Conjugate schedule with an adaptive six-day performance hybrid that feels like Push/Pull training while preserving the dunk goal, lower-body power quality, readiness controls, and Phoenix autonomy.

The user performs and records the work. Phoenix owns session placement, exercise selection within approved movement families, recovery placement, safe adaptation, and progression.

## Program Structure

The program is a six-session ordered cycle rather than a fixed weekday template:

1. Push A: strength emphasis
2. Pull A: strength emphasis
3. Lower Power: strength and velocity
4. Push B: volume emphasis
5. Pull B: volume emphasis
6. Jump / Elastic: speed and dunk skill

Phoenix inserts one recovery day into each seven-day plan wherever calendar constraints, lower-body spacing, readiness, and recent completion evidence make it most useful. Recovery does not consume a sequence position. The next training day resumes the six-session cycle; moving or skipping a session never doubles the following day's volume.

Normal Push and Pull sessions target 60-75 minutes. Phoenix may compress them to 40-50 minutes by removing lower-priority accessories while preserving the session objective and movement balance.

## Session Templates

### Push A

- Bench press or an approved horizontal press
- Overhead press
- Lateral raise
- Triceps movement

### Pull A

- Weighted pull-up or vertical pull
- Barbell row or approved horizontal pull
- Rear-delt movement
- Biceps movement

### Lower Power

- Knee isometrics and dynamic preparation
- Explosive lift
- Squat pattern
- Posterior-chain pattern
- Calf or lower-leg work

### Push B

- Incline or dumbbell press
- Shoulder press
- Chest isolation
- Lateral raise
- Triceps movement

### Pull B

- Supported horizontal row
- Vertical pull
- Rear-delt movement
- Upper-back isolation
- Biceps movement

### Jump / Elastic

- Dynamic preparation
- Sprint mechanics
- Progressive submaximal jumps
- Limited max-effort approach jumps

Every exercise belongs to an explicit movement family and equipment profile. Phoenix may substitute only within the same family and only with available equipment. It may not invent an exercise or move across unrelated families.

## Adaptive Planning

Training constitution version `2` gains a `performance_hybrid` program definition. Planner version `adaptive-v2` consumes sequence intent rather than relying on fixed weekday session types.

For every weekly proposal, Phoenix:

- projects the next incomplete sequence sessions;
- places recovery according to current evidence;
- checks calendar hard conflicts;
- preserves at least 36 hours between high-neural lower sessions and targets 48 hours between Lower Power and Jump / Elastic;
- applies equipment constraints and movement-family substitutions;
- uses actual load, repetitions, target repetitions, RPE, pain flags, and completion status as progression evidence;
- keeps weekly volume increases inside the constitution cap;
- reduces or removes lower-priority work when time or fatigue requires it;
- records every placement, reduction, replacement, and progression reason in the immutable plan receipt.

Readiness can preserve the planned session, reduce sets or load, remove explosive work, substitute within a movement family, or route the day to recovery. Sharp pain, limping, and next-day worsening continue to fail closed.

## Phase Behavior

The hybrid structure applies during normal accumulation and strength phases. Phoenix changes exposure without changing the program identity:

- Accumulation emphasizes Push/Pull volume and moderate Lower Power work.
- Strength emphasizes the primary Push/Pull compounds and lower-body force production.
- Deload reduces total work and removes low-priority accessories.
- Peak removes heavy lower lifting and keeps Push/Pull at maintenance volume.
- Attempt week prioritizes freshness and jump attempts; upper work remains optional maintenance only when recovery evidence permits it.

The dunk goal remains the higher-order constraint. Bodybuilding symmetry never overrides jump quality, pain rules, or peak freshness.

## Operational Data Flow

1. Calendar, active-plan lineage, completion history, readiness, equipment, and constitution are normalized into a typed planner snapshot.
2. The planner generates seven dated plan days from the current sequence position.
3. Hard validations check pain, calendar conflicts, recovery spacing, receipt integrity, and unique dates.
4. Shadow replay must reproduce the identical plan and receipt.
5. An accepted active plan becomes the only source for WEEK and START SESSION.
6. The user records actual sets, RPE, pain evidence, and notes.
7. Completion evidence advances sequence state and informs the next proposal.

Legacy plan receipts remain readable and immutable. Existing active plans are not silently rewritten. The first hybrid plan starts under the new planner and constitution versions with explicit lineage.

## Interface Design

Training retains its premium orange visual system and current navigation.

### Main Training Screen

- `START SESSION` remains the primary action.
- `READINESS` remains the evidence gate.
- The main screen shows today's selected session and sequence position without adding another dashboard card.

### Training Control Room

- Keep the four tabs: `WEEK`, `ADAPT`, `HISTORY`, and `RULES`.
- Do not add a separate Program tab.
- `WEEK` becomes the authoritative hybrid sequence surface.
- The top sequence rail shows seven dated week slots containing six ordered training intents plus the Phoenix-placed recovery day, with lifecycle state and cycle position.
- Today's mission appears below the rail with exact exercises and targets.
- A compact Phoenix Decision panel explains why recovery moved, why volume changed, and which evidence drove the decision.
- `ADAPT` previews before/after placement and exercise changes.
- `HISTORY` shows immutable plans and actual session evidence.
- `RULES` exposes the public recovery, pain, equipment, progression, and phase constraints.

The layout follows the approved mockup in `.superpowers/brainstorm/570-1784891915/content/hybrid-week-layout.html`.

### Visual Contract

- Preserve the existing dark instrument surface, orange domain accent, compact monospace telemetry, and restrained glow.
- Use orange for Training identity and active focus, amber for high-neural attention, and semantic validation colors only for validated states.
- Keep cards square or lightly rounded, avoid nested decorative cards, and preserve dense scan-friendly hierarchy.
- Desktop presents the seven-step rail in one row.
- Mobile presents stable two-column or horizontal-snap sequence geometry without clipped labels or overlapping actions.
- Reduced-motion mode removes nonessential transitions without hiding state.

## Failure Behavior

- Missing authoritative calendar evidence blocks plan generation rather than assuming an empty calendar.
- Missing active plan reports `plan_required` and routes to ADAPT.
- Missing readiness blocks high-neural START SESSION.
- Malformed or incomplete completion evidence does not advance the sequence.
- Session write failure preserves the local completion form and allows an idempotent retry.
- No valid equipment substitute routes the affected block to an explicit unavailable or reduced state.
- Invalid, stale, or unreplayable receipts never become authoritative.

## Testing And Promotion

Implementation follows test-driven development.

Backend coverage must include:

- deterministic sequence advancement;
- movable recovery placement;
- 36-hour hard and 48-hour preferred lower-body spacing;
- missed-session behavior without doubled work;
- session compression;
- movement-family and equipment-safe substitution;
- readiness and pain routing;
- actual-performance progression;
- deload, peak, and attempt behavior;
- legacy receipt compatibility;
- replay and promotion-gate integrity.

Frontend coverage must include:

- WEEK sequence normalization and lifecycle states;
- Phoenix Decision explanations sourced from real plan evidence;
- plan-required and readiness-required fail-closed states;
- stable desktop and mobile geometry;
- keyboard, focus, and reduced-motion behavior;
- no fixture sessions or hard-coded weekly labels in production paths.

Visual QA is required at 1440x900 and 390x844 for the main Training screen, WEEK, ADAPT, readiness, active session, and completion check.

The planner first deploys in shadow mode. Promotion to live requires deterministic real-plan replay, complete fixture coverage, healthy calendar authority, no side effects, and a successfully recorded real hybrid session.

## Acceptance Criteria

The feature is complete when Phoenix can autonomously generate, explain, adapt, and progress the six-day performance hybrid; the user can execute the exact routed session and record truthful results; every decision remains evidence-backed and auditable; the orange Training experience matches the approved visual quality; and unsafe or stale inputs fail closed.
