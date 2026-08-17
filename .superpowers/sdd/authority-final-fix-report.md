# Finance Authority Final Review Fix Report

Date: 2026-08-17

## Scope

Resolved every finding from the final whole-branch review at base head `9e1fd16`:

1. Receipt-free ledger rows could alter cash-flow authority.
2. An exact one-cent statement difference was classified as reconciled.
3. Cash Policy save accepted EUR values above the authority engine limit.
4. Recurring-bill names and matching terms retained surrounding whitespace.

## Root Cause And Fix

### Verified transaction provenance

The reconciled snapshot recorded that a server PDF receipt was consumed, but the shared `budget_transactions` rows did not record which verified import produced them. Authority therefore combined a verified balance with editable ledger rows.

The receipt-consumption transaction now creates a random `statement_import_id`, writes an immutable ordered copy of every reviewed PDF row to `budget_statement_import_transactions`, links the authoritative snapshot to that import, and consumes the receipt in the same `BEGIN IMMEDIATE` transaction. Cash-flow authority reads only that linked import and requires its row count to equal the trusted `parsed_rows` count. Missing, incomplete, malformed, or mixed provenance blocks with a zero weekly budget.

Receipt-free text rows remain supported in `budget_transactions` for ledger use. They cannot enter the immutable statement-import table, alter the authority summary, or release a recurring-bill reserve. The existing ledger uniqueness contract is unchanged. The authority table uses `(statement_import_id, ordinal)`, so legitimate identical same-day, same-merchant, same-amount rows remain distinct authority evidence.

### Exact reconciliation

Statement quality now adds a warning for every nonzero rounded balance difference. Exact `+0.01` and `-0.01` differences return `review_required` diagnostics and never receive a statement receipt.

### Shared monetary bound

The authority engine's `MAX_SAFE_EUROS` (`EUR 1e20`) is now the shared bound used by Cash Policy save validation. A successful policy save is therefore structurally acceptable to the authority engine.
The PWA policy editor enforces the same upper bound before sending a save request.

### Canonical recurring bills

Canonical policy save trims recurring-bill names and every `contains` term before validating and persisting the version 2 profile. Matching therefore uses the same canonical text that the UI receives back.

## Migration And Backward Compatibility

- `init_db()` idempotently adds nullable `budget_statement_snapshots.statement_import_id` and creates the immutable import table and indexes.
- Existing ledger rows and statement history are preserved without modification.
- Historical snapshots cannot be linked safely to a specific subset of shared ledger rows, so they are intentionally not backfilled. A legacy receipt-verified snapshot without `statement_import_id` fails closed until the user imports one fresh reconciled PDF.
- Receipt-free `/budget/save` behavior and existing ledger reads/summaries remain unchanged.
- Existing ledger deduplication remains unchanged; duplicate preservation is isolated to authoritative import evidence by ordinal.

## TDD Evidence

The new regressions failed against head `9e1fd16` for the expected reasons:

- Cash Policy save returned `200` for `1e21`.
- Recurring names and terms retained whitespace.
- Exact one-cent PDFs reached the later receipt validator and returned `422`.
- A ledger-only income/utility row changed weekly authority from `EUR 36.67` to `EUR 86.67`.
- No statement import provenance schema or loader existed.
- Duplicate authority rows had no durable ordered representation.

After implementation, the focused provenance, migration, reconciliation, bound, trimming, and duplicate-row set passed: `10 passed`. Additional red-green boundary tests cover receipt transaction-count consistency and PWA/backend monetary-bound parity.

## Verification

- Budget route suite: `240 passed` after the final migration/tamper assertions.
- Full Finance backend matrix: `422 passed in 52.11s`.
- PWA tests: `168 passed`, `0 failed`.
- PWA production build: successful, `329 modules transformed`.
- Local isolated production smoke gate: accepted; authority, recommendation, and checklist each reported `EUR 115.38`; every trading safety flag was `false`.
- `git diff --check`: clean.

The Vite build retains its pre-existing accepted chunk-size warning. No production or user database, portfolio file, or `.superpowers/sdd/progress.md` was modified.
