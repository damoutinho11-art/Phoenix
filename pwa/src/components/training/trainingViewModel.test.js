import test from 'node:test'
import assert from 'node:assert/strict'

import {
  canStartHighNeural,
  readinessLabel,
  readinessTone,
  routeFallback,
} from './trainingViewModel.js'

test('unchecked high-neural work remains gated', () => {
  assert.equal(canStartHighNeural({ readiness_required: true, readiness_status: 'unchecked' }), false)
  assert.equal(canStartHighNeural({ readiness_required: false, readiness_status: 'unchecked' }), true)
})

test('recovery-only route cannot start high-neural work', () => {
  assert.equal(canStartHighNeural({ readiness_required: true, readiness_status: 'recovery_only' }), false)
})

test('backend high-neural denial always wins even after a completed scan', () => {
  assert.equal(canStartHighNeural({
    readiness_required: false,
    readiness_status: 'regress',
    high_neural_allowed: false,
  }), false)
})

test('readiness labels and tones remain honest', () => {
  assert.equal(readinessLabel('unchecked'), 'SCAN REQUIRED')
  assert.equal(readinessLabel('recovery_only'), 'RECOVERY ONLY')
  assert.equal(readinessTone('clear'), 'ready')
  assert.equal(readinessTone('caution'), 'caution')
  assert.equal(readinessTone('regress'), 'blocked')
})

test('missing route uses a conservative fallback without invented exercises', () => {
  const fallback = routeFallback(null)
  assert.equal(fallback.readiness_status, 'unchecked')
  assert.equal(fallback.high_neural_allowed, false)
  assert.deepEqual(fallback.capacity_blocks, [])
  assert.deepEqual(fallback.substitutions, [])
})
