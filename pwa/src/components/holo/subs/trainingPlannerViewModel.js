const isPlanValidation = row => (
  row &&
  typeof row === 'object' &&
  !Array.isArray(row) &&
  typeof row.rule === 'string' &&
  row.rule.length > 0 &&
  typeof row.passed === 'boolean' &&
  ['hard', 'warning', 'info'].includes(row.severity) &&
  typeof row.detail === 'string'
)

export function normalizeTrainingPlan(raw = {}) {
  const plan = raw && typeof raw === 'object' && !Array.isArray(raw) ? raw : {}
  const validations = Array.isArray(plan.validations) ? plan.validations : []
  const hasCompleteValidations = validations.length > 0 && validations.every(isPlanValidation)
  const hardFailures = validations.filter(row => row?.severity === 'hard' && row?.passed === false)
  const days = Array.isArray(plan.days) ? [...plan.days] : []
  const planId = typeof plan.plan_id === 'string' ? plan.plan_id.trim() : plan.plan_id

  return {
    ...plan,
    plan_id: planId,
    days: days.sort((a, b) => String(a?.date).localeCompare(String(b?.date))),
    validations,
    hardFailures,
    canApply: plan.status === 'proposed' && typeof planId === 'string' && planId.length > 0 && hasCompleteValidations && hardFailures.length === 0,
  }
}

export const planTone = plan => plan?.hardFailures?.length
  ? 'blocked'
  : plan?.status === 'active'
    ? 'active'
    : 'proposal'

export function buildPlanDiff(before = {}, after = {}) {
  const priorDays = Array.isArray(before?.days) ? before.days : []
  const nextDays = Array.isArray(after?.days) ? after.days : []
  const prior = new Map(priorDays.map(day => [day?.date, day]))
  const next = new Map(nextDays.map(day => [day?.date, day]))

  return {
    changedDays: [
      ...nextDays.filter(day => JSON.stringify(prior.get(day?.date) || null) !== JSON.stringify(day)),
      ...priorDays
        .filter(day => !next.has(day?.date))
        .map(day => ({ ...day, removed: true })),
    ],
  }
}
