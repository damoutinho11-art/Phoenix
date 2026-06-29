import { useState, useEffect } from 'react'
import { getTrainingHistory, getTrainingStatus } from '../../api/client'

const FONTS_URL = 'https://fonts.googleapis.com/css2?family=Rajdhani:wght@500;600;700&family=Space+Grotesk:wght@300;400;500;600;700&family=Share+Tech+Mono&display=swap'
const KEYFRAMES = `@keyframes phScan { 0%{transform:translateX(-100%)} 100%{transform:translateX(100%)} }`

const BG         = '#060c12'
const CARD       = '#070e15'
const ORANGE     = '#ff8f2e'
const ORANGE_MUT = 'rgba(255,143,46,.42)'
const ORANGE_BDR = '1px solid rgba(255,143,46,.18)'
const CYAN_BR    = '#7df0ff'
const CYAN_MUT   = 'rgba(32,216,236,.42)'
const GREEN      = '#4dffb4'
const TEXT       = 'rgba(199,236,244,.92)'
const TEXT_DIM   = 'rgba(132,212,226,.45)'
const MONO       = "'Share Tech Mono', monospace"
const DISPLAY    = "'Rajdhani', sans-serif"
const BODY       = "'Space Grotesk', sans-serif"

function Label({ children }) {
  return (
    <div style={{ fontFamily: MONO, fontSize: 7, letterSpacing: '.22em', color: ORANGE_MUT, marginBottom: 8 }}>
      {children}
    </div>
  )
}

function Tag({ children, color = 'orange' }) {
  const styles = {
    orange: { border: '1px solid rgba(255,143,46,.2)',  color: 'rgba(255,143,46,.6)',  background: 'rgba(255,143,46,.04)'  },
    cyan:   { border: '1px solid rgba(32,216,236,.2)',  color: 'rgba(32,216,236,.6)',  background: 'rgba(32,216,236,.04)'  },
    green:  { border: '1px solid rgba(77,255,180,.25)', color: 'rgba(77,255,180,.75)', background: 'rgba(77,255,180,.04)'  },
  }
  return (
    <span style={{ fontFamily: MONO, fontSize: 7, letterSpacing: '.12em', padding: '3px 8px', ...styles[color] }}>
      {children}
    </span>
  )
}

function SessionCard({ session, index }) {
  const exs     = Array.isArray(session.exercises) ? session.exercises : []
  const topLift = exs.reduce((best, ex) => {
    const sets  = Array.isArray(ex.sets) ? ex.sets : []
    const maxKg = sets.reduce((m, st) => Math.max(m, st.weight_kg ?? 0), 0)
    return maxKg > best ? maxKg : best
  }, 0)
  const totalSets = exs.reduce((a, ex) => a + (Array.isArray(ex.sets) ? ex.sets.length : 0), 0)
  const isLower   = ['high_intensity', 'jump', 'iso_only', 'peak', 'attempt'].includes(session.session_type)
  const isJump    = session.session_type === 'jump'

  const typeLabel = session.session_type
    ? session.session_type.replace(/_/g, ' ').toUpperCase()
    : 'SESSION'

  const liftColor = index === 0 ? GREEN : ORANGE
  const opacity   = Math.max(0.45, 1 - index * 0.12)

  return (
    <div style={{ padding: '12px 18px', borderBottom: '1px solid rgba(255,143,46,.08)', opacity }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 8 }}>
        <div>
          <div style={{ fontFamily: MONO, fontSize: 7, letterSpacing: '.12em', color: TEXT_DIM, marginBottom: 3 }}>
            {session.date}
          </div>
          <div style={{ fontFamily: DISPLAY, fontSize: 18, fontWeight: 700, color: TEXT }}>
            {typeLabel}
          </div>
        </div>
        <div style={{ textAlign: 'right' }}>
          {topLift > 0 ? (
            <>
              <div style={{ fontFamily: DISPLAY, fontSize: 16, fontWeight: 700, color: liftColor }}>{topLift}kg</div>
              <div style={{ fontFamily: MONO, fontSize: 7, color: TEXT_DIM }}>top lift</div>
            </>
          ) : (
            <>
              <div style={{ fontFamily: DISPLAY, fontSize: 16, fontWeight: 700, color: TEXT_DIM }}>—</div>
              <div style={{ fontFamily: MONO, fontSize: 7, color: TEXT_DIM }}>bodyweight</div>
            </>
          )}
        </div>
      </div>
      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
        <Tag color="orange">{isLower ? 'LOWER' : 'UPPER'}</Tag>
        {totalSets > 0 && <Tag color="green">{totalSets} SETS</Tag>}
        {isJump && <Tag color="green">JUMP DAY</Tag>}
      </div>
    </div>
  )
}

export default function SessionHistory({ onBack }) {
  const [history, setHistory]     = useState(null)
  const [statusData, setStatusData] = useState(null)
  const [loading, setLoading]     = useState(true)

  useEffect(() => {
    if (!document.getElementById('ph-fonts')) {
      const link = document.createElement('link')
      link.id = 'ph-fonts'; link.rel = 'stylesheet'; link.href = FONTS_URL
      document.head.appendChild(link)
    }
    if (!document.getElementById('ph-keyframes')) {
      const style = document.createElement('style')
      style.id = 'ph-keyframes'; style.textContent = KEYFRAMES
      document.head.appendChild(style)
    }
  }, [])

  useEffect(() => {
    async function load() {
      const [h, s] = await Promise.allSettled([getTrainingHistory(), getTrainingStatus()])
      if (h.status === 'fulfilled') setHistory(h.value)
      if (s.status === 'fulfilled') setStatusData(s.value)
      setLoading(false)
    }
    load()
  }, [])

  // ── Derived values ────────────────────────────────────────────────────────
  const sessions    = Array.isArray(history?.sessions) ? history.sessions : []
  const nextHints   = Object.entries(history?.next_week_suggestions ?? {}).map(([exercise, data]) => ({
    exercise,
    suggested_kg: data.suggested_kg,
    previous_kg:  data.previous_kg ?? null,
  }))

  const totalSessions  = sessions.length
  const thisWeekCount  = statusData?.this_week_session_count ?? sessions.slice(0, 7).length
  const plannedPerWeek = 4

  const topLiftAllTime = sessions.reduce((best, s) => {
    const exs = Array.isArray(s.exercises) ? s.exercises : []
    const max = exs.reduce((b, ex) => {
      const sets = Array.isArray(ex.sets) ? ex.sets : []
      return Math.max(b, ...sets.map(st => st.weight_kg ?? 0))
    }, 0)
    return max > best ? max : best
  }, 0)

  const topLiftExercise = (() => {
    let best = 0, name = ''
    sessions.forEach(s => {
      const exs = Array.isArray(s.exercises) ? s.exercises : []
      exs.forEach(ex => {
        const sets = Array.isArray(ex.sets) ? ex.sets : []
        const max  = Math.max(...sets.map(st => st.weight_kg ?? 0))
        if (max > best) { best = max; name = ex.name }
      })
    })
    return name
  })()

  return (
    <div style={{ height: '100%', display: 'flex', flexDirection: 'column', background: BG, color: TEXT, fontFamily: BODY }}>

      {/* TOP BAR */}
      <div style={{
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        padding: '13px 18px 11px', borderBottom: ORANGE_BDR,
        position: 'sticky', top: 0, background: `${CARD}f8`,
        backdropFilter: 'blur(14px)', zIndex: 5, flexShrink: 0, overflow: 'hidden',
      }}>
        <div style={{ position: 'absolute', top: 0, left: 0, right: 0, height: 1, background: `linear-gradient(90deg,transparent,${ORANGE},transparent)`, animation: 'phScan 3.5s linear infinite' }} />
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <span onClick={onBack} style={{ color: ORANGE, fontSize: 16, cursor: 'pointer' }}>←</span>
          <span style={{ fontFamily: DISPLAY, fontSize: 16, fontWeight: 700, letterSpacing: '.3em', color: ORANGE, textShadow: `0 0 18px rgba(255,143,46,.4)` }}>HISTORY</span>
        </div>
        <span style={{ fontFamily: MONO, fontSize: 7, letterSpacing: '.14em', color: ORANGE_MUT }}>10-WK BLOCK</span>
      </div>

      {loading && (
        <div style={{ padding: '48px 18px', textAlign: 'center', fontFamily: MONO, fontSize: 9, letterSpacing: '.18em', color: ORANGE_MUT }}>
          LOADING HISTORY…
        </div>
      )}

      {!loading && (
        <div style={{ flex: 1, overflowY: 'auto', paddingBottom: 88 }}>

          {/* SUMMARY STATS */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', borderBottom: ORANGE_BDR }}>
            {[
              { label: 'TOTAL',     val: totalSessions > 0 ? String(totalSessions) : '—', color: CYAN_BR, sub: 'sessions' },
              { label: 'THIS WEEK', val: String(thisWeekCount),  color: ORANGE,  sub: `of ${plannedPerWeek} planned` },
              { label: 'TOP LIFT',  val: topLiftAllTime > 0 ? `${topLiftAllTime}kg` : '—', color: GREEN, sub: topLiftExercise.toLowerCase() || 'all time' },
            ].map(({ label, val, color, sub }, i) => (
              <div key={i} style={{ padding: '13px 10px', borderRight: i < 2 ? ORANGE_BDR : 'none', textAlign: 'center' }}>
                <div style={{ fontFamily: MONO, fontSize: 7, letterSpacing: '.16em', color: ORANGE_MUT, marginBottom: 5 }}>{label}</div>
                <div style={{ fontFamily: DISPLAY, fontSize: 24, fontWeight: 700, color }}>{val}</div>
                <div style={{ fontFamily: MONO, fontSize: 7, color: TEXT_DIM, marginTop: 3, letterSpacing: '.06em' }}>{sub}</div>
              </div>
            ))}
          </div>

          {/* NEXT SESSION TARGETS */}
          {nextHints.length > 0 && (
            <div style={{ padding: '14px 18px', borderBottom: ORANGE_BDR }}>
              <Label>NEXT SESSION TARGETS</Label>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 0 }}>
                {nextHints.map((hint, i) => (
                  <div key={i} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '8px 0', borderBottom: i < nextHints.length - 1 ? '1px solid rgba(255,143,46,.07)' : 'none' }}>
                    <span style={{ fontFamily: BODY, fontSize: 13, color: TEXT, fontWeight: 300 }}>{hint.exercise}</span>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      {hint.previous_kg != null && (
                        <span style={{ fontFamily: MONO, fontSize: 7, color: TEXT_DIM }}>was {hint.previous_kg}kg</span>
                      )}
                      <span style={{ fontFamily: DISPLAY, fontSize: 16, fontWeight: 700, color: GREEN }}>{hint.suggested_kg}kg</span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* SESSION LOG */}
          <div style={{ padding: '14px 18px 0' }}>
            <Label>SESSION LOG</Label>
          </div>

          {sessions.length === 0 && (
            <div style={{ padding: '0 18px 28px', fontFamily: MONO, fontSize: 8, color: ORANGE_MUT, letterSpacing: '.12em' }}>
              NO SESSIONS LOGGED YET
            </div>
          )}

          <div style={{ paddingBottom: 28 }}>
            {sessions.map((s, i) => (
              <SessionCard key={i} session={s} index={i} />
            ))}
          </div>

        </div>
      )}
    </div>
  )
}
