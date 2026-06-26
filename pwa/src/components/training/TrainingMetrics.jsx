import { useState, useEffect, useRef } from 'react'
import { getTrainingHistory, getTrainingStatus, logJump } from '../../api/client'

// ─── Jump Chart SVG ───────────────────────────────────────────────────────────

function JumpChart({ jumpData, targetLine = 32.0 }) {
  const lineRef = useRef(null)
  const W = 390, H = 80
  const pad = { l: 0, r: 0, t: 8, b: 4 }
  const cw = W - pad.l - pad.r, ch = H - pad.t - pad.b
  if (!jumpData || jumpData.length < 2) return (
    <div style={{ height: 80, display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: 'var(--mono)', fontSize: 9, color: 'rgba(32,216,236,.38)' }}>
      No jump data yet
    </div>
  )

  const mn = Math.min(...jumpData, targetLine) - 0.5
  const mx = Math.max(...jumpData, targetLine) + 0.5
  const px = i => (i / (jumpData.length - 1)) * cw + pad.l
  const py = v => pad.t + (1 - (v - mn) / (mx - mn)) * ch

  const tyVal = py(targetLine)
  const lastX = px(jumpData.length - 1)
  const lastY = py(jumpData[jumpData.length - 1])
  const pts = jumpData.map((v, i) => `${px(i).toFixed(1)},${py(v).toFixed(1)}`).join(' ')
  const fillPts = pts + ` ${lastX.toFixed(1)},${H} 0,${H}`

  const lineLen = jumpData.reduce((a, v, i) =>
    i === 0 ? 0 : a + Math.hypot(px(i) - px(i - 1), py(v) - py(jumpData[i - 1])), 0)

  useEffect(() => {
    if (!lineRef.current) return
    lineRef.current.style.transition = 'none'
    lineRef.current.setAttribute('stroke-dashoffset', lineLen)
    const t = setTimeout(() => {
      if (lineRef.current) {
        lineRef.current.style.transition = 'stroke-dashoffset 1.4s cubic-bezier(.4,0,.2,1)'
        lineRef.current.setAttribute('stroke-dashoffset', '0')
      }
    }, 100)
    return () => clearTimeout(t)
  }, [lineLen])

  return (
    <div style={{ position: 'relative', height: 80 }}>
      <svg viewBox={`0 0 ${W} ${H}`} style={{ width: '100%', display: 'block' }} preserveAspectRatio="none">
        <defs>
          <linearGradient id="jGrad" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="rgba(77,255,180,.4)" />
            <stop offset="100%" stopColor="rgba(77,255,180,0)" />
          </linearGradient>
          <filter id="jGlow">
            <feGaussianBlur stdDeviation="2" result="blur" />
            <feMerge><feMergeNode in="blur" /><feMergeNode in="SourceGraphic" /></feMerge>
          </filter>
        </defs>
        <line x1={0} y1={tyVal} x2={W} y2={tyVal}
          stroke="rgba(255,213,107,.3)" strokeWidth="1" strokeDasharray="4 4" />
        <text x={W - 2} y={tyVal - 3} textAnchor="end"
          fontFamily="Share Tech Mono,monospace" fontSize="7" fill="rgba(255,213,107,.55)">
          {targetLine}" TARGET
        </text>
        <polygon points={fillPts} fill="url(#jGrad)" />
        <polyline
          ref={lineRef}
          points={pts}
          fill="none"
          stroke="#4dffb4"
          strokeWidth="2.5"
          filter="url(#jGlow)"
          strokeDasharray={lineLen}
          strokeDashoffset={lineLen}
        />
        <circle cx={lastX.toFixed(1)} cy={lastY.toFixed(1)} r="4"
          fill="#4dffb4" stroke="#000" strokeWidth="1.5" filter="url(#jGlow)" />
      </svg>
    </div>
  )
}

// ─── Recovery Ring ────────────────────────────────────────────────────────────

function RecoveryRing({ pct = 75 }) {
  const circ = 213.6
  const offset = circ * (1 - pct / 100)
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 18, padding: '14px 18px', borderTop: '1px solid rgba(32,216,236,.18)' }}>
      <div style={{ position: 'relative', flexShrink: 0 }}>
        <svg width="80" height="80" viewBox="0 0 80 80">
          <circle cx="40" cy="40" r="34" fill="none" stroke="rgba(32,216,236,.1)" strokeWidth="6" />
          <circle cx="40" cy="40" r="34" fill="none" stroke="#7df0ff" strokeWidth="6"
            strokeLinecap="round" strokeDasharray={circ} strokeDashoffset={offset}
            transform="rotate(-90 40 40)"
            style={{ transition: 'stroke-dashoffset 1.2s cubic-bezier(.4,0,.2,1)' }} />
        </svg>
        <div style={{ position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center' }}>
          <div style={{ fontFamily: 'var(--display)', fontSize: 18, fontWeight: 700, color: '#7df0ff', lineHeight: 1 }}>{pct}%</div>
          <div style={{ fontFamily: 'var(--mono)', fontSize: 7, letterSpacing: '.1em', color: 'rgba(32,216,236,.38)' }}>RECOVERY</div>
        </div>
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 6, flex: 1 }}>
        <div style={{ fontFamily: 'var(--mono)', fontSize: 8, letterSpacing: '.18em', color: 'rgba(32,216,236,.38)', marginBottom: 6 }}>
          READINESS BREAKDOWN
        </div>
        {[
          { label: 'SLEEP',    pct: 82, color: '#4dffb4', val: '7h 20m', valColor: '#7df0ff' },
          { label: 'SORENESS', pct: 60, color: '#ffd56b', val: 'MOD',    valColor: '#ffd56b' },
          { label: 'HRV',      pct: 78, color: '#4dffb4', val: '68ms',   valColor: '#7df0ff' },
        ].map(({ label, pct: p, color, val, valColor }) => (
          <div key={label} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <span style={{ fontFamily: 'var(--mono)', fontSize: 8, letterSpacing: '.12em', color: 'rgba(32,216,236,.38)' }}>{label}</span>
            <div style={{ height: 3, background: 'rgba(32,216,236,.1)', flex: 1, margin: '0 10px', borderRadius: 1 }}>
              <div style={{ height: '100%', borderRadius: 1, background: color, width: `${p}%` }} />
            </div>
            <span style={{ fontFamily: 'var(--mono)', fontSize: 9, color: valColor }}>{val}</span>
          </div>
        ))}
      </div>
    </div>
  )
}

// ─── Weight Bars ──────────────────────────────────────────────────────────────

function WeightBars({ currentKg, targetKg = 81, startKg = 87 }) {
  const current = currentKg ?? startKg
  const maxH = 28

  // Build a simple display bar from start → current
  const steps = 10
  const weights = Array.from({ length: steps }, (_, i) => {
    const progress = i / (steps - 1)
    return startKg - (startKg - current) * progress
  })

  const kgLost = (startKg - current).toFixed(1)
  const kgToGo = Math.max(0, current - targetKg).toFixed(1)

  return (
    <div style={{ padding: '14px 18px', borderTop: '1px solid rgba(32,216,236,.18)' }}>
      <div style={{ fontFamily: 'var(--mono)', fontSize: 8, letterSpacing: '.22em', color: 'rgba(32,216,236,.38)', marginBottom: 8 }}>
        BODYWEIGHT · CUT PHASE
      </div>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 10, marginBottom: 4 }}>
        <div style={{ fontFamily: 'var(--display)', fontSize: 28, fontWeight: 700, color: '#fff' }}>{current.toFixed(1)}</div>
        <div style={{ fontFamily: 'var(--mono)', fontSize: 10, color: 'rgba(32,216,236,.38)', letterSpacing: '.1em' }}>KG</div>
        {parseFloat(kgLost) > 0 && (
          <div style={{ fontFamily: 'var(--mono)', fontSize: 11, color: '#4dffb4', padding: '2px 7px', border: '1px solid rgba(77,255,180,.3)', background: 'rgba(77,255,180,.06)' }}>−{kgLost}kg</div>
        )}
      </div>
      <div style={{ fontFamily: 'var(--mono)', fontSize: 8, color: 'rgba(125,188,200,.55)', letterSpacing: '.1em', marginBottom: 12 }}>
        TARGET: {targetKg}KG · {kgToGo}KG TO GO
      </div>
      <div style={{ display: 'flex', alignItems: 'flex-end', gap: 3, height: 32 }}>
        {weights.map((w, i) => {
          const pct = 1 - (w - targetKg) / Math.max(0.1, startKg - targetKg)
          const h = Math.max(4, pct * maxH)
          const isLast = i === weights.length - 1
          return (
            <div
              key={i}
              style={{
                flex: 1, height: h, borderRadius: '1px 1px 0 0', alignSelf: 'flex-end',
                background: isLast ? '#7df0ff' : 'rgba(32,216,236,.4)',
                boxShadow: isLast ? '0 0 8px rgba(32,216,236,.6)' : 'none',
              }}
            />
          )
        })}
      </div>
      <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 5 }}>
        <span style={{ fontFamily: 'var(--mono)', fontSize: 7, color: 'rgba(32,216,236,.38)' }}>START</span>
        <span style={{ fontFamily: 'var(--mono)', fontSize: 7, color: 'rgba(32,216,236,.38)' }}>NOW</span>
      </div>
    </div>
  )
}

// ─── Log Jump Modal ────────────────────────────────────────────────────────────

function JumpModal({ onClose, onSuccess }) {
  const [inches, setInches] = useState(24)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState('')

  async function handleSubmit() {
    setSubmitting(true)
    setError('')
    try {
      const today = new Date().toISOString().slice(0, 10)
      await logJump({ date: today, jump_type: 'approach', height_cm: +(inches * 2.54).toFixed(1) })
      onSuccess()
    } catch {
      setError('Failed to log. Try again.')
      setSubmitting(false)
    }
  }

  return (
    <div
      style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,.88)', zIndex: 200, display: 'flex', alignItems: 'flex-end', justifyContent: 'center' }}
      onClick={e => e.target === e.currentTarget && onClose()}
    >
      <div style={{ width: '100%', maxWidth: 480, background: '#000', border: '1px solid rgba(32,216,236,.18)', borderBottom: 'none', padding: '24px 20px 40px' }}>
        <div style={{ fontFamily: 'var(--mono)', fontSize: 8, letterSpacing: '.22em', color: 'rgba(32,216,236,.38)', marginBottom: 16 }}>
          LOG JUMP
        </div>
        <div style={{ textAlign: 'center', marginBottom: 28 }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 24 }}>
            <button onClick={() => setInches(v => Math.max(10, +(v - 0.5).toFixed(1)))}
              style={{ width: 52, height: 52, background: 'none', border: '1px solid rgba(32,216,236,.18)', color: '#ff8f2e', fontSize: 24, cursor: 'pointer', fontFamily: 'var(--display)' }}>−</button>
            <div style={{ fontFamily: 'var(--mono)', fontSize: 52, color: '#fff', minWidth: 100, textAlign: 'center', lineHeight: 1 }}>
              {inches}"
            </div>
            <button onClick={() => setInches(v => Math.min(50, +(v + 0.5).toFixed(1)))}
              style={{ width: 52, height: 52, background: 'none', border: '1px solid rgba(32,216,236,.18)', color: '#ff8f2e', fontSize: 24, cursor: 'pointer', fontFamily: 'var(--display)' }}>+</button>
          </div>
          <div style={{ fontFamily: 'var(--mono)', fontSize: 9, color: 'rgba(32,216,236,.38)', marginTop: 8 }}>
            {(inches * 2.54).toFixed(1)} cm · target: 32"
          </div>
        </div>
        {error && <div style={{ fontFamily: 'var(--mono)', fontSize: 11, color: '#ff5c7a', marginBottom: 12, textAlign: 'center' }}>{error}</div>}
        <div style={{ display: 'flex', gap: 10 }}>
          <button onClick={onClose} style={{ flex: 1, padding: '14px 0', textAlign: 'center', fontFamily: 'var(--mono)', fontSize: 9, letterSpacing: '.2em', color: 'rgba(32,216,236,.38)', border: '1px solid rgba(32,216,236,.18)', background: 'none', cursor: 'pointer' }}>
            CANCEL
          </button>
          <button onClick={handleSubmit} disabled={submitting}
            style={{ flex: 2, padding: '14px 0', textAlign: 'center', fontFamily: 'var(--mono)', fontSize: 9, letterSpacing: '.2em', color: '#000', fontWeight: 700, background: '#20d8ec', border: '1px solid #20d8ec', cursor: 'pointer', boxShadow: '0 0 16px rgba(32,216,236,.4)' }}>
            {submitting ? 'LOGGING…' : 'LOG JUMP'}
          </button>
        </div>
      </div>
    </div>
  )
}

// ─── Main Component ───────────────────────────────────────────────────────────

export default function TrainingMetrics({ onBack, onStartSession, onQuickAsk, onNav }) {
  const [modalOpen, setModalOpen] = useState(false)
  const [statusData, setStatusData] = useState(null)
  const [history, setHistory] = useState(null)

  async function loadData() {
    const [s, h] = await Promise.allSettled([getTrainingStatus(), getTrainingHistory()])
    if (s.status === 'fulfilled') setStatusData(s.value)
    if (h.status === 'fulfilled') setHistory(h.value)
  }

  useEffect(() => { loadData() }, [])

  // Dunk countdown from API or computed from target date
  const targetDateStr = statusData?.dunk_goal?.attempt_window_start ?? '2026-08-25'
  const daysToAttempt = statusData?.dunk_goal?.days_to_attempt ?? Math.max(0, Math.ceil((new Date(targetDateStr) - new Date()) / 86400000))

  const phase = statusData?.dunk_goal?.current_phase ?? 'ACCUMULATION'
  const mesoWeek = statusData?.dunk_goal?.current_mesocycle_week ?? '—'
  const onTrack = statusData?.dunk_goal?.on_track

  // Today's session from API
  const todaySession = statusData?.today_session
  const sessionType = todaySession?.session_type?.toUpperCase() ?? '—'
  const sessionLabel = todaySession?.label ?? ''
  const exercises = todaySession?.exercises ?? []

  // Jump progression: convert cm → inches, extract approach values
  const jumpProgression = history?.jump_progression ?? []
  const jumpDataInches = jumpProgression
    .filter(p => p.approach != null)
    .map(p => parseFloat((p.approach / 2.54).toFixed(2)))
  const lastJumpIn = jumpDataInches.length > 0 ? jumpDataInches[jumpDataInches.length - 1] : null
  const firstJumpIn = jumpDataInches.length > 0 ? jumpDataInches[0] : null
  const jumpGained = (lastJumpIn != null && firstJumpIn != null)
    ? `+${(lastJumpIn - firstJumpIn).toFixed(1)}" gained`
    : 'no data yet'

  // Sessions count
  const sessionCount = history?.sessions?.length ?? 0

  // Bodyweight from cut_status
  const currentBodyweightKg = statusData?.cut_status?.current_bodyweight_kg ?? null

  const BORDER = 'rgba(32,216,236,.18)'
  const MUTED = 'rgba(32,216,236,.38)'
  const CYAN = '#20d8ec'
  const CYAN_BR = '#7df0ff'
  const ORANGE = '#ff8f2e'

  return (
    <div style={{ height: '100%', display: 'flex', flexDirection: 'column', background: '#000', color: 'rgba(199,236,244,.92)', fontFamily: "'Saira Condensed',sans-serif" }}>
      {/* TOP BAR */}
      <div style={{
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        padding: '13px 18px 11px', borderBottom: `1px solid ${BORDER}`,
        position: 'sticky', top: 0, background: 'rgba(0,0,0,.96)', backdropFilter: 'blur(12px)', zIndex: 5, flexShrink: 0,
      }}>
        <div style={{ display: 'flex', alignItems: 'center' }}>
          <span onClick={onBack} style={{ color: CYAN, fontSize: 16, marginRight: 10, cursor: 'pointer' }}>←</span>
          <span style={{ fontFamily: 'var(--display)', fontSize: 13, fontWeight: 700, letterSpacing: '.28em', color: CYAN_BR }}>TRAINING</span>
        </div>
        <span style={{ fontFamily: 'var(--mono)', fontSize: 8, letterSpacing: '.14em', color: ORANGE, border: `1px solid rgba(255,143,46,.26)`, padding: '2px 8px', background: 'rgba(255,143,46,.07)' }}>
          {phase.replace(/_/g, ' ')}
        </span>
      </div>

      <div style={{ flex: 1, overflowY: 'auto' }}>
        {/* DUNK COUNTDOWN HERO */}
        <div style={{
          padding: '20px 20px 18px', borderBottom: `1px solid ${BORDER}`,
          background: 'linear-gradient(180deg,rgba(32,216,236,.035),transparent)',
          position: 'relative', overflow: 'hidden',
        }}>
          <div style={{ position: 'absolute', top: 0, left: 0, right: 0, height: 1, background: 'linear-gradient(90deg,transparent,rgba(32,216,236,.28),transparent)' }} />
          <div style={{ fontFamily: 'var(--mono)', fontSize: 8, letterSpacing: '.22em', color: MUTED, marginBottom: 8 }}>
            DAYS TO DUNK ATTEMPT
          </div>
          <div style={{ display: 'flex', alignItems: 'flex-end', gap: 16 }}>
            <div style={{
              fontFamily: 'var(--display)', fontSize: 72, fontWeight: 700, lineHeight: .9,
              background: 'linear-gradient(155deg,#fff 0%,#7df0ff 50%,#20d8ec 100%)',
              WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent',
              filter: 'drop-shadow(0 0 20px rgba(32,216,236,.38))',
            }}>
              {daysToAttempt}
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 4, paddingBottom: 6 }}>
              <div style={{ fontFamily: 'var(--display)', fontSize: 16, fontWeight: 400, letterSpacing: '.2em', color: MUTED }}>DAYS</div>
              <div style={{ fontFamily: 'var(--mono)', fontSize: 8, letterSpacing: '.14em', color: CYAN, padding: '3px 8px', border: `1px solid rgba(32,216,236,.3)`, background: 'rgba(32,216,236,.06)' }}>
                TARGET · {targetDateStr.slice(0, 7).replace('-', ' ').toUpperCase()}
              </div>
            </div>
          </div>
          {statusData && (
            <div style={{ fontFamily: 'var(--mono)', fontSize: 8, letterSpacing: '.16em', color: 'rgba(125,188,200,.55)', marginTop: 10 }}>
              WEEK {mesoWeek} OF MESOCYCLE · {onTrack ? 'ON TRACK' : 'REVIEW NEEDED'}
            </div>
          )}
        </div>

        {/* WEEK + SESSION TYPE STRIP */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', borderBottom: `1px solid ${BORDER}` }}>
          <div style={{ padding: '14px 18px', borderRight: `1px solid ${BORDER}` }}>
            <div style={{ fontFamily: 'var(--mono)', fontSize: 7, letterSpacing: '.2em', color: MUTED, marginBottom: 6 }}>CURRENT WEEK</div>
            <div style={{ fontFamily: 'var(--display)', fontSize: 22, fontWeight: 700, letterSpacing: '.04em', color: CYAN_BR }}>WK {mesoWeek}</div>
            <div style={{ fontFamily: 'var(--mono)', fontSize: 8, letterSpacing: '.1em', color: 'rgba(125,188,200,.55)', marginTop: 3 }}>{phase.replace(/_/g, ' ')}</div>
          </div>
          <div style={{ padding: '14px 18px' }}>
            <div style={{ fontFamily: 'var(--mono)', fontSize: 7, letterSpacing: '.2em', color: MUTED, marginBottom: 6 }}>TODAY'S TYPE</div>
            <div style={{ fontFamily: 'var(--display)', fontSize: 22, fontWeight: 700, letterSpacing: '.04em', color: ORANGE }}>{sessionType}</div>
            <div style={{ fontFamily: 'var(--mono)', fontSize: 8, letterSpacing: '.1em', color: 'rgba(125,188,200,.55)', marginTop: 3 }}>{sessionLabel}</div>
          </div>
        </div>

        {/* TODAY'S SESSION CARD */}
        <div style={{ margin: '16px 18px', border: `1px solid ${BORDER}`, background: 'rgba(0,0,0,.9)', position: 'relative', overflow: 'hidden', cursor: 'pointer' }}
          onClick={() => { if (onNav) onNav('active-session'); else if (onStartSession) onStartSession() }}>
          <div style={{ position: 'absolute', left: 0, top: 0, bottom: 0, width: 4, background: ORANGE, boxShadow: `0 0 9px rgba(255,143,46,.32)` }} />
          <div style={{ position: 'absolute', top: 0, left: 0, right: 0, height: 1, background: 'linear-gradient(90deg,transparent,rgba(32,216,236,.25),transparent)' }} />

          <div style={{ padding: '16px 16px 16px 20px' }}>
            <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 10 }}>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
                <span style={{ display: 'inline-block', fontFamily: 'var(--display)', fontSize: 11, fontWeight: 700, letterSpacing: '.22em', padding: '3px 10px', color: ORANGE, border: `1px solid rgba(255,143,46,.4)`, background: 'rgba(255,143,46,.08)', marginBottom: 2 }}>
                  {sessionType}
                </span>
                <div style={{ fontFamily: 'var(--display)', fontSize: 20, fontWeight: 700, letterSpacing: '.06em', color: '#fff', lineHeight: 1 }}>{sessionLabel || 'SESSION'}</div>
              </div>
              <span style={{ fontSize: 18, color: CYAN, opacity: .7 }}>→</span>
            </div>

            {exercises.length > 0 && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 0, marginBottom: 12 }}>
                {exercises.slice(0, 4).map((ex, i) => (
                  <div key={i} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '7px 0', borderBottom: i < Math.min(exercises.length, 4) - 1 ? `1px solid rgba(32,216,236,.06)` : 'none' }}>
                    <span style={{ fontFamily: "'Saira Condensed',sans-serif", fontSize: 13, fontWeight: 400, color: 'rgba(199,236,244,.82)' }}>{ex.name}</span>
                    <span style={{ fontFamily: 'var(--mono)', fontSize: 9, letterSpacing: '.08em', color: MUTED }}>{ex.sets_reps || ex.label || ''}</span>
                  </div>
                ))}
              </div>
            )}
          </div>

          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, padding: '11px 0', background: 'rgba(32,216,236,.06)', border: `1px solid rgba(32,216,236,.2)`, fontFamily: 'var(--mono)', fontSize: 9, letterSpacing: '.22em', color: CYAN, cursor: 'pointer', marginTop: -1 }}>
            ▶ START SESSION
          </div>
        </div>

        {/* STATS ROW */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', borderTop: `1px solid ${BORDER}`, borderBottom: `1px solid ${BORDER}` }}>
          {[
            { label: 'SESSIONS', val: sessionCount > 0 ? String(sessionCount) : '—', valClass: CYAN_BR, sub: 'this block' },
            { label: 'VERT JUMP', val: lastJumpIn != null ? `${lastJumpIn.toFixed(1)}"` : '—', valClass: '#4dffb4', sub: jumpGained },
            { label: 'PHASE', val: String(mesoWeek), valClass: ORANGE, sub: phase.toLowerCase().replace(/_/g, ' ') },
          ].map(({ label, val, valClass, sub }, i) => (
            <div key={i} style={{ padding: '12px 14px', borderRight: i < 2 ? `1px solid ${BORDER}` : 'none', textAlign: 'center' }}>
              <div style={{ fontFamily: 'var(--mono)', fontSize: 7, letterSpacing: '.16em', color: MUTED, marginBottom: 4 }}>{label}</div>
              <div style={{ fontFamily: 'var(--display)', fontSize: 18, fontWeight: 700, color: valClass }}>{val}</div>
              <div style={{ fontFamily: 'var(--mono)', fontSize: 7, color: 'rgba(125,188,200,.55)', marginTop: 2, letterSpacing: '.08em' }}>{sub}</div>
            </div>
          ))}
        </div>

        {/* VERTICAL JUMP TREND */}
        <div style={{ padding: '16px 18px 12px', borderTop: `1px solid ${BORDER}` }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
            <span style={{ fontFamily: 'var(--mono)', fontSize: 8, letterSpacing: '.22em', color: MUTED }}>VERTICAL JUMP TREND</span>
            {lastJumpIn != null && (
              <span style={{ fontFamily: 'var(--display)', fontSize: 16, fontWeight: 600, color: '#4dffb4' }}>{lastJumpIn.toFixed(1)}"</span>
            )}
          </div>
          <JumpChart jumpData={jumpDataInches} targetLine={32.0} />
          <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 6 }}>
            <span style={{ fontFamily: 'var(--mono)', fontSize: 7, color: MUTED }}>FIRST LOG</span>
            <span style={{ fontFamily: 'var(--mono)', fontSize: 7, color: MUTED, letterSpacing: '.1em' }}>TARGET: 32" BY AUG</span>
            <span style={{ fontFamily: 'var(--mono)', fontSize: 7, color: MUTED }}>NOW</span>
          </div>
        </div>

        {/* RECOVERY RING */}
        <RecoveryRing pct={75} />

        {/* BODYWEIGHT TREND */}
        <WeightBars currentKg={currentBodyweightKg} targetKg={81} startKg={87} />

        {/* LOG JUMP BUTTON */}
        <div style={{ padding: '0 18px 32px' }}>
          <button
            onClick={() => setModalOpen(true)}
            style={{ width: '100%', padding: '13px 0', textAlign: 'center', fontFamily: 'var(--mono)', fontSize: 9, letterSpacing: '.22em', color: '#000', fontWeight: 700, background: CYAN, border: `1px solid ${CYAN}`, cursor: 'pointer', boxShadow: `0 0 16px rgba(32,216,236,.4)` }}
          >
            + LOG JUMP
          </button>
        </div>
      </div>

      {modalOpen && (
        <JumpModal
          onClose={() => setModalOpen(false)}
          onSuccess={() => { setModalOpen(false); loadData() }}
        />
      )}
    </div>
  )
}
