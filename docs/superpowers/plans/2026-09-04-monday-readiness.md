# Monday Readiness Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make Phoenix training and nutrition operational for Monday, 7 September 2026.

**Architecture:** Repair each authority at its source: regenerate deterministic training acceptance evidence before activating a calendar-aware plan, then make Nutrition derive a reconciled exact-gram protocol from the active training day and Plaan timing. Keep logging approval-first and fail closed when evidence is unavailable.

**Tech Stack:** Python, FastAPI, SQLite, pytest, React/Vite PWA, Playwright.

## Global Constraints

- Monday starts the six-session performance-hybrid sequence.
- The 2,000 kcal target and four-meal structure remain user policy.
- Current Plaan events and readiness rules constrain training.
- Phoenix never logs meals or completes workouts without user action.

---

### Task 1: Restore Training Authority and Monday Activation

**Files:**
- Modify: `jarvis/domains/training/plan_evidence.py`
- Modify: `jarvis/domains/training/adaptive_planner.py`
- Modify: `jarvis/api/routers/training.py`
- Test: `jarvis/domains/training/tests/test_plan_evidence.py`
- Test: `jarvis/api/tests/test_training_routes.py`

**Interfaces:**
- Consumes: signed planner acceptance evidence, Plaan snapshot, readiness rules.
- Produces: accepted `/training/plan/authority`, active `/training/plan/current`, routed Monday session.

- [ ] Add a failing test reproducing the stale source-audit rejection and Monday plan absence.
- [ ] Run the focused test and confirm the expected failure.
- [ ] Regenerate deterministic evidence and fix only the source mismatch or activation defect demonstrated by the test.
- [ ] Run training domain and API suites.
- [ ] Commit the training repair.

### Task 2: Reconcile the Exact-Gram Monday Nutrition Protocol

**Files:**
- Modify: `jarvis/domains/nutrition/constitution.json`
- Modify: `jarvis/domains/nutrition/recomposition.py`
- Modify: `jarvis/api/routers/nutrition.py`
- Test: `jarvis/domains/nutrition/tests/test_recomposition.py`
- Test: `jarvis/api/tests/test_nutrition_recomposition_routes.py`

**Interfaces:**
- Consumes: active training day, Plaan day blocks, exact food inventory, nutrition memory.
- Produces: four exact-gram meals and totals whose calories and macros reconcile near 2,000 kcal.

- [ ] Add a failing test for the 2,000 kcal versus 1,840 macro contradiction and current protocol 404.
- [ ] Run the focused test and confirm the expected failure.
- [ ] Reconcile targets and make protocol generation return a visible, valid four-meal result.
- [ ] Verify meal timing around the Monday 18:00-19:00 session and approval-only logging.
- [ ] Run nutrition domain and API suites.
- [ ] Commit the nutrition repair.

### Task 3: Deploy and Verify the Joined Monday Flow

**Files:**
- Modify only if a verified UI defect is found: `pwa/src/**`
- Document: `docs/monday-readiness-operations.md`

**Interfaces:**
- Consumes: production API and PWA.
- Produces: verified Monday training and nutrition workflow.

- [ ] Run complete relevant backend and PWA test suites.
- [ ] Obtain an independent code review and resolve critical or important findings.
- [ ] Push backend and frontend changes to their production branches.
- [ ] Verify live authority, Monday session, exact meals, Plaan evidence, and approval gates.
- [ ] Inspect production at 390x844 and 1440x900 with Playwright and record the evidence.
