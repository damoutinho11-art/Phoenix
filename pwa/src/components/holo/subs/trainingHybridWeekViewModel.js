const HYBRID_LABELS = Object.freeze({
  push_strength: 'PUSH A',
  pull_strength: 'PULL A',
  lower_power: 'LOWER POWER',
  push_volume: 'PUSH B',
  pull_volume: 'PULL B',
  jump_elastic: 'JUMP / ELASTIC',
})

const DECISION_LABELS = Object.freeze({
  'recovery_placed:lower_spacing': 'LOWER-BODY SPACING',
  'recovery_placed:calendar': 'CALENDAR FIT',
  'recovery_placed:fatigue': 'RECOVERY EVIDENCE',
  'recovery_placed:default': 'DEFAULT RECOVERY',
})

const isRecord = value => (
  value !== null &&
  typeof value === 'object' &&
  !Array.isArray(value)
)

const isIsoDate = value => {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false
  const parsed = new Date(`${value}T00:00:00Z`)
  return !Number.isNaN(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value
}

const normalizeIntent = value => (
  typeof value === 'string' && Object.hasOwn(HYBRID_LABELS, value) ? value : null
)

const normalizeExercises = value => (
  Array.isArray(value) ? value.filter(isRecord).map(exercise => ({ ...exercise })) : []
)

const normalizeReasons = value => (
  Array.isArray(value)
    ? value.filter(reason => typeof reason === 'string' && reason.trim()).map(reason => reason.trim())
    : []
)

const decisionLabel = code => (
  DECISION_LABELS[code] ||
  code.replaceAll(':', ' ').replaceAll('_', ' ').toUpperCase()
)

const lifecycleFor = (day, date, todayIso) => {
  if (date === todayIso) return 'today'
  if (day.session_type === 'recovery' && normalizeIntent(day.session_intent) === null) {
    return 'recovery'
  }
  if (isIsoDate(todayIso) && date < todayIso) return 'complete'
  return 'queued'
}

const emptyPresentation = () => ({
  slots: [],
  today: null,
  decisions: [],
})

export function buildHybridWeekPresentation(plan, todayIso) {
  const days = Array.isArray(plan?.days) ? plan.days : []
  const dates = days
    .map(day => day?.date)
    .filter(isIsoDate)
    .sort()
  const isConsecutiveHorizon = dates.every((date, index) => (
    index === 0 ||
    new Date(`${date}T00:00:00Z`).getTime() -
      new Date(`${dates[index - 1]}T00:00:00Z`).getTime() === 86_400_000
  ))
  if (
    days.length !== 7 ||
    days.some(day => !isRecord(day) || !isIsoDate(day.date)) ||
    new Set(days.map(day => day.date)).size !== 7 ||
    !isConsecutiveHorizon
  ) {
    return emptyPresentation()
  }

  const hasMalformedReasonEvidence = days.some(day => (
    day.decision_reasons !== undefined &&
    (
      !Array.isArray(day.decision_reasons) ||
      day.decision_reasons.some(reason => typeof reason !== 'string')
    )
  ))
  const slots = [...days]
    .sort((left, right) => left.date.localeCompare(right.date))
    .map(day => {
      const intent = normalizeIntent(day.session_intent)
      const sequencePosition = Number.isInteger(day.sequence_position) &&
        day.sequence_position >= 1 &&
        day.sequence_position <= 6
        ? day.sequence_position
        : null
      const sequenceLength = day.sequence_length === 6 ? 6 : null

      return {
        date: day.date,
        lifecycle: lifecycleFor(day, day.date, todayIso),
        intent,
        label: intent ? HYBRID_LABELS[intent] : null,
        durationMinutes: Number.isFinite(day.estimated_minutes) && day.estimated_minutes >= 0
          ? day.estimated_minutes
          : null,
        sequencePosition,
        sequenceLength,
        highNeural: day.high_neural === true,
        exercises: normalizeExercises(day.exercises),
        decisionReasons: normalizeReasons(day.decision_reasons),
      }
    })

  const decisions = []
  const seenReasons = new Set()
  for (const slot of hasMalformedReasonEvidence ? [] : slots) {
    for (const code of slot.decisionReasons) {
      if (seenReasons.has(code)) continue
      seenReasons.add(code)
      decisions.push({ code, label: decisionLabel(code) })
    }
  }

  return {
    slots,
    today: slots.find(slot => slot.date === todayIso) || null,
    decisions,
  }
}

export { HYBRID_LABELS }
