# Finance Review Other: Task 5 Verification

Date: 2026-08-24
Branch: `codex/finance-review-other`
Merge base: `55d3b2ee499a04ff1908c4b64b0fc3386a4fcbf1`

## Automated verification

- Finance backend matrix: 449 passed.
- PWA suite: 196 passed.
- Vite/PWA production build: passed. The existing chunk-size warning remains advisory.
- Isolated Finance smoke gate: accepted in `local_offline` mode with
  `DATA_TRANSPARENT`, `READY_FOR_MANUAL_REVIEW`, and equal authority,
  recommendation, and checklist budgets of EUR 115.38. Every trading safety
  flag remained false.

## Browser verification

The browser QA used a temporary SQLite database and a local build pointed at a
temporary backend. No live Finance records were used or changed.

Verified at 1440 x 900 and 390 x 844:

- repeated `Other` transactions grouped by normalized merchant;
- statement date, amount, merchant, and description displayed as locked facts;
- merchant memory enabled by default;
- category selection enabled the correction command;
- an externally advanced revision produced a stale request and the UI recovered
  by refreshing instead of overwriting newer data;
- a food correction moved the verified statement rows into `Food & Groceries`;
- learned merchant rules were listed and could be forgotten;
- the zero-open state rendered `CLASSIFICATION COMPLETE`;
- a ledger-only text row did not enter the verified statement review queue;
- Finance chrome remained cyan/blue with neutral text and no orange category
  identity styling;
- document width remained 390 px at the mobile viewport with no horizontal page
  overflow;
- browser console contained no Phoenix warnings or errors.

The temporary browser scenario also returned equal weekly budgets of EUR 50.00
from investment capacity, recommendation, and manual checklist after review
mutations.

## Regression fixed during Task 5

Finance route tests now patch the dependency actually imported by the Finance
router. The Finance authority boundary also converts an unexpected authority
builder exception into blocked authority, preserving fail-closed behavior for
recommendation, brief, data coverage, and checklist consumers.

The final branch review additionally found and resolved three consistency
defects: learned rules now preserve immutable bank direction in deterministic
and AI parsing, same-merchant credits and debits are reviewed in separate
direction groups, and the compatibility ledger projection updates only one
matching row using its previous effective category.

## Residual notes

- ETF and crypto research may report unavailable third-party market symbols;
  this is handled as research evidence and did not change the manual-only safety
  contract.
- The duplicate deterministic learned-rule lookup was removed while enforcing
  direction compatibility.
