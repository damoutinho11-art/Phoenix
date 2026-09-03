# Phoenix Mobile Command Layout Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace compressed non-Home phone domains with a readable vertical command layout while preserving Home, desktop, data, and workflows.

**Architecture:** Add a mobile-only domain surface that reuses `domain.panels`, `heroActions`, `PanelBody`, and existing callbacks. Select it at the existing 780px media boundary; desktop continues through `HoloWings` without changed markup.

**Tech Stack:** React 18, CSS, Node test runner, Vite, Playwright browser QA.

## Global Constraints

- Below 780px, Finance, Nutrition, Training, and Calendar use the vertical command layout; Home is preserved.
- At 781px and above, the current desktop composition remains unchanged.
- Minimum body text is 13px, metadata is 10px, and interactive controls are at least 44px high.
- Navigation respects `env(safe-area-inset-bottom)`; content cannot hide behind it.
- Existing domain colors, live data, actions, focus projections, API contracts, and write safety are unchanged.
- No horizontal document overflow or horizontal wing rail on mobile.

---

### Task 1: Mobile Domain Surface

**Files:**
- Create: `pwa/src/components/holo/HoloMobileDomain.jsx`
- Modify: `pwa/src/components/holo/HoloCommand.jsx`
- Modify: `pwa/src/components/holo/HoloWings.jsx`
- Modify: `pwa/src/components/holo/holo.css`
- Test: `pwa/src/components/holo/mobileCommandLayout.test.js`

**Interfaces:**
- Consumes: `domain.panels`, `domain.heroActions`, `onFocus(code)`, `onAction(sub)`, `accent`.
- Produces: `HoloMobileDomain({domain,onFocus,onAction})`, a mobile-only scroll surface.

- [ ] **Step 1: Write failing source-contract tests**

Assert that `HoloCommand` renders `HoloMobileDomain` only for non-Home mobile domains and leaves desktop `HoloWings` in place. Assert the mobile component maps every panel and action, and CSS contains the exact 780px boundary, 13px body text, 10px metadata, 44px controls, safe-area bottom padding, vertical overflow, and no horizontal rail.

- [ ] **Step 2: Verify the tests fail**

Run: `node --test src/components/holo/mobileCommandLayout.test.js`
Expected: FAIL because `HoloMobileDomain.jsx` and its layout contract do not exist.

- [ ] **Step 3: Implement the mobile component**

Build semantic `section`, panel, and button markup. Reuse `Panel Implicit PanelBody` by exporting `PanelBody` from `HoloWings.jsx`. Preserve panel order and send each panel code to `onFocus`. Send each action's existing `sub` to `onAction`. Use classes rather than new inline viewport geometry.

- [ ] **Step 4: Wire the mobile branch**

In `HoloCommand.jsx`, render the mobile surface when `isMobile && !isHome`; render `HoloWings` only when `!isMobile && !isHome`. Hide the old mobile hero-action block for these domains because actions move into the scroll surface. Leave Home markup and all desktop conditions unchanged.

- [ ] **Step 5: Add responsive styling**

Create a fixed region between the compact reactor/header and dock, with `overflow-y:auto`, `overflow-x:hidden`, full-width clip-cornered panels, readable hierarchy, and bottom padding including the dock plus safe-area inset. Keep domain accent CSS variables and restrained glass styling.

- [ ] **Step 6: Verify and commit**

Run: `node --test src/components/holo/mobileCommandLayout.test.js`
Expected: PASS.

Run: `npm test`
Expected: all PWA tests pass.

Commit: `feat(mobile): add readable Phoenix domain layout`

### Task 2: Browser Geometry And Visual QA

**Files:**
- Modify: `pwa/src/components/holo/mobileCommandLayout.test.js`
- Modify if evidence requires: `pwa/src/components/holo/holo.css`

**Interfaces:**
- Consumes: production build served locally with the deployed API.
- Produces: verified layouts at target widths with no behavioral changes.

- [ ] **Step 1: Add failing regression assertions for geometry hooks**

Require stable data attributes for mobile content, panel stack, actions, and dock so browser checks can measure them without presentation-text selectors.

- [ ] **Step 2: Verify the assertions fail**

Run: `node --test src/components/holo/mobileCommandLayout.test.js`
Expected: FAIL for missing measurement hooks.

- [ ] **Step 3: Add minimal hooks and verify**

Add `data-phx-mobile-command`, `data-phx-mobile-panel`, and `data-phx-mobile-actions`; rerun the focused test and expect PASS.

- [ ] **Step 4: Build and inspect target viewports**

Run: `npm run build`.
Expected: production build succeeds.

At 390x844 and 375x667, inspect Home, Finance, Nutrition, Training, and Calendar. Confirm document `scrollWidth <= innerWidth`, dock bottom is inside the viewport, panel/action rectangles do not overlap the dock, every panel is reachable through vertical scrolling, and screenshots show readable unclipped content. At 1440x900, compare desktop screenshots and DOM structure with the pre-change release.

- [ ] **Step 5: Run final regression and commit**

Run: `npm test && npm run build`.
Expected: all tests and build pass.

Commit any evidence-driven correction as `fix(mobile): finalize Phoenix phone geometry`.
