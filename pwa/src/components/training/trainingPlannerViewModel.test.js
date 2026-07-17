import test from 'node:test'
import assert from 'node:assert/strict'

import {
  buildPlanDiff,
  normalizeTrainingPlan,
  planTone,
} from './trainingPlannerViewModel.js'

const trainingClient = await import('../../api/client.js')

const beforeFixture = {
  days: [
    { date: '2026-07-20', session_type: 'high_intensity', estimated_minutes: 75 },
    { date: '2026-07-21', session_type: 'general', estimated_minutes: 60 },
    { date: '2026-07-22', session_type: 'recovery', estimated_minutes: 30 },
  ],
}

const afterFixture = {
  days: [
    { date: '2026-07-20', session_type: 'general', estimated_minutes: 60 },
    { date: '2026-07-21', session_type: 'rest', estimated_minutes: 0 },
    { date: '2026-07-22', session_type: 'recovery', estimated_minutes: 20 },
  ],
}

test('normalizes days in chronological order', () => {
  const plan = normalizeTrainingPlan({ plan_id: 'p1', status: 'active', days: [
    { date: '2026-07-21', session_type: 'general' },
    { date: '2026-07-20', session_type: 'high_intensity' },
  ] })

  assert.deepEqual(plan.days.map(day => day.date), ['2026-07-20', '2026-07-21'])
})

test('hard failed validation uses blocked tone and disables apply', () => {
  const plan = normalizeTrainingPlan({ status: 'proposed', validations: [
    { rule: 'pain_block', passed: false, severity: 'hard', detail: 'Sharp knee pain' },
  ] })

  assert.equal(planTone(plan), 'blocked')
  assert.equal(plan.canApply, false)
})

test('diff identifies moved and reduced days', () => {
  const diff = buildPlanDiff(beforeFixture, afterFixture)

  assert.deepEqual(diff.changedDays.map(day => day.date), ['2026-07-20', '2026-07-21', '2026-07-22'])
})

test('partial responses retain backend fields without inventing days or apply eligibility', () => {
  const plan = normalizeTrainingPlan({ plan_id: 'p1', status: 'active', days: null, validations: null })

  assert.equal(plan.plan_id, 'p1')
  assert.equal(plan.status, 'active')
  assert.deepEqual(plan.days, [])
  assert.deepEqual(plan.validations, [])
  assert.deepEqual(plan.hardFailures, [])
  assert.equal(plan.canApply, false)
})

test('diff treats missing or malformed day collections as empty', () => {
  assert.deepEqual(buildPlanDiff({ days: null }, { days: 'not-a-list' }), { changedDays: [] })
})

test('planner client uses the training plan lifecycle routes', async () => {
  const originalFetch = globalThis.fetch
  const requests = []
  const payload = { constraints: [{ kind: 'skip_session', values: { date: '2026-07-21' } }] }

  globalThis.fetch = async (url, options) => {
    requests.push({ url, options })
    return {
      ok: true,
      headers: { get: () => 'application/json' },
      json: async () => ({ ok: true }),
    }
  }

  try {
    await trainingClient.getTrainingCurrentPlan()
    await trainingClient.getTrainingPlanProposal('plan/id')
    await trainingClient.postTrainingPlanProposal(payload)
    await trainingClient.applyTrainingPlanProposal('plan/id')
    await trainingClient.rejectTrainingPlanProposal('plan/id')
    await trainingClient.getTrainingPlanHistory()
    await trainingClient.getTrainingRules()
  } finally {
    globalThis.fetch = originalFetch
  }

  assert.deepEqual(requests, [
    { url: 'http://localhost:8000/training/plan/current', options: {} },
    { url: 'http://localhost:8000/training/plan/proposals/plan%2Fid', options: {} },
    {
      url: 'http://localhost:8000/training/plan/proposals',
      options: {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      },
    },
    { url: 'http://localhost:8000/training/plan/proposals/plan%2Fid/apply', options: { method: 'POST' } },
    { url: 'http://localhost:8000/training/plan/proposals/plan%2Fid/reject', options: { method: 'POST' } },
    { url: 'http://localhost:8000/training/plans/history', options: {} },
    { url: 'http://localhost:8000/training/rules', options: {} },
  ])
})
