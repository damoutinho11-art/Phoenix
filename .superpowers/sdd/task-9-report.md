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
