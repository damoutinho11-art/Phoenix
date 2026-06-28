# Production Finance Smoke Gate v1 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add an offline-safe and explicitly opt-in live read-only finance smoke gate spanning coverage and manual-checklist endpoints.

**Architecture:** A new finance-domain module reuses the existing acceptance evaluator and adds pure cross-endpoint validation. Local mode exercises both FastAPI routes with temporary SQLite and deterministic fixtures; live mode performs two GET requests.

**Tech Stack:** Python 3, pytest, FastAPI TestClient, urllib, SQLite temporary database.

## Global Constraints

- Do not change resolver, API routes, frontend, recommendation, allocation, or evidence logic.
- Do not mutate portfolio or ledger state.
- Do not add broker APIs, orders, trades, or execution.
- Derive the expected checklist ETF ticker dynamically from coverage.

---

### Task 1: Pure Smoke Evaluator

**Files:**
- Create: `jarvis/domains/finance/production_smoke_gate.py`
- Create: `jarvis/domains/finance/tests/test_production_smoke_gate.py`

**Interfaces:**
- Consumes: coverage and checklist dictionaries.
- Produces: `evaluate_production_smoke(coverage, checklist) -> list[str]`.

- [ ] Add failing tests for valid state, blocked coverage, missing gap reason, research-winner checklist misuse, safety regression, and ETF symbol mismatch.
- [ ] Run the focused test module and verify failures are caused by the missing evaluator.
- [ ] Implement the evaluator by calling `evaluate_finance_acceptance` and adding only cross-endpoint assertions.
- [ ] Re-run the focused module and confirm all tests pass.

### Task 2: Offline and Live CLI Runners

**Files:**
- Modify: `jarvis/domains/finance/production_smoke_gate.py`
- Test: `jarvis/domains/finance/tests/test_production_smoke_gate.py`

**Interfaces:**
- Produces: `run_local_smoke_gate()`, `run_live_smoke_gate(base_url)`, and `main(argv)`.

- [ ] Add failing tests for compact accepted output and local read-only behavior.
- [ ] Implement temporary-DB local endpoint execution using existing acceptance fixtures.
- [ ] Implement explicit `--live-url` GETs and compact JSON output with nonzero rejection exit.
- [ ] Re-run the focused tests.

### Task 3: Verification and Local Commit

**Files:**
- No production files beyond the new smoke module.

- [ ] Run all requested focused suites.
- [ ] Run full pytest, compileall, and diff check.
- [ ] Run the live smoke command and capture its JSON.
- [ ] Confirm `jarvis/data/jarvis.db` is neither staged nor committed.
- [ ] Commit the green patch as `add finance production smoke gate`; do not push.
