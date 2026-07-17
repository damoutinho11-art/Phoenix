export function normalizeTrainingPlan(raw = {}) {
  const plan = raw && typeof raw === 'object' && !Array.isArray(raw) ? raw : {}
  const validations = Array.isArray(plan.validations) ? plan.validations : []
  const hardFailures = validations.filter(row => row?.severity === 'hard' && row?.passed === false)
  const days = Array.isArray(plan.days) ? [...plan.days] : []

  return {
    ...plan,
    days: days.sort((a, b) => String(a?.date).localeCompare(String(b?.date))),
    validations,
    hardFailures,
    canApply: plan.status === 'proposed' && hardFailures.length === 0,
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

  return {
    changedDays: nextDays.filter(day => JSON.stringify(prior.get(day?.date) || null) !== JSON.stringify(day)),
  }
}
