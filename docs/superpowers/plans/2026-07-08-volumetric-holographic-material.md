# Volumetric Holographic Material Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Apply premium volumetric holographic glass to the existing Finance, Nutrition, Training, and Calendar command centers without changing their layout, features, data, or behavior.

**Architecture:** Add one presentation-only atmosphere component plus shared CSS material classes. Existing domain components opt their current surfaces into those classes; no new dashboard features or metric-bearing components are created.

**Tech Stack:** React 18, JavaScript, CSS, Node test runner, Vite

## Global Constraints

- Start from `main`; do not reuse the rejected cross-domain hero-core implementation.
- Home remains unchanged.
- Preserve existing component order, dimensions, metrics, controls, navigation, responsive layout, and behavior.
- Add no cards, cores, telemetry rows, metrics, projector bases, spheres, or information.
- Use a plain code-native CSS background with no embedded image, photographic scene, triangular mesh, fence pattern, or dense perspective grid.
- Glass corners remain sharp; depth is limited to a subtle 3–5 pixel rear offset and approximately one degree of perspective.
- Domain names remain warm white; `COMMAND CENTER` retains its domain accent.
- Green is reserved for verified, live, safe, or successful states.
- Decorative layers are `aria-hidden="true"` and pointer-transparent.
- Reduced-motion mode stops continuous drift, sweeps, flicker, particles, rotations, and nonessential transitions.
- No backend, API, database, router, or dashboard-model changes.

---

### Task 1: Shared holographic material system

**Files:**
- Create: `pwa/src/components/cockpit/HolographicMaterial.jsx`
- Create: `pwa/src/components/cockpit/holographicMaterial.test.js`
- Modify: `pwa/src/components/cockpit/cockpit.css`

**Interfaces:**
- Produces: `HolographicAtmosphere({ accent, label })`, a decorative pointer-transparent layer.
- Produces CSS utilities: `.phx-holo-surface`, `.phx-holo-surface--quiet`, and `.phx-holo-active`.

- [ ] **Step 1: Write the failing material contract**

```js
import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const source = readFileSync(new URL('./HolographicMaterial.jsx', import.meta.url), 'utf8')
const css = readFileSync(new URL('./cockpit.css', import.meta.url), 'utf8')

test('holographic material is sharp, restrained, and motion-safe', () => {
  assert.match(source, /export function HolographicAtmosphere/)
  assert.match(source, /aria-hidden="true"/)
  assert.match(css, /\.phx-holo-atmosphere[\s\S]*?pointer-events:\s*none/)
  assert.match(css, /\.phx-holo-surface[\s\S]*?border-radius:\s*0/)
  assert.match(css, /translate\(4px,\s*5px\)/)
  assert.doesNotMatch(css, /triangular|fence|perspective-grid/)
  assert.match(css, /@media \(prefers-reduced-motion:\s*reduce\)[\s\S]*?\.phx-holo-surface/)
})
```

- [ ] **Step 2: Run the test and verify RED**

Run: `node --test src/components/cockpit/holographicMaterial.test.js`

Expected: FAIL because `HolographicMaterial.jsx` does not exist.

- [ ] **Step 3: Implement the decorative atmosphere**

```jsx
export function HolographicAtmosphere({ accent, label }) {
  return (
    <div className="phx-holo-atmosphere" style={{ '--phx-holo-accent': accent }} aria-hidden="true">
      <span className="phx-holo-light-field" />
      <span className="phx-holo-particles" />
      <span className="phx-holo-trace" />
      <span className="phx-holo-label">{label}</span>
    </div>
  )
}
```

- [ ] **Step 4: Implement the shared CSS material**

Create a plain layered blue-gray atmosphere using radial gradients and sparse traces. `.phx-holo-surface` uses a transparent domain-tinted fill, backdrop blur, sharp internal border, 4×5 pixel rear-plane pseudo-element, thin right/bottom edge highlights, restrained contact shadow, and no layout-affecting dimensions. `.phx-holo-surface--quiet` reduces emission; `.phx-holo-active` adds selective domain-colored bloom. Under reduced motion, all atmosphere and surface animations/transitions are disabled.

- [ ] **Step 5: Run the material test and verify GREEN**

Run: `node --test src/components/cockpit/holographicMaterial.test.js`

Expected: PASS.

- [ ] **Step 6: Commit the shared system**

```bash
git add pwa/src/components/cockpit/HolographicMaterial.jsx pwa/src/components/cockpit/holographicMaterial.test.js pwa/src/components/cockpit/cockpit.css
git commit -m "feat: add volumetric holographic material"
```

### Task 2: Finance real-screen prototype

**Files:**
- Modify: `pwa/src/components/finance/FinanceDashboard.jsx`
- Modify: `pwa/src/components/finance/financeDashboardPresentation.test.js`

**Interfaces:**
- Consumes: `HolographicAtmosphere` and the shared material classes from Task 1.
- Produces: the existing Finance screen with material-only adoption and unchanged feature hierarchy.

- [ ] **Step 1: Add failing Finance assertions**

```js
assert.match(source, /HolographicAtmosphere/)
assert.match(source, /SYS\.FIN \/\/ CAPITAL OPERATIONS/)
assert.match(source, /phx-holo-surface/)
assert.doesNotMatch(source, /HologramHeroCore|HologramAtmosphere/)
```

- [ ] **Step 2: Run the Finance contract and verify RED**

Run: `node --test src/components/finance/financeDashboardPresentation.test.js`

Expected: FAIL because material adoption is absent.

- [ ] **Step 3: Apply material to existing Finance surfaces**

Import `HolographicAtmosphere`, render it inside the existing cockpit shell, and add `.phx-holo-surface` or `.phx-holo-surface--quiet` to existing hero, authorization, output, and route containers. Do not insert a new metric-bearing component or move existing JSX. Preserve warm-white `FINANCE` and cyan `COMMAND CENTER`.

- [ ] **Step 4: Run the Finance contract and verify GREEN**

Run: `node --test src/components/finance/financeDashboardPresentation.test.js`

Expected: PASS.

- [ ] **Step 5: Commit the Finance prototype**

```bash
git add pwa/src/components/finance/FinanceDashboard.jsx pwa/src/components/finance/financeDashboardPresentation.test.js
git commit -m "feat: apply holographic material to finance"
```

### Task 3: Review Finance visually before propagation

**Files:**
- No production files change unless visual review identifies a concrete defect.

**Interfaces:**
- Consumes: the real Finance prototype from Task 2.
- Produces: user approval or a documented correction before other domains adopt the material.

- [ ] **Step 1: Verify Finance at mobile and desktop sizes**

Render the real Finance screen at 390×844 and the default viewport. Capture before/after screenshots and compare feature order, dimensions, text, navigation, and interaction positions.

- [ ] **Step 2: Present Finance for user review**

Confirm that the material reads as premium volumetric glass, remains sharp and compact, has no embedded background image or fence mesh, and preserves the real dashboard composition.

- [ ] **Step 3: Correct only approved visual defects**

Any correction follows a focused failing contract or snapshot guard before CSS/JSX changes, then reruns the Finance contract and build.

### Task 4: Propagate approved material to Nutrition, Training, and Calendar

**Files:**
- Modify: `pwa/src/components/nutrition/NutritionDashboard.jsx`
- Modify: `pwa/src/components/nutrition/nutritionUiContract.test.js`
- Modify: `pwa/src/components/training/TrainingMetrics.jsx`
- Modify: `pwa/src/components/training/trainingUiContract.test.js`
- Modify: `pwa/src/components/calendar/CalendarDashboard.jsx`
- Modify: `pwa/src/components/calendar/calendarUiContract.test.js`

**Interfaces:**
- Consumes: user-approved Finance material classes and atmosphere.
- Produces: material-only adoption in three additional main command centers; details remain deferred.

- [ ] **Step 1: Add failing domain adoption contracts**

Each contract requires `HolographicAtmosphere`, its exact system label, and `.phx-holo-surface`, and rejects `HologramHeroCore` and new metric-bearing hologram components.

- [ ] **Step 2: Run the three contracts and verify RED**

Run: `node --test src/components/nutrition/nutritionUiContract.test.js src/components/training/trainingUiContract.test.js src/components/calendar/calendarUiContract.test.js`

Expected: FAIL for missing material adoption.

- [ ] **Step 3: Apply material without moving features**

Use `SYS.NTR // FUEL OPERATIONS`, `SYS.TRN // READINESS OPERATIONS`, and `SYS.CAL // TEMPORAL OPERATIONS`. Add material classes only to existing main-screen containers. Preserve Training’s three steps and readiness gating. Add Calendar atmosphere only after its detail-screen early return. Do not modify detail screens.

- [ ] **Step 4: Run the three contracts and verify GREEN**

Run the focused command from Step 2.

Expected: PASS.

- [ ] **Step 5: Commit propagation**

```bash
git add pwa/src/components/nutrition/NutritionDashboard.jsx pwa/src/components/nutrition/nutritionUiContract.test.js pwa/src/components/training/TrainingMetrics.jsx pwa/src/components/training/trainingUiContract.test.js pwa/src/components/calendar/CalendarDashboard.jsx pwa/src/components/calendar/calendarUiContract.test.js
git commit -m "feat: propagate holographic material across domains"
```

### Task 5: Home guard and complete verification

**Files:**
- Modify: `pwa/src/components/PhoenixOpeningScreen/phoenixOpeningHomeContract.test.js`

**Interfaces:**
- Produces: regression guard proving Home remains outside the material system.

- [ ] **Step 1: Add the Home exclusion guard**

```js
assert.doesNotMatch(opening, /HolographicAtmosphere|phx-holo-surface/)
```

- [ ] **Step 2: Run complete verification**

Run: `npm test`

Expected: all tests pass with zero failures.

Run: `npm run build`

Expected: Vite exits 0; the existing chunk-size advisory may remain.

- [ ] **Step 3: Perform final visual QA**

Inspect Home plus all four main command centers at 390×844 and the default viewport. Verify unchanged geometry/content, sharp compact glass, plain CSS backgrounds, domain colors, reduced motion, and no fence pattern or new features.

- [ ] **Step 4: Commit the scope guard**

```bash
git add pwa/src/components/PhoenixOpeningScreen/phoenixOpeningHomeContract.test.js
git commit -m "test: protect holographic material scope"
```
