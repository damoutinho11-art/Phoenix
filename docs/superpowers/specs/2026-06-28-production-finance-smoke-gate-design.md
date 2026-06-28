# Production Finance Smoke Gate v1 Design

## Goal

Provide one deterministic, read-only gate that verifies the deployed finance
coverage and manual-buy checklist agree with the established safety contract.

## Architecture

`jarvis.domains.finance.production_smoke_gate` owns a pure
`evaluate_production_smoke(coverage, checklist)` evaluator. It reuses
`evaluate_finance_acceptance(coverage)` and adds only cross-endpoint checks for
ETF selection alignment, checklist eligibility/status, BTC manual routing, and
no-execution safety flags.

Default mode calls both real FastAPI endpoints with the existing deterministic
acceptance fixtures and temporary SQLite storage. `--live-url` opts into two
read-only HTTP GET requests. Neither mode calls a broker API or performs writes
to portfolio or ledger state.

## Dynamic Candidate Contract

The evaluator reads the current quality ETF checklist/selected candidate symbol
from coverage. It does not hardcode a production ticker. The quality ETF manual
checklist item must use that same symbol and never a distinct research winner.
When research and checklist winners differ, `selection_gap_reason` must be
non-empty.

## Output

Both modes return and print compact JSON containing `accepted`, `mode`, `errors`,
coverage verdict, checklist status, quality research/checklist/manual symbols,
and the combined safety result. A rejected contract exits nonzero.

## Safety Invariants

- No resolver, recommendation, allocation, evidence, route, or API behavior changes.
- No frontend changes.
- No broker connections, orders, trades, ledger writes, or portfolio mutations.
- All safety flags must explicitly remain false.
