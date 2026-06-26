import { useState, useEffect } from 'react'
import { getCrossDomainAlerts, postJarvisChat } from '../../api/client'

const MOCK_EVENTS = [
  { event_id: 'perf-001', event_type: 'performance', title: 'La Traviata', date: '2026-06-25', time_start: '19:00', time_end: '22:00', location: 'Opera House', role: 'Solo Bassoon' },
  { event_id: 'reh-002', event_type: 'rehearsal', title: 'Dress Rehearsal', date: '2026-06-23', time_start: '18:00', time_end: '22:30', location: 'Opera House', role: 'Solo Bassoon' },
  { event_id: 'reh-001', event_type: 'rehearsal', title: 'La Traviata Rehearsal', date: '2026-06-24', time_start: '10:00', time_end: '13:00', location: 'Opera House', role: 'Solo Bassoon' },
  { event_id: 'travel-001', event_type: 'travel', title: 'Travel to Tallinn', date: '2026-06-26', time_start: '08:00', time_end: '12:00', location: null, role: null },
  { event_id: 'unk-001', event_type: 'masterclass', title: 'Guest Masterclass', date: '2026-06-27', time_start: '14:00', time_end: '17:00', location: 'Opera House', role: null },
]

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

const WEEK_TRAINING = {
  0: { label: 'LOWER', type: 'high_intensity' },
  1: { label: 'UPPER', type: 'general' },
  2: { label: 'LOWER', type: 'high_intensity' },
  3: { label: 'UPPER', type: 'general' },
  4: { label: 'REST',  type: 'rest' },
  5: { label: 'JUMP',  type: 'jump' },
  6: { label: 'ISO',   type: 'iso_only' },
}

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

function EventTypeBadge({ type }) {
  const labels = { performance: 'PERF', rehearsal: 'REHEARSAL', travel: 'TRAVEL', masterclass: 'CLASS' }
  const color = eventTypeColor(type)
  return (
    <span className="badge" style={{ background: `${color}22`, color, border: `1px solid ${color}44` }}>
      {labels[type] || type.toUpperCase()}
    </span>
  )
}

function WeekStrip({ weekDates, events }) {
  const today = isoDate(new Date())
  const DAY_INIT = ['M', 'T', 'W', 'T', 'F', 'S', 'S']

  return (
    <div style={{ display: 'flex', gap: 4, marginBottom: 14 }}>
      {weekDates.map((d, i) => {
        const ds = isoDate(d)
        const isToday = ds === today
        const dayEvents = events.filter(e => e.date === ds)
        const training = WEEK_TRAINING[i]
        const hasPerf = dayEvents.some(e => e.event_type === 'performance')
        const hasReh  = dayEvents.some(e => ['rehearsal','masterclass','travel'].includes(e.event_type))

        return (
          <div key={ds} style={{
            flex: 1,
            background: isToday ? 'rgba(159,125,255,.15)' : 'rgba(1,10,13,.5)',
            border: `1px solid ${isToday ? 'rgba(159,125,255,.5)' : 'var(--line)'}`,
            padding: '8px 2px',
            display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4,
          }}>
            <span style={{ fontFamily: 'var(--mono)', fontSize: 9, color: isToday ? 'var(--accent-calendar)' : 'var(--dim)' }}>
              {DAY_INIT[i]}
            </span>
            <span style={{ fontFamily: 'var(--display)', fontSize: 13, color: isToday ? 'var(--text)' : 'var(--muted)' }}>
              {d.getDate()}
            </span>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 2, alignItems: 'center' }}>
              {hasPerf && <div style={{ width: 6, height: 6, borderRadius: '50%', background: 'var(--accent-calendar)' }} />}
              {hasReh && !hasPerf && <div style={{ width: 6, height: 6, borderRadius: '50%', background: '#bb9dff' }} />}
              {training?.type !== 'rest' && <div style={{ width: 6, height: 6, borderRadius: '50%', background: 'var(--accent-training)' }} />}
            </div>
          </div>
        )
      })}
    </div>
  )
}

function EventCard({ event, onPress }) {
  const color = eventTypeColor(event.event_type)
  return (
    <button onClick={() => onPress(event)} className="row" style={{
      flexDirection: 'column', alignItems: 'flex-start',
      borderLeft: `3px solid ${color}`, marginBottom: 8, cursor: 'pointer',
    }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', width: '100%', marginBottom: 4 }}>
        <EventTypeBadge type={event.event_type} />
        <span style={{ fontFamily: 'var(--mono)', fontSize: 10, color: 'var(--muted)' }}>{event.date}</span>
      </div>
      <div className="row-title" style={{ fontSize: 15 }}>{event.title}</div>
      <div className="row-sub">
        {event.time_start && `${event.time_start}–${event.time_end}`}
        {event.location && ` · ${event.location}`}
      </div>
    </button>
  )
}

function ConflictCard({ conflict }) {
  const isHard = conflict.severity === 'hard'
  const color = isHard ? 'var(--red)' : 'var(--gold)'
  return (
    <div className="glass" style={{
      marginBottom: 8, padding: '12px 14px',
      borderLeft: `3px solid ${color}`,
    }}>
      <div style={{ display: 'flex', gap: 6, alignItems: 'center', marginBottom: 6 }}>
        <span className="badge" style={{ background: `${color}22`, color, border: `1px solid ${color}44` }}>
          {isHard ? 'CONFLICT' : 'ADVISORY'}
        </span>
        <span style={{ fontFamily: 'var(--mono)', fontSize: 10, color: 'var(--muted)' }}>{conflict.date}</span>
      </div>
      <div style={{ fontFamily: 'var(--body)', fontSize: 12, color: 'var(--text)', lineHeight: 1.5, marginBottom: 6 }}>
        {conflict.detail}
      </div>
      <div style={{ fontFamily: 'var(--body)', fontSize: 12, color, lineHeight: 1.4 }}>
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

  const upcoming = [...MOCK_EVENTS].sort((a, b) => a.date.localeCompare(b.date)).slice(0, 5)

  return (
    <div style={{ height: '100%', overflowY: 'auto', padding: 16, background: 'transparent', color: 'var(--text)' }}>

      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
        <span style={{ fontFamily: 'var(--display)', fontSize: 16, color: 'var(--accent-calendar)', letterSpacing: '.1em' }}>CALENDAR</span>
        <span className="badge warn">Plaan sync pending</span>
      </div>

      {/* Read-only banner */}
      <div className="glass" style={{ padding: '8px 12px', marginBottom: 14, borderLeft: '3px solid var(--accent-calendar)' }}>
        <span style={{ fontFamily: 'var(--mono)', fontSize: 10, color: '#bb9dff' }}>
          🔒 Calendar is read-only. JARVIS never writes to Plaan.
        </span>
      </div>

      {/* Week strip */}
      <div className="panel-title">THIS WEEK · MOCK DATA</div>
      <WeekStrip weekDates={weekDates} events={MOCK_EVENTS} />

      {/* Week view button */}
      <button onClick={onWeekView} className="action ghost" style={{
        width: '100%', justifyContent: 'center', marginBottom: 16,
        borderColor: 'rgba(159,125,255,.4)', color: 'var(--accent-calendar)',
      }}>
        ▦ WEEK VIEW
      </button>

      {/* Conflicts */}
      {MOCK_CONFLICTS.length > 0 && (
        <>
          <div className="panel-title">CONFLICTS</div>
          {MOCK_CONFLICTS.map((c, i) => <ConflictCard key={i} conflict={c} />)}
        </>
      )}

      {/* Cross-domain alerts */}
      {alerts.length > 0 && (
        <div className="glass" style={{ padding: '12px 14px', marginBottom: 14 }}>
          <div className="panel-title" style={{ marginBottom: 8 }}>SYSTEM ALERTS</div>
          {alerts.map((a, i) => (
            <div key={i} style={{ fontFamily: 'var(--body)', fontSize: 12, color: 'var(--muted)', marginBottom: 4, paddingLeft: 8, borderLeft: '2px solid var(--line)' }}>
              {a}
            </div>
          ))}
        </div>
      )}

      {/* Upcoming events */}
      <div className="panel-title">UPCOMING EVENTS · MOCK DATA</div>
      {upcoming.map(ev => (
        <EventCard key={ev.event_id} event={ev} onPress={onEvent} />
      ))}

      {/* JARVIS insight */}
      <div className="glass" style={{ padding: '12px 14px', borderLeft: '3px solid var(--accent-calendar)', marginBottom: 14 }}>
        <div style={{ fontFamily: 'var(--mono)', fontSize: 9, color: 'var(--accent-calendar)', letterSpacing: '.1em', marginBottom: 6 }}>
          JARVIS SCHEDULE INSIGHT
        </div>
        <div style={{ fontFamily: 'var(--body)', fontSize: 13, color: jarvisText ? 'var(--text)' : 'var(--dim)', lineHeight: 1.6 }}>
          {jarvisText || 'Analysing schedule…'}
        </div>
      </div>

      {/* Quick ask */}
      <div className="panel-title">QUICK ASK</div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginBottom: 32 }}>
        {[
          'Do I have any conflicts this week?',
          'When is my next performance?',
          'Should I train today?',
        ].map(q => (
          <button key={q} onClick={() => onQuickAsk(q)} className="action ghost" style={{
            textAlign: 'left', padding: '10px 14px', fontSize: 11,
            borderColor: 'rgba(159,125,255,.25)', color: 'var(--muted)',
          }}>
            {q}
          </button>
        ))}
      </div>
    </div>
  )
}
