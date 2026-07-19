import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'

const source = path => readFile(new URL(path, import.meta.url), 'utf8')


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
