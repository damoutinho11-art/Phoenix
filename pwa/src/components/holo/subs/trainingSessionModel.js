const SCORE_FIELDS = [
  'knee', 'ankle', 'hip', 'hamstring', 'calf_achilles', 'lower_back_pelvic',
]

const HYBRID_SEQUENCE = [
  'push_strength',
  'pull_strength',
  'lower_power',
  'push_volume',
  'pull_volume',
  'jump_elastic',
]

const HYBRID_LABELS = {
  push_strength: 'PUSH STRENGTH',
  pull_strength: 'PULL STRENGTH',
  lower_power: 'LOWER POWER',
  push_volume: 'PUSH VOLUME',
  pull_volume: 'PULL VOLUME',
  jump_elastic: 'JUMP / ELASTIC',
}


function exactHybridSessionEvidence(session, strict = false) {
  const values = [
    session?.session_intent,
    session?.sequence_position,
    session?.sequence_length,
  ]
  const absent = values.every(value => value === null || value === undefined)
  if (absent) return null

  const intent = session?.session_intent
  const position = session?.sequence_position
  const length = session?.sequence_length
  const valid = (
    HYBRID_SEQUENCE.includes(intent)
    && Number.isInteger(position)
    && position === HYBRID_SEQUENCE.indexOf(intent) + 1
    && length === HYBRID_SEQUENCE.length
  )
  if (!valid) {
    if (strict) throw new Error('Verified hybrid sequence evidence is required')
    return null
  }
  return {
    intent,
    label: HYBRID_LABELS[intent],
    position,
    length,
  }
}


export function formatHybridSessionIdentity(session) {
  const evidence = exactHybridSessionEvidence(session)
  if (!evidence) return null
  return {
    ...evidence,
    sequenceLabel: `SEQUENCE ${String(evidence.position).padStart(2, '0')} OF ${String(evidence.length).padStart(2, '0')}`,
  }
}


export function normalizePlanExercises(routed) {
  const exercises = routed?.session?.exercises
  if (!Array.isArray(exercises) || exercises.length === 0) return []

  const normalized = exercises.map(exercise => {
    const sets = exercise.sets
    const reps = exercise.reps
    if (!exercise.name || !Number.isInteger(sets) || sets < 1 || !Number.isInteger(reps) || reps < 1) {
      return null
    }
    const load = Number(exercise.load_kg ?? exercise.weight_kg)
    const rest = Number(exercise.rest_seconds)
    return {
      name: exercise.name,
      sets,
      reps,
      loadKg: Number.isFinite(load) && load >= 0 ? load : null,
      restSeconds: Number.isInteger(rest) && rest > 0 ? rest : 90,
    }
  })
  return normalized.some(exercise => exercise == null) ? [] : normalized
}


export function buildReadinessPayload(form) {
  const payload = {}
  for (const field of SCORE_FIELDS) {
    const score = Number(form[field])
    if (!Number.isInteger(score) || score < 0 || score > 10) {
      throw new Error(`${field} must be scored from 0 to 10`)
    }
    payload[field] = score
  }
  payload.sharp_pain = Boolean(form.sharp_pain)
  payload.limping = Boolean(form.limping)
  payload.next_day_worsening = Boolean(form.next_day_worsening)
  payload.note = String(form.note || '').trim() || null
  return payload
}


export function createSetResults(exercises) {
  return exercises.map(exercise => Array.from({ length: exercise.sets }, () => null))
}


export function recordSetResult(results, exerciseIndex, setIndex, { reps, weightKg }) {
  const actualReps = Number(reps)
  const actualWeight = Number(weightKg)
  if (!Number.isInteger(actualReps) || actualReps < 0) throw new Error('Actual reps must be a non-negative integer')
  if (!Number.isFinite(actualWeight) || actualWeight < 0) throw new Error('Actual load must be non-negative')
  if (!Array.isArray(results?.[exerciseIndex]) || setIndex < 0 || setIndex >= results[exerciseIndex].length) {
    throw new Error('Set result does not match the plan')
  }
  return results.map((sets, index) => (
    index === exerciseIndex
      ? sets.map((result, targetIndex) => targetIndex === setIndex ? { reps: actualReps, weightKg: actualWeight } : result)
      : sets
  ))
}


export function allSetResultsRecorded(exercises, results) {
  return Boolean(
    exercises.length
    && exercises.length === results?.length
    && exercises.every((exercise, index) => (
      results[index]?.length === exercise.sets
      && results[index].every(result => (
        Number.isInteger(result?.reps) && result.reps >= 0
        && Number.isFinite(result?.weightKg) && result.weightKg >= 0
      ))
    )),
  )
}


export function canCompleteSession({
  allSetsDone,
  rpe,
  painAnswered,
  painConfirmed = false,
  painBodyAreas = [],
}) {
  const score = Number(rpe)
  return Boolean(
    allSetsDone
    && Number.isInteger(score) && score >= 1 && score <= 10
    && painAnswered
    && (!painConfirmed || painBodyAreas.length > 0),
  )
}


export function buildCompletionPayload({
  routed,
  exercises,
  setResults,
  elapsedSeconds,
  rpe,
  painConfirmed,
  painBodyAreas,
  notes,
}) {
  const session = routed?.session
  const provenance = routed?.plan_provenance
  if (!session || !provenance || !exercises?.length || !allSetResultsRecorded(exercises, setResults)) {
    throw new Error('Verified plan session is required')
  }
  const hybrid = exactHybridSessionEvidence(session, true)
  return {
    date: session.date || provenance.date,
    session_type: session.session_type,
    exercises: exercises.map((exercise, exerciseIndex) => ({
      name: exercise.name,
      target_reps: exercise.reps,
      sets: setResults[exerciseIndex].map(result => ({
        reps: result.reps,
        weight_kg: result.weightKg,
        target_reps: exercise.reps,
      })),
    })),
    notes: String(notes || '').trim() || null,
    plan_id: provenance.plan_id,
    receipt_hash: provenance.receipt_hash,
    duration_seconds: Math.max(0, Math.round(Number(elapsedSeconds) || 0)),
    rpe: Number(rpe),
    pain_confirmed: Boolean(painConfirmed),
    pain_body_areas: painConfirmed ? painBodyAreas : [],
    session_intent: hybrid?.intent ?? null,
    sequence_position: hybrid?.position ?? null,
    sequence_length: hybrid?.length ?? null,
  }
}
