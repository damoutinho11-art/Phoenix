export function calendarDate(now = new Date()) {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Tallinn', year: 'numeric', month: '2-digit', day: '2-digit' }).format(now)
}
export function calendarLocalStamp(now = new Date()) {
  const clock = new Intl.DateTimeFormat('en-GB', {timeZone:'Europe/Tallinn', hour:'2-digit', minute:'2-digit', second:'2-digit', hourCycle:'h23'}).format(now)
  return `${calendarDate(now)}T${clock}`
}

export const eventStart = e => e.date ? `${e.date}T${e.time_start || '00:00'}:00` : e.start || e.start_time || e.begin || e.from
export const eventEnd = e => e.date ? `${e.date}T${e.time_end || '23:59'}:00` : e.end || e.end_time || e.finish || e.to
export function feedHealth(cal) {
  const source = cal?.source
  if (String(source?.active_source || '').startsWith('personal_feed')) return source.status === 'healthy'
  return !!cal && !String(source?.active_source || '').startsWith('fixture')
}

export function calendarWeek(cal, now = new Date()) {
  const monday = new Date(`${calendarDate(now)}T12:00:00Z`)
  monday.setUTCDate(monday.getUTCDate() - (monday.getUTCDay() + 6) % 7)
  return ['MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT', 'SUN'].map((name, index) => {
    const date = new Date(monday)
    date.setUTCDate(date.getUTCDate() + index)
    const iso = date.toISOString().slice(0, 10)
    const events = (cal?.events || []).filter(e => eventStart(e)?.slice(0, 10) === iso)
    const intervals = events.map(e => {
      const hours = text => Number(text.slice(11,13)) + Number(text.slice(14,16)) / 60
      return [hours(eventStart(e)), hours(eventEnd(e)), e.event_type]
    })
    return { name, date: iso, intervals, total: intervals.reduce((n,[s,e]) => n + Math.max(0, e-s), 0) }
  })
}
