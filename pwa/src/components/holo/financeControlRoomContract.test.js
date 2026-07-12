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
