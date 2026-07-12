// Holo Command UI — fixture data, copied verbatim from the v7 design
// reference's DOMAINS object and sub-screen view models. This is the single
// file to replace when wiring real sources (finance API, nutrition log,
// training engine, calendar snapshot).

import { ACC, G, Y, R, W, BODY, mix, spark } from './holoTokens'

const chip = (text, color) => ({ text, color })

// feed msgColor tones: 'body' (neutral copy), 'soft' (dimmer), or a status color
export function feedColor(tone) {
  if (tone === 'body') return mix(BODY, 96)
  if (tone === 'soft') return mix(BODY, 72)
  return tone
}

export function buildDomains(dayPart) {
  return {
    home: {
      bootLine: 'SYS.CORE // AWAITING DIRECTIVE',
      heroValue: 'PHOENIX',
      heroUnit: 'OS v2.5',
      heroLabel: 'PERSONAL OPERATIONS INTELLIGENCE',
      reactorPct: 1,
      heroChips: [chip('SYSTEMS NOMINAL', G), chip('4 MODULES LINKED', ACC), chip('VOICE READY', Y)],
      heroBrief: `Good ${dayPart}, Diogo. All systems nominal — four modules standing by. Speak or type a directive.`,
      heroActions: [],
      readout: [],
      feed: [],
      panels: [],
    },
    finance: {
      bootLine: 'SYS.FINANCE // PORTFOLIO PROJECTION ACTIVE',
      heroValue: '€1,893',
      heroUnit: '.33 EUR',
      heroLabel: 'TOTAL PORTFOLIO VALUE',
      reactorPct: 0.72,
      heroChips: [chip('PHASE 1 · ACCUMULATION', ACC), chip('+€112.40 · +6.31%', G), chip('1 DRIFT ALERT', Y)],
      heroBrief: 'Deploy this week’s €85.00 into Global Core via VWCE on Lightyear. Manual only — nothing is ordered or executed for you.',
      heroActions: [
        { label: 'APPROVE WEEK', sub: 'approve', primary: true },
        { label: 'HOLDINGS', sub: 'holdings' },
        { label: 'BRIEF', sub: 'brief' },
      ],
      readout: [
        { k: 'GLOBAL CORE', v: '42.0%', w: '42%' }, { k: 'NASDAQ', v: '18.0%', w: '18%' },
        { k: 'QUALITY', v: '10.0%', w: '10%' }, { k: 'BITCOIN', v: '15.0%', w: '15%' },
        { k: 'DISCOVERY', v: '8.0%', w: '8%' }, { k: 'CASH', v: '7.0%', w: '7%' },
      ],
      feed: [
        { t: '09:41', msg: 'PRICES REFRESHED', tone: 'body' },
        { t: '09:40', msg: 'DRIFT SCAN · 1 ALERT', tone: Y },
        { t: '08:12', msg: 'WEEKLY BRIEF READY', tone: 'body' },
        { t: 'MON', msg: 'W28 PLAN GENERATED', tone: 'soft' },
        { t: 'SUN', msg: 'DEPOSIT €85 DETECTED', tone: G },
      ],
      panels: [
        { code: 'ALLOCATION', meta: '6 SLEEVES', type: 'bars', bars: [
          { label: 'GLOBAL CORE', w: '84%', val: '42.0%', color: G },
          { label: 'GROWTH NASDAQ', w: '72%', val: '18.0%', color: W },
          { label: 'BITCOIN · OVER', w: '100%', val: '15.0%', color: R },
          { label: 'CASH · UNDER', w: '58%', val: '7.0%', color: Y },
        ] },
        { code: 'THIS WEEK', meta: 'MANUAL ONLY', type: 'rows', rows: [
          { title: 'Buy VWCE', sub: 'LIGHTYEAR · VERIFIED', value: '€85.00', valueColor: W },
          { title: 'Approval', sub: 'W28 CHECKLIST', value: 'PENDING', valueColor: Y },
          { title: 'Auto-execution', sub: 'PHOENIX NEVER TRADES', value: 'OFF', valueColor: G },
        ] },
        Object.assign(
          spark([1720, 1748, 1735, 1781, 1804, 1842, 1836, 1871, 1893], '90-DAY VALUE TREND · EUR', '+6.31%', '+€112.40', G),
          { code: 'PERFORMANCE', meta: '90 DAYS' },
        ),
        { code: 'DRIFT WATCH', meta: '1 ALERT', type: 'rows', rows: [
          { title: 'Bitcoin sleeve', sub: '+3.0% OVER BAND', value: 'TRIM', valueColor: Y },
          { title: 'Cash reserve', sub: '−3.0% UNDER BAND', value: 'FEED', valueColor: W },
          { title: 'Other sleeves', sub: 'WITHIN BANDS', value: 'HOLD', valueColor: G },
        ] },
      ],
    },
    nutrition: {
      bootLine: 'SYS.NUTRITION // FUEL PROJECTION ACTIVE',
      heroValue: '860',
      heroUnit: 'KCAL LEFT',
      heroLabel: 'CONSUMED 1,240 · TARGET 2,100',
      reactorPct: 0.59,
      heroChips: [chip('TRAINING DAY', ACC), chip('ON TRACK', G), chip('PROTEIN 68%', Y)],
      heroBrief: 'A high-protein dinner keeps every target in reach. Salmon + potatoes closes most of the remaining 53 g protein gap.',
      heroActions: [
        { label: 'LOG MEAL', sub: 'logmeal', primary: true },
        { label: 'BUILD DINNER', sub: 'dinner' },
        { label: 'PLAN DAY', sub: 'planday' },
      ],
      readout: [
        { k: 'PROTEIN', v: '112/165G', w: '68%' }, { k: 'CARBS', v: '128/232G', w: '55%' },
        { k: 'FATS', v: '27/68G', w: '40%' }, { k: 'FIBER', v: '19/30G', w: '63%' },
        { k: 'WATER', v: '1.9/3.0L', w: '63%' }, { k: 'MEALS', v: '3 LOGGED', w: '75%' },
      ],
      feed: [
        { t: '13:20', msg: 'SKYR + ALMONDS · 180', tone: 'body' },
        { t: '12:05', msg: 'CHICKEN RICE BOWL · 540', tone: 'body' },
        { t: '08:30', msg: 'OATS + WHEY · 520', tone: 'body' },
        { t: '08:00', msg: 'TRAINING DAY MODE SET', tone: G },
        { t: 'TUE', msg: 'PROTEIN SHORT −18G', tone: Y },
      ],
      panels: [
        { code: 'MACROS', meta: 'TODAY', type: 'bars', bars: [
          { label: 'PROTEIN · 112/165G', w: '68%', val: '68%', color: G },
          { label: 'CARBS · 128/232G', w: '55%', val: '55%', color: W },
          { label: 'FATS · 27/68G', w: '40%', val: '40%', color: Y },
        ] },
        { code: 'MEAL LEDGER', meta: '3 LOGGED', type: 'rows', rows: [
          { title: 'Oats + whey + berries', sub: '42P · 61C · 11F', value: '520', valueColor: W },
          { title: 'Chicken rice bowl', sub: '48P · 55C · 14F', value: '540', valueColor: W },
          { title: 'Skyr + almonds', sub: '22P · 12C · 9F', value: '180', valueColor: W },
        ] },
        Object.assign(
          spark([420, 940, 940, 1240, 1240, 1860], 'KCAL ACCUMULATION → NEXT MEAL', '1,240', '860 OPEN', G),
          { code: 'FUEL GRAPH', meta: 'TARGET 2,100' },
        ),
        { code: 'NEXT MEAL', meta: 'PREVIEW', type: 'rows', rows: [
          { title: 'Salmon + potatoes', sub: 'HIGH PROTEIN · 45G', value: '620', valueColor: G },
          { title: 'Eggs + rye toast', sub: 'LIGHT · 28G', value: '430', valueColor: W },
          { title: 'Chickpea curry', sub: 'PANTRY · 31G', value: '560', valueColor: W },
        ] },
      ],
    },
    training: {
      bootLine: 'SYS.TRAINING // MISSION PROJECTION ACTIVE',
      heroValue: '53',
      heroUnit: 'DAYS',
      heroLabel: 'TO DUNK ATTEMPT · AUG 2026',
      reactorPct: 0.82,
      heroChips: [chip('ON TRACK', G), chip('WEEK 3 OF 10', ACC), chip('HIGH NEURAL TODAY', Y)],
      heroBrief: 'Max-intent jumps + heavy strength today. Recovery at 82% — run the readiness scan before heavy lower-body work.',
      heroActions: [
        { label: '▶ START SESSION', sub: 'session', primary: true },
        { label: 'READINESS', sub: 'readiness' },
        { label: 'LOG SLEEP', sub: 'sleep' },
      ],
      readout: [
        { k: 'RECOVERY', v: '82%', w: '82%' }, { k: 'SLEEP', v: '7H 40M', w: '86%' },
        { k: 'SORENESS', v: 'MODERATE', w: '58%' }, { k: 'SESSIONS', v: '14', w: '70%' },
        { k: 'VERT', v: '31.5"', w: '78%' }, { k: 'BODYWEIGHT', v: '78.4KG', w: '65%' },
      ],
      feed: [
        { t: '07:10', msg: 'READINESS SCAN CLEAR', tone: G },
        { t: '07:00', msg: 'SLEEP LOGGED 7H 40M', tone: 'body' },
        { t: 'YDAY', msg: 'TEMPO RUN COMPLETE', tone: 'body' },
        { t: 'TUE', msg: 'VERT PB +0.4"', tone: G },
        { t: 'MON', msg: 'SORENESS HIGH · QUADS', tone: Y },
      ],
      panels: [
        { code: 'SESSION', meta: 'HIGH NEURAL', type: 'rows', rows: [
          { title: 'Approach jumps', sub: 'MAX INTENT', value: '6 × 3', valueColor: W },
          { title: 'Trap bar deadlift', sub: 'STRENGTH', value: '4×3 @85%', valueColor: W },
          { title: 'Depth drops', sub: 'PLYOMETRIC', value: '3 × 5', valueColor: W },
        ] },
        { code: 'RECOVERY', meta: 'CHECK-IN', type: 'bars', bars: [
          { label: 'READINESS', w: '82%', val: '82%', color: G },
          { label: 'SLEEP QUALITY', w: '86%', val: '7H 40M', color: G },
          { label: 'SORENESS LOAD', w: '58%', val: 'MED', color: Y },
        ] },
        Object.assign(
          spark([29.2, 29.4, 29.9, 30.1, 30.0, 30.6, 31.1, 31.5], 'VERTICAL JUMP · INCHES', '31.5"', '+2.3" THIS BLOCK', G),
          { code: 'TELEMETRY', meta: 'WK 1–3' },
        ),
        { code: 'MISSION', meta: 'DUNK · AUG 2026', type: 'rows', rows: [
          { title: 'Phase', sub: 'ACCUMULATION', value: 'WK 3/10', valueColor: W },
          { title: 'Gap to target', sub: 'RIM 305CM', value: '+4.5"', valueColor: Y },
          { title: 'Projection', sub: 'CURRENT PACE', value: 'ON TRACK', valueColor: G },
        ] },
      ],
    },
    calendar: {
      bootLine: 'SYS.CALENDAR // SCHEDULE PROJECTION ACTIVE',
      heroValue: '6.5',
      heroUnit: 'HRS',
      heroLabel: 'SCHEDULED TODAY · 3 EVENTS',
      reactorPct: 0.41,
      heroChips: [chip('NEXT · 10:00', ACC), chip('1 BUFFER WARNING', Y), chip('READ ONLY', G)],
      heroBrief: 'Two rehearsals and one training block. The 30-minute gap before the evening rehearsal is the only pressure point.',
      heroActions: [
        { label: 'TODAY RAIL', sub: 'today', primary: true },
        { label: 'WEEK MAP', sub: 'weekmap' },
        { label: 'FEEDS', sub: 'feeds' },
      ],
      readout: [
        { k: 'MON', v: '3.5H', w: '44%' }, { k: 'TUE', v: '5.0H', w: '63%' },
        { k: 'WED', v: '2.0H', w: '25%' }, { k: 'THU', v: '7.5H', w: '94%' },
        { k: 'FRI', v: '4.0H', w: '50%' }, { k: 'SAT', v: '2.5H', w: '31%' },
      ],
      feed: [
        { t: '08:12', msg: 'PLAAN SNAPSHOT SYNCED', tone: G },
        { t: '08:12', msg: '11 BLOCKS NORMALIZED', tone: 'body' },
        { t: '08:11', msg: 'BUFFER CHECK · 1 TIGHT', tone: Y },
        { t: 'YDAY', msg: 'ICS FEED HEALTHY', tone: 'body' },
        { t: 'YDAY', msg: 'GOOGLE READ-ONLY OK', tone: 'body' },
      ],
      panels: [
        { code: 'TODAY', meta: 'READ ONLY', type: 'rows', rows: [
          { title: 'Orchestra rehearsal', sub: 'CONCERT HALL · CHORUS', value: '10:00', valueColor: Y },
          { title: 'Training session', sub: 'GYM · HIGH NEURAL', value: '15:30', valueColor: G },
          { title: 'Evening rehearsal', sub: '30M BUFFER · TIGHT', value: '18:30', valueColor: R },
        ] },
        { code: 'WEEK LOAD', meta: '24.5H', type: 'bars', bars: [
          { label: 'REHEARSAL', w: '66%', val: '4', color: W },
          { label: 'PERFORMANCE', w: '33%', val: '2', color: Y },
          { label: 'TRAINING', w: '50%', val: '3', color: G },
        ] },
        Object.assign(
          spark([3.5, 5, 2, 7.5, 4, 2.5, 0], 'HOURS PER DAY · THIS WEEK', '24.5H', 'THU PEAK', Y),
          { code: 'RHYTHM', meta: '7 DAYS' },
        ),
        { code: 'SOURCES', meta: 'CONNECTORS', type: 'rows', rows: [
          { title: 'Plaan snapshot', sub: 'JUL 10 · 08:12', value: 'LIVE', valueColor: G },
          { title: 'Google Calendar', sub: 'NO WRITE CLIENT', value: 'LOCKED', valueColor: W },
          { title: 'ICS feed', sub: 'DIAGNOSTICS', value: 'READ', valueColor: W },
        ] },
      ],
    },
  }
}

// ── sub-screen shell metadata: crumb / meta / width ──
export const SUB_META = {
  holdings: ['SYS.FINANCE // HOLDINGS MAP', '6 SLEEVES · €1,893.33', 'min(1020px, calc(100vw - 26px))'],
  approve: ['SYS.FINANCE // W28 APPROVAL', 'MANUAL EXECUTION ONLY', 'min(900px, calc(100vw - 26px))'],
  brief: ['SYS.FINANCE // WEEKLY BRIEF', 'W28 · JUL 07–13', 'min(780px, calc(100vw - 26px))'],
  logmeal: ['SYS.NUTRITION // MEAL COMPOSER', '860 KCAL OPEN', 'min(1020px, calc(100vw - 26px))'],
  dinner: ['SYS.NUTRITION // DINNER CANDIDATES', 'PROTEIN GAP 53G', 'min(1000px, calc(100vw - 26px))'],
  planday: ['SYS.NUTRITION // FUEL TIMELINE', 'TARGET 2,100 KCAL', 'min(1020px, calc(100vw - 26px))'],
  session: ['SYS.TRAINING // LIVE SESSION', 'HIGH NEURAL · WEEK 3', 'min(1020px, calc(100vw - 26px))'],
  readiness: ['SYS.TRAINING // READINESS SCAN', 'BIOMETRIC SWEEP', 'min(940px, calc(100vw - 26px))'],
  sleep: ['SYS.TRAINING // SLEEP LOG', 'RECOVERY INPUT', 'min(860px, calc(100vw - 26px))'],
  today: ['SYS.CALENDAR // TODAY RAIL', 'FRI JUL 11 · READ ONLY', 'min(980px, calc(100vw - 26px))'],
  weekmap: ['SYS.CALENDAR // WEEK LOAD MAP', 'W28 · 24.5H', 'min(980px, calc(100vw - 26px))'],
  feeds: ['SYS.CALENDAR // CONNECTOR MESH', '3 SOURCES · READ ONLY', 'min(900px, calc(100vw - 26px))'],
}

// ── FINANCE fixtures ──
export const HOLDINGS = [
  { name: 'GLOBAL CORE', tk: 'VWCE · LIGHTYEAR · UCITS', v: '€795.20', w: 42, lo: 40, hi: 45, dir: 'HOLD', note: 'Backbone sleeve — all-world equity. This week’s €85.00 deploy lands here to feed the underweight cash later.' },
  { name: 'NASDAQ', tk: 'EQQQ · LIGHTYEAR · UCITS', v: '€340.80', w: 18, lo: 15, hi: 20, dir: 'HOLD', note: 'Growth tilt riding inside its band. No action required this cycle.' },
  { name: 'QUALITY', tk: 'IWQU · LIGHTYEAR · UCITS', v: '€189.33', w: 10, lo: 8, hi: 12, dir: 'HOLD', note: 'Defensive quality factor — steady inside band, lowest volatility sleeve.' },
  { name: 'BITCOIN', tk: 'COLD WALLET · SELF-CUSTODY', v: '€284.00', w: 15, lo: 10, hi: 12, dir: 'TRIM', note: '+3.0% over band after the rally. Trim into cash at the next scheduled review — never mid-week.' },
  { name: 'DISCOVERY', tk: 'SATELLITE PICKS · 3 NAMES', v: '€151.47', w: 8, lo: 5, hi: 10, dir: 'HOLD', note: 'High-conviction satellite sleeve. Risk hard-capped at 10% of portfolio.' },
  { name: 'CASH', tk: 'EUR BUFFER · INSTANT', v: '€132.53', w: 7, lo: 10, hi: 12, dir: 'FEED', note: '−3.0% under band — the bitcoin trim routes here to restore the buffer.' },
]
export const HOLDING_ANGLES = [-118, -62, 22, 90, 158, 212]
export const HOLDING_RADII = [43, 36, 38, 34, 38, 34]

export const APPROVE_CHECKS = [
  { t: 'Deposit detected', s: '€85.00 ARRIVED SUNDAY · LIGHTYEAR CASH' },
  { t: 'Prices refreshed', s: 'ALL QUOTES < 24H OLD' },
  { t: 'Drift reviewed', s: '1 ALERT — BITCOIN +3.0% · TRIM AT REVIEW' },
  { t: 'Manual order ready', s: 'BUY VWCE €85.00 · YOU EXECUTE' },
]

export const BRIEF_TEXT =
  'PHOENIX WEEKLY BRIEF · W28 · JUL 07–13\n\n▸ PORTFOLIO — €1,893.33, up €112.40 (+6.31%) on the quarter. The 90-day trend is intact; no sleeve broke its risk limit this week.\n\n▸ THIS WEEK’S DEPLOY — €85.00 into Global Core (VWCE) on Lightyear. The order is prepared but never executed by Phoenix — you place it manually.\n\n▸ DRIFT — Bitcoin sits +3.0% over its 10–12% band after the rally; cash is −3.0% under. Recommended: trim BTC into cash at the next review, not before.\n\n▸ WATCH — ECB rate decision Thursday. Historically noise for this allocation; no pre-positioning.\n\n▸ DISCIPLINE — 14 consecutive weeks deployed on schedule. Phase 1 (Accumulation) completes in 9 weeks at current pace.'

// ── NUTRITION fixtures ──
// f/c are approximate macros so composed meals POST with a full profile
export const FOODS = [
  { id: 'salmon', n: 'Salmon fillet', k: 320, p: 34, f: 18, c: 0 },
  { id: 'chick', n: 'Chicken breast', k: 220, p: 42, f: 5, c: 0 },
  { id: 'pot', n: 'Roast potatoes', k: 180, p: 4, f: 4, c: 30 },
  { id: 'rice', n: 'Rice · cup', k: 210, p: 5, f: 1, c: 45 },
  { id: 'eggs', n: 'Eggs × 2', k: 160, p: 13, f: 11, c: 1 },
  { id: 'skyr', n: 'Skyr bowl', k: 120, p: 22, f: 0, c: 7 },
  { id: 'whey', n: 'Whey shake', k: 130, p: 25, f: 2, c: 4 },
  { id: 'toast', n: 'Rye toast', k: 90, p: 3, f: 1, c: 17 },
]

export const DINNERS = [
  { n: 'Salmon + potatoes', k: 620, p: 45, tag: 'RECOMMENDED', tc: G, note: 'Closes the protein gap almost fully and lands inside the kcal window with 240 to spare.' },
  { n: 'Eggs + rye toast', k: 430, p: 28, tag: 'LIGHT', tc: W, note: 'Leaves 430 kcal open — pair with a casein shake before bed to finish the gap.' },
  { n: 'Chickpea curry', k: 560, p: 31, tag: 'PANTRY', tc: Y, note: 'Zero shopping required. Runs 22 g short of the protein target — add skyr on the side.' },
]

export const FUEL_NODES = [
  { t: '08:30', h: 8.5, n: 'Oats + whey', k: 520, st: 'log', up: true },
  { t: '12:05', h: 12.08, n: 'Chicken bowl', k: 540, st: 'log', up: false },
  { t: '13:20', h: 13.33, n: 'Skyr + almonds', k: 180, st: 'log', up: true },
  { t: '19:30', h: 19.5, n: 'Dinner · projected', k: 620, st: 'proj', up: false },
  { t: '22:00', h: 22, n: 'Casein · optional', k: 180, st: 'opt', up: true },
]
export const FUEL_CURVE = [[6, 0], [8.5, 520], [12.08, 1060], [13.33, 1240], [19.5, 1860], [22, 2040], [24, 2040]]

// ── TRAINING fixtures ──
export const SESSION_EXERCISES = [
  { name: 'Approach jumps', scheme: '6 × 3 · MAX INTENT', sets: 6, tag: 'PLYO', cue: 'FULL APPROACH · PENULTIMATE STEP LONG · STICK EVERY LANDING' },
  { name: 'Trap bar deadlift', scheme: '4 × 3 @ 85%', sets: 4, tag: 'STRENGTH', cue: 'BAR SPEED OVER LOAD · BRACE HARD · KILL THE REP IF SPEED DROPS' },
  { name: 'Depth drops', scheme: '3 × 5', sets: 3, tag: 'PLYO', cue: 'SOFT KNEES · MINIMAL GROUND TIME · WATCH QUAD SIGNAL' },
]

export const READINESS_GAUGES = [
  { l: 'READINESS INDEX', v: '82%', w: '82%', c: G },
  { l: 'SLEEP QUALITY · 7H 40M', v: '86%', w: '86%', c: G },
  { l: 'HRV BALANCE', v: '64%', w: '64%', c: W },
  { l: 'SORENESS LOAD · QUADS', v: '58%', w: '58%', c: Y },
]

// ── CALENDAR fixtures ──
export const DAY_BLOCKS = [
  { s: 10, e: 12.5, n: 'Orchestra rehearsal', m: 'CONCERT HALL · CHORUS + ORCHESTRA', c: W, time: '10:00–12:30' },
  { s: 15.5, e: 17, n: 'Training session', m: 'GYM · HIGH NEURAL · READINESS 82%', c: G, time: '15:30–17:00' },
  { s: 18.5, e: 21, n: 'Evening rehearsal', m: 'CITY CHURCH · CHAMBER SET', c: R, time: '18:30–21:00' },
]
export const DAY_STATS = [
  { k: 'SCHEDULED', v: '6.5H', c: W },
  { k: 'EVENTS', v: '3', c: W },
  { k: 'LARGEST FREE BLOCK', v: '2.5H', c: G },
  { k: 'BUFFER WARNINGS', v: '1', c: Y },
]

export const WEEK_EVENTS = {
  MON: [[10, 12, W], [18, 19.5, G]],
  TUE: [[10, 13, W], [17, 19, G]],
  WED: [[18, 20, G]],
  THU: [[9, 13, W], [18.5, 22, Y]],
  FRI: [[10, 12.5, W], [15.5, 17, G], [18.5, 21, W]],
  SAT: [[20, 22, Y]],
  SUN: [],
}
export const WEEK_TOTALS = { MON: '3.5', TUE: '5.0', WED: '2.0', THU: '7.5', FRI: '4.0', SAT: '2.5', SUN: '—' }

export const FEED_LANES = [
  { name: 'PLAAN SNAPSHOT', c: G, st: 'LIVE', sync: 'JUL 10 · 08:12', scope: 'FULL SCHEDULE · READ', dur: '2.6s', delay: '0s' },
  { name: 'GOOGLE CALENDAR', c: W, st: 'LOCKED', sync: 'JUL 10 · 08:11', scope: 'BUSY/FREE · READ-ONLY', dur: '3.6s', delay: '.8s' },
  { name: 'ICS FEED', c: G, st: 'HEALTHY', sync: 'JUL 09 · 22:40', scope: 'DIAGNOSTICS · READ', dur: '4.4s', delay: '1.6s' },
]
