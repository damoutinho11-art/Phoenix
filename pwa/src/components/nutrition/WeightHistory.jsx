import { useState, useEffect } from 'react'
import { getWeightHistory, logWeight } from '../../api/client'

const TARGET_KG = 81

function WeightChart({ weights }) {
  if (!weights || weights.length < 2) return (
    <div style={{ height: 120, display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--dim)', fontFamily: 'var(--mono)', fontSize: 12 }}>
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
  const ty  = py(TARGET_KG).toFixed(1)
  const lastX = px(n - 1).toFixed(1)
  const lastY = py(vals[n - 1]).toFixed(1)

  return (
    <svg width="100%" viewBox={`0 0 ${W} ${H}`} style={{ overflow: 'visible' }}>
      <line x1={PX} y1={ty} x2={W - PX} y2={ty} stroke="var(--accent-nutrition)" strokeWidth="1" strokeDasharray="5,4" opacity="0.35" />
      <text x={W - PX + 4} y={+ty + 4} fill="var(--accent-nutrition)" fontSize="9" opacity="0.55" fontFamily="'Share Tech Mono', monospace">{TARGET_KG}</text>
      <polyline points={pts} fill="none" stroke="var(--accent-nutrition)" strokeWidth="2" strokeLinejoin="round" opacity="0.85" />
      <circle cx={lastX} cy={lastY} r="4" fill="var(--accent-nutrition)" />
      <circle cx={lastX} cy={lastY} r="7" fill="var(--accent-nutrition)" opacity="0.2" />
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
    <div style={{ height: '100%', overflowY: 'auto', background: 'transparent', color: 'var(--text)', fontFamily: 'var(--body)' }}>
      {/* Header */}
      <div style={{ padding: '14px 16px 10px', display: 'flex', alignItems: 'center', gap: 12, borderBottom: '1px solid var(--line)' }}>
        <button onClick={onBack} className="action ghost" style={{ padding: '6px 10px', fontSize: 14 }}>←</button>
        <span style={{ fontFamily: 'var(--display)', fontSize: 13, letterSpacing: '.12em', color: 'var(--accent-nutrition)' }}>WEIGHT</span>
      </div>

      {/* Current weight hero */}
      <div style={{ padding: '28px 16px 16px', textAlign: 'center' }}>
        {latest ? (
          <>
            <div style={{ fontFamily: 'var(--mono)', fontSize: 72, lineHeight: 1, color: 'var(--text)', textShadow: '0 0 30px var(--accent-nutrition)' }}>
              {latest.weight_kg}
            </div>
            <div style={{ fontFamily: 'var(--display)', fontSize: 10, color: 'var(--muted)', letterSpacing: '.12em', marginTop: 4 }}>KG</div>
            {toTarget !== null && (
              <div style={{ marginTop: 10, display: 'flex', justifyContent: 'center', gap: 20 }}>
                <div style={{ textAlign: 'center' }}>
                  <div style={{ fontFamily: 'var(--mono)', fontSize: 18, color: +toTarget > 0 ? 'var(--red)' : 'var(--accent-nutrition)' }}>
                    {+toTarget > 0 ? '+' : ''}{toTarget}
                  </div>
                  <div style={{ fontFamily: 'var(--display)', fontSize: 9, color: 'var(--muted)', marginTop: 2, letterSpacing: '.08em' }}>FROM TARGET</div>
                </div>
                {delta !== null && (
                  <div style={{ textAlign: 'center' }}>
                    <div style={{ fontFamily: 'var(--mono)', fontSize: 18, color: +delta < 0 ? 'var(--accent-nutrition)' : 'var(--red)' }}>
                      {+delta > 0 ? '+' : ''}{delta}
                    </div>
                    <div style={{ fontFamily: 'var(--display)', fontSize: 9, color: 'var(--muted)', marginTop: 2, letterSpacing: '.08em' }}>THIS MONTH</div>
                  </div>
                )}
              </div>
            )}
          </>
        ) : !loading && (
          <div style={{ color: 'var(--dim)', fontFamily: 'var(--mono)', fontSize: 13 }}>No weight logged yet.</div>
        )}
      </div>

      {/* Chart */}
      <div style={{ padding: '4px 16px 24px' }}>
        <div className="panel-title">30-DAY TREND</div>
        {loading
          ? <div style={{ height: 120, display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--dim)' }}>Loading…</div>
          : <WeightChart weights={history} />
        }
      </div>

      {/* Log weight */}
      <div style={{ padding: '0 16px 24px' }}>
        {!showInput ? (
          <button onClick={() => setShowInput(true)} className="action safe" style={{ padding: '10px 20px' }}>
            + LOG WEIGHT
          </button>
        ) : (
          <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
            <input
              type="number"
              step="0.1"
              placeholder="kg"
              value={input}
              autoFocus
              onChange={e => setInput(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && handleLog()}
              style={{
                flex: 1, background: 'rgba(1,10,13,.7)',
                border: '1px solid rgba(125,255,207,.3)',
                padding: '10px 12px', color: 'var(--text)', fontSize: 18,
                fontFamily: 'var(--mono)', outline: 'none',
              }}
            />
            <button onClick={handleLog} disabled={logging} className={`action safe${logging ? ' ghost' : ''}`} style={{ padding: '10px 22px' }}>
              {logging ? '…' : 'LOG'}
            </button>
            <button onClick={() => { setShowInput(false); setError('') }}
              className="action ghost" style={{ padding: '4px 8px', fontSize: 20 }}>×</button>
          </div>
        )}
        {error && <div style={{ fontFamily: 'var(--mono)', fontSize: 11, color: 'var(--red)', marginTop: 6 }}>{error}</div>}
      </div>

      {/* History list */}
      {history.length > 0 && (
        <div style={{ padding: '0 16px 40px' }}>
          <div className="panel-title">HISTORY</div>
          {[...history].reverse().slice(0, 20).map(w => (
            <div key={w.id} className="row" style={{ marginBottom: 4 }}>
              <span className="row-sub">{w.log_date}</span>
              <span className="row-title" style={{ fontFamily: 'var(--mono)', fontSize: 13 }}>{w.weight_kg} kg</span>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
