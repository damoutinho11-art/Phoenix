# Task 10 Report: Adaptive Planner Promotion Gate

> Review Fix 1 below supersedes the initial trust-model claims in the original implementation record.

Date: 2026-07-17
Branch: `codex/training-adaptive-planner`

## Scope

Implemented only the Task 10 backend and automated-test files:

- `jarvis/domains/training/plan_acceptance.py`
- `jarvis/domains/training/tests/test_plan_acceptance.py`
- `jarvis/api/routers/training.py`
- `jarvis/api/tests/test_training_plan_routes.py`
- `.superpowers/sdd/task-10-report.md`

The initial implementation did not record a Training design correction; Review Fix 1 corrects that conclusion and scope. `progress.md`, `ActiveSession.jsx`, Finance code, deployment settings, Railway, and Vercel variables were not changed.

## Implemented Gate

- Reconstructs JSON-serialized plan receipts through `WeeklyPlanReceipt.create` and rejects any plan ID, input hash, or receipt hash mismatch.
- Evaluates shadow evidence against planner `adaptive-v1`, constitution `1`, literal hard-validation success, pain-safe loaded/explosive work, 36-hour high-neural recovery spacing, one active/proposed plan per cycle, zero direct/session/calendar side effects, and all six required fixture categories.
- Produces a deterministic evidence ID and fixture summary from replay evidence.
- Defaults `PHOENIX_TRAINING_PLANNER_MODE` to `shadow`; invalid values also fail closed to shadow.
- Accepts promotion JSON only when `accepted` is literal `true`, versions match exactly, the evidence ID is non-blank, and the fixture summary contains positive counts.
- Marks shadow or unevidenced live proposals `authoritative=false` without activating them.
- Rejects shadow apply with 409 and unevidenced live apply with 503 before the database apply transaction.
- Leaves proposal/apply paths free of session-log and calendar-write side effects.

The initial shadow evaluator used caller `fixture_category` labels and zeroed `side_effects` counters. Review Fix 1 removes both from the trust contract and ignores those caller fields.

## TDD Evidence

RED checkpoints:

- Mandatory brief tests: collection failed with `ModuleNotFoundError: jarvis.domains.training.plan_acceptance`.
- Expanded domain gate: `12 failed, 12 passed`, covering acceptance JSON, fixture coverage, versions, pain, recovery, cycle uniqueness, side effects, and replay failure.
- API authority gate: `4 failed, 63 passed`, covering missing `authoritative`, shadow apply, and live acceptance gating.
- Empty JSON regression: `1 failed, 8 passed`; `{}` was incorrectly accepted before field checks were made unconditional.
- Literal hard-validation regression: `1 failed`; canonically hashed integer `0` was incorrectly accepted before hard checks required literal `True`.

GREEN checkpoints:

- `python -m pytest jarvis/domains/training/tests/test_plan_acceptance.py -q` -> `27 passed`.
- `python -m pytest jarvis/api/tests/test_training_plan_routes.py -q` -> `67 passed`.
- Exact backend command from the brief -> `320 passed`.
- Focused database regression -> `54 passed`.

## Broader Verification

- `npm test -- --run` -> `93 passed, 1 failed`. The sole failure is the documented pre-existing Finance contract expecting `orbitSize` in `HoloWings.jsx`; no Finance file was changed.
- `npm run build` -> exit 0; Vite transformed 320 modules and generated the PWA service worker. The existing large-chunk warning remains.
- `git diff --check` -> exit 0 before report creation; repeated before commit.

## Concerns And Handoff

- Version constants in the promotion gate must be updated deliberately when planner or constitution versions change; stale evidence will fail closed until then.
- The initial environment acceptance contract only checked a positive fixture summary. Review Fix 1 supersedes it with full evidence decoding and recomputation, exact six-category behavior coverage, and receipt-specific allowlisting.
- Browser QA, live shadow evidence collection, public replay, Railway/Vercel changes, deployment, and promotion to live were not performed. They remain controller-owned after review.
- No external deployment or environment variable was modified.

## Review Fix 1

### Corrected Contract And Scope

The critical review findings were valid. The initial implementation rebuilt receipts from output days, trusted caller fixture labels and zero counters, accepted arbitrary envelopes, and did not bind live apply to a specific accepted receipt. This fix expands the permitted Training ownership to:

- `jarvis/domains/training/plan_contracts.py`
- `jarvis/domains/training/adaptive_planner.py`
- `jarvis/domains/training/plan_acceptance.py`
- their focused Training tests
- `jarvis/api/routers/training.py` and route tests
- `jarvis/data/tests/test_database.py`
- the scoped Training Control Room CSS contract and `holo.css`
- `docs/superpowers/specs/2026-07-16-training-adaptive-planner-design.md`

The design spec now records the corrected Task 10 trust contract. New receipts persist a deeply immutable full constitution, typed `PlannerInputSnapshot`, and exact constraints. `input_hash` covers those consumed inputs. Replay invokes `generate_weekly_plan` and requires identical plan, input, output, validation, and receipt identities; legacy receipts without replay inputs fail closed.

Acceptance evidence now contains an authenticated compressed canonical bundle of every evaluated receipt and replay input, a behavior-inferred fixture summary, a five-field proposal allowlist, and a hashed pure-replay side-effect proof. `evidence_id` covers the complete evidence document. Environment acceptance decodes and recomputes the document and rejects any mismatch. Caller labels and counters are ignored.

Move, skip, equipment, fatigue, calendar, and pain coverage is inferred from typed inputs and demonstrated planner changes. Fatigue deload evidence now causes a constitution-bounded 40% session-minute reduction. Validation rows must be non-empty and exact; every current hard rule must be present and use literal boolean success. Live apply matches plan ID, planner version, constitution version, input hash, and receipt hash to one accepted allowlist row. Already-active apply returns before mode and acceptance gates.

The fixed Training Control Room layer is now `z-index: 91`, above the global bottom navigation at `90`; no orange styling changed.

### RED Evidence

- Canonical replay contract: collection failed because `PlannerInputSnapshot` did not exist.
- Replay/evidence trust suite: `21 failed, 7 passed`; replay did not call the planner, labels faked categories, allowlists/proofs were absent, and malformed validations were not classified.
- Compact full-evidence contract: collection failed because authenticated bundle decoding did not exist; the uncompressed evidence was 48,869 characters and exceeded the Windows environment limit.
- Route lifecycle gate: `10 failed, 61 passed`; parent rebinding dropped replay inputs, wrong evidence applied, malformed validations applied, and active idempotency was gated by mode.
- Narrow frontend layer contract: `17 passed, 1 failed` with Training layer `79` below bottom navigation `90`.

### GREEN Evidence

- Contract and planner focus: `59 passed`.
- Replay and acceptance focus: `28 passed`.
- Route focus: `71 passed`.
- Training Control Room contract: `18 passed`.
- Combined contract/planner/acceptance/route/database focus: `213 passed`.

### Final Automated Verification

- Exact brief backend command -> `337 passed in 54.70s`.
- Focused Training PWA files -> `51 passed`.
- Full PWA baseline -> `94 passed, 1 failed`; the sole failure remains the documented unrelated Finance `orbitSize` expectation in `financeControlRoomContract.test.js` / `HoloWings.jsx`.
- `npm run build` -> exit 0; Vite transformed 320 modules and generated the service worker. The existing large-chunk warning remains.
- `git diff --check` -> exit 0 after this report update.

Browser QA, public shadow collection, deployment, Railway/Vercel variables, and live promotion remain controller-owned and pending; this report does not claim them. The unrelated generated `jarvis/domains/finance/portfolio_state.json` change was not edited, reverted, staged, or committed.

## Controller Security Review

The independent re-review could not complete because the reviewer quota was exhausted. A controller audit of the compressed acceptance envelope found that expanded size was checked only after unbounded `zlib.decompress`. Two RED tests proved the decoder used the unbounded API and did not identify the expanded-size boundary. The decoder now caps encoded input, uses bounded streaming decompression, rejects incomplete or concatenated streams, and enforces the 2 MB expanded limit before JSON parsing. The focused acceptance suite passes 33 tests after the fix.

## Controller Integration Review

Browser QA exposed that the proposal API's `authoritative` rollout decision was not included in frontend Apply eligibility. A RED regression proved an otherwise valid shadow proposal remained applyable. The shared Training plan normalizer now requires literal `authoritative: true`; false or missing authority fails closed across the planner and Adapt views.

Final local evidence after this correction:

- Focused planner and Adapt view models -> `25 passed`.
- Exact backend verification matrix -> `339 passed in 48.03s`.
- Full PWA -> `95 passed, 1 failed`; the sole failure is the unchanged, unrelated Finance `orbitSize` contract documented above.
- Production PWA build -> exit 0; 320 modules transformed and service worker generated.
- `git diff --check` -> exit 0 with line-ending warnings only.

Implementation and local verification are complete. External shadow deployment, production evidence collection, and live promotion remain pending; live Apply continues to fail closed until that evidence is accepted.

## Public Shadow Rollout

On 2026-07-19, commit `50fa38d8` was deployed from a detached clean worktree to Railway production with `PHOENIX_TRAINING_PLANNER_MODE=shadow` explicitly set. Deployment `cfe4c560-d51c-4cc5-9832-8930093a0430` reached `SUCCESS`; startup logs show a clean Uvicorn boot and the public OpenAPI document contains `/training/plan/proposals`.

Vercel preview deployment `dpl_Gw3Zg71hKdbAtyjAaUj2QfVzjkqC` reached `READY` at `https://pwa-2vgy1bvia-phoenix123.vercel.app`. Its protected HTML contains the Phoenix root, its generated bundle contains the Railway API URL and the `authoritative` gate, and a browser-style preflight to the proposal endpoint returns the exact preview origin. Existing frontend origins were preserved in the Railway CORS allowlist.

The first public proposal attempt failed closed with HTTP 503: `Training plan calendar evidence unavailable`. Production diagnostics show Plaan is using the non-authoritative recorded fixture, no manual import exists, and the read-only Google Calendar token returns `invalid_grant` because it expired or was revoked. No proposal, active plan, session log, or calendar mutation was created. Real shadow replay evidence and live promotion are blocked until the user reconnects the read-only Google Calendar or supplies a current authoritative manual calendar import. No synthetic empty calendar was installed.

## Training Integrity Loop Release

On 2026-07-19, commit `7ebe6234` completed the active-plan execution loop. The Training session console now records actual load and repetitions for every prescribed set, keeps target repetitions as separate evidence, rejects incomplete set logs, and submits the exact deviations with plan provenance. An isolated API lifecycle test covers active plan -> readiness -> routed workout -> completion -> history and verifies the persisted actual values.

Final automated evidence:

- Focused Training frontend matrix -> `36 passed`.
- Training backend matrix -> `365 passed in 46.04s`.
- Final release gate -> `66` Training frontend tests and `339` backend tests passed.
- Production PWA build -> exit 0; 322 modules transformed and service worker generated.
- The unrelated Finance `orbitSize` full-suite contract remains the only known frontend baseline failure and was not changed.

Railway deployment `558290c5-b8e8-431b-9a59-02eaf3281f6a` reached `SUCCESS`. Public `/health` returned `ok`, public `/training/status` returned the truthful `plan_required` operational state, and `PHOENIX_TRAINING_PLANNER_MODE` remained `shadow`. Vercel production deployment `dpl_ByyGfN1ZTzFzveZHwNwD4akJB9St` reached `READY` and was aliased to `https://pwa-ochre-theta.vercel.app`.

The unrelated generated `jarvis/domains/finance/portfolio_state.json` change remained unstaged and was excluded from both clean deployment snapshots.

## Performance Hybrid Task 9 Automated Verification

Date: 2026-07-25

### Integrity Loop

Added `test_hybrid_integrity_loop_advances_from_actual_completion` in
`jarvis/api/tests/test_training_tracker.py`. The regression exercises the real
API and persistence path:

1. generate an autonomous `adaptive-v2` proposal;
2. activate it through the live-gated apply route under test-only acceptance;
3. record clear readiness for the authoritative position-1 date;
4. route the persisted Push Strength session;
5. submit actual set evidence at 7 repetitions and 57.5 kg with RPE 8;
6. verify the immutable history row retains actuals and plan provenance; and
7. generate an empty-constraint proposal whose first training day is
   `pull_strength`, sequence position 2.

The regression does not inject a completion cursor or mock session history.
The second proposal derives its cursor from the completion row written by the
public session endpoint.

### TDD Evidence

RED:

- Initial collection reached the active receipt and exposed that a recovery
  slot correctly has no `sequence_position`; the test selector was narrowed to
  the authoritative position-1 training slot.
- A deliberate local mutation disabled completion-driven cursor advancement.
  The exact lifecycle regression then failed at the final contract with
  `assert 1 == 2`.

GREEN:

- The mutation was restored byte-for-byte; no production diff remained.
- Focused integrity loop -> `1 passed in 2.81s`.

### Automated Release Gate

- Backend Training matrix:
  `457 passed, 3 subtests passed in 77.12s`.
- Specified Training frontend matrix:
  `88 passed, 0 failed`.
- Production PWA build:
  exit 0; Vite transformed 323 modules and generated the service worker.
- `git diff --check`:
  exit 0; line-ending warnings only.

### Pending Controller Evidence

Browser visual QA at 1440x900 and 390x844, Railway/Vercel deployment, real
calendar-backed shadow replay, and a real completed hybrid session remain
pending for the controller. This section does not claim those checks or any
live promotion.

The public plan-day and routed-session projections currently omit
`session_intent`, `sequence_position`, and `sequence_length`, while the
immutable active receipt retains them. The automated integrity loop therefore
cross-checks routed plan provenance against that persisted receipt before
submitting exact hybrid completion evidence. The controller must verify or
correct this public response boundary before browser/deployment evidence can
qualify the planner for promotion.

The unrelated generated
`jarvis/domains/finance/portfolio_state.json` modification was not edited,
reverted, staged, or committed.

## Performance Hybrid Public Boundary Correction

Date: 2026-07-25

This correction resolves the release-critical public response blocker recorded
in the preceding Task 9 section.

### Root Cause

The immutable `adaptive-v2` receipt already persisted
`session_intent`, `sequence_position`, and `sequence_length`, but two public
serialization boundaries discarded them:

- `TrainingPlanDayResponse` did not declare the hybrid fields, so Pydantic
  removed them from proposal, apply, and current-plan JSON.
- `project_plan_day` constructed an operational session without copying the
  hybrid fields, so both `planned_session` and `session` in routed JSON lacked
  the identity needed by the PWA.

### TDD Evidence

RED:

- Four focused public-boundary tests produced `2 failed, 2 passed`.
- The v2 proposal test failed with `KeyError: 'session_intent'`.
- The full integrity-loop routed-session assertion failed with
  `KeyError: 'session_intent'`.
- Both legacy non-inference tests passed before the fix, establishing the
  compatibility baseline.

GREEN:

- `TrainingPlanDayResponse` now declares the three nullable hybrid fields with
  sequence bounds.
- `project_plan_day` forwards the exact authoritative day values only for
  constitution `2` and planner `adaptive-v2`.
- Legacy plan and routed-session responses remain neutral and do not infer
  hybrid identity from an objective such as `push_strength`.
- Focused v2 and legacy boundary matrix -> `4 passed in 4.04s`.

### Automated Verification

- Full Training backend matrix:
  `460 passed, 3 subtests passed in 64.34s`.
- Relevant PWA authority, live-session, session-model, and Control Room
  contracts:
  `45 passed, 0 failed`.
- Production PWA build:
  exit 0; Vite transformed 323 modules and generated the service worker.
- `git diff --check`:
  exit 0; line-ending warnings only.

The public API blocker from the preceding Task 9 section is resolved locally.
Browser visual QA, Railway/Vercel deployment, calendar-backed real shadow
replay, and real-session evidence remain controller-owned and pending. No live
promotion is claimed.

The unrelated generated
`jarvis/domains/finance/portfolio_state.json` modification was not edited,
reverted, staged, or committed.
