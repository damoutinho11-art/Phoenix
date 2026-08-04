import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

import {
  buildPlanDiff,
  normalizeTrainingPlan,
  planTone,
} from './trainingPlannerViewModel.js'

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

test('proposed plans require a non-empty, well-formed validations array to apply', () => {
  for (const validations of [undefined, null, {}, [], [null], [{ rule: 'recovery_spacing', passed: true }]]) {
    const plan = normalizeTrainingPlan({ status: 'proposed', validations })
    assert.equal(plan.canApply, false)
  }

  const plan = normalizeTrainingPlan({ plan_id: 'p1', status: 'proposed', authoritative: true, validations: [
    { rule: 'recovery_spacing', passed: true, severity: 'hard', detail: 'Spacing is valid' },
  ] })

  assert.equal(plan.canApply, true)
  assert.equal(plan.plan_id, 'p1')
})

test('proposed plans with invalid plan IDs cannot apply', () => {
  for (const plan_id of [undefined, '', '   ', 42, null, {}]) {
    const plan = normalizeTrainingPlan({ plan_id, status: 'proposed', authoritative: true, validations: [
      { rule: 'recovery_spacing', passed: true, severity: 'hard', detail: 'Spacing is valid' },
    ] })

    assert.equal(plan.canApply, false, `plan_id ${String(plan_id)} should be ineligible`)
  }
})

test('shadow and authority-unknown proposals cannot apply', () => {
  const validProposal = {
    plan_id: 'p1',
    status: 'proposed',
    validations: [
      { rule: 'recovery_spacing', passed: true, severity: 'hard', detail: 'Spacing is valid' },
    ],
  }

  assert.equal(normalizeTrainingPlan({ ...validProposal, authoritative: false }).canApply, false)
  assert.equal(normalizeTrainingPlan(validProposal).canApply, false)
})

test('active and non-proposed plans remain ineligible when validation payloads are malformed', () => {
  assert.equal(normalizeTrainingPlan({ status: 'active', validations: null }).canApply, false)
  assert.equal(normalizeTrainingPlan({ status: 'rejected', validations: [{}] }).canApply, false)
})

test('diff identifies moved and reduced days', () => {
  const diff = buildPlanDiff(beforeFixture, afterFixture)

  assert.deepEqual(diff.changedDays.map(day => day.date), ['2026-07-20', '2026-07-21', '2026-07-22'])
})

test('diff reports prior days removed from an absent or incomplete response', () => {
  const absentAfter = buildPlanDiff(beforeFixture, {})
  const malformedAfter = buildPlanDiff(beforeFixture, { days: 'not-a-list' })
  const incompleteAfter = buildPlanDiff(beforeFixture, { days: [beforeFixture.days[0]] })

  assert.deepEqual(absentAfter.changedDays.map(day => day.date), ['2026-07-20', '2026-07-21', '2026-07-22'])
  assert.ok(absentAfter.changedDays.every(day => day.removed === true))
  assert.deepEqual(malformedAfter.changedDays.map(day => day.date), ['2026-07-20', '2026-07-21', '2026-07-22'])
  assert.ok(malformedAfter.changedDays.every(day => day.removed === true))
  assert.deepEqual(incompleteAfter.changedDays.map(day => day.date), ['2026-07-21', '2026-07-22'])
  assert.ok(incompleteAfter.changedDays.every(day => day.removed === true))
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

test('diff treats empty prior and malformed next day collections as empty', () => {
  assert.deepEqual(buildPlanDiff({ days: null }, { days: 'not-a-list' }), { changedDays: [] })
})

test('planner client declares the training plan lifecycle routes', () => {
  const client = readFileSync(new URL('../../../api/client.js', import.meta.url), 'utf8')

  assert.match(client, /apiFetch\('\/training\/plan\/current'\)/)
  assert.match(client, /training\/plan\/proposals\/\$\{encodeURIComponent\(id\)\}/)
  assert.match(client, /apiFetch\('\/training\/plan\/proposals',\s*\{[\s\S]*method:\s*'POST'/)
  assert.match(client, /training\/plan\/proposals\/\$\{encodeURIComponent\(id\)\}\/apply/)
  assert.match(client, /training\/plan\/proposals\/\$\{encodeURIComponent\(id\)\}\/reject/)
  assert.match(client, /apiFetch\('\/training\/plans\/history'\)/)
  assert.match(client, /apiFetch\('\/training\/rules'\)/)
  assert.match(client, /PHOENIX_API_UNCONFIGURED/)
})
