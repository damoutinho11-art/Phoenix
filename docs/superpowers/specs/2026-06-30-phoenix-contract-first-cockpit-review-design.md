# PHOENIX Contract-First Cockpit Review Design

**Date:** 2026-06-30
**Status:** Approved for implementation planning
**Scope:** Backend integrity and data contracts first, followed by domain-by-domain frontend modernization

## 1. Objective

Review and improve PHOENIX across its backend and PWA without sacrificing truthful data, existing safety contracts, or production behavior. The backend becomes a dependable product contract before the PWA consumes new dashboard data. Finance remains the visual reference for all non-Home domains.

The work is deliberately phased. It is not a wholesale rewrite and it does not fabricate history to make dashboards look complete.

## 2. Non-Negotiable Product Rules

- Preserve all current API paths and behavior; new response fields and routes are additive.
- Add only backward-compatible SQLite migrations.
- Never use synthetic, demo, interpolated, or backfilled production history.
- When real history is insufficient, return and render `INSUFFICIENT_HISTORY`.
- Preserve Finance recommendation, allocation, ETF-selection, evidence, approval, ledger, apply, acceptance-gate, and smoke-gate semantics.
- Preserve no-broker, no-order, no-auto-buy, no-auto-sell, no-auto-apply, and manual-approval guarantees.
- Preserve Nutrition approval-first logging and purchasing behavior.
- Preserve Calendar read-only Plaan boundary and token-gated ICS behavior.
- Preserve Anthropic as the default AI provider; AI and news remain optional to core operation.
- Keep the current Home visual design unchanged.
- On Home, change only what is required to make chat fully visible and prevent bottom truncation.
- Do not commit mutable production data, generated service workers, or unrelated local artifacts.

## 3. Delivery Strategy

### 3.1 Foundation

Before feature work:

1. Isolate tests from repository and production SQLite/JSON state.
2. Centralize or inject time so tests do not decay as calendar dates advance.
3. Block real network access in deterministic test runs unless a test explicitly opts into a mocked adapter.
4. Audit exception handling, writes, idempotency, API validation, source freshness, and external-provider boundaries.
5. Establish a clean, reproducible backend and frontend baseline.

### 3.2 Vertical Slices

After the foundation, deliver these independently reviewable slices:

1. Finance
2. Training
3. Nutrition
4. Calendar
5. Home chat visibility and Chat visual alignment
6. Cross-domain consistency and final performance/accessibility pass

Each slice follows: audit, failing tests, backend read model, frontend implementation, responsive/accessibility verification, first self-review, improvement, second self-review, final improvement, and validation.

## 4. Backend Architecture

### 4.1 Additive Cockpit Read Models

Each domain exposes an additive cockpit response with a common semantic shape:

```json
{
  "meta": {
    "as_of": "ISO timestamp or date",
    "generated_at": "ISO timestamp",
    "source": "real source identifier",
    "freshness": "fresh | stale | unknown",
    "confidence": "high | medium | low | unknown",
    "history_status": "READY | INSUFFICIENT_HISTORY | EMPTY"
  },
  "summary": {},
  "series": [],
  "status": {
    "warnings": [],
    "blockers": [],
    "safety": {}
  },
  "actions": []
}
```

Existing endpoints remain valid. Cockpit responses may be new read-only routes or additive structures assembled from existing routes; the implementation plan will choose the smallest compatible boundary per domain.

### 4.2 Data Truth Rules

- Finance series use real portfolio snapshots and ledger records.
- Training series use logged sessions, jumps, body measurements, sleep, soreness, and recovery records.
- Nutrition series use meal, macro, weight, adherence, and planner records that were actually logged or persisted.
- Calendar series use current read-only source events and persisted imports.
- Missing observations remain absent; the backend does not insert zeros unless zero is a real recorded value.
- Every externally sourced value exposes its source and freshness.
- AI narrative is never treated as a metric source.

### 4.3 Focused Services

Dashboard aggregation moves from oversized routers into focused domain read-model services. Route modules retain HTTP declarations, request validation, dependency wiring, and response construction. Domain services remain deterministic and independently testable.

Large modules are split only where the current task requires it. Refactoring must preserve public function signatures or provide compatibility wrappers.

### 4.4 Mutations and Error Handling

- Critical writes validate inputs and surface failures; they do not silently swallow exceptions.
- Optional providers remain fail-soft and return explicit warning/status metadata.
- Existing idempotency protections are retained and expanded only where repeated identical requests could create duplicate state.
- Read routes do not mutate state.
- Cockpit generation does not create ledger rows, portfolio snapshots, meal logs, training logs, calendar writes, orders, or approvals.

## 5. Frontend Architecture

### 5.1 Shared PHOENIX Components

Replace repeated inline presentation logic incrementally with reusable components:

- `CockpitShell`
- `DomainHeader`
- `HeroMetric`
- `AuthorizationCore`
- `MetricGrid`
- `StatusRail`
- `DataPanel`
- `Timeline`
- `LineChart`
- `BarChart`
- `AllocationRing`
- `ProgressArc`
- `SourceStamp`
- `AuditDrawer`
- shared loading, empty, stale, partial, and error states

Components consume typed view data and contain no domain-selection or recommendation logic.

### 5.2 Typography and Visual Language

Use the established Finance typography everywhere except where Home is explicitly preserved:

- Rajdhani: command headings, key metrics, and actions.
- Space Grotesk: body copy, explanations, and guidance.
- Share Tech Mono: telemetry, provenance, timestamps, and audit labels.

Visual hierarchy rules:

- Primary facts use high-contrast text and dominant scale.
- Body text is 14–16px on normal-density displays.
- Essential telemetry is never below 8px.
- Essential muted text maintains at least 60% perceived contrast against its panel.
- Glow reinforces hierarchy but never carries meaning alone.
- Panels use stronger edge separation, controlled shadows, and restrained accent lighting.

### 5.3 Domain Identity

- Finance: cyan; capital, allocation, evidence, and safety.
- Training: orange; output, progression, readiness, and recovery.
- Nutrition: lime; fuel, adherence, weight, and meal history.
- Calendar: violet; time, workload, conflicts, and schedule density.
- Chat: shared PHOENIX shell with a quieter conversational surface.
- Home: current design retained; only chat visibility/truncation is corrected.

### 5.4 Graphs

Graphs are lightweight SVG components unless the implementation audit proves a library materially improves accessibility and bundle size. They must:

- Render only real backend points.
- Show units, timestamps/categories, and source/freshness.
- Explain insufficient history instead of drawing a fake line.
- Remain readable on mobile and desktop.
- Provide a textual summary or accessible label.

### 5.5 Motion

Approved motion includes:

- restrained scan sweeps;
- chart-line and bar reveals;
- orbital authorization/readiness states;
- staggered metric entry;
- subtle hover depth and panel illumination.

Motion cannot obscure values, imply live change without new data, or block interaction. `prefers-reduced-motion` renders immediate static states.

## 6. Domain Outcomes

### 6.1 Finance

Preserve the existing command center and improve its code structure, responsiveness, data visualizations, audit discoverability, and performance. Portfolio, P&L, allocation, evidence, safety, checklist, and approval state remain backend-driven. No frontend ETF-selection logic is introduced.

### 6.2 Training

Use real session, jump, body, and recovery data to present current readiness and progression. Missing training history produces an honest empty state. Exercise logging remains explicit.

### 6.3 Nutrition

Use real meals, macro totals, adherence, weight, and planner records. Planned items and logged items remain visibly distinct. No automatic logging or purchasing is introduced.

### 6.4 Calendar

Use real current events/imports for timelines, workload density, and conflicts. Plaan remains read-only; ICS remains publish-only and token-protected.

### 6.5 Home and Chat

Home visuals remain unchanged. Diagnose the actual container/overflow cause of truncated chat and fix only that layout behavior. Chat adopts shared readability, scrolling, safe-area, and state components without changing Home’s composition.

## 7. Accessibility, Responsiveness, and Performance

- Mobile-first behavior remains fully supported.
- Desktop layouts use available width through deliberate grids rather than stretching phone layouts.
- Bottom navigation never overlaps content or controls.
- Keyboard navigation, focus visibility, semantic buttons, and readable contrast are required.
- Reduced-motion behavior is required.
- Avoid unnecessary chart/runtime dependencies.
- Audit fetch waterfalls, duplicate requests, stale effects, expensive render computations, and oversized component files.

## 8. Verification and Review Gates

Every slice must pass:

1. Backend unit tests.
2. API route and schema-contract tests.
3. Mutation and safety regression tests.
4. Temporary database/state verification.
5. Frontend production build.
6. Mobile and desktop checks at 100% zoom.
7. Loading, empty, partial, stale, and error-state checks.
8. Keyboard, focus, contrast, reduced-motion, and bottom-navigation checks.
9. First self-review for correctness, contracts, safety, and regressions.
10. Improvement pass.
11. Second self-review for visual consistency, accessibility, performance, and duplication.
12. Final improvement pass and fresh full verification.

The final report distinguishes new regressions from verified pre-existing failures; it never labels a failing suite green.

## 9. Out of Scope

- Broker connections, order creation, trade execution, or automatic portfolio mutation.
- Automatic food logging or purchasing.
- Plaan or Google Calendar writes.
- Synthetic historical data.
- Breaking API changes.
- Home redesign.
- Replacing Anthropic as the default AI behavior.

## 10. Acceptance Criteria

- Backend tests are deterministic and do not mutate repository production state.
- New cockpit responses are typed, additive, source-aware, and truthful.
- Each redesigned domain matches the approved premium PHOENIX language.
- Finance fonts are used across non-Home domain surfaces.
- Charts render real points only and expose insufficient-history states.
- Home looks the same and its chat is fully visible without bottom truncation.
- Finance, Nutrition, and Calendar safety invariants remain intact.
- No unrelated dirty file is staged or committed.
- Two documented self-review/improvement passes complete before final handoff.
