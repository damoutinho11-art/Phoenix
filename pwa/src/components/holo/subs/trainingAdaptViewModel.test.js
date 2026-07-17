import test from 'node:test'
import assert from 'node:assert/strict'

const adapt = await import('./trainingAdaptViewModel.js')

const validation = {
  rule: 'recovery_spacing',
  passed: true,
  severity: 'hard',
  detail: 'Spacing is valid',
}

const beforeDay = {
  date: '2026-07-20',
  session_type: 'high_intensity',
  objective: 'jump_strength',
  exercises: [{ name: 'back_squat' }],
  estimated_minutes: 60,
}

const afterDay = {
  ...beforeDay,
  exercises: [{ name: 'split_squat' }],
  change_reason: 'exercise_replaced:back_squat:split_squat',
}

const usableConstraint = {
  kind: 'replace_exercise',
  source: 'user',
  values: { date: '2026-07-20', from: 'back_squat', to: 'split_squat' },
}

const proposedSnapshot = (overrides = {}) => ({
  plan_id: 'proposal-1',
  status: 'proposed',
  days: [afterDay],
  validations: [validation],
  constraints: [usableConstraint],
  ...overrides,
})

const proposalFixture = (overrides = {}) => {
  const after = proposedSnapshot()
  return {
    ...after,
    before: { plan_id: 'active-1', status: 'active', days: [beforeDay] },
    after,
  interpreted_constraints: [usableConstraint],
  diff: {
    changed_days: [{
      date: '2026-07-20',
      before: beforeDay,
      after: afterDay,
      reason: afterDay.change_reason,
    }],
  },
  ...overrides,
  }
}

test('malformed validation evidence is safe to render and never eligible to apply', () => {
  const proposal = adapt.normalizeTrainingAdaptProposal(proposalFixture({ validations: [null] }))

  assert.deepEqual(proposal.validations, [])
  assert.equal(proposal.canApply, false)
  assert.equal(adapt.getAdaptValidationTone([null]), 'unverified')
})

test('apply eligibility requires usable interpreted constraints and reconciled non-empty changed-day evidence', () => {
  assert.equal(adapt.normalizeTrainingAdaptProposal(proposalFixture()).canApply, true)
  assert.equal(adapt.normalizeTrainingAdaptProposal(proposalFixture({ interpreted_constraints: [] })).canApply, false)
  assert.equal(adapt.normalizeTrainingAdaptProposal(proposalFixture({ interpreted_constraints: [null] })).canApply, false)
  assert.equal(adapt.normalizeTrainingAdaptProposal(proposalFixture({ diff: { changed_days: [] } })).canApply, false)
  assert.equal(adapt.normalizeTrainingAdaptProposal(proposalFixture({ diff: { changed_days: [{ date: '2026-07-20', before: beforeDay, after: null }] } })).canApply, false)
  assert.equal(adapt.normalizeTrainingAdaptProposal(proposalFixture({ diff: undefined })).canApply, false)
})

test('proposal request transition clears stale preview before a new response arrives', () => {
  assert.deepEqual(adapt.getProposalRequestState(), { proposal: null, busy: true, error: '' })
})

test('apply and reject lifecycle failures retain the current proposal while successful outcomes set deterministic focus targets', () => {
  const proposal = adapt.normalizeTrainingAdaptProposal(proposalFixture())

  assert.deepEqual(adapt.getProposalLifecycleState('apply', true, proposal), { proposal: null, focusTarget: 'week' })
  assert.deepEqual(adapt.getProposalLifecycleState('reject', true, proposal), { proposal: null, focusTarget: 'adapt' })
  assert.deepEqual(adapt.getProposalLifecycleState('apply', false, proposal), { proposal, focusTarget: null })
  assert.deepEqual(adapt.getProposalLifecycleState('reject', false, proposal), { proposal, focusTarget: null })
})

test('replacement session details preserve exercise-level before and after evidence', () => {
  assert.equal(adapt.describeTrainingPlanDay(beforeDay), 'JUMP STRENGTH // 60 MIN // EXERCISES: BACK SQUAT')
  assert.equal(adapt.describeTrainingPlanDay(afterDay), 'JUMP STRENGTH // 60 MIN // EXERCISES: SPLIT SQUAT')
})

test('non-string changed-day reasons and plan-day change reasons are withheld from preview evidence', () => {
  const malformedDay = { ...afterDay, change_reason: { code: 'unsafe' } }
  const after = proposedSnapshot({ days: [malformedDay] })
  const proposal = adapt.normalizeTrainingAdaptProposal(proposalFixture({
    days: [malformedDay],
    after,
    diff: {
      changed_days: [{
        date: malformedDay.date,
        before: beforeDay,
        after: malformedDay,
        reason: { code: 'unsafe' },
      }],
    },
  }))

  assert.deepEqual(proposal.changedDays, [])
  assert.equal(proposal.canApply, false)
})

test('proposal preview identity requires a matching authoritative after snapshot', () => {
  const differentAfter = proposedSnapshot({ plan_id: 'proposal-2' })
  assert.equal(adapt.normalizeTrainingAdaptProposal(proposalFixture({ after: differentAfter })).canApply, false)

  const changedDays = [{ ...afterDay, objective: 'different_objective' }]
  assert.equal(adapt.normalizeTrainingAdaptProposal(proposalFixture({
    days: changedDays,
  })).canApply, false)

  assert.equal(adapt.normalizeTrainingAdaptProposal(proposalFixture({
    validations: [{ ...validation, detail: 'Different top-level evidence' }],
  })).canApply, false)

  assert.equal(adapt.normalizeTrainingAdaptProposal(proposalFixture({
    constraints: [{ ...usableConstraint, values: { date: '2026-07-20', from: 'back_squat', to: 'front_squat' } }],
  })).canApply, false)
})

test('semantic interpreted constraints accept every router kind and reject incomplete or rollover values', () => {
  const validConstraints = [
    { kind: 'unavailable', source: 'user', values: { date: '2026-07-20' } },
    { kind: 'move_session', source: 'user', values: { source_date: '2026-07-20', target_date: '2026-07-21' } },
    { kind: 'skip_session', source: 'user', values: { date: '2026-07-20' } },
    usableConstraint,
    { kind: 'time_limit', source: 'user', values: { date: '2026-07-20', minutes: 45 } },
    { kind: 'equipment_available', source: 'user', values: { equipment: ['barbell'] } },
    { kind: 'equipment_available', source: 'user', values: { date: '2026-07-20', equipment: ['barbell'] } },
    { kind: 'exercise_preference', source: 'user', values: { exercise: 'back_squat', avoid_or_prefer: 'prefer' } },
    { kind: 'exercise_preference', source: 'user', values: { date: '2026-07-20', exercise: 'back_squat', avoid_or_prefer: 'avoid' } },
  ]

  for (const constraint of validConstraints) assert.equal(adapt.isUsableTrainingConstraint(constraint), true)
  for (const constraint of [
    { kind: 'unknown', source: 'user', values: { date: '2026-07-20' } },
    { kind: 'skip_session', source: 'user', values: { date: '2026-02-30' } },
    { kind: 'move_session', source: 'user', values: { source_date: '2026-07-20' } },
    { kind: 'replace_exercise', source: 'user', values: { date: '2026-07-20', from: 'back_squat' } },
    { kind: 'time_limit', source: 'user', values: { date: '2026-07-20', minutes: 15.5 } },
    { kind: 'equipment_available', source: 'user', values: { equipment: [] } },
    { kind: 'exercise_preference', source: 'user', values: { exercise: 'back_squat', avoid_or_prefer: 'sometimes' } },
  ]) assert.equal(adapt.isUsableTrainingConstraint(constraint), false)
})

test('apply lifecycle evidence must be an active authoritative copy of the reviewed proposal', () => {
  const proposal = adapt.normalizeTrainingAdaptProposal(proposalFixture())
  const active = {
    ...proposal.after,
    status: 'active',
  }

  assert.deepEqual(adapt.getAppliedTrainingPlanOutcome(active, proposal), { plan: active, valid: true })
  assert.equal(adapt.getAppliedTrainingPlanOutcome({ ...active, plan_id: 'proposal-2' }, proposal).valid, false)
  assert.equal(adapt.getAppliedTrainingPlanOutcome({ ...active, status: 'proposed' }, proposal).valid, false)
  assert.equal(adapt.getAppliedTrainingPlanOutcome({ ...active, days: [{ ...afterDay, date: '2026-02-30' }] }, proposal).valid, false)
})
