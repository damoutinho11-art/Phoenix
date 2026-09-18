import assert from 'node:assert/strict'
import test from 'node:test'
import { composeHomeBrief, shortTitle } from './homeBrief.js'

const training = state => ({ state, status: null, routed: null, history: null })

test('home brief reads the day from live domains, one clause each', () => {
  const text = composeHomeBrief({
    dayPart: 'morning',
    finance: { week_label: 'W38 2026', week_done: false, brief_status: 'pending' },
    nutrition: { remaining_calories: 2000, is_training_day: true, logged: { items: [] } },
    training: { state: 'session', status: { today_session: { session_type: 'push_strength', is_rest: false }, has_hard_conflicts: false } },
    calendar: { events: [{ start: '2026-09-21T11:00:00', title: 'Rehearsal' }], source: { status: 'ok' } },
    todayISO: '2026-09-21',
    nowStamp: '2026-09-21T08:00:00',
  })
  assert.match(text, /^Good morning, Diogo\./)
  assert.match(text, /W38 2026 brief is waiting for your approval/)
  assert.match(text, /Push strength today/)
  assert.match(text, /Rehearsal at 11:00/)
  assert.match(text, /2,000 kcal open/)
})

test('home brief states what is missing instead of pretending', () => {
  const text = composeHomeBrief({
    dayPart: 'evening',
    finance: null,
    nutrition: null,
    training: training('plan_required'),
    calendar: null,
    todayISO: '2026-09-21',
    nowStamp: '2026-09-21T20:00:00',
  })
  assert.match(text, /^Good evening, Diogo\./)
  assert.match(text, /Finance source unverified/)
  assert.match(text, /No training plan for this week — generate it/)
  assert.match(text, /Calendar unavailable/)
  assert.doesNotMatch(text, /kcal/)
})

test('home brief marks closed weeks, rest days and conflicts', () => {
  const text = composeHomeBrief({
    dayPart: 'afternoon',
    finance: { week_label: 'W38 2026', week_done: true },
    nutrition: { remaining_calories: 640, is_training_day: false, logged: { items: [{}, {}] } },
    training: { state: 'rest', status: { today_session: { session_type: 'recovery', is_rest: true }, has_hard_conflicts: true } },
    calendar: { events: [], source: { status: 'ok' } },
    todayISO: '2026-09-21',
    nowStamp: '2026-09-21T15:00:00',
  })
  assert.match(text, /W38 2026 is deployed/)
  assert.match(text, /Rest day/)
  assert.match(text, /schedule conflict flagged/)
  assert.match(text, /Nothing on the calendar today/)
  assert.match(text, /640 kcal open after 2 meals/)
})

test('event names in the brief drop the Plaan production prefix and stay short', () => {
  assert.equal(shortTitle('ASJATU ETTEVAATUS/ M. MURDVEE: Asjatu ettevaatus (10. ballett)'), 'Asjatu ettevaatus (10. ballett)')
  assert.equal(shortTitle('Rehearsal'), 'Rehearsal')
  assert.equal(shortTitle('A very long production name that keeps going and going forever'), 'A very long production name that keeps…')
  assert.equal(shortTitle(''), 'Event')
})
