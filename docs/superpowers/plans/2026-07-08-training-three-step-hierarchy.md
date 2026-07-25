# Training Three-Step Hierarchy Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Present Training as exactly three numbered action steps while retaining Telemetry and Modules as unnumbered support sections.

**Architecture:** Keep the existing `TrainingMetrics` component and `StepBadge` presentation primitive. Extend the primitive with an unnumbered mode, use it for the two support sections, and protect the hierarchy through the existing source-level UI contract test.

**Tech Stack:** React 18, JavaScript, Node test runner, Vite

## Global Constraints

- The numbered workflow is Check In, Warm-up, and Today’s Session.
- Telemetry and Modules remain below the session as unnumbered sections.
- API, routing, readiness, session-start, telemetry, and module behavior do not change.

---

### Task 1: Training hierarchy contract and presentation

**Files:**
- Modify: `pwa/src/components/training/trainingUiContract.test.js`
- Modify: `pwa/src/components/training/TrainingMetrics.jsx`

**Interfaces:**
- Consumes: the existing `StepBadge({ n, title, color, sys })` JSX helper.
- Produces: `StepBadge({ n, title, color, sys, numbered })`, where `numbered` defaults to `true`; `false` renders a support-section marker without a step number.

- [ ] **Step 1: Write the failing contract test**

Update the Training cockpit contract to require the current session language and unnumbered support-section calls:

```js
assert.match(source, /title="TODAY’S SESSION"/)
assert.match(source, /title="TELEMETRY" color={ORANGE} numbered={false}/)
assert.match(source, /title="MODULES" color={ORANGE} numbered={false}/)
assert.doesNotMatch(source, /<StepBadge n={4}/)
assert.doesNotMatch(source, /<StepBadge n={5}/)
```

- [ ] **Step 2: Run the focused test and verify RED**

Run: `node --test src/components/training/trainingUiContract.test.js`

Expected: FAIL because Telemetry and Modules still use `n={4}` and `n={5}`.

- [ ] **Step 3: Implement the minimal presentation change**

Give `StepBadge` an optional unnumbered mode:

```jsx
function StepBadge({ n, title, color = ORANGE, sys = 'SYS.TRAIN', numbered = true }) {
  // Preserve the existing wrapper and title styling.
  // Render the existing numeric badge only when numbered is true.
}
```

Call the support sections without step numbers:

```jsx
<StepBadge title="TELEMETRY" color={ORANGE} numbered={false} />
<StepBadge title="MODULES" color={ORANGE} numbered={false} />
```

- [ ] **Step 4: Run the focused test and verify GREEN**

Run: `node --test src/components/training/trainingUiContract.test.js`

Expected: all Training UI contract tests pass.

- [ ] **Step 5: Verify the complete frontend**

Run: `npm test`

Expected: all frontend tests pass with zero failures.

Run: `npm run build`

Expected: Vite production build exits with code 0.

- [ ] **Step 6: Inspect the rendered dashboards**

Open the PWA at its local Vite URL and inspect Nutrition and Training at a mobile viewport. Confirm Training shows only steps 1–3, Telemetry and Modules remain visible, and both dashboards retain the shared PHOENIX visual language.

- [ ] **Step 7: Commit the implementation**

```bash
git add pwa/src/components/training/trainingUiContract.test.js pwa/src/components/training/TrainingMetrics.jsx docs/superpowers/plans/2026-07-08-training-three-step-hierarchy.md
git commit -m "fix: clarify training three-step hierarchy"
```
