import { useState, useEffect } from 'react'
import { getWeightHistory, logWeight, getMealHistory } from '../../api/client'

const LIME = '#9dff6f'
const LIME_BR = '#d5ffc7'
const BORDER = 'rgba(32,216,236,.18)'
const MUTED = 'rgba(32,216,236,.38)'
const TEXT_DIM = 'rgba(158,204,190,.58)'
const CYAN = '#20d8ec'

function average(values) {
  if (!values.length) return null
  return values.reduce((a, b) => a + b, 0) / values.length
}

function WeightTrendChart({ weights, baselineWeightKg }) {
  if (!weights || weights.length < 2) {
    return <div style={{ height: 132, display: 'flex', alignItems: 'center', justifyContent: 'center', color: MUTED, fontFamily: 'var(--mono)', fontSize: 12, border: `1px solid rgba(32,216,236,.08)`, background: 'linear-gradient(rgba(32,216,236,.05) 1px,transparent 1px)', backgroundSize: '100% 25%' }}>Log at least 2 entries to see trend</div>
  }

  const W = 390, H = 132
  const vals = weights.map(w => Number(w.weight_kg))
  const baseline = baselineWeightKg || vals[0]
  const minV = Math.min(...vals, baseline) - 0.5
  const maxV = Math.max(...vals, baseline) + 0.5
  const n = weights.length
  const px = i => (i / (n - 1)) * W
  const py = v => H - ((v - minV) / Math.max(0.1, maxV - minV)) * H
  const pts = weights.map((w, i) => `${px(i).toFixed(1)},${py(w.weight_kg).toFixed(1)}`).join(' ')
  const baselineY = py(baseline).toFixed(1)

  return (
    <div style={{ height: 132, position: 'relative', border: `1px solid rgba(32,216,236,.08)`, background: 'linear-gradient(rgba(32,216,236,.05) 1px,transparent 1px)', backgroundSize: '100% 25%' }}>
      <svg viewBox={`0 0 ${W} ${H}`} style={{ width: '100%', height: '100%', display: 'block' }} preserveAspectRatio="none">
        <polyline points={pts} fill="none" stroke={LIME} strokeWidth="3" />
        <path d={`M0,${py(vals[0]).toFixed(1)} ${weights.slice(1).map((w, i) => `L${px(i+1).toFixed(1)},${py(w.weight_kg).toFixed(1)}`).join(' ')} L${px(n - 1).toFixed(1)},${H} L0,${H} Z`} fill="rgba(157,255,111,.12)" />
        <line x1="0" y1={baselineY} x2={W} y2={baselineY} stroke="rgba(125,240,255,.24)" strokeDasharray="4 4" />
        <text x={W - 4} y={+baselineY - 4} textAnchor="end" fontFamily="Share Tech Mono" fontSize="7" fill="rgba(125,240,255,.55)">BASE {Number(baseline).toFixed(1)}kg</text>
      </svg>
    </div>
  )
}

const HEAT_COLORS = {
  good: { bg: 'rgba(157,255,111,.18)', border: 'rgba(157,255,111,.28)', color: LIME_BR },
  warn: { bg: 'rgba(255,213,107,.12)', border: 'rgba(255,213,107,.2)', color: '#ffd56b' },
  miss: { bg: 'rgba(255,92,122,.10)', border: 'rgba(255,92,122,.18)', color: '#ff5c7a' },
  empty: { bg: 'rgba(32,216,236,.035)', border: 'rgba(32,216,236,.08)', color: MUTED },
}

export default function WeightHistory({ onBack }) {
  const [history, setHistory] = useState([])
  const [baselineWeightKg, setBaselineWeightKg] = useState(null)
  const [mealHistory, setMealHistory] = useState(null)
  const [loading, setLoading] = useState(true)
  const [showInput, setShowInput] = useState(false)
  const [input, setInput] = useState('')
  const [logging, setLogging] = useState(false)
  const [error, setError] = useState('')

  async function load() {
    setLoading(true)
    try {
      const [weightsData, mealsData] = await Promise.all([getWeightHistory(30), getMealHistory(14)])
      setHistory(weightsData.weights || [])
      setBaselineWeightKg(weightsData.baseline_weight_kg || null)
      setMealHistory(mealsData)
    } catch {
      setError('Trend data unavailable. No prototype values shown.')
    }
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
      await load()
    } catch {
      setError('Failed to save')
    }
    setLogging(false)
  }

  const latest = history[history.length - 1]
  const earliest = history[0]
  const delta = latest && earliest && history.length > 1 ? +(latest.weight_kg - earliest.weight_kg).toFixed(1) : null
  const last7Avg = average(history.slice(-7).map(w => Number(w.weight_kg)))
  const prev7Avg = average(history.slice(-14, -7).map(w => Number(w.weight_kg)))
  const trendRate = last7Avg !== null && prev7Avg !== null ? +(last7Avg - prev7Avg).toFixed(2) : null
  const baselineDelta = latest && baselineWeightKg ? +(latest.weight_kg - baselineWeightKg).toFixed(1) : null
  const avgProtein = mealHistory?.avg_protein_g ?? null
  const adherencePct = mealHistory?.logged_days ? mealHistory.adherence_pct : null
  const DAYS_LABELS = ['M','T','W','T','F','S','S']
  const heatData = (mealHistory?.history || []).slice(-14).map((d, i) => ({
    label: DAYS_LABELS[i % 7],
    state: d.adherence_status === 'good' ? 'good' : d.adherence_status === 'warn' ? 'warn' : d.has_data ? 'miss' : 'empty',
  }))

  return (
    <div style={{ height: '100%', display: 'flex', flexDirection: 'column', background: '#000', color: 'rgba(220,248,236,.94)', fontFamily: "'Saira Condensed',sans-serif" }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '13px 18px 11px', borderBottom: `1px solid ${BORDER}`, position: 'sticky', top: 0, background: 'rgba(0,0,0,.96)', backdropFilter: 'blur(12px)', zIndex: 5, flexShrink: 0 }}>
        <div style={{ display: 'flex', alignItems: 'center' }}>
          <span onClick={onBack} style={{ color: CYAN, fontSize: 16, marginRight: 10, cursor: 'pointer' }}>←</span>
          <span style={{ fontFamily: 'var(--display)', fontSize: 13, fontWeight: 700, letterSpacing: '.28em', color: LIME_BR, filter: 'drop-shadow(0 0 8px rgba(157,255,111,.22))' }}>NUTRITION TRENDS</span>
        </div>
        <span style={{ fontFamily: 'var(--mono)', fontSize: 8, letterSpacing: '.14em', color: LIME, border: `1px solid rgba(157,255,111,.32)`, background: 'rgba(157,255,111,.055)', padding: '2px 8px' }}>REAL DATA</span>
      </div>

      <div style={{ flex: 1, overflowY: 'auto' }}>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', borderBottom: `1px solid ${BORDER}` }}>
          <div style={{ padding: '16px 18px', borderRight: `1px solid ${BORDER}` }}>
            <div style={{ fontFamily: 'var(--mono)', fontSize: 8, letterSpacing: '.18em', color: MUTED, marginBottom: 5 }}>WEIGHT NOW</div>
            <div style={{ fontFamily: 'var(--display)', fontSize: 34, fontWeight: 700, lineHeight: 1, background: `linear-gradient(135deg,#fff,${LIME})`, WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent' }}>{latest ? Number(latest.weight_kg).toFixed(1) : '—'}</div>
            <div style={{ fontFamily: 'var(--mono)', fontSize: 8, color: TEXT_DIM, letterSpacing: '.1em', marginTop: 5, lineHeight: 1.55 }}>
              {delta === null ? 'Log weight to build trend' : `${Math.abs(delta)}kg ${delta < 0 ? 'down' : 'up'} in range`} {baselineDelta !== null ? `· ${baselineDelta > 0 ? '+' : ''}${baselineDelta}kg vs baseline` : ''}
            </div>
          </div>
          <div style={{ padding: '16px 18px' }}>
            <div style={{ fontFamily: 'var(--mono)', fontSize: 8, letterSpacing: '.18em', color: MUTED, marginBottom: 5 }}>AVG PROTEIN</div>
            <div style={{ fontFamily: 'var(--display)', fontSize: 34, fontWeight: 700, lineHeight: 1, color: '#fff' }}>{avgProtein === null ? '—' : `${avgProtein}g`}</div>
            <div style={{ fontFamily: 'var(--mono)', fontSize: 8, color: TEXT_DIM, letterSpacing: '.1em', marginTop: 5, lineHeight: 1.55 }}>{adherencePct === null ? 'No meal history yet' : `${adherencePct}% strict adherence`}</div>
          </div>
        </div>

        <div style={{ padding: '16px 18px', borderBottom: `1px solid ${BORDER}` }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
            <span style={{ fontFamily: 'var(--mono)', fontSize: 8, letterSpacing: '.22em', color: MUTED }}>WEIGHT TREND</span>
            <span style={{ fontFamily: 'var(--display)', fontSize: 16, fontWeight: 600, color: LIME }}>{trendRate === null ? 'NEEDS DATA' : `${trendRate > 0 ? '+' : ''}${trendRate}kg / 7D AVG`}</span>
          </div>
          {loading ? <div style={{ height: 132, display: 'flex', alignItems: 'center', justifyContent: 'center', color: MUTED, fontFamily: 'var(--mono)', fontSize: 12 }}>Loading…</div> : <WeightTrendChart weights={history} baselineWeightKg={baselineWeightKg} />}
        </div>

        <div style={{ padding: '16px 18px', borderBottom: `1px solid ${BORDER}` }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
            <span style={{ fontFamily: 'var(--mono)', fontSize: 8, letterSpacing: '.22em', color: MUTED }}>NUTRITION ADHERENCE</span>
            <span style={{ fontFamily: 'var(--display)', fontSize: 16, fontWeight: 600, color: LIME }}>{mealHistory?.good_days || 0} / {mealHistory?.logged_days || 0}</span>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7,1fr)', gap: 5 }}>
            {heatData.map((d, i) => {
              const c = HEAT_COLORS[d.state]
              return <div key={i} title={d.state} style={{ height: 32, border: `1px solid ${c.border}`, background: c.bg, display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: 'var(--mono)', fontSize: 7, color: c.color }}>{d.label}</div>
            })}
          </div>
          {!heatData.length && <div style={{ padding: '18px 0 4px', color: TEXT_DIM, fontFamily: 'var(--mono)', fontSize: 10, textAlign: 'center' }}>Log meals to generate adherence cells.</div>}
        </div>

        <div style={{ padding: '16px 18px', borderBottom: `1px solid ${BORDER}` }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
            <span style={{ fontFamily: 'var(--mono)', fontSize: 8, letterSpacing: '.22em', color: MUTED }}>LOG WEIGHT</span>
            <button onClick={() => setShowInput(!showInput)} style={{ border: `1px solid rgba(157,255,111,.24)`, background: 'rgba(157,255,111,.045)', color: LIME, fontFamily: 'var(--mono)', fontSize: 8, letterSpacing: '.14em', padding: '6px 10px', cursor: 'pointer' }}>{showInput ? 'CLOSE' : 'ADD'}</button>
          </div>
          {showInput && <div style={{ display: 'flex', gap: 8 }}>
            <input value={input} onChange={e => setInput(e.target.value)} placeholder="73.4" inputMode="decimal" style={{ flex: 1, background: 'rgba(157,255,111,.025)', border: `1px solid ${BORDER}`, color: '#fff', padding: '12px', fontFamily: 'var(--display)', fontSize: 18, outline: 'none' }} />
            <button onClick={handleLog} disabled={logging} style={{ padding: '0 16px', border: 'none', background: LIME, color: '#001204', fontFamily: 'var(--display)', fontWeight: 700, letterSpacing: '.16em', cursor: 'pointer' }}>{logging ? '...' : 'SAVE'}</button>
          </div>}
          {error && <div style={{ fontFamily: 'var(--mono)', fontSize: 10, color: '#ff5c7a', marginTop: 8 }}>{error}</div>}
        </div>

        <div style={{ margin: '14px 18px 32px', padding: '11px 13px', border: `1px solid rgba(32,216,236,.16)`, borderLeft: `3px solid ${LIME}`, background: 'rgba(157,255,111,.025)' }}>
          <div style={{ fontFamily: 'var(--mono)', fontSize: 7, letterSpacing: '.2em', color: 'rgba(157,255,111,.48)', marginBottom: 6 }}>PHOENIX TREND LOGIC</div>
          <div style={{ fontSize: '12.5px', lineHeight: 1.65, color: 'rgba(220,248,236,.78)' }}>
            Weight trend now uses only logged values. Nutrition adherence comes from the strict meal-history contract: calories must be close to target and protein must be close to target; under-eating no longer counts as success.
          </div>
        </div>
      </div>
    </div>
  )
}
