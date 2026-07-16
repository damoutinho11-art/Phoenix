# Task 4 Report: Evidence-Driven Progression, Recovery, Calendar, and Pain Safety

## Status

Completed and verified. Commit: `2596d629571293cda8bb31aa65013215b28c6fa8` (`feat(training): adapt plans from recovery evidence`).

## Files

- `jarvis/domains/training/plan_evidence.py`
- `jarvis/domains/training/tests/test_plan_evidence.py`
- `jarvis/domains/training/adaptive_planner.py`
- `jarvis/domains/training/tests/test_adaptive_planner.py`

## RED Evidence

1. `python -m pytest jarvis/domains/training/tests/test_plan_evidence.py -q`
   - Result: collection error, `ModuleNotFoundError: No module named 'jarvis.domains.training.plan_evidence'`.
   - Expected failure: evidence normalizer did not exist.
2. `python -m pytest jarvis/domains/training/tests/test_adaptive_planner.py -q`
   - Result: `6 failed, 22 passed`.
   - Expected failures: no pain recovery routing, no calendar recovery routing, unsafe moved-session spacing, absent progression payload fields, and no weekly-volume validation.
3. `python -m pytest jarvis/domains/training/tests/test_adaptive_planner.py -q -k precomputed_safety_blocks`
   - Result: `1 failed, 28 deselected`.
   - Expected failure: a direct snapshot with `limping=True` but no precomputed `safety_blocks` left a high-intensity day active.
4. `python -m pytest jarvis/domains/training/tests/test_adaptive_planner.py -q -k progression_alias_order`
   - Result: `1 failed, 29 deselected`.
   - Expected failure: equivalent progression aliases in reverse insertion order produced different receipt hashes.

## GREEN Evidence

1. Evidence normalizer: `python -m pytest jarvis/domains/training/tests/test_plan_evidence.py -q`
   - Result: `6 passed in 0.09s`.
2. Initial planner adaptation: `python -m pytest jarvis/domains/training/tests/test_adaptive_planner.py -q`
   - Result: `28 passed in 0.16s`.
3. Direct hard-readiness fallback: `python -m pytest jarvis/domains/training/tests/test_adaptive_planner.py -q -k precomputed_safety_blocks`
   - Result: `1 passed, 28 deselected in 0.11s`.
4. Deterministic progression aliases: `python -m pytest jarvis/domains/training/tests/test_adaptive_planner.py -q -k progression_alias_order`
   - Result: `1 passed, 29 deselected in 0.10s`.
5. Final focused evidence/planner suite: `python -m pytest jarvis/domains/training/tests/test_plan_evidence.py jarvis/domains/training/tests/test_adaptive_planner.py -q`
   - Result: `36 passed in 0.23s`.
6. Full Training domain suite: `python -m pytest jarvis/domains/training/tests -q`
   - Result: `127 passed in 2.35s`.
7. Compilation: `python -m compileall -q jarvis/domains/training/plan_evidence.py jarvis/domains/training/adaptive_planner.py`
   - Result: exit code 0.
8. Whitespace: `git diff --check`
   - Result: exit code 0 with no whitespace errors.

## Self-Review

- `build_planning_snapshot(...)` canonicalizes equipment and preferences, calculates progression from logged sessions through the existing `calculate_progression`, and derives stable affected-area safety blocks.
- The planner derives hard safety blocks again at its boundary, so manually constructed snapshots cannot bypass pain, limping, sharp-pain, or next-day-worsening routing.
- Safety runs before calendar, recovery spacing, and progression. Affected high-neural work becomes an empty `recovery` day with a truthful `hard_pain_block` reason.
- Performance calendar events route affected high-neural dates to `calendar_recovery`; explicit hard calendar events also route their date to recovery.
- High-neural spacing is enforced from the constitution threshold, and the receipt records explicit `pain_block`, `calendar_conflicts`, `recovery_spacing`, and `weekly_volume_change` validations.
- Progression annotations are applied only after safety/calendar/spacing routing and use canonical exercise matching. Alias selection is deterministic, preserving repeatable receipt hashes.

## Review Fix

### RED Evidence

1. `python -m pytest jarvis/domains/training/tests/test_adaptive_planner.py -q -k explicit_hard_calendar_event_preserves_pain_recovery_provenance`
   - Result: `1 failed, 30 deselected in 0.24s`.
   - Failure: expected `pain_safe_recovery`, received `calendar_recovery` for a sharp-pain day with an explicit hard calendar event.
2. `python -m pytest jarvis/domains/training/tests/test_adaptive_planner.py -q -k reversed_same_date_sessions_without_ids`
   - Result: `1 failed, 31 deselected in 0.27s`.
   - Failure: reversed ID-less same-date inputs produced unequal `completed_sessions` before progression calculation.
3. `python -m pytest jarvis/domains/training/tests/test_adaptive_planner.py -q -k pain_block_validation_reports_no_op`
   - Result: `1 failed, 32 deselected in 0.26s`.
   - Failure: the safe no-op case reported `Hard pain block for knee routed loaded and explosive work to recovery.` instead of stating that constraints had already removed all high-neural work.

### GREEN Evidence

1. `python -m pytest jarvis/domains/training/tests/test_adaptive_planner.py -q -k explicit_hard_calendar_event_preserves_pain_recovery_provenance`
   - Result: `1 passed, 30 deselected in 0.08s`.
2. `python -m pytest jarvis/domains/training/tests/test_adaptive_planner.py -q -k reversed_same_date_sessions_without_ids`
   - Result: `1 passed, 31 deselected in 0.08s`.
3. `python -m pytest jarvis/domains/training/tests/test_adaptive_planner.py -q -k pain_block_validation_reports_no_op`
   - Result: `1 passed, 32 deselected in 0.10s`.
4. `python -m pytest jarvis/domains/training/tests/test_plan_evidence.py jarvis/domains/training/tests/test_adaptive_planner.py -q`
   - Result: `39 passed in 0.23s`.
5. `python -m pytest jarvis/domains/training/tests -q`
   - Result: `130 passed in 2.31s`.
6. `python -m compileall -q jarvis/domains/training/plan_evidence.py jarvis/domains/training/adaptive_planner.py`
   - Result: exit code 0.
7. `git diff --check`
   - Result: exit code 0 with no whitespace errors.

### Changes

- Pain routing now tracks the dates it actually changes. Explicit hard calendar routing preserves those days' `pain_safe_recovery` objective and `hard_pain_block` provenance while calendar validation continues to record the recovery-safe conflict date.
- Accepted session rows are sorted by a complete canonical JSON content key before `calculate_progression`, so reversed same-date rows without IDs produce identical normalized evidence, suggestions, and receipt hashes.
- `pain_block` validation now distinguishes active pain-layer routing from the safe no-op case where prior constraints already removed every high-neural session.

## Concerns

- None within Task 4 scope. Calendar routing intentionally consumes the existing raw event-dictionary shape (`event_type`, `date`) and preserves the established performance-day and preceding-day heavy-work policy.

## Review Fix 2

### RED Evidence

1. `python -m pytest jarvis/domains/training/tests/test_adaptive_planner.py -q -k out_of_horizon_hard_calendar_event`
   - Result: `1 failed, 33 deselected in 0.07s`.
   - Failure: an explicit hard event on `2026-07-27`, outside the plan horizon of `2026-07-20` through `2026-07-26`, was reported as `Calendar hard-conflict dates are recovery-safe: 2026-07-27.` instead of `No calendar hard conflicts.`

### GREEN Evidence

1. `python -m pytest jarvis/domains/training/tests/test_adaptive_planner.py -q -k out_of_horizon_hard_calendar_event`
   - Result: `1 passed, 33 deselected in 0.07s`.
2. `python -m pytest jarvis/domains/training/tests/test_adaptive_planner.py -q`
   - Result: `34 passed in 0.23s`.
3. `python -m pytest jarvis/domains/training/tests -q`
   - Result: `131 passed in 2.48s`.
4. `python -m compileall -q jarvis/domains/training/adaptive_planner.py`
   - Result: exit code 0.
5. `git diff --check`
   - Result: exit code 0 with no whitespace errors.

### Changes

- Explicit hard calendar conflict dates are now limited to dates in the generated seven-day plan horizon before validation and routing.
- Added a regression test proving an out-of-horizon hard event is not represented as recovery-safe and does not alter any plan day.

### Concerns

- None within Task 4 scope. Performance events retain the existing policy of affecting an in-horizon preceding high-neural day or the performance date itself.
