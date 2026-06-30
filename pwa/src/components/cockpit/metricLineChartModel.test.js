import assert from 'node:assert/strict'
import test from 'node:test'

import { buildLineChartGeometry } from './metricLineChartModel.js'

test('builds geometry from supplied real points only', () => {
  const result = buildLineChartGeometry([
    { timestamp: '2026-06-28T10:00:00Z', value: 90 },
    { timestamp: '2026-06-29T10:00:00Z', value: 100 },
    { timestamp: '2026-06-30T10:00:00Z', value: 95 },
  ], 400, 160)

  assert.equal(result.coordinates.length, 3)
  assert.equal(result.path.split(' L ').length, 3)
  assert.equal(result.min, 90)
  assert.equal(result.max, 100)
})

test('does not manufacture coordinates for missing or invalid observations', () => {
  const result = buildLineChartGeometry([
    { timestamp: '2026-06-28T10:00:00Z', value: null },
    { timestamp: '2026-06-29T10:00:00Z', value: Number.NaN },
  ], 400, 160)

  assert.deepEqual(result.coordinates, [])
  assert.equal(result.path, '')
})

test('renders a flat real series without dividing by zero', () => {
  const result = buildLineChartGeometry([
    { timestamp: '2026-06-28T10:00:00Z', value: 100 },
    { timestamp: '2026-06-29T10:00:00Z', value: 100 },
  ], 400, 160)

  assert.equal(result.coordinates.length, 2)
  assert.equal(result.coordinates[0].y, result.coordinates[1].y)
  assert.ok(Number.isFinite(result.coordinates[0].y))
})
