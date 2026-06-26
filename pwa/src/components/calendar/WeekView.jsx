const MOCK_EVENTS = [
  { event_id: 'perf-001', event_type: 'performance', title: 'La Traviata', date: '2026-06-25', time_start: '19:00', time_end: '22:00', location: 'Opera House', role: 'Solo Bassoon' },
  { event_id: 'reh-002', event_type: 'rehearsal', title: 'Dress Rehearsal', date: '2026-06-23', time_start: '18:00', time_end: '22:30', location: 'Opera House', role: 'Solo Bassoon' },
  { event_id: 'reh-001', event_type: 'rehearsal', title: 'La Traviata Rehearsal', date: '2026-06-24', time_start: '10:00', time_end: '13:00', location: 'Opera House', role: 'Solo Bassoon' },
  { event_id: 'travel-001', event_type: 'travel', title: 'Travel to Tallinn', date: '2026-06-26', time_start: '08:00', time_end: '12:00', location: null, role: null },
  { event_id: 'unk-001', event_type: 'masterclass', title: 'Guest Masterclass', date: '2026-06-27', time_start: '14:00', time_end: '17:00', location: 'Opera House', role: null },
]

const WEEK_TRAINING = [
  { label: 'LOWER', type: 'high_intensity', full: 'High Intensity (Lower)' },
  { label: 'UPPER', type: 'general',        full: 'Upper Body (General)' },
  { label: 'LOWER', type: 'high_intensity', full: 'High Intensity (Lower)' },
  { label: 'UPPER', type: 'general',        full: 'Upper Body (General)' },
  { label: 'REST',  type: 'rest',           full: 'Rest' },
  { label: 'JUMP',  type: 'jump',           full: 'Jump Session' },
  { label: 'ISO',   type: 'iso_only',       full: 'ISO Only' },
]

const DAY_NAMES = ['MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT', 'SUN']

function getWeekDates() {
  const today = new Date()
  const dow = today.getDay()
  const monday = new Date(today)
  monday.setDate(today.getDate() - ((dow + 6) % 7))
  return Array.from({ length: 7 }, (_, i) => {
    const d = new Date(monday)
    d.setDate(monday.getDate() + i)
    return d
  })
}

function isoDate(d) { return d.toISOString().slice(0, 10) }

function eventTypeColor(type) {
  if (type === 'performance') return 'var(--accent-calendar)'
  if (type === 'rehearsal') return '#bb9dff'
  if (type === 'travel') return 'var(--muted)'
  return 'var(--dim)'
}

export default function WeekView({ onBack, onEvent }) {
  const weekDates = getWeekDates()
  const today = isoDate(new Date())

  return (
    <div style={{ height: '100%', overflowY: 'auto', background: 'transparent', color: 'var(--text)' }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '14px 16px 8px', borderBottom: '1px solid var(--line)' }}>
        <button onClick={onBack} className="action ghost" style={{ padding: '6px 10px', fontSize: 14 }}>←</button>
        <span style={{ fontFamily: 'var(--display)', fontSize: 16, color: 'var(--accent-calendar)', letterSpacing: '.1em' }}>WEEK VIEW</span>
      </div>

      {/* Read-only notice */}
      <div style={{ margin: '10px 16px', fontFamily: 'var(--mono)', fontSize: 10, color: 'rgba(159,125,255,.5)' }}>
        Read-only — Plaan sync pending · Mock data displayed
      </div>

      {/* Legend */}
      <div style={{ display: 'flex', gap: 14, padding: '0 16px 12px' }}>
        {[
          ['var(--accent-calendar)', 'PERFORMANCE'],
          ['#bb9dff', 'REHEARSAL'],
          ['var(--accent-training)', 'TRAINING'],
          ['var(--muted)', 'OTHER'],
        ].map(([c, l]) => (
          <div key={l} style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
            <div style={{ width: 8, height: 8, background: c }} />
            <span style={{ fontFamily: 'var(--mono)', fontSize: 9, color: 'var(--dim)' }}>{l}</span>
          </div>
        ))}
      </div>

      {/* 7-column grid */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: 3, padding: '0 8px 24px' }}>
        {weekDates.map((d, i) => {
          const ds = isoDate(d)
          const isToday = ds === today
          const dayEvents = MOCK_EVENTS.filter(e => e.date === ds)
          const training = WEEK_TRAINING[i]
          const hasTraining = training.type !== 'rest'

          return (
            <div key={ds} style={{
              background: isToday ? 'rgba(159,125,255,.12)' : 'rgba(1,10,13,.5)',
              border: `1px solid ${isToday ? 'rgba(159,125,255,.4)' : 'var(--line)'}`,
              padding: '6px 3px', minHeight: 130,
              display: 'flex', flexDirection: 'column', gap: 3,
            }}>
              {/* Day label */}
              <div style={{ textAlign: 'center', marginBottom: 3 }}>
                <div style={{ fontFamily: 'var(--display)', fontSize: 8, color: isToday ? 'var(--accent-calendar)' : 'var(--dim)', letterSpacing: '.06em' }}>
                  {DAY_NAMES[i]}
                </div>
                <div style={{ fontFamily: 'var(--display)', fontSize: 13, color: isToday ? 'var(--text)' : 'var(--muted)' }}>
                  {d.getDate()}
                </div>
              </div>

              {/* Training block */}
              {hasTraining && (
                <div style={{
                  background: 'rgba(255,143,46,.15)', border: '1px solid rgba(255,143,46,.3)',
                  padding: '2px 3px',
                }}>
                  <div style={{ fontFamily: 'var(--display)', fontSize: 7, color: 'var(--accent-training)', letterSpacing: '.04em', textAlign: 'center' }}>
                    {training.label}
                  </div>
                </div>
              )}

              {/* Event blocks */}
              {dayEvents.map(ev => {
                const ec = eventTypeColor(ev.event_type)
                return (
                  <button
                    key={ev.event_id}
                    onClick={() => onEvent(ev)}
                    style={{
                      background: ev.event_type === 'performance'
                        ? 'rgba(159,125,255,.13)' : ev.event_type === 'rehearsal'
                        ? 'rgba(187,157,255,.13)' : 'rgba(132,212,226,.07)',
                      border: `1px solid ${ev.event_type === 'performance' ? 'rgba(159,125,255,.4)' : ev.event_type === 'rehearsal' ? 'rgba(187,157,255,.4)' : 'rgba(132,212,226,.2)'}`,
                      padding: '2px 3px', cursor: 'pointer',
                      textAlign: 'left', width: '100%',
                    }}
                  >
                    <div style={{ fontFamily: 'var(--display)', fontSize: 7, color: ec, letterSpacing: '.03em', lineHeight: 1.2 }}>
                      {ev.title.length > 10 ? ev.title.slice(0, 9) + '…' : ev.title}
                    </div>
                    {ev.time_start && (
                      <div style={{ fontFamily: 'var(--mono)', fontSize: 6, color: 'var(--muted)' }}>
                        {ev.time_start}
                      </div>
                    )}
                  </button>
                )
              })}

              {!hasTraining && dayEvents.length === 0 && (
                <div style={{ textAlign: 'center', marginTop: 'auto', paddingBottom: 4 }}>
                  <span style={{ fontFamily: 'var(--mono)', fontSize: 8, color: 'var(--line)' }}>—</span>
                </div>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}
