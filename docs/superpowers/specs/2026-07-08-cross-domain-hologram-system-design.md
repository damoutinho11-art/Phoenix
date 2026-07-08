# Cross-Domain Hologram System Design

## Goal

Give the Finance, Nutrition, Training, and Calendar command centers a cohesive maximum-hologram PHOENIX interface while preserving each domain’s information architecture, data integrity, and identity. Home remains unchanged.

## First Delivery Slice

The first implementation covers the four main command centers only:

- Finance
- Nutrition
- Training
- Calendar

Detail and subsection screens are explicitly deferred until the four main command centers have been implemented and visually approved.

## Shared Visual System

Create a reusable command-center hologram layer rather than duplicating Training’s effects in each domain. The shared layer provides:

- fine scanlines and slow raster drift;
- a travelling holographic sweep;
- vignette and depth gradients;
- targeting grids and corner brackets;
- controlled glow and telemetry rails;
- shared motion timing; and
- a reduced-motion fallback that removes nonessential animation without removing information.

The system must remain decorative and pointer-transparent. It cannot obscure controls, alter navigation, or create synthetic data.

## Domain Instruments

Each command center uses the shared atmosphere with a domain-native hero instrument:

- **Finance:** cyan capital radar, allocation arcs, authorization state, deployable cash, buffer, and risk telemetry.
- **Nutrition:** green fuel reactor, macro orbit bands, intake pulses, calories, protein, and day-mode telemetry.
- **Training:** orange readiness core, targeting grid, mission timing, session, week, and readiness telemetry. Its existing three-step workflow remains unchanged.
- **Calendar:** violet temporal orbit, event sectors, schedule sweep, next event, load, and open-window telemetry.

Every displayed value comes from the dashboard’s existing model. Missing values use the domain’s current honest placeholder or empty-state language.

## Typography and Color

The hero title follows one rule in every domain:

- the domain name uses a high-readability warm white;
- `COMMAND CENTER` uses the domain accent color and restrained holographic glow.

Domain accents remain cyan for Finance, green for Nutrition, orange for Training, and violet for Calendar. Accent color carries energy through instruments, borders, rails, sweeps, system labels, and status details without tinting primary body copy.

## Component Boundary

Add a focused shared cockpit primitive for the decorative overlay and hero instrumentation shell. Domain dashboards supply accent color, system label, instrument content, telemetry content, and accessible labels. Domain-specific data interpretation stays in the existing dashboard model and component; the shared primitive owns presentation only.

No backend route, database, API payload, dashboard-model contract, or domain behavior changes in this slice.

## Responsive and Accessibility Rules

- Preserve current mobile-first layout and internal scrolling.
- Decorative layers use `aria-hidden="true"` and do not receive pointer events.
- Instrument text maintains readable contrast against the dark shell.
- Real headings and status text remain available to assistive technology.
- `prefers-reduced-motion: reduce` disables continuous rotation, sweeps, flicker, and raster drift.
- Existing focus visibility and control hit areas remain intact.

## Testing and Verification

- Add a shared presentation contract for overlay, pointer transparency, decorative accessibility, and reduced-motion behavior.
- Extend Finance, Nutrition, Training, and Calendar UI contracts to require the shared system and their domain-native instrument configuration.
- Protect Home from accidental adoption in this slice.
- Run the complete PWA test suite and production build.
- Visually inspect all four command centers at a 390-pixel mobile viewport and at the default desktop viewport.
- Review the completed main screens with the user before planning subsection propagation.
