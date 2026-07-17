# Task 7 Report: Frontend API and Planner View Model

## Status

Implemented. The owned frontend client and view-model changes are ready for the Task 8 consumer work.

## Files

- `pwa/src/api/client.js`
- `pwa/src/components/training/trainingPlannerViewModel.js`
- `pwa/src/components/training/trainingPlannerViewModel.test.js`

## RED Evidence

1. `cd pwa && node --test src/components/training/trainingPlannerViewModel.test.js`
   - Result: failed with `ERR_MODULE_NOT_FOUND` for `trainingPlannerViewModel.js`.
   - Expected failure: the new view model did not exist.
2. After adding the view model, the planner-client test initially could not load `client.js` under Node because its existing `import.meta.env.VITE_API_URL` access assumed Vite. The client now uses the same localhost fallback through optional chaining; this leaves Vite behavior unchanged and makes the focused Node contract test executable.
3. The planner-client route test then failed with `TypeError: trainingClient.getTrainingCurrentPlan is not a function`.
   - Expected failure: lifecycle client exports were absent.
4. A direct FastAPI boundary check showed that the brief's bare JSON-string POST becomes a request-validation `422` without `Content-Type: application/json`.
5. After requiring the JSON header in the client test, it failed because the POST options omitted that header.
   - Expected failure: proposal creation was not browser-compatible with FastAPI's JSON request parsing.

## GREEN Evidence

1. `cd pwa && node --test src/components/training/trainingPlannerViewModel.test.js`
   - Result: `5` helper tests passed after the initial view-model implementation.
2. `cd pwa && node --test src/components/training/trainingPlannerViewModel.test.js src/components/training/trainingViewModel.test.js`
   - Result: `11 passed, 0 failed` after lifecycle client functions and the JSON header were added.
3. Direct backend boundary check with `Content-Type: application/json`
   - Result: request passed JSON parsing and reached the expected unseeded `503 Training plan calendar evidence unavailable` gate rather than failing Pydantic body validation.
4. `cd pwa && npm run build`
   - Result: passed. Vite production build completed successfully.
5. `git diff --check`
   - Result: clean.

## Implementation

- Added all seven training-plan lifecycle client functions with URI-encoded proposal IDs.
- Proposal creation serializes the caller payload and explicitly sets `Content-Type: application/json`, matching the existing client convention and FastAPI's required request contract.
- Added a pure plan normalizer that preserves received fields, chronologically orders only received day rows, exposes hard failed validations, and permits apply only for an unblocked proposed plan.
- Added a pure changed-day diff that handles missing or malformed day collections as empty and does not manufacture days.
- Added Node coverage for normalization ordering, hard-block eligibility and tone, changed days, partial payload behavior, malformed day collections, and every lifecycle route/method/payload boundary.

## Self-Review

- Changes are confined to the three owned PWA implementation/test files.
- No UI component or unrelated application behavior was modified.
- The normalizer does not create plans, days, validations, or backend field values; it only supplies empty collections for unusable collection fields and fails closed for apply eligibility outside `proposed` status.
- Hard validation truth is derived only from explicit `severity: 'hard'` and `passed: false` rows.
- The optional `import.meta.env` access retains the existing browser/Vite URL behavior while allowing the required Node test runner fallback.

## Concerns

- `cd pwa && npm test` remains red with `58 passed, 1 failed`. The unrelated failure is `src/components/holo/financeControlRoomContract.test.js:129`, whose assertion expects `orbitSize` while current `HoloWings.jsx` uses `donutSize`. This task does not modify either finance file.
- The task brief names `pwa/src/components/holo/subs/trainingPlannerViewModel.js`, while the direct task ownership instruction names `pwa/src/components/training/trainingPlannerViewModel.js`. The implementation follows the direct ownership instruction. Task 8's import should use the `components/training` path or introduce an explicit owned adapter in that later task.

## Review Fix (2026-07-17)

- Moved `trainingPlannerViewModel.js` and its test to the required `pwa/src/components/holo/subs/` path and removed the obsolete `pwa/src/components/training/` copies. There were no consumer imports to update.
- Added RED/GREEN regressions proving a proposed plan stays ineligible when `validations` is missing, null, empty, or malformed. `canApply` now requires a non-empty array of complete `{ rule, passed, severity, detail }` validation rows and no failed hard validation. Active and other non-proposed states remain ineligible.
- Added a diff regression proving that populated prior days missing from absent, malformed, or incomplete `after.days` are returned as explicit `{ ...day, removed: true }` changed-day rows.
- Verification: `node --test src/components/holo/subs/trainingPlannerViewModel.test.js` passed 9/9; the required Task 7 pair with `src/components/training/trainingViewModel.test.js` passed 14/14; `npm run build` passed.
- Full PWA verification remains `61 passed, 1 failed`, solely the pre-existing Finance `orbitSize` assertion at `src/components/holo/financeControlRoomContract.test.js:129`; `HoloWings.jsx` still declares `donutSize`. No Finance files were changed.

## Review Fix 2 (2026-07-17)

- Added RED coverage proving proposed plans with missing, empty, whitespace-only, or non-string `plan_id` values have `canApply === false`.
- Updated the positive proposed-plan fixture with `plan_id: 'p1'` and preserved the trimmed normalized `plan_id` in the view-model output for endpoint use.
- `canApply` now requires a non-empty trimmed string ID in addition to the existing proposed-status, complete-validation, and no-hard-failure requirements.
- Focused view-model verification: `10 passed, 0 failed`.
- Required Training pair verification: `15 passed, 0 failed`.
- `npm run build`: passed. Full PWA verification remains `62 passed, 1 failed`, solely the pre-existing Finance `orbitSize` assertion at `src/components/holo/financeControlRoomContract.test.js:129`; no Finance files were changed.
- Repository-wide `python -m pytest -q` exceeded the 120-second command limit without completing; no result was available to attribute to this change.
