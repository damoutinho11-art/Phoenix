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

test('finance control room exposes refined lanes with action as the default', async () => {
  const room = await src('./subs/FinanceControlRoom.jsx')

  for (const label of ['ACTION', 'PORTFOLIO', 'INTEL', 'BUDGET', 'HISTORY', 'CASH']) {
    assert.match(room, new RegExp(`'${label}'`))
  }

  assert.match(room, /useState\('ACTION'\)/)
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
  const combined = `${room}`.toLowerCase()

  assert.match(room, /PHOENIX NEVER EXECUTES ORDERS/)
  assert.match(room, /MANUAL ONLY/)
  for (const forbidden of ['auto trade', 'autotrade', 'automatic order', 'order executed for you']) {
    assert.equal(combined.includes(forbidden), false)
  }
})
