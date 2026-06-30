# Task 5 report

## Status

PASS. Canonical fixture remains BTC EUR 46.15 plus growth_nasdaq_etf EUR 69.23. No portfolio, scoring, allocation, product selection, database, service-worker, or frontend implementation file was changed.

## Classification by file

- STALE_TEST: `jarvis/domains/training/tests/test_training_engine.py`, `test_cross_domain_alerts.py` (current constitution dates).
- STALE_TEST: finance API/domain test files in the Task 5 brief (current `growth_nasdaq_etf`/`CNDX.L` fixture and current frontend source contract).
- REAL_LOGIC_REGRESSION: `jarvis/domains/finance/acceptance_gate.py`, `production_smoke_gate.py`, and their focused tests (gates were pinned to Quality instead of the current ETF recommendation leg).
- TEST_ISOLATION: none.
- NETWORK_NOT_MOCKED: none.
- NONDETERMINISTIC_TIME: none.

Baseline RED evidence: `.superpowers/sdd/pre-task5-full.txt`: 32 failed, 639 passed, 12 errors.

## GREEN evidence

- `python -m pytest jarvis/domains/training/tests jarvis/api/tests/test_training_routes.py -q` -> 77 passed.
- stale finance API/domain group -> 89 passed.
- `python -m pytest jarvis/domains/finance/tests/test_acceptance_gate.py jarvis/domains/finance/tests/test_production_smoke_gate.py -q` -> 17 passed.
- `python -m pytest jarvis/domains/nutrition/tests jarvis/api/tests/test_nutrition_routes.py -q` -> 135 passed.
- `python -m pytest jarvis/domains/calendar/tests jarvis/api/tests/test_calendar_routes.py -q` -> 58 passed.
- `python -m pytest jarvis/domains/finance/tests jarvis/api/tests/test_finance_routes.py -q` -> 64 passed.
- `python -m pytest -q` -> 685 passed in 125.29s.
- `git diff --check` -> clean.

## Files

Modified exactly the 13 brief-listed files exercised by the baseline failures: six finance API tests, two training tests, three finance domain tests, and the two gate helpers. This report is the only non-code artifact added.

## Self-review

- ETF identity is derived from recommendation provenance using `ETF_CANDIDATE_TICKERS` membership.
- Acceptance validates the dynamic leg's resolved instrument and matching PASS/LIVE_MARKET_FETCH record; deterministic evidence is seeded for every configured sleeve.
- Smoke cross-checks dynamic sleeve research/checklist/selection/recommendation/manual symbols and requires public verification.
- Generic `etf_*` compact fields were added; `quality_*` fields remain exact backward-compatible aliases.
- BTC/BTC-USD and all false safety/no-write flags remain unchanged.
- Focused tests exercise canonical Growth, synthetic Quality, stale evidence, null evidence, mismatched checklist symbols, and safety regressions. Assertions evaluate public gate behavior rather than duplicating internal helper decisions.

## Concerns

None. CRLF normalization warnings are repository working-tree behavior only; `git diff --check` is clean.
