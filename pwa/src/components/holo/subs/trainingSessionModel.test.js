import assert from 'node:assert/strict'
import test from 'node:test'

import {
  allSetResultsRecorded,
  buildCompletionPayload,
  buildReadinessPayload,
  canCompleteSession,
  createSetResults,
  normalizePlanExercises,
  recordSetResult,
} from './trainingSessionModel.js'


const routed = {
  plan_provenance: {
    plan_id: 'plan-2026-W30',
    receipt_hash: 'receipt-2026-W30',
    date: '2026-07-20',
  },
  session: {
    date: '2026-07-20',
    session_type: 'high_intensity',
    exercises: [
      { name: 'hang_power_clean', sets: 3, reps: 3, load_kg: 60, rest_seconds: 120 },
      { name: 'split_squat', sets: 2, reps: 6, load_kg: 24 },
    ],
  },
}


test('normalizes only exact plan prescriptions', () => {
  assert.deepEqual(normalizePlanExercises(routed), [
    { name: 'hang_power_clean', sets: 3, reps: 3, loadKg: 60, restSeconds: 120 },
    { name: 'split_squat', sets: 2, reps: 6, loadKg: 24, restSeconds: 90 },
  ])
  assert.deepEqual(normalizePlanExercises({ session: { exercises: [{ name: 'bad', sets: '3', reps: 5 }] } }), [])
})


test('readiness payload contains all measured scores and flags', () => {
  assert.deepEqual(buildReadinessPayload({
    knee: 1, ankle: 2, hip: 3, hamstring: 4, calf_achilles: 5,
    lower_back_pelvic: 6, sharp_pain: true, limping: false,
    next_day_worsening: true, note: 'Left knee after stairs',
  }), {
    knee: 1, ankle: 2, hip: 3, hamstring: 4, calf_achilles: 5,
    lower_back_pelvic: 6, sharp_pain: true, limping: false,
    next_day_worsening: true, note: 'Left knee after stairs',
  })
})


test('completion remains closed until sets RPE and pain evidence are complete', () => {
  assert.equal(canCompleteSession({ allSetsDone: true, rpe: 8, painAnswered: false }), false)
  assert.equal(canCompleteSession({ allSetsDone: true, rpe: 8, painAnswered: true, painConfirmed: true, painBodyAreas: [] }), false)
  assert.equal(canCompleteSession({ allSetsDone: true, rpe: 8, painAnswered: true, painConfirmed: false, painBodyAreas: [] }), true)
  assert.equal(canCompleteSession({ allSetsDone: true, rpe: 8, painAnswered: true, painConfirmed: true, painBodyAreas: ['knee'] }), true)
})


test('records actual set results immutably and requires every planned set', () => {
  const exercises = normalizePlanExercises(routed)
  const empty = createSetResults(exercises)
  const first = recordSetResult(empty, 0, 0, { reps: 2, weightKg: 57.5 })

  assert.equal(empty[0][0], null)
  assert.deepEqual(first[0][0], { reps: 2, weightKg: 57.5 })
  assert.equal(allSetResultsRecorded(exercises, first), false)

  let complete = first
  complete = recordSetResult(complete, 0, 1, { reps: 3, weightKg: 60 })
  complete = recordSetResult(complete, 0, 2, { reps: 3, weightKg: 60 })
  complete = recordSetResult(complete, 1, 0, { reps: 6, weightKg: 24 })
  complete = recordSetResult(complete, 1, 1, { reps: 5, weightKg: 24 })
  assert.equal(allSetResultsRecorded(exercises, complete), true)
})


test('builds plan-linked completion evidence from actual set results', () => {
  const exercises = normalizePlanExercises(routed)
  let setResults = createSetResults(exercises)
  setResults = recordSetResult(setResults, 0, 0, { reps: 2, weightKg: 57.5 })
  setResults = recordSetResult(setResults, 0, 1, { reps: 3, weightKg: 60 })
  setResults = recordSetResult(setResults, 0, 2, { reps: 3, weightKg: 60 })
  setResults = recordSetResult(setResults, 1, 0, { reps: 6, weightKg: 24 })
  setResults = recordSetResult(setResults, 1, 1, { reps: 5, weightKg: 24 })
  assert.deepEqual(buildCompletionPayload({
    routed,
    exercises,
    setResults,
    elapsedSeconds: 1840,
    rpe: 8,
    painConfirmed: true,
    painBodyAreas: ['knee'],
    notes: 'Clean session',
  }), {
    date: '2026-07-20',
    session_type: 'high_intensity',
    exercises: [
      { name: 'hang_power_clean', target_reps: 3, sets: [
        { reps: 2, weight_kg: 57.5, target_reps: 3 },
        { reps: 3, weight_kg: 60, target_reps: 3 },
        { reps: 3, weight_kg: 60, target_reps: 3 },
      ] },
      { name: 'split_squat', target_reps: 6, sets: [
        { reps: 6, weight_kg: 24, target_reps: 6 },
        { reps: 5, weight_kg: 24, target_reps: 6 },
      ] },
    ],
    notes: 'Clean session',
    plan_id: 'plan-2026-W30',
    receipt_hash: 'receipt-2026-W30',
    duration_seconds: 1840,
    rpe: 8,
    pain_confirmed: true,
    pain_body_areas: ['knee'],
  })
})
