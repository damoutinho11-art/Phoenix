# Task 7 Report: Authoritative Hybrid Week View

## Status

DONE

## Commit

`feat(training): present authoritative hybrid week`

## Implementation

- Added `buildHybridWeekPresentation(plan, todayIso)` as a pure, fail-closed receipt presentation boundary.
- Accepts only a seven-day consecutive horizon with unique valid ISO dates.
- Maps only the six approved hybrid intents to user-facing labels.
- Preserves receipt sequence, duration, neural-load, exercise, and decision evidence without deriving session identity from dates or position.
- Suppresses all Phoenix decision rows when any decision-reason evidence is malformed.
- Preserves legacy plans as neutral, explicitly unverified session identities.
- Rebuilt WEEK into the approved hierarchy:
  1. existing plan metadata;
  2. `ACTIVE SEQUENCE` seven-slot rail;
  3. `TODAY'S MISSION`;
  4. `PHOENIX DECISION`;
  5. existing validation summary.
- Preserved loading, error, empty, legacy, keyboard-scroll, and semantic section behavior.
- Added Task 8-ready structural class names without changing CSS ownership.

## TDD Evidence

1. The new model test failed with `ERR_MODULE_NOT_FOUND`.
2. The first implementation exposed malformed mixed reasoning as partially authoritative; the model was tightened until the test passed.
3. The component hierarchy contract failed against the previous WEEK implementation.
4. The rebuilt component passed the hierarchy and legacy/accessibility contracts.
5. A consecutive-horizon regression was added and observed failing before the model rejected gapped receipts.

## Verification

- Focused Task 7:
  - `node --test src/components/holo/subs/trainingHybridWeekViewModel.test.js src/components/holo/subs/trainingControlRoomContract.test.js`
  - `25 passed`
- Broader Training frontend:
  - `node --test src/components/holo/subs/trainingHybridWeekViewModel.test.js src/components/holo/subs/trainingControlRoomContract.test.js src/components/holo/subs/trainingAdaptViewModel.test.js src/components/holo/subs/trainingPlannerViewModel.test.js src/components/holo/subs/trainingSessionModel.test.js src/components/holo/trainingLive.test.js src/components/holo/trainingLiveIntegration.test.js`
  - `64 passed`
- Production frontend build:
  - `npm run build`
  - Vite completed successfully; existing large-chunk advisory remains.
- `git diff --check`
  - Passed.

## Scope

Task 7 changed only the five frontend files named in the brief plus this report. It did not edit backend code, CSS, or Finance. Pre-existing unrelated worktree changes in `jarvis/domains/finance/portfolio_state.json` and `jarvis/domains/training/tests/test_plan_acceptance.py` remain untouched and unstaged.

## Concerns

- Task 8 still owns responsive and premium orange CSS for the new structural classes and browser visual QA.

## Review Follow-Up

Commit: `fix(training): validate authoritative hybrid week`

Resolved all three Important review findings:

1. Hybrid receipts now require exact intent-to-position coherence, unique positions, and cyclic date ordering. Ordinary plans require six sessions plus one recovery. Peak and attempt plans are accepted only when the Lower Power position is replaced by a second recovery and the complete phase-specific receipt reasons reconstruct the six-position cycle.
2. Recovery lifecycle takes precedence over the calendar `today` marker. A recovery slot remains the neutral recovery mission when it is today's slot.
3. Any non-string decision reason suppresses all reason evidence for the presentation, including every slot and the Phoenix Decision panel.

TDD evidence:

- Malformed duplicate intent/position/order tests failed against the original Task 7 implementation, then passed after sequence validation.
- Peak/attempt mode tests failed because no phase exception semantics existed, then passed with exact backend receipt matching.
- Today's recovery test failed with lifecycle `today`, then passed with lifecycle `recovery`.
- Mixed valid/non-string reasoning failed because other slots retained reasons, then passed after global evidence suppression.

Fresh verification:

- Focused Task 7: `27 passed`.
- Broader Training frontend: `66 passed`.
- `npm run build`: passed with the existing large-chunk advisory.
- Scoped `git diff --check`: passed.

The follow-up did not edit or stage Task 6 backend files or Finance.
