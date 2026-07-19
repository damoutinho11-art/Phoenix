import assert from 'node:assert/strict'
import test from 'node:test'

import { buildTrainingDomain, normalizeTrainingLive } from './trainingLive.js'

const baseDomain = () => ({
  bootLine: '', heroValue: '', heroUnit: '', heroLabel: '', reactorPct: 0,
  heroChips: [], heroBrief: '', heroActions: [], readout: [], feed: [], panels: [],
})


const status = {
  as_of: '2026-07-20',
  operational_state: 'active_plan',
  plan_provenance: { plan_id: 'p1', receipt_hash: 'h1', date: '2026-07-20' },
  today_session: {
    date: '2026-07-20',
    session_type: 'high_intensity',
    display_name: 'Jump Strength',
    objective: 'jump_strength',
    estimated_minutes: 50,
    is_rest: false,
    exercises: [{ name: 'hang_power_clean', sets: 5, reps: 3, load_kg: 60 }],
  },
  week_sessions: [],
  dunk_goal: {
    days_to_attempt: 53,
    attempt_window_start: '2026-09-11',
    current_phase: 'month_1',
    current_mesocycle_week: 3,
    on_track: true,
  },
  cut_status: { current_bodyweight_kg: 78.4, current_bf_pct: 24, target_bf_pct: 19 },
}

const routed = {
  operational_state: 'active_plan',
  plan_provenance: status.plan_provenance,
  session: status.today_session,
  readiness_status: 'clear',
  readiness_required: false,
  high_neural_allowed: true,
  readiness_scan: {
    knee: 1, ankle: 0, hip: 2, hamstring: 1, calf_achilles: 0,
    lower_back_pelvic: 2,
  },
}


test('Training live backend failure is unavailable without fixture metrics', () => {
  const model = normalizeTrainingLive({
    status: null, routed: null, history: null, loading: false, error: 'offline',
  })
  const domain = buildTrainingDomain(baseDomain(), model)

  assert.equal(model.state, 'unavailable')
  assert.match(domain.heroLabel, /DATA UNAVAILABLE/)
  assert.doesNotMatch(JSON.stringify(domain), /31\.5|82%|7H 40M/)
  assert.equal(domain.panels.length, 4)
})


test('Training live plan-required is distinct from a rest day', () => {
  const model = normalizeTrainingLive({
    status: { operational_state: 'plan_required' },
    routed: null,
    history: { sessions: [] },
    loading: false,
    error: null,
  })

  assert.equal(model.state, 'plan_required')
  assert.equal(buildTrainingDomain(baseDomain(), model).heroValue, 'PLAN')
})


test('Training live readiness-required follows routed server authority', () => {
  const model = normalizeTrainingLive({
    status,
    routed: { ...routed, readiness_status: 'unchecked', readiness_required: true, high_neural_allowed: false },
    history: { sessions: [] },
    loading: false,
    error: null,
  })

  assert.equal(model.state, 'readiness_required')
  assert.equal(buildTrainingDomain(baseDomain(), model).heroActions[0].sub, 'readiness')
})


test('Training live ready model uses API session and recorded history only', () => {
  const model = normalizeTrainingLive({
    status,
    routed,
    history: {
      sessions: [
        { id: 2, date: '2026-07-18', session_type: 'general' },
        { id: 1, date: '2026-07-16', session_type: 'jump' },
      ],
    },
    loading: false,
    error: null,
  })
  const domain = buildTrainingDomain(baseDomain(), model)

  assert.equal(model.state, 'ready')
  assert.equal(domain.panels[0].rows[0].title, 'hang power clean')
  assert.equal(domain.panels[2].meta, '2 RECORDED')
  assert.match(JSON.stringify(domain.panels[2]), /2026-07-18/)
  assert.doesNotMatch(JSON.stringify(domain.panels[2]), /31\.5/)
})
