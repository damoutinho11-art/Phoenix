# Finance Control Room Projected Layer Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Restyle the Finance Control Room as a projected PHOENIX finance layer with the approved pop animation.

**Architecture:** Keep `FinanceControlRoom.jsx` as the only production UI surface touched. Preserve its lane state, sub-tab state, and content components; replace the full-screen dashboard shell with a centered clipped-glass projection shell over a translucent scrim. Add local keyframe CSS names in the component so the animation is self-contained.

**Tech Stack:** React 18, Vite, inline holo token styling, Node source-contract tests via `node --test`.

## Global Constraints

- Only the Finance Control Room shell changes.
- Main Finance projection remains unchanged.
- Four top-level lanes remain `BRIEF / PORTFOLIO / BUDGET / RESEARCH`.
- Existing lane content and data wiring remain intact.
- Manual-only safety copy remains present.
- Pop animation includes scrim fade, panel pop, scan sweep, divider draw, lane stagger, and content materialize.

---

### Task 1: Contract The Visual Shell

**Files:**
- Modify: `pwa/src/components/holo/financeControlRoomContract.test.js`
- Test: `pwa/src/components/holo/financeControlRoomContract.test.js`

**Interfaces:**
- Consumes: `FinanceControlRoom.jsx` source text.
- Produces: regression coverage for projected shell and animation names.

- [ ] **Step 1: Add failing source-contract assertions**

Require `FINANCE_ROOM_MOTION_CSS`, `holo-financeRoomPop`, `holo-financeRoomScan`, `holo-financeLaneIn`, `holo-financeInstrumentIn`, `PROJECTED FINANCE LAYER`, and a centered shell transform.

- [ ] **Step 2: Run focused test**

Run: `cd pwa; node --test src/components/holo/financeControlRoomContract.test.js`

Expected: FAIL because the current Control Room shell is still the full-screen dashboard shell.

### Task 2: Implement The Projected Shell

**Files:**
- Modify: `pwa/src/components/holo/subs/FinanceControlRoom.jsx`
- Test: `pwa/src/components/holo/financeControlRoomContract.test.js`

**Interfaces:**
- Consumes: existing props `{ onClose, checks, stamped, onToggle, onConfirm, holdings, finance }`.
- Produces: the same Control Room behavior inside a projected PHOENIX shell.

- [ ] **Step 1: Add local motion CSS**

Create a `FINANCE_ROOM_MOTION_CSS` string with named keyframes for scrim, pop, scan, divider, lane, and instrument motion.

- [ ] **Step 2: Replace the full-screen frame**

Use a translucent scrim plus a centered clipped panel with `transform: 'translate(-50%,-50%)'`, SubShell-like header, divider, and scrollable body.

- [ ] **Step 3: Preserve lanes and content**

Keep `BRIEF`, `PORTFOLIO`, `BUDGET`, `RESEARCH`, their sub-tabs, and all existing content components.

- [ ] **Step 4: Run focused test**

Run: `cd pwa; node --test src/components/holo/financeControlRoomContract.test.js`

Expected: PASS.

### Task 3: Verify In App

**Files:**
- Modify only if verification finds a defect.
- Test: full PWA suite, production build, browser preview.

**Interfaces:**
- Consumes: implemented Control Room.
- Produces: verified local app preview.

- [ ] **Step 1: Run full tests**

Run: `cd pwa; npm test`

- [ ] **Step 2: Run production build**

Run: `cd pwa; npm run build`

- [ ] **Step 3: Inspect browser preview**

Serve `pwa/dist` over HTTP, open Finance, click `CONTROL ROOM`, verify the main projection remains visible behind the projected shell and the animation runs without layout overflow.
