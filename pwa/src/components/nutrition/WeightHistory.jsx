import { useState, useEffect } from 'react'
import { getWeightHistory, logWeight } from '../../api/client'

const G = '#9dff6f'
const BG = '#0a0a0a'
const BORDER = '#1a1a1a'
const TEXT = '#e8e8e8'
const DIM = '#555'
const MONO = "'Share Tech Mono', monospace"
const DISPLAY = "'Oswald', 'Inter', sans-serif"
const TARGET_KG = 81

function WeightChart({ weights }) {
  if (!weights || weights.length < 2) return (
    <div style={{ height: '120px', display: 'flex', alignItems: 'center', justifyContent: 'center', color: DIM, fontSize: '13px' }}>
      Log at least 2 entries to see a trend
    </div>
  )

  const W = 340, H = 120, PX = 16, PY = 14
  const vals = weights.map(w => w.weight_kg)
  const minV = Math.min(...vals, TARGET_KG) - 0.8
  const maxV = Math.max(...vals, TARGET_KG) + 0.8
  const n = weights.length

  const px = i => PX + (i / (n - 1)) * (W - 2 * PX)
  const py = v => H - PY - ((v - minV) / (maxV - minV)) * (H - 2 * PY)

  const pts = weights.map((w, i) => `${px(i).toFixed(1)},${py(w.weight_kg).toFixed(1)}`).join(' ')
  const ty = py(TARGET_KG).toFixed(1)
  const lastX = px(n - 1).toFixed(1)
  const lastY = py(vals[n - 1]).toFixed(1)

  return (
    <svg width="100%" viewBox={`0 0 ${W} ${H}`} style={{ overflow: 'visible' }}>
      {/* Target line */}
      <line x1={PX} y1={ty} x2={W - PX} y2={ty} stroke={G} strokeWidth="1" strokeDasharray="5,4" opacity="0.35" />
      <text x={W - PX + 4} y={+ty + 4} fill={G} fontSize="9" opacity="0.55" fontFamily="Inter,sans-serif">{TARGET_KG}</text>
      {/* Trend line */}
      <polyline points={pts} fill="none" stroke={G} strokeWidth="2" strokeLinejoin="round" opacity="0.85" />
      {/* Latest dot */}
      <circle cx={lastX} cy={lastY} r="4" fill={G} />
      <circle cx={lastX} cy={lastY} r="7" fill={G} opacity="0.2" />
    </svg>
  )
}

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

  return (
    <div style={{ height: '100%', overflowY: 'auto', background: BG, color: TEXT, fontFamily: 'Inter,sans-serif' }}>
      {/* Header */}
      <div style={{ padding: '14px 16px 10px', display: 'flex', alignItems: 'center', gap: '12px', borderBottom: `1px solid ${BORDER}` }}>
        <button onClick={onBack} style={{ background: 'none', border: 'none', color: DIM, fontSize: '22px', cursor: 'pointer', padding: 0, lineHeight: 1 }}>‹</button>
        <span style={{ fontFamily: DISPLAY, fontSize: '13px', letterSpacing: '0.12em', color: G, fontWeight: 600 }}>WEIGHT</span>
      </div>

      {/* Current weight hero */}
      <div style={{ padding: '28px 16px 16px', textAlign: 'center' }}>
        {latest ? (
          <>
            <div style={{ fontFamily: MONO, fontSize: '72px', lineHeight: 1, color: TEXT }}>
              {latest.weight_kg}
            </div>
            <div style={{ fontSize: '11px', color: DIM, letterSpacing: '0.12em', marginTop: '4px', fontFamily: DISPLAY }}>KG</div>
            {toTarget !== null && (
              <div style={{ marginTop: '10px', display: 'flex', justifyContent: 'center', gap: '20px' }}>
                <div style={{ textAlign: 'center' }}>
                  <div style={{ fontFamily: MONO, fontSize: '18px', color: +toTarget > 0 ? '#ef5350' : G }}>
                    {+toTarget > 0 ? '+' : ''}{toTarget}
                  </div>
                  <div style={{ fontSize: '10px', color: DIM, marginTop: '2px', fontFamily: DISPLAY, letterSpacing: '0.06em' }}>
                    FROM TARGET
                  </div>
                </div>
                {delta !== null && (
                  <div style={{ textAlign: 'center' }}>
                    <div style={{ fontFamily: MONO, fontSize: '18px', color: +delta < 0 ? G : '#ef5350' }}>
                      {+delta > 0 ? '+' : ''}{delta}
                    </div>
                    <div style={{ fontSize: '10px', color: DIM, marginTop: '2px', fontFamily: DISPLAY, letterSpacing: '0.06em' }}>
                      THIS MONTH
                    </div>
                  </div>
                )}
              </div>
            )}
          </>
        ) : !loading && (
          <div style={{ color: DIM, fontSize: '14px' }}>No weight logged yet.</div>
        )}
      </div>

      {/* Chart */}
      <div style={{ padding: '4px 16px 24px' }}>
        <div style={{ fontSize: '11px', fontFamily: DISPLAY, letterSpacing: '0.1em', color: DIM, marginBottom: '12px' }}>30-DAY TREND</div>
        {loading
          ? <div style={{ height: '120px', display: 'flex', alignItems: 'center', justifyContent: 'center', color: DIM }}>Loading…</div>
          : <WeightChart weights={history} />
        }
      </div>

      {/* Log weight */}
      <div style={{ padding: '0 16px 24px' }}>
        {!showInput ? (
          <button
            onClick={() => setShowInput(true)}
            style={{ background: 'none', border: `1px solid ${G}`, borderRadius: '8px', padding: '10px 20px', color: G, fontSize: '12px', fontWeight: 600, letterSpacing: '0.08em', fontFamily: DISPLAY, cursor: 'pointer' }}
          >
            + LOG WEIGHT
          </button>
        ) : (
          <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
            <input
              type="number"
              step="0.1"
              placeholder="kg"
              value={input}
              autoFocus
              onChange={e => setInput(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && handleLog()}
              style={{ flex: 1, background: '#111', border: `1px solid ${G}44`, borderRadius: '8px', padding: '10px 12px', color: TEXT, fontSize: '18px', fontFamily: MONO, outline: 'none' }}
            />
            <button onClick={handleLog} disabled={logging}
              style={{ background: logging ? '#1a2a1a' : G, border: 'none', borderRadius: '8px', padding: '10px 22px', color: logging ? DIM : '#000', fontSize: '13px', fontWeight: 700, cursor: logging ? 'default' : 'pointer', fontFamily: DISPLAY }}>
              {logging ? '…' : 'LOG'}
            </button>
            <button onClick={() => { setShowInput(false); setError('') }}
              style={{ background: 'none', border: 'none', color: DIM, fontSize: '20px', cursor: 'pointer', padding: '4px 8px' }}>×</button>
          </div>
        )}
        {error && <div style={{ fontSize: '12px', color: '#ef5350', marginTop: '6px' }}>{error}</div>}
      </div>

      {/* History list */}
      {history.length > 0 && (
        <div style={{ padding: '0 16px 40px' }}>
          <div style={{ fontSize: '11px', fontFamily: DISPLAY, letterSpacing: '0.1em', color: DIM, marginBottom: '10px' }}>HISTORY</div>
          {[...history].reverse().slice(0, 20).map(w => (
            <div key={w.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '9px 0', borderBottom: `1px solid ${BORDER}` }}>
              <span style={{ fontSize: '13px', color: DIM }}>{w.log_date}</span>
              <span style={{ fontFamily: MONO, fontSize: '13px', color: TEXT }}>{w.weight_kg} kg</span>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
