# Finance and Calendar Shell Alignment

## Goal

Correct two desktop composition defects without redesigning either command center:

- Finance must present its portfolio summary and Authorization Core as one encompassing hero surface.
- Calendar must retain enough top spacing for its opening system line to render fully.

## Root causes

Finance currently renders `Header` and the Authorization Core wrapper as sibling panels inside `finance-hero-grid`. The `Header` owns the hero background and edge treatment, so that surface ends before the core and makes it appear detached.

Calendar defines intentional hero top spacing, but a later `.phx-calendar-v19` parity override applies `padding-top: 0 !important` to `.phx-command-hero`. That later rule wins and places the topbar against the scroll viewport edge.

## Design

### Finance

The existing `finance-hero-grid` becomes the single outer hero surface. It will own the background, lower edge, ambient dot field, and spacing that visually encompass both columns. The existing Finance copy and Authorization Core data flow remain unchanged. The core keeps its internal instrument card, while the left `Header` sheds the outer surface treatment that currently creates a panel-with-detached-panel composition.

At narrow widths, the existing single-column breakpoint remains authoritative. The shared hero surface will wrap both sections without horizontal overflow.

### Calendar

Restore a modest top inset on the Calendar command hero after the later parity override, scoped only to `.phx-calendar-v19 .phx-command-hero`. Do not alter the core, title, modules, routes, or data presentation.

## Scope and constraints

- UI and layout only.
- No backend, data, finance-state, routing, Vercel, environment, or service-worker changes.
- Preserve Finance and Calendar data flows and route contracts.
- Preserve Training, Nutrition, opening Home, and shared design tokens.
- Prefer localized CSS plus the minimum Finance JSX class adjustment needed to transfer surface ownership.

## Verification

- Add or update focused UI contract assertions for the shared Finance hero surface and Calendar top-safe rule.
- Run the focused contract tests, full PWA build, and full test suite.
- Visually check Finance and Calendar at 1280px or wider.
- Confirm the Finance surface encloses the Authorization Core.
- Confirm the Calendar opening system line is fully visible.
- Confirm responsive layouts do not gain horizontal overflow.

