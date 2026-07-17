const WEEK_CELL_COUNT = 7

const isCompleteValidation = row => (
  row &&
  typeof row === 'object' &&
  !Array.isArray(row) &&
  typeof row.rule === 'string' &&
  row.rule.length > 0 &&
  typeof row.passed === 'boolean' &&
  ['hard', 'warning', 'info'].includes(row.severity) &&
  typeof row.detail === 'string'
)

const normalizedPlanId = value => typeof value === 'string' ? value.trim() : ''

const isIsoDate = value => {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false
  const parsed = new Date(`${value}T00:00:00Z`)
  return !Number.isNaN(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value
}

const addUtcDays = (value, days) => {
  const date = new Date(`${value}T00:00:00Z`)
  date.setUTCDate(date.getUTCDate() + days)
  return date.toISOString().slice(0, 10)
}

export function buildWeekSlots(plan) {
  const days = Array.isArray(plan?.days) ? plan.days : []
  const firstDatedDay = days.find(day => isIsoDate(day?.date))

  if (!firstDatedDay) {
    return Array.from({ length: WEEK_CELL_COUNT }, (_, index) => ({
      index,
      date: isIsoDate(days[index]?.date) ? days[index].date : '',
      day: days[index] || null,
    }))
  }

  const daysByDate = new Map(
    days
      .filter(day => isIsoDate(day?.date))
      .map(day => [day.date, day]),
  )

  return Array.from({ length: WEEK_CELL_COUNT }, (_, index) => {
    const date = addUtcDays(firstDatedDay.date, index)
    return {
      index,
      date,
      day: daysByDate.get(date) || null,
    }
  })
}

export function getValidationPresentation(validations) {
  const rows = Array.isArray(validations) ? validations : []
  const hasCompleteEvidence = rows.length > 0 && rows.every(isCompleteValidation)

  if (!hasCompleteEvidence) {
    return {
      tone: 'unverified',
      label: 'UNVERIFIED',
      passed: 0,
      total: rows.length,
      failures: 0,
    }
  }

  const failed = rows.filter(row => row?.passed !== true)
  const hasHardFailure = failed.some(row => row?.severity === 'hard')
  const tone = hasHardFailure ? 'blocked' : failed.length > 0 ? 'warning' : 'passed'

  return {
    tone,
    label: tone === 'blocked' ? 'BLOCKED' : tone === 'warning' ? 'WARNING' : 'VALIDATED',
    passed: rows.length - failed.length,
    total: rows.length,
    failures: failed.length,
  }
}

export function getLifecyclePresentation(plan, currentPlanId) {
  const status = typeof plan?.status === 'string' ? plan.status.toLowerCase() : 'unknown'
  const isCurrent = (
    status === 'active' &&
    normalizedPlanId(plan?.plan_id).length > 0 &&
    normalizedPlanId(plan?.plan_id) === normalizedPlanId(currentPlanId)
  )
  const successor = typeof plan?.superseded_by === 'string' && plan.superseded_by.trim()
    ? plan.superseded_by.trim()
    : null

  if (status === 'active') {
    if (!isCurrent) {
      return {
        status,
        statusLabel: 'ACTIVE',
        isCurrent: false,
        relationLabel: 'LIFECYCLE',
        relationText: 'ACTIVE PLAN',
        relationPlanId: null,
      }
    }

    return {
      status,
      statusLabel: 'ACTIVE // CURRENT',
      isCurrent: true,
      relationLabel: 'LINEAGE',
      relationText: 'CURRENT ACTIVE PLAN',
      relationPlanId: null,
    }
  }
  if (status === 'proposed') {
    return {
      status,
      statusLabel: 'PROPOSED',
      isCurrent: false,
      relationLabel: 'LIFECYCLE',
      relationText: 'AWAITING DECISION',
      relationPlanId: null,
    }
  }
  if (status === 'rejected' || status === 'completed') {
    return {
      status,
      statusLabel: status.toUpperCase(),
      isCurrent: false,
      relationLabel: 'LIFECYCLE',
      relationText: `${status.toUpperCase()} // TERMINAL`,
      relationPlanId: null,
    }
  }
  if (status === 'superseded') {
    return {
      status,
      statusLabel: 'SUPERSEDED',
      isCurrent: false,
      relationLabel: 'SUPERSEDED BY',
      relationText: successor || 'SUCCESSOR NOT RECORDED',
      relationPlanId: successor,
    }
  }

  return {
    status: 'unknown',
    statusLabel: 'UNKNOWN',
    isCurrent: false,
    relationLabel: 'LIFECYCLE',
    relationText: 'STATUS NOT RECORDED',
    relationPlanId: null,
  }
}

export function getTrainingViewState({ loading = false, error = '', hasData = false } = {}) {
  if (loading) return { kind: 'loading', className: 'training-plan-loading', role: 'status' }
  if (error) return { kind: 'error', className: 'training-plan-error', role: 'alert' }
  if (!hasData) return { kind: 'empty', className: 'training-empty-state', role: 'status' }
  return { kind: 'ready', className: '', role: null }
}

export function getNextModalFocus(focusables, activeElement, reverse = false) {
  const elements = Array.from(focusables || []).filter(Boolean)
  if (elements.length === 0) return null

  const activeIndex = elements.indexOf(activeElement)
  if (activeIndex === -1) return reverse ? elements[elements.length - 1] : elements[0]

  const direction = reverse ? -1 : 1
  const nextIndex = (activeIndex + direction + elements.length) % elements.length
  return elements[nextIndex]
}

export { WEEK_CELL_COUNT }
