# PHOENIX Finance Cockpit Vertical Slice Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Turn the existing Finance Command Center into the first maintainable, contract-driven PHOENIX cockpit slice while preserving every finance safety and selection invariant.

**Architecture:** Keep the existing finance API routes and the current visual direction. Move response normalization into a pure finance view-model module, extract small domain-neutral cockpit presentation primitives, and let `FinanceDashboard.jsx` orchestrate data loading and composition. Visualizations consume only real backend observations and render an explicit `INSUFFICIENT_HISTORY` state otherwise.

**Tech Stack:** React 18, Vite 5, inline/CSS-variable styling, native SVG, Node's built-in test runner, existing FastAPI finance contracts.

## Global Constraints

- Preserve all current API paths and finance behavior.
- Do not change recommendation amounts, allocation, ETF selection, research evidence, acceptance gates, smoke gates, ledger, apply, broker, order, or execution logic.
- Never fabricate history, returns, P/L, prices, recommendations, or selection state.
- Keep Home unchanged.
- Use Rajdhani for command headings/metrics, Space Grotesk for body text, and Share Tech Mono for telemetry.
- Render `INSUFFICIENT_HISTORY` when fewer than two real observations exist.
- Maintain bottom-navigation clearance, keyboard focus, readable contrast, and reduced-motion behavior.
- Do not stage or commit `jarvis/data/jarvis.db`, `jarvis/domains/finance/portfolio_state.json`, `pwa/dev-dist/sw.js`, or the existing Finance diff/readme artifacts.

---

### Task 1: Finance dashboard view-model contract

**Files:**
- Create: `pwa/src/components/finance/financeDashboardModel.js`
- Create: `pwa/src/components/finance/financeDashboardModel.test.js`
- Modify: `pwa/package.json`

**Interfaces:**
- Consumes: raw results from `getFinanceSummary`, `getFinanceRecommendation`, `getFinanceManualBuyChecklist`, `getFinanceDataCoverage`, `getFinanceResearchMemos`, `getFinanceResearchValidationRecords`, `getFinancePortfolioState`, `getFinancePnl`, and `getFinancePerformanceHistory`.
- Produces: `buildFinanceDashboardModel(payload)` returning `{ meta, hero, actions, selection, safety, portfolio, performance, audit }` and `formatMoney`, `formatPercent`, `humanizeKey` helpers.

- [ ] **Step 1: Write failing pure-contract tests**

Use `node:test` and `node:assert/strict` to prove:

```js
test('uses checklist candidate and never recomputes ETF selection', () => {
  const model = buildFinanceDashboardModel({
    coverage: { verdict: 'DATA_TRANSPARENT', recommendation_data_provenance: {
      growth_nasdaq_etf: {
        research_winner: { symbol: 'EQQQ.L' },
        checklist_candidate: { symbol: 'CNDX.L', broker_availability_status: 'public_verified' },
        selection_gap_reason: 'Public verification boundary',
      },
    } },
    checklist: { checklist_items: [{ asset: 'growth_nasdaq_etf', amount: 69.23, symbol: 'CNDX.L' }] },
  })
  assert.equal(model.selection.checklistSymbol, 'CNDX.L')
  assert.equal(model.selection.researchSymbol, 'EQQQ.L')
})

test('marks one real performance point as insufficient history', () => {
  const model = buildFinanceDashboardModel({ performance: { snapshots: [{ id: 1, created_at: '2026-06-30T10:00:00Z', total_value_eur: 100 }] } })
  assert.equal(model.performance.historyStatus, 'INSUFFICIENT_HISTORY')
  assert.equal(model.performance.points.length, 1)
})

test('preserves false safety flags and treats missing flags as unknown', () => {
  const model = buildFinanceDashboardModel({ checklist: { safety_flags: { trades_executed: false } } })
  assert.equal(model.safety.trades_executed, false)
  assert.equal(model.safety.broker_connection, null)
})
```

- [ ] **Step 2: Run tests and confirm red**

Run: `node --test pwa/src/components/finance/financeDashboardModel.test.js`

Expected: FAIL because `financeDashboardModel.js` does not exist.

- [ ] **Step 3: Implement minimal pure normalization**

Implement null-safe selectors only; never rank candidates or calculate finance decisions. Performance points must filter out non-finite totals and retain backend timestamps. Safety fields must distinguish explicit `false` from missing data.

- [ ] **Step 4: Add frontend test script and run green**

Add:

```json
"test": "node --test src/**/*.test.js"
```

Run: `cd pwa && npm test`

Expected: all finance dashboard model tests pass.

- [ ] **Step 5: Commit the contract extraction**

```powershell
git add pwa/package.json pwa/src/components/finance/financeDashboardModel.js pwa/src/components/finance/financeDashboardModel.test.js
git commit -m "test(finance): define cockpit view model contract"
```

### Task 2: Shared cockpit presentation primitives

**Files:**
- Create: `pwa/src/components/cockpit/CockpitPrimitives.jsx`
- Create: `pwa/src/components/cockpit/cockpit.css`

**Interfaces:**
- Consumes: already-normalized labels, values, status, source, freshness, and children.
- Produces: `CockpitShell`, `DomainHeader`, `DataPanel`, `StatusChip`, `SourceStamp`, `EmptyState`, and `AuditDrawer`.

- [ ] **Step 1: Add a static import/render smoke test**

Extend the Vite build gate by importing primitives into a minimal export path; no DOM test dependency is added. Ensure every component accepts semantic HTML props and forwards `className`.

- [ ] **Step 2: Implement primitives with semantic markup**

Use `<main>`, `<header>`, `<section>`, `<button>`, and `<details>` appropriately. `AuditDrawer` uses native `<details>` for keyboard support. `SourceStamp` renders missing provenance as `SOURCE UNKNOWN`, never as live.

- [ ] **Step 3: Implement the shared visual layer**

Define CSS custom properties for PHOENIX fonts, cyan accent, panel edge, readable muted text, spacing, shadows, and focus rings. Include:

```css
@media (prefers-reduced-motion: reduce) {
  .phx-motion { animation: none !important; transition: none !important; }
}

.phx-cockpit-shell {
  min-height: 100%;
  overflow-y: auto;
  padding-bottom: calc(104px + env(safe-area-inset-bottom));
}
```

- [ ] **Step 4: Build and inspect CSS contract**

Run: `cd pwa && npm run build`

Expected: Vite exits 0 with no unresolved import or CSS error.

- [ ] **Step 5: Commit primitives**

```powershell
git add pwa/src/components/cockpit
git commit -m "feat(ui): add reusable PHOENIX cockpit primitives"
```

### Task 3: Real finance history visualization

**Files:**
- Create: `pwa/src/components/cockpit/MetricLineChart.jsx`
- Modify: `pwa/src/components/cockpit/cockpit.css`
- Modify: `pwa/src/components/finance/financeDashboardModel.test.js`

**Interfaces:**
- Consumes: `{ points: Array<{ timestamp: string, value: number }>, unit: string, historyStatus: string, source: string }`.
- Produces: accessible native SVG for two or more real points, otherwise an honest textual state.

- [ ] **Step 1: Add failing point-normalization tests**

Prove unsorted real snapshots become timestamp-ordered, null totals are excluded, no zeros are inserted, and two valid points yield `READY`.

- [ ] **Step 2: Run finance model tests and confirm red**

Run: `cd pwa && npm test`

Expected: FAIL on the new ordering/history assertions.

- [ ] **Step 3: Implement point normalization and SVG chart**

The SVG derives its path only from supplied points. Include `role="img"`, an `aria-label` summarizing observation count, date range, first value, and latest value. Do not display return or P/L unless explicitly supplied by the backend.

- [ ] **Step 4: Run tests and build**

Run: `cd pwa && npm test && npm run build`

Expected: tests and Vite build exit 0.

- [ ] **Step 5: Commit chart**

```powershell
git add pwa/src/components/cockpit pwa/src/components/finance/financeDashboardModel.test.js
git commit -m "feat(finance): visualize real portfolio snapshots"
```

### Task 4: Refactor Finance Command Center onto the contract

**Files:**
- Modify: `pwa/src/components/finance/FinanceDashboard.jsx`
- Modify: `pwa/src/api/client.js`

**Interfaces:**
- Consumes: `getFinancePerformanceHistory()` plus the eight existing dashboard reads and `buildFinanceDashboardModel()`.
- Produces: existing `FinanceDashboard({ onNav })` behavior and all existing subordinate navigation keys.

- [ ] **Step 1: Add performance-history fetch to the existing all-settled load**

Use `Promise.allSettled` so one failed read produces an explicit partial-data warning rather than a blank dashboard. Keep read-only requests read-only.

- [ ] **Step 2: Replace inline finance selection derivation with model fields**

The hero, weekly actions, research/checklist split, safety lock, portfolio snapshot, performance panel, and audit drawer must consume normalized fields. Never infer a candidate from candidate arrays in JSX.

- [ ] **Step 3: Compose shared cockpit primitives**

Preserve the Finance visual identity while deleting duplicated corner, panel, status-chip, empty-state, and audit-shell implementations that the shared primitives replace. Keep all subordinate screens reachable: Weekly Brief, Holdings, Performance, Research, Brief History, Budget, and Add Transactions.

- [ ] **Step 4: Add truthful partial/error states**

Render successful sections when available. Each failed source identifies the unavailable source. If checklist data is missing, say that no manual action checklist was returned; do not reconstruct actions from recommendation data.

- [ ] **Step 5: Run frontend tests and build**

Run: `cd pwa && npm test && npm run build`

Expected: node tests pass and Vite exits 0.

- [ ] **Step 6: Commit dashboard integration**

```powershell
git add pwa/src/api/client.js pwa/src/components/finance/FinanceDashboard.jsx
git commit -m "refactor(finance): drive command center from typed view data"
```

### Task 5: Responsive, accessibility, and motion verification

**Files:**
- Modify: `pwa/src/components/cockpit/cockpit.css`
- Modify: `pwa/src/components/finance/FinanceDashboard.jsx`
- Create: `docs/reviews/2026-06-30-finance-cockpit-review-1.md`

**Interfaces:**
- Consumes: completed Finance vertical slice.
- Produces: documented desktop/mobile/reduced-motion/focus review and fixes.

- [ ] **Step 1: Run the local API and Vite dev server**

Use temp/test-safe state or read-only local state. Do not invoke mutation routes.

- [ ] **Step 2: Inspect at mobile and desktop sizes at 100% zoom**

Verify 390×844 and 1440×1000: no bottom-nav overlap, no horizontal clipping, manual actions readable, audit subordinate, chart labels visible, and no controls hidden.

- [ ] **Step 3: Inspect loading, partial, empty, and insufficient-history states**

Use local response overrides or fixture injection; never add production demo data. Confirm missing checklist cannot look actionable.

- [ ] **Step 4: Verify keyboard and reduced motion**

Tab through navigation and audit disclosure, confirm visible focus, and emulate `prefers-reduced-motion: reduce`.

- [ ] **Step 5: Record findings and implement corrections**

Document each finding with severity, evidence, and exact fix in the review file. Apply only Finance/shared-cockpit corrections.

- [ ] **Step 6: Commit first review pass**

```powershell
git add pwa/src/components/cockpit pwa/src/components/finance/FinanceDashboard.jsx docs/reviews/2026-06-30-finance-cockpit-review-1.md
git commit -m "review: harden finance cockpit usability"
```

### Task 6: Independent self-review and final improvement

**Files:**
- Modify: files found defective in Tasks 1–5 only.
- Create: `docs/reviews/2026-06-30-finance-cockpit-review-2.md`

**Interfaces:**
- Consumes: committed Finance slice.
- Produces: second correctness/visual/performance audit and final verified slice.

- [ ] **Step 1: Review the complete diff against the approved design spec**

Check finance safety, truthful data, candidate boundaries, stale/missing source labels, read-only behavior, component duplication, render cost, accessibility, and Home isolation.

- [ ] **Step 2: Inspect request behavior**

Confirm one dashboard mount issues one request per source, unmount prevents stale state updates, and no dashboard read triggers a write.

- [ ] **Step 3: Apply final bounded corrections**

Fix every P0/P1 and low-risk P2 finding. Record explicitly deferred findings with rationale.

- [ ] **Step 4: Run fresh full verification**

Run:

```powershell
python -m pytest -q
python -m compileall -q jarvis
cd pwa
npm test
npm run build
cd ..
python -m jarvis.domains.finance.acceptance_gate
python -m jarvis.domains.finance.production_smoke_gate
git diff --check
git status -sb
```

Expected: all tests/gates exit 0; only the six pre-existing local artifacts remain outside the committed slice.

- [ ] **Step 5: Commit second review pass**

```powershell
git add docs/reviews/2026-06-30-finance-cockpit-review-2.md pwa/src/components/cockpit pwa/src/components/finance pwa/package.json pwa/src/api/client.js
git commit -m "review: verify finance cockpit vertical slice"
```

## Self-Review Notes

- Every Finance requirement in the approved design has a task: truthful contracts (Task 1), shared components and typography (Task 2), real graphs and insufficient history (Task 3), dashboard integration and subordinate navigation (Task 4), responsive/accessibility/motion (Task 5), and two review passes (Tasks 5–6).
- The plan deliberately does not alter backend routes because the existing Finance endpoints already expose the required real data and safety surfaces.
- The only new request is the existing read-only `/finance/performance/history` client call already present in `client.js`; no new API behavior is introduced.
- Home and all finance mutation workflows remain outside the changed surface.
