# Task 8 Report: Orange Training Control Room

## Status

Implemented the read-only Training Control Room shell and its Week, History, and Rules views. ADAPT is present only as an unavailable channel; proposal/apply behavior and cockpit wiring remain owned by Task 9.

## Delivered

- `TrainingControlRoom({ onClose })` with independent Task 7 API loading, settled endpoint failures, Escape close, dialog semantics, and roving keyboard tabs.
- Loading, endpoint error, empty horizon, empty history, empty rules, and active plan states.
- Exactly seven deterministic Week cells with active/proposed metadata, changed-day markers, objective, duration, movements, and validation detail.
- History ledger with plan version, lifecycle status, timestamps, parent/supersession links, reason summary, and validation status.
- Readable public Rules sections for objective, recovery spacing, adaptation limits, movement families, preferences, and temporary constraints. Raw planner JSON is never rendered.
- Orange Training-scoped responsive CSS with sharp HUD borders, stable desktop/mobile geometry, visible focus, reduced motion, and internal scrolling.

## TDD Evidence

### Initial RED

Command:

```text
cd pwa
node --test src/components/holo/subs/trainingControlRoomContract.test.js
```

Result: 0 passed, 7 failed. Failures were the expected `ENOENT` errors for the three missing Task 8 components plus the missing Training CSS contract.

### State RED/GREEN

Self-review found that rejected endpoints could render error and empty states together because child views inferred empty state only from `null` or `[]`. A new contract failed until endpoint errors were passed explicitly and the documented no-active-plan response was classified as an empty horizon.

Result after fix: 7 passed, 0 failed.

### Mobile RED/GREEN

Browser QA at 390 x 844 found the desktop entrance animation retaining `translate(-50%, -50%)` over the mobile top/left placement. The measured shell started at `left: -180px`, `top: -383px`. A failing mobile contract was added before disabling that transform animation at the breakpoint.

Result after fix: 7 passed, 0 failed. The shell then measured `left: 8px`, `top: 8px`, `right: 383px`, `bottom: 791px` with no page-level horizontal overflow.

## Verification

### Training PWA

```text
node --test src/components/training/trainingViewModel.test.js src/components/training/trainingUiContract.test.js src/components/holo/subs/trainingPlannerViewModel.test.js src/components/holo/subs/trainingControlRoomContract.test.js
```

Result: 26 passed, 0 failed.

### Build

```text
npm run build
```

Result: PASS. Vite transformed 313 modules and generated the PWA service worker. Existing chunk-size warning remains for a 670.52 kB chunk.

### Full PWA

```text
npm test
```

Result: 69 passed, 1 failed. The sole failure is the known Finance contract at `src/components/holo/financeControlRoomContract.test.js:117`, which expects `/orbitSize/` in `HoloWings.jsx`. The same failure existed at baseline before Task 8 (62 passed, 1 failed).

### Responsive QA

- Desktop 1440 x 900: seven cells rendered at 160px each; the 1161 x 639 shell remained inside the viewport with no page overflow.
- Mobile 390 x 844: two-column tabs, seven stable 118px CSS tracks, internal Week horizontal scrolling, and no page overflow.
- Mobile History: two lifecycle rows at the full 354px content width with no horizontal overflow.
- Mobile Rules: five readable policy sections at the full 344px content width with vertical body scrolling and no horizontal overflow.

## Self-Review

- No cockpit action or Task 9 adaptation behavior was added.
- `ActiveSession.jsx` was not touched.
- `financeReadability` and Finance color tokens are not used.
- The CSS addition is large because it owns the complete shell and three dense responsive views, but it is confined to `training-*` selectors and feature media rules. Duplicate-selector review found only intentional mobile/reduced-motion overrides and grouped declarations, not repeated feature blocks.
- Preview-only QA files and temporary servers were removed before final verification.
- Controller-owned `.superpowers/sdd/task-7-report.md` was neither modified by this task nor included in staging.

## Concerns

- The full PWA remains red only for the documented pre-existing Finance contract failure.
- Task 9 must wire the cockpit entry and replace the inert ADAPT panel with the proposal/apply flow.

## Review Fix

### Status

Resolved all Task 8 review findings within the Task 8 components, behavioral contract test, pure view-model helper, and scoped Training CSS. Task 9 wiring and `ActiveSession.jsx` remain untouched.

### Behavior Changes

- Validation presentation now derives from failed checks: failed hard checks are blocked/red, other failed checks are warning/yellow, and plans without failures are validated/green. Passed warning-severity checks remain green.
- Changed days retain an explicit change marker while their border, marker, and reason color follow the plan validation tone instead of becoming green merely because they changed.
- History displays stable `plan_id` values rather than invented ordinal versions. Active is the only lifecycle labeled current; proposed, rejected, completed, and superseded rows use status-aware lineage copy, and superseded links come only from persisted `superseded_by` values.
- The dialog now contains Tab and Shift+Tab focus, closes on Escape, restores the previously focused trigger on unmount, locks body scrolling while open, and restores the previous body overflow value.
- Week normalization returns exactly seven slots without duplicating a dated day into a missing date.
- Loading, error, empty, and ready selectors come from one pure view-state model so error and empty presentations remain mutually exclusive.

### TDD Evidence

The revised contract suite began with 9 expected failures for missing helper behavior and integration. After adding the pure helper module, 6 behavioral tests passed while 3 source integration/CSS contracts remained red. Wiring the components and scoped CSS produced 9 passed, 0 failed.

Focused Training verification:

```text
node --test src/components/training/trainingViewModel.test.js src/components/training/trainingUiContract.test.js src/components/holo/subs/trainingPlannerViewModel.test.js src/components/holo/subs/trainingControlRoomContract.test.js
```

Result: 28 passed, 0 failed.

Build verification:

```text
npm run build
```

Result: PASS. Vite transformed 313 modules and generated the PWA service worker. The existing 670.52 kB chunk-size warning remains.

Full PWA verification:

```text
npm test
```

Result: 71 passed, 1 failed. The unchanged failure is the pre-existing Finance `orbitSize` source contract at `src/components/holo/financeControlRoomContract.test.js:117`.

### Browser QA

Browser QA scaffolding was created locally, but interactive verification was stopped before completion at the user's direction. All temporary QA entries, config, logs, and QA server processes were removed before staging.

## Review Fix 2

### Status

Resolved the remaining Task 8 High and Medium findings within the Training Control Room view model, History view, Week validation presentation, scoped Training CSS, and contract test. Task 9 wiring and `ActiveSession.jsx` remain untouched.

### Behavior Changes

- Missing, empty, or malformed validation evidence now renders as neutral `UNVERIFIED`. Green `VALIDATED` requires at least one complete validation record and every validation to pass. Changed-day styling follows that neutral state until evidence is complete.
- History now receives the current endpoint `plan_id` from `TrainingControlRoom`. Only the matching active history row receives current language; old active rows from other cycles remain `ACTIVE` with no current label.
- Lifecycle status styling uses only the Training orange or neutral palette. Green, yellow, and red remain exclusive to passed, warning, and blocked validation evidence.
- Existing modal focus containment, Escape handling, scroll lock, and focus restoration were preserved.

### TDD Evidence

The focused Task 8 contract was intentionally red with 6 expected failures: empty validation evidence appeared validated, active historical rows were all marked current, the current plan ID was not passed to History, unverified changed days had no neutral styling, and lifecycle selectors still used semantic colors.

After the smallest view-model, component, and CSS changes, the focused contract passed 11/11.

### Verification

Focused Task 8:

```text
node --test src/components/holo/subs/trainingControlRoomContract.test.js
```

Result: 11 passed, 0 failed.

Training scope:

```text
node --test src/components/training/trainingViewModel.test.js src/components/training/trainingUiContract.test.js src/components/holo/subs/trainingPlannerViewModel.test.js src/components/holo/subs/trainingControlRoomContract.test.js
```

Result: 30 passed, 0 failed.

Build:

```text
npm run build
```

Result: PASS. Vite transformed 313 modules and generated the PWA service worker. The existing 670.52 kB chunk-size warning remains.

Full PWA:

```text
npm test
```

Result: 73 passed, 1 failed. The unchanged failure is the pre-existing Finance `orbitSize` source contract at `src/components/holo/financeControlRoomContract.test.js:117`.

### Concerns

- Task 10 follow-up, low priority: browser-level verification should exercise the Training Control Room through its real mount/unmount lifecycle alongside any nested overlay. The existing focus trap and restoration behavior remains covered by the Task 8 source contract; no QA temporary files were created for this review fix.

## Review Fix 3

### Status

Resolved the final Task 8 semantic color violation within the owned Training CSS and contract test. Endpoint/service failures now use Training orange/neutral treatment; red remains limited to validation hard-block selectors.

### Behavior Changes

- `.training-plan-error` now uses `--training-accent` and neutral body mixing for its border, text, and background instead of `--phx-danger`.
- The Training CSS contract scans every declaration block containing `--phx-danger` and fails if its selector is outside the validation hard-block set.

### TDD Evidence

The new contract was red first: 11 passed, 1 failed on `.training-plan-error` escaping validation red scope. After the CSS-only correction, the focused contract passed 12/12.

### Verification

Focused Task 8:

```text
node --test src/components/holo/subs/trainingControlRoomContract.test.js
```

Result: 12 passed, 0 failed.

Training scope:

```text
node --test src/components/training/trainingViewModel.test.js src/components/training/trainingUiContract.test.js src/components/holo/subs/trainingPlannerViewModel.test.js src/components/holo/subs/trainingControlRoomContract.test.js
```

Result: 31 passed, 0 failed.

Build:

```text
npm run build
```

Result: PASS. Vite transformed 313 modules and generated the PWA service worker. The existing 670.52 kB chunk-size warning remains.

Full PWA:

```text
npm test
```

Result: 74 passed, 1 failed. The unchanged failure is the pre-existing Finance `orbitSize` source contract at `src/components/holo/financeControlRoomContract.test.js:117`.

### Concerns

- Full PWA verification remains red only for the documented pre-existing Finance contract failure.
- `.superpowers/sdd/task-7-report.md` was left untouched and unstaged.
