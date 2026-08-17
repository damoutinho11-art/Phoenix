# Task 4 Report: Blue Review Other Experience

Status: DONE

## Scope

- Added the Finance > Control Room > Budget > Review Other subsection.
- Added the server-derived ledger command only when unresolved review rows are positive.
- Added auditable merchant-group corrections, learned-rule removal, retry retention, and stale-revision refresh.
- Converted Finance Budget ledger, upload, Cash Policy, category controls, and Review Other chrome to Finance cyan/blue.
- Removed every `phx-scope-budget` use from Finance Budget production modules.

## RED

Tests were changed before production JSX or model implementation.

The first attempted RED run exposed a test-file brace error and therefore did not count as valid RED. The test syntax was corrected before production code changed.

Valid RED command:

```powershell
Set-Location pwa
node --test src/components/holo/financeControlRoomContract.test.js src/components/holo/subs/budgetCategoryReviewModel.test.js
```

Result: exit code 1, `26 passed`, `5 failed`.

Expected failures proved that:

- `BudgetCategoryReview.jsx` did not exist;
- `BudgetContent.jsx` did not load or render Review Other;
- `buildCategoryCorrectionRequest` was not exported;
- Finance Budget still used the old Budget accent scope.

## GREEN

Model slice:

```powershell
node --test src/components/holo/subs/budgetCategoryReviewModel.test.js
```

Result: `15 passed`, `0 failed`.

Focused Task 4 verification:

```powershell
node --test src/components/holo/subs/budgetCategoryReviewModel.test.js src/components/holo/financeControlRoomContract.test.js
```

Result: `45 passed`, `0 failed`.

Full PWA suite:

```powershell
npm test
```

Result: `186 passed`, `0 failed`.

Production build:

```powershell
npm run build
```

Result: Vite transformed 331 modules and completed the PWA build successfully. The existing chunk-size warning remained and is allowed by the task brief.

## Behavior Verified

- Ledger renders `REVIEW OTHER` only for normalized `ready` review state with `unresolvedCount > 0`.
- Review Other is a subsection, not a modal or nested card surface.
- Date, amount, merchant, and description are explicit locked text facts.
- Apply remains disabled until a valid non-current category is selected.
- Correction payload contains only server statement ID, expected revision, canonical merchant key, exact ordinals, corrected category, and remember choice.
- Retryable errors retain the correction draft; HTTP 409 refreshes the server review.
- Active learned rules expose `FORGET`.
- Loading, malformed/error, blocked, ready, and complete states are explicit.
- Blocked state requires a verified statement and exposes no override.
- Successful corrections refresh summary, transactions, review state, and cash authority.

## Visual Structure Review

- At desktop width, each merchant row uses locked evidence on the left and controls on the right with `minmax(0, 1fr) minmax(280px, .72fr)` geometry.
- At 820 px and below, header and merchant rows stack to one column.
- At 390 px, transaction facts use a two-column zero-min-width grid; labels and values wrap instead of widening the control room.
- Category and command controls use minimum 42 px heights and visible Finance-cyan focus outlines.
- Queue rows and learned rules use separator lines and unframed instrument bands, without nested cards.
- Finance Budget production modules contain no `phx-scope-budget`, orange/gold literals, or borrowed Training/Nutrition/Calendar category accents.

## Changed Files

- `.superpowers/sdd/task-4-report.md`
- `pwa/src/components/holo/financeControlRoomContract.test.js`
- `pwa/src/components/holo/subs/BudgetCategoryReview.jsx`
- `pwa/src/components/holo/subs/BudgetContent.jsx`
- `pwa/src/components/holo/subs/budgetCategoryReviewModel.js`
- `pwa/src/components/holo/subs/budgetCategoryReviewModel.test.js`

## Constraints

- No production deployment was run.
- No live Finance data was mutated.
- `jarvis/domains/finance/portfolio_state.json` was not modified.
- The pre-existing `.superpowers/sdd/progress.md` modification was left untouched and excluded from the Task 4 commit.

## Concerns

No implementation concerns. Verification retains the accepted existing Vite chunk-size warning.
