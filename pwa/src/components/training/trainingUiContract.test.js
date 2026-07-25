import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const metrics = readFileSync(new URL('./TrainingMetrics.jsx', import.meta.url), 'utf8')
const active = readFileSync(new URL('./ActiveSession.jsx', import.meta.url), 'utf8')
const jump = readFileSync(new URL('./JumpLog.jsx', import.meta.url), 'utf8')

test('training cockpit exposes readiness route and capacity language', () => {
  for (const label of [
    'Readiness Scan',
    'TODAY’S SESSION',
    'Joint Capacity Block',
    'Sled Balance',
    'Squat Balance',
    'Pelvic Control',
    'Recovery Reset',
    'Jump Balance',
  ]) assert.match(metrics, new RegExp(label))

  assert.match(metrics, /title="TELEMETRY" color={ORANGE} numbered={false}/)
  assert.match(metrics, /title="MODULES" color={ORANGE} numbered={false}/)
  assert.doesNotMatch(metrics, /<StepBadge n={4}/)
  assert.doesNotMatch(metrics, /<StepBadge n={5}/)
})

test('active session delegates to the verified plan runner', () => {
  assert.match(active, /getTrainingRoutedSession/)
  assert.match(active, /getTrainingHistory/)
  assert.match(active, /normalizeTrainingLive/)
  assert.match(active, /<SessionSub/)
  assert.doesNotMatch(active, /function buildExercises|SESSION_NAMES|await logSession/)
})

test('jump tracker exposes all four plant patterns and quality fields', () => {
  for (const value of [
    'one_foot_left',
    'one_foot_right',
    'two_foot_left_right',
    'two_foot_right_left',
    'ground_contact_feel',
    'landing_braking_confidence',
    'approach_speed_comfort',
    'penultimate_step_quality',
    'squatty_jump_warning',
    'stiffness_compliance_note',
    'fatigue_drop_off',
  ]) assert.match(jump, new RegExp(value))
})

test('training production UI contains no forbidden medical or marketing claims', () => {
  const all = `${metrics}\n${active}\n${jump}`.toLowerCase()
  for (const forbidden of [
    'bulletproof',
    'heal your knee',
    'safe for everyone',
    'push through pain',
    'guaranteed dunk',
    'fix pelvic tilt',
  ]) assert.equal(all.includes(forbidden), false)
})
