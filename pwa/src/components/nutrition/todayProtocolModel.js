function finiteNumber(value) {
  if (typeof value === 'number') return Number.isFinite(value) ? value : null
  if (typeof value === 'string' && value.trim()) {
    const parsed = Number(value)
    return Number.isFinite(parsed) ? parsed : null
  }
  return null
}

function formatNumber(value) {
  const number = finiteNumber(value)
  if (number === null) return null
  return Number.isInteger(number) ? String(number) : String(Number(number.toFixed(1)))
}

function normalizeMeasurementState(value) {
  if (typeof value !== 'string') return null
  const state = value.replace(/_/g, ' ').trim()
  return state || null
}

function normalizeItem(item = {}) {
  const quantity = formatNumber(item.quantity_g)
  const unitCount = formatNumber(item.unit_count)
  const measurementState = normalizeMeasurementState(item.measurement_state)
  const verified = quantity !== null && measurementState !== null

  return {
    ...item,
    quantityLabel: verified ? `${quantity} g${unitCount !== null ? ` · ${unitCount} UNIT` : ''} · ${measurementState}` : 'MEASUREMENT UNVERIFIED',
    sourceLabel: item.is_estimate ? 'GENERIC ESTIMATE' : 'PRODUCT LABEL',
    measurementVerified: verified,
  }
}

function normalizeMacroRow(source) {
  if (!source || typeof source !== 'object') return {}
  return Object.fromEntries(
    Object.entries(source).filter(([, value]) => finiteNumber(value) !== null)
  )
}

export function buildTodayProtocolModel(raw = {}) {
  const meals = Array.isArray(raw.meals)
    ? raw.meals.map(meal => ({
      ...meal,
      items: Array.isArray(meal?.items) ? meal.items.map(normalizeItem) : [],
      total: normalizeMacroRow(meal?.total),
    }))
    : []
  const measurementsVerified = meals.every(meal => meal.items.every(item => item.measurementVerified))

  return {
    protocolId: typeof raw.protocol_id === 'string' ? raw.protocol_id : null,
    target: normalizeMacroRow(raw.target),
    targetGap: normalizeMacroRow(raw.target_gap),
    remainingTarget: normalizeMacroRow(raw.remaining_target),
    meals,
    measurementsVerified,
    targetMatched: raw.target_matched === true && measurementsVerified,
  }
}
