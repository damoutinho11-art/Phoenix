import React from 'react'

import { buildLineChartGeometry } from './metricLineChartModel.js'

const e = React.createElement

function formatValue(value, unit) {
  if (unit === 'EUR') {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'EUR',
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }).format(value)
  }
  return `${value}${unit ? ` ${unit}` : ''}`
}

function formatDate(timestamp) {
  const date = new Date(timestamp)
  return Number.isNaN(date.getTime())
    ? String(timestamp)
    : date.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', timeZone: 'UTC' })
}

export function MetricLineChart({
  points = [],
  historyStatus = 'EMPTY',
  source,
  unit = '',
  width = 640,
  height = 220,
}) {
  const geometry = buildLineChartGeometry(points, width, height, 22)
  const ready = historyStatus === 'READY' && geometry.coordinates.length >= 2

  if (!ready) {
    const count = geometry.coordinates.length
    const message = count === 1
      ? 'One real observation is recorded. At least two are required to draw a trend.'
      : 'No real observations are recorded yet. No chart has been generated.'
    return e('div', { className: 'phx-chart-empty', role: 'status' },
      e('div', { className: 'phx-empty-code' }, count ? 'INSUFFICIENT_HISTORY' : 'EMPTY'),
      e('p', null, message),
      e('div', { className: 'phx-chart-source' }, source ? String(source).toUpperCase() : 'SOURCE UNKNOWN'),
    )
  }

  const first = geometry.coordinates[0]
  const last = geometry.coordinates.at(-1)
  const label = `${geometry.coordinates.length} real observations from ${formatDate(first.timestamp)} to ${formatDate(last.timestamp)}. First ${formatValue(first.value, unit)}; latest ${formatValue(last.value, unit)}. Source ${source || 'unknown'}.`

  return e('figure', { className: 'phx-line-chart' },
    e('svg', {
      viewBox: `0 0 ${width} ${height}`,
      role: 'img',
      'aria-label': label,
      preserveAspectRatio: 'none',
    },
    [0.25, 0.5, 0.75].map(ratio => e('line', {
      key: ratio,
      x1: 22,
      x2: width - 22,
      y1: height * ratio,
      y2: height * ratio,
      className: 'phx-chart-grid',
    })),
    e('path', { d: geometry.path, className: 'phx-chart-path phx-motion', fill: 'none' }),
    geometry.coordinates.map((point, index) => e('circle', {
      key: `${point.timestamp}-${index}`,
      cx: point.x,
      cy: point.y,
      r: index === geometry.coordinates.length - 1 ? 4 : 2.5,
      className: 'phx-chart-point',
    }))),
    e('figcaption', { className: 'phx-chart-caption' },
      e('span', null, `${formatDate(first.timestamp)} · ${formatValue(first.value, unit)}`),
      e('span', null, `${formatDate(last.timestamp)} · ${formatValue(last.value, unit)}`),
    ),
  )
}
