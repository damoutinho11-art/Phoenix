# Plaan Personal Feed Implementation Plan

**Goal:** Connect the verified personal subscription without changing Home.
**Architecture:** Pure iCalendar parser; bounded GET/persistent cache service;
shared snapshot resolver; existing background tasks and Calendar source UI.
**Tech Stack:** Python, icalendar, recurring-ical-events, SQLite, React.

## Constraints
Apply the approved personal-feed design. Never track the feed address or touch
the user's finance state. Never infer free time from unavailable evidence.

## Execution Ledger
- [ ] Parser: test UTC/Tallinn/DST, recurrence, revisions/cancellation, folded text,
  empty/invalid calendars and all-day/overnight events; implement pure
  parse_personal_calendar(payload, now=...) in calendar/plaan_ical.py.
- [ ] Cache: test restricted URL and bounded no-redirect GET, persistence, source
  identity, hourly refresh, single flight, stale/degraded state and redaction;
  implement data/plaan_feed.py with read_status(), resolve(), refresh().
- [ ] Integration: opt-in personal source takes precedence; add startup/hourly
  refresh; tests prove no fixture fallback and consumers reject unhealthy data.
- [ ] UI: preserve design, display feed timestamps/cadence and truthful state.
- [ ] Verification: regressions, live six-event comparison, frontend build,
  independent review, then authenticated deployment if tooling is available.

Tests precede production changes for each slice. Do not mark deployment complete
until the production backend and frontend are observed running the new code.
