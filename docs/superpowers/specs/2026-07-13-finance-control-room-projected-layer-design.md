# Finance Control Room Projected Layer Design

## Goal

Refine only the Finance Control Room so it feels like a projected PHOENIX finance layer, not a separate dashboard.

## Approved Direction

- Keep the main Finance projection unchanged.
- Keep Claude's four Control Room lanes: `BRIEF / PORTFOLIO / BUDGET / RESEARCH`.
- Keep existing lane content and data wiring intact.
- Change the Control Room shell to match the main Finance visual grammar: finance cyan, clipped glass, mono header, divider line, projected panel depth, and the main scene visible behind it.
- Add the approved pop animation: scrim fade, focus pop-in, scan sweep, divider draw, staggered lanes, and content materialize.

## Implementation Scope

Modify `pwa/src/components/holo/subs/FinanceControlRoom.jsx` only for production UI, plus the source contract test for regression coverage.

## Non-Goals

- No changes to the main Finance projection.
- No changes to the dock.
- No data model or backend changes.
- No changes to Nutrition, Training, or Calendar.
