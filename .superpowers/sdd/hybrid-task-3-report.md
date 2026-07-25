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

The brief's compression pseudo-code assumes `estimate_minutes(exercises)`, but
the immutable `PlanDay` exercise payload has no duration field. The pure
module therefore estimates 15 minutes per retained exercise. `PlanDay` remains
immutable, and its public `estimated_minutes` field is updated using the
specified compression floor/cap rules. `place_recovery` retains its Task 2
tuple-of-intents return shape and accepts `readiness` as an optional fourth
argument supplied by `PlannerInputSnapshot`.

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
