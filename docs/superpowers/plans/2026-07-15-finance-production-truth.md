# Finance Production Truth Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make Railway the only production finance data source and pause finance recommendations whenever required inputs are unavailable or stale.

**Architecture:** The frontend carries explicit source status from the API hook into a finance offline view, while the backend rejects recommendations that cannot prove freshness or market regime. Vercel embeds the Railway origin during its production build, and deployment verification compares the browser readout with Railway directly.

**Tech Stack:** React, Vite, Node test runner, FastAPI, pytest, Vercel, Railway

## Global Constraints

- Never show realistic fixture finance values after a production API failure.
- Never recommend from stale holdings, stale prices, or an unknown market regime.
- Preserve manual approval and no-auto-trading rules.
- Preserve existing fallback behavior outside finance.

---

### Task 1: Frontend source truth

**Files:**
- Modify: `pwa/src/api/client.js`
- Modify: `pwa/src/components/holo/useHoloData.js`
- Modify: `pwa/src/components/holo/HoloCommand.jsx`
- Modify: `pwa/src/components/holo/holoLive.js`
- Test: `pwa/src/components/holo/financeControlRoomContract.test.js`

**Interfaces:**
- Produces: `live.status.finance` with `loading`, `error`, and `verifiedAt` fields.
- Produces: `applyFinanceOffline(domain, status)` with no numeric finance claims.

- [ ] Add contract assertions for a required production API URL, captured finance errors, and an explicit offline projection.
- [ ] Run the focused Node test and confirm the new assertions fail.
- [ ] Implement the minimal API configuration and offline projection behavior.
- [ ] Run the focused test and full frontend suite.

### Task 2: Backend freshness gate

**Files:**
- Modify: `jarvis/domains/finance/engine.py`
- Modify: `jarvis/domains/finance/market_data.py`
- Modify: `jarvis/api/routers/finance.py`
- Test: `jarvis/domains/finance/tests/test_portfolio_state_staleness.py`
- Test: `jarvis/api/tests/test_finance_routes.py`

**Interfaces:**
- Produces: a freshness blocker derived from `as_of` and `prices_refreshed_at`.
- Produces: a paused recommendation response with no buy legs when required data is unverified.

- [ ] Add tests proving stale prices and unknown regime produce no recommendation legs.
- [ ] Run focused pytest targets and confirm failures.
- [ ] Implement the minimal freshness and regime gates.
- [ ] Run focused and complete finance tests.

### Task 3: Production configuration and proof

**Files:**
- Configure: Vercel project `pwa`, production variable `VITE_API_URL`

**Interfaces:**
- Consumes: Railway origin `https://phoenix-production-1fb2.up.railway.app`.
- Produces: production alias `https://pwa-ochre-theta.vercel.app`.

- [ ] Link the local PWA directory to the Vercel project and set the production API origin.
- [ ] Build locally with the production origin and inspect the bundle.
- [ ] Deploy to production.
- [ ] Open a clean browser, compare the finance total with Railway, and inspect console errors.
- [ ] Simulate or test API failure and confirm no fixture finance values are rendered.
