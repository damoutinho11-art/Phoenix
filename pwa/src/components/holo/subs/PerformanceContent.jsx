import { useEffect, useRef, useState } from 'react'
import { ACC, G, R, W, BODY, FM, FD, FB, a, mix, deep } from '../holoTokens'
import { getFinancePerformanceHistory } from '../../../api/client'
import { financeBody, financeLabel, financeMicro } from './financeReadability'

const eurFull = v => Number(v).toLocaleString('en-US', { style: 'currency', currency: 'EUR', minimumFractionDigits: 2 })
const eurK = v => {
  const n = Number(v) || 0
  if (Math.abs(n) >= 1000) return '€' + (n / 1000).toFixed(Math.abs(n) % 1000 < 50 ? 0 : 1) + 'k'
  return '€' + n.toFixed(0)
}
const shortDate = v => {
  const d = new Date(v)
  return Number.isNaN(d.getTime()) ? '—' : d.toLocaleDateString('en-GB', { day: '2-digit', month: 'short' })
}

// viewBox geometry — text scales with the box; kept ~1:1 so labels stay legible
const VB_W = 720
const VB_H = 300
const PL = 62
const PR = 704
const PT = 18
const PB = 244

function Chart({ snaps }) {
  const [hover, setHover] = useState(null)
  const svgRef = useRef(null)

  const vals = snaps.map(s => Number(s.total_value_eur))
  const ts = snaps.map(s => new Date(s.created_at).getTime())
  let lo = Math.min(...vals)
  let hi = Math.max(...vals)
  if (lo === hi) { lo = lo * 0.98; hi = hi * 1.02 || 1 }
  const padY = (hi - lo) * 0.12
  lo -= padY; hi += padY
  const t0 = Math.min(...ts)
  const t1 = Math.max(...ts)
  const spanT = t1 - t0
  const n = snaps.length
  const X = i => (spanT > 0 ? PL + ((ts[i] - t0) / spanT) * (PR - PL) : PL + (i / Math.max(1, n - 1)) * (PR - PL))
  const Y = v => PB - ((v - lo) / (hi - lo)) * (PB - PT)

  const linePts = snaps.map((s, i) => `${X(i).toFixed(1)},${Y(vals[i]).toFixed(1)}`).join(' ')
  const areaPts = `${linePts} ${X(n - 1).toFixed(1)},${PB} ${X(0).toFixed(1)},${PB}`
  const gridVals = Array.from({ length: 4 }, (_, i) => lo + ((hi - lo) * i) / 3)
  const lastVals = vals[n - 1]

  const onMove = e => {
    const svg = svgRef.current
    if (!svg) return
    const rect = svg.getBoundingClientRect()
    const mx = ((e.clientX - rect.left) / rect.width) * VB_W
    let best = 0
    let bestD = Infinity
    for (let i = 0; i < n; i++) {
      const d = Math.abs(X(i) - mx)
      if (d < bestD) { bestD = d; best = i }
    }
    setHover(best)
  }

  const hv = hover != null ? snaps[hover] : null

  return (
    <div style={{ position: 'relative', marginTop: 6 }}>
      <svg ref={svgRef} viewBox={`0 0 ${VB_W} ${VB_H}`} width="100%" style={{ display: 'block', overflow: 'visible' }}
        onMouseMove={onMove} onMouseLeave={() => setHover(null)}>
        <defs>
          <linearGradient id="perf-fill" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={ACC} stopOpacity="0.28" />
            <stop offset="100%" stopColor={ACC} stopOpacity="0" />
          </linearGradient>
        </defs>

        {/* recessive gridlines + y labels (ink tokens, not the series color) */}
        {gridVals.map((gv, i) => {
          const y = Y(gv)
          return (
            <g key={i}>
              <line x1={PL} y1={y} x2={PR} y2={y} stroke={a(ACC, '12')} strokeWidth="1" />
              <text x={PL - 10} y={y + 3} textAnchor="end" fontFamily="Share Tech Mono, monospace" fontSize="11" fill={a(ACC, '88')}>{eurK(gv)}</text>
            </g>
          )
        })}

        {/* x date labels: first, mid, last */}
        {[0, Math.floor((n - 1) / 2), n - 1].filter((v, i, arr) => arr.indexOf(v) === i).map(i => (
          <text key={i} x={X(i)} y={PB + 22} textAnchor={i === 0 ? 'start' : i === n - 1 ? 'end' : 'middle'} fontFamily="Share Tech Mono, monospace" fontSize="10" fill={a(ACC, '77')}>{shortDate(snaps[i].created_at)}</text>
        ))}

        {/* area + line */}
        <polyline points={areaPts} fill="url(#perf-fill)" stroke="none" />
        <polyline points={linePts} fill="none" stroke={ACC} strokeWidth="2.2" strokeLinejoin="round" strokeLinecap="round" style={{ filter: `drop-shadow(0 0 5px ${a(ACC, '88')})` }} />

        {/* last point marker */}
        <circle cx={X(n - 1)} cy={Y(lastVals)} r="4" fill={W} stroke={ACC} strokeWidth="1.5" style={{ filter: `drop-shadow(0 0 6px ${ACC})` }} />

        {/* hover crosshair + point */}
        {hv && (
          <g pointerEvents="none">
            <line x1={X(hover)} y1={PT} x2={X(hover)} y2={PB} stroke={a(ACC, '55')} strokeWidth="1" strokeDasharray="3 3" />
            <circle cx={X(hover)} cy={Y(vals[hover])} r="4.5" fill={ACC} stroke={W} strokeWidth="1.5" />
          </g>
        )}
      </svg>

      {/* hover tooltip (HTML overlay for crisp text) */}
      {hv && (
        <div style={{ position: 'absolute', left: `${(X(hover) / VB_W) * 100}%`, top: `${(Y(vals[hover]) / VB_H) * 100}%`, transform: `translate(${hover > n / 2 ? '-108%' : '8%'}, -120%)`, pointerEvents: 'none', background: deep(92), border: `1px solid ${a(ACC, '44')}`, padding: '6px 9px', whiteSpace: 'nowrap', boxShadow: `0 0 18px ${a(ACC, '22')}` }}>
          <div style={financeMicro({ letterSpacing: '.1em', color: a(ACC, '99') })}>{shortDate(hv.created_at)}</div>
          <div style={{ fontFamily: FD, fontSize: 16, fontWeight: 700, color: W }}>{eurFull(hv.total_value_eur)}</div>
        </div>
      )}
    </div>
  )
}

function StatTile({ label, value, color = W }) {
  return (
    <div style={{ border: `1px solid ${a(ACC, '20')}`, background: deep(58), padding: '11px 12px', textAlign: 'center' }}>
      <div style={{ ...financeMicro({ color: a(ACC, '88') }), marginBottom: 5 }}>{label}</div>
      <div style={{ fontFamily: FD, fontSize: 18, fontWeight: 700, color }}>{value}</div>
    </div>
  )
}

const HOW_STEPS = [
  'Approve a weekly brief',
  'Complete the buy manually in your broker',
  'Record the transaction in the ledger',
  'Apply it to portfolio state',
]

// ── FINANCE // PERFORMANCE — real portfolio-value time series ──
// Self-fetching. Plots ONLY recorded snapshots; never fabricates returns.
export function PerformanceContent() {
  const [snaps, setSnaps] = useState(null)
  const [error, setError] = useState(false)

  useEffect(() => {
    let alive = true
    getFinancePerformanceHistory()
      .then(r => { if (alive) setSnaps(Array.isArray(r.snapshots) ? r.snapshots : []) })
      .catch(() => { if (alive) setError(true) })
    return () => { alive = false }
  }, [])

  if (error) {
    return <div style={{ padding: '20px 0', ...financeLabel({ fontSize: 9, color: R }) }}>UNABLE TO LOAD PERFORMANCE HISTORY</div>
  }
  if (snaps === null) {
    return <div style={{ padding: '48px 0', textAlign: 'center', ...financeLabel({ fontSize: 9, letterSpacing: '.18em', color: a(ACC, '99') }) }}>LOADING REAL HISTORY…</div>
  }

  // snapshots are ordered newest-first by the API; chart wants oldest→newest
  const ordered = snaps.slice().sort((x, y) => new Date(x.created_at) - new Date(y.created_at))

  if (ordered.length < 2) {
    return (
      <div style={{ textAlign: 'center', padding: '10px 8px' }}>
        {ordered.length === 1 && (
          <div style={{ marginBottom: 22 }}>
            <div style={{ fontFamily: FD, fontSize: 44, fontWeight: 700, color: ACC, lineHeight: 1, textShadow: `0 0 34px ${a(ACC, '33')}` }}>{eurFull(ordered[0].total_value_eur)}</div>
            <div style={{ fontFamily: FM, fontSize: 9, letterSpacing: '.16em', color: a(ACC, '99'), marginTop: 8 }}>FIRST SNAPSHOT · {shortDate(ordered[0].created_at)}</div>
          </div>
        )}
        <div style={{ fontFamily: FD, fontSize: 20, fontWeight: 700, color: ACC, marginBottom: 10 }}>
          {ordered.length === 1 ? 'One snapshot recorded — need two for a trend.' : 'No real performance history yet.'}
        </div>
        <div style={{ maxWidth: 340, margin: '0 auto 20px', display: 'grid', gap: 7, textAlign: 'left' }}>
          {HOW_STEPS.map((step, i) => (
            <div key={i} style={{ display: 'flex', gap: 10, padding: '9px 12px', border: `1px solid ${a(ACC, '18')}`, background: deep(58) }}>
              <span style={{ fontFamily: FM, fontSize: 9, color: ACC, flexShrink: 0 }}>{i + 1}.</span>
              <span style={financeBody({ fontSize: 13, color: mix(BODY, 84), lineHeight: 1.5 })}>{step}</span>
            </div>
          ))}
        </div>
        <div style={{ maxWidth: 340, margin: '0 auto', padding: '11px 14px', border: `1px solid ${mix(G, 24)}`, background: mix(G, 4), textAlign: 'left' }}>
          <div style={{ fontFamily: FM, fontSize: 9, letterSpacing: '.16em', color: G, marginBottom: 5 }}>REAL DATA ONLY</div>
          <div style={{ fontFamily: FB, fontSize: 12, fontWeight: 300, lineHeight: 1.55, color: mix(BODY, 80) }}>
            No trades executed, no simulated returns. The curve reflects only your recorded transactions.
          </div>
        </div>
      </div>
    )
  }

  const first = ordered[0]
  const last = ordered[ordered.length - 1]
  const delta = Number(last.total_value_eur) - Number(first.total_value_eur)
  const pct = Number(first.total_value_eur) ? (delta / Number(first.total_value_eur)) * 100 : 0
  const up = delta >= 0
  const deltaColor = up ? G : R

  return (
    <div>
      {/* hero: latest value + delta over the recorded period */}
      <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
        <div>
          <div style={{ fontFamily: FD, fontSize: 40, fontWeight: 700, color: W, lineHeight: 1, textShadow: `0 0 30px ${a(ACC, '33')}` }}>{eurFull(last.total_value_eur)}</div>
          <div style={{ fontFamily: FM, fontSize: 9, letterSpacing: '.16em', color: a(ACC, '99'), marginTop: 6 }}>TOTAL VALUE · LATEST SNAPSHOT</div>
        </div>
        <div style={{ textAlign: 'right' }}>
          <div style={{ fontFamily: FD, fontSize: 22, fontWeight: 700, color: deltaColor }}>{up ? '+' : '−'}{eurFull(Math.abs(delta)).replace('€', '€')}</div>
          <div style={{ fontFamily: FM, fontSize: 9, letterSpacing: '.14em', color: deltaColor }}>{up ? '+' : '−'}{Math.abs(pct).toFixed(2)}% · SINCE {shortDate(first.created_at)}</div>
        </div>
      </div>

      <Chart snaps={ordered} />

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 8, marginTop: 14 }}>
        <StatTile label="INVESTED" value={eurK(last.invested_value_eur)} color={ACC} />
        <StatTile label="CASH" value={eurK(last.cash_eur)} color={W} />
        <StatTile label="SNAPSHOTS" value={String(ordered.length)} color={W} />
      </div>

      <div style={{ marginTop: 12, fontFamily: FM, fontSize: 9, letterSpacing: '.14em', color: a(ACC, '77'), textAlign: 'center' }}>
        REAL RECORDED SNAPSHOTS ONLY · NO SIMULATED RETURNS
      </div>
    </div>
  )
}
