import assert from 'node:assert/strict'
import test from 'node:test'
import React from 'react'
import { renderToStaticMarkup } from 'react-dom/server'

import { MetricLineChart } from './MetricLineChart.js'

test('renders an honest insufficient-history state instead of a synthetic line', () => {
  const html = renderToStaticMarkup(React.createElement(MetricLineChart, {
    points: [{ timestamp: '2026-06-30T10:00:00Z', value: 100 }],
    historyStatus: 'INSUFFICIENT_HISTORY',
    source: 'real_sqlite',
    unit: 'EUR',
  }))

  assert.match(html, /INSUFFICIENT_HISTORY/)
  assert.match(html, /real observation/i)
  assert.doesNotMatch(html, /<path/)
})

test('renders accessible SVG only for real ready history', () => {
  const html = renderToStaticMarkup(React.createElement(MetricLineChart, {
    points: [
      { timestamp: '2026-06-29T10:00:00Z', value: 90 },
      { timestamp: '2026-06-30T10:00:00Z', value: 100 },
    ],
    historyStatus: 'READY',
    source: 'real_sqlite',
    unit: 'EUR',
  }))

  assert.match(html, /<svg/)
  assert.match(html, /role="img"/)
  assert.match(html, /2 real observations/)
  assert.match(html, /<path/)
})
