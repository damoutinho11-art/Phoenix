# Authority Task 4 Report

## Status

Complete. Commit `99f1d2500e00dc0e829ec2b8ac9242a893062223`
(`feat(budget-ui): model cash policy workflow`) adds the pure frontend cash-policy
editor and reconciliation model only.

## Delivered

- `createDefaultUtilityBill()` supplies the canonical EUR 150 Utilities draft.
- `preparePolicyEditor()` makes string-based monetary and matching-term drafts
  without mutating a legacy profile.
- `validateAuthorityPolicyDraft()` converts validated structured bill rows into
  canonical API values, retains disabled bills, returns row-specific errors, and
  upgrades the returned profile to version 2 only after full validation.
- `reconciliationView()` produces stable metrics, warnings, and unmatched-row
  diagnostics; activation requires a reconciled, exact-zero balance difference
  and a non-empty receipt ID.

## TDD Evidence

RED: `node --test src/components/holo/subs/budgetAuthorityModel.test.js` failed
because `createDefaultUtilityBill` was not exported.

GREEN: the same focused command passed 13 tests after implementation.

## Verification

- `npm test`: 160 passing, 0 failing.
- `npm run build`: successful Vite production build.
- `git show --check HEAD`: clean.

## Self-Review

The commit is limited to `budgetAuthorityModel.js` and its test file. Existing
exports remain intact other than the deliberately tested structured-bills input
contract for `validateAuthorityPolicyDraft`. `BudgetContent.jsx`,
`progress.md`, and `portfolio_state.json` were not changed.

## Concerns

Task 5 must wire `BudgetContent.jsx` from its legacy JSON recurring-obligations
draft into the new structured-bills interface. The Vite build reports its
pre-existing chunk-size advisory, but completes successfully.

## Review Fixes

### Summary

The Task 4 model now accepts both the structured editor bill array and the
legacy JSON string still supplied by `BudgetContent.jsx`. Parsed legacy rows are
normalized into the same draft shape and pass through the existing canonical
row validation. No React source was modified.

`validRecurringObligations()` now verifies the full server canonical contract:
non-empty `name`, finite non-negative exact-cent `amount_eur`, non-empty string
terms, and a strict boolean `enabled` value.

Reconciliation metrics render every malformed fractional-cent monetary value as
`—`, and all four monetary evidence fields must be exact cents before authority
activation is possible.

### Files

- `pwa/src/components/holo/subs/budgetAuthorityModel.js`
- `pwa/src/components/holo/subs/budgetAuthorityModel.test.js`
- `.superpowers/sdd/authority-task-4-report.md`

### TDD Evidence

RED command:

```text
node --test src/components/holo/subs/budgetAuthorityModel.test.js
```

Result: 13 passing and 3 failing tests. The expected failures were legacy JSON
input returning `ok: false`, invalid name/enabled rows passing
`validRecurringObligations`, and `0.004` formatting as `EUR 0.00`.

GREEN command:

```text
node --test src/components/holo/subs/budgetAuthorityModel.test.js
```

Result: 16 passing, 0 failing.

### Verification

- `npm test`: 163 passing, 0 failing.
- `npm run build`: successful Vite production build.
- `git diff --check`: clean before commit.

### Self-Review

The legacy JSON path is covered by a UI-style profile row and converges on the
same canonical output as the structured path. Fractional-cent values are tested
across opening, closing, net-movement, and difference metrics, with activation
remaining closed in each case. `BudgetContent.jsx` and `progress.md` are not
part of this fix commit.
