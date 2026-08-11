# Finance Cash-Flow Authority Bridge Design

## Status

Approved in conversation on 2026-08-11. Awaiting written-spec review before implementation planning.

## Objective

PHOENIX must calculate the weekly investment budget from verified household cash flow instead of reading the fixed `weekly_investment_budget` value from portfolio state. PHOENIX retains decision autonomy inside the approved policy; the user remains the manual execution layer.

## Confirmed Policy

- Emergency-fund floor: EUR 5,000.
- Emergency-fund monthly contribution: EUR 0 while the verified balance is at least EUR 5,000.
- Everyday-account floor: EUR 300. This is a persistent minimum balance, not a monthly contribution.
- Monthly food reserve: EUR 200.
- Monthly essential-spending ceiling: EUR 950, used as a sustainability guardrail rather than an automatic unpaid obligation.
- Known unpaid bills are reserved at their exact amount.
- The emergency fund is excluded from deployable cash and portfolio allocation.
- Buys remain weekly and manual.

## Current Gap

The Budget domain stores bank transactions and monthly totals in SQLite. The Finance recommendation loads portfolio state independently, and the engine reads `weekly_investment_budget` directly. The live Railway recommendation therefore remains EUR 115.38 even when Budget cash flow changes.

Budget currently has no durable reconciled account-balance snapshot. Finance freshness checks cover portfolio holdings and prices, but not household cash-flow freshness. Emergency-fund contributions are tracked, but the actual emergency-fund balance and policy floor are not authoritative recommendation inputs.

## Architecture

### 1. Cash-Flow Policy

Extend the durable Budget memory profile with versioned policy fields:

- `emergency_fund_floor_eur`
- `emergency_fund_balance_eur`
- `checking_buffer_eur`
- `food_budget_eur`
- `essential_spending_ceiling_eur`
- expected recurring obligations and their matching rules

The initial approved values are 5000, 5000, 300, 200, and 950 respectively. Policy changes are explicit user-owned constitution changes; PHOENIX cannot alter them.

### 2. Reconciled Cash Snapshot

Persist statement-level metadata when a reconciled PDF import is saved:

- closing balance
- statement end date
- import timestamp
- parser and reconciliation status
- parsed and expected row counts
- reconciliation difference
- source filename hash, not the source document

Only a statement with `reconciled` status and zero balance difference can become the active checking-balance snapshot. A review-required or AI-fallback parse can populate Budget review UI but cannot authorize investing.

### 3. Cash-Flow Authority Calculator

Create one deterministic service that combines the active cash snapshot, current-month transactions, approved policy, pending recurring obligations, and applied investment transactions.

The calculator produces:

```text
remaining_food = max(0, food_budget - recorded_grocery_spending)

cash_capacity = max(
  0,
  checking_balance
  - checking_buffer
  - remaining_food
  - exact_unpaid_bills
)

sustainable_capacity = max(
  0,
  income
  - max(essential_spending_ceiling, actual_spending + exact_unpaid_bills + remaining_food)
  - emergency_fund_contributions
  - investments_already_made
)

deployable_capacity = min(cash_capacity, sustainable_capacity)
weekly_budget = deployable_capacity / remaining_weekly_buy_windows
```

Discretionary eating out counts as actual spending but does not increase the protected food reserve. Applied investments are deducted so the same cash cannot be allocated twice. Currency calculations use integer cents and deterministic rounding.

If the emergency-fund balance is below its floor, the shortfall is reserved before investments. At or above EUR 5,000, no further emergency-fund contribution is required.

### 4. Weekly Windows

The calculator uses the existing weekly Finance lifecycle. It counts the current open cycle plus remaining weekly cycles before the next expected income date. A completed or deferred cycle is not counted twice. New salary, a new reconciled statement, a recorded purchase, or a policy change invalidates the prior calculation and produces a new receipt.

### 5. Finance Integration

The Finance router requests an authoritative cash-flow decision before calling the allocation engine. It copies portfolio state in memory and replaces only the recommendation input budget with the calculated weekly amount. It does not mutate portfolio state or the underlying bank data.

The recommendation response includes a cash-flow authority block containing:

- calculated weekly budget and total deployable capacity
- checking balance and snapshot date
- protected buffer, food, bills, and emergency shortfall
- remaining weekly windows
- policy version and input hash
- readiness, blockers, and provenance

All briefs, buy sequences, receipts, and manual ledgers consume the same computed budget. No route may independently fall back to the fixed EUR 115.38 value.

## Fail-Closed Rules

PHOENIX emits no buy recommendation when:

- no reconciled checking-balance snapshot exists;
- the active snapshot is older than seven days;
- the statement has a non-zero reconciliation difference;
- emergency-fund balance is missing or unverified;
- pending obligations cannot be determined;
- the calculated budget is zero or negative;
- portfolio or market-data freshness already blocks Finance.

A blocked response identifies the exact missing input. It never substitutes fixture values or the legacy fixed budget.

## Interface

Budget settings expose the five approved policy values and recurring-obligation status using the existing Finance visual language. The reconciled statement panel shows the authoritative balance and timestamp.

Finance Signal shows one compact `CASH AUTHORITY` line with the weekly amount and protected-cash total. The full arithmetic and provenance live in the existing decision trace. No new top-level Finance section is added.

## Migration

The legacy `monthly_investment_budget` and `weekly_investment_budget` fields remain readable during migration but are never authoritative when the cash-flow bridge is enabled. Production enables the bridge only after an approved policy record and reconciled cash snapshot exist. Until then, Finance pauses with a migration blocker rather than silently using EUR 115.38.

## Testing

- Unit tests for cash capacity, sustainability capacity, emergency shortfall, food reserve, unpaid bills, cent rounding, and weekly-window counting.
- Boundary tests at EUR 5,000 emergency savings and EUR 300 checking balance.
- Tests proving the EUR 300 floor is persistent rather than added monthly.
- Tests proving completed investments cannot be allocated again.
- Statement persistence and reconciliation-gate tests.
- Finance API tests proving the computed budget replaces the fixed portfolio-state value.
- Fail-closed tests for stale, missing, and unreconciled cash snapshots.
- Receipt and buy-sequence tests proving every surface uses one budget value.
- Frontend contract tests for policy, provenance, ready, and blocked states.
- Production smoke checks comparing Budget authority, Finance recommendation, and manual buy checklist values.

## Acceptance Criteria

- Railway no longer returns EUR 115.38 merely because it is stored in portfolio state.
- With EUR 760 checking cash, EUR 200 remaining food, no unpaid bills, and a EUR 300 buffer, cash capacity is EUR 260.
- A funded EUR 5,000 emergency account does not receive another automatic monthly allocation.
- PHOENIX never recommends more than both cash capacity and sustainable capacity allow.
- Every recommendation exposes current source timestamps and deterministic arithmetic.
- Stale or unreconciled household data pauses Finance.
- Existing portfolio constraints, research quality gates, manual execution, and no-broker safety remain unchanged.
