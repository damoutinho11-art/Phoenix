# PHOENIX Autonomous Weekly Optimizer Design

## Status

Approved for implementation on 2026-07-15.

## Objective

PHOENIX owns the weekly portfolio allocation decision. The user remains the physical execution layer: PHOENIX prescribes the exact instruments and amounts, and the user either places those buys exactly or defers the entire weekly cycle.

The optimizer must earn that autonomy through deterministic decisions, strict data-quality gates, an immutable constitution, reproducible scoring, and complete audit receipts. It must prefer no recommendation over an unverified recommendation.

## Non-Goals

- PHOENIX does not connect to a broker or execute orders.
- The language model does not generate, score, select, or override allocations.
- The user cannot edit recommendation amounts or promote a lower-ranked scenario.
- The optimizer does not use age alone to infer risk capacity.
- The optimizer does not attempt short-term market timing or create daily buy recommendations.
- Statistical forecasts may support a decision but cannot override deterministic rules.

## Autonomy Contract

PHOENIX has decision autonomy inside the approved constitution. The constitution is user-owned policy and cannot be modified by the optimizer.

For each weekly cycle, the user has two controls:

1. Execute the prescribed buy sequence exactly and record the completed transactions.
2. Defer the entire cycle. A deferral is recorded, no partial allocation is substituted, and PHOENIX recalculates from fresh data in the next weekly cycle.

All orders remain manual. A recommendation is never represented as an executed trade.

## Aggressive Growth Constitution

The optimizer uses an explicit aggressive-growth mandate rather than treating concentration as inherently undesirable.

### Allocation Policy

- BTC target weight: 21%.
- BTC operating band: 15% to 25%.
- BTC hard ceiling: 25%.
- Total cryptocurrency hard ceiling: 30%.
- Speculative cryptocurrency combined hard ceiling: 5%.
- Any single speculative token hard ceiling: 3%.
- Speculative-token target weights remain zero unless the constitution is deliberately amended.
- Above a hard ceiling, new contributions are redirected; PHOENIX never initiates an automatic sale.
- Existing legacy holdings remain governed by their current no-new-buy and explicit-sale-approval rules.

This resolves the current contradiction between the 21% BTC target, 25% BTC band maximum, and 15% single-crypto limit.

### Drawdown Policy

- Ordinary market declines do not suspend broad ETF or BTC contributions.
- At a 20% total-portfolio drawdown from the recorded peak, speculative-token purchases are suspended.
- The optimizer continues evaluating BTC and broad ETF purchases under all other constitution limits.
- Existing holdings are not automatically sold because a drawdown threshold is crossed.

## Weekly Cadence

The finance cycle is anchored to Monday after the expected Sunday deposit.

1. Sunday deposit updates the available weekly budget.
2. Monday refreshes portfolio holdings, cash, prices, broker availability, fees, FX inputs, market regime, and drawdown state.
3. Data-quality gates either authorize or block optimization.
4. PHOENIX generates, validates, scores, and ranks allocation candidates.
5. PHOENIX publishes one final decision and its audit receipt.
6. The recommendation expires after 24 hours or immediately after a deposit, transaction, portfolio mutation, constitution change, material source change, or freshness failure.
7. The system may monitor risk daily, but it does not create daily buy recommendations.

If the weekly cycle is deferred, the budget remains unallocated and is included in the next fresh optimization run according to the constitution's cash and reserve rules.

## Optimizer Architecture

The implementation extends the current deterministic finance engine rather than replacing it.

### 1. Input Snapshot

Create an immutable optimizer input snapshot containing:

- Portfolio holdings and cash from Railway.
- Available weekly investment budget.
- Current and peak portfolio values.
- Constitution and rule version.
- Price observations with timestamps and source identifiers.
- Broker instrument resolutions and availability evidence.
- Fee schedule, FX rate, currency, minimum order, and fractional-order support.
- Market regime and its source evidence.
- Existing transaction and deferral state for the active cycle.

### 2. Quality Gate

Optimization is blocked unless required inputs are complete and trustworthy.

Required checks include:

- Holdings and cash reconcile with the latest portfolio state.
- The expected deposit is present or explicitly marked absent.
- Price freshness is market-aware: exchange sessions, weekends, holidays, and 24/7 crypto markets are treated separately.
- Proposed instruments have current market data and publicly verified broker availability.
- Critical prices are confirmed by an independent second source within an explicit tolerance.
- Fee, FX, minimum-order, and fractional-order rules are known.
- Market regime is known when it contributes to scoring.
- The constitution is internally consistent and versioned.

Any blocker produces no scenarios, no buy amounts, and a clear remediation message.

### 3. Candidate Generator

Generate portfolio-level allocations in integer cents across eligible sleeves. Candidate generation must:

- Spend no more than the verified weekly budget.
- Respect platform and minimum-order constraints.
- Include the existing ideal and executable allocation as candidates.
- Explore meaningful alternate allocations without manufacturing cosmetic duplicates.
- Keep the candidate space deterministic and bounded through documented increments and pruning rules.
- Preserve unallocated cash only when required by constraints or when every deployable candidate falls below the quality threshold.

### 4. Constraint Validator

Hard constraints are pass/fail and cannot be compensated for by a high score.

- Manual execution only.
- Fresh and reconciled finance inputs.
- All aggressive-growth constitution ceilings.
- Drawdown suspension rules.
- Sleeve eligibility and legacy-holding restrictions.
- Broker availability and instrument resolution.
- Budget, currency, fee, minimum-order, and fractional-order rules.
- No prohibited sales or automatic rebalancing.

Blocked scenarios may be retained in the audit receipt as educational evidence, but they can never be selected or sent to the buy sequence.

### 5. Deterministic Scorer

Valid scenarios are ranked using versioned, inspectable score components:

- Target-drift repair.
- ETF quality and instrument suitability.
- Fit with the aggressive-growth constitution.
- Concentration improvement without a blanket volatility penalty.
- Market-regime suitability.
- Execution costs, including fees and FX.
- Number and operational simplicity of manual orders.
- Data-source confidence.
- Unnecessarily idle budget.

All scores use fixed formulas and deterministic tie-breakers. A language model does not supply component values or weights.

### 6. Scenario Roles

The optimizer preserves the highest-quality distinct scenarios for auditability:

- PHOENIX PICK: highest overall valid score.
- MAX DRIFT REPAIR: valid scenario with the strongest target correction.
- LOWEST COST: valid scenario with the lowest complete execution cost.
- DEFENSIVE ALTERNATIVE: valid scenario with lower concentration while remaining consistent with the aggressive mandate.
- DEFER: emitted only when no deployable scenario clears the decision-quality threshold.

Roles are explanatory. Only PHOENIX PICK proceeds to execution. The user cannot promote another scenario.

### 7. Explanation Layer

The deterministic engine returns structured reasons, rule results, and comparisons. The language model may convert that structure into PHOENIX's concise executive voice, but it cannot change allocations, rankings, scores, warnings, expiry, or approval state.

If the language model is unavailable, the complete deterministic recommendation remains usable.

## Decision Receipt

Every run creates an immutable receipt, including blocked or deferred runs.

The receipt records:

- Receipt identifier and cycle identifier.
- Creation and expiry timestamps.
- Input snapshot hash and source timestamps.
- Constitution, optimizer, scorer, and data-adapter versions.
- All hard-constraint results.
- Score weights, component scores, and tie-break decisions.
- PHOENIX PICK and the preserved alternatives.
- Rejected candidate counts and representative blocked scenarios.
- Deterministic reasons the winner beat each alternative.
- User outcome: executed, deferred, expired, or superseded.
- Linked execution-ledger transactions when buys are completed.

Given the same versioned input snapshot, the optimizer must reproduce the same candidate set, ranking, and winner.

## API Contract

Introduce a versioned optimizer response without breaking the existing finance summary and manual-ledger endpoints.

The weekly decision endpoint returns:

- `data_ready` and structured blockers.
- Cycle, receipt, creation, and expiry metadata.
- The selected scenario.
- Read-only alternatives and blocked examples.
- Score components and hard-rule results.
- Projected post-buy sleeve weights.
- Complete execution costs.
- A deterministic explanation payload.
- Buy-sequence readiness.

The execution endpoint never places trades. It returns the verified manual buy checklist for the unexpired selected scenario.

Deferring a cycle changes only the receipt outcome. It does not mutate the recommendation into another allocation.

## Finance Control Room Placement

The optimizer remains inside the existing `BRIEF` lane and does not become another top-level Finance section.

### Brief -> Signal

Replace the current long text transmission with the Finance-native Decision Stack:

- PHOENIX PICK is open and dominant.
- Exact instruments, amounts, routes, fees, expiry, projected weights, and rule status are visible.
- PHOENIX's concise explanation appears beneath the allocation.
- Valid alternatives are compact, read-only rows.
- Blocked examples remain visible as audit evidence.
- The full decision trace and receipt are accessible without competing with the primary action.

### Brief -> Buy Sequence

Rename `APPROVE` to `BUY SEQUENCE`. This surface verifies current prices, instrument identity, route, amount, and manual execution steps for PHOENIX PICK only. It does not ask the user to choose or edit the strategy.

The user may execute the sequence or defer the entire cycle.

### Brief -> Ledger

Record actual quantity, price, fee, currency, route, and execution time after each manual purchase. Link transactions to the decision receipt and reconcile the resulting portfolio state.

### Brief -> Decisions

Show immutable receipts, score explanations, blockers, deferrals, expirations, and linked execution outcomes.

### Main Finance Projection

Keep the main projection visually quiet. It may show a compact PHOENIX PICK state and a command to open the Control Room, but it does not render the full scenario set.

## Visual Direction

The production component must reuse existing Finance tokens and surfaces:

- Projected glass and cyan telemetry.
- Clipped instrument geometry.
- Existing Finance typography and readability helpers.
- Open composition with line-separated telemetry rather than generic dashboard cards.
- One dominant decision, with alternatives subordinate.
- Existing reduced-motion and responsive behavior.

The approved visual companion is a hierarchy reference, not a pixel-perfect final design. Visual polish happens in the running app using desktop and mobile screenshots.

## Error and Edge States

- Missing or stale source: hide amounts and scenarios; show blockers and required remediation.
- Deposit not detected: do not assume a budget; allow a blocked receipt or explicit no-deposit cycle.
- Conflicting sources: block affected instruments; do not average unexplained discrepancies.
- Unavailable broker instrument: eliminate candidates containing it.
- Fee or FX uncertainty: block the affected candidate when cost could change ranking or executability.
- No valid candidate: emit DEFER with no buy sequence.
- Recommendation expired: disable the buy sequence and require a fresh run.
- Portfolio changed after decision: supersede the receipt and recalculate.
- Partial manual execution: record completed transactions, mark the receipt partial, and block reuse of the original sequence until reconciliation.
- Explanation failure: show deterministic structured reasons.

## Validation and Rollout

### Automated Tests

- Unit tests for every hard constraint and score component.
- Property tests asserting no selected scenario can violate the constitution, exceed the budget, or produce negative allocations.
- Determinism tests across repeated runs and serialized snapshots.
- Golden tests for scenario roles, score breakdowns, and tie-breaks.
- Market-aware freshness tests for trading sessions, weekends, holidays, and crypto.
- Data-source disagreement and adapter-failure tests.
- Fee, FX, minimum-order, and fractional-order tests.
- Drawdown and concentration boundary tests.
- API contract and fail-closed tests.
- Frontend tests proving alternatives are read-only and stale decisions cannot enter the buy sequence.
- Receipt-to-ledger reconciliation tests, including partial execution.

### Shadow Mode

Run the optimizer in shadow mode before it controls the weekly buy sequence. During shadow mode:

- The existing deterministic recommendation remains authoritative.
- The new optimizer creates receipts and ranked scenarios without changing the UI action.
- Results are compared for budget use, constitution compliance, drift repair, costs, and stability.
- Unexpected ranking changes and source failures are reviewed.

Promote the optimizer only after the production smoke gate, fixture replay suite, and live shadow receipts pass the agreed acceptance checks.

### Visual Verification

- Verify the Signal, Buy Sequence, Ledger, and Decisions flow in the live Control Room.
- Capture desktop and mobile screenshots.
- Check text fit, scrolling ownership, hierarchy, animation, reduced motion, empty states, and blocked states.
- Reconcile all displayed amounts and timestamps with the Railway API.

## Acceptance Criteria

- One unambiguous PHOENIX PICK is produced for a verified Monday cycle.
- The selected scenario satisfies every hard constraint.
- The same snapshot and versions always reproduce the same winner.
- Alternatives are distinct, read-only, and accompanied by deterministic loss reasons.
- The user cannot edit amounts or promote an alternative.
- The only decision-level user control is whole-cycle deferral.
- No stale, conflicting, incomplete, or expired decision reaches the buy sequence.
- All displayed instruments, amounts, fees, prices, and projected weights are source-backed.
- The decision receipt links cleanly to manual execution records.
- The running interface matches the established Finance visual system on desktop and mobile.

