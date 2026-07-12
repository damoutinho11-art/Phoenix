# Finance Control Room Design

## Goal

Create the first deep cockpit for the new PHOENIX holo design: a Finance Control Room that keeps the current cinematic projection layer intact while giving finance enough room for real workflows.

The current Finance projection remains the glance layer: portfolio value, weekly recommendation, drift alerts, and the next manual action. The new Control Room is the work layer: approval, holdings, brief, audit, and budget controls in the same holo visual language.

## Scope

This spec covers Finance only.

In scope:

- Add one Finance Control Room entry point from the Finance holo projection.
- Build a full-screen holo-styled Finance Control Room.
- Default the room to the Approval tab.
- Include internal tabs for Approval, Holdings, Brief, Audit, and Budget.
- Reuse existing finance data endpoints and existing finance sub-screen concepts where practical.
- Preserve the current main holo projection layout and bottom dock.

Out of scope:

- Nutrition, Training, and Calendar deep cockpits.
- Real trade execution. PHOENIX remains manual-only.
- New backend finance models unless a missing field blocks a visible requirement.
- Replacing the older finance dashboard routes outside the holo flow.

## User Experience

The Finance projection stays sparse and beautiful. Its primary action becomes the entrance to a deeper space:

- `OPEN CONTROL ROOM` or equivalent primary command.
- Secondary quick actions may remain visible only if they do not crowd the projection.

Entering the Control Room should feel like zooming inward, not navigating to a different product. The screen uses:

- the same dark starfield / holo scene language
- the same `PHOENIX // OS v2.5` system tone
- the same cyan finance accent
- thin neon borders, projection cards, and orbital visuals
- compact terminal labels instead of conventional form-heavy UI
- the bottom dock remaining available or a clear `RETURN TO PROJECTION` escape

## Control Room Layout

The Control Room is a full-screen overlay or sub-screen inside `HoloCommand`, not a legacy finance route.

Recommended structure:

- Top system bar: `SYS.FINANCE // CONTROL ROOM`
- Left or top internal nav: `APPROVAL`, `HOLDINGS`, `BRIEF`, `AUDIT`, `BUDGET`
- Main projection area: active tab content
- Right or lower context rail: source status, manual-only safety, last refresh, pending action summary

The default active tab is `APPROVAL`.

## Tabs

### Approval

Purpose: complete this week's manual buy workflow with high trust and clear auditability.

Content:

- recommended assets, broker, ticker, amount, and lane
- manual-only warning
- pre-flight checklist
- public verification / source confidence where available
- completion state such as `WEEK APPROVED` or `RECORDED`

Behavior:

- approving marks local UI state as approved, matching the existing holo approval behavior
- no order is executed
- any future write must show pending/error states honestly

### Holdings

Purpose: inspect current allocation, drift, and target bands.

Content:

- orbital sleeve map from current holdings
- selected sleeve detail
- current weight, target weight or band, drift direction
- directive: hold/feed/trim

Behavior:

- selecting sleeves changes detail panel
- no portfolio mutation from this tab in the first pass

### Brief

Purpose: show weekly rationale and next operating notes.

Content:

- finance brief text
- key recommendation rationale
- watch items and discipline notes
- replay/transmission treatment may remain

Behavior:

- read-only in first pass
- deeper audit navigation is deferred to a future slice

### Audit

Purpose: make finance trustworthy by showing what has happened and what is pending.

Content:

- manual transaction ledger
- pending approval/apply/void states where backend exposes them
- recent brief/action history
- explicit labels for manual vs system-generated actions

Behavior:

- first pass can be read-only if apply/void controls are too large for this slice
- if controls are included, they must use existing endpoints and show pending/error states

### Budget

Purpose: connect finance recommendations to cash/deployment runway.

Content:

- available cash / weekly deployment amount
- budget month or runway if available
- recommended deployment vs remaining manual action

Behavior:

- read-only first pass
- navigation to the existing Budget screen is deferred to a future slice

## Data Flow

Use existing holo data as the room's primary input:

- `useHoloData()`
- `applyFinance()`
- `mapHoldings()`

Use existing finance API helpers where a tab needs more detail:

- summary and recommendation
- manual buy checklist
- holdings and PnL
- ledger and brief history
- budget/portfolio state if already available through the client

The first implementation should avoid new backend work unless a required finance detail is not available anywhere.

## Component Plan

Add or extend components under `pwa/src/components/holo/`:

- `FinanceControlRoom` as the full-screen sub-screen.
- Small tab components or render functions for Approval, Holdings, Brief, Audit, and Budget.
- Reuse existing `HoldingsSub`, `ApproveSub`, and `BriefSub` visuals where they fit, but unify them under one room shell instead of separate isolated modals.

`HoloCommand` should open the room using a finance sub key such as `finance-room`.

The finance domain action list should prefer:

- primary: `CONTROL ROOM`
- optional secondary: `HOLDINGS`, `BRIEF`

## Error Handling

Every asynchronous room data source should have visible states:

- loading: `SYNCING...`
- partial failure: `SOURCE DEGRADED`
- write failure if any write is added: `TRANSMISSION FAILED - TAP TO RETRY`

The room must never imply an order was executed. Manual-only language remains visible in Approval and the context rail.

## Testing

Frontend tests should use the repo's current source-contract style plus any available pure-model tests.

Required coverage:

- Finance projection exposes a Control Room action.
- `HoloCommand` routes `finance-room` to the Finance Control Room.
- Control Room includes the five tab labels.
- Approval tab is the default.
- Manual-only language is present.
- No prohibited trade-execution language or automatic order language is introduced.

If small pure helpers are added for tab state or finance room modeling, add direct unit tests for them.

## Acceptance Criteria

- Finance projection remains visually sparse.
- User can enter a full-screen Finance Control Room from Finance.
- The room visually matches the holo OS design.
- Approval, Holdings, Brief, Audit, and Budget are present as internal tabs.
- Approval is the default tab.
- Manual-only safety is explicit.
- Existing finance data is reused rather than duplicated as static fixture data.
- Existing PWA test suite passes.
- Production build passes with no new build errors.
