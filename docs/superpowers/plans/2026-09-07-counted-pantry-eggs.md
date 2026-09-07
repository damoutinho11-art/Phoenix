# Counted Pantry Eggs Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let Phoenix remember 20 eggs, preview an explicit egg substitution in Today Protocol, rebalance the unlogged day, and deduct only available eggs from a four-day grocery list.

**Architecture:** Store pantry counts inside the existing nutrition-memory payload so the database schema remains stable. Extend the existing proposal-only replan command with an optional explicit replacement food and gram quantity; reuse the deterministic rebalancer and protect the chosen quantity. Split counted pantry demand into available and missing quantities when building shopping lists.

**Tech Stack:** FastAPI/Pydantic, SQLite nutrition memory, deterministic Python nutrition engine, React, Vitest, Node test runner.

## Global Constraints

- Eggs use `lidl_002`, where one egg is 60 g and its nutrition is an inventory estimate.
- A substitution remains a proposal until `EAT & LOG` is separately confirmed.
- Replanning may change only unlogged meals and must preserve the 2,000 kcal / 175 g protein target tolerances.
- Pantry quantity cannot make a shopping-list requirement negative.
- Existing binary pantry entries remain supported.

---

### Task 1: Explicit pantry-food replacement

**Files:**
- Modify: `jarvis/api/routers/nutrition.py`
- Modify: `jarvis/domains/nutrition/recomposition.py`
- Test: `jarvis/domains/nutrition/tests/test_recomposition.py`
- Test: `jarvis/api/tests/test_nutrition_recomposition_routes.py`

**Interfaces:**
- Consumes: `replacement_item_id: str | None`, `quantity_g: float | None`.
- Produces: a new protocol preview with the requested food protected while remaining unlogged components rebalance.

- [ ] Write tests proving two eggs replace a selected meal without logging and invalid foods are rejected.
- [ ] Run the focused tests and confirm the new payload fails before implementation.
- [ ] Extend `ReplanProtocolRequest` and `replan_protocol` with explicit replacement selection.
- [ ] Run the focused tests and commit the passing backend behavior.

### Task 2: Count-aware grocery deduction

**Files:**
- Modify: `jarvis/domains/nutrition/engine.py`
- Test: `jarvis/domains/nutrition/tests/test_nutrition_engine.py`

**Interfaces:**
- Consumes: pantry payload `quantity_g` or `count` plus staple unit grams.
- Produces: split `already_have` and `need_to_buy` quantities when demand exceeds stock.

- [ ] Write a failing four-day eggs test for 24 required eggs with 20 at home.
- [ ] Implement capped pantry allocation and preserve binary pantry behavior.
- [ ] Run the focused engine tests and commit.

### Task 3: Today Protocol pantry picker

**Files:**
- Modify: `pwa/src/api/client.js`
- Modify: `pwa/src/components/nutrition/TodayProtocol.jsx`
- Modify: `pwa/src/components/nutrition/TodayProtocol.interaction.test.jsx`

**Interfaces:**
- Consumes: counted pantry entries from `GET /nutrition/memory?kind=pantry`.
- Produces: `POST /nutrition/today-protocol/replan` with `action=replace`, `replacement_item_id`, and `quantity_g`.

- [ ] Write a failing interaction test selecting Eggs and two eggs.
- [ ] Render a `USE FOOD I HAVE` proposal control with an egg-count input capped at available stock.
- [ ] Submit 120 g for two eggs and display the returned rebalanced preview without logging.
- [ ] Run interaction and complete PWA tests and commit.

### Task 4: Verify and release

**Files:**
- Verify: all changed files and production endpoints.

**Interfaces:**
- Consumes: Tasks 1–3.
- Produces: deployed backend and PWA with live count-aware egg behavior.

- [ ] Run focused tests, full backend tests, PWA tests, and production build.
- [ ] Push reviewed commits to `main` and deploy the PWA.
- [ ] Verify the production memory entry still reports 20 eggs and no meal was logged.
