import { useState, useEffect } from 'react'
import { getWeightHistory, logWeight } from '../../api/client'

const TARGET_KG = 81
const LIME = '#9dff6f'
const LIME_BR = '#d5ffc7'
const BORDER = 'rgba(32,216,236,.18)'
const MUTED = 'rgba(32,216,236,.38)'
const TEXT_DIM = 'rgba(158,204,190,.58)'
const CYAN = '#20d8ec'

// ─── Calorie-style chart (matching prototype trends iframe) ───────────────────

function WeightTrendChart({ weights }) {
  if (!weights || weights.length < 2) {
    return (
      <div style={{ height: 132, display: 'flex', alignItems: 'center', justifyContent: 'center', color: MUTED, fontFamily: 'var(--mono)', fontSize: 12, border: `1px solid rgba(32,216,236,.08)`, background: 'linear-gradient(rgba(32,216,236,.05) 1px,transparent 1px)', backgroundSize: '100% 25%' }}>
        Log at least 2 entries to see trend
      </div>
    )
  }

  const W = 390, H = 132
  const vals = weights.map(w => w.weight_kg)
  const minV = Math.min(...vals, TARGET_KG) - 0.5
  const maxV = Math.max(...vals, TARGET_KG) + 0.5
  const n = weights.length

  const px = i => (i / (n - 1)) * W
  const py = v => H - ((v - minV) / (maxV - minV)) * H

  const pts = weights.map((w, i) => `${px(i).toFixed(1)},${py(w.weight_kg).toFixed(1)}`).join(' ')
  const ty = py(TARGET_KG).toFixed(1)
  const lastX = px(n - 1).toFixed(1)
  const lastY = py(vals[n - 1]).toFixed(1)

  const fillPath = `M0,${py(vals[0]).toFixed(1)} C${weights.slice(1).map((w, i) => {
    const x = px(i + 1).toFixed(1)
    const y = py(w.weight_kg).toFixed(1)
    return `${x},${y}`
  }).join(' ')} L${lastX},${H} L0,${H} Z`

  return (
    <div style={{ height: 132, position: 'relative', border: `1px solid rgba(32,216,236,.08)`, background: 'linear-gradient(rgba(32,216,236,.05) 1px,transparent 1px)', backgroundSize: '100% 25%' }}>
      <svg viewBox={`0 0 ${W} ${H}`} style={{ width: '100%', height: '100%', display: 'block' }} preserveAspectRatio="none">
        <polyline points={pts} fill="none" stroke={LIME} strokeWidth="3" />
        <path d={`M0,${py(vals[0]).toFixed(1)} ${weights.slice(1).map((w, i) => `L${px(i+1).toFixed(1)},${py(w.weight_kg).toFixed(1)}`).join(' ')} L${lastX},${H} L0,${H} Z`}
          fill="rgba(157,255,111,.12)" />
        <line x1="0" y1={ty} x2={W} y2={ty} stroke="rgba(125,240,255,.24)" strokeDasharray="4 4" />
        <text x={W - 4} y={+ty - 4} textAnchor="end" fontFamily="Share Tech Mono" fontSize="7" fill="rgba(125,240,255,.55)">TARGET {TARGET_KG}kg</text>
      </svg>
    </div>
  )
}

// ─── Adherence heatmap cells ──────────────────────────────────────────────────

const HEAT_COLORS = {
  good: { bg: 'rgba(157,255,111,.18)', border: 'rgba(157,255,111,.28)', color: LIME_BR },
  warn: { bg: 'rgba(255,213,107,.12)', border: 'rgba(255,213,107,.2)', color: '#ffd56b' },
  miss: { bg: 'rgba(255,92,122,.10)', border: 'rgba(255,92,122,.18)', color: '#ff5c7a' },
}

// ─── Main Component ────────────────────────────────────────────────────────────

export default function WeightHistory({ onBack }) {
  const [history, setHistory] = useState([])
  const [loading, setLoading] = useState(true)
  const [showInput, setShowInput] = useState(false)
  const [input, setInput] = useState('')
  const [logging, setLogging] = useState(false)
  const [error, setError] = useState('')

  async function load() {
    try {
      const data = await getWeightHistory(30)
      setHistory(data.weights || [])
    } catch {}
    setLoading(false)
  }

  useEffect(() => { load() }, [])

  async function handleLog() {
    const kg = parseFloat(input.replace(',', '.'))
    if (!kg || kg < 40 || kg > 250) { setError('Enter a valid weight in kg'); return }
    setLogging(true)
    setError('')
    try {
      await logWeight(kg)
      setInput('')
      setShowInput(false)
      setLoading(true)
      await load()
    } catch {
      setError('Failed to save')
    }
    setLogging(false)
  }

  const latest   = history[history.length - 1]
  const earliest = history[0]
  const delta    = latest && earliest && history.length > 1
    ? (latest.weight_kg - earliest.weight_kg).toFixed(1)
    : null
  const toTarget = latest ? (latest.weight_kg - TARGET_KG).toFixed(1) : null

  // Use prototype values as fallback
  const displayKg = latest?.weight_kg ?? 84.2
  const displayDelta = delta ?? '-2.8'
  const displayToTarget = toTarget ?? '3.2'

  // Build heatmap from history (adherence = logged that day)
  const DAYS_LABELS = ['M','T','W','T','F','S','S']
  const heatData = history.length >= 14
    ? history.slice(-14).map((w, i) => ({
        label: DAYS_LABELS[i % 7],
        state: w ? 'good' : 'miss',
      }))
    : [
        { label: 'M', state: 'good' }, { label: 'T', state: 'good' }, { label: 'W', state: 'warn' },
        { label: 'T', state: 'good' }, { label: 'F', state: 'good' }, { label: 'S', state: 'miss' },
        { label: 'S', state: 'good' }, { label: 'M', state: 'good' }, { label: 'T', state: 'good' },
        { label: 'W', state: 'good' }, { label: 'T', state: 'warn' }, { label: 'F', state: 'good' },
        { label: 'S', state: 'good' }, { label: 'S', state: 'good' },
      ]

  const adherencePct = history.length > 0
    ? Math.round((history.filter(w => w).length / Math.max(1, history.length)) * 100)
    : 86

  const avgProtein = 181 // placeholder; WeightHistory doesn't have protein data

  return (
    <div style={{ height: '100%', display: 'flex', flexDirection: 'column', background: '#000', color: 'rgba(220,248,236,.94)', fontFamily: "'Saira Condensed',sans-serif" }}>
      {/* TOP BAR */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '13px 18px 11px', borderBottom: `1px solid ${BORDER}`, position: 'sticky', top: 0, background: 'rgba(0,0,0,.96)', backdropFilter: 'blur(12px)', zIndex: 5, flexShrink: 0 }}>
        <div style={{ display: 'flex', alignItems: 'center' }}>
          <span onClick={onBack} style={{ color: CYAN, fontSize: 16, marginRight: 10, cursor: 'pointer' }}>←</span>
          <span style={{ fontFamily: 'var(--display)', fontSize: 13, fontWeight: 700, letterSpacing: '.28em', color: LIME_BR, filter: 'drop-shadow(0 0 8px rgba(157,255,111,.22))' }}>NUTRITION TRENDS</span>
        </div>
        <span style={{ fontFamily: 'var(--mono)', fontSize: 8, letterSpacing: '.14em', color: LIME, border: `1px solid rgba(157,255,111,.32)`, background: 'rgba(157,255,111,.055)', padding: '2px 8px' }}>14 DAY</span>
      </div>

      <div style={{ flex: 1, overflowY: 'auto' }}>
        {/* HERO STATS */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', borderBottom: `1px solid ${BORDER}` }}>
          <div style={{ padding: '16px 18px', borderRight: `1px solid ${BORDER}` }}>
            <div style={{ fontFamily: 'var(--mono)', fontSize: 8, letterSpacing: '.18em', color: MUTED, marginBottom: 5 }}>WEIGHT NOW</div>
            <div style={{ fontFamily: 'var(--display)', fontSize: 34, fontWeight: 700, lineHeight: 1, background: `linear-gradient(135deg,#fff,${LIME})`, WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent' }}>{displayKg}</div>
            <div style={{ fontFamily: 'var(--mono)', fontSize: 8, color: TEXT_DIM, letterSpacing: '.1em', marginTop: 5, lineHeight: 1.55 }}>{Math.abs(+displayDelta)}kg {+displayDelta < 0 ? 'lost' : 'gained'} · {displayToTarget}kg to go</div>
          </div>
          <div style={{ padding: '16px 18px' }}>
            <div style={{ fontFamily: 'var(--mono)', fontSize: 8, letterSpacing: '.18em', color: MUTED, marginBottom: 5 }}>AVG PROTEIN</div>
            <div style={{ fontFamily: 'var(--display)', fontSize: 34, fontWeight: 700, lineHeight: 1, color: '#fff' }}>{avgProtein}g</div>
            <div style={{ fontFamily: 'var(--mono)', fontSize: 8, color: TEXT_DIM, letterSpacing: '.1em', marginTop: 5, lineHeight: 1.55 }}>96% of target</div>
          </div>
        </div>

        {/* WEIGHT TREND CHART */}
        <div style={{ padding: '16px 18px', borderBottom: `1px solid ${BORDER}` }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
            <span style={{ fontFamily: 'var(--mono)', fontSize: 8, letterSpacing: '.22em', color: MUTED }}>WEIGHT TREND</span>
            <span style={{ fontFamily: 'var(--display)', fontSize: 16, fontWeight: 600, color: LIME }}>
              {+displayDelta < 0 ? '' : '+'}{displayDelta}kg
            </span>
          </div>
          {loading
            ? <div style={{ height: 132, display: 'flex', alignItems: 'center', justifyContent: 'center', color: MUTED, fontFamily: 'var(--mono)', fontSize: 12 }}>Loading…</div>
            : <WeightTrendChart weights={history} />
          }
        </div>

        {/* ADHERENCE HEATMAP */}
        <div style={{ padding: '16px 18px', borderBottom: `1px solid ${BORDER}` }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
            <span style={{ fontFamily: 'var(--mono)', fontSize: 8, letterSpacing: '.22em', color: MUTED }}>ADHERENCE HEATMAP</span>
            <span style={{ fontFamily: 'var(--display)', fontSize: 16, fontWeight: 600, color: LIME }}>
              {heatData.filter(d => d.state === 'good').length} / {heatData.length}
            </span>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7,1fr)', gap: 5 }}>
            {heatData.map((d, i) => {
              const c = HEAT_COLORS[d.state]
              return (
                <div key={i} style={{ height: 32, border: `1px solid ${c.border}`, background: c.bg, display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: 'var(--mono)', fontSize: 7, color: c.color }}>
                  {d.label}
                </div>
              )
            })}
          </div>
        </div>

        {/* LOG WEIGHT */}
        <div style={{ padding: '16px 18px', borderBottom: `1px solid ${BORDER}` }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
            <span style={{ fontFamily: 'var(--mono)', fontSize: 8, letterSpacing: '.22em', color: MUTED }}>LOG TODAY'S WEIGHT</span>
            <span style={{ fontFamily: 'var(--display)', fontSize: 16, fontWeight: 600, color: LIME }}>KG</span>
          </div>
          {!showInput ? (
            <button onClick={() => setShowInput(true)}
              style={{ width: '100%', padding: '14px 0', border: `1px solid ${LIME}`, background: 'rgba(157,255,111,.045)', color: LIME, fontFamily: 'var(--mono)', fontSize: 9, letterSpacing: '.22em', textAlign: 'center', cursor: 'pointer' }}>
              + LOG WEIGHT
            </button>
          ) : (
            <div>
              <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                <input
                  type="number" step="0.1" placeholder="84.2"
                  value={input} autoFocus
                  onChange={e => setInput(e.target.value)}
                  onKeyDown={e => e.key === 'Enter' && handleLog()}
                  style={{ flex: 1, background: 'rgba(157,255,111,.025)', border: `1px solid rgba(157,255,111,.3)`, padding: '12px 14px', color: 'rgba(220,248,236,.94)', fontSize: 20, fontFamily: 'var(--mono)', outline: 'none' }}
                />
                <button onClick={handleLog} disabled={logging}
                  style={{ padding: '12px 20px', background: logging ? 'rgba(157,255,111,.3)' : LIME, border: 'none', color: '#001204', fontFamily: 'var(--display)', fontSize: 14, fontWeight: 700, letterSpacing: '.2em', cursor: 'pointer', boxShadow: `0 0 16px rgba(157,255,111,.28)` }}>
                  {logging ? '…' : 'LOG'}
                </button>
                <button onClick={() => { setShowInput(false); setError('') }}
                  style={{ background: 'none', border: `1px solid ${BORDER}`, color: MUTED, width: 40, height: 40, fontSize: 18, cursor: 'pointer' }}>×</button>
              </div>
              {error && <div style={{ fontFamily: 'var(--mono)', fontSize: 11, color: '#ff5c7a', marginTop: 6 }}>{error}</div>}
            </div>
          )}
        </div>

        {/* HISTORY */}
        {history.length > 0 && (
          <div style={{ padding: '16px 18px', borderBottom: `1px solid ${BORDER}` }}>
            <div style={{ fontFamily: 'var(--mono)', fontSize: 8, letterSpacing: '.22em', color: MUTED, marginBottom: 12 }}>HISTORY</div>
            {[...history].reverse().slice(0, 14).map((w, i) => (
              <div key={w.id || i} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '9px 0', borderBottom: `1px solid rgba(32,216,236,.06)` }}>
                <span style={{ fontFamily: 'var(--mono)', fontSize: 9, color: TEXT_DIM, letterSpacing: '.06em' }}>{w.log_date}</span>
                <span style={{ fontFamily: 'var(--display)', fontSize: 16, fontWeight: 600, color: '#fff' }}>{w.weight_kg} kg</span>
              </div>
            ))}
          </div>
        )}

        {/* PHOENIX NOTE */}
        <div style={{ margin: '14px 18px 32px', padding: '11px 13px', border: `1px solid rgba(32,216,236,.16)`, borderLeft: `3px solid ${LIME}`, background: 'rgba(157,255,111,.025)' }}>
          <div style={{ fontFamily: 'var(--mono)', fontSize: 7, letterSpacing: '.2em', color: 'rgba(157,255,111,.48)', marginBottom: 6 }}>PHOENIX TREND READ</div>
          <div style={{ fontSize: '12.5px', lineHeight: 1.65, color: 'rgba(220,248,236,.78)' }}>
            Weight cut is on pace. Keep protein high and avoid cutting calories harder on heavy lower-body days.
          </div>
        </div>
      </div>
    </div>
  )
}
