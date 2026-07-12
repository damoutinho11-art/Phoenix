// Maps real API payloads onto the holo domain/sub-screen shapes.
// Every mapper is defensive: missing live data ⇒ the fixture stays.

import { ACC, G, Y, R, W, spark, pad2 } from './holoTokens'

const SLEEVE_NAMES = {
  global_core_etf: 'GLOBAL CORE',
  growth_nasdaq_etf: 'NASDAQ',
  quality_etf: 'QUALITY',
  btc: 'BITCOIN',
  hype: 'HYPE',
  tao: 'TAO',
  discovery: 'DISCOVERY',
  tactical_reserve: 'CASH',
}
const ROUTE_NAMES = {
  lightyear: 'LIGHTYEAR · UCITS',
  lhv_crypto: 'LHV · CRYPTO',
  cash: 'EUR BUFFER · INSTANT',
  manual_review: 'MANUAL REVIEW',
}

const sleeveName = key => SLEEVE_NAMES[key] || String(key).replace(/_/g, ' ').toUpperCase()
const pct = w => (w * 100).toFixed(1) + '%'
const eur = v => '€' + v.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
const bandColor = st => (st === 'above_max' ? R : st === 'below_min' ? Y : G)
const bandDir = st => (st === 'above_max' ? 'TRIM' : st === 'below_min' ? 'FEED' : 'HOLD')

// ── FINANCE ──
export function applyFinance(d, fin) {
  if (!fin || !fin.sleeve_summary) return d
  const sleeves = fin.sleeve_summary
  const alerts = sleeves.filter(s => s.band_status !== 'within_band')
  const whole = Math.floor(fin.total_invested)
  const cents = (fin.total_invested - whole).toFixed(2).slice(1)
  d.heroValue = '€' + whole.toLocaleString('en-US')
  d.heroUnit = cents + ' EUR'
  d.heroLabel = 'TOTAL INVESTED · ' + (fin.week_label || '').toUpperCase()
  d.reactorPct = Math.max(0.05, (sleeves.length - alerts.length) / sleeves.length)
  d.heroChips = [
    { text: (fin.week_label || 'THIS WEEK') + (fin.week_done ? ' · DEPLOYED' : ' · DEPLOY PENDING'), color: fin.week_done ? G : ACC },
    { text: 'INVESTED ' + eur(fin.total_invested), color: G },
    { text: alerts.length ? alerts.length + ' BAND ALERTS' : 'ALL SLEEVES IN BAND', color: alerts.length ? Y : G },
  ]
  d.heroBrief = fin.week_done
    ? `${fin.week_label} deploy is done. ${alerts.length} sleeve${alerts.length === 1 ? '' : 's'} outside band — rebalance only at the scheduled review. Manual only.`
    : `${fin.week_label} deploy is still pending — review drift and approve the week. Phoenix never places orders; you execute manually.`
  const byWeight = sleeves.slice().sort((x, y) => y.current_weight - x.current_weight)
  const maxW = Math.max(...sleeves.map(s => s.current_weight), 0.01)
  d.readout = byWeight.slice(0, 6).map(s => ({
    k: sleeveName(s.name), v: pct(s.current_weight), w: ((s.current_weight / maxW) * 100).toFixed(0) + '%',
  }))
  // ALLOCATION panel
  d.panels[0] = { code: 'ALLOCATION', meta: sleeves.length + ' SLEEVES', type: 'bars', bars: byWeight.slice(0, 4).map(s => ({
    label: sleeveName(s.name) + (s.band_status === 'above_max' ? ' · OVER' : s.band_status === 'below_min' ? ' · UNDER' : ''),
    w: ((s.current_weight / maxW) * 100).toFixed(0) + '%',
    val: pct(s.current_weight),
    color: bandColor(s.band_status),
  })) }
  // THIS WEEK panel
  d.panels[1] = { code: 'THIS WEEK', meta: 'MANUAL ONLY', type: 'rows', rows: [
    { title: 'Weekly deploy', sub: (fin.week_label || '').toUpperCase(), value: fin.week_done ? 'DONE' : 'PENDING', valueColor: fin.week_done ? G : Y },
    { title: 'Prices refreshed', sub: (fin.prices_refreshed_at || '').slice(0, 16).replace('T', ' · ').toUpperCase() || '—', value: fin.staleness_warning ? 'STALE' : 'FRESH', valueColor: fin.staleness_warning ? Y : G },
    { title: 'Auto-execution', sub: 'PHOENIX NEVER TRADES', value: 'OFF', valueColor: G },
  ] }
  // PERFORMANCE spark: no snapshot history yet — show current value flatline honestly
  d.panels[2] = Object.assign(
    spark([fin.total_invested, fin.total_invested], 'VALUE · SNAPSHOT HISTORY PENDING', eur(fin.total_invested), 'AS OF ' + (fin.as_of || '').toUpperCase(), G),
    { code: 'PERFORMANCE', meta: (fin.as_of || '').toUpperCase() },
  )
  // DRIFT WATCH panel
  const driftRows = alerts.slice(0, 3).map(s => ({
    title: sleeveName(s.name).charAt(0) + sleeveName(s.name).slice(1).toLowerCase() + ' sleeve',
    sub: (s.band_status === 'above_max' ? '+' : '−') + Math.abs(s.gap * 100).toFixed(1) + '% VS TARGET',
    value: bandDir(s.band_status),
    valueColor: bandColor(s.band_status),
  }))
  if (driftRows.length < 3) driftRows.push({ title: 'Other sleeves', sub: 'WITHIN BANDS', value: 'HOLD', valueColor: G })
  d.panels[3] = { code: 'DRIFT WATCH', meta: alerts.length + ' ALERTS', type: 'rows', rows: driftRows }
  d.feed = [
    { t: (fin.prices_refreshed_at || '').slice(11, 16) || '—', msg: 'PRICES REFRESHED', tone: 'body' },
    { t: 'NOW', msg: `DRIFT SCAN · ${alerts.length} ALERTS`, tone: alerts.length ? Y : G },
    { t: 'NOW', msg: fin.constitution_valid ? 'CONSTITUTION VALID' : 'CONSTITUTION INVALID', tone: fin.constitution_valid ? G : R },
    { t: fin.week_label || '', msg: fin.week_done ? 'WEEK DEPLOYED' : 'DEPLOY PENDING', tone: fin.week_done ? G : Y },
    { t: fin.as_of || '', msg: 'STATE SNAPSHOT LOADED', tone: 'soft' },
  ]
  return d
}

// holdings sub-screen list (top 6 sleeves by value, orbital layout order)
export function mapHoldings(holdings, fin) {
  if (!holdings || !holdings.holdings) return null
  const rows = holdings.holdings
    .slice()
    .sort((x, y) => y.current_weight - x.current_weight)
    .slice(0, 6)
  const total = fin?.total_invested
  return {
    coreLabel: total != null ? 'CORE · €' + Math.round(total).toLocaleString('en-US') : 'CORE',
    meta: rows.length + ' SLEEVES' + (total != null ? ' · ' + eur(total) : ''),
    list: rows.map(h => {
      const w = h.current_weight * 100
      const tgt = h.target_weight * 100
      // some sleeves report amount 0 with their value held in legacy positions;
      // derive from weight × total so the card shows the effective value
      const value = h.amount > 0 || total == null ? h.amount : h.current_weight * total
      return {
        name: sleeveName(h.sleeve || h.key),
        tk: (ROUTE_NAMES[h.route] || String(h.route || '').toUpperCase()) + (h.units != null ? ` · ${h.units} U` : ''),
        v: eur(value),
        w,
        lo: Math.max(0, tgt - 2),
        hi: tgt + 2,
        target: tgt,
        dir: bandDir(h.band_status),
        band_status: h.band_status,
        note: h.band_status === 'within_band'
          ? `Riding inside its band at ${w.toFixed(1)}% against a ${tgt.toFixed(1)}% target. No action this cycle.`
          : h.band_status === 'above_max'
            ? `${(w - tgt).toFixed(1)} points over its ${tgt.toFixed(1)}% target. Trim only at the scheduled review — never mid-week.`
            : `${(tgt - w).toFixed(1)} points under its ${tgt.toFixed(1)}% target. Deploys route here until the band closes.`,
      }
    }),
  }
}

// ── NUTRITION ──
export function applyNutrition(d, nut) {
  if (!nut || !nut.target) return d
  const target = nut.target
  const logged = nut.logged || { total_calories: 0, total_protein_g: 0, total_carbs_g: 0, total_fat_g: 0, items: [] }
  const items = logged.items || []
  d.heroValue = String(Math.max(0, Math.round(nut.remaining_calories)))
  d.heroUnit = 'KCAL LEFT'
  d.heroLabel = `CONSUMED ${Math.round(logged.total_calories).toLocaleString('en-US')} · TARGET ${target.calories.toLocaleString('en-US')}`
  d.reactorPct = Math.min(1, logged.total_calories / target.calories) || 0.04
  const proteinPct = Math.round((logged.total_protein_g / target.protein_g) * 100)
  d.heroChips = [
    { text: nut.is_training_day ? 'TRAINING DAY' : 'REST DAY', color: ACC },
    { text: (nut.adherence_status || '').replace(/_/g, ' ').toUpperCase() || 'NO LOG', color: nut.adherence_status === 'on_track' ? G : Y },
    { text: `PROTEIN ${proteinPct}%`, color: proteinPct >= 60 ? G : Y },
  ]
  d.heroBrief = nut.recovery_protocol?.primary || d.heroBrief
  const bar = (l, cur, tgt, color) => ({ label: `${l} · ${Math.round(cur)}/${Math.round(tgt)}G`, w: Math.min(100, (cur / tgt) * 100).toFixed(0) + '%', val: Math.round((cur / tgt) * 100) + '%', color })
  d.readout = [
    { k: 'PROTEIN', v: `${Math.round(logged.total_protein_g)}/${target.protein_g}G`, w: Math.min(100, (logged.total_protein_g / target.protein_g) * 100).toFixed(0) + '%' },
    { k: 'CARBS', v: `${Math.round(logged.total_carbs_g)}/${target.carbs_g}G`, w: Math.min(100, (logged.total_carbs_g / target.carbs_g) * 100).toFixed(0) + '%' },
    { k: 'FATS', v: `${Math.round(logged.total_fat_g)}/${target.fat_g}G`, w: Math.min(100, (logged.total_fat_g / target.fat_g) * 100).toFixed(0) + '%' },
    { k: 'KCAL', v: `${Math.round(logged.total_calories)}/${target.calories}`, w: Math.min(100, (logged.total_calories / target.calories) * 100).toFixed(0) + '%' },
    { k: 'PHASE', v: (nut.phase || '—').toUpperCase(), w: '50%' },
    { k: 'MEALS', v: `${items.length} LOGGED`, w: Math.min(100, items.length * 25) + '%' },
  ]
  d.panels[0] = { code: 'MACROS', meta: 'TODAY', type: 'bars', bars: [
    bar('PROTEIN', logged.total_protein_g, target.protein_g, G),
    bar('CARBS', logged.total_carbs_g, target.carbs_g, W),
    bar('FATS', logged.total_fat_g, target.fat_g, Y),
  ] }
  d.panels[1] = { code: 'MEAL LEDGER', meta: `${items.length} LOGGED`, type: 'rows', rows: items.length
    ? items.slice(-3).map(it => ({
        title: it.name || it.item || 'Meal',
        sub: `${Math.round(it.protein_g || 0)}P · ${Math.round(it.carbs_g || 0)}C · ${Math.round(it.fat_g || 0)}F`,
        value: String(Math.round(it.calories || 0)),
        valueColor: W,
      }))
    : [{ title: 'No meals logged yet', sub: 'LOG THE FIRST MEAL BELOW', value: '—', valueColor: Y }] }
  const cum = [0]
  items.forEach(it => cum.push(cum[cum.length - 1] + (it.calories || 0)))
  if (cum.length === 1) cum.push(0)
  d.panels[2] = Object.assign(
    spark(cum, `KCAL ACCUMULATION · TARGET ${target.calories.toLocaleString('en-US')}`, Math.round(logged.total_calories).toLocaleString('en-US'), `${Math.max(0, Math.round(nut.remaining_calories))} OPEN`, G),
    { code: 'FUEL GRAPH', meta: `TARGET ${target.calories.toLocaleString('en-US')}` },
  )
  const recipes = (nut.suggested_recipes || []).slice(0, 3)
  if (recipes.length) {
    d.panels[3] = { code: 'NEXT MEAL', meta: 'SUGGESTED', type: 'rows', rows: recipes.map((rc, i) => ({
      title: rc.name,
      sub: `${(rc.tags?.[0] || rc.category || '').toUpperCase()} · ${Math.round(rc.protein_g)}G`,
      value: String(Math.round(rc.calories)),
      valueColor: i === 0 ? G : W,
    })) }
  }
  d.feed = items.length
    ? items.slice(-5).reverse().map(it => ({ t: (it.time || '').slice(0, 5) || 'TODAY', msg: `${(it.name || 'MEAL').toUpperCase()} · ${Math.round(it.calories || 0)}`, tone: 'body' }))
    : [
        { t: nut.as_of || '', msg: 'NO MEALS LOGGED YET', tone: Y },
        { t: '', msg: (nut.is_training_day ? 'TRAINING' : 'REST') + ' DAY MODE SET', tone: G },
        { t: '', msg: `TARGET ${target.calories} KCAL · ${target.protein_g}G PROTEIN`, tone: 'body' },
        { t: '', msg: 'PHASE · ' + (nut.phase || '').toUpperCase(), tone: 'soft' },
      ]
  return d
}

// budget passed into meal composer / dinner subs
export function mealBudget(nut) {
  if (!nut || !nut.target) return { kcalOpen: 860, proteinGap: 53, consumedBase: 1240, target: 2100 }
  return {
    kcalOpen: Math.max(0, Math.round(nut.remaining_calories)),
    proteinGap: Math.max(0, Math.round(nut.remaining_protein_g)),
    consumedBase: Math.round(nut.logged?.total_calories || 0),
    target: nut.target.calories,
  }
}

export function mapDinners(nut) {
  const recipes = (nut?.suggested_recipes || []).slice(0, 3)
  if (recipes.length < 2) return null
  const gap = Math.max(1, Math.round(nut.remaining_protein_g))
  const tagColor = [G, W, Y]
  return recipes.map((rc, i) => ({
    n: rc.name,
    k: Math.round(rc.calories),
    p: Math.round(rc.protein_g),
    tag: i === 0 ? 'RECOMMENDED' : (rc.tags?.[0] || rc.category || 'OPTION').toUpperCase(),
    tc: tagColor[i] || W,
    note: `${rc.serving || ''}${rc.serving ? ' — ' : ''}closes ${Math.min(100, Math.round((rc.protein_g / gap) * 100))}% of the remaining ${gap} g protein gap.`,
  }))
}

// ── TRAINING ──
export function applyTraining(d, tr) {
  if (!tr || !tr.dunk_goal) return d
  const goal = tr.dunk_goal
  const cut = tr.cut_status || {}
  const today = tr.today_session || {}
  const attemptDate = new Date(goal.attempt_window_start || goal.deadline || Date.now())
  const attemptMonth = attemptDate.toLocaleDateString('en-US', { month: 'short', year: 'numeric' }).toUpperCase()
  d.heroValue = String(goal.days_to_attempt)
  d.heroUnit = 'DAYS'
  d.heroLabel = 'TO DUNK ATTEMPT · ' + attemptMonth
  d.reactorPct = Math.min(1, Math.max(0.05, 1 - goal.days_to_attempt / 90))
  d.heroChips = [
    { text: goal.on_track ? 'ON TRACK' : 'BEHIND PLAN', color: goal.on_track ? G : R },
    { text: `${(goal.current_phase || '').replace(/_/g, ' ').toUpperCase()} · WK ${goal.current_mesocycle_week}`, color: ACC },
    { text: (today.display_name || 'NO SESSION').toUpperCase(), color: Y },
  ]
  d.heroBrief = today.notes
    ? `Today: ${today.display_name}. ${today.notes}`
    : `Today's session: ${today.display_name || 'rest'}. ${goal.days_to_attempt} days to the attempt window.`
  d.readout = [
    { k: 'BODYWEIGHT', v: `${cut.current_bodyweight_kg ?? '—'}KG`, w: '65%' },
    { k: 'BODY FAT', v: `${cut.current_bf_pct ?? '—'}%`, w: Math.min(100, (cut.current_bf_pct || 0) * 3) + '%' },
    { k: 'TARGET BF', v: `${cut.target_bf_pct ?? '—'}%`, w: Math.min(100, (cut.target_bf_pct || 0) * 3) + '%' },
    { k: 'FAT TO LOSE', v: `${cut.estimated_fat_to_lose_kg ?? '—'}KG`, w: '45%' },
    { k: 'CUT DAYS LEFT', v: String(cut.days_remaining ?? '—'), w: Math.min(100, 100 - (cut.days_remaining || 0)) + '%' },
    { k: 'WEEK SESSIONS', v: String((tr.week_sessions || []).length), w: Math.min(100, (tr.week_sessions || []).length * 15) + '%' },
  ]
  const exRows = (today.exercises || []).slice(0, 3).map(ex => ({
    title: ex.name, sub: (today.session_type || '').replace(/_/g, ' ').toUpperCase(), value: ex.label || ex.sets_reps || '—', valueColor: W,
  }))
  d.panels[0] = { code: 'SESSION', meta: (today.display_name || '—').toUpperCase(), type: 'rows', rows: exRows.length ? exRows : [{ title: 'Rest day', sub: 'NO SESSION SCHEDULED', value: '—', valueColor: G }] }
  d.panels[1] = { code: 'CUT STATUS', meta: cut.active ? 'ACTIVE' : 'OFF', type: 'bars', bars: [
    { label: `BODY FAT · ${cut.current_bf_pct}% → ${cut.target_bf_pct}%`, w: Math.min(100, ((cut.current_bf_pct - cut.target_bf_pct) / Math.max(1, cut.current_bf_pct)) * 100 + 40).toFixed(0) + '%', val: `${cut.current_bf_pct}%`, color: Y },
    { label: 'CUT RUNWAY', w: Math.min(100, 100 - (cut.days_remaining || 0)).toFixed(0) + '%', val: `${cut.days_remaining}D`, color: G },
    { label: 'FAT TO LOSE', w: Math.min(100, (cut.estimated_fat_to_lose_kg || 0) * 18).toFixed(0) + '%', val: `${cut.estimated_fat_to_lose_kg}KG`, color: W },
  ] }
  d.panels[3] = { code: 'MISSION', meta: 'DUNK · ' + attemptMonth, type: 'rows', rows: [
    { title: 'Phase', sub: (goal.current_phase || '').replace(/_/g, ' ').toUpperCase(), value: `WK ${goal.current_mesocycle_week}`, valueColor: W },
    { title: 'Attempt window', sub: (goal.attempt_window_start || '').toUpperCase(), value: `${goal.days_to_attempt}D`, valueColor: Y },
    { title: 'Projection', sub: 'CURRENT PACE', value: goal.on_track ? 'ON TRACK' : 'BEHIND', valueColor: goal.on_track ? G : R },
  ] }
  const week = tr.week_sessions || []
  d.feed = week.slice(-5).reverse().map(s => ({
    t: (s.date || '').slice(5).replace('-', '/'),
    msg: (s.display_name || s.session_type || '').toUpperCase(),
    tone: s.session_type === 'high_intensity' ? Y : 'body',
  }))
  if (!d.feed.length) d.feed = [{ t: tr.as_of || '', msg: 'NO SESSIONS THIS WEEK', tone: 'soft' }]
  return d
}

export function mapSessionExercises(tr) {
  const ex = tr?.today_session?.exercises
  if (!ex || !ex.length) return null
  const notes = (tr.today_session.notes || '').toUpperCase()
  return ex.map(e => {
    const label = e.label || e.sets_reps || '3 × 5'
    const sets = Math.min(6, Math.max(2, parseInt(label, 10) || 3))
    return { name: e.name, scheme: label.toUpperCase(), sets, tag: (tr.today_session.session_type || '').toUpperCase(), cue: notes || 'EXECUTE WITH INTENT · LOG RPE AFTER' }
  })
}

// ── CALENDAR ──
const evStart = e => e.start || e.start_time || e.begin || e.from
const evEnd = e => e.end || e.end_time || e.finish || e.to
const evTitle = e => e.title || e.name || e.summary || 'Event'
const hoursOf = e => {
  const s = new Date(evStart(e)), en = new Date(evEnd(e))
  const h = (en - s) / 36e5
  return Number.isFinite(h) && h > 0 ? h : 0
}

export function applyCalendar(d, cal, connectors) {
  if (!cal) return d
  const events = cal.events || []
  const todayISO = new Date().toISOString().slice(0, 10)
  const todays = events.filter(e => String(evStart(e) || '').slice(0, 10) === todayISO)
  const hrs = todays.reduce((acc, e) => acc + hoursOf(e), 0)
  d.heroValue = hrs ? hrs.toFixed(1) : '0'
  d.heroUnit = 'HRS'
  d.heroLabel = `SCHEDULED TODAY · ${todays.length} EVENT${todays.length === 1 ? '' : 'S'}`
  d.reactorPct = Math.min(1, Math.max(0.04, hrs / 8))
  const next = todays.find(e => new Date(evStart(e)) > new Date())
  d.heroChips = [
    { text: next ? 'NEXT · ' + String(evStart(next)).slice(11, 16) : 'NO EVENTS TODAY', color: next ? ACC : G },
    { text: `${events.length} EVENTS IN WINDOW`, color: events.length ? ACC : Y },
    { text: 'READ ONLY', color: G },
  ]
  d.heroBrief = events.length
    ? `${events.length} events in the snapshot window; ${todays.length} today. Phoenix mirrors Plaan read-only — it never edits your calendars.`
    : 'The Plaan snapshot window is empty — vacation confirmed, next season not yet published. Phoenix mirrors read-only.'
  // week readout from events (zeros when empty)
  const dayNames = ['MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT', 'SUN']
  const perDay = dayNames.map(() => 0)
  events.forEach(e => {
    const dt = new Date(evStart(e))
    if (!Number.isFinite(dt.getTime())) return
    perDay[(dt.getDay() + 6) % 7] += hoursOf(e)
  })
  const maxDay = Math.max(...perDay, 1)
  d.readout = dayNames.slice(0, 6).map((n, i) => ({ k: n, v: perDay[i].toFixed(1) + 'H', w: ((perDay[i] / maxDay) * 100).toFixed(0) + '%' }))
  d.panels[0] = { code: 'TODAY', meta: 'READ ONLY', type: 'rows', rows: todays.length
    ? todays.slice(0, 3).map(e => ({ title: evTitle(e), sub: (e.location || e.room || 'PLAAN').toUpperCase(), value: String(evStart(e)).slice(11, 16), valueColor: W }))
    : [{ title: 'No events today', sub: 'VACATION · SEASON NOT PUBLISHED', value: '—', valueColor: G }] }
  const total = perDay.reduce((x, y) => x + y, 0)
  d.panels[1] = { code: 'WEEK LOAD', meta: total.toFixed(1) + 'H', type: 'bars', bars: [
    { label: 'EVENTS IN WINDOW', w: Math.min(100, events.length * 8) + '%', val: String(events.length), color: W },
    { label: 'HOURS THIS WEEK', w: Math.min(100, total * 8).toFixed(0) + '%', val: total.toFixed(1), color: G },
    { label: 'FETCH WARNINGS', w: Math.min(100, (cal.fetch_warnings || []).length * 15) + '%', val: String((cal.fetch_warnings || []).length), color: (cal.fetch_warnings || []).length ? Y : G },
  ] }
  d.panels[2] = Object.assign(
    spark(perDay.concat([0]).slice(0, 7), 'HOURS PER DAY · SNAPSHOT WEEK', total.toFixed(1) + 'H', events.length ? 'FROM PLAAN' : 'EMPTY WINDOW', events.length ? G : Y),
    { code: 'RHYTHM', meta: '7 DAYS' },
  )
  if (connectors?.connectors) {
    const cs = connectors.connectors
    const stColor = st => (st === 'live' || st === 'healthy' || st === 'connected' ? G : st === 'fixture' ? Y : W)
    d.panels[3] = { code: 'SOURCES', meta: 'CONNECTORS', type: 'rows', rows: Object.entries(cs).slice(0, 3).map(([k, v]) => ({
      title: k.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase()),
      sub: (v.detail || (v.oauth ? 'OAUTH' : 'FEED')).toUpperCase(),
      value: (v.status || '—').replace(/_/g, ' ').toUpperCase(),
      valueColor: stColor(v.status),
    })) }
  }
  d.feed = [
    { t: (cal.as_of || '').slice(5, 10), msg: 'PLAAN SNAPSHOT LOADED', tone: G },
    { t: '', msg: `${events.length} EVENTS NORMALIZED`, tone: 'body' },
    { t: '', msg: `${(cal.fetch_warnings || []).length} FETCH WARNINGS`, tone: (cal.fetch_warnings || []).length ? Y : G },
    ...(connectors?.connectors
      ? Object.entries(connectors.connectors).slice(0, 2).map(([k, v]) => ({ t: '', msg: `${k.replace(/_/g, ' ').toUpperCase()} · ${(v.status || '').replace(/_/g, ' ').toUpperCase()}`, tone: 'soft' }))
      : []),
  ]
  return d
}

export function mapConnectorLanes(connectors) {
  if (!connectors?.connectors) return null
  const entries = Object.entries(connectors.connectors).slice(0, 3)
  const stColor = st => (st === 'live' || st === 'healthy' || st === 'connected' ? G : st === 'fixture' ? Y : W)
  return entries.map(([k, v], i) => ({
    name: k.replace(/_/g, ' ').toUpperCase(),
    c: stColor(v.status),
    st: (v.status || '—').replace(/_/g, ' ').toUpperCase(),
    sync: (v.detail || (v.oauth ? 'OAUTH' : '—')).toUpperCase(),
    scope: connectors.read_only ? 'READ ONLY' : 'READ',
    dur: [2.6, 3.6, 4.4][i] + 's',
    delay: i * 0.8 + 's',
  }))
}

// today rail events (positioned blocks) — null when there is nothing to draw
export function mapTodayRail(cal) {
  if (!cal) return null
  const events = cal.events || []
  const todayISO = new Date().toISOString().slice(0, 10)
  const todays = events.filter(e => String(evStart(e) || '').slice(0, 10) === todayISO)
  return {
    empty: todays.length === 0,
    blocks: todays.map(e => {
      const s = new Date(evStart(e)), en = new Date(evEnd(e))
      return {
        s: s.getHours() + s.getMinutes() / 60,
        e: en.getHours() + en.getMinutes() / 60,
        n: evTitle(e),
        m: (e.location || e.room || 'PLAAN').toUpperCase(),
        c: W,
        time: `${pad2(s.getHours())}:${pad2(s.getMinutes())}–${pad2(en.getHours())}:${pad2(en.getMinutes())}`,
      }
    }),
    stats: [
      { k: 'SCHEDULED', v: todays.reduce((acc, e) => acc + hoursOf(e), 0).toFixed(1) + 'H', c: W },
      { k: 'EVENTS', v: String(todays.length), c: W },
      { k: 'SNAPSHOT AS OF', v: (cal.as_of || '—').slice(0, 10), c: G },
      { k: 'FETCH WARNINGS', v: String((cal.fetch_warnings || []).length), c: (cal.fetch_warnings || []).length ? Y : G },
    ],
  }
}
