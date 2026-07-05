import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'

test('finance dashboard omits the redundant Safety Lock panel', async () => {
  const source = await readFile(new URL('./FinanceDashboard.jsx', import.meta.url), 'utf8')

  assert.doesNotMatch(source, /function\s+SafetyLock\b/)
  assert.doesNotMatch(source, /<SafetyLock\b/)
})

test('finance hero shell encloses the summary and authorization core', async () => {
  const source = await readFile(new URL('./FinanceDashboard.jsx', import.meta.url), 'utf8')
  const css = await readFile(new URL('../cockpit/cockpit.css', import.meta.url), 'utf8')

  const gridStart = source.indexOf('className="finance-hero-grid"')
  const headerStart = source.indexOf('<Header', gridStart)
  const authorizationStart = source.indexOf('className="finance-authorization-wrap"', headerStart)

  assert.ok(gridStart >= 0)
  assert.ok(headerStart > gridStart)
  assert.ok(authorizationStart > headerStart)
  assert.match(source, /finance-hero-panel finance-hero-content/)
  assert.match(css, /FINANCE_HERO_UNIFIED_SHELL/)
  assert.match(css, /\.finance-hero-grid\s*\{[\s\S]*?background:/)
  assert.match(css, /\.finance-hero-content\s*\{[\s\S]*?background:\s*transparent\s*!important;/)
})
