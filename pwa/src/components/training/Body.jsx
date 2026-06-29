import { useState, useEffect, useRef } from 'react'
import { getTrainingStatus } from '../../api/client'

const FONTS_URL = 'https://fonts.googleapis.com/css2?family=Rajdhani:wght@500;600;700&family=Space+Grotesk:wght@300;400;500;600;700&family=Share+Tech+Mono&display=swap'
const KEYFRAMES = `@keyframes phScan { 0%{transform:translateX(-100%)} 100%{transform:translateX(100%)} }`

const BG         = '#060c12'
const CARD       = '#070e15'
const ORANGE     = '#ff8f2e'
const ORANGE_MUT = 'rgba(255,143,46,.42)'
const ORANGE_BDR = '1px solid rgba(255,143,46,.18)'
const GREEN      = '#4dffb4'
const TEXT       = 'rgba(199,236,244,.92)'
const TEXT_DIM   = 'rgba(132,212,226,.45)'
const MONO       = "'Share Tech Mono', monospace"
const DISPLAY    = "'Rajdhani', sans-serif"
const BODY       = "'Space Grotesk', sans-serif"

const START_KG  = 87
const TARGET_KG = 81

function Label({ children }) {
  return (
    <div style={{ fontFamily: MONO, fontSize: 7, letterSpacing: '.22em', color: ORANGE_MUT, marginBottom: 8 }}>
      {children}
    </div>
  )
}

function Stat({ label, value, color = TEXT }) {
  return (
    <div style={{ background: 'rgba(255,143,46,.03)', border: ORANGE_BDR, padding: '10px 12px' }}>
      <div style={{ fontFamily: MONO, fontSize: 7, letterSpacing: '.18em', color: ORANGE_MUT, marginBottom: 4 }}>{label}</div>
      <div style={{ fontFamily: DISPLAY, fontSize: 20, fontWeight: 700, color }}>{value}</div>
    </div>
  )
}

function WeightChart({ entries }) {
  const lineRef = useRef(null)
  const W = 390, H = 70
  const pad = { l: 0, r: 0, t: 8, b: 6 }
  const cw = W - pad.l - pad.r
  const ch = H - pad.t - pad.b

  if (!entries || entries.length < 2) return (
    <div style={{ height: 70, display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: MONO, fontSize: 9, color: ORANGE_MUT }}>
      No weight data yet
    </div>
  )

  const weights = entries.map(e => e.kg)
  const mn = Math.min(...weights, TARGET_KG) - 0.5
  const mx = Math.max(...weights) + 0.5
  const px = i => (i / (entries.length - 1)) * cw + pad.l
  const py = v => pad.t + (1 - (v - mn) / (mx - mn)) * ch

  const tyVal  = py(TARGET_KG)
  const lastX  = px(entries.length - 1)
  const lastY  = py(entries[entries.length - 1].kg)
  const pts    = entries.map((e, i) => `${px(i).toFixed(1)},${py(e.kg).toFixed(1)}`).join(' ')
  const fillPts = pts + ` ${lastX.toFixed(1)},${H} 0,${H}`

  const lineLen = entries.reduce((a, e, i) =>
    i === 0 ? 0 : a + Math.hypot(px(i) - px(i - 1), py(e.kg) - py(entries[i - 1].kg)), 0)

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
    <div style={{ position: 'relative', height: 70 }}>
      <svg viewBox={`0 0 ${W} ${H}`} style={{ width: '100%', display: 'block' }} preserveAspectRatio="none">
        <defs>
          <linearGradient id="wGrad" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="rgba(255,143,46,.28)" />
            <stop offset="100%" stopColor="rgba(255,143,46,0)" />
          </linearGradient>
          <filter id="wGlow">
            <feGaussianBlur stdDeviation="2" result="blur" />
            <feMerge><feMergeNode in="blur" /><feMergeNode in="SourceGraphic" /></feMerge>
          </filter>
        </defs>
        <line x1={0} y1={tyVal} x2={W} y2={tyVal} stroke="rgba(77,255,180,.3)" strokeWidth="1" strokeDasharray="4 4" />
        <text x={W - 2} y={tyVal - 3} textAnchor="end" fontFamily="Share Tech Mono,monospace" fontSize="7" fill="rgba(77,255,180,.55)">
          {TARGET_KG}kg
        </text>
        <polygon points={fillPts} fill="url(#wGrad)" />
        <polyline
          ref={lineRef}
          points={pts}
          fill="none"
          stroke={ORANGE}
          strokeWidth="2.5"
          strokeLinecap="round"
          strokeLinejoin="round"
          filter="url(#wGlow)"
          strokeDasharray={lineLen}
          strokeDashoffset={lineLen}
        />
        <circle cx={lastX.toFixed(1)} cy={lastY.toFixed(1)} r="4"
          fill={ORANGE} stroke="#000" strokeWidth="1.5" filter="url(#wGlow)" />
      </svg>
    </div>
  )
}

export default function Body({ onBack }) {
  const [statusData, setStatusData] = useState(null)
  const [loading, setLoading]       = useState(true)

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
    getTrainingStatus()
      .then(s => { setStatusData(s); setLoading(false) })
      .catch(() => setLoading(false))
  }, [])

  // ── Derived values ──────────────────────────────────────────────────────────
  const cut            = statusData?.cut_status ?? {}
  const currentKg      = cut.current_bodyweight_kg ?? null
  const weeklyDelta    = cut.weekly_delta_kg ?? null
  const weightHistory  = Array.isArray(cut.weight_history) ? cut.weight_history : []

  const kgLost   = currentKg != null ? +(Math.max(0, START_KG - currentKg)).toFixed(1) : null
  const kgToGo   = currentKg != null ? +(Math.max(0, currentKg - TARGET_KG)).toFixed(1) : null
  const progress  = currentKg != null
    ? Math.min(1, Math.max(0, (START_KG - currentKg) / (START_KG - TARGET_KG)))
    : 0

  const avgRate   = cut.avg_weekly_loss_kg ?? (weeklyDelta != null ? Math.abs(weeklyDelta) : null)
  const etaWeeks  = avgRate && kgToGo != null && avgRate > 0
    ? Math.ceil(kgToGo / avgRate)
    : null

  // Build chart entries from history or fake single point
  const chartEntries = weightHistory.length >= 2
    ? weightHistory.map(e => ({ date: e.date, kg: e.weight_kg }))
    : currentKg != null
      ? [{ date: 'start', kg: START_KG }, { date: 'now', kg: currentKg }]
      : []

  // Weekly weigh-in list
  const weeklies = [...weightHistory].reverse().slice(0, 8)

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
          <span style={{ fontFamily: DISPLAY, fontSize: 16, fontWeight: 700, letterSpacing: '.3em', color: ORANGE, textShadow: `0 0 18px rgba(255,143,46,.4)` }}>BODY</span>
        </div>
        <span style={{ fontFamily: MONO, fontSize: 7, letterSpacing: '.14em', color: ORANGE_MUT }}>CUT PHASE</span>
      </div>

      {loading && (
        <div style={{ padding: '48px 18px', textAlign: 'center', fontFamily: MONO, fontSize: 9, letterSpacing: '.18em', color: ORANGE_MUT }}>
          LOADING BODY DATA…
        </div>
      )}

      {!loading && (
        <div style={{ flex: 1, overflowY: 'auto' }}>

          {/* HERO */}
          <div style={{ padding: '18px 18px 16px', borderBottom: ORANGE_BDR, background: 'linear-gradient(155deg,rgba(255,143,46,.05),transparent 65%)', position: 'relative', overflow: 'hidden' }}>
            <div style={{ position: 'absolute', top: 0, left: 0, right: 0, height: 1, background: `linear-gradient(90deg,transparent,rgba(255,143,46,.5),transparent)` }} />
            <Label>CURRENT BODYWEIGHT</Label>
            <div style={{ display: 'flex', alignItems: 'flex-end', gap: 14, marginBottom: 12 }}>
              <div style={{ fontFamily: DISPLAY, fontSize: 72, fontWeight: 700, lineHeight: .88, color: TEXT, filter: 'drop-shadow(0 0 14px rgba(255,143,46,.25))' }}>
                {currentKg != null ? currentKg.toFixed(1) : '—'}
              </div>
              <div style={{ paddingBottom: 10, display: 'flex', flexDirection: 'column', gap: 5 }}>
                <div style={{ fontFamily: MONO, fontSize: 11, letterSpacing: '.1em', color: TEXT_DIM }}>KG</div>
                {weeklyDelta != null && (
                  <div style={{ fontFamily: MONO, fontSize: 8, letterSpacing: '.1em', color: weeklyDelta < 0 ? GREEN : '#ff5c7a', border: `1px solid ${weeklyDelta < 0 ? 'rgba(77,255,180,.28)' : 'rgba(255,92,122,.28)'}`, padding: '3px 8px', background: weeklyDelta < 0 ? 'rgba(77,255,180,.04)' : 'rgba(255,92,122,.04)' }}>
                    {weeklyDelta > 0 ? '+' : ''}{weeklyDelta.toFixed(1)} THIS WEEK
                  </div>
                )}
              </div>
            </div>
            <div style={{ fontFamily: MONO, fontSize: 7, letterSpacing: '.14em', color: TEXT_DIM, marginBottom: 6 }}>
              CUT PROGRESS · {START_KG}KG → {TARGET_KG}KG
            </div>
            <div style={{ height: 5, background: 'rgba(255,143,46,.1)', borderRadius: 3, overflow: 'hidden' }}>
              <div style={{ height: '100%', width: `${progress * 100}%`, background: `linear-gradient(90deg,${ORANGE},${GREEN})`, borderRadius: 3, transition: 'width 1.2s ease', boxShadow: '0 0 8px rgba(77,255,180,.3)' }} />
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 5 }}>
              <span style={{ fontFamily: MONO, fontSize: 7, color: TEXT_DIM }}>{START_KG}KG START</span>
              <span style={{ fontFamily: MONO, fontSize: 7, color: GREEN }}>{TARGET_KG}KG TARGET</span>
            </div>
          </div>

          {/* CUT STATUS GRID */}
          <div style={{ padding: '14px 18px', borderBottom: ORANGE_BDR }}>
            <Label>CUT STATUS</Label>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
              <Stat label="LOST"  value={kgLost  != null ? `−${kgLost}kg`  : '—'} color={GREEN} />
              <Stat label="TO GO" value={kgToGo  != null ? `${kgToGo}kg`   : '—'} color={ORANGE} />
              <Stat label="RATE"  value={avgRate  != null ? `−${avgRate.toFixed(1)}/wk` : '—'} />
              <Stat label="ETA"   value={etaWeeks != null ? `~${etaWeeks} WKS` : '—'} />
            </div>
          </div>

          {/* WEIGHT TREND CHART */}
          <div style={{ padding: '14px 18px 12px', borderBottom: ORANGE_BDR }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
              <Label>WEIGHT TREND</Label>
              {currentKg != null && (
                <span style={{ fontFamily: DISPLAY, fontSize: 14, fontWeight: 700, color: ORANGE }}>{currentKg.toFixed(1)}kg</span>
              )}
            </div>
            <WeightChart entries={chartEntries} />
            <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 5 }}>
              <span style={{ fontFamily: MONO, fontSize: 7, color: TEXT_DIM }}>START</span>
              <span style={{ fontFamily: MONO, fontSize: 7, color: TEXT_DIM }}>NOW</span>
            </div>
          </div>

          {/* WEEKLY WEIGH-INS */}
          <div style={{ padding: '14px 18px 32px' }}>
            <Label>WEEKLY WEIGH-INS</Label>
            {weeklies.length === 0 && (
              <div style={{ fontFamily: MONO, fontSize: 8, color: ORANGE_MUT, letterSpacing: '.12em' }}>NO WEIGH-INS LOGGED YET</div>
            )}
            {weeklies.map((entry, i) => {
              const delta = i < weeklies.length - 1
                ? +(entry.weight_kg - weeklies[i + 1].weight_kg).toFixed(1)
                : null
              const opacity = Math.max(0.45, 1 - i * 0.12)
              return (
                <div key={i} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '9px 0', borderBottom: i < weeklies.length - 1 ? '1px solid rgba(255,143,46,.08)' : 'none', opacity }}>
                  <div>
                    <div style={{ fontFamily: MONO, fontSize: 7, letterSpacing: '.12em', color: TEXT_DIM }}>{entry.date}</div>
                    <div style={{ fontSize: 13, color: TEXT, marginTop: 2, fontWeight: 300 }}>
                      Week {weeklies.length - i}
                    </div>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'baseline', gap: 6 }}>
                    {delta != null && (
                      <span style={{ fontFamily: MONO, fontSize: 8, color: delta < 0 ? GREEN : '#ff5c7a' }}>
                        {delta > 0 ? '+' : ''}{delta}kg
                      </span>
                    )}
                    <span style={{ fontFamily: DISPLAY, fontSize: 20, fontWeight: 700, color: TEXT }}>
                      {entry.weight_kg.toFixed(1)}
                    </span>
                  </div>
                </div>
              )
            })}
          </div>

        </div>
      )}
    </div>
  )
}
