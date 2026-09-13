# Recurring contributions and cash reconciliation implementation plan

**Goal:** Make the approved ETF-core/BTC approach operational without inventing
cash from missed weeks, mislabelling fund identities, or promising optimal returns.

**Architecture:** A versioned owner policy separates the recurring crypto purchase
share from the portfolio ceiling. Actual applied purchase outlays since activation
determine the cumulative crypto amount due; an unexecuted recommendation never
creates credit. Every buy remains bounded by current cash authority, research,
minimum purchase size and post-cost portfolio limits. No separate fictitious cash
bucket is created. Statement/ledger reconciliation precedes cash authorization.

**Tech stack:** Existing Python/FastAPI, SQLite and finance brief.

## Constraints

- No orders, trade approvals, holdings edits or invented return estimates.
- Preserve legacy v1 policy until v2 tests, review and deployment pass.
- Owner delegated allocation choices. A recurring share and a wider ceiling are
  risk-policy judgments, not performance-validated optima. Save choices privately.
- Keep EUR20 minimum for crypto. Missing history or reconciliation fails closed.
- No multiplication of missed weeks. Only cash actually evidenced is available.
- Ownership confirmation requires broker evidence; public candidate matches alone
  do not establish which fund the owner holds. Exact holdings overlap stays unavailable.

## Task 1: Close cash-authority gaps

- [ ] Add tests for a purchase after the source statement remaining unrepresented
  next week, voided purchases, fresh subsequent statement, malformed ledger dates.
- [ ] Block new allocation when nonvoid recorded purchases are not covered by the
  statement date; do not estimate deductions or double-count transfers and trades.
- [ ] Make investment-capacity endpoint current-period/lifecycle aware.
- [ ] Add catch-up context showing remaining windows and no additional entitlement.

## Task 2: Versioned recurring contribution policy

- [ ] Extend policy validation with v2 crypto contribution share, combined ceiling,
  and effective date. Retain v1 compatibility and policy/research digest binding.
- [ ] Add a private ledger-history reader: complete applied, nonvoid EUR buy outlays
  (principal plus fees), dated on/after activation and no later than decision date.
- [ ] Size BTC from max(0, share * (past purchase outlays + current cash budget)
  minus past crypto outlays). Missing EUR20 minimum defers crypto; unused current
  budget can go to ETFs. Future BTC credit exists only after actual recorded buys.
- [ ] Enforce all portfolio/weekly caps and existing research/fee/quote gates.
- [ ] Bind history digest to replay, approval and explanatory contribution context.
- [ ] Test repeated GET idempotence, two actual contribution cycles, fees, voids,
  no-funds/no-history cases, over-cap portfolio and no automatic sells.

## Task 3: Identity and overlap boundaries

- [ ] Expose unconfirmed legacy mapping status in the existing finance response.
- [ ] Never relabel legacy or missing provenance as verified identity.
- [ ] Require owned ISIN/share-class evidence before claiming exact fund overlap.
  Record remaining user-data dependency instead of guessing or modifying holdings.

## Task 4: Review, release and private activation

- [ ] Run appropriate domain/API/security tests; independently review code and
  contribution scenarios. Commit/push only the reviewed feature files.
- [ ] Verify Railway and frontend rollout, owner access and absent-key denial.
- [ ] Save delegated policy and publish matching conditional BTC research; verify
  recommendation/checklist cash amounts, minimum and truthful deferred explanation.
- [ ] Report operational work completed separately from unverified ownership and
  future investment-performance claims.
