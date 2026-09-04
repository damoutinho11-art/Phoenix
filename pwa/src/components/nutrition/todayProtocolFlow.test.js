import assert from 'node:assert/strict'
import test from 'node:test'

import {
  commandErrorMessage,
  loadProtocolSnapshot,
  requiresMealConfirmation,
  shouldStartCommand,
} from './todayProtocolFlow.js'

test('protocol refresh survives unavailable review telemetry', async () => {
  const result = await loadProtocolSnapshot(
    async () => ({ protocol_id: '12345678901234567890', meals: [{ meal_id: 'm1' }] }),
    async () => { throw new Error('review offline') },
  )

  assert.equal(result.protocol.meals[0].meal_id, 'm1')
  assert.equal(result.review, null)
  assert.equal(result.reviewUnavailable, true)
})

test('protocol failure remains a hard load failure', async () => {
  await assert.rejects(
    loadProtocolSnapshot(async () => { throw new Error('protocol offline') }, async () => ({ status: 'ready' })),
    /protocol offline/,
  )
})

test('only logging requires confirmation and duplicate commands are rejected', () => {
  assert.equal(requiresMealConfirmation('log'), true)
  assert.equal(requiresMealConfirmation('replace'), false)
  assert.equal(requiresMealConfirmation('adjust_portion'), false)
  assert.equal(requiresMealConfirmation('skip'), false)
  assert.equal(shouldStartCommand(false), true)
  assert.equal(shouldStartCommand(true), false)
})

test('409 errors request refresh while retryable errors retain entered portions', () => {
  const portions = { 'm1:food': '84.5' }

  assert.equal(commandErrorMessage({ status: 409 }), 'Protocol changed. Refresh before continuing.')
  assert.equal(commandErrorMessage(new Error('offline')), 'Protocol command unavailable. Your entries are still available to retry.')
  assert.deepEqual(portions, { 'm1:food': '84.5' })
})
