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

## Complete Review Finding Follow-Up

Status: DONE

### RED Evidence

Review-finding tests and source contracts were added before the corresponding production changes.

```powershell
Set-Location pwa
node --test src/components/holo/subs/budgetCategoryReviewModel.test.js src/components/holo/financeControlRoomContract.test.js
```

Result: exit code 1, `52 tests`, `40 passed`, `12 failed`.

The failures covered Finance-blue Budget identity, 920px-container responsive tracks, terminal draft locking, visible stale refresh state, truthful transaction availability, accessible repeated controls, canonical server merchant keys, the `Straße`/`strasse` casefold regression, and correction outcome metadata for 409, retryable, terminal 4xx, malformed-success, and success paths.

The final non-status red treatment found during self-review received its own contract before the production fix:

```powershell
node --test src/components/holo/financeControlRoomContract.test.js
```

Result: exit code 1, `33 tests`, `32 passed`, `1 failed` (`budget ledger, upload, Cash Policy, and Review Other use Finance blue`).

### GREEN Evidence

Focused model and source-contract verification:

```powershell
node --test src/components/holo/subs/budgetCategoryReviewModel.test.js src/components/holo/financeControlRoomContract.test.js
```

Result: exit code 0, `52 passed`, `0 failed`.

Full PWA suite:

```powershell
npm test
```

Result: exit code 0, `193 passed`, `0 failed`.

Production build:

```powershell
npm run build
```

Result: exit code 0; Vite `5.4.21` transformed `331 modules`, generated the PWA service worker, and completed in `5.74s`. The accepted existing chunk-size warning remains.

### Review Findings Verified

- Retryable failures retain an actionable draft; non-retryable 4xx, 409, malformed-success, and successful outcomes clear and lock the prior row draft.
- HTTP 409 renders `SOURCE CHANGED` while the server queue refresh runs without replacing that explanation with generic loading.
- Nonblank server `merchant_key` values are canonical. Locked display merchants are validated independently, including actionable `Straße Market` evidence with `strasse market`, while merchant-key and ordinal uniqueness remain fail-closed.
- The Review Other root is an inline-size container. Its desktop row is bounded by `minmax(0, 1fr) minmax(260px, .72fr)`, transaction evidence uses only zero-min-width tracks, and rows stack at a 760px container width before the 920px Finance surface can overlap.
- Budget summary, category, upload, memory, toggles, and remove controls use Finance cyan/neutral identity. Green, yellow, and red remain only on verified/complete, warning/stale/blocked, and unavailable/error/reconciliation states.
- Repeated `FORGET` controls include merchant-specific accessible names; symbol-only month controls expose previous/next accessible names.
- Transaction fetch loading, ready, and unavailable states are explicit, so a failed fetch cannot display `0 ROWS`.

### Follow-Up Constraints

- No deployment was run and no live Finance data was mutated.
- `jarvis/domains/finance/portfolio_state.json` was not modified.
- The pre-existing `.superpowers/sdd/progress.md` modification remains untouched and is excluded from the commit.

## Remaining Important Findings Follow-Up

Status: DONE

### RED Evidence

The model regressions and source contracts were changed before production code.

```powershell
Set-Location pwa
node --test src/components/holo/subs/budgetCategoryReviewModel.test.js src/components/holo/financeControlRoomContract.test.js
```

Result: exit code 1, `54 tests`, `52 passed`, `2 failed`.

The expected failures were:

- `Budget controls expose unique accessible names and truthful transaction availability`: Review Other Remember/Apply names and upload category/flow/month row-context names were absent.
- `empty successful response clears and locks the staged draft`: `{}` was incorrectly treated as retryable and retained the draft.

The direct `new Error('offline')` and status-503 `Error` regressions passed during RED, proving transport and 5xx retry behavior remained the required control case.

### GREEN Evidence

Focused model and source-contract verification:

```powershell
node --test src/components/holo/subs/budgetCategoryReviewModel.test.js src/components/holo/financeControlRoomContract.test.js
```

Result: exit code 0, `54 passed`, `0 failed`.

Full PWA suite:

```powershell
npm test
```

Result: exit code 0, `195 passed`, `0 failed`.

Production build:

```powershell
npm run build
```

Result: exit code 0; Vite `5.4.21` transformed `331 modules`, generated the PWA service worker, and completed in `3.90s`. The accepted existing chunk-size warning remains.

### Self-Review

- A status-less thrown `Error` and every 5xx outcome remain retryable and preserve the staged draft.
- A malformed plain success, including `{}`, clears and locks the draft with the malformed-response message; 4xx and 409 terminal behavior remains unchanged.
- Review Other category, Remember, Apply, and Forget controls carry merchant identity where repeated.
- Upload category, flow, and month controls include 1-based row number, merchant, and date, so duplicate merchants still receive unique accessible names.
- Visible control copy and Finance visual styling are unchanged.
- No deployment was run, no live Finance data was mutated, and `jarvis/domains/finance/portfolio_state.json` was not modified.
