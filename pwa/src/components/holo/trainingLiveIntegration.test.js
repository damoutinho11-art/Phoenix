import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'

const source = path => readFile(new URL(path, import.meta.url), 'utf8')
const trainingAuthority = await import('./trainingLive.js')


test('Holo Training fetches status route and history with explicit source state', async () => {
  const data = await source('./useHoloData.js')

  assert.match(data, /getTrainingRoutedSession/)
  assert.match(data, /getTrainingHistory/)
  assert.match(data, /refreshTraining/)
  assert.match(data, /training:[\s\S]*loading/)
  assert.match(data, /training:[\s\S]*error/)
  assert.doesNotMatch(data, /grab\('training',[\s\S]*fixture fallback/)
})


test('Holo Training uses truthful model and passes it to operational subviews', async () => {
  const command = await source('./HoloCommand.jsx')

  assert.match(command, /normalizeTrainingLive/)
  assert.match(command, /buildTrainingDomain/)
  assert.match(command, /<SessionSub[\s\S]*training=/)
  assert.match(command, /<ReadinessSub[\s\S]*training=/)
  assert.doesNotMatch(command, /mapSessionExercises/)
})


test('Training production modules expose no operational session or readiness fixtures', async () => {
  const domains = await source('./holoDomains.js')
  const live = await source('./holoLive.js')
  const subs = await source('./subs/TrainingSubs.jsx')

  for (const text of [domains, live, subs]) {
    assert.doesNotMatch(text, /SESSION_EXERCISES|READINESS_GAUGES/)
  }
  assert.doesNotMatch(live, /export function applyTraining|export function mapSessionExercises/)
})


test('live session initializes counters when an async verified plan arrives', async () => {
  const subs = await source('./subs/TrainingSubs.jsx')

  assert.match(subs, /planKey/)
  assert.match(subs, /setDone\(exercises\.map/)
})


test('live session captures actual reps and load before completing each set', async () => {
  const subs = await source('./subs/TrainingSubs.jsx')

  assert.match(subs, /ACTUAL REPS/)
  assert.match(subs, /ACTUAL LOAD/)
  assert.match(subs, /recordSetResult/)
  assert.match(subs, /setResults/)
  assert.doesNotMatch(subs, /sets: Array\.from\(\{ length: exercise\.sets/)
})


test('live session presents receipt identity and submits model-built hybrid evidence', async () => {
  const subs = await source('./subs/TrainingSubs.jsx')

  assert.match(subs, /training-session-layout/)
  assert.match(subs, /training-session-identity/)
  assert.match(subs, /formatHybridSessionIdentity/)
  assert.match(subs, /buildCompletionPayload\(\{[\s\S]*routed/)
  assert.doesNotMatch(subs, /exercise.*(?:push|pull|lower|jump).*session_intent/is)
})


test('Training source reconciliation rejects a plan-change race before presentation', () => {
  assert.equal(typeof trainingAuthority.reconcileTrainingSources, 'function')
  const status = {
    operational_state: 'active_plan',
    plan_provenance: { plan_id: 'plan-new', receipt_hash: 'receipt-new' },
  }
  const routed = {
    plan_provenance: { plan_id: 'plan-old', receipt_hash: 'receipt-old' },
    session: { session_intent: 'lower_power', sequence_position: 3, sequence_length: 6 },
  }
  const reconciled = trainingAuthority.reconcileTrainingSources({ status, routed, history: { sessions: [] } })

  assert.equal(reconciled.status, null)
  assert.equal(reconciled.routed, null)
  assert.match(reconciled.error, /provenance changed/i)
})


test('Training refresh commits only the newest coherent request', async () => {
  assert.equal(typeof trainingAuthority.isCurrentTrainingRequest, 'function')
  assert.equal(trainingAuthority.isCurrentTrainingRequest(1, 2), false)
  assert.equal(trainingAuthority.isCurrentTrainingRequest(2, 2), true)

  const data = await source('./useHoloData.js')
  assert.match(data, /trainingRequest/)
  assert.match(data, /isCurrentTrainingRequest\(requestId,\s*trainingRequest\.current\)/)
  assert.match(data, /reconcileTrainingSources\(\{\s*status,\s*routed,\s*history\s*\}\)/)
})
