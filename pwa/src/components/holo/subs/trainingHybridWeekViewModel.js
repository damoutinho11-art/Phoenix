const HYBRID_LABELS = Object.freeze({
  push_strength: 'PUSH A',
  pull_strength: 'PULL A',
  lower_power: 'LOWER POWER',
  push_volume: 'PUSH B',
  pull_volume: 'PULL B',
  jump_elastic: 'JUMP / ELASTIC',
})

const HYBRID_SEQUENCE = Object.freeze(Object.keys(HYBRID_LABELS))

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

const normalizeChangeReason = value => (
  typeof value === 'string' && value.trim() ? value.trim() : null
)

const decisionLabel = code => (
  DECISION_LABELS[code] ||
  code.replaceAll(':', ' ').replaceAll('_', ' ').toUpperCase()
)

const lifecycleFor = (day, date, todayIso) => {
  if (['recovery', 'rest'].includes(day.session_type)) return 'recovery'
  if (date === todayIso) return 'today'
  if (isIsoDate(todayIso) && date < todayIso) return 'complete'
  return 'queued'
}

const emptyPresentation = () => ({
  slots: [],
  today: null,
  decisions: [],
  sequenceMode: null,
  counts: { training: 0, recovery: 0, routed: 0 },
})

const reasonEvidence = day => {
  if (day.decision_reasons === undefined) return []
  if (
    !Array.isArray(day.decision_reasons) ||
    day.decision_reasons.some(reason => typeof reason !== 'string')
  ) {
    return null
  }
  return day.decision_reasons.map(reason => reason.trim()).filter(Boolean)
}

const isRecoveryDay = day => (
  ['recovery', 'rest'].includes(day.session_type) &&
  (day.session_intent === null || day.session_intent === undefined) &&
  (day.sequence_position === null || day.sequence_position === undefined) &&
  (day.sequence_length === null || day.sequence_length === undefined)
)

const isRoutedRecoveryDay = day => (
  ['recovery', 'rest'].includes(day.session_type) &&
  normalizeIntent(day.session_intent) !== null
)

const followsCycle = positions => positions.every((position, index) => (
  index === 0 || position === positions[index - 1] % HYBRID_SEQUENCE.length + 1
))

const phaseExceptionMode = orderedDays => {
  const phaseRecovery = orderedDays.filter(day => (
    isRecoveryDay(day) &&
    ['peak', 'attempt'].some(phase => (
      reasonEvidence(day)?.includes(`phase_lower_removed:${phase}`)
    ))
  ))
  if (phaseRecovery.length !== 1) return null

  const reasons = reasonEvidence(phaseRecovery[0])
  const phase = reasons.includes('phase_lower_removed:peak') ? 'peak' : 'attempt'
  const projectedPositions = orderedDays
    .filter(day => !isRecoveryDay(day) || day === phaseRecovery[0])
    .map(day => day === phaseRecovery[0] ? 3 : day.sequence_position)
  if (
    projectedPositions.length !== HYBRID_SEQUENCE.length ||
    new Set(projectedPositions).size !== HYBRID_SEQUENCE.length ||
    !followsCycle(projectedPositions)
  ) {
    return null
  }

  const sessions = orderedDays.filter(day => normalizeIntent(day.session_intent))
  const upperReasonsAreComplete = sessions
    .filter(day => [1, 2, 4, 5].includes(day.sequence_position))
    .every(day => reasonEvidence(day)?.includes(`phase_maintenance:${phase}`))
  const jump = sessions.find(day => day.sequence_position === 6)
  const jumpReason = phase === 'peak'
    ? 'phase_jump_volume_limited:peak'
    : 'phase_attempt_exposure'

  return upperReasonsAreComplete && reasonEvidence(jump)?.includes(jumpReason) ? phase : null
}

const hybridSequenceMode = orderedDays => {
  for (const day of orderedDays) {
    const intent = normalizeIntent(day.session_intent)
    if (intent) {
      const expectedPosition = HYBRID_SEQUENCE.indexOf(intent) + 1
      if (day.sequence_position !== expectedPosition || day.sequence_length !== 6) return null
      if (
        isRoutedRecoveryDay(day) &&
        (
          normalizeChangeReason(day.change_reason) === null ||
          (Array.isArray(day.exercises) && day.exercises.length > 0) ||
          day.estimated_minutes !== 0
        )
      ) {
        return null
      }
    } else if (!isRecoveryDay(day)) {
      return null
    }
  }

  const sessions = orderedDays.filter(day => normalizeIntent(day.session_intent))
  const recoveries = orderedDays.filter(isRecoveryDay)
  const positions = sessions.map(day => day.sequence_position)
  if (
    sessions.length === 6 &&
    recoveries.length === 1 &&
    new Set(positions).size === 6 &&
    followsCycle(positions)
  ) {
    return sessions.some(isRoutedRecoveryDay) ? 'routed' : 'ordinary'
  }
  if (
    sessions.length === 5 &&
    recoveries.length === 2 &&
    new Set(positions).size === 5 &&
    !positions.includes(3)
  ) {
    return phaseExceptionMode(orderedDays)
  }
  return null
}

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

  const orderedDays = [...days].sort((left, right) => left.date.localeCompare(right.date))
  const hasMalformedReasonEvidence = orderedDays.some(day => reasonEvidence(day) === null)
  const sequenceMode = plan?.planner_version === 'adaptive-v2'
    ? hybridSequenceMode(orderedDays)
    : 'legacy'
  if (plan?.planner_version === 'adaptive-v2' && sequenceMode === null) {
    return emptyPresentation()
  }

  const slots = orderedDays
    .map(day => {
      const intent = normalizeIntent(day.session_intent)
      const lifecycle = lifecycleFor(day, day.date, todayIso)
      const routed = isRoutedRecoveryDay(day)
      const sequencePosition = Number.isInteger(day.sequence_position) &&
        day.sequence_position >= 1 &&
        day.sequence_position <= 6
        ? day.sequence_position
        : null
      const sequenceLength = day.sequence_length === 6 ? 6 : null

      return {
        date: day.date,
        lifecycle,
        intent,
        label: intent ? HYBRID_LABELS[intent] : null,
        durationMinutes: Number.isFinite(day.estimated_minutes) && day.estimated_minutes >= 0
          ? day.estimated_minutes
          : null,
        sequencePosition,
        sequenceLength,
        highNeural: lifecycle !== 'recovery' && day.high_neural === true,
        exercises: normalizeExercises(day.exercises),
        decisionReasons: hasMalformedReasonEvidence ? [] : normalizeReasons(day.decision_reasons),
        changeReason: hasMalformedReasonEvidence ? null : normalizeChangeReason(day.change_reason),
        routed,
      }
    })

  const decisions = []
  const seenReasons = new Set()
  for (const slot of hasMalformedReasonEvidence ? [] : slots) {
    for (const code of [
      ...slot.decisionReasons,
      ...(slot.changeReason ? [slot.changeReason] : []),
    ]) {
      if (seenReasons.has(code)) continue
      seenReasons.add(code)
      decisions.push({ code, label: decisionLabel(code) })
    }
  }

  const recoveryCount = slots.filter(slot => slot.lifecycle === 'recovery').length
  const routedCount = slots.filter(slot => slot.routed).length
  return {
    slots,
    today: slots.find(slot => slot.date === todayIso) || null,
    decisions,
    sequenceMode,
    counts: {
      training: slots.length - recoveryCount,
      recovery: recoveryCount,
      routed: routedCount,
    },
  }
}

export { HYBRID_LABELS }
