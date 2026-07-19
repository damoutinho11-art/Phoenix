import { ACC, G, Y, R, W, BODY, a } from './holoTokens.js'


const EMPTY_ROWS = message => [{
  title: message,
  sub: 'PHOENIX WILL NOT INFER MISSING TRAINING DATA',
  value: '—',
  valueColor: a(ACC, '99'),
}]

const title = value => String(value || '').replaceAll('_', ' ')
const upper = value => title(value).toUpperCase()
const pct = value => `${Math.max(0, Math.min(100, Number(value) || 0))}%`


export function normalizeTrainingLive({ status, routed, history, loading, error }) {
  if (loading) return { state: 'loading', status, routed, history, message: 'SYNCING TRAINING DATA' }
  if (error || !status) return { state: 'unavailable', status: null, routed: null, history: null, message: 'TRAINING DATA UNAVAILABLE' }
  if (status.operational_state === 'plan_required' || !status.today_session) {
    return { state: 'plan_required', status, routed: null, history, message: 'ACTIVE PLAN REQUIRED' }
  }
  if (status.today_session.is_rest) {
    return { state: 'rest', status, routed, history, message: 'RECOVERY DAY' }
  }
  if (!routed) return { state: 'unavailable', status, routed: null, history, message: 'ROUTING DATA UNAVAILABLE' }
  if (routed.readiness_required || routed.high_neural_allowed === false) {
    return { state: 'readiness_required', status, routed, history, message: 'READINESS CHECK REQUIRED' }
  }
  return { state: 'ready', status, routed, history, message: 'SESSION READY' }
}


function unavailableDomain(base, model) {
  const loading = model.state === 'loading'
  const planRequired = model.state === 'plan_required'
  const value = planRequired ? 'PLAN' : loading ? 'SYNC' : '—'
  const label = planRequired
    ? 'ACTIVE ADAPTIVE PLAN REQUIRED'
    : loading ? 'TRAINING DATA SYNC' : 'TRAINING DATA UNAVAILABLE'
  return {
    ...base,
    bootLine: 'SYS.TRAINING // SOURCE STATUS',
    heroValue: value,
    heroUnit: '',
    heroLabel: label,
    reactorPct: 0.08,
    heroChips: [{ text: model.message, color: planRequired ? Y : ACC }],
    heroBrief: planRequired
      ? 'Phoenix has no active plan-day receipt for today. Generate and apply a verified week before starting a session.'
      : 'Phoenix cannot verify current Training data. Session controls remain closed until the backend responds.',
    heroActions: [{ label: 'ADAPT WEEK', sub: 'training-room', primary: true }],
    readout: [{ k: 'SOURCE', v: loading ? 'SYNCING' : 'UNAVAILABLE', w: '8%' }],
    feed: [{ t: 'NOW', msg: model.message, tone: planRequired ? Y : 'soft' }],
    panels: [
      { code: 'SESSION', meta: 'CLOSED', type: 'rows', rows: EMPTY_ROWS(model.message) },
      { code: 'READINESS', meta: 'NO ROUTE', type: 'rows', rows: EMPTY_ROWS('No verified readiness route') },
      { code: 'HISTORY', meta: 'UNAVAILABLE', type: 'rows', rows: EMPTY_ROWS('Recorded sessions unavailable') },
      { code: 'MISSION', meta: 'UNVERIFIED', type: 'rows', rows: EMPTY_ROWS('Mission context unavailable') },
    ],
  }
}


function exerciseScheme(exercise) {
  const sets = Number(exercise.sets)
  const reps = Number(exercise.reps)
  const load = Number(exercise.load_kg ?? exercise.weight_kg)
  if (!Number.isInteger(sets) || sets < 1 || !Number.isInteger(reps) || reps < 1) return 'PRESCRIPTION UNAVAILABLE'
  return `${sets} × ${reps}${Number.isFinite(load) && load > 0 ? ` · ${load}KG` : ''}`
}


export function buildTrainingDomain(base, model) {
  if (!['ready', 'readiness_required', 'rest'].includes(model.state)) {
    return unavailableDomain(base, model)
  }

  const status = model.status
  const routed = model.routed || {}
  const session = status.today_session
  const goal = status.dunk_goal || {}
  const cut = status.cut_status || {}
  const history = Array.isArray(model.history?.sessions) ? model.history.sessions : []
  const scan = routed.readiness_scan
  const attempt = goal.attempt_window_start
    ? new Date(`${goal.attempt_window_start}T00:00:00`).toLocaleDateString('en-US', { month: 'short', year: 'numeric' }).toUpperCase()
    : 'DATE UNAVAILABLE'
  const readiness = routed.readiness_status || 'unchecked'
  const sessionRows = session.exercises?.length
    ? session.exercises.map(exercise => ({
        title: title(exercise.name),
        sub: upper(session.objective),
        value: exerciseScheme(exercise),
        valueColor: exerciseScheme(exercise) === 'PRESCRIPTION UNAVAILABLE' ? R : W,
      }))
    : EMPTY_ROWS(session.is_rest ? 'Recovery day' : 'Session prescription unavailable')
  const scanRows = scan
    ? ['knee', 'ankle', 'hip', 'hamstring', 'calf_achilles', 'lower_back_pelvic'].map(area => ({
        title: title(area),
        sub: 'DISCOMFORT · 0–10',
        value: String(scan[area]),
        valueColor: Number(scan[area]) >= 5 ? R : Number(scan[area]) >= 3 ? Y : G,
      }))
    : EMPTY_ROWS('Readiness not checked')
  const historyRows = history.slice(0, 4).map(item => ({
    title: item.date || 'DATE UNAVAILABLE',
    sub: upper(item.session_type),
    value: item.completion_evidence?.rpe ? `RPE ${item.completion_evidence.rpe}` : 'RECORDED',
    valueColor: G,
  }))

  const stateColor = model.state === 'ready' ? G : model.state === 'rest' ? W : Y
  const actions = model.state === 'ready'
    ? [
        { label: '▶ START SESSION', sub: 'session', primary: true },
        { label: 'ADAPT WEEK', sub: 'training-room' },
        { label: 'READINESS', sub: 'readiness' },
        { label: 'LOG SLEEP', sub: 'sleep' },
      ]
    : model.state === 'readiness_required'
      ? [
          { label: 'RUN READINESS', sub: 'readiness', primary: true },
          { label: 'ADAPT WEEK', sub: 'training-room' },
        ]
      : [{ label: 'ADAPT WEEK', sub: 'training-room', primary: true }]

  return {
    ...base,
    bootLine: 'SYS.TRAINING // VERIFIED PLAN PROJECTION',
    heroValue: goal.days_to_attempt == null ? '—' : String(goal.days_to_attempt),
    heroUnit: goal.days_to_attempt == null ? '' : 'DAYS',
    heroLabel: `TO ATTEMPT · ${attempt}`,
    reactorPct: goal.days_to_attempt == null ? 0.08 : Math.max(0.08, Math.min(1, 1 - goal.days_to_attempt / 90)),
    heroChips: [
      { text: model.message, color: stateColor },
      { text: upper(session.display_name), color: ACC },
      { text: `READINESS · ${upper(readiness)}`, color: readiness === 'clear' ? G : Y },
    ],
    heroBrief: session.change_reason
      ? `${session.display_name}. Phoenix adapted this day: ${title(session.change_reason)}.`
      : `${session.display_name}. ${session.estimated_minutes} minutes from active plan ${status.plan_provenance?.plan_id || 'unavailable'}.`,
    heroActions: actions,
    readout: [
      { k: 'READINESS', v: upper(readiness), w: readiness === 'clear' ? '100%' : '35%' },
      { k: 'DURATION', v: `${session.estimated_minutes}M`, w: pct(session.estimated_minutes) },
      { k: 'EXERCISES', v: String(session.exercises?.length || 0), w: pct((session.exercises?.length || 0) * 12) },
      { k: 'RECORDED', v: String(history.length), w: pct(history.length * 10) },
      { k: 'BODYWEIGHT', v: cut.current_bodyweight_kg == null ? '—' : `${cut.current_bodyweight_kg}KG`, w: '55%' },
      { k: 'TARGET BF', v: cut.target_bf_pct == null ? '—' : `${cut.target_bf_pct}%`, w: pct(cut.target_bf_pct) },
    ],
    feed: history.slice(0, 5).map(item => ({ t: item.date || '', msg: upper(item.session_type), tone: G })),
    panels: [
      { code: 'SESSION', meta: upper(session.session_type), type: 'rows', rows: sessionRows },
      { code: 'READINESS', meta: upper(readiness), type: 'rows', rows: scanRows },
      { code: 'HISTORY', meta: `${history.length} RECORDED`, type: 'rows', rows: historyRows.length ? historyRows : EMPTY_ROWS('No sessions recorded') },
      { code: 'MISSION', meta: `ATTEMPT · ${attempt}`, type: 'rows', rows: [
        { title: 'Phase', sub: 'ACTIVE CONSTITUTION', value: upper(goal.current_phase) || '—', valueColor: W },
        { title: 'Plan day', sub: status.plan_provenance?.date || 'DATE UNAVAILABLE', value: upper(session.objective), valueColor: ACC },
        { title: 'Projection', sub: 'CURRENT MISSION STATUS', value: goal.on_track ? 'ON TRACK' : 'REVIEW', valueColor: goal.on_track ? G : Y },
      ] },
    ],
  }
}
