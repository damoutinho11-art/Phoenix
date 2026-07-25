# Hybrid Task 3 Report

## Status

GREEN for the Task 3 pure-module surface. The broader Training-domain suite
remains RED at the intentional Task 4 planner-integration boundary.

## Scope

- `jarvis/domains/training/performance_hybrid.py`
- `jarvis/domains/training/tests/test_performance_hybrid.py`

`adaptive_planner.py` was not edited. The unrelated
`jarvis/domains/finance/portfolio_state.json` worktree change was not edited,
staged, or committed.

## Implementation

- Ranked recovery candidates deterministically by hard calendar conflict,
  lower-to-jump spacing, high-neural follow-on, fatigue, then earlier date.
- Records `recovery_placed:calendar`, `recovery_placed:lower_spacing`,
  `recovery_placed:fatigue`, or `recovery_placed:default` provenance.
- Preserves the six-session sequence while the recovery slot moves.
- Compresses optional work before accessories and preserves primary work.
- Applies peak and attempt transforms: both remove `lower_power`; peak caps
  general sessions at 45 minutes; attempt caps them at 30 minutes and retains
  only required jump preparation plus approach-jump exposure.

## Minimal Interface Adaptation

Each generated exercise now carries an explicit per-block `estimated_minutes`
budget. The pure module sums retained block budgets rather than inferring a
fixed per-exercise duration; `PlanDay` remains immutable and its public
`estimated_minutes` is always that truthful sum. `place_recovery` retains its
Task 2 tuple-of-intents return shape and accepts `readiness` as an optional
fourth argument supplied by `PlannerInputSnapshot`.

## TDD Evidence

### RED

```text
python -m pytest jarvis/domains/training/tests/test_performance_hybrid.py -q
```

Result after adding the Task 3 tests:

```text
1 error in 0.22s
ImportError: cannot import name 'apply_phase_rules'
```

The missing Task 3 phase/compression API caused the expected collection
failure before implementation.

### GREEN

```text
python -m pytest jarvis/domains/training/tests/test_performance_hybrid.py -q
```

```text
12 passed in 0.07s
```

## Broader Training Evidence

```text
python -m pytest jarvis/domains/training/tests -q
```

```text
59 failed, 183 passed in 4.35s
```

All 59 failures arise before Task 3 behavior, where
`adaptive_planner.generate_weekly_plan` still supplies planner version
`adaptive-v1` while the v2 constitution requires `adaptive-v2`. This is the
known deliberate Task 4 integration gap; no integration file was changed.

Final staged verification reproduced `12 passed in 0.07s` for the focused
module and `59 failed, 183 passed in 4.70s` for the broader Training suite.

## Self-Review

- Confirmed the hard-conflict, lower-spacing, high-neural, fatigue, and
  earlier-date ranking order matches the Task 3 pseudo-code.
- Confirmed peak and attempt operate through immutable `replace` results.
- Confirmed focused regressions cover recovery placement, 48-hour placement,
  priority compression, peak maintenance, and attempt jump exposure.
- Confirmed scoped diff contains no `adaptive_planner.py` or finance JSON
  edit.

## Final Verification

`git diff --check` and `git diff --cached --check` are clean. The staged set
contains only the two Task 3 files and this report.

## Review Follow-up Evidence

### Findings Fixed

- Lower Power is now transformed into a dated recovery day in peak and attempt
  phases, preserving immutable schedule shape and recording
  `phase_lower_removed:<phase>`.
- All transformed general days append deterministic
  `phase_maintenance:<phase>` reasons; peak jump work appends
  `phase_jump_volume_limited:peak`, and attempt jump work appends
  `phase_attempt_exposure`.
- Generated exercises now carry ordered per-block `estimated_minutes` budgets.
  Each template validates both budget count and sum against its configured
  session duration before plan construction.
- Compression sums retained block budgets, removes optional work then the last
  accessory, reports truthful retained duration, and records
  `time_compressed:floor_preserved` when the protected 40-minute floor prevents
  a requested cap.

### RED

```text
python -m pytest jarvis/domains/training/tests/test_performance_hybrid.py -q
```

After adding the review regressions:

```text
11 failed, 19 passed in 0.32s
```

The failures covered missing block budgets, synthetic compression duration,
and lower-day removal rather than auditable recovery transformation. A second
red cycle for the new budget-sum guard produced:

```text
1 failed, 30 passed in 0.25s
```

The malformed 64-minute Push Strength budget was accepted until the explicit
sum validation was restored.

### GREEN

```text
python -m pytest jarvis/domains/training/tests/test_performance_hybrid.py -q
```

```text
36 passed in 0.16s
```

Coverage now includes all six rotations, calendar precedence, fatigue and
high-neural ranking, deterministic tie-breaks, all template budgets, count and
sum validation, removal ordering, truthful retained duration, immutability,
and exact peak/attempt reasons. Task 2 equipment coverage remains intact.

### Broader Training Verification

```text
python -m pytest jarvis/domains/training/tests -q
```

```text
59 failed, 207 passed in 4.66s
```

All 59 failures still originate at the deliberate Task 4 boundary:
`adaptive_planner.generate_weekly_plan` emits `adaptive-v1` for constitution
v2, which receipt validation rejects. No integration or finance file was
edited in this follow-up.

## Final Phase-Cap Follow-up Evidence

### Findings Fixed

- Normal `compress_session` remains unchanged: it retains its ordinary
  40-minute floor and truthful block-budget sums for 40- and 50-minute
  requests.
- General Push/Pull phase maintenance is now a dedicated transform, separate
  from ordinary compression. Peak keeps ordered primary maintenance within 45
  minutes; attempt keeps only the first primary within 30 minutes.
- Phase maintenance removes accessory and optional work without clamping a
  fabricated duration, records exact phase reasons, and fails closed when the
  required first primary cannot fit the attempt cap.

### RED

```text
python -m pytest jarvis/domains/training/tests/test_performance_hybrid.py -q
```

Initial phase-cap regressions:

```text
2 failed, 35 passed in 0.32s
```

Peak and attempt still carried ordinary compression reasons instead of the
dedicated phase-maintenance output. The ordered-primary edge regression then
produced:

```text
1 failed, 37 passed in 0.29s
```

The attempt selector incorrectly fell through to a later primary after the
first primary exceeded its cap.

### GREEN

```text
python -m pytest jarvis/domains/training/tests/test_performance_hybrid.py -q
```

```text
38 passed in 0.15s
```

The focused suite verifies every peak general day is at most 45 minutes and
every attempt general day is at most 30 minutes; each duration equals the sum
of retained budgets, peak retains two ordered primaries, attempt retains one,
and normal 40/50 compression remains unchanged.

### Broader Training Verification

```text
python -m pytest jarvis/domains/training/tests -q
```

```text
59 failed, 209 passed in 4.69s
```

The 59 failures remain the known Task 4 `adaptive-v1`/`adaptive-v2` receipt
mismatch. No integration or finance file was edited.
