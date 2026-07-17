import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const helpers = await import('./trainingControlRoomViewModel.js').catch(() => ({}))
const readSource = name => readFileSync(new URL(name, import.meta.url), 'utf8')

const helper = name => {
  assert.equal(typeof helpers[name], 'function', `${name} must be exported`)
  return helpers[name]
}

test('validation presentation follows failed severity instead of severity alone', () => {
  const getValidationPresentation = helper('getValidationPresentation')

  assert.deepEqual(
    getValidationPresentation([
      { passed: true, severity: 'warning' },
      { passed: true, severity: 'hard' },
    ]),
    { tone: 'passed', label: 'VALIDATED', passed: 2, total: 2, failures: 0 },
  )
  assert.deepEqual(
    getValidationPresentation([{ passed: false, severity: 'warning' }]),
    { tone: 'warning', label: 'WARNING', passed: 0, total: 1, failures: 1 },
  )
  assert.deepEqual(
    getValidationPresentation([
      { passed: false, severity: 'warning' },
      { passed: false, severity: 'hard' },
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

test('history lineage labels only an active plan as current', () => {
  const getLifecyclePresentation = helper('getLifecyclePresentation')

  const active = getLifecyclePresentation({ status: 'active' })
  assert.deepEqual(active, {
    status: 'active',
    statusLabel: 'ACTIVE // CURRENT',
    isCurrent: true,
    relationLabel: 'LINEAGE',
    relationText: 'CURRENT ACTIVE PLAN',
    relationPlanId: null,
  })

  for (const status of ['proposed', 'rejected', 'completed', 'superseded']) {
    const presentation = getLifecyclePresentation({ status, superseded_by: status === 'superseded' ? 'plan-next' : null })
    assert.equal(presentation.isCurrent, false)
    assert.doesNotMatch(presentation.statusLabel, /CURRENT/)
  }
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

test('components wire behavioral helpers without introducing Task 9 actions', () => {
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
  assert.doesNotMatch(history, /CURRENT HEAD|VERSION\s+\{String/)
  assert.doesNotMatch(room, /TrainingAdaptView|postTrainingPlanProposal|applyTrainingPlanProposal|rejectTrainingPlanProposal/)
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

test('training CSS keeps stable scoped geometry and semantic changed-day tones', () => {
  const css = readSource('../holo.css')
  const trainingCss = css.slice(css.indexOf('/* Training Control Room'))

  assert.match(trainingCss, /grid-template-columns:\s*repeat\(7,\s*minmax\(112px,\s*1fr\)\)/)
  assert.match(trainingCss, /\.training-week-day\.changed\.passed/)
  assert.match(trainingCss, /\.training-week-day\.changed\.warning/)
  assert.match(trainingCss, /\.training-week-day\.changed\.blocked/)
  assert.match(trainingCss, /\.training-history-validation\.warning/)
  assert.match(trainingCss, /@media\s*\(max-width:\s*760px\)[^}]*\{[\s\S]*grid-template-columns:\s*repeat\(7,\s*118px\)/)
  assert.doesNotMatch(trainingCss, /--phx-finance|--phx-calendar|#00bbdd|#9f7dff/i)
})
