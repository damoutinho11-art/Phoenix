# Task 5 Report: Cash Policy And Locked Statement Review UI

## Status

Complete.

## Commit

- `bc76b27` - `feat(budget-ui): complete cash authority workflow`

## Delivered

- Renamed the Budget memory command and editor surface to Cash Policy.
- Consumed `migration_required` through `preparePolicyEditor` and added explicit legacy upgrade copy.
- Replaced recurring-obligations JSON with structured enabled, name, reserve, matching-term, add, and remove controls.
- Kept category lanes, merchant memory, and advanced non-authority memory available.
- Made PDF the first statement input and marked Paste Text as ledger-only.
- Rendered reconciliation metrics, warnings, and bounded unmatched rows through `reconciliationView`.
- Displayed date, merchant, description, and amount as locked bank facts; only category, flow, and month remain editable.
- Limited authority activation to a reconciled zero-difference PDF receipt; no override exists.

## TDD Evidence

- RED: `node --test src/components/holo/financeControlRoomContract.test.js`
  - 4 expected contract failures against the prior MEMORY, raw JSON, text-first, and generic save UI.
- Focused GREEN: `node --test src/components/holo/subs/budgetAuthorityModel.test.js src/components/holo/financeControlRoomContract.test.js`
  - 43 passed, 0 failed.
- Full PWA: `npm test`
  - 166 passed, 0 failed.
- Production build: `npm run build`
  - Successful Vite/PWA build.
  - Existing chunk-size warning remains.
- Integrity: `git diff --check`
  - No whitespace errors.

## Responsive Review

- Browser-checked at `1440x900` and `390x844`.
- Cash Policy controls and the PDF-first entry screen had no horizontal control overflow.
- The 390 px command labels wrapped within their controls.
- Finance blue remained the primary chrome; no new Budget-orange chrome was introduced.

## Self-Review

No actionable code issues found. Authority validation stays in `budgetAuthorityModel`; React only projects editor state and view-model results. The statement receipt remains the only activation path, and text imports remain ledger-only.

## Concerns

- Browser QA could not exercise a real post-parse statement review because the workspace has no PDF statement fixture and the local text parser returned an unrelated backend 500 for synthetic text. The locked review, reconciliation, and fail-closed activation contracts are covered by the focused model and source-contract tests.
- `.superpowers/sdd/progress.md` had pre-existing user changes and was not modified. `portfolio_state.json` was not touched.

## Review Fix: Terminal Receipts And Budget Scope

### Status

Complete.

### Delivered

- Classified `Statement receipt snapshot is invalid` and `Statement receipt expiry is invalid` as terminal receipt failures, clearing the receipt and requiring a fresh PDF parse.
- Applied `phx-scope-budget` to the Budget ledger, statement upload, and Cash Policy roots so ACC-driven controls use the Budget gold/orange accent while Finance chrome outside those roots remains cyan.
- Added model and source-contract coverage for both review findings.

### TDD Evidence

- RED: `node --test src/components/holo/subs/budgetAuthorityModel.test.js src/components/holo/financeControlRoomContract.test.js`
  - 44 tests total: 42 passed, 2 failed as expected.
  - The scope contract failed with `0 !== 3` because none of the three Task 5 roots had `phx-scope-budget`.
  - The receipt model test showed the snapshot-invalid response incorrectly retained `receipt-1` with `reuploadRequired: false`.
- Focused GREEN: `node --test src/components/holo/subs/budgetAuthorityModel.test.js src/components/holo/financeControlRoomContract.test.js`
  - 44 passed, 0 failed.
- Full PWA: `npm test`
  - 167 passed, 0 failed.
- Production build: `npm run build`
  - Successful Vite/PWA build; 329 modules transformed.
  - Existing chunk-size warning remains for the main bundle.
- Integrity: `git diff --check`
  - No whitespace errors.

### Files

- `pwa/src/components/holo/subs/budgetAuthorityModel.js`
- `pwa/src/components/holo/subs/budgetAuthorityModel.test.js`
- `pwa/src/components/holo/subs/BudgetContent.jsx`
- `pwa/src/components/holo/financeControlRoomContract.test.js`
- `.superpowers/sdd/authority-task-5-report.md`

### Self-Review

No actionable issues found. The terminal matcher is limited to the two new server responses and preserves retry behavior for transient failures. The contract asserts exactly three scoped Task 5 roots, and the scope stays inside Budget content so surrounding Finance chrome keeps its cyan accent. Financial validation remains in `budgetAuthorityModel`, with no duplicate React validation and no receipt override.

### Concerns

- The production build still reports its existing main-chunk size warning.
- `.superpowers/sdd/progress.md` remains a pre-existing user modification and was not touched. `portfolio_state.json` was not touched.

## Re-review Fix: Stable Terminal Receipt Contract

### Status

Complete.

### Delivered

- Added `BudgetStatementReceiptError` as the typed database signal for receipts that cannot be retried and must be replaced by a fresh server parse.
- Normalized every typed receipt failure at `POST /budget/save` to the stable `STATEMENT_RECEIPT_INVALID` API detail while preserving internal diagnostic messages.
- Replaced frontend validator-message enumeration with exact classification of the stable API detail.
- Preserved retryability for ordinary transaction validation failures, which remain plain `ValueError` responses and retain the current receipt.
- Rejected timezone-naive stored expiries through the same terminal contract instead of allowing an aware/naive datetime comparison to escape as a server error.

### TDD Evidence

- Initial backend RED: `python -m pytest jarvis/api/tests/test_budget_routes.py -k "forged_statement_receipt_id or statement_receipt_transaction_mismatch or replayed_statement_receipt or expired_statement_receipt or receipt_save_rolls_back or normalizes_every_corrupt" -q`
  - 16 selected: 1 passed and 15 failed as expected because receipt errors still exposed validator-specific prose.
  - Corrupt snapshot cases covered balance difference, parser, quality status, statement date, both row counts, and filename hash.
  - The retryable transaction-validation case passed during RED, proving the terminal boundary must remain narrower than all receipt-backed save errors.
- Frontend RED: `node --test src/components/holo/subs/budgetAuthorityModel.test.js`
  - 17 total: 16 passed and 1 failed as expected because `STATEMENT_RECEIPT_INVALID` retained `receipt-1` with `reuploadRequired: false`.
- Expiry-edge RED: `python -m pytest jarvis/api/tests/test_budget_routes.py -k "timezone_naive_receipt_expiry" -q`
  - 1 failed as expected with `TypeError: can't compare offset-naive and offset-aware datetimes`.
- Backend focused GREEN: `python -m pytest jarvis/api/tests/test_budget_routes.py -k "forged_statement_receipt_id or statement_receipt_transaction_mismatch or replayed_statement_receipt or expired_statement_receipt or timezone_naive_receipt_expiry or receipt_save_rolls_back or normalizes_every_corrupt" -q`
  - 17 passed, 213 deselected.
- Frontend focused GREEN: `node --test src/components/holo/subs/budgetAuthorityModel.test.js src/components/holo/financeControlRoomContract.test.js`
  - 44 passed, 0 failed.
- Full relevant Python: `python -m pytest jarvis/domains/finance/tests jarvis/data/tests/test_database.py jarvis/api/tests/test_budget_routes.py jarvis/api/tests/test_finance_routes.py jarvis/api/tests/test_finance_brief_route.py jarvis/api/tests/test_finance_manual_buy_checklist.py jarvis/api/tests/test_finance_data_coverage.py -q`
  - 468 passed, 0 failed.
- Full PWA: `npm test`
  - 167 passed, 0 failed.
- Production build: `npm run build`
  - Successful Vite/PWA build; 329 modules transformed.
  - Existing chunk-size warning remains for the main bundle.

### Files

- `jarvis/data/database.py`
- `jarvis/api/routers/budget.py`
- `jarvis/api/tests/test_budget_routes.py`
- `pwa/src/components/holo/subs/budgetAuthorityModel.js`
- `pwa/src/components/holo/subs/budgetAuthorityModel.test.js`
- `.superpowers/sdd/authority-task-5-report.md`

### Self-Review

No actionable issues found. Receipt validity is now expressed by exception type inside persistence and one stable wire value at the API boundary; neither the route nor the UI depends on individual validator messages. Snapshot corruption, missing/replayed/expired receipts, and immutable transaction mismatches all require re-upload, while correctable transaction validation still permits retry with the same receipt. The change does not alter ledger-only text imports or authority activation rules.

### Concerns

- The production build still reports its existing main-chunk size warning.
- `.superpowers/sdd/progress.md` remains a pre-existing user modification and was not touched. `portfolio_state.json` was not touched.
