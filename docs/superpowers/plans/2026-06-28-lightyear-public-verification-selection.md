# Lightyear Public Verification Selection Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Separate research-ranked ETF winners from public-Lightyear-verified manual-checklist candidates without changing scoring or allocation.

**Architecture:** The ETF resolver computes both roles from one scored live-price candidate list. Downstream recommendation, evidence, coverage, acceptance, and checklist behavior continues to use the backward-compatible `selected_candidate`, which aliases only the verified checklist candidate; coverage additionally exposes the research/checklist split.

**Tech Stack:** Python 3, pytest, FastAPI route projections, existing yfinance and public Lightyear adapters.

## Global Constraints

- Do not change recommendation amounts, allocation logic, score formula, or configured-order tie-break.
- Do not mutate portfolio state, ledger, approvals, or apply flow.
- Do not add broker APIs, orders, trades, auto-buy, auto-sell, or execution.
- Lightyear public verification failure means `not_publicly_verified`, never unavailable.

---

### Task 1: Resolver Role Split and Verification Semantics

**Files:**
- Modify: `jarvis/domains/finance/market_data.py`
- Modify: `jarvis/domains/finance/lightyear_catalog.py`
- Test: `jarvis/domains/finance/tests/test_market_data_universe.py`

**Interfaces:**
- Consumes: existing candidate `score_components`, `fetch_status`, `lightyear_available`, and `lightyear_confidence`.
- Produces: `research_winner`, `checklist_candidate`, compatible `selected_candidate`, `research_winner_is_checklist_candidate`, and three reason fields.

- [ ] Add failing tests with a higher-scoring `not_publicly_verified` candidate and a lower-scoring `public_verified` candidate; assert the candidates occupy different roles and `selected_candidate == checklist_candidate`.
- [ ] Add a failing test proving no public-verified candidate produces null checklist and selected candidates while retaining the research winner.
- [ ] Run `python -m pytest jarvis/domains/finance/tests/test_market_data_universe.py -q` and confirm failures describe the missing fields/behavior.
- [ ] Normalize public-check output to `broker_availability_status` and implement the two deterministic selections over live-price candidates using the existing score/order key.
- [ ] Add stable explanations for both selections and their gap, without altering candidate scores.
- [ ] Re-run the resolver suite and confirm it passes.

### Task 2: Coverage and Checklist Contract

**Files:**
- Modify: `jarvis/api/routers/finance.py`
- Test: `jarvis/api/tests/test_finance_data_coverage.py`
- Test: `jarvis/api/tests/test_finance_manual_buy_checklist.py`

**Interfaces:**
- Consumes: resolver `research_winner`, `checklist_candidate`, `selected_candidate`, and `selection_gap_reason`.
- Produces: coverage audit fields exposing the split; checklist remains based only on `instrument.resolved_candidate` sourced from `selected_candidate`.

- [ ] Add a failing coverage test asserting `selection_gap_reason` and both candidate roles are visible when they differ.
- [ ] Add a failing checklist test asserting an unverified research winner is never emitted when the verified selected/checklist candidate differs.
- [ ] Run both focused suites and confirm the expected failures.
- [ ] Project the resolver split into recommendation instrument metadata and coverage while preserving `resolved_candidate = selected_candidate`.
- [ ] Ensure a missing checklist candidate remains null and causes existing coverage/checklist review blockers rather than falling back to the research winner.
- [ ] Re-run both focused suites and confirm they pass.

### Task 3: Acceptance and Full Regression Verification

**Files:**
- Modify if required: `jarvis/domains/finance/acceptance_gate.py`
- Test: `jarvis/domains/finance/tests/test_acceptance_gate.py`

**Interfaces:**
- Consumes: coverage recommendation provenance based on `selected_candidate`.
- Produces: unchanged passing production acceptance contract for the deterministic IS3Q.DE fixture.

- [ ] Add or update an acceptance assertion proving the accepted fixture uses the verified checklist/selected candidate and not a distinct research winner.
- [ ] Run the acceptance suite and make only compatibility changes required by the new resolver response.
- [ ] Run all four requested focused test commands.
- [ ] Run `python -m pytest -q`, `python -m compileall jarvis`, and `git diff --check`.
- [ ] Inspect the diff for forbidden amount, allocation, score, portfolio, ledger, or execution changes.
- [ ] Commit the green patch with `separate ETF research winners from checklist selection`; do not push.
