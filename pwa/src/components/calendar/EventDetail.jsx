import { useState, useEffect } from 'react'
import { postJarvisChat } from '../../api/client'

const WEEK_TRAINING = {
  0: { label: 'HIGH INTENSITY (Lower)', type: 'high_intensity' },
  1: { label: 'UPPER BODY (General)',   type: 'general' },
  2: { label: 'HIGH INTENSITY (Lower)', type: 'high_intensity' },
  3: { label: 'UPPER BODY (General)',   type: 'general' },
  4: { label: 'REST',                   type: 'rest' },
  5: { label: 'JUMP SESSION',           type: 'jump' },
  6: { label: 'ISO ONLY',               type: 'iso_only' },
}

function eventTypeColor(type) {
  if (type === 'performance') return 'var(--accent-calendar)'
  if (type === 'rehearsal') return '#bb9dff'
  if (type === 'travel') return 'var(--muted)'
  return 'var(--dim)'
}

function getDayOfWeek(dateStr) {
  const d = new Date(dateStr + 'T12:00:00')
  return (d.getDay() + 6) % 7
}

function formatDate(dateStr) {
  const d = new Date(dateStr + 'T12:00:00')
  return d.toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })
}

function calcDuration(start, end) {
  if (!start || !end) return null
  const [sh, sm] = start.split(':').map(Number)
  const [eh, em] = end.split(':').map(Number)
  const mins = (eh * 60 + em) - (sh * 60 + sm)
  const h = Math.floor(mins / 60)
  const m = mins % 60
  return m > 0 ? `${h}h ${m}m` : `${h}h`
}

export default function EventDetail({ event, onBack }) {
  const [jarvisText, setJarvisText] = useState('')
  const [loading, setLoading] = useState(true)

  const accentColor = event ? eventTypeColor(event.event_type) : 'var(--accent-calendar)'
  const dow = event ? getDayOfWeek(event.date) : null
  const training = dow !== null ? WEEK_TRAINING[dow] : null
  const hasConflict = training && training.type !== 'rest'
  const isHeavy = training?.type === 'high_intensity' || training?.type === 'jump'

  useEffect(() => {
    if (!event) return
    setLoading(true)
    postJarvisChat({
      domain: 'calendar',
      message: `How should I manage training around this event: ${event.title} on ${event.date}?`,
    })
      .then(r => { setJarvisText(r.response); setLoading(false) })
      .catch(() => { setJarvisText('Unable to load JARVIS note.'); setLoading(false) })
  }, [event?.event_id])

  if (!event) {
    return (
      <div style={{ padding: 16, color: 'var(--dim)', fontFamily: 'var(--mono)' }}>No event selected.</div>
    )
  }

  const duration = calcDuration(event.time_start, event.time_end)

  return (
    <div style={{ height: '100%', overflowY: 'auto', padding: 16, background: 'transparent', color: 'var(--text)' }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 20 }}>
        <button onClick={onBack} className="action ghost" style={{ padding: '6px 10px', fontSize: 14 }}>←</button>
        <span style={{ fontFamily: 'var(--display)', fontSize: 16, color: 'var(--accent-calendar)', letterSpacing: '.1em' }}>EVENT</span>
        <span className="badge" style={{ marginLeft: 'auto', background: `${accentColor}22`, color: accentColor, border: `1px solid ${accentColor}44` }}>
          {event.event_type.toUpperCase()}
        </span>
      </div>

      {/* Hero title */}
      <div style={{ borderLeft: `3px solid ${accentColor}`, paddingLeft: 14, marginBottom: 20 }}>
        <div style={{ fontFamily: 'var(--display)', fontSize: 26, color: 'var(--text)', lineHeight: 1.1, marginBottom: 6 }}>
          {event.title}
        </div>
        {event.role && (
          <div style={{ fontFamily: 'var(--mono)', fontSize: 11, color: 'var(--muted)' }}>{event.role}</div>
        )}
      </div>

      {/* Details */}
      <div className="glass" style={{ padding: 14, marginBottom: 14 }}>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
          <div>
            <div className="label" style={{ marginBottom: 4 }}>DATE</div>
            <div style={{ fontFamily: 'var(--display)', fontSize: 13, color: 'var(--text)' }}>{formatDate(event.date)}</div>
          </div>
          {event.time_start && (
            <div>
              <div className="label" style={{ marginBottom: 4 }}>TIME</div>
              <div style={{ fontFamily: 'var(--display)', fontSize: 13, color: 'var(--text)' }}>
                {event.time_start}–{event.time_end}
                {duration && <span style={{ color: 'var(--muted)', fontSize: 11, marginLeft: 6 }}>({duration})</span>}
              </div>
            </div>
          )}
          {event.location && (
            <div>
              <div className="label" style={{ marginBottom: 4 }}>VENUE</div>
              <div style={{ fontFamily: 'var(--display)', fontSize: 13, color: 'var(--text)' }}>{event.location}</div>
            </div>
          )}
          {training && (
            <div>
              <div className="label" style={{ marginBottom: 4 }}>TRAINING</div>
              <div style={{ fontFamily: 'var(--display)', fontSize: 13, color: training.type === 'rest' ? 'var(--dim)' : 'var(--accent-training)' }}>
                {training.label}
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Conflict */}
      {hasConflict && (
        <div className="glass" style={{
          padding: '12px 14px', marginBottom: 14,
          borderLeft: `3px solid ${isHeavy ? 'var(--red)' : 'var(--gold)'}`,
        }}>
          <div style={{ fontFamily: 'var(--mono)', fontSize: 9, color: isHeavy ? 'var(--red)' : 'var(--gold)', letterSpacing: '.1em', marginBottom: 6 }}>
            {isHeavy ? 'TRAINING CONFLICT' : 'TRAINING ADVISORY'}
          </div>
          <div style={{ fontFamily: 'var(--body)', fontSize: 13, color: 'var(--text)', lineHeight: 1.5 }}>
            {isHeavy
              ? `Heavy session (${training.label}) scheduled on this day. Consider shifting to ISO only.`
              : `${training.label} scheduled same day. Keep intensity moderate before the event.`}
          </div>
        </div>
      )}

      {/* JARVIS note */}
      <div className="glass" style={{ padding: '12px 14px', borderLeft: '3px solid var(--accent-calendar)', marginBottom: 14 }}>
        <div style={{ fontFamily: 'var(--mono)', fontSize: 9, color: 'var(--accent-calendar)', letterSpacing: '.1em', marginBottom: 6 }}>
          JARVIS NOTE
        </div>
        <div style={{ fontFamily: 'var(--body)', fontSize: 13, color: loading ? 'var(--dim)' : 'var(--text)', lineHeight: 1.6 }}>
          {loading ? 'Analysing…' : jarvisText}
        </div>
      </div>

      {/* Read-only note */}
      <div className="glass" style={{ padding: '8px 12px' }}>
        <span style={{ fontFamily: 'var(--mono)', fontSize: 10, color: 'rgba(159,125,255,.5)' }}>
          🔒 Calendar is read-only. JARVIS never writes to Plaan.
        </span>
      </div>
    </div>
  )
}
