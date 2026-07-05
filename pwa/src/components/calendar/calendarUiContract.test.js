import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'

test('calendar command hero restores its top-safe inset after parity overrides', async () => {
  const css = await readFile(new URL('../cockpit/cockpit.css', import.meta.url), 'utf8')
  const parityIndex = css.indexOf('CALENDAR_V19_NUTRITION_SPACING_PARITY')
  const topSafeIndex = css.indexOf('CALENDAR_TOP_SAFE_V21')

  assert.ok(parityIndex >= 0)
  assert.ok(topSafeIndex > parityIndex)
  assert.match(
    css.slice(topSafeIndex),
    /\.phx-calendar-v19 \.phx-command-hero\s*\{\s*padding-top:\s*clamp\(1\.25rem, 1\.8vw, 1\.75rem\)\s*!important;/,
  )
})

test('calendar dashboard uses final polished command center implementation', async () => {
  const source = await readFile(new URL('./CalendarDashboard.jsx', import.meta.url), 'utf8')

  for (const token of [
    'CockpitShell',
    'DataPanel',
    'StatusChip',
    'SourceStamp',
    'CALENDAR',
    'COMMAND CENTER',
    'TODAY LOAD',
    'CalendarCore',
    'Today Snapshot',
    'Week Preview',
    'Next Move',
    'VISIBLE BLOCK',
    'BRIEF OFFLINE',
    'Calendar Routes',
    'phx-calendar-section-screen',
    'CALENDAR BRIEF',
    'Stage Events',
    'Rehearsals',
    'Visible Today',
    'Performance Rows',
    'STAGE OPERATIONS',
    'PERFORMANCE COMMAND',
    'Performance Command',
    'CalendarPerformancesCommand',
    'PerformanceAgendaItem',
    'PerformanceFocusCard',
    'isPerformanceRow',
    'NO AI CERTAINTY CLAIMS',
    'Source Confidence',
    'Today Load',
    'Next Visible',
    'Brief Status',
    'BRIEF COMMAND',
    'Daily Brief',
    'CalendarBriefCommand',
    'BriefMetricCard',
    'CALENDAR FEEDS',
    'Connector truth only',
    'No Gmail sends',
    'Brief Source',
    'Google Calendar',
    'ICS Feed',
    'Plaan Snapshot',
    'SOURCE READINESS',
    'live here - not in the hero',
    'SOURCE READINESS',
    'Feed Readiness',
    'CalendarFeedsCommand',
    'FeedHealthCard',
    'BACK TO COMMAND CENTER',
    'Section Routes',
    'calendarSection',
    'Today',
    'Week',
    'Feeds',
    'Brief',
    'phx-calendar-v18',
    'phx-calendar-v19',
    'phx-calendar-core-reactor',
    'phx-calendar-core-scan',
    'phx-calendar-core-metrics',
    'Operational Rail',
    'TODAY RAIL',
    'phx-calendar-today-rail',
    'WeekCommandMap',
    'CalendarActiveSubsection',
    'Weekly Rhythm',
    'WEEK COMMAND MAP',
    'phx-calendar-week-command-map',
    'PERFORMANCE LOAD',
  ]) assert.match(source, new RegExp(token))
})

test('calendar cockpit stays read-only and avoids duplicated panels', async () => {
  const source = await readFile(new URL('./CalendarDashboard.jsx', import.meta.url), 'utf8')

  assert.match(source, /getCalendarSnapshot/)
  assert.match(source, /READ ONLY/i)
  assert.match(source, /No Plaan mutations\. No Google writes\./i)
  assert.doesNotMatch(source, /HeroCalendarPlate|Source Signals|SOURCE SIGNALS|Calendar Actions|Schedule Queue|phx-calendar-v1[0-7]/i)
  assert.doesNotMatch(source, /getCrossDomainAlerts|postCalendar|updateCalendar|deleteCalendar|createCalendar|createEvent|updateEvent|deleteEvent|send_email|gmail\.send/i)
})

test('calendar radial core and subsection css is present and always-on', async () => {
  const css = await readFile(new URL('../cockpit/cockpit.css', import.meta.url), 'utf8')

  for (const token of [
    'CALENDAR_CORE_PARITY_RADIAL_V19',
    'CALENDAR_V19_SPACING_BALANCE',
    'CALENDAR_V19_NUTRITION_SPACING_PARITY',
    'CALENDAR_V19_FINAL_COMPACT_PARITY',
    'CALENDAR_V19_LOWER_PANEL_SPACING_LOCK',
    'CALENDAR_V19_PREMIUM_GLOW_PASS',
    'CALENDAR_TODAY_COMMAND_RAIL_V1',
    'CALENDAR_WEEK_COMMAND_MAP_V1',
    'CALENDAR_SUBSECTION_ROUTER_V2',
    'CALENDAR_SUBSECTION_ROUTER_V3',
    'CALENDAR_SECTION_SCREEN_V1',
    'CALENDAR_FEEDS_COMMAND_V1',
    'CALENDAR_FEEDS_VISUAL_POLISH_V2',
    'CALENDAR_BRIEF_COMMAND_V1',
    'CALENDAR_PERFORMANCES_COMMAND_V1',
    'CALENDAR_SUBSECTION_POLISH_V1',
    'phxCalendarRingRotate',
    'phxCalendarRingBreath',
    'phxCalendarScanSweep',
    'phxCalendarActiveDayPulse',
  ]) assert.match(css, new RegExp(token))

  assert.doesNotMatch(css, /pauseBtn|paused/i)
})


test('calendar subsections are routed instead of stacked', async () => {
  const source = await readFile(new URL('./CalendarDashboard.jsx', import.meta.url), 'utf8')

  assert.match(source, /function CalendarActiveSubsection/)
  assert.match(source, /activeMode === 'week'/)
  assert.match(source, /activeMode === 'performances'/)
  assert.equal((source.match(/<CalendarActiveSubsection/g) || []).length, 1)
  assert.equal((source.match(/title="Today Command Rail"/g) || []).length, 0)
  assert.match(source, /title="Operational Rail"/)
  assert.equal((source.match(/title="Week Command Map"/g) || []).length, 0)
  assert.match(source, /title="Weekly Rhythm"/)
})





test('calendar subsections render as standalone screens outside command center', async () => {
  const source = await readFile(new URL('./CalendarDashboard.jsx', import.meta.url), 'utf8')

  assert.match(source, /const \[calendarSection, setCalendarSection\] = useState\('command'\)/)
  assert.match(source, /calendarSection !== 'command'/)
  assert.match(source, /phx-calendar-section-screen/)
  assert.match(source, /BACK TO COMMAND CENTER/)
  assert.match(source, /Section Routes/)
  assert.equal((source.match(/<CalendarActiveSubsection/g) || []).length, 1)

  const commandRoutesIndex = source.indexOf('title="Calendar Routes"')
  const routedSubsectionIndex = source.indexOf('<CalendarActiveSubsection')
  assert.ok(routedSubsectionIndex < commandRoutesIndex, 'routed subsection should live in standalone section return before command-center routes')
})


test('calendar standalone subsection polish removes duplicate title pressure', async () => {
  const source = await readFile(new URL('./CalendarDashboard.jsx', import.meta.url), 'utf8')
  const css = await readFile(new URL('../cockpit/cockpit.css', import.meta.url), 'utf8')

  assert.match(source, /title="Operational Rail"/)
  assert.match(source, /title="Weekly Rhythm"/)
  assert.match(source, /title="Section Routes"/)
  assert.match(source, /phx-calendar-week-map-kicker/)
  assert.doesNotMatch(source, /title="Today Command Rail"/)
  assert.doesNotMatch(source, /title="Week Command Map"/)
  assert.match(css, /CALENDAR_SUBSECTION_POLISH_V1/)
})


test('calendar feeds subsection exposes read-only connector truth', async () => {
  const source = await readFile(new URL('./CalendarDashboard.jsx', import.meta.url), 'utf8')
  const css = await readFile(new URL('../cockpit/cockpit.css', import.meta.url), 'utf8')

  for (const token of [
    'function CalendarFeedsCommand',
    'Feed Readiness',
    'SOURCE READINESS',
    'Plaan Snapshot',
    'ICS Feed',
    'Google Calendar',
    'Brief Source',
    'No Gmail sends',
    'Connector truth only',
  ]) assert.match(source, new RegExp(token))

  assert.doesNotMatch(source, /createEvent|updateEvent|deleteEvent|send_email|gmail\.send|postCalendar/i)
  assert.match(css, /CALENDAR_FEEDS_COMMAND_V1/)
})


test('calendar feeds visual polish removes mojibake and duplicate title pressure', async () => {
  const source = await readFile(new URL('./CalendarDashboard.jsx', import.meta.url), 'utf8')
  const css = await readFile(new URL('../cockpit/cockpit.css', import.meta.url), 'utf8')

  assert.match(source, /SOURCE READINESS/)
  assert.match(source, /live here - not in the hero/)
  assert.doesNotMatch(source, /\?\?\?/)
  assert.match(css, /CALENDAR_FEEDS_VISUAL_POLISH_V2/)
})



test('calendar brief subsection exposes honest read-only synthesis', async () => {
  const source = await readFile(new URL('./CalendarDashboard.jsx', import.meta.url), 'utf8')
  const css = await readFile(new URL('../cockpit/cockpit.css', import.meta.url), 'utf8')

  for (const token of [
    'function CalendarBriefCommand',
    'Daily Brief',
    'BRIEF COMMAND',
    'Brief Status',
    'Next Visible',
    'Today Load',
    'Source Confidence',
    'NO AI CERTAINTY CLAIMS',
    'No Gmail sends',
  ]) assert.match(source, new RegExp(token))

  assert.doesNotMatch(source, /createEvent|updateEvent|deleteEvent|send_email|gmail\.send|postCalendar/i)
  assert.match(css, /CALENDAR_BRIEF_COMMAND_V1/)
})



test('calendar performances subsection exposes stage operations read-only view', async () => {
  const source = await readFile(new URL('./CalendarDashboard.jsx', import.meta.url), 'utf8')
  const css = await readFile(new URL('../cockpit/cockpit.css', import.meta.url), 'utf8')

  for (const token of [
    'function CalendarPerformancesCommand',
    'function isPerformanceRow',
    'Performance Command',
    'PERFORMANCE COMMAND',
    'STAGE OPERATIONS',
    'Performance Rows',
    'Visible Today',
    'Rehearsals',
    'Stage Events',
    'No Plaan mutations',
    'No Google writes',
    'No Gmail sends',
  ]) assert.match(source, new RegExp(token))

  assert.doesNotMatch(source, /createEvent|updateEvent|deleteEvent|send_email|gmail\.send|postCalendar/i)
  assert.match(css, /CALENDAR_PERFORMANCES_COMMAND_V1/)
})
