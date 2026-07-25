import test from 'node:test'
import assert from 'node:assert/strict'

import { buildHybridWeekPresentation } from './trainingHybridWeekViewModel.js'

const hybridDay = ({
  date,
  intent,
  position,
  minutes = 65,
  reasons = ['sequence_resumed'],
  highNeural = false,
  exercises = [{ name: 'bench_press', sets: 4, reps: 5 }],
}) => ({
  date,
  session_type: intent ? 'general' : 'recovery',
  objective: intent || 'recovery',
  estimated_minutes: intent ? minutes : 0,
  session_intent: intent,
  sequence_position: position,
  sequence_length: intent ? 6 : null,
  high_neural: highNeural,
  decision_reasons: reasons,
  exercises: intent ? exercises : [],
})

const activeHybridPlan = {
  planner_version: 'adaptive-v2',
  days: [
    hybridDay({ date: '2026-07-27', intent: 'push_strength', position: 1 }),
    hybridDay({ date: '2026-07-28', intent: 'pull_strength', position: 2 }),
    hybridDay({
      date: '2026-07-29',
      intent: 'lower_power',
      position: 3,
      minutes: 62,
      highNeural: true,
      reasons: ['sequence_resumed', 'phase_strength'],
      exercises: [{ name: 'back_squat', sets: 5, reps: 5, suggested_kg: 82.5 }],
    }),
    hybridDay({
      date: '2026-07-30',
      intent: null,
      position: null,
      reasons: ['recovery_placed:lower_spacing'],
    }),
    hybridDay({ date: '2026-07-31', intent: 'push_volume', position: 4 }),
    hybridDay({ date: '2026-08-01', intent: 'pull_volume', position: 5 }),
    hybridDay({
      date: '2026-08-02',
      intent: 'jump_elastic',
      position: 6,
      highNeural: true,
    }),
  ],
}

test('builds seven dated slots with six authoritative intents and movable recovery', () => {
  const model = buildHybridWeekPresentation(activeHybridPlan, '2026-07-29')

  assert.equal(model.slots.length, 7)
  assert.equal(model.slots.filter(slot => slot.sequencePosition !== null).length, 6)
  assert.deepEqual(model.slots.map(slot => slot.label), [
    'PUSH A',
    'PULL A',
    'LOWER POWER',
    null,
    'PUSH B',
    'PULL B',
    'JUMP / ELASTIC',
  ])
  assert.equal(model.slots[3].lifecycle, 'recovery')
  assert.equal(model.slots[3].intent, null)
  assert.equal(model.today.intent, 'lower_power')
  assert.equal(model.today.lifecycle, 'today')
  assert.equal(model.today.durationMinutes, 62)
  assert.deepEqual(model.today.exercises, activeHybridPlan.days[2].exercises)
})

test('uses dates only for lifecycle and never invents identity from sequence position', () => {
  const plan = {
    days: activeHybridPlan.days.map(day => ({ ...day })),
  }
  plan.days[0] = {
    ...plan.days[0],
    session_intent: 'unknown_push',
    sequence_position: 1,
  }

  const model = buildHybridWeekPresentation(plan, '2026-07-29')

  assert.equal(model.slots[0].lifecycle, 'complete')
  assert.equal(model.slots[0].intent, null)
  assert.equal(model.slots[0].label, null)
  assert.equal(model.slots[0].sequencePosition, 1)
  assert.equal(model.slots[4].lifecycle, 'queued')
})

test('withholds malformed Phoenix reasoning and keeps only receipt strings', () => {
  const plan = {
    days: activeHybridPlan.days.map(day => ({ ...day })),
  }
  plan.days[2] = {
    ...plan.days[2],
    decision_reasons: [{ code: 'invented' }],
  }

  assert.deepEqual(buildHybridWeekPresentation(plan, '2026-07-29').decisions, [])

  const valid = buildHybridWeekPresentation(activeHybridPlan, '2026-07-29')
  assert.deepEqual(valid.decisions, [
    { code: 'sequence_resumed', label: 'SEQUENCE RESUMED' },
    { code: 'phase_strength', label: 'PHASE STRENGTH' },
    { code: 'recovery_placed:lower_spacing', label: 'LOWER-BODY SPACING' },
  ])
})

test('fails closed for duplicate, invalid, or incomplete receipt dates', () => {
  const duplicate = {
    days: activeHybridPlan.days.map((day, index) => (
      index === 6 ? { ...day, date: '2026-08-01' } : { ...day }
    )),
  }
  const incomplete = { days: activeHybridPlan.days.slice(0, 6) }
  const gapped = {
    days: activeHybridPlan.days.map((day, index) => (
      index === 6 ? { ...day, date: '2026-08-03' } : { ...day }
    )),
  }

  for (const plan of [null, {}, duplicate, incomplete, gapped]) {
    assert.deepEqual(buildHybridWeekPresentation(plan, '2026-07-29'), {
      slots: [],
      today: null,
      decisions: [],
    })
  }
})

test('preserves legacy days as neutral slots without hybrid explanations', () => {
  const legacy = {
    planner_version: 'adaptive-v1',
    days: activeHybridPlan.days.map(({ date }, index) => ({
      date,
      session_type: index === 3 ? 'recovery' : 'general',
      objective: index === 3 ? 'recovery' : 'general_strength',
      estimated_minutes: index === 3 ? 0 : 60,
      exercises: index === 3 ? [] : [{ name: 'bench_press' }],
    })),
  }

  const model = buildHybridWeekPresentation(legacy, '2026-07-29')

  assert.equal(model.slots.length, 7)
  assert.equal(model.slots.every(slot => slot.intent === null && slot.label === null), true)
  assert.equal(model.today.date, '2026-07-29')
  assert.deepEqual(model.decisions, [])
})
