# Finance Weekly Approval Closure Design

**Status:** Approved
**Date:** 2026-07-01

## Goal

Once the current ISO-week finance brief is approved, PHOENIX must stop producing another recommendation or manual-buy checklist until the next ISO week.

## Contract

- An applied ledger transaction remains the only source of `week_done=true` and executed/deployed language.
- An approved current-week brief produces `week_closed=true`, `week_done=false`, `recommendations=[]`, `requires_approval=false`, and `portfolio_mode="week_approved"`.
- The response says the recommendation window is closed; it does not claim PHOENIX executed a trade.
- `/finance/manual-buy-checklist` returns `checklist_status="WEEK_CLOSED"` and no checklist items for an approved week.
- Pending, deferred, and rejected briefs retain existing recommendation behavior.
- The dashboard removes the Safety Lock panel and renders no manual action cards when the checklist is closed.
- Ledger, apply, portfolio mutation, allocation, ETF selection, evidence, broker, order, and execution semantics remain unchanged.

## Current Data Reconciliation

Finance brief `id=2`, week `W27 2026`, was created on 2026-06-29 and is the user-confirmed approved brief. Its status and user action should be stored as approved with a June 29 approval timestamp. Mutable SQLite data is not committed.

## Verification

- Route test: approved current-week brief closes the recommendation response without execution claims.
- Checklist test: approved current-week brief returns `WEEK_CLOSED` with zero items.
- Regression: pending current-week brief still returns normal recommendations.
- Frontend source/contract test: Finance dashboard contains no Safety Lock panel.
- Full pytest, frontend tests/build, finance acceptance gate, and smoke gate remain green.
