# Hybrid Task 4 Report

## Status

DONE_WITH_CONCERNS. Planner integration and actual-result progression are
complete. The only open failures are the 30 acceptance tests explicitly owned
by Hybrid Task 6.

## Files

- `jarvis/domains/training/adaptive_planner.py`
- `jarvis/domains/training/progression.py`
- `jarvis/domains/training/plan_evidence.py`
- `jarvis/domains/training/tests/test_adaptive_planner.py`
- `jarvis/domains/training/tests/test_plan_evidence.py`
- `.superpowers/sdd/hybrid-task-4-report.md`

No Task 6 acceptance file or constant was changed. The pre-existing
`jarvis/domains/finance/portfolio_state.json` worktree change was not edited,
staged, or reverted.

## Implementation

- Constitution `2` with program `performance_hybrid` now delegates baseline
  generation to `build_hybrid_week`; all other constitutions retain the legacy
  engine path.
- The planner version is read from the constitution policy, producing
  `adaptive-v2` hybrid receipts while preserving genuine
  `1`/`adaptive-v1` receipt generation and replay.
- Peak and attempt phase rules are applied exactly once to the pure hybrid
  baseline before the existing constraint, pain, calendar, recovery,
  progression, and validation pipeline.
- `build_planning_snapshot` accepts the authoritative active plan and derives
  `sequence_cursor` and `sequence_source_plan_id` only from matching completion
  evidence.
- Cursor evidence must match plan ID, receipt hash when present, planned date,
  session intent, sequence position, and sequence length against the active
  receipt. Malformed, mismatched, and unlinked history cannot advance it.
- Progression now evaluates actual repetitions and load, target repetitions,
  RPE, and pain. Pain holds load; completed targets at RPE 8 or below increase
  by the existing exercise increment; high RPE or missed repetitions hold or
  reduce while preserving the established two-miss deload behavior.

## TDD Evidence

### Baseline

Before Task 4 implementation:

```text
python -m pytest jarvis/domains/training/tests -q
```

```text
59 failed, 209 passed in 8.53s
```

The production constitution was already `2`/`adaptive-v2`, while
`generate_weekly_plan` still built legacy weekdays and supplied the hard-coded
`adaptive-v1` receipt version.

### RED

After adding the focused Task 4 planner, cursor, and actual-result progression
tests, before production changes:

```text
python -m pytest jarvis/domains/training/tests/test_adaptive_planner.py jarvis/domains/training/tests/test_plan_evidence.py -q
```

```text
5 failed, 54 passed in 0.46s
```

The failures were:

- v2 receipt generation rejected the hard-coded `adaptive-v1` version;
- completed hybrid progression could not generate an active v2 receipt;
- `build_planning_snapshot` rejected the new `active_plan` argument in two
  evidence tests;
- the preserved v1 equipment fixture needed its genuine legacy explosive
  family restored after production policy moved to v2.

### GREEN

Final focused verification:

```text
python -m pytest jarvis/domains/training/tests/test_adaptive_planner.py jarvis/domains/training/tests/test_plan_evidence.py -q
```

```text
60 passed in 0.35s
```

## Task 4 Training Gate

Exact exclusion command:

```text
python -m pytest jarvis/domains/training/tests --ignore=jarvis/domains/training/tests/test_plan_acceptance.py -q
```

```text
237 passed in 2.53s
```

This covers adaptive planning, plan evidence, performance hybrid generation,
immutable contracts, joint capacity, operational plans, and the Training
engine with no failures.

## Full Training Run

```text
python -m pytest jarvis/domains/training/tests -q --tb=short
```

```text
30 failed, 243 passed in 4.39s
```

Every failure is in
`jarvis/domains/training/tests/test_plan_acceptance.py`. There are no failures
in adaptive planner, plan evidence, performance hybrid, plan contracts, joint
capacity, operational plan, or engine tests.

The open acceptance failures are the deferred Hybrid Task 6 gate:

- acceptance constants still require constitution `1` and planner
  `adaptive-v1`;
- acceptance fixtures still supply the legacy equipment set, which cannot
  satisfy the v2 `lateral_delt` template and correctly fails closed.

Per the scope decision, Task 6 acceptance files, constants, fixtures, and tests
remain untouched.

## Self-Review

- Confirmed the v2 branch is gated by both constitution version and program,
  leaving the legacy path readable and replayable.
- Confirmed pure hybrid baseline and phase transforms are delegated rather
  than duplicated.
- Confirmed phase rules execute once and each day receives no duplicate phase
  reason.
- Confirmed cursor advancement uses only completion evidence linked to the
  supplied active receipt and defaults to cursor `1` with no source plan when
  evidence is invalid.
- Confirmed pain takes precedence over RPE and target-based load increases.
- Confirmed deterministic session ordering tolerates malformed row IDs.
- Confirmed no Task 6 or Finance change is part of the Task 4 diff.

## Verification

`git diff --check` is clean. Final staged verification is recorded after the
Task 4-only staging step.

## Concerns

Hybrid Task 6 must migrate acceptance versions, equipment fixtures, and hybrid
behavior categories before the unexcluded Training suite can be fully green.

## Review Corrections

### Scope

The review corrections add the production API integration and tighten cursor
and progression evidence without changing Task 6 acceptance files, constants,
or fixtures.

Correction files:

- `jarvis/api/routers/training.py`
- `jarvis/api/tests/test_training_plan_routes.py`
- `jarvis/domains/training/plan_evidence.py`
- `jarvis/domains/training/progression.py`
- `jarvis/domains/training/tests/test_adaptive_planner.py`
- `jarvis/domains/training/tests/test_plan_evidence.py`
- `.superpowers/sdd/hybrid-task-4-report.md`

The pre-existing `jarvis/domains/finance/portfolio_state.json` change was not
edited, staged, or reverted.

### Correction RED

Focused evidence and progression regressions before correction:

```text
python -m pytest jarvis/domains/training/tests/test_adaptive_planner.py jarvis/domains/training/tests/test_plan_evidence.py -q
```

```text
8 failed, 62 passed in 0.52s
```

The failures covered active cursor preservation, consumed/metadata-only
completion rejection, missing targets, and invalid RPE values.

Production router regression before correction:

```text
python -m pytest jarvis/api/tests/test_training_plan_routes.py::test_proposal_advances_from_active_hybrid_completion -q
```

```text
1 failed in 2.18s
```

The generated proposal remained at cursor `1` because
`_current_planning_snapshot` did not pass the authoritative active receipt.

### Correction GREEN

Focused adaptive planner and plan evidence:

```text
python -m pytest jarvis/domains/training/tests/test_adaptive_planner.py jarvis/domains/training/tests/test_plan_evidence.py -q
```

```text
71 passed in 0.36s
```

Focused production API snapshot/proposal path:

```text
python -m pytest jarvis/api/tests/test_training_plan_routes.py::test_proposal_advances_from_active_hybrid_completion -q
```

```text
1 passed in 1.99s
```

All Training-domain tests excluding the Task 6 acceptance file:

```text
python -m pytest jarvis/domains/training/tests --ignore=jarvis/domains/training/tests/test_plan_acceptance.py -q
```

```text
248 passed in 2.03s
```

The API route file mixes five legacy v1 acceptance/layout expectations with
the Task 4 route coverage. The exact Task 4 command was:

```text
python -m pytest jarvis/api/tests/test_training_plan_routes.py -q -k "not test_proposal_passes_latest_import_to_real_resolver_and_uses_its_performance_events and not test_history_and_rules_return_readable_detail and not test_rules_whitelist_excludes_private_policy_fields and not test_live_generated_proposals_are_authoritative_after_runtime_replay and not test_live_apply_replays_generated_proposal_without_exact_allowlist"
```

```text
70 passed, 5 deselected in 16.67s
```

For classification, the unfiltered route file produced `70 passed, 5 failed`.
The failures assert the legacy fixed v1 calendar layout, `adaptive-v1` public
version, or v1 live acceptance/runtime behavior. They remain Task 6-owned.

Full Training suite:

```text
python -m pytest jarvis/domains/training/tests -q
```

```text
30 failed, 254 passed in 4.19s
```

All 30 failures are in
`jarvis/domains/training/tests/test_plan_acceptance.py`. No adaptive planner,
plan evidence, performance hybrid, contract, joint-capacity, operational-plan,
or engine test failed.

### Correction Self-Review

- Confirmed `_current_planning_snapshot` passes the active database record into
  `build_planning_snapshot(active_plan=active)`.
- Confirmed an active v2 plan preserves its explicit start cursor, or recovers
  it from the first dated hybrid training day, before considering new history.
- Confirmed completion advancement requires unconsumed actual set results,
  complete persisted duration/RPE/pain evidence, and exact plan ID, receipt
  hash, date, intent, position, and sequence length.
- Confirmed position wrap and validation use `len(HYBRID_SEQUENCE)` from the
  pure hybrid module.
- Confirmed progression increases only from finite positive targets and actual
  reps, finite nonnegative loads, and finite RPE in `1..10`; booleans, missing
  values, NaN, infinity, and out-of-range RPE fail closed.
- Confirmed pain evidence remains the highest-precedence load decision.
- Confirmed genuine v1 receipt behavior remains covered by the passing
  non-acceptance contract and planner tests.

### Correction Concern

The only remaining gate is Task 6: 30 legacy v1 acceptance/version failures in
`test_plan_acceptance.py`, plus the five corresponding mixed API route
expectations intentionally excluded above.
