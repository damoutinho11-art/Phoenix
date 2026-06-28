# Lightyear Public Verification Selection — Phase 1 Design

## Goal

Separate ETF research merit from Phase 1 manual-buy eligibility while keeping the
ETF resolver as the single source of truth. Lightyear's public website is the
only broker-availability authority in this phase. No authenticated broker API,
order, trade, ledger write, or portfolio mutation is introduced.

## Resolver Contract

For candidates with a successful live-price fetch, the resolver returns:

- `research_winner`: the candidate with the highest existing product/research
  score, regardless of Lightyear public verification.
- `checklist_candidate`: the highest-scoring candidate whose
  `broker_availability_status` is `public_verified`.
- `selected_candidate`: a backward-compatible copy of `checklist_candidate`.
- `research_winner_is_checklist_candidate`: whether the two candidates have the
  same symbol.
- `research_winner_reason`, `checklist_candidate_reason`, and
  `selection_gap_reason`: explicit explanations of each decision and any split.

Candidate ranking, score calculation, configured-order tie-breaking, allocation,
and recommendation amounts remain unchanged.

## Broker Availability Semantics

Each candidate exposes `broker_availability_status`:

- `public_verified`: the public Lightyear page confirms the exact candidate
  using the existing high-confidence verification rule.
- `not_publicly_verified`: the public check fails, is inconclusive, is
  unsupported, or cannot be completed.

The system must not infer that an instrument is unavailable from a failed public
check. Existing compatibility fields may remain, but public-facing reasons and
new selection behavior use these two explicit statuses.

## Consumer Contract

Recommendation instrument metadata, evidence matching, data coverage, the
production acceptance gate, and the manual-buy checklist consume
`selected_candidate` / `checklist_candidate` only. `research_winner` remains
visible for research and audits but cannot enter the checklist unless it is also
the public-verified checklist candidate.

Coverage exposes the candidate split and `selection_gap_reason`. When no
public-verified candidate exists:

- `research_winner` remains available for research;
- `checklist_candidate` and `selected_candidate` are `null`;
- coverage cannot report the ETF leg as execution-ready or data-transparent;
- the manual checklist blocks the ETF leg or marks it for manual review without
  substituting the research winner.

## Safety Invariants

- No recommendation amount, allocation rule, score, or ETF ranking logic changes.
- No broker connection, order creation, trade execution, auto-buy, or auto-sell.
- No portfolio-state, ledger, brief-approval, or apply-flow mutation.
- A `not_publicly_verified` candidate never becomes the checklist candidate.
- `selected_candidate` always equals `checklist_candidate`.

## Test Contract

Deterministic resolver tests will prove that an unverified higher-scoring
candidate may remain the research winner while a lower-scoring public-verified
candidate becomes the checklist and selected candidate. Additional tests will
prove:

- failed public checks use `not_publicly_verified`, not “unavailable”;
- no verified candidate yields null checklist/selected candidates;
- the manual checklist uses only the checklist candidate;
- coverage exposes the split and its reason;
- stale or research-winner evidence cannot validate a different checklist
  candidate;
- the existing production acceptance gate still passes its accepted fixture;
- all execution and state-mutation safety flags remain false.
