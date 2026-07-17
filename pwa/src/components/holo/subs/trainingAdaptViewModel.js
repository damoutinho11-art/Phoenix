import { normalizeTrainingPlan } from './trainingPlannerViewModel.js'

const isRecord = value => Boolean(value) && typeof value === 'object' && !Array.isArray(value)
const asArray = value => Array.isArray(value) ? value : []

const labelize = value => String(value || '')
  .replaceAll('_', ' ')
  .replaceAll('-', ' ')
  .toUpperCase()

const isIsoDate = value => (
  typeof value === 'string' &&
  /^\d{4}-\d{2}-\d{2}$/.test(value) &&
  !Number.isNaN(new Date(`${value}T00:00:00Z`).getTime())
)

export const isUsableTrainingValidation = row => (
  isRecord(row) &&
  typeof row.rule === 'string' && row.rule.trim().length > 0 &&
  typeof row.passed === 'boolean' &&
  ['hard', 'warning', 'info'].includes(row.severity) &&
  typeof row.detail === 'string'
)

export const isUsableTrainingConstraint = row => (
  isRecord(row) &&
  typeof row.kind === 'string' && row.kind.trim().length > 0 &&
  ['user', 'phoenix', 'safety'].includes(row.source) &&
  isRecord(row.values) &&
  Object.keys(row.values).length > 0
)

const hasUsableExercises = exercises => (
  Array.isArray(exercises) &&
  exercises.every(exercise => isRecord(exercise) && typeof exercise.name === 'string' && exercise.name.trim().length > 0)
)

export const isUsableTrainingPlanDay = day => (
  isRecord(day) &&
  isIsoDate(day.date) &&
  typeof day.session_type === 'string' && day.session_type.trim().length > 0 &&
  typeof day.objective === 'string' && day.objective.trim().length > 0 &&
  hasUsableExercises(day.exercises) &&
  Number.isFinite(day.estimated_minutes)
)

const sameDay = (left, right) => JSON.stringify(left) === JSON.stringify(right)
const dayMap = plan => new Map(asArray(plan?.days).map(day => [day.date, day]))

const isUsableChangedDay = row => (
  isRecord(row) &&
  isIsoDate(row.date) &&
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
    .filter(date => !sameDay(prior.get(date) || null, next.get(date) || null))
    .sort()
  const receivedDates = rows.map(row => row.date).sort()
  if (new Set(receivedDates).size !== receivedDates.length) return false
  if (JSON.stringify(receivedDates) !== JSON.stringify(expectedDates)) return false

  return rows.every(row => (
    sameDay(row.before, prior.get(row.date) || null) &&
    sameDay(row.after, next.get(row.date) || null)
  ))
}

export function normalizeTrainingAdaptProposal(raw) {
  const proposal = normalizeTrainingPlan(raw)
  const hasBefore = Object.prototype.hasOwnProperty.call(raw || {}, 'before')
  const before = raw?.before === null
    ? null
    : isRecord(raw?.before)
      ? normalizeTrainingPlan(raw.before)
      : undefined
  const after = isRecord(raw?.after) ? normalizeTrainingPlan(raw.after) : undefined
  const rawValidations = asArray(raw?.validations)
  const validationEvidenceComplete = rawValidations.length > 0 && rawValidations.every(isUsableTrainingValidation)
  const rawConstraints = asArray(raw?.interpreted_constraints)
  const constraintEvidenceComplete = rawConstraints.length > 0 && rawConstraints.every(isUsableTrainingConstraint)
  const rawChangedDays = asArray(raw?.diff?.changed_days)
  const diffEvidenceComplete = hasBefore && after !== undefined && before !== undefined && reconcilesChangedDays(rawChangedDays, before, after)

  return {
    ...proposal,
    before: before === undefined ? null : before,
    after: after || null,
    validations: rawValidations.filter(isUsableTrainingValidation),
    validationEvidenceComplete,
    interpreted_constraints: rawConstraints.filter(isUsableTrainingConstraint),
    constraintEvidenceComplete,
    changedDays: rawChangedDays.filter(isUsableChangedDay),
    diffEvidenceComplete,
    canApply: proposal.canApply && validationEvidenceComplete && constraintEvidenceComplete && diffEvidenceComplete,
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

export function describeTrainingPlanDay(day) {
  if (!isUsableTrainingPlanDay(day)) return 'NO SESSION DETAILS'
  const exercises = day.exercises.map(exercise => labelize(exercise.name)).join(', ')
  return `${labelize(day.objective)} // ${day.estimated_minutes} MIN // EXERCISES: ${exercises || 'NONE'}`
}
