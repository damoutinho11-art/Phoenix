# Task 1 Report

## Implementation Summary

- Added standard-library-only immutable planner contracts in `jarvis/domains/training/plan_contracts.py`:
  `TrainingConstraint`, `PlanDay`, `PlanValidation`, `WeeklyPlanReceipt`, `canonical_hash`, and `iso_cycle_id`.
- Added canonical hashing with mapping-order independence and type-sensitive list/tuple encoding.
- Added duplicate-date rejection and deterministic plan/receipt hashes and plan IDs.
- Added the exact `adaptive_planner` policy and changed constitution version from `"0"` to `"1"`.

## Files Changed

- `jarvis/domains/training/plan_contracts.py`
- `jarvis/domains/training/tests/test_plan_contracts.py`
- `jarvis/domains/training/constitution.json`

## Test Commands and Results

- `python -m pytest jarvis/domains/training/tests/test_plan_contracts.py -q`
  - Result: `3 passed in 0.06s`
- `python -m pytest jarvis/domains/training/tests/test_plan_contracts.py jarvis/domains/training/tests/test_training_engine.py -q`
  - Result: `54 passed in 0.18s`
- Final post-commit run of `python -m pytest jarvis/domains/training/tests/test_plan_contracts.py jarvis/domains/training/tests/test_training_engine.py -q`
  - Result: `54 passed in 0.14s`
- `python -m json.tool jarvis/domains/training/constitution.json`
  - Result: valid JSON.
- `git diff --check`
  - Result: clean.

## RED and GREEN Evidence

- RED: after writing `test_plan_contracts.py`, the exact focused command failed during collection with `ModuleNotFoundError: No module named 'jarvis.domains.training.plan_contracts'`.
- GREEN: after adding the minimal production contracts, the focused contract suite passed with `3 passed`.
- GREEN regression: the required contract plus Training engine suite passed with `54 passed`.

## Self-Review

- Changes are limited to the three owned implementation/test/policy files.
- Dataclasses are frozen, receipt dates are checked for uniqueness, ISO week formatting is deterministic, and canonical JSON encoding is ASCII and stable.
- The constitution policy values match the task brief verbatim.
- The commit contains exactly the three scoped files.

## Concerns

No blocking concerns. Runtime validation beyond the behaviors explicitly required by the brief was intentionally not added.

## Commit

- SHA: `234e074e9fda8305c5d062ce87fda335915fb93d`
- Subject: `feat(training): add adaptive plan contracts`

## Review Fix 2

### RED

- Command: `python -m pytest jarvis/domains/training/tests/test_plan_contracts.py -q`
- Output: `....... [100%]`; `7 passed in 0.06s`.
- Test correction: the first snapshot retained the same mutable source lists and passed falsely; it was corrected to snapshot each receipt collection as a tuple before the required RED run.
- Command: `python -m pytest jarvis/domains/training/tests/test_plan_contracts.py -q`
- Output: `....F.. [100%]`; `1 failed, 6 passed in 0.19s`.
- Failure cause: after appending to the caller-owned `days` list, `tuple(receipt.days)` contained the appended day instead of remaining unchanged.

### GREEN

- Command: `python -m pytest jarvis/domains/training/tests/test_plan_contracts.py -q`
- Output: `....... [100%]`; `7 passed in 0.11s`.
- Command: `python -m pytest jarvis/domains/training/tests/test_plan_contracts.py jarvis/domains/training/tests/test_training_engine.py -q`
- Output: `.......................................................... [100%]`; `58 passed in 0.23s`.
- Command: `git diff --check`
- Result: clean; Git emitted only normal LF-to-CRLF working-copy warnings.

### Changes

- Added `test_receipt_detaches_source_collections_before_hashing`, which constructs a receipt from `days`, `constraints`, and `validations` lists, mutates every source list, and verifies all receipt collections and both hashes remain unchanged.
- Updated `WeeklyPlanReceipt.create()` to convert all three caller-owned collections to detached tuples before validation, hashing, and receipt construction.

### Self-Review

- The production change is limited to the receipt factory and uses one detached tuple value consistently for each collection across validation, input hashing, receipt hashing, and storage.
- The regression test verifies the reported ownership boundary without relying on implementation-specific identity checks.
- Only the requested implementation, contract test, and report files changed; no unrelated files were reverted or modified.

### Concerns

No blocking concerns. Nested mutability remains covered by the existing contract-level freezing tests.

## Review Fix

### RED

- Command: `python -m pytest jarvis/domains/training/tests/test_plan_contracts.py -q`
- Output: `...FFF [100%]`; `3 failed, 3 passed in 0.22s`.
- Failure causes: `TypeError: Unsupported canonical value: TrainingConstraint`; the source list mutation changed `constraint.values`; and source list/dict mutations changed `day.exercises`.

### GREEN

- Command: `python -m pytest jarvis/domains/training/tests/test_plan_contracts.py -q`
- Output: `...... [100%]`; `6 passed in 0.06s`.
- Command: `python -m pytest jarvis/domains/training/tests/test_plan_contracts.py jarvis/domains/training/tests/test_training_engine.py -q`
- Output: `......................................................... [100%]`; `57 passed in 0.19s`.

### Changes

- Added behavior-first tests for deterministic receipt hashing with nonempty `TrainingConstraint` and `PlanValidation` tuples.
- Added tests proving source mappings/lists cannot mutate effective `TrainingConstraint.values` or `PlanDay.exercises` contents after construction.
- Added recursive freezing with `MappingProxyType` and tuples in the frozen contracts, preserving key/index access and equality while preventing nested mutation.
- Added dataclass-aware canonicalization using qualified type names and ordered dataclass fields.
- Kept receipt hashing on contract objects directly and removed `asdict` receipt preparation so frozen mapping proxies are handled safely.

### Files Changed

- `jarvis/domains/training/plan_contracts.py`
- `jarvis/domains/training/tests/test_plan_contracts.py`
- `.superpowers/sdd/task-1-report.md`

### Self-Review

- The RED failures exercised the reported defects rather than implementation details.
- The canonical representation is deterministic for dataclasses, mappings, tuples, lists, dates, and scalar values, and remains standard-library-only.
- Nested mappings and sequences are recursively detached from caller-owned inputs before being stored by frozen dataclasses.
- The constitution and unrelated files were not modified.
- Remaining concern: callers should use the contract's explicit `canonical_hash` representation for stable hashes; nested mapping values are intentionally read-only views and nested sequences are tuples.
