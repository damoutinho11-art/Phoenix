import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'

test('finance dashboard omits the redundant Safety Lock panel', async () => {
  const source = await readFile(new URL('./FinanceDashboard.jsx', import.meta.url), 'utf8')

  assert.doesNotMatch(source, /function\s+SafetyLock\b/)
  assert.doesNotMatch(source, /<SafetyLock\b/)
})
