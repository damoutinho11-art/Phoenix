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

const proposalFixture = (overrides = {}) => ({
  plan_id: 'proposal-1',
  status: 'proposed',
  validations: [validation],
  before: { plan_id: 'active-1', status: 'active', days: [beforeDay] },
  after: { plan_id: 'proposal-1', status: 'proposed', days: [afterDay] },
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
})

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
