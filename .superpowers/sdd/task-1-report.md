# Task 1 Report: Audited Category Overlay Persistence

## Implementation

Implemented additive, auditable category overlays in `jarvis/data/database.py`.

- Added idempotent `budget_category_corrections` and
  `budget_learned_merchant_rules` tables with their requested indexes.
- Added NFC, whitespace-collapsing, casefolded merchant normalization.
- Added effective immutable-statement projection, month-scoped verified-source
  lookup, deterministic per-import correction revisions, and stale-revision
  conflict handling.
- Added one `BEGIN IMMEDIATE` correction transaction that validates ownership,
  group membership, category, and ordinal shape before atomically upserting
  overlays and an optional learned rule.
- Added active-rule retrieval and non-destructive rule deactivation.

The immutable `budget_statement_import_transactions` table is read only for
this feature. `jarvis/domains/finance/portfolio_state.json` was not modified.

## Files

- Modified: `jarvis/data/database.py`
- Modified: `jarvis/api/tests/test_budget_routes.py`
- Created: `.superpowers/sdd/task-1-report.md`

## RED Evidence

Initial RED command:

```powershell
python -m pytest jarvis/api/tests/test_budget_routes.py -k "category_correction_schema or category_correction_preserves_import or duplicate_authoritative or learned_merchant" -q
```

Output: `3 failed, 242 deselected in 5.43s`.

- Schema test failed because neither correction table existed.
- Correction test failed with missing
  `database.apply_budget_category_correction`.
- Duplicate-row test failed with missing
  `database.get_budget_correction_revision`.

Additional RED regression for import-scoped revisions:

```powershell
python -m pytest jarvis/api/tests/test_budget_routes.py -k "revision_is_scoped" -q
```

Output: `1 failed, 245 deselected in 4.94s`; an unrelated import incorrectly
caused `BudgetCorrectionConflict`.

Additional RED for the source lookup interface:

```powershell
python -m pytest jarvis/api/tests/test_budget_routes.py -k "category_review_source" -q
```

Output: `1 failed, 246 deselected in 4.53s`; the public function was absent.

## GREEN And Regressions

```powershell
python -m pytest jarvis/api/tests/test_budget_routes.py -k "category_correction or category_review_source or learned_merchant or duplicate_authoritative" -q
```

Output: `6 passed, 241 deselected in 6.54s`.

```powershell
python -m pytest jarvis/api/tests/test_budget_routes.py -q
```

Output: `247 passed in 83.40s (0:01:23)`.

```powershell
python -m pytest jarvis/data/tests/test_database.py -q
python -m compileall -q jarvis/data/database.py
git diff --check
```

Output: `56 passed in 24.52s`; compilation and whitespace checks exited 0.

## Self-Review

- Verified schema creation is idempotent across two `init_db()` calls.
- Verified raw statement-import rows compare equal before and after correction.
- Verified repeated same-day/same-merchant/same-amount authoritative rows remain
  distinct by ordinal.
- Verified invalid ordinals roll back both correction and learned-rule writes.
- Verified correction revision compares only rows for the target import.
- Verified learned-rule deactivation does not remove existing correction overlays.
- Verified the changed-file list excludes `portfolio_state.json`.

## Concerns

None for Task 1. Later Review Other tasks must consume the effective projection
rather than raw statement rows wherever category-based calculations are shown.

## Review Fix Evidence

### Findings Addressed

- Critical: corrections now reject a statement import that is no longer the
  active latest receipt-verified, reconciled statement source.
- Important: corrections now preserve immutable income direction. Income rows
  accept only `Income`; debit rows reject `Income` while retaining valid debit
  classifications including `Investment`, `Emergency Fund`, and `Transfers`.

### RED

```powershell
python -m pytest jarvis/api/tests/test_budget_routes.py -k "replaced_statement_import or immutable_direction or non_spending_categories_for_debits" -q
```

Output: `3 failed, 3 passed, 247 deselected in 6.80s`.

- The replaced-import regression failed with `DID NOT RAISE
  BudgetCorrectionConflict`.
- The income-to-spending and expense-to-income regressions each failed with
  `DID NOT RAISE ValueError`.

### GREEN

```powershell
python -m pytest jarvis/api/tests/test_budget_routes.py -k "replaced_statement_import or immutable_direction or non_spending_categories_for_debits or category_correction or category_review_source or learned_merchant or duplicate_authoritative" -q
```

Output: `12 passed, 241 deselected in 8.75s`.

```powershell
python -m pytest jarvis/api/tests/test_budget_routes.py -q
```

Output: `253 passed in 85.71s (0:01:25)`.

### Fix Self-Review

- The active-source check executes after `BEGIN IMMEDIATE`, before revision or
  row writes, and raises `BudgetCorrectionConflict` for route-level HTTP 409
  mapping.
- The direction check uses immutable authoritative `is_income` values loaded
  in the same transaction.
- No raw statement transaction or portfolio-state file is modified by either
  guard.
