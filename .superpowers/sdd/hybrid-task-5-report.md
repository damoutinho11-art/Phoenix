# Hybrid Task 5 Report

Status: DONE_WITH_CONCERNS

## Scope

- Added nullable `session_intent`, `sequence_position`, and `sequence_length`
  columns to immutable training session evidence.
- Added an idempotent migration that preserves genuine legacy rows.
- Extended `SessionLogRequest` with typed hybrid sequence fields.
- Validated `adaptive-v2` completion evidence exactly against the active
  receipt day before insert.
- Preserved planned-session idempotency, rejected conflicting retries, and
  kept legacy session serialization compatible with progression.
- Rejected unlinked hybrid evidence on unplanned session requests.

## TDD Evidence

### RED: migration and API lifecycle

Command:

```text
python -m pytest jarvis/data/tests/test_database.py jarvis/api/tests/test_training_tracker.py -q
```

Result: `5 failed, 72 passed in 19.00s`.

Expected failures:

- legacy evidence schema had no `session_intent` column;
- hybrid payloads were rejected as unknown request fields;
- mismatch and persistence lifecycle assertions could not reach the router.

### GREEN: migration and API lifecycle

Command:

```text
python -m pytest jarvis/data/tests/test_database.py jarvis/api/tests/test_training_tracker.py -q
```

First result: `1 failed, 76 passed in 18.33s`.

The failure exposed a legacy compatibility regression: nullable hybrid keys
on unplanned rows were interpreted as malformed hybrid progression evidence.
Serialization was corrected to preserve the legacy row shape.

Final result after adding the unlinked-evidence fail-closed case:
`78 passed in 18.07s`.

### RED/GREEN: unlinked hybrid claims

Command:

```text
python -m pytest jarvis/api/tests/test_training_tracker.py::TrainingTrackerTests::test_unplanned_session_rejects_unlinked_hybrid_sequence_claims -q
```

RED result: `1 failed in 2.04s`; the request incorrectly returned `200`.

The model validator now requires plan provenance whenever any hybrid sequence
field is supplied. This case is included in the final 78-test GREEN run.

## Regressions

Command:

```text
python -m pytest jarvis/domains/training/tests/test_plan_evidence.py jarvis/domains/training/tests/test_adaptive_planner.py -q
```

Result: `80 passed in 0.30s`.

Command:

```text
python -m pytest jarvis/domains/training/tests jarvis/api/tests/test_training_plan_routes.py jarvis/api/tests/test_training_tracker.py jarvis/data/tests/test_database.py --ignore=jarvis/domains/training/tests/test_plan_acceptance.py -q
```

Result: `404 passed, 5 failed in 35.35s`.

The five failures are existing Hybrid Task 6 authority/version expectations:

- one legacy recovery-placement route assertion;
- two public-rules assertions expecting `adaptive-v1`;
- two live-authority/apply assertions awaiting the v2 acceptance gate.

No Task 5 persistence, migration, tracker, planner-evidence, or progression
test failed in the final focused runs.

## Quality Checks

- `git diff --check`: exit `0` (PowerShell checkout emitted line-ending
  conversion warnings only).
- `jarvis/domains/finance/portfolio_state.json` remained unstaged and was not
  edited by Task 5.

## Concerns

- The five known Task 6 route failures remain intentionally unresolved in
  this task and must be closed by Hybrid Task 6.

## Review Fix: Reject Legacy Hybrid Claims

Finding: Important. The initial router validated hybrid sequence evidence only
for `adaptive-v2`. A planned completion linked to an adaptive-v1 or otherwise
legacy receipt could therefore submit any non-null `session_intent`,
`sequence_position`, or `sequence_length` and persist that untrusted claim in
immutable session evidence.

Fix: the router now separates plan versions at the completion boundary:

- `adaptive-v2` must exactly match all three fields on the authoritative plan
  day;
- every non-v2 plan must provide all three fields as null;
- genuine legacy completions with all three fields absent retain their
  existing persistence and idempotency behavior.

### RED

Command:

```text
python -m pytest jarvis/api/tests/test_training_tracker.py::TrainingTrackerTests::test_legacy_plan_completion_rejects_any_hybrid_sequence_evidence -q
```

Result: all three field-specific subtests failed because each request returned
`200` instead of `409`.

### GREEN

Command:

```text
python -m pytest jarvis/api/tests/test_training_tracker.py::TrainingTrackerTests::test_legacy_plan_completion_rejects_any_hybrid_sequence_evidence jarvis/api/tests/test_training_tracker.py::TrainingTrackerTests::test_planned_completion_returns_idempotent_replay -q
```

Result: `2 passed, 3 subtests passed in 2.62s`.

Focused Task 5 command:

```text
python -m pytest jarvis/data/tests/test_database.py jarvis/api/tests/test_training_tracker.py -q
```

Result: `79 passed, 3 subtests passed in 18.75s`.

Relevant broad command:

```text
python -m pytest jarvis/domains/training/tests jarvis/api/tests/test_training_plan_routes.py jarvis/api/tests/test_training_tracker.py jarvis/data/tests/test_database.py --ignore=jarvis/domains/training/tests/test_plan_acceptance.py --deselect=jarvis/api/tests/test_training_plan_routes.py::test_proposal_passes_latest_import_to_real_resolver_and_uses_its_performance_events --deselect=jarvis/api/tests/test_training_plan_routes.py::test_history_and_rules_return_readable_detail --deselect=jarvis/api/tests/test_training_plan_routes.py::test_rules_whitelist_excludes_private_policy_fields --deselect=jarvis/api/tests/test_training_plan_routes.py::test_live_generated_proposals_are_authoritative_after_runtime_replay --deselect=jarvis/api/tests/test_training_plan_routes.py::test_live_apply_replays_generated_proposal_without_exact_allowlist -q
```

Result: `406 passed, 5 deselected, 3 subtests passed in 34.55s`.
