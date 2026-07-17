# Task 10 Report: Adaptive Planner Promotion Gate

Date: 2026-07-17
Branch: `codex/training-adaptive-planner`

## Scope

Implemented only the Task 10 backend and automated-test files:

- `jarvis/domains/training/plan_acceptance.py`
- `jarvis/domains/training/tests/test_plan_acceptance.py`
- `jarvis/api/routers/training.py`
- `jarvis/api/tests/test_training_plan_routes.py`
- `.superpowers/sdd/task-10-report.md`

No Training design contract correction was necessary. `progress.md`, `ActiveSession.jsx`, Finance code, deployment settings, Railway, and Vercel variables were not changed.

## Implemented Gate

- Reconstructs JSON-serialized plan receipts through `WeeklyPlanReceipt.create` and rejects any plan ID, input hash, or receipt hash mismatch.
- Evaluates shadow evidence against planner `adaptive-v1`, constitution `1`, literal hard-validation success, pain-safe loaded/explosive work, 36-hour high-neural recovery spacing, one active/proposed plan per cycle, zero direct/session/calendar side effects, and all six required fixture categories.
- Produces a deterministic evidence ID and fixture summary from replay evidence.
- Defaults `PHOENIX_TRAINING_PLANNER_MODE` to `shadow`; invalid values also fail closed to shadow.
- Accepts promotion JSON only when `accepted` is literal `true`, versions match exactly, the evidence ID is non-blank, and the fixture summary contains positive counts.
- Marks shadow or unevidenced live proposals `authoritative=false` without activating them.
- Rejects shadow apply with 409 and unevidenced live apply with 503 before the database apply transaction.
- Leaves proposal/apply paths free of session-log and calendar-write side effects.

Shadow evaluation uses serialized receipt fields plus an acceptance envelope containing `fixture_category` and zeroed `side_effects` counters. Those evidence-only fields are intentionally excluded from canonical receipt hashing.

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
- The environment acceptance contract intentionally requires only a non-empty positive fixture summary, as specified. `evaluate_training_shadow` is the stricter producer and requires all six categories.
- Browser QA, live shadow evidence collection, public replay, Railway/Vercel changes, deployment, and promotion to live were not performed. They remain controller-owned after review.
- No external deployment or environment variable was modified.
