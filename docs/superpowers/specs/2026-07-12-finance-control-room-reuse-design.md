# Finance Control Room Reuse Design

## Goal

Revise the Finance Control Room so it stops duplicating the main Finance projection and preserves the existing high-quality Holdings and Brief designs.

The Finance projection should stay beautiful and minimal. It should expose one command: `CONTROL ROOM`.

The Control Room should become the finance work hub, but its portfolio and intelligence sections must reuse the existing Holdings orbital map and Brief terminal/transmission designs instead of the simplified replacement panels.

## Scope

In scope:

- Remove `HOLDINGS` and `BRIEF` from the main Finance projection action row.
- Keep `CONTROL ROOM` as the only Finance projection command.
- Rename Control Room tabs to purpose-based labels:
  - `ACTION`
  - `PORTFOLIO`
  - `INTEL`
  - `HISTORY`
  - `CASH`
- Default Control Room tab remains `ACTION`.
- `PORTFOLIO` reuses the existing Holdings orbital map design.
- `INTEL` reuses the existing Brief terminal/transmission design.
- Existing standalone `holdings` and `brief` sub-screens should keep working unless removing them is explicitly requested.

Out of scope:

- Backend finance changes.
- Changing the visual language of the existing Holdings or Brief designs.
- Replacing the Finance projection itself.
- Adding new finance calculations.

## User Experience

Main Finance projection:

- Shows portfolio value, live summary panels, drift, and the brief line as it does now.
- Shows only one command button: `CONTROL ROOM`.

Control Room:

- Opens as the same full-screen holo overlay.
- Uses purpose tabs, not duplicate doorway names.
- `ACTION` contains the weekly approval workflow.
- `PORTFOLIO` shows the same orbital Holdings map design the user already likes.
- `INTEL` shows the same Brief terminal/transmission design the user already likes.
- `HISTORY` keeps the audit stream.
- `CASH` keeps budget/runway.

## Component Plan

Refactor `pwa/src/components/holo/subs/FinanceSubs.jsx` to expose reusable inner content components while keeping the existing modal wrappers:

- `HoldingsContent`
- `ApproveContent`
- `BriefContent`

Existing components remain:

- `HoldingsSub` wraps `HoldingsContent` in `SubShell`.
- `ApproveSub` wraps `ApproveContent` in `SubShell`.
- `BriefSub` wraps `BriefContent` in `SubShell`.

Update `FinanceControlRoom.jsx`:

- Use `ACTION` state by default.
- Render `ApproveContent` for `ACTION`.
- Render `HoldingsContent` for `PORTFOLIO`.
- Render `BriefContent` for `INTEL`.
- Keep existing `AuditPanel` for `HISTORY`.
- Keep existing `BudgetPanel` for `CASH`.

Update `holoDomains.js`:

- Finance `heroActions` becomes exactly one action: `CONTROL ROOM`.

## Testing

Update the finance control room contract test to require:

- Main Finance projection has `CONTROL ROOM`.
- Main Finance projection no longer exposes `HOLDINGS` or `BRIEF` as hero actions.
- Control Room tabs are `ACTION`, `PORTFOLIO`, `INTEL`, `HISTORY`, `CASH`.
- `ACTION` is default.
- The Control Room imports/reuses the existing finance content components.
- Manual-only safety language remains present.

Run:

- `cd pwa; npm test`
- `cd pwa; npm run build`

Browser verification:

- Desktop: Finance projection shows only `CONTROL ROOM`.
- Desktop: Control Room opens and shows `ACTION` first.
- Desktop: `PORTFOLIO` shows the orbital Holdings map design.
- Desktop: `INTEL` shows the Brief terminal/transmission design.
- Mobile: Finance projection shows only `CONTROL ROOM` and can open the room.
- No horizontal overflow.

## Acceptance Criteria

- Main Finance projection has no duplicate Holdings/Brief commands.
- Existing Holdings design is preserved in the Control Room.
- Existing Brief design is preserved in the Control Room.
- Control Room tab names describe jobs, not old sub-screen names.
- Tests pass.
- Production build passes.
