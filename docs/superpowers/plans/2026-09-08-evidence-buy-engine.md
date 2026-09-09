# Evidence Buy Engine Implementation Plan

**Goal:** Make measured evidence select actual weekly ETF and crypto recommendations.
**Architecture:** Public evidence adapter feeds a pure versioned selector inside
the allocation engine. One resulting allocation feeds existing recommendation,
brief and checklist projections. No new panel and no trading integration.
**Tech stack:** Python/FastAPI, yfinance, React, pytest/unittest.

## Global constraints

Preserve authentication, verified cash authority, emergency-fund exclusion,
phase eligibility, portfolio/weekly crypto caps and manual execution. Never
mutate private records for tests. Broader universe does not mean every asset is
eligible: missing identity, fees, broker evidence or policy limits means exclusion.
Missing decisive evidence must yield a lane-specific WAIT, never preset fallback.
The evidence strategy is opt-in until its validation is reviewed for promotion.

## Task 1 — pure candidate policy

Create `jarvis/domains/finance/buy_selection.py` and
`jarvis/domains/finance/tests/test_buy_selection.py`.
Interface: `select_buys(candidates, constitution, portfolio_state, holdings,
weekly_budget_cents, as_of) -> dict` containing allocations_cents, lanes,
candidate evaluations, policy_version, method and limitations.

- [x] Write synthetic price histories and tests for changing ETF/crypto winners,
  stale/future/duplicate data, invalid identity/cost evidence, risk ceilings,
  ties, no market-data fallback, and exact cent budget conservation.
- [x] Run focused tests and verify failure before implementing the selector.
- [x] Use completed 90/180-calendar-day windows, annualized volatility (252 ETF,
  365 crypto), maximum drawdown and explicit costs. Require 180 days of history
  with ETF gaps <=7 days or crypto gaps <=2 days; no intraday observations.
- [x] Rank eligible candidates within lanes using percentile components:
  35% target-gap proportion, 20% 90-day return, 20% 180-day return,
  15% lower volatility, 10% smaller drawdown. This is a declared heuristic,
  not calibrated expected return. Compare ranks under a second risk-weighted
  policy (35/15/15/20/15); differing winners or tied leaders yield WAIT.
- [x] Require positive 90-day and 180-day returns after two-way transaction cost
  estimates. Do not double-subtract fund expenses from adjusted ETF returns.
  Spread must be observed, not assumed zero. Amount means cash outlay including
  estimated one-way costs; report investable principal separately.
- [x] Size one candidate per lane under its target deficit, caps, route and
  minimum buy. Reserve any unallocated amount; no unevidenced fallback route.
- [x] Run focused tests; record actual test results.

## Task 2 — public evidence

Create `buy_evidence.py` and focused synthetic adapter tests. Use existing
ETF candidates plus all configured crypto_universe members, not only the old
three tickers. Accept explicit additional candidates only with a mapped sleeve
or configured crypto risk policy. Return coverage and exclusions transparently.

- [x] Test adapter extraction and network failures with synthetic provider data.
- [x] Fetch adjusted completed histories with explicit EUR metadata and bounded
  yfinance request timeouts. Fetch bid/ask and instrument identity. Retrieve
  broker product evidence from official public pages; never private API routes.
- [x] Cache market evidence only for 15 minutes, keyed by candidate definitions
  and date. Recompute portfolio eligibility per request. Failed input stays missing.
- [x] Report that the universe is bounded/configured, not an exhaustive market scan.
- [x] Verify focused adapter tests and a public-only, sanitized source smoke.

## Task 3 — allocation and API

Modify `engine.py` and finance router, with new integration tests.

- [x] Add optional `selection_evidence` and `as_of` inputs to
  `allocate_weekly_budget`; None preserves explicitly selected legacy mode,
  while an empty evidence payload in evidence mode must WAIT.
- [x] Resolve effective dynamic targets before selecting. Use selector allocations
  as both ideal and executable allocations so old fallback cannot bypass WAIT.
- [x] Attach selected instrument, method, alternatives and reasons to existing
  response/ticket/mandate. The recommendation, manual checklist and brief must
  share the same choices and cents.
- [x] Include ETH/SOL in crypto accounting and phase-aware runtime target shape
  only where the configured universe, route and risk policy support them.
  Preserve total crypto caps; unsupported new candidates remain ineligible.
- [x] Test authenticated API projection with synthetic authorities and histories.
  Default production mode remains unchanged until reviewed promotion.

## Task 4 — explanation and verification

- [x] Put selection reasons and WAIT reasons in existing recommendation rationale
  and brief; no new tab or comparison panel.
- [x] Run domain finance regressions, focused authenticated API tests, all isolated
  security tests, frontend tests and production build.
- [x] Review the diff, resolve important issues, document limitations and exact
  remaining promotion requirements. Do not claim optimality or deploy silently.

## Sources checked

- https://lightyear.com/en/funds/explore — broker catalogue and product filters.
- https://www.lhv.ee/en/crypto/ — supported crypto information and service fee.
- https://ranaroussi.github.io/yfinance/reference/yfinance.price_history.html

## Validation record

See docs/reviews/2026-09-09-evidence-buy-engine.md for results, source gaps and
pending production promotion requirements. The replay harness is tested with
synthetic histories; real historical strategy performance is unestablished.
