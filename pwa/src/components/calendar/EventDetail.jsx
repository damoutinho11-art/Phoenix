import { useState, useEffect } from 'react'
import { postJarvisChat } from '../../api/client'

const PURPLE = '#9f7dff'
const ORANGE = '#ff9f43'

const WEEK_TRAINING = {
  0: { label: 'HIGH INTENSITY (Lower)', type: 'high_intensity' },
  1: { label: 'UPPER BODY (General)',   type: 'general' },
  2: { label: 'HIGH INTENSITY (Lower)', type: 'high_intensity' },
  3: { label: 'UPPER BODY (General)',   type: 'general' },
  4: { label: 'REST',                   type: 'rest' },
  5: { label: 'JUMP SESSION',           type: 'jump' },
  6: { label: 'ISO ONLY',              type: 'iso_only' },
}

function eventTypeColor(type) {
  if (type === 'performance') return PURPLE
  if (type === 'rehearsal') return '#bb9dff'
  if (type === 'travel') return '#888'
  return '#666'
}

function getDayOfWeek(dateStr) {
  // dateStr: 'YYYY-MM-DD'
  const d = new Date(dateStr + 'T12:00:00')
  return (d.getDay() + 6) % 7 // 0=Mon
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

  const accentColor = event ? eventTypeColor(event.event_type) : PURPLE
  const dow = event ? getDayOfWeek(event.date) : null
  const training = dow !== null ? WEEK_TRAINING[dow] : null
  const hasConflict = training && training.type !== 'rest'
  const isHeavy = training?.type === 'high_intensity' || training?.type === 'jump'

  useEffect(() => {
    if (!event) return
    postJarvisChat({
      domain: 'calendar',
      message: `How should I manage training around this event: ${event.title} on ${event.date}?`,
    })
      .then(r => { setJarvisText(r.response); setLoading(false) })
      .catch(() => { setJarvisText('Unable to load JARVIS note.'); setLoading(false) })
  }, [event?.event_id])

  if (!event) {
    return (
      <div style={{ padding: 16, color: '#555', fontFamily: "'Share Tech Mono', monospace" }}>
        No event selected.
      </div>
    )
  }

  const duration = calcDuration(event.time_start, event.time_end)

  return (
    <div style={{ height: '100%', overflowY: 'auto', padding: 16, background: '#0a0a0a', color: '#fff' }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 20 }}>
        <button onClick={onBack} style={{ background: 'none', border: 'none', color: '#555', cursor: 'pointer', fontSize: 20, padding: 0 }}>
          ←
        </button>
        <span style={{ fontFamily: "'Oswald', sans-serif", fontSize: 18, color: PURPLE, letterSpacing: '0.1em' }}>
          EVENT
        </span>
        <span style={{ marginLeft: 'auto', fontSize: 9, background: accentColor + '22', color: accentColor, borderRadius: 4, padding: '3px 8px', fontFamily: "'Oswald', sans-serif", letterSpacing: '0.08em' }}>
          {event.event_type.toUpperCase()}
        </span>
      </div>

      {/* Hero title */}
      <div style={{ borderLeft: `3px solid ${accentColor}`, paddingLeft: 14, marginBottom: 20 }}>
        <div style={{ fontFamily: "'Oswald', sans-serif", fontSize: 28, color: '#fff', lineHeight: 1.1, marginBottom: 6 }}>
          {event.title}
        </div>
        {event.role && (
          <div style={{ fontFamily: "'Share Tech Mono', monospace", fontSize: 11, color: '#666' }}>
            {event.role}
          </div>
        )}
      </div>

      {/* Date / time / venue / duration */}
      <div style={{ background: '#111', borderRadius: 8, padding: 14, marginBottom: 14 }}>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
          <div>
            <div style={{ fontFamily: "'Share Tech Mono', monospace", fontSize: 9, color: '#555', marginBottom: 4, letterSpacing: '0.08em' }}>DATE</div>
            <div style={{ fontFamily: "'Oswald', sans-serif", fontSize: 13, color: '#fff' }}>
              {formatDate(event.date)}
            </div>
          </div>
          {event.time_start && (
            <div>
              <div style={{ fontFamily: "'Share Tech Mono', monospace", fontSize: 9, color: '#555', marginBottom: 4, letterSpacing: '0.08em' }}>TIME</div>
              <div style={{ fontFamily: "'Oswald', sans-serif", fontSize: 13, color: '#fff' }}>
                {event.time_start}–{event.time_end}
                {duration && <span style={{ color: '#555', fontSize: 11, marginLeft: 6 }}>({duration})</span>}
              </div>
            </div>
          )}
          {event.location && (
            <div>
              <div style={{ fontFamily: "'Share Tech Mono', monospace", fontSize: 9, color: '#555', marginBottom: 4, letterSpacing: '0.08em' }}>VENUE</div>
              <div style={{ fontFamily: "'Oswald', sans-serif", fontSize: 13, color: '#fff' }}>{event.location}</div>
            </div>
          )}
          {training && (
            <div>
              <div style={{ fontFamily: "'Share Tech Mono', monospace", fontSize: 9, color: '#555', marginBottom: 4, letterSpacing: '0.08em' }}>TRAINING</div>
              <div style={{ fontFamily: "'Oswald', sans-serif", fontSize: 13, color: training.type === 'rest' ? '#333' : ORANGE }}>
                {training.label}
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Conflict warning */}
      {hasConflict && (
        <div style={{
          background: isHeavy ? '#1a0707' : '#130e00',
          border: `1px solid ${isHeavy ? '#ff6b6b44' : '#ffb34744'}`,
          borderRadius: 8, padding: 12, marginBottom: 14,
          borderLeft: `3px solid ${isHeavy ? '#ff6b6b' : '#ffb347'}`,
        }}>
          <div style={{ fontFamily: "'Oswald', sans-serif", fontSize: 11, color: isHeavy ? '#ff6b6b' : '#ffb347', letterSpacing: '0.1em', marginBottom: 6 }}>
            {isHeavy ? 'TRAINING CONFLICT' : 'TRAINING ADVISORY'}
          </div>
          <div style={{ fontFamily: "'Share Tech Mono', monospace", fontSize: 11, color: '#ccc', lineHeight: 1.5 }}>
            {isHeavy
              ? `Heavy session (${training.label}) scheduled on this day. Consider shifting to ISO only.`
              : `${training.label} scheduled same day. Keep intensity moderate before the event.`}
          </div>
        </div>
      )}

      {/* JARVIS note */}
      <div style={{ background: '#111', borderRadius: 8, padding: 14, borderLeft: `3px solid ${PURPLE}`, marginBottom: 14 }}>
        <div style={{ fontFamily: "'Oswald', sans-serif", fontSize: 11, color: PURPLE, letterSpacing: '0.1em', marginBottom: 6 }}>
          JARVIS NOTE
        </div>
        <div style={{ fontFamily: "'Share Tech Mono', monospace", fontSize: 12, color: loading ? '#444' : '#ccc', lineHeight: 1.6 }}>
          {loading ? 'Analysing…' : jarvisText}
        </div>
      </div>

      {/* Read-only reminder */}
      <div style={{ background: '#0d0014', border: `1px solid ${PURPLE}22`, borderRadius: 6, padding: '8px 12px' }}>
        <span style={{ fontFamily: "'Share Tech Mono', monospace", fontSize: 10, color: '#6b5da8' }}>
          🔒 Calendar is read-only. JARVIS never writes to Plaan.
        </span>
      </div>
    </div>
  )
}
