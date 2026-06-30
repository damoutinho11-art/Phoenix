# Finance Cockpit Review 2

**Date:** 2026-06-30
**Review lens:** correctness, responsive pressure, accessibility, truthful data, performance, and scope containment

## Independent Findings

### Correctness

- The view model consumes the current ETF sleeve dynamically from recommendation provenance and the backend ETF universe.
- `selected_candidate` is accepted only as the documented backward-compatible alias for `checklist_candidate`; no ranking occurs in the frontend.
- Manual actions remain checklist-only. Recommendation legs cannot silently become action cards.
- Missing safety flags remain `unknown`, not false.
- Performance points require finite totals and valid timestamps, are sorted oldest-to-newest for drawing, and never receive fabricated gaps or zeros.
- The stale request guard now reads live component state through `mountedRef`.

### Responsive and readability

- Shared mobile rules collapse hero, action, resolution, portfolio, audit, and navigation grids.
- Second-pass source inspection found fixed hero sizes and the non-wrapping telemetry row could pressure a 390px viewport.
- Final correction adds mobile clamps for the command title and portfolio total, reduces hero padding, and stacks header/section telemetry.
- Bottom clearance is `104px + safe-area-inset-bottom`, exceeding the 88px nav boundary.

### Accessibility and motion

- Chart SVG has `role="img"` and a textual observation/date/value/source summary.
- Audit and navigation controls are native buttons with visible focus treatment.
- Motion is decorative and disabled under `prefers-reduced-motion`.
- Safety meaning is expressed in text and boolean values, not color alone.

### Performance and duplication

- No chart library was added; SVG geometry is under 1KB of runtime logic.
- Nine finance reads still occur in parallel once per mount, matching the existing transport pattern.
- The existing large route bundle warning remains. Route-level lazy loading should be handled once across all domains rather than patched only for Finance.
- Shared primitives are intentionally small and domain-neutral; finance decision logic remains in the view model.

## Scope Audit

- No backend, database, resolver, allocation, evidence, gate, ledger, apply, broker, order, or trade code changed.
- No Home file changed.
- No production or mutable data file is present in this branch diff.
- The local visual stack used a copied SQLite database and read-only current portfolio path.

## Residual Limitation

Automated in-app browser control was unavailable, so visual claims are limited to source-level responsive analysis, successful runtime serving, and production build evidence. A screenshot review remains the first check when browser control returns; it is not represented as complete here.
