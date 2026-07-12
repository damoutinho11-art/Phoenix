# Finance Control Room Reuse Plan

**Goal:** Refine the Finance Control Room so the Finance projection has one clear entry point while the room reuses the existing premium Holdings orbit, Brief terminal, and Approval sequence designs.

**Design direction:** Keep the current PHOENIX holo language. The room should feel like a command deck layered over the projection, not a replacement design or a basic dashboard.

## Tasks

- [x] Update the contract test so Finance exposes only `CONTROL ROOM` on the main projection, the room defaults to `ACTION`, and tabs are `ACTION / PORTFOLIO / INTEL / HISTORY / CASH`.
- [x] Refactor `FinanceSubs.jsx` to export reusable content components for Holdings, Approval, and Brief while keeping the standalone sub-screens intact.
- [x] Rebuild `FinanceControlRoom.jsx` around those reused components, adding a refined lane rail and keeping the standalone history and cash panels.
- [x] Keep approval state and manual-only safety behavior unchanged.
- [x] Verify with the focused contract test, full PWA tests, production build, and browser inspection on desktop and mobile.
