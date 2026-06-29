import { useState, useEffect, useRef } from 'react'
import { getTrainingHistory, getTrainingStatus, logJump } from '../../api/client'

const FONTS_URL = 'https://fonts.googleapis.com/css2?family=Rajdhani:wght@500;600;700&family=Space+Grotesk:wght@300;400;500;600;700&family=Share+Tech+Mono&display=swap'
const KEYFRAMES = `
  @keyframes phScan { 0%{transform:translateX(-100%)} 100%{transform:translateX(100%)} }
  @keyframes phGlow { 0%,100%{box-shadow:0 0 14px rgba(255,143,46,.3)} 50%{box-shadow:0 0 28px rgba(255,143,46,.6)} }
`

const BG         = '#060c12'
const CARD       = '#070e15'
const ORANGE     = '#ff8f2e'
const ORANGE_MUT = 'rgba(255,143,46,.42)'
const ORANGE_BDR = '1px solid rgba(255,143,46,.18)'
const ORANGE_BDR_STR = '1px solid rgba(255,143,46,.28)'
const GREEN      = '#4dffb4'
const YELLOW     = '#ffd56b'
const TEXT       = 'rgba(199,236,244,.92)'
const TEXT_DIM   = 'rgba(132,212,226,.45)'
const MONO       = "'Share Tech Mono', monospace"
const DISPLAY    = "'Rajdhani', sans-serif"
const BODY       = "'Space Grotesk', sans-serif"

const TARGET_IN  = 32.0
const START_IN   = 24.0

function CornerCard({ children, style = {}, onClick }) {
  return (
    <div onClick={onClick} style={{ position: 'relative', background: 'rgba(6,12,18,.9)', border: ORANGE_BDR, overflow: 'hidden', cursor: onClick ? 'pointer' : 'default', ...style }}>
      <div style={{ position: 'absolute', top: 0, left: 0, right: 0, height: 1, background: `linear-gradient(90deg,transparent,${ORANGE},transparent)`, opacity: .4 }} />
      <div style={{ position: 'absolute', top: 0,    left: 0,  width: 9, height: 9, borderTop:    `1px solid rgba(255,143,46,.5)`, borderLeft:   `1px solid rgba(255,143,46,.5)` }} />
      <div style={{ position: 'absolute', top: 0,    right: 0, width: 9, height: 9, borderTop:    `1px solid rgba(255,143,46,.5)`, borderRight:  `1px solid rgba(255,143,46,.5)` }} />
      <div style={{ position: 'absolute', bottom: 0, left: 0,  width: 9, height: 9, borderBottom: `1px solid rgba(255,143,46,.5)`, borderLeft:   `1px solid rgba(255,143,46,.5)` }} />
      <div style={{ position: 'absolute', bottom: 0, right: 0, width: 9, height: 9, borderBottom: `1px solid rgba(255,143,46,.5)`, borderRight:  `1px solid rgba(255,143,46,.5)` }} />
      {children}
    </div>
  )
}

function Label({ children, cyan = false }) {
  return (
    <div style={{ fontFamily: MONO, fontSize: 7, letterSpacing: '.22em', color: cyan ? 'rgba(32,216,236,.42)' : ORANGE_MUT, marginBottom: 8 }}>
      {children}
    </div>
  )
}

// ── Jump Chart ─────────────────────────────────────────────────────────────────

function JumpChart({ jumpData, targetLine = TARGET_IN }) {
  const lineRef = useRef(null)
  const W = 390, H = 80
  const pad = { l: 0, r: 0, t: 10, b: 4 }
  const cw = W - pad.l - pad.r
  const ch = H - pad.t - pad.b

  if (!jumpData || jumpData.length < 2) return (
    <div style={{ height: 80, display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: MONO, fontSize: 9, color: 'rgba(32,216,236,.3)' }}>
      No jump data yet
    </div>
  )

  const mn = Math.min(...jumpData, targetLine) - 0.5
  const mx = Math.max(...jumpData, targetLine) + 0.5
  const px = i => (i / (jumpData.length - 1)) * cw + pad.l
  const py = v => pad.t + (1 - (v - mn) / (mx - mn)) * ch

  const tyVal  = py(targetLine)
  const lastX  = px(jumpData.length - 1)
  const lastY  = py(jumpData[jumpData.length - 1])
  const pts    = jumpData.map((v, i) => `${px(i).toFixed(1)},${py(v).toFixed(1)}`).join(' ')
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
            <stop offset="0%" stopColor="rgba(77,255,180,.38)" />
            <stop offset="100%" stopColor="rgba(77,255,180,0)" />
          </linearGradient>
          <filter id="jGlow">
            <feGaussianBlur stdDeviation="2" result="blur" />
            <feMerge><feMergeNode in="blur" /><feMergeNode in="SourceGraphic" /></feMerge>
          </filter>
        </defs>
        <line x1={0} y1={tyVal} x2={W} y2={tyVal} stroke="rgba(255,213,107,.3)" strokeWidth="1" strokeDasharray="4 4" />
        <text x={W - 2} y={tyVal - 3} textAnchor="end" fontFamily="Share Tech Mono,monospace" fontSize="7" fill="rgba(255,213,107,.55)">
          {targetLine}" TARGET
        </text>
        <polygon points={fillPts} fill="url(#jGrad)" />
        <polyline ref={lineRef} points={pts} fill="none" stroke={GREEN} strokeWidth="2.5"
          filter="url(#jGlow)" strokeDasharray={lineLen} strokeDashoffset={lineLen} />
        <circle cx={lastX.toFixed(1)} cy={lastY.toFixed(1)} r="4"
          fill={GREEN} stroke="#000" strokeWidth="1.5" filter="url(#jGlow)" />
      </svg>
    </div>
  )
}

// ── Log Jump Modal ─────────────────────────────────────────────────────────────

function JumpModal({ onClose, onSuccess }) {
  const [inches, setInches]       = useState(24)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError]         = useState('')

  async function handleSubmit() {
    setSubmitting(true); setError('')
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
      <div style={{ width: '100%', maxWidth: 480, background: BG, borderTop: ORANGE_BDR, padding: '24px 20px 44px' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
          <div style={{ fontFamily: MONO, fontSize: 8, letterSpacing: '.24em', color: ORANGE_MUT }}>LOG VERTICAL JUMP</div>
          <span onClick={onClose} style={{ color: ORANGE_MUT, fontSize: 16, cursor: 'pointer', lineHeight: 1 }}>✕</span>
        </div>
        <div style={{ textAlign: 'center', marginBottom: 28 }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 20 }}>
            <button
              onClick={() => setInches(v => Math.max(10, +(v - 0.5).toFixed(1)))}
              style={{ width: 52, height: 52, background: 'rgba(255,143,46,.04)', border: ORANGE_BDR, color: ORANGE, fontSize: 22, cursor: 'pointer', fontFamily: DISPLAY }}
            >−</button>
            <div style={{ fontFamily: DISPLAY, fontSize: 58, fontWeight: 700, color: TEXT, minWidth: 110, textAlign: 'center', lineHeight: 1, letterSpacing: '-.02em' }}>
              {inches}"
            </div>
            <button
              onClick={() => setInches(v => Math.min(50, +(v + 0.5).toFixed(1)))}
              style={{ width: 52, height: 52, background: 'rgba(255,143,46,.04)', border: ORANGE_BDR, color: ORANGE, fontSize: 22, cursor: 'pointer', fontFamily: DISPLAY }}
            >+</button>
          </div>
          <div style={{ fontFamily: MONO, fontSize: 9, color: ORANGE_MUT, marginTop: 10, letterSpacing: '.1em' }}>
            {(inches * 2.54).toFixed(1)} cm · target {TARGET_IN}"
          </div>
        </div>
        {error && <div style={{ fontFamily: MONO, fontSize: 10, color: '#ff5c7a', marginBottom: 12, textAlign: 'center' }}>{error}</div>}
        <div style={{ display: 'flex', gap: 10 }}>
          <button
            onClick={onClose}
            style={{ flex: 1, padding: '14px 0', textAlign: 'center', fontFamily: MONO, fontSize: 9, letterSpacing: '.2em', color: ORANGE_MUT, border: ORANGE_BDR, background: 'none', cursor: 'pointer' }}
          >CANCEL</button>
          <button
            onClick={handleSubmit} disabled={submitting}
            style={{ flex: 2, padding: '14px 0', textAlign: 'center', fontFamily: MONO, fontSize: 9, letterSpacing: '.2em', color: BG, fontWeight: 700, background: ORANGE, border: 'none', cursor: submitting ? 'wait' : 'pointer', boxShadow: `0 0 18px rgba(255,143,46,.4)` }}
          >{submitting ? 'LOGGING…' : 'LOG JUMP'}</button>
        </div>
      </div>
    </div>
  )
}

// ── Main ───────────────────────────────────────────────────────────────────────

export default function JumpLog({ onBack }) {
  const [history, setHistory]       = useState(null)
  const [statusData, setStatusData] = useState(null)
  const [modalOpen, setModalOpen]   = useState(false)

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

  async function loadData() {
    const [h, s] = await Promise.allSettled([getTrainingHistory(), getTrainingStatus()])
    if (h.status === 'fulfilled') setHistory(h.value)
    if (s.status === 'fulfilled') setStatusData(s.value)
  }

  useEffect(() => { loadData() }, [])

  // ── Derived values ────────────────────────────────────────────────────────
  const jumpProgression = history?.jump_progression ?? []
  const jumpDataInches  = jumpProgression
    .filter(p => p.approach != null)
    .map(p => parseFloat((p.approach / 2.54).toFixed(2)))

  const lastJumpIn  = jumpDataInches.length > 0 ? jumpDataInches[jumpDataInches.length - 1] : null
  const firstJumpIn = jumpDataInches.length > 0 ? jumpDataInches[0] : null
  const gained      = lastJumpIn != null && firstJumpIn != null ? +(lastJumpIn - firstJumpIn).toFixed(1) : null
  const toGo        = lastJumpIn != null ? +(TARGET_IN - lastJumpIn).toFixed(1) : null
  const progress    = lastJumpIn != null
    ? Math.min(1, Math.max(0, (lastJumpIn - START_IN) / (TARGET_IN - START_IN)))
    : 0

  // Full jump history list (date + inches)
  const jumpHistory = jumpProgression
    .filter(p => p.approach != null)
    .map(p => ({
      date: p.date,
      inches: parseFloat((p.approach / 2.54).toFixed(1)),
    }))
    .reverse()

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
          <span style={{ fontFamily: DISPLAY, fontSize: 16, fontWeight: 700, letterSpacing: '.3em', color: ORANGE, textShadow: `0 0 18px rgba(255,143,46,.4)` }}>JUMP LOG</span>
        </div>
        <span style={{ fontFamily: MONO, fontSize: 7, letterSpacing: '.14em', color: ORANGE_MUT }}>TARGET {TARGET_IN}"</span>
      </div>

      <div style={{ flex: 1, overflowY: 'auto' }}>

        {/* HERO */}
        <div style={{ padding: '18px 18px 14px', borderBottom: ORANGE_BDR, background: 'linear-gradient(155deg,rgba(255,143,46,.05),transparent 65%)', position: 'relative', overflow: 'hidden' }}>
          <div style={{ position: 'absolute', top: 0, left: 0, right: 0, height: 1, background: `linear-gradient(90deg,transparent,rgba(255,143,46,.5),transparent)` }} />
          <Label>CURRENT VERTICAL</Label>
          <div style={{ display: 'flex', alignItems: 'flex-end', gap: 16, marginBottom: 12 }}>
            <div style={{ fontFamily: DISPLAY, fontSize: 68, fontWeight: 700, lineHeight: .88, color: GREEN, filter: 'drop-shadow(0 0 16px rgba(77,255,180,.35))' }}>
              {lastJumpIn != null ? `${lastJumpIn}"` : '—'}
            </div>
            <div style={{ paddingBottom: 10, display: 'flex', flexDirection: 'column', gap: 5 }}>
              {gained != null && (
                <div style={{ fontFamily: MONO, fontSize: 8, letterSpacing: '.12em', color: GREEN, border: '1px solid rgba(77,255,180,.28)', padding: '3px 8px', background: 'rgba(77,255,180,.04)' }}>
                  +{gained}" GAINED
                </div>
              )}
              {toGo != null && toGo > 0 && (
                <div style={{ fontFamily: MONO, fontSize: 7, letterSpacing: '.1em', color: ORANGE_MUT, border: ORANGE_BDR, padding: '3px 8px' }}>
                  {toGo}" TO GO
                </div>
              )}
              {toGo != null && toGo <= 0 && (
                <div style={{ fontFamily: MONO, fontSize: 7, letterSpacing: '.1em', color: GREEN, border: '1px solid rgba(77,255,180,.28)', padding: '3px 8px' }}>
                  TARGET REACHED
                </div>
              )}
            </div>
          </div>
          <div style={{ fontFamily: MONO, fontSize: 7, letterSpacing: '.14em', color: TEXT_DIM, marginBottom: 6 }}>PROGRESS TO {TARGET_IN}"</div>
          <div style={{ height: 4, background: 'rgba(255,143,46,.1)', borderRadius: 2, overflow: 'hidden' }}>
            <div style={{ height: '100%', width: `${progress * 100}%`, background: `linear-gradient(90deg,${ORANGE},${GREEN})`, borderRadius: 2, transition: 'width 1.2s ease', boxShadow: '0 0 8px rgba(77,255,180,.3)' }} />
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 5 }}>
            <span style={{ fontFamily: MONO, fontSize: 7, color: TEXT_DIM }}>{START_IN}" START</span>
            <span style={{ fontFamily: MONO, fontSize: 7, color: GREEN }}>{TARGET_IN}" TARGET · AUG 2026</span>
          </div>
        </div>

        {/* CHART */}
        <div style={{ padding: '14px 18px 12px', borderBottom: ORANGE_BDR }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
            <Label>VERTICAL TREND</Label>
            {lastJumpIn != null && (
              <span style={{ fontFamily: DISPLAY, fontSize: 16, fontWeight: 700, color: GREEN }}>{lastJumpIn}"</span>
            )}
          </div>
          <JumpChart jumpData={jumpDataInches} targetLine={TARGET_IN} />
          <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 6 }}>
            <span style={{ fontFamily: MONO, fontSize: 7, color: TEXT_DIM }}>FIRST LOG</span>
            <span style={{ fontFamily: MONO, fontSize: 7, color: TEXT_DIM }}>NOW</span>
          </div>
        </div>

        {/* LOG JUMP BUTTON */}
        <div style={{ padding: '12px 14px', borderBottom: ORANGE_BDR }}>
          <CornerCard onClick={() => setModalOpen(true)} style={{ animation: 'phGlow 2.5s ease-in-out infinite' }}>
            <div style={{ padding: '14px 0', textAlign: 'center', fontFamily: MONO, fontSize: 9, letterSpacing: '.26em', color: ORANGE }}>
              + LOG VERTICAL JUMP
            </div>
          </CornerCard>
        </div>

        {/* JUMP HISTORY */}
        <div style={{ padding: '14px 18px 32px' }}>
          <Label>JUMP HISTORY</Label>
          {jumpHistory.length === 0 && (
            <div style={{ fontFamily: MONO, fontSize: 8, color: ORANGE_MUT, letterSpacing: '.12em' }}>NO JUMPS LOGGED YET</div>
          )}
          {jumpHistory.map((entry, i) => {
            const isRecent = i === 0
            const color = isRecent ? GREEN : entry.inches >= TARGET_IN - 2 ? GREEN : ORANGE
            return (
              <div key={i} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '9px 0', borderBottom: i < jumpHistory.length - 1 ? `1px solid rgba(255,143,46,.08)` : 'none' }}>
                <div>
                  <div style={{ fontFamily: MONO, fontSize: 7, letterSpacing: '.12em', color: TEXT_DIM }}>{entry.date}</div>
                  <div style={{ fontSize: 13, color: TEXT, marginTop: 2, fontWeight: 300 }}>Approach jump</div>
                </div>
                <div style={{ display: 'flex', alignItems: 'baseline', gap: 4 }}>
                  <div style={{ fontFamily: DISPLAY, fontSize: 22, fontWeight: 700, color }}>{entry.inches}"</div>
                  {isRecent && <div style={{ fontFamily: MONO, fontSize: 7, color: GREEN, letterSpacing: '.1em' }}>BEST</div>}
                </div>
              </div>
            )
          })}
        </div>

      </div>

      {/* MODAL */}
      {modalOpen && (
        <JumpModal
          onClose={() => setModalOpen(false)}
          onSuccess={() => { setModalOpen(false); loadData() }}
        />
      )}

    </div>
  )
}
