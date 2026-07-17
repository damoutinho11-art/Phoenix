import { normalizeTrainingPlan } from './trainingPlannerViewModel.js'

const isRecord = value => Boolean(value) && typeof value === 'object' && !Array.isArray(value)
const asArray = value => Array.isArray(value) ? value : []
const hasOwn = (value, key) => Object.prototype.hasOwnProperty.call(value, key)
const hasText = value => typeof value === 'string' && value.trim().length > 0
const isPlanId = value => hasText(value) && value === value.trim()
const isOptionalText = value => value === undefined || value === null || typeof value === 'string'

const labelize = value => String(value || '')
  .replaceAll('_', ' ')
  .replaceAll('-', ' ')
  .toUpperCase()

const isIsoDate = value => {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false
  const parsed = new Date(`${value}T00:00:00.000Z`)
  return !Number.isNaN(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value
}

const sameValue = (left, right) => {
  if (Object.is(left, right)) return true
  if (Array.isArray(left) && Array.isArray(right)) {
    return left.length === right.length && left.every((value, index) => sameValue(value, right[index]))
  }
  if (isRecord(left) && isRecord(right)) {
    const leftKeys = Object.keys(left).sort()
    const rightKeys = Object.keys(right).sort()
    return leftKeys.length === rightKeys.length && leftKeys.every((key, index) => (
      key === rightKeys[index] && sameValue(left[key], right[key])
    ))
  }
  return false
}

export const isUsableTrainingValidation = row => (
  isRecord(row) &&
  hasText(row.rule) &&
  typeof row.passed === 'boolean' &&
  ['hard', 'warning', 'info'].includes(row.severity) &&
  typeof row.detail === 'string'
)

const hasRequiredDate = (values, field) => hasOwn(values, field) && isIsoDate(values[field])
const hasOptionalDate = (values, field) => !hasOwn(values, field) || isIsoDate(values[field])
const hasRequiredText = (values, field) => hasOwn(values, field) && hasText(values[field])

export const isUsableTrainingConstraint = row => {
  if (
    !isRecord(row) ||
    !['user', 'phoenix', 'safety'].includes(row.source) ||
    !isRecord(row.values)
  ) return false

  const { values } = row
  switch (row.kind) {
    case 'unavailable':
    case 'skip_session':
      return hasRequiredDate(values, 'date')
    case 'move_session':
      return hasRequiredDate(values, 'source_date') && hasRequiredDate(values, 'target_date')
    case 'replace_exercise':
      return hasRequiredDate(values, 'date') && hasRequiredText(values, 'from') && hasRequiredText(values, 'to')
    case 'time_limit':
      return hasRequiredDate(values, 'date') && Number.isInteger(values.minutes) && values.minutes >= 15 && values.minutes <= 180
    case 'equipment_available':
      return hasOptionalDate(values, 'date') && Array.isArray(values.equipment) && values.equipment.length > 0 && values.equipment.every(hasText)
    case 'exercise_preference':
      return hasOptionalDate(values, 'date') && hasRequiredText(values, 'exercise') && ['avoid', 'prefer'].includes(values.avoid_or_prefer)
    default:
      return false
  }
}

const hasUsableExercises = exercises => (
  Array.isArray(exercises) &&
  exercises.every(exercise => isRecord(exercise) && hasText(exercise.name))
)

export const isUsableTrainingPlanDay = day => (
  isRecord(day) &&
  isIsoDate(day.date) &&
  hasText(day.session_type) &&
  hasText(day.objective) &&
  hasUsableExercises(day.exercises) &&
  Number.isFinite(day.estimated_minutes) &&
  isOptionalText(day.change_reason)
)

const hasUniqueDayDates = days => new Set(days.map(day => day.date)).size === days.length
const isUsablePlanEvidence = (plan, expectedStatus) => (
  isRecord(plan) &&
  isPlanId(plan.plan_id) &&
  plan.status === expectedStatus &&
  Array.isArray(plan.days) && plan.days.length > 0 && plan.days.every(isUsableTrainingPlanDay) && hasUniqueDayDates(plan.days) &&
  Array.isArray(plan.validations) && plan.validations.length > 0 && plan.validations.every(isUsableTrainingValidation) &&
  Array.isArray(plan.constraints) && plan.constraints.length > 0 && plan.constraints.every(isUsableTrainingConstraint)
)

const dayMap = plan => new Map(asArray(plan?.days).map(day => [day.date, day]))

const isUsableChangedDay = row => (
  isRecord(row) &&
  isIsoDate(row.date) &&
  isOptionalText(row.reason) &&
  (row.before === null || isUsableTrainingPlanDay(row.before)) &&
  (row.after === null || isUsableTrainingPlanDay(row.after)) &&
  (row.before !== null || row.after !== null) &&
  (row.before === null || row.before.date === row.date) &&
  (row.after === null || row.after.date === row.date)
)

const reconcilesChangedDays = (rows, before, after) => {
  if (!Array.isArray(rows) || rows.length === 0) return false
  const afterDays = asArray(after?.days)
  const beforeDays = before === null ? [] : asArray(before?.days)
  if (afterDays.length === 0 || !afterDays.every(isUsableTrainingPlanDay)) return false
  if (before !== null && !beforeDays.every(isUsableTrainingPlanDay)) return false
  if (!rows.every(isUsableChangedDay)) return false

  const prior = dayMap(before)
  const next = dayMap(after)
  const expectedDates = [...new Set([...prior.keys(), ...next.keys()])]
    .filter(date => !sameValue(prior.get(date) || null, next.get(date) || null))
    .sort()
  const receivedDates = rows.map(row => row.date).sort()
  if (new Set(receivedDates).size !== receivedDates.length) return false
  if (!sameValue(receivedDates, expectedDates)) return false

  return rows.every(row => (
    sameValue(row.before, prior.get(row.date) || null) &&
    sameValue(row.after, next.get(row.date) || null)
  ))
}

const matchesAuthoritativeAfter = (proposal, after) => (
  isUsablePlanEvidence(proposal, 'proposed') &&
  isUsablePlanEvidence(after, 'proposed') &&
  proposal.plan_id === after.plan_id &&
  sameValue(proposal.days, after.days) &&
  sameValue(proposal.validations, after.validations) &&
  sameValue(proposal.constraints, after.constraints)
)

export function normalizeTrainingAdaptProposal(raw) {
  const source = isRecord(raw) ? raw : {}
  const proposal = normalizeTrainingPlan(source)
  const before = source.before === null
    ? null
    : isRecord(source.before)
      ? normalizeTrainingPlan(source.before)
      : undefined
  const after = isRecord(source.after) ? normalizeTrainingPlan(source.after) : undefined
  const rawValidations = asArray(source.validations)
  const rawConstraints = asArray(source.interpreted_constraints)
  const rawChangedDays = asArray(source.diff?.changed_days)
  const snapshotEvidenceComplete = after !== undefined && matchesAuthoritativeAfter(source, source.after)
  const validationEvidenceComplete = snapshotEvidenceComplete && rawValidations.length > 0 && rawValidations.every(isUsableTrainingValidation)
  const constraintEvidenceComplete = (
    snapshotEvidenceComplete &&
    rawConstraints.length > 0 &&
    rawConstraints.every(isUsableTrainingConstraint) &&
    sameValue(rawConstraints, source.after.constraints)
  )
  const diffEvidenceComplete = (
    snapshotEvidenceComplete &&
    hasOwn(source, 'before') &&
    before !== undefined &&
    reconcilesChangedDays(rawChangedDays, before, after)
  )

  return {
    ...proposal,
    plan_id: isPlanId(source.plan_id) ? source.plan_id : '',
    parent_plan_id: isOptionalText(source.parent_plan_id) ? source.parent_plan_id : null,
    before: before === undefined ? null : before,
    after: snapshotEvidenceComplete ? after : null,
    validations: validationEvidenceComplete ? rawValidations : [],
    validationEvidenceComplete,
    interpreted_constraints: constraintEvidenceComplete ? rawConstraints : [],
    constraintEvidenceComplete,
    changedDays: diffEvidenceComplete ? rawChangedDays : [],
    diffEvidenceComplete,
    canApply: proposal.canApply && snapshotEvidenceComplete && validationEvidenceComplete && constraintEvidenceComplete && diffEvidenceComplete,
  }
}

export function getAdaptValidationTone(validations, complete = true) {
  const rows = asArray(validations)
  if (!complete || rows.length === 0 || !rows.every(isUsableTrainingValidation)) return 'unverified'
  if (rows.some(row => row.severity === 'hard' && !row.passed)) return 'blocked'
  if (rows.some(row => !row.passed)) return 'warning'
  return 'passed'
}

export const getProposalRequestState = () => ({ proposal: null, busy: true, error: '' })

export function getProposalLifecycleState(action, success, proposal) {
  if (!success) return { proposal, focusTarget: null }
  return { proposal: null, focusTarget: action === 'apply' ? 'week' : 'adapt' }
}

export function getAppliedTrainingPlanOutcome(raw, proposal) {
  const valid = isUsablePlanEvidence(raw, 'active') && isPlanId(proposal?.plan_id) && raw.plan_id === proposal.plan_id
  return { plan: valid ? raw : null, valid }
}

export function describeTrainingPlanDay(day) {
  if (!isUsableTrainingPlanDay(day)) return 'NO SESSION DETAILS'
  const exercises = day.exercises.map(exercise => labelize(exercise.name)).join(', ')
  return `${labelize(day.objective)} // ${day.estimated_minutes} MIN // EXERCISES: ${exercises || 'NONE'}`
}
