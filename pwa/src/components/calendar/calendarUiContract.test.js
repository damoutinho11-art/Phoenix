import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'

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
    'Calendar Brief',
    'Calendar Feeds',
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
