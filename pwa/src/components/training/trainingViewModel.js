export function routeFallback(route) {
  return route || {
    readiness_status: 'unchecked',
    readiness_required: true,
    high_neural_allowed: false,
    capacity_blocks: [],
    substitutions: [],
    safety_note: 'Complete the readiness scan before high-neural work.',
  }
}

export function canStartHighNeural(route) {
  const current = routeFallback(route)
  if (current.high_neural_allowed === false) return false
  if (!current.readiness_required) return true
  return current.readiness_status !== 'unchecked' && current.readiness_status !== 'recovery_only'
}

export function readinessLabel(status) {
  return {
    clear: 'CLEAR',
    caution: 'CAUTION',
    regress: 'REGRESS',
    recovery_only: 'RECOVERY ONLY',
    unchecked: 'SCAN REQUIRED',
  }[status] || 'SCAN REQUIRED'
}

export function readinessTone(status) {
  if (status === 'clear') return 'ready'
  if (status === 'caution' || status === 'unchecked') return 'caution'
  return 'blocked'
}
