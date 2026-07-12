# Finance Control Room Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a full-screen Finance Control Room inside the PHOENIX holo UI so finance can show approval, holdings, brief, audit, and budget workflows without changing the current projection design.

**Architecture:** Keep `HoloCommand` as the host for the new room and add a focused `FinanceControlRoom` component under `pwa/src/components/holo/subs/`. The main Finance projection remains sparse; its primary action opens the room, and the room reuses existing live finance/holdings data plus current approval state from `HoloCommand`.

**Tech Stack:** React 18, Vite, inline holo token styling, Node source-contract tests via `node --test`.

## Global Constraints

- Preserve the current main holo projection layout and bottom dock.
- Finance only; do not touch Nutrition, Training, or Calendar deep cockpits.
- PHOENIX remains manual-only; no real trade execution.
- Avoid backend work unless a required finance detail is not available anywhere.
- Approval, Holdings, Brief, Audit, and Budget must be present as internal tabs.
- Approval must be the default tab.
- Existing PWA tests and production build must pass.

---

### Task 1: Source Contract Tests

**Files:**
- Create: `pwa/src/components/holo/financeControlRoomContract.test.js`
- Modify: none
- Test: `pwa/src/components/holo/financeControlRoomContract.test.js`

**Interfaces:**
- Consumes: planned source files `HoloCommand.jsx`, `holoDomains.js`, `subs/FinanceControlRoom.jsx`.
- Produces: failing contract tests that require the visual route, tab labels, default approval tab, and manual-only safety language.

- [ ] **Step 1: Write the failing test**

```js
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'

const src = name => readFile(new URL(name, import.meta.url), 'utf8')

test('finance projection opens the Finance Control Room as the primary action', async () => {
  const domains = await src('./holoDomains.js')
  const command = await src('./HoloCommand.jsx')

  assert.match(domains, /label:\s*'CONTROL ROOM'/)
  assert.match(domains, /sub:\s*'finance-room'/)
  assert.match(command, /<FinanceControlRoom\b/)
  assert.match(command, /sub === 'finance-room'/)
})

test('finance control room exposes all room tabs with approval as the default', async () => {
  const room = await src('./subs/FinanceControlRoom.jsx')

  for (const label of ['APPROVAL', 'HOLDINGS', 'BRIEF', 'AUDIT', 'BUDGET']) {
    assert.match(room, new RegExp(`'${label}'`))
  }

  assert.match(room, /useState\('APPROVAL'\)/)
  assert.match(room, /SYS\.FINANCE \/\/ CONTROL ROOM/)
  assert.match(room, /RETURN TO PROJECTION/)
})

test('finance control room keeps manual-only safety and avoids automatic trading language', async () => {
  const room = await src('./subs/FinanceControlRoom.jsx')
  const combined = `${room}`.toLowerCase()

  assert.match(room, /PHOENIX NEVER EXECUTES ORDERS/)
  assert.match(room, /MANUAL ONLY/)
  for (const forbidden of ['auto trade', 'autotrade', 'automatic order', 'order executed for you']) {
    assert.equal(combined.includes(forbidden), false)
  }
})
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `cd pwa; npm test -- src/components/holo/financeControlRoomContract.test.js`

Expected: FAIL because `FinanceControlRoom.jsx` does not exist and `CONTROL ROOM` is not wired.

- [ ] **Step 3: Commit the red test**

```bash
git add pwa/src/components/holo/financeControlRoomContract.test.js
git commit -m "test: add finance control room contract"
```

### Task 2: Holo Route And Domain Wiring

**Files:**
- Modify: `pwa/src/components/holo/holoDomains.js`
- Modify: `pwa/src/components/holo/HoloCommand.jsx`
- Test: `pwa/src/components/holo/financeControlRoomContract.test.js`

**Interfaces:**
- Consumes: `FinanceControlRoom` default export with props `{ onClose, checks, stamped, onToggle, onConfirm, holdings, finance }`.
- Produces: `finance-room` sub route and a primary Finance action labelled `CONTROL ROOM`.

- [ ] **Step 1: Change the Finance hero action list**

In `holoDomains.js`, replace the Finance `heroActions` list with:

```js
heroActions: [
  { label: 'CONTROL ROOM', sub: 'finance-room', primary: true },
  { label: 'HOLDINGS', sub: 'holdings' },
  { label: 'BRIEF', sub: 'brief' },
],
```

- [ ] **Step 2: Import and route the room**

In `HoloCommand.jsx`, change:

```js
import { HoldingsSub, ApproveSub, BriefSub } from './subs/FinanceSubs'
```

to:

```js
import { HoldingsSub, ApproveSub, BriefSub } from './subs/FinanceSubs'
import FinanceControlRoom from './subs/FinanceControlRoom'
```

Then add this sub-screen route before the existing finance sub-screens:

```jsx
{sub === 'finance-room' && (
  <FinanceControlRoom
    {...subProps}
    checks={appChecks}
    stamped={appStamped}
    onToggle={i => { if (!appStamped) setAppChecks(c => c.map((v, j) => (j === i ? !v : v))) }}
    onConfirm={() => { if (appChecks.every(Boolean) && !appStamped) setAppStamped(true) }}
    holdings={mapHoldings(live.holdings, live.finance)}
    finance={live.finance}
  />
)}
```

- [ ] **Step 3: Run the test and keep the expected component-missing failure**

Run: `cd pwa; npm test -- src/components/holo/financeControlRoomContract.test.js`

Expected: FAIL only because `FinanceControlRoom.jsx` is still missing or incomplete.

### Task 3: Finance Control Room Visual Component

**Files:**
- Create: `pwa/src/components/holo/subs/FinanceControlRoom.jsx`
- Test: `pwa/src/components/holo/financeControlRoomContract.test.js`

**Interfaces:**
- Consumes:
  - `checks: boolean[]`
  - `stamped: boolean`
  - `onToggle(index: number): void`
  - `onConfirm(): void`
  - `holdings: { list: Array<object>, meta?: string, coreLabel?: string } | null`
  - `finance: object | null`
- Produces: a same-style full-screen control room with tab state local to the component.

- [ ] **Step 1: Create the component with tab shell**

Create `FinanceControlRoom.jsx` with:

```jsx
import { useMemo, useState } from 'react'
import { ACC, G, Y, R, W, BODY, INK, FM, FD, FB, a, mix, deep } from '../holoTokens'
import { APPROVE_CHECKS, BRIEF_TEXT, HOLDINGS } from '../holoDomains'

const TABS = ['APPROVAL', 'HOLDINGS', 'BRIEF', 'AUDIT', 'BUDGET']

export default function FinanceControlRoom({ onClose, checks, stamped, onToggle, onConfirm, holdings, finance }) {
  const [tab, setTab] = useState('APPROVAL')
  const sleeves = holdings?.list?.length ? holdings.list : HOLDINGS
  const activeSleeve = sleeves[0]
  const verified = stamped ? APPROVE_CHECKS.length : checks.filter(Boolean).length
  const armed = verified === APPROVE_CHECKS.length

  const contextRows = useMemo(() => [
    ['SOURCE', finance ? 'LIVE FINANCE' : 'FIXTURE FALLBACK', finance ? G : Y],
    ['WEEK', finance?.week_label || 'W28', W],
    ['MANUAL SAFETY', 'PHOENIX NEVER EXECUTES ORDERS', G],
  ], [finance])

  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 82, background: 'color-mix(in srgb, black 70%, transparent)', backdropFilter: 'blur(7px)', animation: 'holo-fadeIn .25s ease both' }}>
      <div style={{ position: 'absolute', inset: '18px 18px calc(70px + env(safe-area-inset-bottom))', border: `1px solid ${a(ACC, '55')}`, background: `linear-gradient(180deg, ${a(ACC, '12')}, ${deep(94)})`, boxShadow: `0 0 110px ${a(ACC, '55')}, inset 0 0 70px ${a(ACC, '08')}`, clipPath: 'polygon(0 0, calc(100% - 24px) 0, 100% 24px, 100% 100%, 0 100%)', overflow: 'hidden' }}>
        <header style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 14, padding: '14px 16px 11px', borderBottom: `1px solid ${a(ACC, '28')}` }}>
          <div>
            <div style={{ fontFamily: FM, fontSize: 10, letterSpacing: '.28em', color: ACC, textShadow: `0 0 10px ${a(ACC, '66')}` }}>SYS.FINANCE // CONTROL ROOM</div>
            <div style={{ marginTop: 5, fontFamily: FB, fontSize: 25, color: W, fontWeight: 400 }}>Manual capital cockpit</div>
          </div>
          <button onClick={onClose} style={{ minHeight: 36, padding: '0 14px', fontFamily: FM, fontSize: 8, letterSpacing: '.18em', color: ACC, background: deep(60), border: `1px solid ${a(ACC, '44')}`, cursor: 'pointer' }}>RETURN TO PROJECTION</button>
        </header>
        <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) minmax(220px, 280px)', gap: 14, height: 'calc(100% - 77px)', padding: 14 }}>
          <main style={{ minWidth: 0, display: 'flex', flexDirection: 'column', gap: 13 }}>
            <nav style={{ display: 'flex', gap: 7, flexWrap: 'wrap' }}>
              {TABS.map(label => (
                <button key={label} onClick={() => setTab(label)} style={{ minHeight: 34, padding: '0 13px', fontFamily: FM, fontSize: 8, letterSpacing: '.2em', color: tab === label ? INK : a(ACC, 'cc'), background: tab === label ? `linear-gradient(135deg, ${ACC}, ${a(ACC, 'bb')})` : deep(58), border: `1px solid ${tab === label ? ACC : a(ACC, '35')}`, cursor: 'pointer' }}>{label}</button>
              ))}
            </nav>
            {tab === 'APPROVAL' && <ApprovalPanel checks={checks} stamped={stamped} onToggle={onToggle} onConfirm={onConfirm} verified={verified} armed={armed} finance={finance} />}
            {tab === 'HOLDINGS' && <HoldingsPanel sleeves={sleeves} activeSleeve={activeSleeve} meta={holdings?.meta} />}
            {tab === 'BRIEF' && <BriefPanel finance={finance} />}
            {tab === 'AUDIT' && <AuditPanel finance={finance} />}
            {tab === 'BUDGET' && <BudgetPanel finance={finance} sleeves={sleeves} />}
          </main>
          <aside style={{ display: 'flex', flexDirection: 'column', gap: 10, minWidth: 0 }}>
            <ContextRail rows={contextRows} verified={verified} stamped={stamped} />
          </aside>
        </div>
      </div>
    </div>
  )
}
```

- [ ] **Step 2: Add panel helpers**

Add helper components in the same file: `ApprovalPanel`, `HoldingsPanel`, `BriefPanel`, `AuditPanel`, `BudgetPanel`, `ContextRail`, `RoomCard`, and `Field`.

Each helper must use the same holo tokens and include:
- Approval: checklist, `MARK WEEK APPROVED`, `PHOENIX NEVER EXECUTES ORDERS`, `MANUAL ONLY`.
- Holdings: sleeve list and selected sleeve detail.
- Brief: `BRIEF_TEXT` excerpt plus week status.
- Audit: source labels and pending/manual status.
- Budget: deployment and cash/runway numbers derived from `finance` and cash sleeve fallback.

- [ ] **Step 3: Run the contract test to verify it passes**

Run: `cd pwa; npm test -- src/components/holo/financeControlRoomContract.test.js`

Expected: PASS.

### Task 4: Full PWA Verification And Browser Inspection

**Files:**
- Modify only if verification finds a defect.
- Test: all PWA tests and production build.

**Interfaces:**
- Consumes: implemented Finance Control Room.
- Produces: verified local visualization in the running browser.

- [ ] **Step 1: Run all PWA tests**

Run: `cd pwa; npm test`

Expected: all tests pass.

- [ ] **Step 2: Run the production build**

Run: `cd pwa; npm run build`

Expected: Vite build exits 0.

- [ ] **Step 3: Start or reuse the local Vite server**

Run: `cd pwa; npm run dev -- --host 127.0.0.1`

Expected: Vite serves the PWA on an available localhost port.

- [ ] **Step 4: Inspect in the in-app browser**

Open the local URL. Navigate to Finance, click `CONTROL ROOM`, verify:
- the room opens as a same-style holo projection
- `APPROVAL` is selected first
- all five tabs are visible
- `RETURN TO PROJECTION` closes the room
- no visible text claims PHOENIX placed an order

### Task 5: Commit

**Files:**
- `docs/superpowers/plans/2026-07-12-finance-control-room.md`
- `pwa/src/components/holo/financeControlRoomContract.test.js`
- `pwa/src/components/holo/holoDomains.js`
- `pwa/src/components/holo/HoloCommand.jsx`
- `pwa/src/components/holo/subs/FinanceControlRoom.jsx`

**Interfaces:**
- Consumes: passing tests/build and browser inspection.
- Produces: one focused feature commit.

- [ ] **Step 1: Review the diff**

Run: `git diff --stat && git diff -- pwa/src/components/holo`

Expected: only finance control room files and the plan changed.

- [ ] **Step 2: Commit**

```bash
git add docs/superpowers/plans/2026-07-12-finance-control-room.md pwa/src/components/holo/financeControlRoomContract.test.js pwa/src/components/holo/holoDomains.js pwa/src/components/holo/HoloCommand.jsx pwa/src/components/holo/subs/FinanceControlRoom.jsx
git commit -m "Add holo finance control room"
```
