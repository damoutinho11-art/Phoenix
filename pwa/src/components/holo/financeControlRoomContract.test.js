import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'

const src = name => readFile(new URL(name, import.meta.url), 'utf8')

test('finance projection opens the Finance Control Room as the primary action', async () => {
  const domains = await src('./holoDomains.js')
  const command = await src('./HoloCommand.jsx')
  const financeStart = domains.indexOf('finance: {')
  const financeEnd = domains.indexOf('nutrition: {', financeStart)
  const financeSource = domains.slice(financeStart, financeEnd)

  assert.match(financeSource, /heroActions:\s*\[\s*\{\s*label:\s*'CONTROL ROOM'/)
  assert.match(financeSource, /sub:\s*'finance-room'/)
  assert.doesNotMatch(financeSource, /label:\s*'HOLDINGS'/)
  assert.doesNotMatch(financeSource, /label:\s*'BRIEF'/)
  assert.match(command, /<FinanceControlRoom\b/)
  assert.match(command, /sub === 'finance-room'/)
  assert.match(command, /!isHome && isMobile/)
})

test('finance control room consolidates into four lanes with brief as the default', async () => {
  const room = await src('./subs/FinanceControlRoom.jsx')

  // four top-level lanes; the weekly-cycle and portfolio views live under sub-tabs
  assert.match(room, /const TABS = \['BRIEF', 'PORTFOLIO', 'BUDGET', 'RESEARCH'\]/)
  for (const sub of ['SIGNAL', 'APPROVE', 'DECISIONS', 'HOLDINGS', 'CURVE']) {
    assert.match(room, new RegExp(`'${sub}'`))
  }
  // the redundant standalone lanes are gone
  assert.doesNotMatch(room, /AuditPanel/)
  assert.doesNotMatch(room, /BudgetPanel/)

  assert.match(room, /useState\('BRIEF'\)/)
  assert.match(room, /SYS\.FINANCE \/\/ CONTROL ROOM/)
  assert.match(room, /RETURN TO PROJECTION/)
})

test('finance control room surfaces the budget ledger from the real endpoint', async () => {
  const room = await src('./subs/FinanceControlRoom.jsx')
  const budget = await src('./subs/BudgetContent.jsx')

  assert.match(room, /BudgetContent/)
  assert.match(budget, /getBudgetSummary/)
  assert.match(budget, /getBudgetMonths/)
  assert.match(budget, /SAVINGS RATE/)
})

test('budget lane can upload a statement: parse text/pdf, review categories, save', async () => {
  const budget = await src('./subs/BudgetContent.jsx')

  assert.match(budget, /parseBudgetTransactions/)
  assert.match(budget, /parseBudgetPdf/)
  assert.match(budget, /saveBudgetTransactions/)
  assert.match(budget, /ADD TRANSACTIONS/)
  assert.match(budget, /CategoryPicker/)
  // save refetches the ledger rather than leaving stale data on screen
  assert.match(budget, /afterSave/)
})

test('performance lane plots real snapshots only and never fabricates returns', async () => {
  const room = await src('./subs/FinanceControlRoom.jsx')
  const perf = await src('./subs/PerformanceContent.jsx')

  assert.match(room, /PerformanceContent/)
  assert.match(perf, /getFinancePerformanceHistory/)
  // change-over-time chart with a hover layer
  assert.match(perf, /polyline/)
  assert.match(perf, /onMouseMove/)
  // needs >= 2 points to draw a trend; single/zero states are handled
  assert.match(perf, /length < 2/)
  // honest safety framing — no simulated returns
  assert.match(perf, /NO SIMULATED RETURNS/)
})

test('briefs lane surfaces past briefs with defer/reject/delete actions', async () => {
  const room = await src('./subs/FinanceControlRoom.jsx')
  const briefs = await src('./subs/BriefHistoryContent.jsx')

  assert.match(room, /BriefHistoryContent/)
  assert.match(briefs, /getFinanceBriefHistory/)
  assert.match(briefs, /postBriefAction/)
  assert.match(briefs, /deleteBrief/)
})

test('research lane surfaces memos + validation records, read-only and never a trade', async () => {
  const room = await src('./subs/FinanceControlRoom.jsx')
  const research = await src('./subs/ResearchContent.jsx')

  assert.match(room, /ResearchContent/)
  assert.match(research, /getFinanceResearchMemos/)
  assert.match(research, /getFinanceResearchValidationRecords/)
  assert.match(research, /NO TRADES EXECUTED/)
})

test('budget lane can edit and save budget memory (savings target + category lanes)', async () => {
  const budget = await src('./subs/BudgetContent.jsx')

  assert.match(budget, /getBudgetMemory/)
  assert.match(budget, /saveBudgetMemory/)
  assert.match(budget, /MemoryStage/)
  assert.match(budget, /savings_target_pct/)
  assert.match(budget, /fixed_categories/)
  assert.match(budget, /merchant_rules/)
})

test('finance control room reuses existing finance instrument designs', async () => {
  const room = await src('./subs/FinanceControlRoom.jsx')
  const subs = await src('./subs/FinanceSubs.jsx')

  assert.match(room, /ApproveContent/)
  assert.match(room, /HoldingsContent/)
  assert.match(room, /BriefContent/)
  assert.match(subs, /export function HoldingsContent/)
  assert.match(subs, /export function ApproveContent/)
  assert.match(subs, /export function BriefContent/)
})

test('finance control room keeps manual-only safety and avoids automatic trading language', async () => {
  const room = await src('./subs/FinanceControlRoom.jsx')
  const subs = await src('./subs/FinanceSubs.jsx')
  const combined = `${room}`.toLowerCase()

  // slim header safety chip in the room; the full no-execute promise lives in
  // the Approve sub-screen, next to the point of action
  assert.match(room, /MANUAL ONLY/)
  assert.match(subs, /PHOENIX NEVER EXECUTES ORDERS/)
  for (const forbidden of ['auto trade', 'autotrade', 'automatic order', 'order executed for you']) {
    assert.equal(combined.includes(forbidden), false)
  }
})

test('finance control room drops the redundant context rail', async () => {
  const room = await src('./subs/FinanceControlRoom.jsx')

  assert.doesNotMatch(room, /ContextRail/)
  assert.doesNotMatch(room, /ROOM STATUS/)
  // the one kept status signal: live vs fixture data
  assert.match(room, /'LIVE' : 'FIXTURE'/)
})
