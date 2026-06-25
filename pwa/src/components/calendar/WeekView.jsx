const PURPLE = '#9f7dff'
const ORANGE = '#ff9f43'

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

function isoDate(d) {
  return d.toISOString().slice(0, 10)
}

function eventTypeColor(type) {
  if (type === 'performance') return PURPLE
  if (type === 'rehearsal') return '#bb9dff'
  if (type === 'travel') return '#888'
  return '#777'
}

function trainingColor(type) {
  if (type === 'rest') return null
  return ORANGE
}

export default function WeekView({ onBack, onEvent }) {
  const weekDates = getWeekDates()
  const today = isoDate(new Date())

  return (
    <div style={{ height: '100%', overflowY: 'auto', background: '#0a0a0a', color: '#fff' }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '16px 16px 8px' }}>
        <button onClick={onBack} style={{ background: 'none', border: 'none', color: '#555', cursor: 'pointer', fontSize: 20, padding: 0 }}>
          ←
        </button>
        <span style={{ fontFamily: "'Oswald', sans-serif", fontSize: 18, color: PURPLE, letterSpacing: '0.1em' }}>
          WEEK VIEW
        </span>
      </div>

      {/* Read-only notice */}
      <div style={{ margin: '0 16px 12px', background: '#0d0014', border: `1px solid ${PURPLE}33`, borderRadius: 6, padding: '7px 12px' }}>
        <span style={{ fontFamily: "'Share Tech Mono', monospace", fontSize: 10, color: '#6b5da8' }}>
          Read-only — Plaan sync pending · Mock data displayed
        </span>
      </div>

      {/* Legend */}
      <div style={{ display: 'flex', gap: 14, padding: '0 16px 12px' }}>
        {[[PURPLE, 'PERFORMANCE'], ['#bb9dff', 'REHEARSAL'], [ORANGE, 'TRAINING'], ['#888', 'OTHER']].map(([c, l]) => (
          <div key={l} style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
            <div style={{ width: 8, height: 8, borderRadius: 2, background: c }} />
            <span style={{ fontFamily: "'Share Tech Mono', monospace", fontSize: 9, color: '#555' }}>{l}</span>
          </div>
        ))}
      </div>

      {/* 7-column grid */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: 4, padding: '0 8px 16px' }}>
        {weekDates.map((d, i) => {
          const ds = isoDate(d)
          const isToday = ds === today
          const dayEvents = MOCK_EVENTS.filter(e => e.date === ds)
          const training = WEEK_TRAINING[i]
          const tColor = trainingColor(training.type)

          return (
            <div key={ds} style={{
              background: isToday ? `${PURPLE}11` : '#0f0f0f',
              border: `1px solid ${isToday ? PURPLE + '66' : '#1a1a1a'}`,
              borderRadius: 6, padding: '8px 4px', minHeight: 140,
              display: 'flex', flexDirection: 'column', gap: 4,
            }}>
              {/* Day label */}
              <div style={{ textAlign: 'center', marginBottom: 4 }}>
                <div style={{ fontFamily: "'Oswald', sans-serif", fontSize: 9, color: isToday ? PURPLE : '#444', letterSpacing: '0.08em' }}>
                  {DAY_NAMES[i]}
                </div>
                <div style={{ fontFamily: "'Oswald', sans-serif", fontSize: 14, color: isToday ? '#fff' : '#666' }}>
                  {d.getDate()}
                </div>
              </div>

              {/* Training block */}
              {tColor && (
                <div style={{
                  background: tColor + '22', border: `1px solid ${tColor}44`,
                  borderRadius: 3, padding: '3px 4px',
                }}>
                  <div style={{ fontFamily: "'Oswald', sans-serif", fontSize: 8, color: tColor, letterSpacing: '0.06em', textAlign: 'center' }}>
                    {training.label}
                  </div>
                </div>
              )}

              {/* Opera event blocks */}
              {dayEvents.map(ev => {
                const ec = eventTypeColor(ev.event_type)
                return (
                  <button
                    key={ev.event_id}
                    onClick={() => onEvent(ev)}
                    style={{
                      background: ec + '22', border: `1px solid ${ec}55`,
                      borderRadius: 3, padding: '3px 4px', cursor: 'pointer',
                      textAlign: 'left', width: '100%',
                    }}
                  >
                    <div style={{ fontFamily: "'Oswald', sans-serif", fontSize: 8, color: ec, letterSpacing: '0.04em', lineHeight: 1.2 }}>
                      {ev.title.length > 10 ? ev.title.slice(0, 9) + '…' : ev.title}
                    </div>
                    {ev.time_start && (
                      <div style={{ fontFamily: "'Share Tech Mono', monospace", fontSize: 7, color: ec + 'bb' }}>
                        {ev.time_start}
                      </div>
                    )}
                  </button>
                )
              })}

              {/* Rest indicator */}
              {!tColor && dayEvents.length === 0 && (
                <div style={{ textAlign: 'center', marginTop: 'auto', paddingBottom: 4 }}>
                  <span style={{ fontFamily: "'Share Tech Mono', monospace", fontSize: 8, color: '#2a2a2a' }}>—</span>
                </div>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}
