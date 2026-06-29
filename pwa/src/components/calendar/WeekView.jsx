import { useState } from 'react'

const VIOLET = '#9f7dff'
const VIOLET_BR = '#d8ccff'
const BORDER = 'rgba(32,216,236,.18)'
const MUTED = 'rgba(32,216,236,.38)'
const TEXT_DIM = 'rgba(181,178,216,.58)'
const CYAN = '#20d8ec'
const GOLD = '#ffd56b'
const POS = '#4dffb4'
const LIME = '#9dff6f'

// Prototype week data
const PROTO_WEEK = [
  { dow: 'MON', num: 22, pills: [{ label: 'REH', type: 'work' }, { label: 'UPPER', type: 'train' }] },
  { dow: 'TUE', num: 23, pills: [{ label: 'SHOW', type: 'work' }] },
  { dow: 'WED', num: 24, active: true, pills: [{ label: 'REH', type: 'work' }, { label: 'ME LOW', type: 'train' }, { label: 'MEAL', type: 'food' }] },
  { dow: 'THU', num: 25, pills: [{ label: 'FOCUS', type: 'default' }] },
  { dow: 'FRI', num: 26, pills: [{ label: 'JUMP', type: 'train' }] },
  { dow: 'SAT', num: 27, pills: [{ label: 'SHOW', type: 'work' }] },
  { dow: 'SUN', num: 28, pills: [{ label: 'REST', type: 'default' }] },
]

const SUGGESTIONS = [
  { text: 'Move meal prep before late show',    tag: 'SMART' },
  { text: 'Keep Friday jump session short',     tag: 'RECOVERY' },
  { text: 'Schedule finance review Sunday',     tag: '15M' },
]

function pillStyle(type) {
  if (type === 'work')  return { borderColor: 'rgba(255,213,107,.24)', color: GOLD }
  if (type === 'train') return { borderColor: 'rgba(77,255,180,.24)',  color: POS }
  if (type === 'food')  return { borderColor: 'rgba(157,255,111,.24)', color: LIME }
  return { borderColor: `rgba(159,125,255,.18)`, color: TEXT_DIM }
}

export default function WeekView({ onBack, onEvent }) {
  return (
    <div style={{ height: '100%', display: 'flex', flexDirection: 'column', background: '#000', color: 'rgba(226,222,255,.94)', fontFamily: "'Saira Condensed',sans-serif" }}>
      {/* TOP BAR */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '13px 18px 11px', borderBottom: `1px solid ${BORDER}`, position: 'sticky', top: 0, background: 'rgba(0,0,0,.96)', backdropFilter: 'blur(12px)', zIndex: 5, flexShrink: 0 }}>
        <div style={{ display: 'flex', alignItems: 'center' }}>
          <span onClick={onBack} style={{ color: CYAN, fontSize: 16, marginRight: 10, cursor: 'pointer' }}>←</span>
          <span style={{ fontFamily: 'var(--display)', fontSize: 13, fontWeight: 700, letterSpacing: '.28em', color: VIOLET_BR, filter: 'drop-shadow(0 0 8px rgba(159,125,255,.25))' }}>WEEK VIEW</span>
        </div>
        <span style={{ fontFamily: 'var(--mono)', fontSize: 8, letterSpacing: '.14em', color: VIOLET, border: `1px solid rgba(159,125,255,.32)`, background: 'rgba(159,125,255,.055)', padding: '2px 8px' }}>WK 26</span>
      </div>

      <div style={{ flex: 1, overflowY: 'auto', paddingBottom: 88 }}>
        {/* HERO 2-COL */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', borderBottom: `1px solid ${BORDER}` }}>
          <div style={{ padding: '16px 18px', borderRight: `1px solid ${BORDER}` }}>
            <div style={{ fontFamily: 'var(--mono)', fontSize: 8, letterSpacing: '.18em', color: MUTED, marginBottom: 5 }}>LOAD</div>
            <div style={{ fontFamily: 'var(--display)', fontSize: 34, fontWeight: 700, lineHeight: 1, background: `linear-gradient(135deg,#fff,${VIOLET})`, WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent' }}>72%</div>
            <div style={{ fontFamily: 'var(--mono)', fontSize: 8, color: TEXT_DIM, letterSpacing: '.1em', marginTop: 5, lineHeight: 1.55 }}>balanced week</div>
          </div>
          <div style={{ padding: '16px 18px' }}>
            <div style={{ fontFamily: 'var(--mono)', fontSize: 8, letterSpacing: '.18em', color: MUTED, marginBottom: 5 }}>FREE BLOCKS</div>
            <div style={{ fontFamily: 'var(--display)', fontSize: 34, fontWeight: 700, lineHeight: 1, color: '#fff' }}>9</div>
            <div style={{ fontFamily: 'var(--mono)', fontSize: 8, color: TEXT_DIM, letterSpacing: '.1em', marginTop: 5, lineHeight: 1.55 }}>available slots</div>
          </div>
        </div>

        {/* WEEK MAP */}
        <div style={{ padding: '16px 18px', borderBottom: `1px solid ${BORDER}` }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
            <span style={{ fontFamily: 'var(--mono)', fontSize: 8, letterSpacing: '.22em', color: MUTED }}>WEEK MAP</span>
            <span style={{ fontFamily: 'var(--display)', fontSize: 16, fontWeight: 600, color: VIOLET }}>JUN 22–28</span>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7,1fr)', gap: 5 }}>
            {PROTO_WEEK.map(day => (
              <div
                key={day.dow + day.num}
                style={{ minHeight: 112, border: `1px solid ${day.active ? 'rgba(159,125,255,.44)' : 'rgba(32,216,236,.12)'}`, background: day.active ? 'rgba(159,125,255,.07)' : 'rgba(159,125,255,.025)', padding: '7px 5px', cursor: 'pointer' }}
                onClick={() => {
                  if (onEvent) {
                    onEvent({ event_id: `day-${day.num}`, event_type: 'rehearsal', title: day.pills[0]?.label || 'Event', date: `2026-06-${String(day.num).padStart(2,'0')}`, time_start: null, time_end: null, location: null, role: null })
                  }
                }}
              >
                <div style={{ fontFamily: 'var(--mono)', fontSize: 7, color: MUTED, letterSpacing: '.1em', marginBottom: 6 }}>{day.dow}</div>
                <div style={{ fontFamily: 'var(--display)', fontSize: 18, color: VIOLET_BR }}>{day.num}</div>
                {day.pills.map((pill, pi) => {
                  const ps = pillStyle(pill.type)
                  return (
                    <div key={pi} style={{ fontFamily: 'var(--mono)', fontSize: 6, letterSpacing: '.08em', padding: '3px 4px', marginTop: 5, border: `1px solid ${ps.borderColor}`, color: ps.color, overflow: 'hidden', whiteSpace: 'nowrap', textOverflow: 'ellipsis' }}>
                      {pill.label}
                    </div>
                  )
                })}
              </div>
            ))}
          </div>
        </div>

        {/* PHOENIX SUGGESTIONS */}
        <div style={{ padding: '16px 18px', borderBottom: `1px solid ${BORDER}` }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
            <span style={{ fontFamily: 'var(--mono)', fontSize: 8, letterSpacing: '.22em', color: MUTED }}>PHOENIX SUGGESTIONS</span>
            <span style={{ fontFamily: 'var(--display)', fontSize: 16, fontWeight: 600, color: VIOLET }}>3</span>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {SUGGESTIONS.map(s => (
              <div key={s.text} style={{ padding: '10px 12px', border: `1px solid rgba(32,216,236,.12)`, background: 'rgba(159,125,255,.025)', display: 'flex', justifyContent: 'space-between' }}>
                <span style={{ fontSize: 13 }}>{s.text}</span>
                <b style={{ fontFamily: 'var(--mono)', fontSize: 8, color: VIOLET, letterSpacing: '.12em' }}>{s.tag}</b>
              </div>
            ))}
          </div>
        </div>

        {/* PHOENIX WEEK LOGIC */}
        <div style={{ margin: '14px 18px 32px', padding: '11px 13px', border: `1px solid rgba(32,216,236,.16)`, borderLeft: `3px solid ${VIOLET}`, background: 'rgba(159,125,255,.025)' }}>
          <div style={{ fontFamily: 'var(--mono)', fontSize: 7, letterSpacing: '.2em', color: 'rgba(159,125,255,.52)', marginBottom: 6 }}>PHOENIX WEEK LOGIC</div>
          <div style={{ fontSize: '12.5px', lineHeight: 1.65, color: 'rgba(226,222,255,.78)' }}>
            Week view is where PHOENIX should prevent overload: too much work, too much training, too little food, or no review time.
          </div>
        </div>
      </div>
    </div>
  )
}
