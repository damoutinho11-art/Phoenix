import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  parseWeightInput,
  normalizeHistory,
  weightTrend,
  sparklinePoints,
  sparklinePath,
  formatDelta,
} from './weightTrendModel.js'

// Diogo's real log: four days at the start of the cut, then a six-week gap.
const REAL_LOG = [
  { id: 1, log_date: '2026-07-06', weight_kg: 74.5 },
  { id: 2, log_date: '2026-07-09', weight_kg: 74.2 },
  { id: 3, log_date: '2026-07-10', weight_kg: 74.8 },
  { id: 4, log_date: '2026-07-11', weight_kg: 75.0 },
  { id: 5, log_date: '2026-08-24', weight_kg: 77.6 },
]

test('parseWeightInput accepts plausible weights', () => {
  assert.equal(parseWeightInput('77.6'), 77.6)
  assert.equal(parseWeightInput(77.6), 77.6)
  assert.equal(parseWeightInput('77,6'), 77.6, 'comma decimal, as typed on an ET keyboard')
  assert.equal(parseWeightInput('80'), 80)
})

test('parseWeightInput rejects entries the API would refuse', () => {
  for (const bad of ['', '  ', 'abc', 0, -5, 501, '7760', null, undefined, NaN]) {
    assert.equal(parseWeightInput(bad), null, `input ${JSON.stringify(bad)}`)
  }
})

test('normalizeHistory sorts oldest-first and drops unusable rows', () => {
  const messy = [
    { log_date: '2026-08-24', weight_kg: 77.6 },
    { log_date: '2026-07-06', weight_kg: 74.5 },
    { log_date: 'not-a-date', weight_kg: 70 },
    { log_date: '2026-07-09', weight_kg: null },
    { log_date: '2026-07-10', weight_kg: 0 },
  ]
  const clean = normalizeHistory(messy)
  assert.deepEqual(clean.map(p => p.date), ['2026-07-06', '2026-08-24'])
})

test('normalizeHistory tolerates junk input', () => {
  assert.deepEqual(normalizeHistory(null), [])
  assert.deepEqual(normalizeHistory('nope'), [])
  assert.deepEqual(normalizeHistory([null, undefined, 5]), [])
})

test('weightTrend summarises the real log', () => {
  const t = weightTrend(REAL_LOG, { today: '2026-08-24' })
  assert.equal(t.count, 5)
  assert.equal(t.latest.kg, 77.6)
  assert.equal(t.previous.kg, 75.0)
  assert.equal(t.change, 2.6, 'change against the previous entry, not per-day')
  assert.equal(t.sinceFirst, 3.1, '74.5 at the start of the cut to 77.6 today')
  assert.equal(t.spanDays, 49)
  assert.equal(t.latestGapDays, 0)
})

test('weightTrend flags a stale newest entry', () => {
  // Before today's weigh-in, the newest reading was six weeks old.
  const stale = REAL_LOG.slice(0, 4)
  const t = weightTrend(stale, { today: '2026-08-24' })
  assert.equal(t.latest.kg, 75.0)
  assert.equal(t.latestGapDays, 44, 'so the UI can say this is not today’s weight')
})

test('weightTrend handles an empty and a single-entry log', () => {
  const empty = weightTrend([], { today: '2026-08-24' })
  assert.equal(empty.count, 0)
  assert.equal(empty.latest, null)
  assert.equal(empty.change, null)

  const one = weightTrend([{ log_date: '2026-08-24', weight_kg: 77.6 }], { today: '2026-08-24' })
  assert.equal(one.count, 1)
  assert.equal(one.latest.kg, 77.6)
  assert.equal(one.change, null, 'nothing to compare against yet')
  assert.equal(one.sinceFirst, null)
  assert.equal(one.spanDays, 0)
})

test('sparklinePoints spaces x by elapsed time, not by index', () => {
  const pts = sparklinePoints(REAL_LOG, 100, 30)
  assert.equal(pts.length, 5)
  assert.equal(pts[0].x, 0)
  assert.equal(pts[4].x, 100)
  // Jul 6 -> Jul 11 is 5 of 49 days, so the first four points cluster left.
  assert.ok(pts[3].x < 15, `expected the July cluster near the left, got ${pts[3].x}`)
})

test('sparklinePoints puts the heaviest reading at the top', () => {
  const pts = sparklinePoints(REAL_LOG, 100, 30)
  const heaviest = pts.find(p => p.kg === 77.6)
  const lightest = pts.find(p => p.kg === 74.2)
  assert.equal(heaviest.y, 0)
  assert.equal(lightest.y, 30)
})

test('sparklinePoints centres degenerate series', () => {
  assert.deepEqual(
    sparklinePoints([{ log_date: '2026-08-24', weight_kg: 77.6 }], 100, 30).map(p => [p.x, p.y]),
    [[50, 15]]
  )
  const flat = sparklinePoints(
    [{ log_date: '2026-08-01', weight_kg: 77 }, { log_date: '2026-08-02', weight_kg: 77 }], 100, 30
  )
  assert.deepEqual(flat.map(p => p.y), [15, 15], 'a flat line sits mid-box, not at an edge')
  assert.deepEqual(sparklinePoints([], 100, 30), [])
})

test('sparklinePath renders an SVG polyline attribute', () => {
  const path = sparklinePath(
    [{ log_date: '2026-08-01', weight_kg: 74 }, { log_date: '2026-08-02', weight_kg: 76 }], 100, 30
  )
  assert.equal(path, '0,30 100,0')
  assert.equal(sparklinePath([], 100, 30), '')
})

test('formatDelta signs the change for display', () => {
  assert.equal(formatDelta(2.6), '+2.6')
  assert.equal(formatDelta(-1.25), '−1.3')
  assert.equal(formatDelta(0), '0.0')
  assert.equal(formatDelta(null), '—')
  assert.equal(formatDelta(NaN), '—')
})
