# Portfolio Manager Foundation Implementation Plan

> Execute inline with regression tests and independent review at integration.

**Goal:** Correct instrument accounting and cost-aware portfolio decisions before broader optimization.
**Architecture:** Pure position and projection modules, existing API adapters and views.
**Tech Stack:** Python, FastAPI, pytest; existing React UI contract.

## Global constraints

- No automatic trades, private endpoint health probes, or production balance migration.
- Preserve cash authority, owner authentication and current strategic targets.
- No aggregate units across different instruments; no fabricated FX or evidence.
- Tests prove behavior, not investment performance.

## Task 1: Instrument accounting

- [x] Add `jarvis/domains/finance/tests/test_positions.py` regressions for two ETFs
  in one sleeve, identity-preserving valuation and void, and ambiguous units.
- [x] Run `python -m pytest jarvis/domains/finance/tests/test_positions.py -q` red.
- [x] Add `jarvis/domains/finance/positions.py` with `apply_position_transaction(state, transaction, *, reverse=False)`;
  return a new state, preserve original inputs, and validate known units.
- [x] Integrate apply/void/holdings/unit correction in `jarvis/api/routers/finance.py`.
- [x] Update `market_data.update_portfolio_state_prices` to quote position symbols
  and update a sleeve only when all of its nonzero positions are valued.
- [x] Run positions and existing ledger tests; fix genuine compatibility failures.

## Task 2: Net projection and decision comparison

- [x] Add `tests/test_portfolio_projection.py` regressions asserting
  `net_total_cents + estimated_cost_cents == initial_total_cents + budget_cents`
  and a post-fee crypto-cap breach with otherwise eligible evidence.
- [x] Add `portfolio_projection.py`: pure net projection and current explicit
  crypto constraints; withhold a new crypto leg if final costs create a breach.
- [x] Integrate with both selectors and engine projected holdings/risk reporting.
- [x] Add cash-baseline comparison, weights, target distance and unmeasured
  capabilities to selection; expose concise results through existing rationale.
- [x] Run selection/allocation and authenticated recommendation/checklist tests.

## Task 3: Quote validity and review

- [x] Add missing/invalid FX and VIX regressions, observe failures, then fix
  `_convert_to_eur`, quote acquisition and regime validation.
- [x] Run finance domain, ledger, related API and security checks.
- [x] Obtain independent code review and resolve actionable findings.
- [x] Record actual validation and rollout status in the audit; report the
  remaining mandate, exposure-data, optimizer and performance-validation work.

