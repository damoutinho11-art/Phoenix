// The home brief is the day's signal in three or four short clauses, one per
// domain, composed from the same live data the domain screens use. Anything
// unknown is said to be unknown; nothing is invented to fill the line.
import { calendarDate, calendarLocalStamp, eventStart, feedHealth } from './calendarFeedModel.js'

const title = s => String(s || '').replace(/_/g, ' ').replace(/^\w/, c => c.toUpperCase())

// Plaan titles read "PRODUCTION/ COMPOSER: Production (10. ballett)"; keep the
// human half after the colon and cap the length so the brief stays a sentence.
export function shortTitle(raw, max = 40) {
  let t = String(raw || 'Event').trim()
  if (t.includes(':')) t = t.slice(t.indexOf(':') + 1).trim() || t
  if (t.length > max) t = t.slice(0, max - 1).trimEnd() + '…'
  return t
}

function financeClause(fin) {
  if (!fin || !fin.week_label) return 'Finance source unverified.'
  if (fin.week_done) return `${fin.week_label} is deployed.`
  if (fin.data_ready === false) return `${fin.week_label} is paused until finance data is refreshed.`
  return `${fin.week_label} brief is waiting for your approval.`
}

function trainingClause(training) {
  const state = training?.state
  const status = training?.status
  if (!state || state === 'loading') return null
  if (state === 'unavailable') return 'Training data unavailable.'
  if (state === 'plan_required') return 'No training plan for this week — generate it.'
  const session = status?.today_session
  const conflict = status?.has_hard_conflicts ? ' (schedule conflict flagged)' : ''
  if (state === 'rest' || session?.is_rest) return `Rest day${conflict}.`
  if (session?.session_type) return `${title(session.session_type)} today${conflict}.`
  return null
}

function calendarClause(cal, todayISO, nowStamp) {
  if (!cal) return 'Calendar unavailable.'
  if (!feedHealth(cal)) return 'Calendar unconfirmed — check Plaan.'
  const todays = (cal.events || []).filter(e => String(eventStart(e) || '').slice(0, 10) === todayISO)
  if (!todays.length) return 'Nothing on the calendar today.'
  const next = todays.find(e => eventStart(e) > nowStamp)
  if (!next) return `${todays.length} event${todays.length === 1 ? '' : 's'} today, all done.`
  return `${shortTitle(next.title || next.summary || next.name)} at ${String(eventStart(next)).slice(11, 16)}.`
}

function nutritionClause(nut) {
  if (!nut || nut.remaining_calories == null) return null
  const open = Math.max(0, Math.round(nut.remaining_calories)).toLocaleString('en-US')
  const meals = (nut.logged?.items || []).length
  const after = meals ? ` after ${meals} meal${meals === 1 ? '' : 's'}` : ''
  return `${open} kcal open${after}.`
}

export function composeHomeBrief({ dayPart, finance, nutrition, training, calendar, todayISO = calendarDate(), nowStamp = calendarLocalStamp() }) {
  const clauses = [
    financeClause(finance),
    trainingClause(training),
    calendarClause(calendar, todayISO, nowStamp),
    nutritionClause(nutrition),
  ].filter(Boolean)
  return [`Good ${dayPart}, Diogo.`, ...clauses].join(' ')
}
