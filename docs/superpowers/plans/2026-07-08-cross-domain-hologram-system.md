# Cross-Domain Hologram System Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Give the Finance, Nutrition, Training, and Calendar main command centers one maximum-hologram PHOENIX presentation system while preserving domain identity and behavior.

**Architecture:** Add presentation-only shared primitives for the decorative atmosphere and configurable hero instrument. Each dashboard explicitly adopts the primitives and supplies its existing model values; shared CSS owns effects, responsive behavior, and reduced motion.

**Tech Stack:** React 18, JavaScript, CSS, Node test runner, Vite

## Global Constraints

- Home remains unchanged.
- Only the four main command centers are included; detail screens are deferred.
- Domain colors remain cyan Finance, green Nutrition, orange Training, and violet Calendar.
- Domain names use warm white; `COMMAND CENTER` uses the domain accent.
- Decorative layers are pointer-transparent and `aria-hidden="true"`.
- No backend, API, database, routing, or dashboard-model contract changes.
- Every value shown by an instrument comes from existing dashboard data or an honest placeholder.

---

### Task 1: Shared hologram presentation primitives

**Files:**
- Create: `pwa/src/components/cockpit/HologramCommandSystem.jsx`
- Create: `pwa/src/components/cockpit/hologramCommandSystem.test.js`
- Modify: `pwa/src/components/cockpit/cockpit.css`

**Interfaces:**
- Produces: `HologramAtmosphere({ accent, systemLabel })`.
- Produces: `HologramHeroCore({ domain, accent, symbol, value, label, telemetry, ariaLabel })`.
- `telemetry` is an array of `{ label: string, value: string }`, limited to three visible cells.

- [ ] **Step 1: Write the failing shared contract test**

```js
import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const source = readFileSync(new URL('./HologramCommandSystem.jsx', import.meta.url), 'utf8')
const css = readFileSync(new URL('./cockpit.css', import.meta.url), 'utf8')

test('shared hologram system is decorative and motion-safe', () => {
  assert.match(source, /export function HologramAtmosphere/)
  assert.match(source, /export function HologramHeroCore/)
  assert.match(source, /aria-hidden="true"/)
  assert.match(source, /phx-hologram-telemetry/)
  assert.match(css, /\.phx-hologram-atmosphere[\s\S]*?pointer-events:\s*none/)
  assert.match(css, /@media \(prefers-reduced-motion:\s*reduce\)[\s\S]*?\.phx-hologram-sweep/)
})
```

- [ ] **Step 2: Run the shared test and verify RED**

Run: `node --test src/components/cockpit/hologramCommandSystem.test.js`

Expected: FAIL because `HologramCommandSystem.jsx` does not exist.

- [ ] **Step 3: Implement the shared JSX primitives**

```jsx
export function HologramAtmosphere({ accent, systemLabel }) {
  return (
    <div className="phx-hologram-atmosphere" style={{ '--phx-holo-accent': accent }} aria-hidden="true">
      <span className="phx-hologram-scanlines" />
      <span className="phx-hologram-grid" />
      <span className="phx-hologram-sweep" />
      <span className="phx-hologram-vignette" />
      <span className="phx-hologram-corners" />
      <span className="phx-hologram-system-label">{systemLabel}</span>
    </div>
  )
}

export function HologramHeroCore({ domain, accent, symbol, value, label, telemetry = [], ariaLabel }) {
  return (
    <section className={`phx-hologram-core phx-hologram-core--${domain}`} style={{ '--phx-holo-accent': accent }} aria-label={ariaLabel}>
      <div className="phx-hologram-orbit" aria-hidden="true"><span>{symbol}</span></div>
      <strong>{value}</strong><small>{label}</small>
      <div className="phx-hologram-telemetry">
        {telemetry.slice(0, 3).map(item => <div key={item.label}><span>{item.label}</span><b>{item.value}</b></div>)}
      </div>
    </section>
  )
}
```

- [ ] **Step 4: Add the shared CSS system**

Add scoped rules for `.phx-hologram-atmosphere`, scanlines, grid, sweep, vignette, corners, orbit, telemetry cells, responsive stacking, and this reduced-motion override:

```css
@media (prefers-reduced-motion: reduce) {
  .phx-hologram-sweep,
  .phx-hologram-scanlines,
  .phx-hologram-orbit::before,
  .phx-hologram-orbit::after { animation: none !important; }
}
```

- [ ] **Step 5: Run the shared test and verify GREEN**

Run: `node --test src/components/cockpit/hologramCommandSystem.test.js`

Expected: PASS.

- [ ] **Step 6: Commit the shared system**

```bash
git add pwa/src/components/cockpit/HologramCommandSystem.jsx pwa/src/components/cockpit/hologramCommandSystem.test.js pwa/src/components/cockpit/cockpit.css
git commit -m "feat: add shared command hologram system"
```

### Task 2: Finance and Nutrition adoption

**Files:**
- Modify: `pwa/src/components/finance/FinanceDashboard.jsx`
- Modify: `pwa/src/components/finance/financeDashboardPresentation.test.js`
- Modify: `pwa/src/components/nutrition/NutritionDashboard.jsx`
- Modify: `pwa/src/components/nutrition/nutritionUiContract.test.js`

**Interfaces:**
- Consumes: `HologramAtmosphere` and `HologramHeroCore` from Task 1.
- Produces: Finance capital-radar configuration and Nutrition fuel-reactor configuration using existing dashboard model values.

- [ ] **Step 1: Add failing Finance and Nutrition adoption assertions**

```js
assert.match(source, /HologramAtmosphere/)
assert.match(source, /HologramHeroCore/)
assert.match(source, /SYS\.FIN \/\/ CAPITAL ARRAY/) // Finance test
assert.match(source, /domain="finance"/)
assert.match(source, /SYS\.NTR \/\/ FUEL REACTOR/) // Nutrition test
assert.match(source, /domain="nutrition"/)
```

- [ ] **Step 2: Run both contracts and verify RED**

Run: `node --test src/components/finance/financeDashboardPresentation.test.js src/components/nutrition/nutritionUiContract.test.js`

Expected: FAIL because neither dashboard imports the shared system.

- [ ] **Step 3: Adopt the system in Finance**

Import both primitives, render `HologramAtmosphere` inside the Finance cockpit, retain the warm-white `FINANCE` line and cyan `COMMAND CENTER`, and configure `HologramHeroCore` with existing `dashboard.hero` and `dashboard.meta` values. Use `—` when an existing value is unavailable; do not calculate new finance metrics in JSX.

- [ ] **Step 4: Adopt the system in Nutrition**

Import both primitives, render `HologramAtmosphere` inside the Nutrition cockpit, retain the warm-white `NUTRITION` line and green `COMMAND CENTER`, and configure `HologramHeroCore` from `model.logged`, `model.remaining`, `model.target`, and the existing day-mode label. Use the model’s safe values and placeholders only.

- [ ] **Step 5: Run both contracts and verify GREEN**

Run: `node --test src/components/finance/financeDashboardPresentation.test.js src/components/nutrition/nutritionUiContract.test.js`

Expected: PASS.

- [ ] **Step 6: Commit Finance and Nutrition**

```bash
git add pwa/src/components/finance/FinanceDashboard.jsx pwa/src/components/finance/financeDashboardPresentation.test.js pwa/src/components/nutrition/NutritionDashboard.jsx pwa/src/components/nutrition/nutritionUiContract.test.js
git commit -m "feat: add finance and nutrition hologram cores"
```

### Task 3: Training and Calendar adoption

**Files:**
- Modify: `pwa/src/components/training/TrainingMetrics.jsx`
- Modify: `pwa/src/components/training/trainingUiContract.test.js`
- Modify: `pwa/src/components/calendar/CalendarDashboard.jsx`
- Modify: `pwa/src/components/calendar/calendarUiContract.test.js`

**Interfaces:**
- Consumes: shared primitives from Task 1.
- Produces: Training readiness-core configuration and Calendar temporal-orbit configuration using existing values.

- [ ] **Step 1: Add failing Training and Calendar adoption assertions**

```js
assert.match(metrics, /HologramAtmosphere/)
assert.match(metrics, /HologramHeroCore/)
assert.match(metrics, /SYS\.TRN \/\/ READINESS CORE/)
assert.match(metrics, /domain="training"/)
assert.match(source, /SYS\.CAL \/\/ TEMPORAL ORBIT/)
assert.match(source, /domain="calendar"/)
```

- [ ] **Step 2: Run both contracts and verify RED**

Run: `node --test src/components/training/trainingUiContract.test.js src/components/calendar/calendarUiContract.test.js`

Expected: FAIL because shared adoption is missing.

- [ ] **Step 3: Replace Training’s duplicated atmosphere**

Import the shared primitives, remove the local `HoloOverlay`, preserve the three-step workflow, and configure the shared core from `daysToAttempt`, `recovery.overall`, `sessionType`, and `mesoWeek`. Do not change readiness gating or navigation.

- [ ] **Step 4: Adopt the system in Calendar**

Import both primitives, render the shared atmosphere in the main command-center branch only, keep `CALENDAR` warm white and `COMMAND CENTER` violet, and configure the core from the existing next-event, schedule-load, and gap/open-window values already prepared by `CalendarDashboard`. Detail-section branches remain unchanged.

- [ ] **Step 5: Run both contracts and verify GREEN**

Run: `node --test src/components/training/trainingUiContract.test.js src/components/calendar/calendarUiContract.test.js`

Expected: PASS.

- [ ] **Step 6: Commit Training and Calendar**

```bash
git add pwa/src/components/training/TrainingMetrics.jsx pwa/src/components/training/trainingUiContract.test.js pwa/src/components/calendar/CalendarDashboard.jsx pwa/src/components/calendar/calendarUiContract.test.js
git commit -m "feat: unify training and calendar hologram cores"
```

### Task 4: Home protection and complete verification

**Files:**
- Modify: `pwa/src/components/PhoenixOpeningScreen/phoenixOpeningHomeContract.test.js`

**Interfaces:**
- Consumes: completed domain integrations.
- Produces: a regression guard proving Home does not adopt `HologramCommandSystem` in this slice.

- [ ] **Step 1: Add the Home exclusion test**

```js
assert.doesNotMatch(opening, /HologramAtmosphere|HologramHeroCore/)
```

- [ ] **Step 2: Run the Home test**

Run: `node --test src/components/PhoenixOpeningScreen/phoenixOpeningHomeContract.test.js`

Expected: PASS because Home remains unchanged.

- [ ] **Step 3: Run full verification**

Run: `npm test`

Expected: all PWA tests pass with zero failures.

Run: `npm run build`

Expected: Vite production build exits 0; the existing chunk-size advisory may remain.

- [ ] **Step 4: Perform visual QA**

Render Finance, Nutrition, Training, and Calendar at 390×844 and the default desktop viewport. Verify warm-white domain names, accent-colored `COMMAND CENTER`, domain-native cores, readable telemetry, pointer-safe overlays, preserved Training steps, and unchanged Home.

- [ ] **Step 5: Commit the protection test and plan**

```bash
git add pwa/src/components/PhoenixOpeningScreen/phoenixOpeningHomeContract.test.js docs/superpowers/plans/2026-07-08-cross-domain-hologram-system.md
git commit -m "test: protect hologram system scope"
```
