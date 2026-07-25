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

  assert.equal(model.sequenceMode, 'ordinary')
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

test('fails closed when hybrid intent position or cyclic ordering is malformed', () => {
  const variants = [
    days => {
      days[1].sequence_position = 1
    },
    days => {
      days[1].session_intent = 'push_strength'
    },
    days => {
      days[1].session_intent = 'pull_volume'
    },
    days => {
      const second = days[1]
      days[1] = days[2]
      days[2] = second
      days[1].date = '2026-07-28'
      days[2].date = '2026-07-29'
    },
  ]

  for (const mutate of variants) {
    const days = activeHybridPlan.days.map(day => ({
      ...day,
      decision_reasons: [...day.decision_reasons],
    }))
    mutate(days)
    assert.deepEqual(buildHybridWeekPresentation({
      planner_version: 'adaptive-v2',
      days,
    }, '2026-07-29'), {
      slots: [],
      today: null,
      decisions: [],
      sequenceMode: null,
      counts: { training: 0, recovery: 0, routed: 0 },
    })
  }
})

test('accepts only receipt-proven peak and attempt lower-removal exceptions', () => {
  for (const phase of ['peak', 'attempt']) {
    const days = activeHybridPlan.days.map(day => ({
      ...day,
      decision_reasons: [...day.decision_reasons],
    }))
    days[2] = {
      ...days[2],
      session_type: 'recovery',
      objective: 'recovery',
      estimated_minutes: 0,
      session_intent: null,
      sequence_position: null,
      sequence_length: null,
      high_neural: false,
      exercises: [],
      decision_reasons: ['sequence_resumed', `phase_lower_removed:${phase}`],
    }
    for (const day of days) {
      if (['push_strength', 'pull_strength', 'push_volume', 'pull_volume'].includes(day.session_intent)) {
        day.decision_reasons.push(`phase_maintenance:${phase}`)
      }
      if (day.session_intent === 'jump_elastic') {
        day.decision_reasons.push(
          phase === 'peak' ? 'phase_jump_volume_limited:peak' : 'phase_attempt_exposure',
        )
      }
    }

    const model = buildHybridWeekPresentation({
      planner_version: 'adaptive-v2',
      days,
    }, '2026-07-29')

    assert.equal(model.sequenceMode, phase)
    assert.equal(model.slots.length, 7)
    assert.equal(model.slots.filter(slot => slot.sequencePosition !== null).length, 5)
    assert.equal(model.slots.filter(slot => slot.lifecycle === 'recovery').length, 2)
    assert.equal(model.today.lifecycle, 'recovery')
    assert.equal(model.today.label, null)
  }
})

test('preserves recovery identity when the Phoenix-placed recovery is today', () => {
  const model = buildHybridWeekPresentation(activeHybridPlan, '2026-07-30')

  assert.equal(model.today.date, '2026-07-30')
  assert.equal(model.today.lifecycle, 'recovery')
  assert.equal(model.today.intent, null)
  assert.equal(model.today.label, null)
})

test('routes a hard pain block to current recovery while retaining intent provenance', () => {
  const days = activeHybridPlan.days.map(day => ({
    ...day,
    decision_reasons: [...day.decision_reasons],
    exercises: day.exercises.map(exercise => ({ ...exercise })),
  }))
  days[2] = {
    ...days[2],
    session_type: 'recovery',
    objective: 'pain_safe_recovery',
    estimated_minutes: 0,
    exercises: [],
    change_reason: 'hard_pain_block',
  }

  const model = buildHybridWeekPresentation({
    planner_version: 'adaptive-v2',
    days,
  }, '2026-07-29')

  assert.equal(model.sequenceMode, 'routed')
  assert.deepEqual(model.counts, { training: 5, recovery: 2, routed: 1 })
  assert.equal(model.today.lifecycle, 'recovery')
  assert.equal(model.today.intent, 'lower_power')
  assert.equal(model.today.label, 'LOWER POWER')
  assert.equal(model.today.routed, true)
  assert.equal(model.today.changeReason, 'hard_pain_block')
  assert.deepEqual(model.today.exercises, [])
  assert.equal(model.decisions.some(row => row.code === 'hard_pain_block'), true)
})

test('routes a calendar hard conflict without presenting the preserved intent as workout', () => {
  const days = activeHybridPlan.days.map(day => ({
    ...day,
    decision_reasons: [...day.decision_reasons],
    exercises: day.exercises.map(exercise => ({ ...exercise })),
  }))
  days[6] = {
    ...days[6],
    session_type: 'rest',
    objective: 'calendar_recovery',
    estimated_minutes: 0,
    exercises: [],
    change_reason: 'calendar_hard_conflict',
  }

  const model = buildHybridWeekPresentation({
    planner_version: 'adaptive-v2',
    days,
  }, '2026-08-02')

  assert.equal(model.sequenceMode, 'routed')
  assert.deepEqual(model.counts, { training: 5, recovery: 2, routed: 1 })
  assert.equal(model.today.lifecycle, 'recovery')
  assert.equal(model.today.intent, 'jump_elastic')
  assert.equal(model.today.routed, true)
  assert.equal(model.today.changeReason, 'calendar_hard_conflict')
  assert.equal(model.today.highNeural, false)
  assert.deepEqual(model.today.exercises, [])
})

test('malformed Phoenix reasoning clears panel and every per-slot reason', () => {
  const plan = {
    days: activeHybridPlan.days.map(day => ({
      ...day,
      decision_reasons: [...day.decision_reasons],
    })),
  }
  plan.days[2] = {
    ...plan.days[2],
    decision_reasons: ['phase_strength', { code: 'invented' }],
  }

  const malformed = buildHybridWeekPresentation(plan, '2026-07-29')
  assert.deepEqual(malformed.decisions, [])
  assert.equal(malformed.slots.every(slot => slot.decisionReasons.length === 0), true)

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
      sequenceMode: null,
      counts: { training: 0, recovery: 0, routed: 0 },
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
  assert.equal(model.sequenceMode, 'legacy')
  assert.equal(model.slots.every(slot => slot.intent === null && slot.label === null), true)
  assert.equal(model.today.date, '2026-07-29')
  assert.deepEqual(model.decisions, [])
})
