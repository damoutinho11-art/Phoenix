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
  assert.match(subs, /formatCashAuthorityBrief/)
  assert.match(subs, /recommendation\.cashflow_authority/)
})

test('main finance projection uses real history graph data and an allocation chart model', async () => {
  const live = await src('./holoLive.js')
  const data = await src('./useHoloData.js')
  const command = await src('./HoloCommand.jsx')
  const domains = await src('./holoDomains.js')
  const financeStart = domains.indexOf('finance: {')
  const financeEnd = domains.indexOf('nutrition: {', financeStart)
  const financeSource = domains.slice(financeStart, financeEnd)

  assert.match(data, /getFinancePerformanceHistory/)
  assert.match(data, /financePerformance:\s*null/)
  assert.match(data, /grab\('financePerformance', getFinancePerformanceHistory\)/)
  assert.match(command, /applyFinance\(d, live\.finance, live\.financePerformance\)/)

  assert.match(live, /type:\s*'allocationOrbit'/)
  assert.match(live, /allocationSlices/)
  assert.match(live, /dormantCount/)
  assert.match(live, /ACTIVE/)
  assert.match(live, /DORMANT/)
  assert.match(live, /type:\s*'valueGraph'/)
  assert.match(live, /RECORDED VALUE TREND/)
  assert.match(live, /SNAPSHOT SEED/)
  assert.match(live, /withLivePortfolioPoint/)
  assert.match(live, /source:\s*'live_portfolio_state'/)
  assert.doesNotMatch(live, /spark\(\[fin\.total_invested,\s*fin\.total_invested\]/)

  assert.match(financeSource, /type:\s*'allocationOrbit'/)
  assert.match(financeSource, /type:\s*'valueGraph'/)
})

test('production finance fails visibly instead of rendering fixture portfolio data', async () => {
  const client = await src('../../api/client.js')
  const data = await src('./useHoloData.js')
  const command = await src('./HoloCommand.jsx')
  const live = await src('./holoLive.js')

  assert.match(client, /import\.meta\.env\.DEV\s*\?\s*'http:\/\/localhost:8000'\s*:\s*''/)
  assert.match(client, /PHOENIX_API_UNCONFIGURED/)
  assert.doesNotMatch(client, /VITE_API_URL\s*\|\|\s*'http:\/\/localhost:8000'/)

  assert.match(data, /status:\s*\{/)
  assert.match(data, /finance:\s*sourceState\(/)
  assert.match(data, /error:\s*errorMessage/)
  assert.doesNotMatch(data, /\.catch\(\(\) => \{\}\)/)

  assert.match(live, /export function applyFinanceOffline/)
  assert.match(live, /FINANCE DATA OFFLINE/)
  assert.match(live, /RECOMMENDATIONS PAUSED/)
  assert.match(command, /applyFinanceOffline/)
  assert.match(command, /live\.status\.finance/)
  assert.doesNotMatch(command, /Portfolio €1,893/)
})

test('finance allocation sleeves use distinct material identity colors', async () => {
  const live = await src('./holoLive.js')

  assert.match(live, /SLEEVE_MATERIAL_COLORS/)
  assert.match(live, /global_core_etf:\s*\{[^}]*#1fb9ad[^}]*#7bd8d0[^}]*#43d8cc/s)
  assert.match(live, /discovery:\s*\{[^}]*#b84f74[^}]*#6f3a56/s)
  assert.match(live, /quality_etf:\s*\{[^}]*#8fdcff[^}]*#d8f4ff/s)
  assert.match(live, /btc:\s*\{[^}]*#d8a33e[^}]*#ffe08a/s)
  assert.match(live, /materialColorForSleeve/)
  assert.doesNotMatch(live, /colors\[i % colors\.length\]/)

  const wings = await src('./HoloWings.jsx')
  assert.match(wings, /borderRadius: '50%'/)
  assert.doesNotMatch(wings, /sheenColor/)
  assert.doesNotMatch(wings, /setTimeout\(\(\) => setDrawn/)
  assert.doesNotMatch(wings, /stroke-dasharray \.8s/)
  assert.doesNotMatch(wings, /drop-shadow\(0 0 \$\{big \? 7 : 5\}px/)
})

test('finance hero value reads as a premium instrument number', async () => {
  const core = await src('./HoloCore.jsx')
  const css = await src('./holo.css')

  assert.match(core, /isMoneyReadout/)
  assert.match(core, /const heroMain = String\(domain\.heroValue/)
  assert.match(core, /fontVariantNumeric:\s*'tabular-nums'/)
  assert.match(core, /letterSpacing:\s*isMoneyReadout \? '\.015em'/)
  assert.match(core, /fontSize:\s*isMoneyReadout \? 'clamp\(44px, 8\.2vmin, 72px\)'/)
  assert.match(core, /transform:\s*'translateY\(-2px\)'/)
  assert.match(core, /const heroReadoutOffset = isShort \? 34 : 42/)
  assert.match(core, /transform:\s*`translate\(-50%, \$\{heroReadoutOffset\}px\)`/)
  assert.match(core, /isHome \|\| isMoneyReadout \? \{ position: 'absolute'/)
  assert.match(core, /left:\s*isMoneyReadout \? 'calc\(100% \+ 4px\)' : 'calc\(100% \+ 10px\)'/)
  assert.match(core, /display:\s*'inline-flex', alignItems:\s*'baseline', gap:\s*isHome \? 0 : 10/)
  const readoutPositionLine = core.split('\n').find((line) => line.includes('heroReadoutOffset'))
  assert.ok(readoutPositionLine)
  assert.doesNotMatch(readoutPositionLine, /animation:/)
  assert.match(core, /<div style={{ animation: 'holo-readoutIn/)
  assert.doesNotMatch(core, /<div style={{ animation: 'holo-inX/)
  assert.match(css, /@keyframes holo-readoutIn/)
  assert.doesNotMatch(css.match(/@keyframes holo-readoutIn[^@]+/)?.[0] || '', /translateX/)
  assert.match(core, /textShadow:\s*isMoneyReadout/)
})

test('holo wing renderer draws upgraded finance allocation and performance charts', async () => {
  const wings = await src('./HoloWings.jsx')

  assert.match(wings, /function AllocationOrbitPanel/)
  assert.match(wings, /function ValueGraphPanel/)
  assert.match(wings, /function ValueSeedPanel/)
  assert.match(wings, /seedSize/)
  assert.match(wings, /panel\.type === 'allocationOrbit'/)
  assert.match(wings, /panel\.type === 'valueGraph' && panel\.isSeed/)
  assert.match(wings, /panel\.type === 'valueGraph'/)
  assert.match(wings, /activeSlices/)
  assert.match(wings, /dormantCount/)
  assert.match(wings, /orbitSize/)
  assert.match(wings, /radialGradient/)
  assert.match(wings, /strokeDasharray/)
  assert.match(wings, /polyline/)
  assert.match(wings, /panel\.isSeed/)
  assert.doesNotMatch(wings, /strokeDasharray=\{panel\.isSeed \?/)
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
  assert.match(budget, /reconciliationView/)
  assert.match(budget, /STATEMENT RECONCILED/)
  assert.match(budget, /REVIEW REQUIRED/)
  assert.match(budget, /disabled=\{saving \|\| saveBlocked\}/)
  // save refetches the ledger rather than leaving stale data on screen
  assert.match(budget, /afterSave/)
})

test('budget authority uses a one-time server receipt and refreshes verified capacity', async () => {
  const client = await src('../../api/client.js')
  const budget = await src('./subs/BudgetContent.jsx')
  const saveStart = client.indexOf('export async function saveBudgetTransactions')
  const saveEnd = client.indexOf('export async function getBudgetSummary', saveStart)
  const saveSource = client.slice(saveStart, saveEnd)

  assert.match(saveSource, /saveBudgetTransactions\(transactions, statementReceiptId = null\)/)
  assert.match(saveSource, /statement_receipt_id:\s*statementReceiptId/)
  assert.doesNotMatch(saveSource, /filename|parser|quality/)
  assert.match(client, /export async function getBudgetInvestmentCapacity\(month, options = \{\}\)/)
  assert.match(client, /\/budget\/investment-capacity\?month=/)

  assert.match(budget, /getBudgetInvestmentCapacity/)
  assert.match(budget, /statementReceiptId/)
  assert.match(budget, /saveBudgetTransactions\(transactions, statementReceiptId\)/)
  assert.match(budget, /setStatementReceiptId\(null\)/)
  assert.match(budget, /Re-upload and parse the PDF again before saving\./)
  assert.match(budget, /CASH AUTHORITY/)
  assert.match(budget, /authority\.data_ready \? 'VERIFIED' : 'BLOCKED'/)
  assert.match(budget, /authority\.blockers/)
  assert.match(budget, /STATEMENT SAVED · AUTHORITY REFRESHED/)
})

test('performance lane plots real snapshots only and never fabricates returns', async () => {
  const room = await src('./subs/FinanceControlRoom.jsx')
  const perf = await src('./subs/PerformanceContent.jsx')

  assert.match(room, /PerformanceContent/)
  assert.match(perf, /getFinancePerformanceHistory/)
  assert.match(perf, /getFinanceSummary/)
  assert.match(perf, /withLiveSnapshot/)
  assert.match(perf, /LIVE PORTFOLIO STATE/)
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

test('brief lane has a ledger for recording placed buys and applying them to state', async () => {
  const room = await src('./subs/FinanceControlRoom.jsx')
  const ledger = await src('./subs/LedgerContent.jsx')

  // ledger is a sub-tab of the weekly-cycle lane, after approve
  assert.match(room, /'SIGNAL', 'APPROVE', 'LEDGER', 'DECISIONS'/)
  assert.match(room, /LedgerContent/)
  // record → apply-preview → apply, plus void
  assert.match(ledger, /postManualFinanceTransaction/)
  assert.match(ledger, /getFinanceTransactionApplyPreview/)
  assert.match(ledger, /postFinanceTransactionApply/)
  assert.match(ledger, /postFinanceTransactionVoid/)
  // manual-only framing — you place the order, then log it
  assert.match(ledger, /YOU PLACE THE ORDER/)
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

test('budget memory exposes validated authority policy inputs without blank coercion', async () => {
  const budget = await src('./subs/BudgetContent.jsx')
  const model = await import('./subs/budgetAuthorityModel.js')

  assert.match(budget, /authorityDraft/)
  assert.match(budget, /validateAuthorityPolicyDraft/)
  assert.match(budget, /preparePolicyEditor/)
  assert.match(budget, /billDrafts/)
  assert.doesNotMatch(budget, /updateAuthorityNumber/)
  for (const field of [
    'emergency_fund_floor_eur',
    'emergency_fund_balance_eur',
    'checking_buffer_eur',
    'food_budget_eur',
    'essential_spending_ceiling_eur',
    'salary_day_cutoff',
  ]) {
    assert.equal(model.AUTHORITY_NUMERIC_FIELDS.some(([key]) => key === field), true)
  }
})

test('budget cash policy uses structured bills and an explicit legacy upgrade command', async () => {
  const budget = await src('./subs/BudgetContent.jsx')

  assert.match(budget, /CASH POLICY/)
  assert.match(budget, /migration_required/)
  assert.match(budget, /SAVE & UPGRADE POLICY/)
  assert.match(budget, /SAVE CASH POLICY/)
  assert.match(budget, /type="checkbox"/)
  assert.match(budget, /BILL NAME/)
  assert.match(budget, /RESERVE EUR/)
  assert.match(budget, /MATCHING TERMS/)
  assert.match(budget, /ADD BILL/)
  assert.match(budget, /REMOVE BILL/)
  assert.match(budget, /\.\.\.utility, enabled: false, name: '', amount_eur: '0\.00', contains: ''/)
  assert.doesNotMatch(budget, /RECURRING OBLIGATIONS JSON/)
  assert.doesNotMatch(budget, /recurringDraft/)
})

test('budget PDF review locks bank facts and activates authority only from reconciliation view', async () => {
  const budget = await src('./subs/BudgetContent.jsx')
  const uploadPdf = budget.indexOf("inputTab('pdf'")
  const pasteText = budget.indexOf("inputTab('text'")

  assert.ok(uploadPdf >= 0 && uploadPdf < pasteText, 'PDF must be the first statement input mode')
  assert.match(budget, /LEDGER ONLY/)
  assert.match(budget, /BANK FACTS LOCKED/)
  for (const label of [
    'STATEMENT ROWS',
    'PARSED ROWS',
    'OPENING BALANCE',
    'CLOSING BALANCE',
    'NET MOVEMENT',
    'BALANCE DIFFERENCE',
    'STATEMENT END',
  ]) {
    assert.match(budget, new RegExp(label))
  }
  assert.match(budget, /unmatchedRows/)
  assert.match(budget, /UNMATCHED STATEMENT ROWS/)
  assert.match(budget, /RE-PARSE PDF/)
  assert.match(budget, /SAVE & ACTIVATE AUTHORITY/)
  assert.match(budget, /SAVE LEDGER TRANSACTIONS/)
  assert.match(budget, /canActivate/)
  assert.doesNotMatch(budget, /OVERRIDE RECONCILIATION/)
})

test('budget ledger, upload, and Cash Policy roots use the Budget accent scope', async () => {
  const budget = await src('./subs/BudgetContent.jsx')
  const budgetScopes = budget.match(/className="phx-scope-budget"/g) || []

  assert.equal(budgetScopes.length, 3)
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

test('approve lane uses the live manual buy checklist instead of W28 fixture checks', async () => {
  const subs = await src('./subs/FinanceSubs.jsx')

  assert.match(subs, /getFinanceManualBuyChecklist/)
  assert.match(subs, /buildApproveChecks/)
  assert.doesNotMatch(subs, /APPROVE_CHECKS\.map/)
  assert.doesNotMatch(subs, /YOU PLACE THE €85\.00 VWCE BUY MANUALLY ON LIGHTYEAR/)
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
