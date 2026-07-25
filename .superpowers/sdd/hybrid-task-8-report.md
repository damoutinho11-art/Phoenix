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

## Review Follow-Up

Resolved all three Important review findings in a separate fix commit:

1. Status and routed-session provenance now require the same complete `plan_id` and `receipt_hash` before Training can present or open an authoritative mission. A mismatch clears both sources and renders Training unavailable. Refreshes also carry a monotonic request token, so an older response cannot overwrite a newer snapshot.
2. Every hybrid week slot is keyboard focusable, identifies today's slot with `aria-current="date"`, and has a descriptive accessible label. Training buttons, inputs, textareas, and selects now receive a clear orange `:focus-visible` outline, border, and restrained halo.
3. Hybrid WEEK detail and Active Session grids now collapse at `820px`, before their minimum tracks can overflow in the former 761–820px gap. The full Control Room chrome retains its existing 760px compact breakpoint.

TDD evidence:

- The review tests first failed in five expected places: provenance mismatch remained ready, reconciliation/request-order helpers were absent, slots were not focusable, Training controls lacked a general focus contract, and no 820px geometry rule existed.
- After the boundary fixes, the review-focused suite passed `38/38`.

Fresh verification:

- Review-focused frontend: `38 passed`.
- Broader Training frontend: `79 passed`.
- `npm run build`: passed with the existing large-chunk advisory.
- Scoped `git diff --check`: passed.

No backend or Finance file was edited or staged by this follow-up. Browser QA remains owned by Task 9.
