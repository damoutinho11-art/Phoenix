import { useState, useEffect } from 'react'
import { getCrossDomainAlerts, postJarvisChat } from '../../api/client'

const PURPLE = '#9f7dff'
const ORANGE = '#ff9f43'

// Mock events from TYPICAL_WEEK_SNAPSHOT_RAW fixture (Plaan data not yet live)
const MOCK_EVENTS = [
  { event_id: 'perf-001', event_type: 'performance', title: 'La Traviata', date: '2026-06-25', time_start: '19:00', time_end: '22:00', location: 'Opera House', role: 'Solo Bassoon' },
  { event_id: 'reh-002', event_type: 'rehearsal', title: 'Dress Rehearsal', date: '2026-06-23', time_start: '18:00', time_end: '22:30', location: 'Opera House', role: 'Solo Bassoon' },
  { event_id: 'reh-001', event_type: 'rehearsal', title: 'La Traviata Rehearsal', date: '2026-06-24', time_start: '10:00', time_end: '13:00', location: 'Opera House', role: 'Solo Bassoon' },
  { event_id: 'travel-001', event_type: 'travel', title: 'Travel to Tallinn', date: '2026-06-26', time_start: '08:00', time_end: '12:00', location: null, role: null },
  { event_id: 'unk-001', event_type: 'masterclass', title: 'Guest Masterclass', date: '2026-06-27', time_start: '14:00', time_end: '17:00', location: 'Opera House', role: null },
]

// Mock conflicts computed from event × training overlap
const MOCK_CONFLICTS = [
  {
    date: '2026-06-24',
    severity: 'hard',
    detail: 'HIGH INTENSITY (Lower) training on same morning as La Traviata Rehearsal (10:00–13:00).',
    suggestion: 'Shift to ISO only, or train late afternoon after rehearsal ends.',
  },
  {
    date: '2026-06-25',
    severity: 'advisory',
    detail: 'UPPER BODY training on La Traviata performance day (19:00 curtain).',
    suggestion: 'Keep session short. No late-day heavy work before a 3-hour performance.',
  },
]

// Week structure derived from training constitution
const WEEK_TRAINING = {
  0: { label: 'LOWER', type: 'high_intensity' }, // Mon
  1: { label: 'UPPER', type: 'general' },         // Tue
  2: { label: 'LOWER', type: 'high_intensity' }, // Wed
  3: { label: 'UPPER', type: 'general' },         // Thu
  4: { label: 'REST',  type: 'rest' },            // Fri
  5: { label: 'JUMP',  type: 'jump' },            // Sat
  6: { label: 'ISO',   type: 'iso_only' },        // Sun
}

function getWeekDates() {
  const today = new Date()
  const dow = today.getDay() // 0=Sun
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
  return '#666'
}

function EventTypeBadge({ type }) {
  const labels = { performance: 'PERF', rehearsal: 'REHEARSAL', travel: 'TRAVEL', masterclass: 'CLASS' }
  const color = eventTypeColor(type)
  return (
    <span style={{
      fontSize: 9, background: color + '22', color, borderRadius: 3,
      padding: '2px 6px', fontFamily: "'Oswald', sans-serif", letterSpacing: '0.08em',
    }}>
      {labels[type] || type.toUpperCase()}
    </span>
  )
}

function WeekStrip({ weekDates, events, onDayPress }) {
  const today = isoDate(new Date())
  const DAY_INIT = ['M', 'T', 'W', 'T', 'F', 'S', 'S']

  return (
    <div style={{ display: 'flex', gap: 4, marginBottom: 16 }}>
      {weekDates.map((d, i) => {
        const ds = isoDate(d)
        const isToday = ds === today
        const dayEvents = events.filter(e => e.date === ds)
        const training = WEEK_TRAINING[i]
        const hasPerf = dayEvents.some(e => e.event_type === 'performance')
        const hasReh = dayEvents.some(e => e.event_type === 'rehearsal' || e.event_type === 'masterclass' || e.event_type === 'travel')
        const hasTraining = training?.type !== 'rest'

        return (
          <button
            key={ds}
            onClick={() => onDayPress && onDayPress(ds)}
            style={{
              flex: 1, background: isToday ? PURPLE + '22' : '#111',
              border: `1px solid ${isToday ? PURPLE : '#222'}`,
              borderRadius: 6, padding: '8px 2px', cursor: 'default',
              display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4,
            }}
          >
            <span style={{ fontFamily: "'Share Tech Mono', monospace", fontSize: 9, color: isToday ? PURPLE : '#555' }}>
              {DAY_INIT[i]}
            </span>
            <span style={{ fontFamily: "'Oswald', sans-serif", fontSize: 13, color: isToday ? '#fff' : '#888' }}>
              {d.getDate()}
            </span>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 2, alignItems: 'center' }}>
              {hasPerf && <div style={{ width: 6, height: 6, borderRadius: '50%', background: PURPLE }} />}
              {hasReh && !hasPerf && <div style={{ width: 6, height: 6, borderRadius: '50%', background: '#bb9dff' }} />}
              {hasTraining && <div style={{ width: 6, height: 6, borderRadius: '50%', background: training.type === 'rest' ? '#333' : ORANGE }} />}
            </div>
          </button>
        )
      })}
    </div>
  )
}

function EventCard({ event, onPress }) {
  const color = eventTypeColor(event.event_type)
  return (
    <button onClick={() => onPress(event)} style={{
      width: '100%', background: '#111', border: 'none', borderRadius: 8,
      padding: '12px 14px', marginBottom: 8, cursor: 'pointer', textAlign: 'left',
      borderLeft: `3px solid ${color}`,
    }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 4 }}>
        <EventTypeBadge type={event.event_type} />
        <span style={{ fontFamily: "'Share Tech Mono', monospace", fontSize: 10, color: '#555' }}>
          {event.date}
        </span>
      </div>
      <div style={{ fontFamily: "'Oswald', sans-serif", fontSize: 16, color: '#fff', marginBottom: 2 }}>
        {event.title}
      </div>
      <div style={{ fontFamily: "'Share Tech Mono', monospace", fontSize: 11, color: '#555' }}>
        {event.time_start && `${event.time_start}–${event.time_end}`}
        {event.location && ` · ${event.location}`}
      </div>
    </button>
  )
}

function ConflictCard({ conflict }) {
  const isHard = conflict.severity === 'hard'
  const color = isHard ? '#ff6b6b' : '#ffb347'
  return (
    <div style={{
      background: isHard ? '#1a0707' : '#130e00',
      border: `1px solid ${color}33`,
      borderRadius: 8, padding: 12, marginBottom: 8,
      borderLeft: `3px solid ${color}`,
    }}>
      <div style={{ display: 'flex', gap: 6, alignItems: 'center', marginBottom: 6 }}>
        <span style={{ fontSize: 9, background: color + '22', color, padding: '2px 6px', borderRadius: 3, fontFamily: "'Oswald', sans-serif", letterSpacing: '0.08em' }}>
          {isHard ? 'CONFLICT' : 'ADVISORY'}
        </span>
        <span style={{ fontFamily: "'Share Tech Mono', monospace", fontSize: 10, color: '#555' }}>
          {conflict.date}
        </span>
      </div>
      <div style={{ fontFamily: "'Share Tech Mono', monospace", fontSize: 11, color: '#ccc', lineHeight: 1.5, marginBottom: 6 }}>
        {conflict.detail}
      </div>
      <div style={{ fontFamily: "'Share Tech Mono', monospace", fontSize: 11, color: color, lineHeight: 1.4 }}>
        → {conflict.suggestion}
      </div>
    </div>
  )
}

export default function CalendarDashboard({ onEvent, onWeekView, onQuickAsk }) {
  const [alerts, setAlerts] = useState([])
  const [jarvisText, setJarvisText] = useState('')
  const weekDates = getWeekDates()

  useEffect(() => {
    getCrossDomainAlerts()
      .then(r => setAlerts(r.alerts || []))
      .catch(() => {})

    postJarvisChat({ domain: 'calendar', message: 'What should I know about my schedule this week?' })
      .then(r => setJarvisText(r.response))
      .catch(() => setJarvisText('Unable to load schedule insight.'))
  }, [])

  // Sort upcoming events by date
  const upcoming = [...MOCK_EVENTS].sort((a, b) => a.date.localeCompare(b.date)).slice(0, 5)

  return (
    <div style={{ height: '100%', overflowY: 'auto', padding: 16, background: '#0a0a0a', color: '#fff' }}>

      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
        <span style={{ fontFamily: "'Oswald', sans-serif", fontSize: 18, color: PURPLE, letterSpacing: '0.1em' }}>
          CALENDAR
        </span>
        <span style={{ fontSize: 9, background: '#1a1200', border: '1px solid #ffb34744', color: '#ffb347', borderRadius: 4, padding: '3px 8px', fontFamily: "'Share Tech Mono', monospace" }}>
          Plaan sync pending
        </span>
      </div>

      {/* Read-only banner */}
      <div style={{ background: '#0d0014', border: `1px solid ${PURPLE}33`, borderRadius: 6, padding: '8px 12px', marginBottom: 14, display: 'flex', alignItems: 'center', gap: 8 }}>
        <span style={{ color: PURPLE, fontSize: 14 }}>🔒</span>
        <span style={{ fontFamily: "'Share Tech Mono', monospace", fontSize: 10, color: '#bb9dff' }}>
          Calendar is read-only. JARVIS never writes to Plaan.
        </span>
      </div>

      {/* Week strip */}
      <div style={{ fontFamily: "'Oswald', sans-serif", fontSize: 11, color: '#555', letterSpacing: '0.1em', marginBottom: 8 }}>
        THIS WEEK · MOCK DATA
      </div>
      <WeekStrip weekDates={weekDates} events={MOCK_EVENTS} />

      {/* WEEK VIEW button */}
      <button onClick={onWeekView} style={{
        width: '100%', background: '#111', border: `1px solid ${PURPLE}44`, borderRadius: 6,
        padding: '10px 0', color: PURPLE, fontFamily: "'Oswald', sans-serif",
        fontSize: 12, letterSpacing: '0.1em', cursor: 'pointer', marginBottom: 16,
      }}>
        ▦ WEEK VIEW
      </button>

      {/* Conflicts */}
      {MOCK_CONFLICTS.length > 0 && (
        <>
          <div style={{ fontFamily: "'Oswald', sans-serif", fontSize: 11, color: '#555', letterSpacing: '0.1em', marginBottom: 8 }}>
            CONFLICTS
          </div>
          {MOCK_CONFLICTS.map((c, i) => <ConflictCard key={i} conflict={c} />)}
        </>
      )}

      {/* Cross-domain alerts from API */}
      {alerts.length > 0 && (
        <div style={{ background: '#111', borderRadius: 8, padding: 12, marginBottom: 14 }}>
          <div style={{ fontFamily: "'Oswald', sans-serif", fontSize: 11, color: '#555', letterSpacing: '0.1em', marginBottom: 8 }}>
            SYSTEM ALERTS
          </div>
          {alerts.map((a, i) => (
            <div key={i} style={{ fontFamily: "'Share Tech Mono', monospace", fontSize: 11, color: '#888', marginBottom: 4, paddingLeft: 8, borderLeft: '2px solid #333' }}>
              {a}
            </div>
          ))}
        </div>
      )}

      {/* Upcoming events */}
      <div style={{ fontFamily: "'Oswald', sans-serif", fontSize: 11, color: '#555', letterSpacing: '0.1em', marginBottom: 8 }}>
        UPCOMING EVENTS · MOCK DATA
      </div>
      {upcoming.map(ev => (
        <EventCard key={ev.event_id} event={ev} onPress={onEvent} />
      ))}

      {/* JARVIS insight */}
      <div style={{ background: '#111', borderRadius: 8, padding: 14, borderLeft: `3px solid ${PURPLE}`, marginBottom: 14 }}>
        <div style={{ fontFamily: "'Oswald', sans-serif", fontSize: 11, color: PURPLE, letterSpacing: '0.1em', marginBottom: 6 }}>
          JARVIS SCHEDULE INSIGHT
        </div>
        <div style={{ fontFamily: "'Share Tech Mono', monospace", fontSize: 12, color: jarvisText ? '#ccc' : '#444', lineHeight: 1.6 }}>
          {jarvisText || 'Analysing schedule…'}
        </div>
      </div>

      {/* Quick-ask chips */}
      <div style={{ fontFamily: "'Oswald', sans-serif", fontSize: 11, color: '#555', letterSpacing: '0.1em', marginBottom: 8 }}>
        QUICK ASK
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        {[
          'Do I have any conflicts this week?',
          'When is my next performance?',
          'Should I train today?',
        ].map(q => (
          <button key={q} onClick={() => onQuickAsk(q)} style={{
            background: '#111', border: `1px solid ${PURPLE}33`, borderRadius: 6,
            padding: '11px 14px', color: '#aaa', fontFamily: "'Share Tech Mono', monospace",
            fontSize: 12, cursor: 'pointer', textAlign: 'left',
          }}>
            {q}
          </button>
        ))}
      </div>
    </div>
  )
}
