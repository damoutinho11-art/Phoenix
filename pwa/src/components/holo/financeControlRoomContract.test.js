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

test('finance control room uses the projected main-finance shell and pop animation', async () => {
  const room = await src('./subs/FinanceControlRoom.jsx')

  assert.match(room, /FINANCE_ROOM_MOTION_CSS/)
  for (const name of [
    'holo-financeRoomScrim',
    'holo-financeRoomPop',
    'holo-financeRoomScan',
    'holo-financeRoomDivider',
    'holo-financeLaneIn',
    'holo-financeInstrumentIn',
  ]) {
    assert.match(room, new RegExp(name))
  }

  assert.match(room, /PROJECTED FINANCE LAYER/)
  assert.match(room, /translate\(-50%,-50%\)/)
  assert.match(room, /maxHeight:\s*'calc\(100vh - 170px\)'/)
  assert.match(room, /holo-finance-room-scrim/)
  assert.match(room, /holo-finance-room-shell/)
  assert.doesNotMatch(room, /inset:\s*'16px 16px calc\(66px/)
})

test('finance control room chrome stays finance-blue instead of mixed domain status colors', async () => {
  const room = await src('./subs/FinanceControlRoom.jsx')

  assert.match(room, /BRIEF:\s*\['WEEKLY CYCLE', 'Signal · approve · log', ACC\]/)
  assert.match(room, /PORTFOLIO:\s*\['PORTFOLIO', 'Holdings · value curve', ACC\]/)
  assert.match(room, /BUDGET:\s*\['MONTHLY LEDGER', 'Income vs spending', ACC\]/)
  assert.match(room, /RESEARCH:\s*\['MEMO LIBRARY', 'Analysis · no trades', ACC\]/)
  assert.doesNotMatch(room, /background:\s*finance \? G : Y/)
  assert.doesNotMatch(room, /color=\{G\}/)
  assert.doesNotMatch(room, /color=\{Y\}/)
  assert.doesNotMatch(room, /color:\s*G/)
})

test('finance signal brief reads the real finance brief endpoint, not fixture copy', async () => {
  const subs = await src('./subs/FinanceSubs.jsx')

  assert.match(subs, /getFinanceBrief/)
  assert.match(subs, /getFinanceRecommendation/)
  assert.match(subs, /formatRecommendationBrief/)
  assert.doesNotMatch(subs, /BRIEF_TEXT/)
  assert.match(subs, /LOADING REAL BRIEF/)
  assert.match(subs, /UNABLE TO LOAD FINANCE BRIEF/)
  assert.match(subs, /AI brief unavailable/)
  assert.match(subs, /briefText\.slice\(0, n\)/)
})

test('finance room uses one readable text system across every finance surface', async () => {
  const readability = await src('./subs/financeReadability.js')
  const financeFiles = [
    './subs/FinanceControlRoom.jsx',
    './subs/FinanceSubs.jsx',
    './subs/BudgetContent.jsx',
    './subs/PerformanceContent.jsx',
    './subs/BriefHistoryContent.jsx',
    './subs/ResearchContent.jsx',
    './subs/LedgerContent.jsx',
  ]

  assert.match(readability, /FINANCE_TEXT_SYSTEM/)
  assert.match(readability, /financeMicro/)
  assert.match(readability, /financeBody/)
  assert.match(readability, /financeMonoBody/)
  assert.match(readability, /fontSize:\s*9/)
  assert.match(readability, /fontSize:\s*14/)

  for (const file of financeFiles) {
    const source = await src(file)
    assert.match(source, /finance(Micro|Label|Body|MonoBody|Value)|FINANCE_TEXT_SYSTEM/, `${file} should use the shared finance text system`)
    assert.doesNotMatch(source, /fontSize:\s*['"]?(?:6(?:\.5)?|7(?:\.5)?)(?:px)?['"]?/, `${file} should not render sub-8px finance text`)
    assert.doesNotMatch(source, /letterSpacing:\s*'\.3em'/, `${file} should avoid hard-to-read extreme tracking`)
  }

  const subs = await src('./subs/FinanceSubs.jsx')
  assert.match(subs, /fontSize:\s*'14\.5px'/)
  assert.match(subs, /lineHeight:\s*1\.78/)
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
