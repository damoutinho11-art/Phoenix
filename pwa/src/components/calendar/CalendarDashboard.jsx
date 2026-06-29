import { useState, useEffect } from 'react'
import { getCalendarSnapshot, getCrossDomainAlerts, postJarvisChat } from '../../api/client'

const VIOLET = '#9f7dff'
const VIOLET_BR = '#d8ccff'
const BORDER = 'rgba(32,216,236,.18)'
const MUTED = 'rgba(32,216,236,.38)'
const TEXT_DIM = 'rgba(181,178,216,.58)'
const CYAN = '#20d8ec'
const GOLD = '#ffd56b'
const POS = '#4dffb4'

function eventAccent(type) {
  if (type === 'rehearsal') return GOLD
  if (type === 'training')  return POS
  if (type === 'food')      return '#9dff6f'
  return VIOLET
}

function buildWeekDays() {
  const now = new Date()
  const dow = now.getDay() // 0=Sun
  // Start from Monday of current week
  const monday = new Date(now)
  monday.setDate(now.getDate() - ((dow + 6) % 7))
  const DOW_LABELS = ['MON','TUE','WED','THU','FRI','SAT','SUN']
  const todayNum = now.getDate()
  return DOW_LABELS.map((label, i) => {
    const d = new Date(monday)
    d.setDate(monday.getDate() + i)
    return { dow: label, num: d.getDate(), active: d.getDate() === todayNum && d.getMonth() === now.getMonth() }
  })
}

export default function CalendarDashboard({ onEvent, onWeekView, onFeed, onQuickAsk }) {
  const [events, setEvents] = useState(null)
  const [alerts, setAlerts] = useState(null)
  const [jarvisText, setJarvisText] = useState('')

  useEffect(() => {
    getCalendarSnapshot()
      .then(r => setEvents(r.events || []))
      .catch(() => setEvents([]))

    getCrossDomainAlerts()
      .then(r => setAlerts(r))
      .catch(() => {})

    postJarvisChat({ domain: 'calendar', message: 'What should I know about my schedule this week?' })
      .then(r => setJarvisText(r.response || ''))
      .catch(() => {})
  }, [])

  // Build current day label dynamically
  const now = new Date()
  const dayNum = now.getDate()
  const monthNames = ['JAN','FEB','MAR','APR','MAY','JUN','JUL','AUG','SEP','OCT','NOV','DEC']
  const dowNames = ['SUN','MON','TUE','WED','THU','FRI','SAT']
  const dayLabel = dowNames[now.getDay()]
  const monthLabel = monthNames[now.getMonth()]
  const weekDays = buildWeekDays()

  // Filter events to show today's events first, then upcoming
  const today = now.toISOString().slice(0, 10)
  const todayEvents = (events || []).filter(e => e.date === today)
  const displayEvents = todayEvents.length > 0 ? todayEvents : (events || []).slice(0, 5)

  return (
    <div style={{ height: '100%', display: 'flex', flexDirection: 'column', background: '#000', color: 'rgba(226,222,255,.94)', fontFamily: "'Saira Condensed',sans-serif" }}>
      {/* TOP BAR */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '13px 18px 11px', borderBottom: `1px solid ${BORDER}`, position: 'sticky', top: 0, background: 'rgba(0,0,0,.96)', backdropFilter: 'blur(12px)', zIndex: 5, flexShrink: 0 }}>
        <div style={{ display: 'flex', alignItems: 'center' }}>
          <span style={{ fontFamily: 'var(--display)', fontSize: 13, fontWeight: 700, letterSpacing: '.28em', color: VIOLET_BR, filter: 'drop-shadow(0 0 8px rgba(159,125,255,.25))' }}>CALENDAR</span>
        </div>
        <span style={{ fontFamily: 'var(--mono)', fontSize: 8, letterSpacing: '.14em', color: VIOLET, border: `1px solid rgba(159,125,255,.32)`, background: 'rgba(159,125,255,.055)', padding: '2px 8px' }}>TODAY</span>
      </div>

      <div style={{ flex: 1, overflowY: 'auto', paddingBottom: 88 }}>
        {/* HERO */}
        <div style={{ padding: '20px 20px 18px', borderBottom: `1px solid ${BORDER}`, background: 'linear-gradient(180deg,rgba(159,125,255,.045),transparent)' }}>
          <div style={{ fontFamily: 'var(--mono)', fontSize: 8, letterSpacing: '.22em', color: MUTED, marginBottom: 8 }}>TODAY'S COMMAND TIMELINE</div>
          <div style={{ display: 'flex', alignItems: 'flex-end', gap: 14 }}>
            <div style={{ fontFamily: 'var(--display)', fontSize: 64, fontWeight: 700, lineHeight: .9, background: `linear-gradient(155deg,#fff 0%,${VIOLET_BR} 50%,${VIOLET} 100%)`, WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent', filter: 'drop-shadow(0 0 22px rgba(159,125,255,.38))' }}>{dayNum}</div>
            <div style={{ fontFamily: 'var(--display)', fontSize: 16, letterSpacing: '.18em', color: 'rgba(159,125,255,.36)', paddingBottom: 7 }}>{monthLabel} · {dayLabel}</div>
          </div>
          <div style={{ fontFamily: 'var(--mono)', fontSize: 8, letterSpacing: '.14em', color: TEXT_DIM, marginTop: 10 }}>
            {events === null
              ? 'LOADING…'
              : `${displayEvents.length} EVENT${displayEvents.length !== 1 ? 'S' : ''} TODAY`}
          </div>
        </div>

        {/* DAY STRIP */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7,1fr)', borderBottom: `1px solid ${BORDER}`, background: 'rgba(159,125,255,.018)' }}>
          {weekDays.map(d => (
            <div key={d.dow + d.num} style={{ padding: '10px 4px', textAlign: 'center', borderRight: `1px solid rgba(32,216,236,.08)`, background: d.active ? 'rgba(159,125,255,.08)' : 'transparent', boxShadow: d.active ? 'inset 0 -2px 0 ' + VIOLET : 'none' }}>
              <div style={{ fontFamily: 'var(--mono)', fontSize: 7, color: MUTED, letterSpacing: '.12em', marginBottom: 5 }}>{d.dow}</div>
              <div style={{ fontFamily: 'var(--display)', fontSize: 17, color: d.active ? VIOLET_BR : 'rgba(226,222,255,.72)' }}>{d.num}</div>
            </div>
          ))}
        </div>

        {/* AGENDA */}
        <div style={{ padding: '16px 18px', borderBottom: `1px solid ${BORDER}` }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
            <span style={{ fontFamily: 'var(--mono)', fontSize: 8, letterSpacing: '.22em', color: MUTED }}>AGENDA</span>
            <span style={{ fontFamily: 'var(--display)', fontSize: 16, fontWeight: 600, color: VIOLET }}>
              {events === null ? '…' : 'ON TRACK'}
            </span>
          </div>

          {events === null ? (
            <div style={{ fontFamily: 'var(--mono)', fontSize: 9, color: MUTED, padding: '20px 0', textAlign: 'center' }}>Loading…</div>
          ) : displayEvents.length === 0 ? (
            <div style={{ fontFamily: 'var(--mono)', fontSize: 9, color: MUTED, padding: '20px 0', textAlign: 'center' }}>No events today.</div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 9 }}>
              {displayEvents.map(ev => {
                const accent = eventAccent(ev.event_type)
                return (
                  <div
                    key={ev.event_id}
                    onClick={() => onEvent && onEvent(ev)}
                    style={{ display: 'grid', gridTemplateColumns: '54px 1fr 64px', gap: 10, padding: 12, border: `1px solid rgba(32,216,236,.12)`, background: 'rgba(159,125,255,.025)', position: 'relative', cursor: 'pointer', borderLeft: `3px solid ${accent}` }}
                  >
                    <div style={{ fontFamily: 'var(--mono)', fontSize: 9, color: VIOLET_BR, letterSpacing: '.08em' }}>{ev.time_start || '—'}</div>
                    <div>
                      <div style={{ fontFamily: 'var(--display)', fontSize: 16, fontWeight: 600, letterSpacing: '.06em', color: '#fff', lineHeight: 1.1 }}>{ev.title}</div>
                      <div style={{ fontFamily: 'var(--mono)', fontSize: 7, letterSpacing: '.09em', color: TEXT_DIM, marginTop: 4, lineHeight: 1.5 }}>
                        {[ev.event_type?.toUpperCase(), ev.location, ev.role].filter(Boolean).join(' · ')}
                      </div>
                    </div>
                    <div style={{ fontFamily: 'var(--mono)', fontSize: 7, textAlign: 'right', color: MUTED, letterSpacing: '.10em' }}>
                      {ev.time_end || ev.event_type?.toUpperCase() || ''}
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </div>

        {/* QUICK ACTIONS */}
        <div style={{ padding: '16px 18px', borderBottom: `1px solid ${BORDER}` }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
            <span style={{ fontFamily: 'var(--mono)', fontSize: 8, letterSpacing: '.22em', color: MUTED }}>QUICK ACTIONS</span>
            <span style={{ fontFamily: 'var(--display)', fontSize: 16, fontWeight: 600, color: VIOLET }}>SCHEDULE</span>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
            {[
              { label: 'ICS FEED', action: onFeed },
              { label: 'WEEK VIEW', action: onWeekView },
              { label: 'EVENT DETAIL', action: () => onEvent && onEvent(displayEvents[0] || null) },
              { label: 'ASK PHOENIX', action: () => onQuickAsk && onQuickAsk('What should I know about my schedule today?') },
            ].map(btn => (
              <div
                key={btn.label}
                onClick={btn.action || undefined}
                style={{ padding: '12px 10px', border: `1px solid rgba(159,125,255,.22)`, background: 'rgba(159,125,255,.045)', fontFamily: 'var(--mono)', fontSize: 8, letterSpacing: '.16em', color: VIOLET, textAlign: 'center', cursor: btn.action ? 'pointer' : 'default' }}
              >{btn.label}</div>
            ))}
          </div>
        </div>

        {/* PHOENIX NOTE */}
        <div style={{ margin: '14px 18px 32px', padding: '11px 13px', border: `1px solid rgba(32,216,236,.16)`, borderLeft: `3px solid ${VIOLET}`, background: 'rgba(159,125,255,.025)' }}>
          <div style={{ fontFamily: 'var(--mono)', fontSize: 7, letterSpacing: '.2em', color: 'rgba(159,125,255,.52)', marginBottom: 6 }}>PHOENIX NOTE</div>
          <div style={{ fontSize: '12.5px', lineHeight: 1.65, color: 'rgba(226,222,255,.78)' }}>
            {jarvisText || <span style={{ color: MUTED }}>Loading schedule analysis…</span>}
          </div>
        </div>
      </div>
    </div>
  )
}
