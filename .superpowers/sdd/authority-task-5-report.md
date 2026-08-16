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
