# Finance Weekly Approval Closure Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Close the current weekly recommendation window after brief approval without claiming trade execution.

**Architecture:** Add an approved-brief guard after the existing applied-ledger guard in the finance recommendation builder. Project that state into the manual checklist, and remove the dashboard Safety Lock presentation while leaving all safety data and mutation workflows intact.

**Tech Stack:** FastAPI, SQLite helpers, pytest/TestClient, React 18, Node test runner, Vite.

## Global Constraints

- Approval closes recommendations but does not imply execution.
- `week_done` remains ledger/apply-driven.
- Do not change allocation, ETF selection, evidence, ledger, apply, portfolio mutation, broker, order, or trade logic.
- Do not commit SQLite or portfolio state.

---

### Task 1: Approved-week backend contract

**Files:**
- Modify: `jarvis/api/routers/finance.py`
- Modify: `jarvis/api/tests/test_finance_routes.py`
- Modify: `jarvis/api/tests/test_finance_manual_buy_checklist.py`

- [ ] Add failing tests proving approval returns no recommendations, `week_closed=true`, `week_done=false`, and no executed/deployed claims.
- [ ] Add a failing checklist test proving `WEEK_CLOSED` and zero checklist items.
- [ ] Run targeted tests and confirm failure.
- [ ] Implement the approved-brief guard and checklist projection.
- [ ] Run targeted tests and confirm success.

### Task 2: Dashboard simplification

**Files:**
- Modify: `pwa/src/components/finance/FinanceDashboard.jsx`
- Create: `pwa/src/components/finance/financeDashboardPresentation.test.js`

- [ ] Add a failing source-contract test proving Safety Lock is absent.
- [ ] Remove the Safety Lock component, invocation, and unused status import.
- [ ] Run frontend tests and build.

### Task 3: Reconcile W27 mutable state and verify

**Files:**
- Mutable only, never commit: `jarvis/data/jarvis.db`

- [ ] Mark brief `id=2` approved with June 29 user-action timestamp.
- [ ] Verify recommendation and checklist responses against the approved-week contract.
- [ ] Run full pytest, compileall, frontend tests/build, finance gates, and diff check.
- [ ] Commit code and tests only.
