# Finance Cockpit Review 1

**Date:** 2026-06-30
**Scope:** Finance vertical slice after view-model, shared primitive, and real-history integration

## Evidence

- Node contract and chart tests: 13 passing.
- Vite production build: passing; existing chunk-size warning remains.
- Local API health: passing on an isolated copy of SQLite.
- `/finance/performance/history`: honest empty response from `real_sqlite`, `mock_data: false`.
- Browser-control bridge was not available in this session. No unsupported screenshot or pixel-perfect claim is made.

## Findings and Corrections

### P1 — stale request guard did not guard unmounts

`loadAll(active)` received the boolean value `true`. The cleanup later changed a different closure variable, so fulfilled requests could still update state after unmount.

**Correction:** use a component-owned `mountedRef`; all settled response application checks its current value. Refreshes reuse the same guarded loader.

### P1 — ETF audit language assumed the Quality sleeve

The backend can currently select `growth_nasdaq_etf`, but candidate audit copy said “Quality ETF candidates.” Broker status labels were also hardcoded.

**Correction:** derive the active ETF sleeve and both availability labels from the normalized backend payload. Render `selection_gap_reason` verbatim from coverage.

### P1 — safety contract was implicit

The page repeated “manual only” but did not expose all five backend safety flags together.

**Correction:** add a Safety Lock panel. Explicit `false` is safe/green; missing values are `unknown`/caution, never silently converted to false.

### P2 — desktop canvas remained phone-like

The existing 900px maximum constrained the hero, authorization core, and data panels on normal desktop widths.

**Correction:** expand the bounded canvas to 1120px while retaining mobile single-column rules.

### P2 — interactive audit and navigation surfaces were not semantic buttons

Clickable `<div>` elements were not keyboard-native.

**Correction:** convert them to `<button type="button">`, expose `aria-expanded` for audit state, and add a shared visible focus ring.

### P2 — essential section telemetry was too small

The shared section tag used 8px text.

**Correction:** raise the shared section tag to 10px. Deeper legacy micro-labels remain a bounded follow-up because changing all inline typography without visual browser evidence risks layout regressions.

## Truth and Safety Review

- Manual action cards come only from `/finance/manual-buy-checklist`.
- ETF research/checklist roles come only from `/finance/data-coverage`.
- Missing checklist data produces no inferred actions.
- Performance SVG requires at least two real finite timestamped totals.
- One point renders `INSUFFICIENT_HISTORY`; zero points render `EMPTY`.
- No mutation endpoint was added or called by dashboard loading.
- Home was not changed.

## Deferred, Bounded Follow-ups

- `FinanceDashboard.jsx` remains large. Further extraction should follow observed reuse in Training/Nutrition rather than creating speculative abstractions now.
- Existing bundle chunks exceed 500kB. Route-level lazy loading belongs in the cross-domain performance slice.
- Visual screenshots at 390x844 and 1440x1000 remain pending until browser control is available.
