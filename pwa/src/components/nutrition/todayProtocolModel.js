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

function safeHttpsUrl(value) {
  if (typeof value !== 'string') return null
  try {
    const url = new URL(value)
    return url.protocol === 'https:' ? url.href : null
  } catch {
    return null
  }
}

function sourceLabel(item) {
  if (item.label_state === 'reference_estimate') return 'REFERENCE ESTIMATE'
  if (item.label_state === 'inventory_estimate') return 'INVENTORY ESTIMATE'
  return item.is_estimate ? 'REFERENCE ESTIMATE' : 'PRODUCT LABEL'
}

function sourceLinks(item) {
  const nutritionUrl = safeHttpsUrl(item.source_url)
  const fibreUrl = safeHttpsUrl(item.fibre_source_url)
  if (nutritionUrl && fibreUrl === nutritionUrl) {
    return [{ label: 'NUTRITION & FIBRE SOURCE', href: nutritionUrl }]
  }
  return [
    nutritionUrl && { label: 'NUTRITION SOURCE', href: nutritionUrl },
    fibreUrl && { label: 'FIBRE SOURCE', href: fibreUrl },
  ].filter(Boolean)
}

function normalizeItem(item = {}) {
  const quantity = formatNumber(item.quantity_g)
  const unitCount = formatNumber(item.unit_count)
  const measurementState = normalizeMeasurementState(item.measurement_state)
  const verified = quantity !== null && measurementState !== null && measurementState.toLowerCase() !== 'unknown'

  return {
    ...item,
    quantityLabel: verified ? `${quantity} g${unitCount !== null ? ` · ${unitCount} UNIT` : ''} · ${measurementState}` : 'MEASUREMENT UNVERIFIED',
    sourceLabel: sourceLabel(item),
    sourceLinks: sourceLinks(item),
    measurementVerified: verified,
  }
}

function fibreLabel(meal) {
  const amount = formatNumber(meal?.total?.fibre_g)
  if (amount === null) return 'FIBRE UNAVAILABLE'
  const hasUnknownFibre = !Array.isArray(meal?.items) || meal.items.some(item => item?.fibre_known !== true)
  return hasUnknownFibre ? `AT LEAST ${amount} G FIBRE` : `${amount} G FIBRE (EST.)`
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
      fibreLabel: fibreLabel(meal),
    }))
    : []
  const measurementsVerified = meals.every(meal => meal.items.every(item => item.measurementVerified))

  return {
    protocolId: typeof raw.protocol_id === 'string' ? raw.protocol_id : null,
    target: normalizeMacroRow(raw.target),
    targetGap: normalizeMacroRow(raw.target_gap),
    remainingTarget: normalizeMacroRow(raw.remaining_target),
    plannedTotal: normalizeMacroRow(raw.planned_total),
    nutritionBasis: raw.nutrition_basis === 'labelled' ? 'labelled' : 'estimated',
    fibreComplete: raw.fibre_complete === true,
    meals,
    measurementsVerified,
    targetMatched: raw.target_matched === true && measurementsVerified,
  }
}
