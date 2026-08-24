// ── NUTRITION // WEIGHT TREND MODEL ──
// Pure helpers for the morning weigh-in screen. Kept free of React so
// `node --test` covers the arithmetic behind what the trend claims.
//
// The weigh-in log is sparse and irregular — Diogo logged four days in July and
// then nothing for six weeks — so every helper here must behave sanely on gaps,
// single points, and out-of-order rows rather than assuming a daily cadence.

const DAY_MS = 86400000

function toNumber(value) {
  if (typeof value === 'number') return Number.isFinite(value) ? value : null
  if (typeof value !== 'string') return null
  const parsed = Number(value.replace(',', '.'))
  return Number.isFinite(parsed) ? parsed : null
}

function toDate(value) {
  if (typeof value !== 'string') return null
  const parsed = new Date(`${value}T00:00:00Z`)
  return Number.isNaN(parsed.getTime()) ? null : parsed
}

/**
 * Accept the weight the user typed, or null when it is not a plausible entry.
 * Bounds match the API contract (gt 0, le 500) and reject a stray extra digit.
 */
export function parseWeightInput(value) {
  const weight = toNumber(value)
  if (weight === null || weight <= 0 || weight > 500) return null
  return +weight.toFixed(2)
}

/** Sorted oldest-first, dropping rows that cannot be plotted or compared. */
export function normalizeHistory(weights) {
  if (!Array.isArray(weights)) return []
  return weights
    .map(row => {
      const kg = toNumber(row?.weight_kg)
      const date = toDate(row?.log_date)
      return kg !== null && kg > 0 && date ? { date: row.log_date, kg, at: date.getTime() } : null
    })
    .filter(Boolean)
    .sort((a, b) => a.at - b.at)
}

/**
 * Summarise the log for display.
 *
 * `sinceFirst` spans whatever the window holds, so it is only meaningful
 * alongside `spanDays`. `latestGapDays` exposes how stale the newest entry is —
 * a six-week-old weigh-in should not read as today's weight.
 */
export function weightTrend(weights, { today } = {}) {
  const history = normalizeHistory(weights)
  if (!history.length) {
    return { count: 0, latest: null, previous: null, change: null, sinceFirst: null, spanDays: null, latestGapDays: null }
  }
  const latest = history[history.length - 1]
  const previous = history.length > 1 ? history[history.length - 2] : null
  const first = history[0]
  const now = toDate(today)
  return {
    count: history.length,
    latest,
    previous,
    change: previous ? +(latest.kg - previous.kg).toFixed(2) : null,
    sinceFirst: history.length > 1 ? +(latest.kg - first.kg).toFixed(2) : null,
    spanDays: history.length > 1 ? Math.round((latest.at - first.at) / DAY_MS) : 0,
    latestGapDays: now ? Math.max(0, Math.round((now.getTime() - latest.at) / DAY_MS)) : null,
  }
}

/**
 * Points for a sparkline in a `width` x `height` box, oldest to newest.
 * X is spaced by real elapsed time so a six-week gap reads as a gap rather
 * than as an evenly spaced step. A flat or single-point series is centred.
 */
export function sparklinePoints(weights, width = 100, height = 30) {
  const history = normalizeHistory(weights)
  if (!history.length) return []
  if (history.length === 1) return [{ x: width / 2, y: height / 2, ...history[0] }]

  const times = history.map(p => p.at)
  const kgs = history.map(p => p.kg)
  const minAt = Math.min(...times)
  const spanMs = Math.max(1, Math.max(...times) - minAt)
  const minKg = Math.min(...kgs)
  const spanKg = Math.max(...kgs) - minKg

  return history.map(point => ({
    ...point,
    x: +(((point.at - minAt) / spanMs) * width).toFixed(2),
    // Higher weight sits higher on screen, so invert against SVG's y-down axis.
    y: +(spanKg === 0 ? height / 2 : height - ((point.kg - minKg) / spanKg) * height).toFixed(2),
  }))
}

/** `sparklinePoints` as an SVG polyline `points` attribute. */
export function sparklinePath(weights, width = 100, height = 30) {
  return sparklinePoints(weights, width, height).map(p => `${p.x},${p.y}`).join(' ')
}

/** "+0.4" / "−1.2" / "—" — signed for display, using a real minus sign. */
export function formatDelta(value) {
  if (typeof value !== 'number' || !Number.isFinite(value)) return '—'
  if (value === 0) return '0.0'
  return `${value > 0 ? '+' : '−'}${Math.abs(value).toFixed(1)}`
}
