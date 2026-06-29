import { useState, useEffect, useRef } from 'react'
import { getTrainingHistory, getTrainingStatus, getTrainingRecovery, getTrainingBrief, logJump } from '../../api/client'

// ─── Design tokens ────────────────────────────────────────────────────────────
const T = {
  bg:          '#010608',
  surface:     'rgba(255,143,46,.032)',
  surfaceCyan: 'rgba(32,216,236,.035)',
  orange:      '#ff8f2e',
  orangeDim:   'rgba(255,143,46,.18)',
  orangeMuted: 'rgba(255,143,46,.42)',
  orangeBorder:'rgba(255,143,46,.16)',
  cyan:        '#20d8ec',
  cyanBr:      '#7df0ff',
  cyanDim:     'rgba(32,216,236,.18)',
  cyanMuted:   'rgba(32,216,236,.4)',
  green:       '#4dffb4',
  yellow:      '#ffd56b',
  red:         '#ff5c7a',
  text:        'rgba(199,236,244,.92)',
  textDim:     'rgba(132,212,226,.58)',
  border:      '1px solid rgba(255,143,46,.14)',
  borderCyan:  '1px solid rgba(32,216,236,.18)',
  mono:        'var(--mono)',
  display:     'var(--display)',
  body:        'var(--body)',
}

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

function scoreColor(score) {
  if (score == null) return T.cyanDim
  return score >= 75 ? T.green : score >= 50 ? T.yellow : T.red
}

function RecoveryRing({ recovery }) {
  const sleep    = recovery?.sleep
  const soreness = recovery?.soreness
  const overall  = recovery?.overall ?? null

  const sleepScore   = sleep?.available    ? (sleep.score    ?? null) : null
  const sleepHours   = sleep?.available    ? (sleep.duration_hours ?? null) : null
  const sorenessLabel= soreness?.available ? (soreness.label ?? null) : null
  const sorenessPct  = soreness?.available ? (soreness.pct   ?? 0)   : 0

  const ringPct    = overall ?? 0
  const circ       = 213.6
  const offset     = circ * (1 - ringPct / 100)
  const ringColor  = scoreColor(overall)
  const sleepColor = scoreColor(sleepScore)
  const sorenessColor = soreness?.available ? scoreColor(sorenessPct) : T.cyanDim

  const sleepVal = sleepHours != null
    ? `${Math.floor(sleepHours)}h ${Math.round((sleepHours % 1) * 60)}m`
    : '—'

  return (
    <div style={{ padding: '18px 18px', borderTop: T.borderCyan, background: T.surfaceCyan }}>
      <div style={{ fontFamily: T.mono, fontSize: 8, letterSpacing: '.22em', color: T.cyanMuted, marginBottom: 14 }}>RECOVERY</div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 20 }}>

        {/* Ring */}
        <div style={{ position: 'relative', flexShrink: 0 }}>
          <svg width="80" height="80" viewBox="0 0 80 80">
            <circle cx="40" cy="40" r="34" fill="none" stroke="rgba(32,216,236,.08)" strokeWidth="5" />
            <circle cx="40" cy="40" r="34" fill="none" stroke={ringColor} strokeWidth="5"
              strokeLinecap="round" strokeDasharray={circ} strokeDashoffset={offset}
              transform="rotate(-90 40 40)"
              style={{ transition: 'stroke-dashoffset 1.2s cubic-bezier(.4,0,.2,1)', filter: `drop-shadow(0 0 6px ${ringColor}66)` }} />
          </svg>
          <div style={{ position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center' }}>
            <div style={{ fontFamily: T.display, fontSize: 20, fontWeight: 700, color: ringColor, lineHeight: 1 }}>
              {overall != null ? `${overall}%` : '—'}
            </div>
            <div style={{ fontFamily: T.mono, fontSize: 6, letterSpacing: '.1em', color: T.cyanMuted, marginTop: 2 }}>READY</div>
          </div>
        </div>

        {/* Bars */}
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 10 }}>
          {[
            { label: 'SLEEP',    color: sleepColor,    pct: sleepScore ?? 0,  val: sleepVal },
            { label: 'SORENESS', color: sorenessColor, pct: sorenessPct,       val: sorenessLabel ?? '—' },
          ].map(({ label, color, pct, val }) => (
            <div key={label}>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 5 }}>
                <span style={{ fontFamily: T.mono, fontSize: 7, letterSpacing: '.14em', color: T.cyanMuted }}>{label}</span>
                <span style={{ fontFamily: T.mono, fontSize: 8, color, letterSpacing: '.04em' }}>{val}</span>
              </div>
              <div style={{ height: 3, background: 'rgba(32,216,236,.1)', borderRadius: 2 }}>
                <div style={{ height: '100%', borderRadius: 2, background: color, width: `${pct}%`, transition: 'width 1.1s ease', boxShadow: `0 0 6px ${color}88` }} />
              </div>
            </div>
          ))}
          {!sleep?.available && !soreness?.available && (
            <div style={{ fontFamily: T.mono, fontSize: 7, color: 'rgba(32,216,236,.2)', letterSpacing: '.08em' }}>
              tell PHOENIX how you feel
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

// ─── Weight Bars ──────────────────────────────────────────────────────────────

function WeightBars({ currentKg, targetKg = 81, startKg = 87 }) {
  const current  = currentKg ?? startKg
  const kgLost   = Math.max(0, startKg - current)
  const kgToGo   = Math.max(0, current - targetKg)
  const totalCut = startKg - targetKg
  const progress = Math.min(1, kgLost / Math.max(0.1, totalCut))

  return (
    <div style={{ padding: '18px 18px', borderTop: T.borderCyan }}>
      <div style={{ fontFamily: T.mono, fontSize: 8, letterSpacing: '.22em', color: T.cyanMuted, marginBottom: 12 }}>
        BODYWEIGHT · CUT PHASE
      </div>

      <div style={{ display: 'flex', alignItems: 'baseline', gap: 10, marginBottom: 3 }}>
        <div style={{ fontFamily: T.display, fontSize: 36, fontWeight: 700, color: T.text, lineHeight: 1 }}>{current.toFixed(1)}</div>
        <div style={{ fontFamily: T.mono, fontSize: 10, color: T.cyanMuted, letterSpacing: '.1em' }}>KG</div>
        {kgLost > 0 && (
          <div style={{ fontFamily: T.mono, fontSize: 10, color: T.green, padding: '2px 8px', border: `1px solid rgba(77,255,180,.28)`, background: 'rgba(77,255,180,.06)', letterSpacing: '.06em' }}>
            −{kgLost.toFixed(1)}kg
          </div>
        )}
      </div>
      <div style={{ fontFamily: T.mono, fontSize: 8, color: T.textDim, letterSpacing: '.1em', marginBottom: 14 }}>
        TARGET {targetKg}KG · {kgToGo > 0 ? `${kgToGo.toFixed(1)}KG TO GO` : 'TARGET REACHED'}
      </div>

      {/* Progress bar */}
      <div style={{ height: 6, background: 'rgba(32,216,236,.1)', borderRadius: 3, overflow: 'hidden' }}>
        <div style={{
          height: '100%', borderRadius: 3,
          background: `linear-gradient(90deg, ${T.green}, ${T.cyan})`,
          width: `${progress * 100}%`,
          transition: 'width 1.2s ease',
          boxShadow: '0 0 8px rgba(77,255,180,.4)',
        }} />
      </div>
      <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 5 }}>
        <span style={{ fontFamily: T.mono, fontSize: 7, color: T.cyanMuted }}>{startKg}KG START</span>
        <span style={{ fontFamily: T.mono, fontSize: 7, color: T.green }}>{targetKg}KG TARGET</span>
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
      style={{ position: 'fixed', inset: 0, background: 'rgba(1,6,8,.92)', zIndex: 200, display: 'flex', alignItems: 'flex-end', justifyContent: 'center' }}
      onClick={e => e.target === e.currentTarget && onClose()}
    >
      <div style={{ width: '100%', maxWidth: 480, background: T.bg, borderTop: T.borderCyan, padding: '24px 20px 44px' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
          <div style={{ fontFamily: T.mono, fontSize: 8, letterSpacing: '.24em', color: T.cyanMuted }}>LOG VERTICAL JUMP</div>
          <span onClick={onClose} style={{ color: T.cyanMuted, fontSize: 16, cursor: 'pointer', lineHeight: 1 }}>✕</span>
        </div>
        <div style={{ textAlign: 'center', marginBottom: 28 }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 20 }}>
            <button onClick={() => setInches(v => Math.max(10, +(v - 0.5).toFixed(1)))}
              style={{ width: 52, height: 52, background: T.surface, border: T.border, color: T.orange, fontSize: 22, cursor: 'pointer', fontFamily: T.display }}>−</button>
            <div style={{ fontFamily: T.display, fontSize: 58, fontWeight: 700, color: T.text, minWidth: 110, textAlign: 'center', lineHeight: 1, letterSpacing: '-.02em' }}>
              {inches}"
            </div>
            <button onClick={() => setInches(v => Math.min(50, +(v + 0.5).toFixed(1)))}
              style={{ width: 52, height: 52, background: T.surface, border: T.border, color: T.orange, fontSize: 22, cursor: 'pointer', fontFamily: T.display }}>+</button>
          </div>
          <div style={{ fontFamily: T.mono, fontSize: 9, color: T.cyanMuted, marginTop: 10, letterSpacing: '.1em' }}>
            {(inches * 2.54).toFixed(1)} cm · target 32"
          </div>
        </div>
        {error && <div style={{ fontFamily: T.mono, fontSize: 10, color: T.red, marginBottom: 12, textAlign: 'center' }}>{error}</div>}
        <div style={{ display: 'flex', gap: 10 }}>
          <button onClick={onClose} style={{ flex: 1, padding: '14px 0', textAlign: 'center', fontFamily: T.mono, fontSize: 9, letterSpacing: '.2em', color: T.cyanMuted, border: T.borderCyan, background: 'none', cursor: 'pointer' }}>
            CANCEL
          </button>
          <button onClick={handleSubmit} disabled={submitting}
            style={{ flex: 2, padding: '14px 0', textAlign: 'center', fontFamily: T.mono, fontSize: 9, letterSpacing: '.2em', color: T.bg, fontWeight: 700, background: T.cyan, border: 'none', cursor: 'pointer', boxShadow: `0 0 18px rgba(32,216,236,.35)` }}>
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
  const [recovery, setRecovery] = useState(null)
  const [brief, setBrief] = useState(null)
  const [briefLoading, setBriefLoading] = useState(false)

  async function loadData() {
    const [s, h, r] = await Promise.allSettled([getTrainingStatus(), getTrainingHistory(), getTrainingRecovery()])
    if (s.status === 'fulfilled') setStatusData(s.value)
    if (h.status === 'fulfilled') setHistory(h.value)
    if (r.status === 'fulfilled') setRecovery(r.value)
  }

  async function loadBrief() {
    if (briefLoading) return
    setBriefLoading(true)
    try {
      const b = await getTrainingBrief()
      setBrief(b.brief)
    } catch { setBrief('Unable to load brief.') }
    setBriefLoading(false)
  }

  useEffect(() => { loadData() }, [])

  // Dunk countdown from API or computed from target date
  const targetDateStr = statusData?.dunk_goal?.attempt_window_start ?? '2026-08-31'
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

  // Session history + progression hints
  const recentSessions = (history?.sessions ?? []).slice(0, 5)
  const nextHints = Object.entries(history?.next_week_suggestions ?? {}).map(([exercise, data]) => ({
    exercise,
    suggested_weight_kg: data.suggested_kg,
    basis: data.basis,
  }))

  // Conflicts
  const hasConflict = statusData?.has_hard_conflicts
  const conflictDetail = statusData?.conflicts?.[0]?.detail ?? ''

  return (
    <div style={{ height: '100%', display: 'flex', flexDirection: 'column', background: T.bg, color: T.text, fontFamily: T.body }}>

      {/* TOP BAR */}
      <div style={{
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        padding: '13px 18px 11px', borderBottom: T.borderCyan,
        position: 'sticky', top: 0, background: 'rgba(1,6,8,.97)', backdropFilter: 'blur(14px)', zIndex: 5, flexShrink: 0,
      }}>
        <div style={{ display: 'flex', alignItems: 'center' }}>
          <span onClick={onBack} style={{ color: T.orange, fontSize: 16, marginRight: 12, cursor: 'pointer' }}>←</span>
          <span style={{ fontFamily: T.display, fontSize: 13, fontWeight: 700, letterSpacing: '.28em', color: T.orange }}>TRAINING</span>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <span style={{ fontFamily: T.mono, fontSize: 8, letterSpacing: '.14em', color: T.orange, border: T.border, padding: '3px 10px', background: T.surface }}>
            {phase.replace(/_/g, ' ')}
          </span>
          <span
            onClick={brief ? () => setBrief(null) : loadBrief}
            style={{ fontFamily: T.mono, fontSize: 8, letterSpacing: '.14em', color: T.cyan, border: T.borderCyan, padding: '3px 10px', background: T.surfaceCyan, cursor: 'pointer' }}
          >
            {briefLoading ? '…' : brief ? 'CLOSE' : 'BRIEF'}
          </span>
        </div>
      </div>

      {/* BRIEF PANEL */}
      {brief && (
        <div style={{ padding: '14px 18px', background: T.surfaceCyan, borderBottom: T.borderCyan }}>
          <div style={{ fontFamily: T.mono, fontSize: 7, letterSpacing: '.2em', color: T.cyanMuted, marginBottom: 8 }}>PHOENIX BRIEF</div>
          <div style={{ fontFamily: T.body, fontSize: 13, color: T.text, lineHeight: 1.7 }}>{brief}</div>
        </div>
      )}

      {/* CONFLICT BANNER */}
      {hasConflict && (
        <div style={{ padding: '10px 18px', background: 'rgba(255,92,122,.05)', borderBottom: `1px solid rgba(255,92,122,.22)`, display: 'flex', alignItems: 'center', gap: 10 }}>
          <span style={{ color: T.red, fontSize: 13 }}>!</span>
          <span style={{ fontFamily: T.mono, fontSize: 8, letterSpacing: '.1em', color: T.red, lineHeight: 1.6 }}>{conflictDetail}</span>
        </div>
      )}

      <div style={{ flex: 1, overflowY: 'auto' }}>

        {/* DUNK COUNTDOWN HERO */}
        <div style={{
          padding: '22px 20px 20px',
          borderBottom: T.border,
          background: 'linear-gradient(180deg,rgba(255,143,46,.04),transparent)',
          position: 'relative', overflow: 'hidden',
        }}>
          <div style={{ position: 'absolute', top: 0, left: 0, right: 0, height: 2, background: 'linear-gradient(90deg,transparent,rgba(255,143,46,.5),transparent)' }} />
          <div style={{ fontFamily: T.mono, fontSize: 8, letterSpacing: '.22em', color: T.orangeMuted, marginBottom: 10 }}>
            DAYS TO DUNK ATTEMPT
          </div>
          <div style={{ display: 'flex', alignItems: 'flex-end', gap: 16 }}>
            <div style={{
              fontFamily: T.display, fontSize: 80, fontWeight: 700, lineHeight: .9,
              background: `linear-gradient(155deg, #fff 0%, ${T.orange} 60%, #ff5500 100%)`,
              WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent',
              filter: 'drop-shadow(0 0 24px rgba(255,143,46,.45))',
            }}>
              {daysToAttempt}
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 5, paddingBottom: 8 }}>
              <div style={{ fontFamily: T.display, fontSize: 14, fontWeight: 400, letterSpacing: '.24em', color: T.orangeMuted }}>DAYS</div>
              <div style={{ fontFamily: T.mono, fontSize: 8, letterSpacing: '.12em', color: T.orange, padding: '3px 10px', border: T.border, background: T.surface }}>
                {targetDateStr.slice(0, 7).replace('-', '/').toUpperCase()}
              </div>
            </div>
          </div>
          {statusData && (
            <div style={{ fontFamily: T.mono, fontSize: 8, letterSpacing: '.16em', color: T.textDim, marginTop: 12 }}>
              WEEK {mesoWeek} · {onTrack ? <span style={{ color: T.green }}>ON TRACK</span> : <span style={{ color: T.yellow }}>REVIEW NEEDED</span>}
            </div>
          )}
        </div>

        {/* WEEK + SESSION TYPE STRIP */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', borderBottom: T.borderCyan }}>
          <div style={{ padding: '14px 18px', borderRight: T.borderCyan }}>
            <div style={{ fontFamily: T.mono, fontSize: 7, letterSpacing: '.2em', color: T.cyanMuted, marginBottom: 6 }}>CURRENT WEEK</div>
            <div style={{ fontFamily: T.display, fontSize: 26, fontWeight: 700, letterSpacing: '.04em', color: T.cyanBr }}>WK {mesoWeek}</div>
            <div style={{ fontFamily: T.mono, fontSize: 8, letterSpacing: '.1em', color: T.textDim, marginTop: 3 }}>{phase.replace(/_/g, ' ')}</div>
          </div>
          <div style={{ padding: '14px 18px' }}>
            <div style={{ fontFamily: T.mono, fontSize: 7, letterSpacing: '.2em', color: T.cyanMuted, marginBottom: 6 }}>TODAY</div>
            <div style={{ fontFamily: T.display, fontSize: 26, fontWeight: 700, letterSpacing: '.02em', color: T.orange }}>{sessionType}</div>
            <div style={{ fontFamily: T.mono, fontSize: 8, letterSpacing: '.1em', color: T.textDim, marginTop: 3 }}>{sessionLabel}</div>
          </div>
        </div>

        {/* TODAY'S SESSION CARD */}
        <div
          style={{ margin: '14px 16px', border: T.border, background: T.surface, position: 'relative', overflow: 'hidden', cursor: 'pointer' }}
          onClick={() => { if (onNav) onNav('active-session'); else if (onStartSession) onStartSession() }}
        >
          <div style={{ position: 'absolute', left: 0, top: 0, bottom: 0, width: 3, background: T.orange, boxShadow: `0 0 12px rgba(255,143,46,.4)` }} />
          <div style={{ padding: '14px 14px 14px 18px' }}>
            <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 10 }}>
              <div>
                <div style={{ fontFamily: T.display, fontSize: 11, fontWeight: 700, letterSpacing: '.22em', color: T.orange, marginBottom: 4 }}>{sessionType}</div>
                <div style={{ fontFamily: T.display, fontSize: 22, fontWeight: 700, letterSpacing: '.04em', color: T.text, lineHeight: 1 }}>{sessionLabel || 'SESSION'}</div>
              </div>
              <span style={{ fontSize: 16, color: T.orange, opacity: .8, paddingTop: 4 }}>→</span>
            </div>
            {exercises.length > 0 && (
              <div style={{ marginBottom: 12 }}>
                {exercises.slice(0, 4).map((ex, i) => (
                  <div key={i} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '6px 0', borderBottom: i < Math.min(exercises.length, 4) - 1 ? `1px solid rgba(255,143,46,.08)` : 'none' }}>
                    <span style={{ fontFamily: T.body, fontSize: 13, color: 'rgba(199,236,244,.8)' }}>{ex.name}</span>
                    <span style={{ fontFamily: T.mono, fontSize: 9, letterSpacing: '.06em', color: T.orangeMuted }}>{ex.sets_reps || ex.label || ''}</span>
                  </div>
                ))}
              </div>
            )}
          </div>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, padding: '12px 0', background: 'rgba(255,143,46,.08)', borderTop: T.border, fontFamily: T.mono, fontSize: 9, letterSpacing: '.22em', color: T.orange }}>
            ▶ START SESSION
          </div>
        </div>

        {/* STATS ROW */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', borderTop: T.borderCyan, borderBottom: T.borderCyan }}>
          {[
            { label: 'SESSIONS', val: sessionCount > 0 ? String(sessionCount) : '—', color: T.cyanBr,  sub: 'this block' },
            { label: 'VERT JUMP', val: lastJumpIn != null ? `${lastJumpIn.toFixed(1)}"` : '—', color: T.green, sub: jumpGained },
            { label: 'WEEK',      val: String(mesoWeek),  color: T.orange, sub: phase.toLowerCase().replace(/_/g, ' ') },
          ].map(({ label, val, color, sub }, i) => (
            <div key={i} style={{ padding: '14px 12px', borderRight: i < 2 ? T.borderCyan : 'none', textAlign: 'center' }}>
              <div style={{ fontFamily: T.mono, fontSize: 7, letterSpacing: '.16em', color: T.cyanMuted, marginBottom: 5 }}>{label}</div>
              <div style={{ fontFamily: T.display, fontSize: 22, fontWeight: 700, color }}>{val}</div>
              <div style={{ fontFamily: T.mono, fontSize: 7, color: T.textDim, marginTop: 3, letterSpacing: '.06em' }}>{sub}</div>
            </div>
          ))}
        </div>

        {/* VERTICAL JUMP TREND */}
        <div style={{ padding: '16px 18px 14px', borderBottom: T.borderCyan }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
            <span style={{ fontFamily: T.mono, fontSize: 8, letterSpacing: '.22em', color: T.cyanMuted }}>VERTICAL JUMP TREND</span>
            {lastJumpIn != null && (
              <span style={{ fontFamily: T.display, fontSize: 18, fontWeight: 700, color: T.green }}>{lastJumpIn.toFixed(1)}"</span>
            )}
          </div>
          <JumpChart jumpData={jumpDataInches} targetLine={32.0} />
          <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 6 }}>
            <span style={{ fontFamily: T.mono, fontSize: 7, color: T.cyanMuted }}>FIRST LOG</span>
            <span style={{ fontFamily: T.mono, fontSize: 7, color: T.orange, letterSpacing: '.1em' }}>TARGET 32" · AUG</span>
            <span style={{ fontFamily: T.mono, fontSize: 7, color: T.cyanMuted }}>NOW</span>
          </div>
        </div>

        {/* RECOVERY */}
        <RecoveryRing recovery={recovery} />

        {/* BODYWEIGHT */}
        <WeightBars currentKg={currentBodyweightKg} targetKg={81} startKg={87} />

        {/* LOG JUMP */}
        <div style={{ padding: '16px 16px' }}>
          <button
            onClick={() => setModalOpen(true)}
            style={{ width: '100%', padding: '14px 0', textAlign: 'center', fontFamily: T.mono, fontSize: 9, letterSpacing: '.24em', color: T.bg, fontWeight: 700, background: T.cyan, border: 'none', cursor: 'pointer', boxShadow: `0 0 18px rgba(32,216,236,.35)` }}
          >
            + LOG VERTICAL JUMP
          </button>
        </div>

        {/* NEXT WEEK HINTS */}
        {nextHints.length > 0 && (
          <div style={{ padding: '16px 18px', borderTop: T.borderCyan, background: T.surfaceCyan }}>
            <div style={{ fontFamily: T.mono, fontSize: 8, letterSpacing: '.22em', color: T.cyanMuted, marginBottom: 12 }}>NEXT SESSION TARGETS</div>
            {nextHints.map((hint, i) => (
              <div key={i} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '8px 0', borderBottom: i < nextHints.length - 1 ? `1px solid rgba(32,216,236,.07)` : 'none' }}>
                <span style={{ fontFamily: T.body, fontSize: 14, color: T.text }}>{hint.exercise}</span>
                <span style={{ fontFamily: T.mono, fontSize: 11, color: T.green, letterSpacing: '.06em' }}>{hint.suggested_weight_kg}kg</span>
              </div>
            ))}
          </div>
        )}

        {/* SESSION HISTORY */}
        {recentSessions.length > 0 && (
          <div style={{ padding: '16px 18px 36px', borderTop: T.borderCyan }}>
            <div style={{ fontFamily: T.mono, fontSize: 8, letterSpacing: '.22em', color: T.cyanMuted, marginBottom: 12 }}>RECENT SESSIONS</div>
            {recentSessions.map((s, i) => {
              const exs = Array.isArray(s.exercises) ? s.exercises : []
              const topLift = exs.reduce((best, ex) => {
                const sets = Array.isArray(ex.sets) ? ex.sets : []
                const maxKg = sets.reduce((m, st) => Math.max(m, st.weight_kg ?? 0), 0)
                return maxKg > best ? maxKg : best
              }, 0)
              return (
                <div key={i} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '10px 0', borderBottom: i < recentSessions.length - 1 ? `1px solid rgba(32,216,236,.07)` : 'none' }}>
                  <div>
                    <div style={{ fontFamily: T.mono, fontSize: 7, letterSpacing: '.12em', color: T.cyanMuted }}>{s.date}</div>
                    <div style={{ fontFamily: T.body, fontSize: 14, color: T.text, marginTop: 3 }}>{s.session_type}</div>
                  </div>
                  {topLift > 0 && (
                    <span style={{ fontFamily: T.mono, fontSize: 9, color: T.cyan, letterSpacing: '.06em' }}>{topLift}kg top</span>
                  )}
                </div>
              )
            })}
          </div>
        )}
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
