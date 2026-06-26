import { useState, useRef } from 'react'

// --- mock data generators ---
function seededRand(seed) {
  let s = seed
  return () => {
    s = (s * 1664525 + 1013904223) & 0xffffffff
    return (s >>> 0) / 0xffffffff
  }
}

function genCurve(points, start, vol, trend, seed = 42) {
  const rand = seededRand(seed)
  const vals = [start]
  for (let i = 1; i < points; i++) {
    const prev = vals[i - 1]
    vals.push(prev * (1 + (rand() - 0.49) * vol + trend))
  }
  return vals
}

const DATA = {
  week: {
    portfolio: genCurve(7, 1000, 0.018, 0.003, 11),
    spy:       genCurve(7, 1000, 0.012, 0.001, 22),
    labels: ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'],
  },
  month: {
    portfolio: genCurve(30, 1000, 0.016, 0.002, 33),
    spy:       genCurve(30, 1000, 0.010, 0.001, 44),
    labels: Array.from({ length: 30 }, (_, i) => i % 5 === 0 ? `D${i + 1}` : ''),
  },
  year: {
    portfolio: genCurve(52, 1000, 0.030, 0.004, 55),
    spy:       genCurve(52, 1000, 0.020, 0.002, 66),
    labels: Array.from({ length: 52 }, (_, i) => i % 8 === 0 ? `W${i + 1}` : ''),
  },
}

const CYAN = '#20d8ec'

function calcStats(portfolio, spy) {
  const rets = portfolio.slice(1).map((v, i) => (v - portfolio[i]) / portfolio[i])
  const spyRets = spy.slice(1).map((v, i) => (v - spy[i]) / spy[i])
  const mean = rets.reduce((a, b) => a + b, 0) / rets.length
  const std = Math.sqrt(rets.reduce((a, b) => a + (b - mean) ** 2, 0) / rets.length)
  const sharpe = std > 0 ? (mean / std) * Math.sqrt(52) : 0
  const wins = rets.filter(r => r > 0).length
  const best = Math.max(...rets)
  const worst = Math.min(...rets)
  const spyMean = spyRets.reduce((a, b) => a + b, 0) / spyRets.length
  const alpha = (mean - spyMean) * 52 * 100

  let maxDD = 0, peak = portfolio[0]
  for (const v of portfolio) {
    if (v > peak) peak = v
    const dd = (peak - v) / peak
    if (dd > maxDD) maxDD = dd
  }

  return {
    sharpe: sharpe.toFixed(2),
    winRate: ((wins / rets.length) * 100).toFixed(0),
    alpha: (alpha >= 0 ? '+' : '') + alpha.toFixed(1) + '%',
    best: '+' + (best * 100).toFixed(1) + '%',
    worst: (worst * 100).toFixed(1) + '%',
    maxDD: '-' + (maxDD * 100).toFixed(1) + '%',
  }
}

function buildWeeklyBars(portfolio) {
  const chunk = Math.max(1, Math.floor(portfolio.length / 8))
  const bars = []
  for (let i = 0; i < portfolio.length - chunk; i += chunk) {
    const ret = (portfolio[i + chunk] - portfolio[i]) / portfolio[i] * 100
    bars.push(ret)
  }
  return bars.slice(-8)
}

function EquityChart({ portfolio, spy, onScrub, scrubIdx }) {
  const svgRef = useRef(null)
  const W = 340, H = 160
  const PAD = { top: 10, right: 10, bottom: 24, left: 10 }
  const all = [...portfolio, ...spy]
  const minV = Math.min(...all)
  const maxV = Math.max(...all)
  const range = maxV - minV || 1
  const n = portfolio.length

  const px = i => PAD.left + (i / (n - 1)) * (W - PAD.left - PAD.right)
  const py = v => PAD.top + (1 - (v - minV) / range) * (H - PAD.top - PAD.bottom)

  const polyline = arr => arr.map((v, i) => `${px(i)},${py(v)}`).join(' ')
  const area = arr => `M${px(0)},${H - PAD.bottom} ` +
    arr.map((v, i) => `L${px(i)},${py(v)}`).join(' ') +
    ` L${px(n - 1)},${H - PAD.bottom} Z`

  function handleMove(e) {
    if (!svgRef.current) return
    const rect = svgRef.current.getBoundingClientRect()
    const clientX = e.touches ? e.touches[0].clientX : e.clientX
    const ratio = (clientX - rect.left) / rect.width
    const idx = Math.max(0, Math.min(n - 1, Math.round(ratio * (n - 1))))
    onScrub(idx)
  }

  const si = scrubIdx ?? n - 1
  const portVal = portfolio[si]
  const spyVal = spy[si]
  const portRet = ((portVal - portfolio[0]) / portfolio[0] * 100).toFixed(1)
  const spyRet = ((spyVal - spy[0]) / spy[0] * 100).toFixed(1)

  return (
    <div className="glass" style={{ padding: 14, marginBottom: 12 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 8 }}>
        <div>
          <div style={{ fontFamily: 'var(--mono)', fontSize: 9, color: 'var(--cyan)' }}>PORTFOLIO</div>
          <div style={{ fontFamily: 'var(--display)', fontSize: 24, color: '#fff' }}>
            {portRet >= 0 ? '+' : ''}{portRet}%
          </div>
        </div>
        <div style={{ textAlign: 'right' }}>
          <div style={{ fontFamily: 'var(--mono)', fontSize: 9, color: 'var(--dim)' }}>SPY</div>
          <div style={{ fontFamily: 'var(--display)', fontSize: 24, color: 'var(--dim)' }}>
            {spyRet >= 0 ? '+' : ''}{spyRet}%
          </div>
        </div>
      </div>

      <svg
        ref={svgRef}
        viewBox={`0 0 ${W} ${H}`}
        style={{ width: '100%', height: H, display: 'block', touchAction: 'none' }}
        onMouseMove={handleMove}
        onTouchMove={handleMove}
        onMouseLeave={() => onScrub(null)}
      >
        <defs>
          <linearGradient id="spyGrad" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="rgba(132,212,226,.3)" stopOpacity="0.3" />
            <stop offset="100%" stopColor="rgba(132,212,226,.3)" stopOpacity="0" />
          </linearGradient>
          <linearGradient id="portGrad" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={CYAN} stopOpacity="0.25" />
            <stop offset="100%" stopColor={CYAN} stopOpacity="0" />
          </linearGradient>
        </defs>
        <path d={area(spy)} fill="url(#spyGrad)" />
        <polyline points={polyline(spy)} fill="none" stroke="rgba(132,212,226,.32)" strokeWidth="1.5" />
        <path d={area(portfolio)} fill="url(#portGrad)" />
        <polyline points={polyline(portfolio)} fill="none" stroke={CYAN} strokeWidth="2" />
        <line x1={px(si)} y1={PAD.top} x2={px(si)} y2={H - PAD.bottom} stroke="rgba(125,240,255,.3)" strokeWidth="1" strokeDasharray="3,3" />
        <circle cx={px(si)} cy={py(portVal)} r="4" fill={CYAN} />
        <circle cx={px(si)} cy={py(spyVal)} r="3" fill="rgba(132,212,226,.5)" />
      </svg>
    </div>
  )
}

function StatsRow({ stats }) {
  const items = [
    ['SHARPE', stats.sharpe], ['WIN RATE', stats.winRate + '%'],
    ['ALPHA', stats.alpha], ['BEST WK', stats.best],
    ['WORST WK', stats.worst], ['MAX DD', stats.maxDD],
  ]
  return (
    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 8, marginBottom: 12 }}>
      {items.map(([label, val]) => {
        const isNeg = val.startsWith('-')
        const isPos = val.startsWith('+')
        const color = isPos ? 'var(--green)' : isNeg ? 'var(--red)' : '#fff'
        return (
          <div key={label} className="metric" style={{ flexDirection: 'column', alignItems: 'center', textAlign: 'center' }}>
            <div className="label">{label}</div>
            <div className="value" style={{ fontSize: 16, color }}>{val}</div>
          </div>
        )
      })}
    </div>
  )
}

function BarChart({ portfolio }) {
  const bars = buildWeeklyBars(portfolio)
  const maxAbs = Math.max(...bars.map(Math.abs), 1)
  const W = 340, H = 60
  const barW = W / bars.length - 4

  return (
    <div className="glass" style={{ padding: 14 }}>
      <div className="panel-title">WEEKLY RETURNS</div>
      <svg viewBox={`0 0 ${W} ${H}`} style={{ width: '100%', height: H, display: 'block' }}>
        <line x1="0" y1={H / 2} x2={W} y2={H / 2} stroke="rgba(32,216,236,.15)" strokeWidth="1" />
        {bars.map((ret, i) => {
          const x = i * (W / bars.length) + 2
          const barH = (Math.abs(ret) / maxAbs) * (H / 2 - 4)
          const y = ret >= 0 ? H / 2 - barH : H / 2
          const color = ret >= 0 ? '#7dffcf' : '#ff6d7a'
          return <rect key={i} x={x} y={y} width={barW} height={barH} fill={color} rx="1" />
        })}
      </svg>
    </div>
  )
}

export default function Performance({ onBack }) {
  const [period, setPeriod] = useState('month')
  const [scrubIdx, setScrubIdx] = useState(null)

  const { portfolio, spy } = DATA[period]
  const stats = calcStats(portfolio, spy)

  return (
    <div style={{ height: '100%', overflowY: 'auto', padding: 16, background: 'transparent', color: 'var(--text)' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 16 }}>
        <button onClick={onBack} className="action ghost" style={{ padding: '6px 10px', fontSize: 14 }}>←</button>
        <span style={{ fontFamily: 'var(--display)', fontSize: 18, color: 'var(--cyan)', letterSpacing: '.1em' }}>PERFORMANCE</span>
      </div>

      {/* Period tabs */}
      <div style={{ display: 'flex', gap: 8, marginBottom: 14 }}>
        {[['WEEK', 'week'], ['MONTH', 'month'], ['YEAR', 'year']].map(([label, key]) => (
          <button key={key} onClick={() => { setPeriod(key); setScrubIdx(null) }} className={`action${period === key ? '' : ' ghost'}`}>
            {label}
          </button>
        ))}
      </div>

      {/* Live price note */}
      <div className="badge warn" style={{ display: 'block', marginBottom: 12, padding: '7px 12px' }}>
        Live price feed coming soon — connect yfinance to update
      </div>

      <EquityChart portfolio={portfolio} spy={spy} onScrub={setScrubIdx} scrubIdx={scrubIdx} />
      <StatsRow stats={stats} />
      <BarChart portfolio={portfolio} />
    </div>
  )
}
