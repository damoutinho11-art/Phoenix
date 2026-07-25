# Task 8 Report: Hybrid Session Experience

## Status

DONE

## Commit

`feat(training): ship hybrid session experience`

## Implementation

- Added one strict frontend boundary for authoritative hybrid session evidence.
- The boundary accepts only the exact six approved intents with their matching position and sequence length.
- Main Training now presents the backend intent and `SEQUENCE NN OF 06` in the mission projection.
- Active Session shows the same plan-linked identity and position above the exercise queue.
- Completion payloads forward `session_intent`, `sequence_position`, and `sequence_length` exactly from the routed session.
- Genuine legacy sessions submit all three hybrid fields as `null`.
- Partial, malformed, or incoherent hybrid evidence fails closed and cannot be submitted as a verified completion.
- WEEK now uses the approved restrained orange seven-track desktop rail, two-column mobile geometry, compact mission/decision detail grid, stable active-session grid, focus treatment, and reduced-motion override.
- No exercise or date inference was added.

## TDD Evidence

The Task 8 tests were written before production changes. The first focused run produced six expected failures covering:

1. missing authoritative identity on the main Training projection;
2. missing legacy-neutral completion fields;
3. missing exact hybrid completion evidence;
4. missing malformed-evidence rejection;
5. missing active-session identity structure;
6. missing responsive visual selectors.

After the minimal implementation, the same focused command passed all 40 tests.

## Verification

- Focused Task 8:
  - `node --test src/components/holo/trainingLive.test.js src/components/holo/subs/trainingSessionModel.test.js src/components/holo/trainingLiveIntegration.test.js src/components/holo/subs/trainingControlRoomContract.test.js`
  - `40 passed`
- Broader Training frontend:
  - `node --test src/components/holo/subs/trainingHybridWeekViewModel.test.js src/components/holo/subs/trainingControlRoomContract.test.js src/components/holo/subs/trainingAdaptViewModel.test.js src/components/holo/subs/trainingPlannerViewModel.test.js src/components/holo/subs/trainingSessionModel.test.js src/components/holo/trainingLive.test.js src/components/holo/trainingLiveIntegration.test.js`
  - `74 passed`
- Production frontend:
  - `npm run build`
  - Vite completed successfully.
- `git diff --check`
  - Passed.

## Scope

Task 8 changed only its named frontend files and this report. Backend files, Task 6 work, and `jarvis/domains/finance/portfolio_state.json` were not edited or staged by Task 8.

## Concerns

- Browser visual QA is intentionally not claimed here; Task 9 owns the 1440x900 and 390x844 checks.
- Vite still emits the existing advisory for a minified chunk larger than 500 kB.
