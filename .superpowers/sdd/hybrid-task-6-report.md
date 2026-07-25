# Hybrid Task 6 Report

## Status

DONE

## Summary

- Promoted Training replay authority to constitution `2` and planner `adaptive-v2`.
- Replaced six legacy fixture labels with ten behavior-inferred hybrid categories.
- Kept canonical replay, bounded evidence decoding, exact validation allowlisting,
  immutable-input proofs, and side-effect auditing fail closed.
- Added actual two-miss completion evidence for the missed-session category and
  recomputed progression before granting coverage.
- Allowed empty proposal constraints so Phoenix can autonomously generate the
  next evidence-backed week without bypassing calendar, safety, replay, or apply
  gates.
- Restricted public planner rules to the hybrid sequence, spacing, duration
  ranges, movement families, phase behavior, and safety flags.
- Updated route fixtures and assertions intentionally for v2 hybrid behavior.

## Files

- `jarvis/domains/training/plan_acceptance.py`
- `jarvis/domains/training/tests/test_plan_acceptance.py`
- `jarvis/api/routers/training.py`
- `jarvis/api/tests/test_training_plan_routes.py`

## Verification

- Focused:
  `python -m pytest jarvis/domains/training/tests/test_plan_acceptance.py jarvis/api/tests/test_training_plan_routes.py -q`
  - `112 passed`
- Broad:
  `python -m pytest jarvis/domains/training/tests jarvis/api/tests/test_training_plan_routes.py jarvis/api/tests/test_training_tracker.py jarvis/data/tests/test_database.py -q`
  - `448 passed, 3 subtests passed`
- `git diff --check`
  - passed

## Concerns

- No Task 6 correctness blockers.
- `jarvis/domains/finance/portfolio_state.json` and two frontend Training test
  files were already modified outside this task. They were not edited or staged
  by Task 6.

## Authority Review Fixes

Follow-up review identified three evidence gaps. They are fixed in a separate
commit:

- Recovery placement now compares the observed recovery date with a neutral
  replay. Coverage requires a genuinely moved recovery caused by calendar,
  readiness, or proven sequence evidence, with valid high-neural spacing.
- Completion advancement now requires actual completion proof linked to the
  source plan, a nonblank receipt hash, matching completion/provenance dates,
  valid hybrid intent metadata, and a cursor derived from the latest linked
  completion. Synthetic IDs and empty completion sets fail closed.
- Peak coverage now verifies the configured peak window and compares the raw
  hybrid week with the transformed output. It requires lower work removal,
  capped general sessions, and bounded jump volume; labels alone have no
  authority.

Adversarial coverage includes ordinary recovery annotations, synthetic cursors,
misleading peak labels, and out-of-order linked completions.

### Follow-up Verification

- Focused:
  `python -m pytest jarvis/domains/training/tests/test_plan_acceptance.py jarvis/api/tests/test_training_plan_routes.py -q`
  - `116 passed`
- Broad:
  `python -m pytest jarvis/domains/training/tests jarvis/api/tests/test_training_plan_routes.py jarvis/api/tests/test_training_tracker.py jarvis/data/tests/test_database.py -q`
  - `452 passed, 3 subtests passed`
- `git diff --check`
  - passed
