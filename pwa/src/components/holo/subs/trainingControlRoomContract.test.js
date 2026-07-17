import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const helpers = await import('./trainingControlRoomViewModel.js').catch(() => ({}))
const readSource = name => readFileSync(new URL(name, import.meta.url), 'utf8')

const helper = name => {
  assert.equal(typeof helpers[name], 'function', `${name} must be exported`)
  return helpers[name]
}

test('cockpit keeps start primary and adds adapt week second', () => {
  const domains = readFileSync(new URL('../holoDomains.js', import.meta.url), 'utf8')
  const start = domains.indexOf('▶ START SESSION')
  const adapt = domains.indexOf('ADAPT WEEK')

  assert.ok(start >= 0 && adapt > start)
  assert.match(domains, /ADAPT WEEK[^\n]*training-room/)
})

test('adapt view previews before apply and blocks hard failures', () => {
  const adapt = readSource('./TrainingAdaptView.jsx')

  assert.match(adapt, /BEFORE/)
  assert.match(adapt, /AFTER/)
  assert.match(adapt, /interpreted_constraints/)
  assert.match(adapt, /disabled={!proposal\.canApply/)
  assert.match(adapt, /APPLY PLAN/)
})

test('adapt view consumes fail-closed evidence and lifecycle helpers', () => {
  const adapt = readSource('./TrainingAdaptView.jsx')
  const adaptViewModel = readSource('./trainingAdaptViewModel.js')

  for (const helperName of [
    'normalizeTrainingAdaptProposal',
    'getAdaptValidationTone',
    'getProposalRequestState',
    'getProposalLifecycleState',
    'getAppliedTrainingPlanOutcome',
    'describeTrainingPlanDay',
  ]) {
    assert.match(adapt, new RegExp(helperName))
  }
  assert.match(adaptViewModel, /hasSameTrainingPlanAuthority/)
  assert.match(adapt, /setProposal\(requestState\.proposal\)/)
  assert.match(adapt, /onRejected\?\.\(\)/)
})

test('validation presentation is unverified without complete validation evidence', () => {
  const getValidationPresentation = helper('getValidationPresentation')

  for (const validations of [undefined, null, [], [{}], [{ rule: 'readiness', passed: true, severity: 'hard' }]]) {
    assert.deepEqual(
      getValidationPresentation(validations),
      {
        tone: 'unverified',
        label: 'UNVERIFIED',
        passed: 0,
        total: Array.isArray(validations) ? validations.length : 0,
        failures: 0,
      },
    )
  }

  assert.deepEqual(
    getValidationPresentation([
      { rule: 'fatigue', detail: 'within limit', passed: true, severity: 'warning' },
      { rule: 'volume', detail: 'within limit', passed: true, severity: 'hard' },
    ]),
    { tone: 'passed', label: 'VALIDATED', passed: 2, total: 2, failures: 0 },
  )
  assert.deepEqual(
    getValidationPresentation([{ rule: 'fatigue', detail: 'near limit', passed: false, severity: 'warning' }]),
    { tone: 'warning', label: 'WARNING', passed: 0, total: 1, failures: 1 },
  )
  assert.deepEqual(
    getValidationPresentation([
      { rule: 'fatigue', detail: 'near limit', passed: false, severity: 'warning' },
      { rule: 'volume', detail: 'over limit', passed: false, severity: 'hard' },
    ]),
    { tone: 'blocked', label: 'BLOCKED', passed: 0, total: 2, failures: 2 },
  )
})

test('week slot normalization always returns seven unique horizon slots', () => {
  const buildWeekSlots = helper('buildWeekSlots')

  assert.equal(buildWeekSlots(null).length, 7)
  assert.equal(buildWeekSlots({ days: Array.from({ length: 10 }, (_, index) => ({ objective: `day-${index}` })) }).length, 7)

  const monday = { date: '2026-07-20', objective: 'monday' }
  const wednesday = { date: '2026-07-22', objective: 'wednesday' }
  const slots = buildWeekSlots({ days: [monday, wednesday] })

  assert.deepEqual(slots.map(slot => slot.date), [
    '2026-07-20',
    '2026-07-21',
    '2026-07-22',
    '2026-07-23',
    '2026-07-24',
    '2026-07-25',
    '2026-07-26',
  ])
  assert.equal(slots[0].day, monday)
  assert.equal(slots[1].day, null)
  assert.equal(slots[2].day, wednesday)
  assert.equal(slots.filter(slot => slot.day === wednesday).length, 1)
})

test('history lineage labels only the active row matching the endpoint plan ID as current', () => {
  const getLifecyclePresentation = helper('getLifecyclePresentation')

  const currentPlanId = 'cycle-2026-07-plan'
  const active = getLifecyclePresentation({ plan_id: currentPlanId, status: 'active' }, currentPlanId)
  assert.deepEqual(active, {
    status: 'active',
    statusLabel: 'ACTIVE // CURRENT',
    isCurrent: true,
    relationLabel: 'LINEAGE',
    relationText: 'CURRENT ACTIVE PLAN',
    relationPlanId: null,
  })

  const oldCycle = getLifecyclePresentation({ plan_id: 'cycle-2026-06-plan', status: 'active' }, currentPlanId)
  assert.deepEqual(oldCycle, {
    status: 'active',
    statusLabel: 'ACTIVE',
    isCurrent: false,
    relationLabel: 'LIFECYCLE',
    relationText: 'ACTIVE PLAN',
    relationPlanId: null,
  })

  for (const status of ['proposed', 'rejected', 'completed', 'superseded']) {
    const presentation = getLifecyclePresentation({ status, superseded_by: status === 'superseded' ? 'plan-next' : null }, currentPlanId)
    assert.equal(presentation.isCurrent, false)
    assert.doesNotMatch(presentation.statusLabel, /CURRENT/)
  }
})

test('history current labeling is unique across multiple active lifecycle rows', () => {
  const getLifecyclePresentation = helper('getLifecyclePresentation')
  const currentPlanId = 'cycle-b-active'
  const history = [
    { plan_id: 'cycle-a-active', cycle_id: 'cycle-a', status: 'active' },
    { plan_id: currentPlanId, cycle_id: 'cycle-b', status: 'active' },
    { plan_id: 'cycle-c-active', cycle_id: 'cycle-c', status: 'active' },
  ]
  const labels = history.map(plan => getLifecyclePresentation(plan, currentPlanId))

  assert.deepEqual(labels.map(item => item.isCurrent), [false, true, false])
  assert.deepEqual(labels.map(item => item.statusLabel), ['ACTIVE', 'ACTIVE // CURRENT', 'ACTIVE'])
  assert.deepEqual(labels.map(item => item.relationText), ['ACTIVE PLAN', 'CURRENT ACTIVE PLAN', 'ACTIVE PLAN'])
})

test('history lineage reflects every persisted terminal and pending lifecycle', () => {
  const getLifecyclePresentation = helper('getLifecyclePresentation')

  assert.deepEqual(getLifecyclePresentation({ status: 'proposed' }), {
    status: 'proposed',
    statusLabel: 'PROPOSED',
    isCurrent: false,
    relationLabel: 'LIFECYCLE',
    relationText: 'AWAITING DECISION',
    relationPlanId: null,
  })
  assert.deepEqual(getLifecyclePresentation({ status: 'rejected' }), {
    status: 'rejected',
    statusLabel: 'REJECTED',
    isCurrent: false,
    relationLabel: 'LIFECYCLE',
    relationText: 'REJECTED // TERMINAL',
    relationPlanId: null,
  })
  assert.deepEqual(getLifecyclePresentation({ status: 'completed' }), {
    status: 'completed',
    statusLabel: 'COMPLETED',
    isCurrent: false,
    relationLabel: 'LIFECYCLE',
    relationText: 'COMPLETED // TERMINAL',
    relationPlanId: null,
  })
  assert.deepEqual(getLifecyclePresentation({ status: 'superseded', superseded_by: 'plan-next' }), {
    status: 'superseded',
    statusLabel: 'SUPERSEDED',
    isCurrent: false,
    relationLabel: 'SUPERSEDED BY',
    relationText: 'plan-next',
    relationPlanId: 'plan-next',
  })
  assert.equal(
    getLifecyclePresentation({ status: 'superseded' }).relationText,
    'SUCCESSOR NOT RECORDED',
  )
})

test('view state selectors keep loading error empty and ready states exclusive', () => {
  const getTrainingViewState = helper('getTrainingViewState')

  assert.deepEqual(getTrainingViewState({ loading: true, error: 'offline', hasData: false }), {
    kind: 'loading',
    className: 'training-plan-loading',
    role: 'status',
  })
  assert.deepEqual(getTrainingViewState({ loading: false, error: 'offline', hasData: false }), {
    kind: 'error',
    className: 'training-plan-error',
    role: 'alert',
  })
  assert.deepEqual(getTrainingViewState({ loading: false, error: '', hasData: false }), {
    kind: 'empty',
    className: 'training-empty-state',
    role: 'status',
  })
  assert.deepEqual(getTrainingViewState({ loading: false, error: '', hasData: true }), {
    kind: 'ready',
    className: '',
    role: null,
  })
})

test('modal focus navigation wraps in both directions and recovers escaped focus', () => {
  const getNextModalFocus = helper('getNextModalFocus')
  const first = { id: 'first' }
  const middle = { id: 'middle' }
  const last = { id: 'last' }
  const focusables = [first, middle, last]

  assert.equal(getNextModalFocus(focusables, first), middle)
  assert.equal(getNextModalFocus(focusables, last), first)
  assert.equal(getNextModalFocus(focusables, first, true), last)
  assert.equal(getNextModalFocus(focusables, middle, true), first)
  assert.equal(getNextModalFocus(focusables, { id: 'outside' }), first)
  assert.equal(getNextModalFocus([], first), null)
})

test('training tab index helper gives lifecycle outcomes deterministic tab focus targets', () => {
  const getTrainingTabIndex = helper('getTrainingTabIndex')

  assert.equal(getTrainingTabIndex('WEEK'), 0)
  assert.equal(getTrainingTabIndex('ADAPT'), 1)
  assert.equal(getTrainingTabIndex('MISSING'), 0)
})

test('components wire behavioral helpers and the Task 9 adaptation view', () => {
  const room = readSource('./TrainingControlRoom.jsx')
  const week = readSource('./TrainingWeekView.jsx')
  const history = readSource('./TrainingPlanHistory.jsx')

  for (const label of ['WEEK', 'ADAPT', 'HISTORY', 'RULES']) {
    assert.match(room, new RegExp(`['"]${label}['"]`))
  }
  assert.match(room, /getTrainingViewState/)
  assert.match(week, /buildWeekSlots/)
  assert.match(week, /getValidationPresentation/)
  assert.match(history, /getLifecyclePresentation/)
  assert.match(history, /getValidationPresentation/)
  assert.match(room, /<TrainingPlanHistory\s+items=\{history\}\s+currentPlanId=\{plan\?\.plan_id\}/)
  assert.match(history, /function TrainingPlanHistory\(\{ items = \[\], currentPlanId/)
  assert.doesNotMatch(history, /CURRENT HEAD|VERSION\s+\{String/)
  assert.match(room, /TrainingAdaptView/)
  assert.match(room, /getTrainingTabIndex/)
  assert.match(room, /tabRefs\.current\[getTrainingTabIndex\('WEEK'\)\]\?\.focus\(\)/)
  assert.doesNotMatch(room, /postTrainingPlanProposal|applyTrainingPlanProposal|rejectTrainingPlanProposal/)
})

test('dialog source wires focus containment scroll lock escape and focus restoration', () => {
  const room = readSource('./TrainingControlRoom.jsx')

  assert.match(room, /aria-modal="true"/)
  assert.match(room, /roomRef/)
  assert.match(room, /querySelectorAll/)
  assert.match(room, /event\.key === 'Tab'/)
  assert.match(room, /getNextModalFocus/)
  assert.match(room, /event\.key === 'Escape'/)
  assert.match(room, /document\.body\.style\.overflow = 'hidden'/)
  assert.match(room, /document\.body\.style\.overflow = previousBodyOverflow/)
  assert.match(room, /previousFocus.*\.focus\(\)/s)
})

test('training CSS keeps stable scoped geometry, validation tones, and neutral unverified changed days', () => {
  const css = readSource('../holo.css')
  const trainingCss = css.slice(css.indexOf('/* Training Control Room'))

  assert.match(trainingCss, /grid-template-columns:\s*repeat\(7,\s*minmax\(112px,\s*1fr\)\)/)
  assert.match(trainingCss, /\.training-week-day\.changed\.passed/)
  assert.match(trainingCss, /\.training-week-day\.changed\.warning/)
  assert.match(trainingCss, /\.training-week-day\.changed\.blocked/)
  assert.match(trainingCss, /\.training-week-day\.changed\.unverified\s*\{[^}]*var\(--phx-muted\)/)
  assert.doesNotMatch(trainingCss, /\.training-week-day\.changed\.unverified\s*\{[^}]*var\(--phx-positive\)/)
  assert.match(trainingCss, /\.training-history-validation\.warning/)
  assert.match(trainingCss, /@media\s*\(max-width:\s*760px\)[^}]*\{[\s\S]*grid-template-columns:\s*repeat\(7,\s*118px\)/)
  assert.doesNotMatch(trainingCss, /--phx-finance|--phx-calendar|#00bbdd|#9f7dff/i)
})

test('fixed Training room stacks above the global bottom navigation', () => {
  const css = readSource('../holo.css')
  const dock = readSource('../HoloDock.jsx')
  const roomLayer = css.match(/\.training-control-room-layer\s*\{[^}]*z-index:\s*(\d+)/s)
  const bottomNavigation = dock.match(/bottom:\s*0,\s*zIndex:\s*(\d+)/)

  assert.ok(roomLayer, 'Training Control Room must declare an explicit z-index')
  assert.ok(bottomNavigation, 'global bottom navigation must declare an explicit z-index')
  assert.ok(
    Number(roomLayer[1]) > Number(bottomNavigation[1]),
    `Training room layer ${roomLayer[1]} must be above bottom navigation ${bottomNavigation[1]}`,
  )
})

test('training adaptation fields stack at the mobile breakpoint', () => {
  const css = readSource('../holo.css')
  const trainingCss = css.slice(css.indexOf('/* Training Control Room'))

  assert.match(
    trainingCss,
    /@media\s*\(max-width:\s*760px\)[\s\S]*\.training-adapt-quick-form,\s*\.training-adapt-intent-form\s*\{[^}]*grid-template-columns:\s*1fr/,
  )
})

test('training CSS reserves green yellow and red for validation rather than lifecycle states', () => {
  const css = readSource('../holo.css')
  const trainingCss = css.slice(css.indexOf('/* Training Control Room'))

  assert.match(trainingCss, /\.training-lifecycle-status\.active\s*\{[^}]*var\(--training-accent\)/)
  assert.match(trainingCss, /\.training-lifecycle-status\.rejected\s*\{[^}]*var\(--phx-muted\)/)
  assert.match(trainingCss, /\.training-plan-live-state\.active\s*\{[^}]*var\(--training-accent\)/)
  assert.doesNotMatch(
    trainingCss,
    /\.training-(?:lifecycle-status|plan-live-state)\.(?:active|proposed|rejected|completed|superseded)\s*\{[^}]*--phx-(?:positive|caution|danger)/,
  )
})

test('training CSS keeps danger red inside validation hard-block selectors', () => {
  const css = readSource('../holo.css')
  const trainingCss = css.slice(css.indexOf('/* Training Control Room'))
  const redBlocks = [...trainingCss.matchAll(/([^{}]+)\{([^{}]*--phx-danger[^{}]*)\}/gi)]

  const validationHardBlock = /\.training-(?:week-day\.changed\.blocked|section-heading\s+\.blocked|validation-list\s+\.blocked|history-validation\.blocked)\b/
  for (const [selector] of redBlocks) {
    assert.match(selector, validationHardBlock, `danger red escaped validation scope: ${selector.trim()}`)
  }
})
