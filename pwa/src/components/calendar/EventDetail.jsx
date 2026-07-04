import { useState, useEffect } from 'react'
import { postJarvisChat } from '../../api/client'

const VIOLET = '#9f7dff'
const VIOLET_BR = '#d8ccff'
const BORDER = 'rgba(32,216,236,.18)'
const MUTED = 'rgba(32,216,236,.38)'
const TEXT_DIM = 'rgba(181,178,216,.58)'
const CYAN = '#20d8ec'
const POS = '#4dffb4'

const PROTO_EVENT = {
  title: 'OPERA REHEARSAL',
  sub: 'Estonian National Opera · Main stage · bassoon focus.',
  label: 'TODAY · 10:00–13:00',
  badge: 'LOCKED',
  details: [
    { label: 'TIME',     val: '10:00' },
    { label: 'DURATION', val: '3H' },
    { label: 'LOCATION', val: 'ENO' },
    { label: 'ENERGY',   val: 'HIGH' },
  ],
  prep: [
    { text: 'Bring reeds + backup reed case', status: 'READY' },
    { text: 'Hydration before rehearsal',     status: 'TODO' },
    { text: 'Keep gym later, not before',     status: 'LOCK' },
  ],
}

export default function EventDetail({ event, onBack }) {
  const [jarvisText, setJarvisText] = useState('')

  useEffect(() => {
    if (!event) return
    postJarvisChat({
      domain: 'calendar',
      message: `How should I manage training around this event: ${event.title} on ${event.date}?`,
    })
      .then(r => setJarvisText(r.response || ''))
      .catch(() => {})
  }, [event?.event_id])

  return (
    <div className="phx-scope-calendar" style={{ height: '100%', display: 'flex', flexDirection: 'column', background: 'radial-gradient(circle at 78% 4%, color-mix(in srgb, var(--phx-calendar) 8%, transparent), transparent 34rem), linear-gradient(180deg, #071019 0%, var(--phx-bg) 42%, #04090e 100%)', color: 'rgba(226,222,255,.94)', fontFamily: 'var(--phx-font-body)' }}>
      {/* TOP BAR */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '13px 18px 11px', borderBottom: `1px solid ${BORDER}`, position: 'sticky', top: 0, background: 'rgba(6,12,18,.92)', backdropFilter: 'blur(12px)', zIndex: 5, flexShrink: 0 }}>
        <div style={{ display: 'flex', alignItems: 'center' }}>
          <span className="phx-tap" onClick={onBack} style={{ color: VIOLET_BR, fontSize: 16, marginRight: 10, padding: '4px 6px', margin: '-4px 4px -4px -6px' }}>←</span>
          <span style={{ fontFamily: 'var(--phx-font-display)', fontSize: 13, fontWeight: 700, letterSpacing: '.28em', color: VIOLET_BR, filter: 'drop-shadow(0 0 8px rgba(159,125,255,.25))' }}>EVENT DETAIL</span>
        </div>
        <span style={{ fontFamily: 'var(--phx-font-mono)', fontSize: 8, letterSpacing: '.14em', color: VIOLET, border: `1px solid rgba(159,125,255,.32)`, background: 'rgba(159,125,255,.055)', padding: '2px 8px' }}>{event?.badge || PROTO_EVENT.badge}</span>
      </div>

      <div style={{ flex: 1, overflowY: 'auto', paddingBottom: 88 }}>
        {/* HERO */}
        <div style={{ padding: '22px 20px 18px', borderBottom: `1px solid ${BORDER}`, background: 'linear-gradient(180deg,rgba(159,125,255,.045),transparent)' }}>
          <div style={{ fontFamily: 'var(--phx-font-mono)', fontSize: 8, letterSpacing: '.22em', color: MUTED, marginBottom: 8 }}>
            {event ? `${event.date} · ${event.time_start || ''}` : PROTO_EVENT.label}
          </div>
          <div style={{ fontFamily: 'var(--phx-font-display)', fontSize: 36, fontWeight: 700, letterSpacing: '.08em', color: '#fff', lineHeight: 1, filter: 'drop-shadow(0 0 15px rgba(159,125,255,.28))' }}>
            {event ? event.title.toUpperCase() : PROTO_EVENT.title}
          </div>
          <div style={{ fontFamily: 'var(--phx-font-mono)', fontSize: 8, letterSpacing: '.12em', color: TEXT_DIM, lineHeight: 1.7, marginTop: 9 }}>
            {event ? [event.location, event.role].filter(Boolean).join(' · ') : PROTO_EVENT.sub}
          </div>
        </div>

        {/* DETAIL GRID */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', borderBottom: `1px solid ${BORDER}` }}>
          {(event
            ? [
                { label: 'TIME',     val: event.time_start || '—' },
                { label: 'LOCATION', val: event.location || '—' },
                { label: 'TYPE',     val: (event.event_type || '').toUpperCase() },
                { label: 'STATUS',   val: event.badge || 'SCHEDULED' },
              ]
            : PROTO_EVENT.details
          ).map((cell, i) => (
            <div key={cell.label} style={{ padding: '14px 18px', borderRight: i % 2 === 0 ? `1px solid ${BORDER}` : 'none', borderBottom: i < 2 ? `1px solid ${BORDER}` : 'none' }}>
              <div style={{ fontFamily: 'var(--phx-font-mono)', fontSize: 7, letterSpacing: '.18em', color: MUTED, marginBottom: 5 }}>{cell.label}</div>
              <div style={{ fontFamily: 'var(--phx-font-display)', fontSize: 18, fontWeight: 700, color: VIOLET_BR }}>{cell.val}</div>
            </div>
          ))}
        </div>

        {/* PHOENIX PREP */}
        <div style={{ padding: '16px 18px', borderBottom: `1px solid ${BORDER}` }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
            <span style={{ fontFamily: 'var(--phx-font-mono)', fontSize: 8, letterSpacing: '.22em', color: MUTED }}>PHOENIX PREP</span>
            <span style={{ fontFamily: 'var(--phx-font-display)', fontSize: 16, fontWeight: 600, color: VIOLET }}>3 ITEMS</span>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {PROTO_EVENT.prep.map(item => (
              <div key={item.text} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '10px 12px', border: `1px solid rgba(32,216,236,.12)`, background: 'rgba(159,125,255,.025)' }}>
                <span style={{ fontSize: 13, color: 'rgba(226,222,255,.82)' }}>{item.text}</span>
                <b style={{ fontFamily: 'var(--phx-font-mono)', fontSize: 8, color: POS, letterSpacing: '.12em' }}>{item.status}</b>
              </div>
            ))}
          </div>
        </div>

        {/* ACTIONS */}
        <div style={{ padding: '16px 18px', borderBottom: `1px solid ${BORDER}` }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
            <span style={{ fontFamily: 'var(--phx-font-mono)', fontSize: 8, letterSpacing: '.22em', color: MUTED }}>ACTIONS</span>
            <span style={{ fontFamily: 'var(--phx-font-display)', fontSize: 16, fontWeight: 600, color: VIOLET }}>MANUAL</span>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
            {['MOVE', 'NOTES', 'REMIND'].map(lbl => (
              <div key={lbl} className="phx-tap" style={{ padding: '13px 0', border: `1px solid rgba(159,125,255,.28)`, background: 'rgba(159,125,255,.055)', fontFamily: 'var(--phx-font-mono)', fontSize: 9, letterSpacing: '.18em', color: VIOLET, textAlign: 'center' }}>{lbl}</div>
            ))}
            <div className="phx-tap" style={{ padding: '13px 0', background: VIOLET, border: 'none', fontFamily: 'var(--phx-font-mono)', fontSize: 9, letterSpacing: '.18em', color: '#080313', textAlign: 'center', boxShadow: '0 0 18px rgba(159,125,255,.28)' }}>DONE</div>
          </div>
        </div>

        {/* PHOENIX CONTEXT */}
        <div style={{ margin: '14px 18px 32px', padding: '11px 13px', border: `1px solid rgba(32,216,236,.16)`, borderLeft: `3px solid ${VIOLET}`, background: 'rgba(159,125,255,.025)' }}>
          <div style={{ fontFamily: 'var(--phx-font-mono)', fontSize: 7, letterSpacing: '.2em', color: 'rgba(159,125,255,.52)', marginBottom: 6 }}>PHOENIX CONTEXT</div>
          <div style={{ fontSize: '12.5px', lineHeight: 1.65, color: 'rgba(226,222,255,.78)' }}>
            {jarvisText || 'Events should not live alone. PHOENIX should connect rehearsal load with meal timing, recovery, and whether training intensity should be adjusted.'}
          </div>
        </div>
      </div>
    </div>
  )
}
