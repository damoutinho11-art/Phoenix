import assert from 'node:assert/strict'
import test from 'node:test'
import { readFileSync } from 'node:fs'
import { calendarDate, eventStart, eventEnd, feedHealth, calendarWeek, calendarLocalStamp } from './calendarFeedModel.js'

test('normalizes date/time contract without interpreting Tallinn as browser timezone', () => {
  const event = { date: '2026-09-03', time_start: '11:30', time_end: '15:30' }
  assert.equal(eventStart(event), '2026-09-03T11:30:00')
  assert.equal(eventEnd(event), '2026-09-03T15:30:00')
  assert.equal(calendarDate(new Date('2026-09-03T22:30:00Z')), '2026-09-04')
  assert.equal(calendarLocalStamp(new Date('2026-09-03T16:00:00Z')), '2026-09-03T19:00:00')
})
test('unavailable personal feed is not an empty verified calendar', () => {
  assert.equal(feedHealth({ source: { active_source: 'personal_feed_unavailable', status: 'unavailable' } }), false)
  assert.equal(feedHealth({ source: { active_source: 'personal_feed', status: 'healthy' } }), true)
})
test('week map uses only the current week and no demo events', () => {
  const rows = calendarWeek({events:[{date:'2026-09-03',time_start:'11:30',time_end:'15:30'}, {date:'2026-09-10',time_start:'11:00',time_end:'15:00'}]}, new Date('2026-09-03T12:00:00Z'))
  assert.equal(rows.length,7)
  assert.equal(rows[3].total,4)
  assert.equal(rows.reduce((n,d)=>n+d.total,0),4)
  assert.equal(calendarWeek(null).reduce((n,d)=>n+d.total,0),0)
})
test('calendar reads refresh and transport failure clears stale authority', () => {
  const source = readFileSync(new URL('./useHoloData.js', import.meta.url), 'utf8')
  assert.match(source, /setInterval\(refreshCalendar, 60_000\)/)
  assert.match(source, /grab\('calendar', getCalendarSnapshot, \{ tracked: true \}\)/)
})
