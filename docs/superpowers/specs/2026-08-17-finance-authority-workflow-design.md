# Finance Authority Workflow Design

## Objective

Make the complete cash-authority setup and statement activation workflow usable inside Finance -> Budget without terminal access or direct database edits. Phoenix must remain advisory-only and must never create authority from manually overridden bank facts.

## Approved Safety Rules

- A statement becomes authoritative only when the server parser reconciles every recognized transaction against the statement opening balance, closing balance, and net movement with an exact zero-cent difference.
- Bank identity fields are immutable after parsing: transaction date, merchant, description, amount, and source.
- Budget classifications remain editable before save: category, inflow/outflow classification, and budget month.
- A failed or partial reconciliation never receives a statement receipt and never unlocks recommendations.
- Phoenix never connects to a broker, creates an order, executes a trade, or changes the portfolio after a recommendation.
- Cash policy changes are explicit, validated, persisted, and reflected in the authority input hash.

## Scope

### Phase 1: Complete In-App Authority Workflow

1. Upgrade a legacy cash policy to approved policy version 2 when the user explicitly saves valid Cash Policy controls.
2. Replace recurring-obligations JSON as the primary interface with structured recurring-bill rows.
3. Seed a Utilities reserve ceiling of EUR 150 for legacy profiles that have no recurring obligations.
4. Improve statement reconciliation diagnostics and actions while preserving fail-closed authority.
5. Refresh Budget authority immediately after statement activation and keep Finance Brief, recommendation, and checklist sourced from the same backend authority.

### Phase 2: Historical Reserve Suggestions

After sufficient statement history exists, Phoenix may calculate suggested recurring-bill ceilings. Suggestions are read-only until the user explicitly applies one. Phase 2 must not silently change protected cash and is not part of the Phase 1 implementation.

## Backend Design

### Cash Policy Contract

`POST /budget/memory` remains the persistence endpoint but validates the complete authority policy server-side before storing it. A successful save writes `version: 2` regardless of a legacy submitted version. Invalid money, salary cutoff, bill definitions, or category data returns HTTP 422 and does not alter stored memory.

The approved policy continues to include:

- `emergency_fund_floor_eur`
- `emergency_fund_balance_eur`
- `checking_buffer_eur`
- `food_budget_eur`
- `essential_spending_ceiling_eur`
- `salary_day_cutoff`
- `recurring_obligations`

Legacy profiles are presented with merged display defaults, including a Utilities row at EUR 150 when their raw recurring-obligations list is absent or empty. The migration is persisted only after the user presses Save.

### Recurring Bill Contract

Each recurring obligation has this canonical shape:

```json
{
  "name": "Utilities",
  "amount_eur": 150.00,
  "contains": ["utility", "electric", "water"],
  "enabled": true
}
```

`name` is a non-empty display label. `amount_eur` is a non-negative exact-cent number. `contains` is a non-empty list of non-empty case-insensitive matching terms. `enabled` is a boolean. Disabled bills remain stored for later reactivation but contribute zero to unpaid bills.

For each enabled bill, Phoenix reserves its ceiling until at least one current-month transaction contains one of its matching terms in the merchant or description. Once matched, that bill is treated as paid and its reserve is released.

### Statement Receipt Contract

`POST /budget/parse-pdf` continues to extract bank facts and issue a one-time receipt only for a fully reconciled LHV PDF. Its response adds a stable reconciliation object that always contains:

- `status`
- `statement_rows`
- `parsed_rows`
- `opening_balance_eur`
- `closing_balance_eur`
- `net_movement_eur`
- `balance_difference_eur`
- `warnings`
- `unmatched_rows`

The parser does not store the PDF. A reconciled response receives a receipt; review-required responses never receive one.

`POST /budget/save` continues to verify immutable transaction identity fields against the receipt while allowing category, inflow/outflow, and budget-month changes. Receipt consumption, transaction persistence, and authoritative statement snapshot creation remain atomic.

## PWA Design

### Budget Header

Rename the `MEMORY` command to `CASH POLICY`. Keep it beside the Monthly Ledger label so it remains discoverable without adding another Finance lane.

### Cash Policy Screen

Show normal controls for every authority input. The policy version is not user-editable. A legacy policy displays `UPGRADE REQUIRED`; after all fields validate, the primary command reads `SAVE & UPGRADE POLICY`. Current policies use `SAVE CASH POLICY`.

Recurring bills appear as compact repeated rows with:

- enabled toggle
- bill name
- monthly reserve ceiling
- comma-separated matching terms
- remove command

An `ADD BILL` command appends a disabled empty row. Empty or malformed rows block save with a field-specific message. The advanced JSON editor may remain for non-authority category memory, but it must not be required for cash-policy setup.

### Statement Intake Screen

The PDF path is visually primary. Paste Text remains available for non-authoritative ledger imports and is explicitly labeled `LEDGER ONLY`.

After PDF parsing, the review screen contains:

1. A reconciliation summary showing rows parsed, opening balance, closing balance, movement, and difference.
2. A `BANK FACTS LOCKED` label over immutable values.
3. Editable category, flow, and budget month controls.
4. A primary `SAVE & ACTIVATE AUTHORITY` command only when a valid receipt exists.

When reconciliation fails, the screen shows the exact warnings and unmatched rows, disables authority activation, and provides `RE-PARSE PDF`. It does not offer an override.

### Success State

After receipt consumption, return to Budget and refresh the selected month's summary and authority. Show `AUTHORITY VERIFIED` with deployable capacity, weekly budget, protected cash, remaining weekly windows, and statement date. Subsequent visits to Brief, Approve, and Decisions read the updated authority from their existing backend routes.

## Error Handling

- Legacy policy: show upgrade status and keep authority blocked until a validated explicit save.
- Invalid bill: identify the row and invalid field; do not send the request.
- Backend policy rejection: retain entered values and display the server error.
- Scanned or unreadable PDF: explain that a text-based bank export is required.
- Partial parser result: show unmatched rows and balance difference; do not issue or accept a receipt.
- Expired, consumed, or mismatched receipt: require a new parse and preserve no false success state.
- Network failure: retain a still-valid receipt for retry; terminal receipt failures clear it.
- Cross-surface disagreement: Finance remains blocked under the existing authority validator.

## Testing Strategy

### Backend

- Legacy version 1 policy becomes version 2 only after a valid save.
- Invalid policy saves return 422 without changing stored memory.
- Utilities defaults to an enabled EUR 150 ceiling for legacy empty profiles.
- Enabled unmatched bills remain protected; matching transactions release the reserve; disabled bills do not reserve cash.
- Reconciliation responses expose complete diagnostics for success and failure.
- Receipt identity rejects changes to bank facts and permits classification-only edits.
- Budget authority, recommendation, checklist, and brief continue to agree exactly.

### Frontend

- Legacy policies show the upgrade action and submit version 2 through the validated policy model.
- Recurring bill rows add, edit, enable, disable, and remove without raw JSON editing.
- Invalid rows block save with stable messages.
- Reconciled PDFs show locked facts and the activation command.
- Review-required PDFs show diagnostics and no authority override.
- Receipt success refreshes authority; receipt terminal errors require a re-parse.
- Desktop and 390 px mobile layouts preserve the existing Finance visual system and orange Budget accent.

## Acceptance Criteria

The workflow is complete when a user can, entirely within Finance -> Budget:

1. Review and save a valid cash policy, upgrading a legacy profile to version 2.
2. Maintain a EUR 150 Utilities reserve through structured controls.
3. Upload a text-based LHV statement PDF.
4. Understand whether it reconciled and why it failed when it did not.
5. Edit only budgeting classifications while bank facts remain locked.
6. Activate authority only from a valid one-time receipt.
7. See the same weekly budget in Budget, Brief, recommendation, and checklist.

No acceptance path may require terminal access, direct JSON editing, database changes, or a manual bank-fact override.
