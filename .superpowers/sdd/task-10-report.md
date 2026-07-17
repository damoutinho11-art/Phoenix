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
