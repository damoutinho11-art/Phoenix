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
    'Today',
    'Week',
    'Feeds',
    'Brief',
    'phx-calendar-v18',
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
