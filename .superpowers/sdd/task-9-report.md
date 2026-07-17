# Task 9 Report: Adaptation Preview, Apply Flow, and Cockpit Entry

## Status

Implemented and committed after scoped verification. The Task 7 report modification was preserved and not staged.

## Owned Files

- `pwa/src/components/holo/subs/TrainingAdaptView.jsx`
- `pwa/src/components/holo/subs/TrainingControlRoom.jsx`
- `pwa/src/components/holo/subs/trainingControlRoomContract.test.js`
- `pwa/src/components/holo/HoloCommand.jsx`
- `pwa/src/components/holo/holoDomains.js`
- `pwa/src/components/holo/holo.css`
- `.superpowers/sdd/task-9-report.md`

## RED Evidence

1. `cd pwa && node --test src/components/holo/subs/trainingControlRoomContract.test.js`
   - Result: `12` passed, `2` failed.
   - Expected failures observed:
     - `cockpit keeps start primary and adds adapt week second` failed because `ADAPT WEEK` was absent from `holoDomains.js`.
     - `adapt view previews before apply and blocks hard failures` failed with `ENOENT` because `TrainingAdaptView.jsx` did not exist.
2. After the initial implementation, the inherited Training CSS contract failed because preview summary and changed-day status used `--phx-danger` outside the established validation-hard-block selector scope.
   - Root cause: Task 8's Training color contract reserves danger red for explicit validation rows.
   - Fix: kept hard safety failures red in the every-validation list and made summary statuses neutral; the inherited contract then passed.
3. `cd pwa && node --test src/components/holo/subs/trainingControlRoomContract.test.js`
   - Added the mobile-stack contract before its CSS implementation.
   - Result: `14` passed, `1` failed because no narrow-screen rule stacked the quick-action and intent fields.

## GREEN Evidence

1. Exact Task 9 verification:

   ```powershell
   cd pwa
   node --test src/components/holo/subs/trainingControlRoomContract.test.js src/components/holo/subs/trainingPlannerViewModel.test.js src/components/training/trainingUiContract.test.js
   npm run build
   ```

   - Result: `29 passed, 0 failed`; Vite production build succeeded.
2. Full Training-focused frontend verification:

   ```powershell
   cd pwa
   node --test src/components/training/trainingViewModel.test.js src/components/training/trainingUiContract.test.js src/components/holo/subs/trainingControlRoomContract.test.js src/components/holo/subs/trainingPlannerViewModel.test.js
   ```

   - Result: `34 passed, 0 failed`.
3. Full PWA baseline:

   ```powershell
   cd pwa
   npm test
   ```

   - Result: `77 passed, 1 failed`.
   - The sole failure is the documented unrelated Finance contract at `src/components/holo/financeControlRoomContract.test.js:129`: it expects `orbitSize`, while `HoloWings.jsx` currently declares `donutSize`.
4. `git diff --check`
   - Result: clean; Git printed only existing CRLF normalization warnings.

## Implementation

- Added `ADAPT WEEK` directly after primary `START SESSION`; it opens the `training-room` control-room sub-screen without changing `SessionSub` or `ActiveSession.jsx`.
- Replaced the ADAPT placeholder with Task 7 proposal lifecycle integration. MOVE, SKIP, and REPLACE create typed `constraints`; natural language sends `{ intent }` to the existing proposal route.
- Preview renders returned interpreted constraints, every validation, and Task 7 backend changed-day rows with date, before, after, reason, and validation status. Fallback diff rendering is read-only and uses the existing Task 7 view model.
- Apply remains unavailable unless Task 7 marks the proposal eligible and there are no failed hard validations. Reject calls the real lifecycle endpoint and clears only the proposal preview. Apply updates the active week and returns to WEEK.
- New preview headings receive focus when a proposal arrives. The existing orange holographic training theme is retained, and narrow screens stack the quick-action and intent fields while keeping diff rows horizontally scrollable with stable dimensions.

## Self-Review

- Confirmed all proposal requests use the existing Task 7 client exports and no endpoint was invented.
- Confirmed the conversational flow can only create a preview; only the existing apply endpoint activates a plan.
- Confirmed hard validation failure disables `APPLY PLAN`, rejected proposals are cleared only after the reject request succeeds, and API failures leave the active plan untouched.
- Confirmed the modified and new files are within Task 9 ownership. `.superpowers/sdd/task-7-report.md` remains an unrelated unstaged user change.
- Browser-based visual inspection was attempted against a verified Vite HTTPS server at `https://127.0.0.1:5178`, but the in-app browser could not reach the desktop localhost listener from its separate network context. Responsive layout is covered by the mobile CSS contract; manual browser pixel QA remains the only unperformed check.

## Concerns

- The known Finance `orbitSize` contract failure remains outside Task 9 scope.
- The Vite build emits its existing chunk-size warning for a minified chunk larger than 500 kB.
- Desktop/mobile screenshot QA could not run because of the in-app browser localhost network boundary, not an application runtime/build failure.

## Review Fix

### Scope

- Added the scoped `trainingAdaptViewModel.js` and `trainingAdaptViewModel.test.js` files for fail-closed proposal evidence, lifecycle transitions, and inspectable changed-day descriptions.
- Updated `TrainingAdaptView.jsx`, `TrainingControlRoom.jsx`, `trainingControlRoomViewModel.js`, and the existing Task 9 control-room contract test. No SessionSub, ActiveSession, Finance, `progress.md`, or Task 7 report file was changed or staged.

### RED Evidence

1. Added `pwa/src/components/holo/subs/trainingAdaptViewModel.test.js`, then ran:

   ```powershell
   cd pwa
   node --test src/components/holo/subs/trainingAdaptViewModel.test.js
   ```

   - Result: expected RED, `ERR_MODULE_NOT_FOUND` for `trainingAdaptViewModel.js`.
   - The new tests covered malformed `[null]` validations, non-empty usable interpreted constraints, reconciled non-empty changed-day evidence, stale preview reset, apply/reject success and failure lifecycle state, and REPLACE exercise details.
2. Added the component wiring and tab-focus contracts, then ran:

   ```powershell
   cd pwa
   node --test src/components/holo/subs/trainingControlRoomContract.test.js
   ```

   - Result: expected RED, `14 passed, 3 failed`.
   - Failures required `normalizeTrainingAdaptProposal` lifecycle wiring, `getTrainingTabIndex`, and deterministic WEEK tab focus after apply.

### GREEN Evidence

1. Focused review-fix contracts:

   ```powershell
   cd pwa
   node --test src/components/holo/subs/trainingAdaptViewModel.test.js src/components/holo/subs/trainingControlRoomContract.test.js
   ```

   - Result: `22 passed, 0 failed`.
2. Full Training PWA tests:

   ```powershell
   cd pwa
   node --test src/components/training/trainingViewModel.test.js src/components/training/trainingUiContract.test.js src/components/holo/subs/trainingAdaptViewModel.test.js src/components/holo/subs/trainingControlRoomContract.test.js src/components/holo/subs/trainingPlannerViewModel.test.js
   ```

   - Result: `41 passed, 0 failed`.
3. Full PWA suite:

   ```powershell
   cd pwa
   npm test
   ```

   - Result: `84 passed, 1 failed`.
   - Sole failure: the known unrelated Finance contract at `src/components/holo/financeControlRoomContract.test.js:129`, which expects `orbitSize` while `HoloWings.jsx` declares `donutSize`.
4. Production build and whitespace check:

   ```powershell
   cd pwa
   npm run build
   git -C .. diff --check
   ```

   - Result: Vite production build succeeded; `git diff --check` was clean. The build retained only the pre-existing chunk-size warning.

### Behavior Fixed

- Proposal normalization filters unusable validation, constraint, and changed-day rows, renders only safe arrays, and marks malformed evidence unverified. Apply is fail-closed unless Task 7 eligibility, complete validations, at least one usable interpreted constraint, and a non-empty before/after-reconciled changed-day diff all hold.
- A new proposal request clears the current preview before the network call, so a failed retry cannot leave an earlier proposal actionable.
- REPLACE preview cells now show objective, duration, and the explicit before/after exercise names.
- Successful Apply moves focus to the WEEK tab; successful Reject restores focus to the ADAPT tab. Failed apply/reject requests retain the proposal for review and show their existing error states.

### Review Self-Check

- Confirmed every preview collection is guarded before rendering and `[null]` validation evidence cannot reach `.some` or `.map` unsafely.
- Confirmed missing diff evidence is no longer synthesized into an eligible preview; Task 7 client routes remain unchanged.
- Confirmed the focused tests exercise the pure state transitions that the two views consume, plus source contracts that verify those helpers are wired into the UI.

## Review Fix 2

### Router Contract Verified

- Inspected `jarvis/api/routers/training.py` before changing the frontend boundary. Its `_validated_constraint` accepts exactly: `unavailable`, `move_session`, `skip_session`, `replace_exercise`, `time_limit`, `equipment_available`, and `exercise_preference`.
- The client mirrors the router's required date/text fields, `time_limit` integer range of `15..180`, non-empty equipment lists, `avoid|prefer`, and optional dates only for equipment and preference constraints. It intentionally does not attempt the server-only planning-horizon check.

### RED Evidence

1. Added the trust-boundary cases to `trainingAdaptViewModel.test.js`, then ran:

   ```powershell
   cd pwa
   node --test src/components/holo/subs/trainingAdaptViewModel.test.js
   ```

   - Result: expected RED, `5 passed, 4 failed`.
   - The failures proved that object-valued changed-day reasons remained in preview rows, top-level/after plan identity mismatches could still apply, malformed rollover dates and incomplete constraints were accepted, and `getAppliedTrainingPlanOutcome` did not exist.
2. Added the component contract for the apply-response helper, then ran:

   ```powershell
   cd pwa
   node --test src/components/holo/subs/trainingControlRoomContract.test.js
   ```

   - Result: expected RED, `16 passed, 1 failed` because `TrainingAdaptView` did not import or use `getAppliedTrainingPlanOutcome`.

### GREEN Evidence

1. Focused Task 9 review contracts:

   ```powershell
   cd pwa
   node --test src/components/holo/subs/trainingAdaptViewModel.test.js src/components/holo/subs/trainingControlRoomContract.test.js
   ```

   - Result: `26 passed, 0 failed`.
2. Full Training PWA suite:

   ```powershell
   cd pwa
   node --test src/components/training/trainingViewModel.test.js src/components/training/trainingUiContract.test.js src/components/holo/subs/trainingAdaptViewModel.test.js src/components/holo/subs/trainingControlRoomContract.test.js src/components/holo/subs/trainingPlannerViewModel.test.js
   ```

   - Result: `45 passed, 0 failed`.
3. Full PWA suite:

   ```powershell
   cd pwa
   npm test
   ```

   - Result: `88 passed, 1 failed`.
   - Sole failure: the documented unrelated Finance contract at `src/components/holo/financeControlRoomContract.test.js:129`, which expects `orbitSize` while `HoloWings.jsx` declares `donutSize`.
4. Production build and whitespace check:

   ```powershell
   cd pwa
   npm run build
   git -C .. diff --check
   ```

   - Result: Vite production build succeeded and `git diff --check` was clean. The only build note is the existing chunk-size warning.

### Behavior Fixed

- Changed-day `reason` and plan-day `change_reason` now accept only strings, null, or omission. Any object/non-string value is withheld from preview evidence and disables Apply, so it cannot reach a React child.
- A proposal is eligible only when its top-level proposed plan and `after` snapshot have the identical plan ID, days, validations, and constraints. Interpreted constraints must also match the authoritative `after.constraints`; otherwise preview evidence is withheld and Apply is disabled.
- The constraint validator now follows the Task 7 router's complete allowed-kind schema and exact round-trip ISO calendar validation. Unknown, incomplete, rollover-date, or semantically invalid constraints fail closed.
- A successful apply response must be an active, well-formed plan with the reviewed proposal ID before `onApplied`, preview clearing, and WEEK focus can occur. Invalid lifecycle evidence retains the proposal and reports a lifecycle-evidence error.

### Review Self-Check 2

- Confirmed the implementation preserves the existing Apply/Reject focus behavior; the new apply gate only permits the successful lifecycle transition after verified active-plan evidence.
- Confirmed no backend route, SessionSub, ActiveSession, Finance, Task 7 report, or `progress.md` file was changed or staged.

## Review Fix 3

### API Authority Verified

- Inspected `jarvis/api/routers/training.py`: `_proposal_projection` returns the active parent as `before` when one exists; otherwise it returns `before: null`. The top-level proposal projection and `after` are the same receipt projection.
- Safe bootstrap rule: only `parent_plan_id: null` with `before: null` is accepted as a root proposal. Any non-null parent ID requires a complete active parent snapshot whose `plan_id` is exactly that ID.

### RED Evidence

1. Added authority, parent, and calendar regressions, then ran:

   ```powershell
   cd pwa
   node --test src/components/holo/subs/trainingAdaptViewModel.test.js
   ```

   - Result: expected RED, `9 passed, 3 failed`.
   - The failures showed that year `0000` was accepted, no deterministic applied-plan authority comparator existed, and incomplete or mismatched `before` parent snapshots remained eligible.
2. Added the comparator source contract and ran:

   ```powershell
   cd pwa
   node --test src/components/holo/subs/trainingControlRoomContract.test.js
   ```

   - Result: expected RED, `16 passed, 1 failed` because `hasSameTrainingPlanAuthority` did not exist in the scoped adaptation view model.

### GREEN Evidence

1. Focused Task 9 review contracts:

   ```powershell
   cd pwa
   node --test src/components/holo/subs/trainingAdaptViewModel.test.js src/components/holo/subs/trainingControlRoomContract.test.js
   ```

   - Result: `29 passed, 0 failed`.
2. Full Training PWA suite:

   ```powershell
   cd pwa
   node --test src/components/training/trainingViewModel.test.js src/components/training/trainingUiContract.test.js src/components/holo/subs/trainingAdaptViewModel.test.js src/components/holo/subs/trainingControlRoomContract.test.js src/components/holo/subs/trainingPlannerViewModel.test.js
   ```

   - Result: `48 passed, 0 failed`.
3. Full PWA suite:

   ```powershell
   cd pwa
   npm test
   ```

   - Result: `91 passed, 1 failed`.
   - Sole failure: the documented unrelated Finance contract at `src/components/holo/financeControlRoomContract.test.js:129`, which expects `orbitSize` while `HoloWings.jsx` declares `donutSize`.
4. Production build and whitespace check:

   ```powershell
   cd pwa
   npm run build
   git -C .. diff --check
   ```

   - Result: Vite production build succeeded and `git diff --check` was clean. The existing chunk-size warning remains.

### Behavior Fixed

- `getAppliedTrainingPlanOutcome` now requires a complete active receipt and compares its authoritative fields deterministically against the reviewed `proposal.after`: plan and parent identity, constitution/planner versions, cycle, exact days and exercise content, constraints, validations, creation timestamp, and input/receipt hashes. Lifecycle-only status/reason/timestamp/supersession fields may differ.
- Same-ID apply responses with modified exercises, constraints, validations, cycle, or hashes retain the proposal and surface the existing lifecycle-evidence error rather than activating the response.
- Non-bootstrap proposal previews require a complete active `before` snapshot matching `parent_plan_id`; root proposals explicitly require the API's `null` parent and `null` before pairing. Parent constraints may be empty, matching the backend's valid root-plan contract.
- Exact calendar validation now rejects ISO year `0000`, matching Python `date.fromisoformat` behavior.

### Review Self-Check 3

- Confirmed the canonical comparison is a pure deterministic field-list helper with regressions for exercise, constraint, validation, cycle, hash, and allowed status-transition cases.
- Confirmed no unrelated source, backend, SessionSub, ActiveSession, Finance, Task 7 report, or `progress.md` file was changed or staged.

## Review Fix 4

### RED Evidence

1. Added the two parent-authority regressions, then ran:

   ```powershell
   cd pwa
   node --test src/components/holo/subs/trainingAdaptViewModel.test.js
   ```

   - Result: expected RED, `12 passed, 2 failed`.
   - Both failures proved that a top-level `parent_plan_id` differing from `after.parent_plan_id`, including a bootstrap-shaped top-level null parent paired with a non-null after parent, still left Apply eligible.

### GREEN Evidence

1. Focused Task 9 review contracts:

   ```powershell
   cd pwa
   node --test src/components/holo/subs/trainingAdaptViewModel.test.js src/components/holo/subs/trainingControlRoomContract.test.js
   ```

   - Result: `31 passed, 0 failed`.
2. Full Training PWA suite:

   ```powershell
   cd pwa
   node --test src/components/training/trainingViewModel.test.js src/components/training/trainingUiContract.test.js src/components/holo/subs/trainingAdaptViewModel.test.js src/components/holo/subs/trainingControlRoomContract.test.js src/components/holo/subs/trainingPlannerViewModel.test.js
   ```

   - Result: `50 passed, 0 failed`.
3. Production build and whitespace check:

   ```powershell
   cd pwa
   npm run build
   git -C .. diff --check
   ```

   - Result: Vite production build succeeded and `git diff --check` was clean. The existing chunk-size warning remains.

### Behavior Fixed

- `matchesAuthoritativeAfter` now delegates to the full deterministic `hasSameTrainingPlanAuthority` comparator instead of comparing a partial subset. Top-level and `after` parent identity, versions, cycle, hashes, days, constraints, and validations must all agree before a preview can be eligible.
- Added regressions for both mismatched non-bootstrap parent IDs and a null top-level bootstrap parent paired with a non-null `after` parent; both fail closed.

### Review Self-Check 4

- Confirmed this change touches only the scoped adaptation view-model, its regression test, and the Task 9 report. No other source or report file is staged.
