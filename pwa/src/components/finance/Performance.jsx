import { useState, useEffect, useRef } from 'react'

// ── Data generation (from prototype) ─────────────────────────
function lcg(seed) { return ((seed * 1664525 + 1013904223) & 0x7fffffff) / 0x7fffffff }
function genCurve(n, drift, vol, seed) {
  let v = 100, d = [100], s = seed
  for (let i = 1; i < n; i++) {
    s = Math.floor(lcg(s) * 99999)
    v *= 1 + drift + (lcg(s) - .5) * vol
    d.push(v)
  }
  return d
}

const VIEWS = {
  week: {
    n: 5, drift: .0036, vol: .012, spyDrift: .0018, spyVol: .009, seed: 42,
    portReturn: '+1.8%', portAbs: '+$2,540', spyReturn: '+0.9%',
    alphaTxt: '+0.9% vs SPY', date: 'Jun 17–24, 2026',
    chartTitle: 'EQUITY CURVE · THIS WEEK',
    barLabel: 'DAILY BREAKDOWN',
    barLabels: ['MON', 'TUE', 'WED', 'THU', 'FRI'],
    stats: { sharpe: '1.42', winrate: '75%', alpha: '+0.9%', best: '+5.1%', worst: '−1.8%', mdd: '−4.3%' },
    barData: [0.4, -0.3, 0.8, 0.6, 0.3],
  },
  month: {
    n: 22, drift: .0028, vol: .018, spyDrift: .0014, spyVol: .012, seed: 77,
    portReturn: '+6.2%', portAbs: '+$8,460', spyReturn: '+3.1%',
    alphaTxt: '+3.1% vs SPY', date: 'Jun 1–24, 2026',
    chartTitle: 'EQUITY CURVE · THIS MONTH',
    barLabel: 'WEEKLY BREAKDOWN',
    barLabels: ['WK1', 'WK2', 'WK3', 'WK4'],
    stats: { sharpe: '1.61', winrate: '75%', alpha: '+3.1%', best: '+5.1%', worst: '−1.8%', mdd: '−3.2%' },
    barData: [1.4, 2.1, -0.8, 3.5],
  },
  year: {
    n: 52, drift: .0032, vol: .022, spyDrift: .0016, spyVol: .016, seed: 13,
    portReturn: '+18.4%', portAbs: '+$21,600', spyReturn: '+9.2%',
    alphaTxt: '+9.2% vs SPY', date: 'Jan–Jun 2026',
    chartTitle: 'EQUITY CURVE · THIS YEAR',
    barLabel: 'MONTHLY BREAKDOWN',
    barLabels: ['JAN', 'FEB', 'MAR', 'APR', 'MAY', 'JUN'],
    stats: { sharpe: '1.38', winrate: '72%', alpha: '+9.2%', best: '+8.3%', worst: '−4.1%', mdd: '−6.8%' },
    barData: [3.2, -1.4, 4.8, 2.1, 5.1, 4.6],
  },
}

const W = 390, H = 180, PAD = { t: 15, b: 28, l: 42, r: 12 }

// ── Equity Chart ──────────────────────────────────────────────
function EquityChart({ view }) {
  const svgRef = useRef(null)
  const [scrub, setScrub] = useState(null)
  const lineRef = useRef(null)

  const cfg = VIEWS[view]
  const portData = genCurve(cfg.n, cfg.drift, cfg.vol, cfg.seed)
  const spyData = genCurve(cfg.n, cfg.spyDrift, cfg.spyVol, cfg.seed + 7)

  const allVals = [...portData, ...spyData]
  const mn = Math.min(...allVals) * 0.9985
  const mx = Math.max(...allVals) * 1.0015
  const cw = W - PAD.l - PAD.r
  const ch = H - PAD.t - PAD.b

  const px = i => PAD.l + (i / (portData.length - 1)) * cw
  const py = v => PAD.t + (1 - (v - mn) / (mx - mn)) * ch

  // Grid lines
  const gridLines = Array.from({ length: 5 }, (_, i) => {
    const y = PAD.t + (i / 4) * ch
    const val = mx - (i / 4) * (mx - mn)
    const p = ((val / 100 - 1) * 100).toFixed(1)
    return { y, label: (p >= 0 ? '+' : '') + p + '%' }
  })

  // Zero baseline
  const zeroY = py(100)

  // SPY polyline
  const spyPts = spyData.map((v, i) => `${px(i).toFixed(1)},${py(v).toFixed(1)}`).join(' ')

  // Portfolio fill + line
  const portPts = portData.map((v, i) => `${px(i).toFixed(1)},${py(v).toFixed(1)}`).join(' ')
  const lastX = px(portData.length - 1)
  const lastY = py(portData[portData.length - 1])
  const fillPts = portPts + ` ${lastX.toFixed(1)},${(PAD.t + ch).toFixed(1)} ${PAD.l.toFixed(1)},${(PAD.t + ch).toFixed(1)}`

  // Compute line length for animation
  const portLen = portData.reduce((acc, v, i) => i === 0 ? 0 : acc + Math.hypot(px(i) - px(i - 1), py(v) - py(portData[i - 1])), 0)

  // Animate line on view change
  useEffect(() => {
    if (lineRef.current) {
      lineRef.current.setAttribute('stroke-dashoffset', portLen)
      lineRef.current.style.transition = 'none'
      requestAnimationFrame(() => {
        setTimeout(() => {
          if (lineRef.current) {
            lineRef.current.style.transition = 'stroke-dashoffset 1.2s cubic-bezier(.4,0,.2,1)'
            lineRef.current.setAttribute('stroke-dashoffset', '0')
          }
        }, 30)
      })
    }
  }, [view, portLen])

  // x-axis labels
  const step = Math.max(1, Math.floor(portData.length / 5))
  const xLabels = []
  for (let i = 0; i < portData.length; i += step) xLabels.push({ i, x: px(i) })

  // Scrubbing
  function handleMove(e) {
    if (!svgRef.current) return
    const rect = svgRef.current.getBoundingClientRect()
    const clientX = e.touches ? e.touches[0].clientX : e.clientX
    const svgX = (clientX - rect.left) * (W / rect.width)
    const i = Math.max(0, Math.min(portData.length - 1, Math.round((svgX - PAD.l) / cw * (portData.length - 1))))
    setScrub(i)
  }

  const si = scrub ?? portData.length - 1
  const scrubX = px(si)
  const scrubYp = py(portData[si])
  const scrubYs = py(spyData[si])
  const pctP = ((portData[si] / 100 - 1) * 100).toFixed(1)
  const pctS = ((spyData[si] / 100 - 1) * 100).toFixed(1)

  return (
    <div style={{ position: 'relative', borderBottom: '1px solid rgba(32,216,236,.18)', paddingTop: 16 }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '0 18px', marginBottom: 8 }}>
        <span style={{ fontFamily: 'var(--mono)', fontSize: 8, letterSpacing: '.18em', color: 'rgba(32,216,236,.38)' }}>{cfg.chartTitle}</span>
        <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 5, fontFamily: 'var(--mono)', fontSize: 8, color: 'rgba(125,188,200,.55)' }}>
            <div style={{ width: 18, height: 2, background: '#20d8ec', boxShadow: '0 0 4px #20d8ec' }} />PORTFOLIO
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 5, fontFamily: 'var(--mono)', fontSize: 8, color: 'rgba(125,188,200,.55)' }}>
            <div style={{ width: 18, height: 2, background: 'repeating-linear-gradient(90deg,rgba(255,255,255,.35) 0,rgba(255,255,255,.35) 4px,transparent 4px,transparent 8px)' }} />SPY
          </div>
        </div>
      </div>
      <div style={{ position: 'relative' }}>
        <svg
          ref={svgRef}
          viewBox={`0 0 ${W} ${H}`}
          preserveAspectRatio="none"
          style={{ width: '100%', display: 'block', cursor: 'crosshair', touchAction: 'none' }}
          onMouseMove={handleMove}
          onTouchMove={handleMove}
          onMouseLeave={() => setScrub(null)}
          onTouchEnd={() => setScrub(null)}
        >
          <defs>
            <linearGradient id="fillGradP" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="rgba(32,216,236,.45)" />
              <stop offset="60%" stopColor="rgba(32,216,236,.08)" />
              <stop offset="100%" stopColor="rgba(32,216,236,0)" />
            </linearGradient>
            <filter id="glowP" x="-10%" y="-40%" width="120%" height="180%">
              <feGaussianBlur stdDeviation="2.5" result="blur" />
              <feMerge><feMergeNode in="blur" /><feMergeNode in="SourceGraphic" /></feMerge>
            </filter>
            <clipPath id="fillClipP">
              <rect x={PAD.l} y={PAD.t} width={cw} height={ch} />
            </clipPath>
          </defs>

          {/* Grid */}
          {gridLines.map((g, i) => (
            <g key={i}>
              <line x1={PAD.l} y1={g.y} x2={W - PAD.r} y2={g.y} stroke="rgba(32,216,236,.07)" strokeWidth="1" strokeDasharray="2 4" />
              <text x={PAD.l - 4} y={g.y + 3.5} textAnchor="end" fontFamily="Share Tech Mono,monospace" fontSize="7.5" fill="rgba(32,216,236,.38)">{g.label}</text>
            </g>
          ))}

          {/* Zero baseline */}
          {zeroY >= PAD.t && zeroY <= PAD.t + ch && (
            <line x1={PAD.l} y1={zeroY} x2={W - PAD.r} y2={zeroY} stroke="rgba(32,216,236,.2)" strokeWidth="1" />
          )}

          {/* SPY */}
          <polyline points={spyPts} fill="none" stroke="rgba(255,255,255,.28)" strokeWidth="1.2" strokeDasharray="4 5" />

          {/* Portfolio fill */}
          <polygon points={fillPts} fill="url(#fillGradP)" clipPath="url(#fillClipP)" />

          {/* Portfolio line (animated) */}
          <polyline
            ref={lineRef}
            points={portPts}
            fill="none"
            stroke="#20d8ec"
            strokeWidth="2"
            filter="url(#glowP)"
            strokeDasharray={portLen}
            strokeDashoffset="0"
          />

          {/* Endpoint dot */}
          <circle cx={lastX.toFixed(1)} cy={lastY.toFixed(1)} r="4" fill="#7df0ff" stroke="#000" strokeWidth="1.5" filter="url(#glowP)" />

          {/* Scrub */}
          {scrub !== null && (
            <>
              <line x1={scrubX} y1={PAD.t} x2={scrubX} y2={PAD.t + ch} stroke="rgba(32,216,236,.45)" strokeWidth="1" />
              <circle cx={scrubX} cy={scrubYp} r="4" fill="#20d8ec" stroke="#000" strokeWidth="1.5" />
              <circle cx={scrubX} cy={scrubYs} r="3" fill="rgba(255,255,255,.45)" stroke="#000" strokeWidth="1" />
            </>
          )}

          {/* X-axis labels */}
          {xLabels.map(({ i, x }) => (
            <text key={i} x={x.toFixed(1)} y={H - 6} textAnchor="middle" fontFamily="Share Tech Mono,monospace" fontSize="7.5" fill="rgba(32,216,236,.35)">{i + 1}</text>
          ))}
        </svg>

        {/* Scrub tooltip */}
        {scrub !== null && (
          <div style={{ position: 'absolute', top: 30, left: Math.min(scrubX / W * 100, 70) + '%', background: 'rgba(0,0,0,.92)', border: '1px solid rgba(32,216,236,.18)', padding: '6px 10px', fontFamily: 'var(--mono)', fontSize: 8, color: '#7df0ff', letterSpacing: '.1em', whiteSpace: 'nowrap', pointerEvents: 'none', zIndex: 10 }}>
            <span style={{ color: '#7df0ff' }}>{(pctP >= 0 ? '+' : '') + pctP}%</span>
            {'  '}
            <span style={{ color: 'rgba(255,255,255,.4)' }}>{(pctS >= 0 ? '+' : '') + pctS}%</span>
          </div>
        )}
      </div>
    </div>
  )
}

// ── Bar Chart ─────────────────────────────────────────────────
function BarChart({ barData, barLabels, barLabel }) {
  const maxAbs = Math.max(...barData.map(Math.abs))
  return (
    <div style={{ padding: '16px 18px 20px' }}>
      <div style={{ fontFamily: 'var(--mono)', fontSize: 8, letterSpacing: '.2em', color: 'rgba(32,216,236,.38)', marginBottom: 12 }}>{barLabel}</div>
      <div style={{ display: 'flex', alignItems: 'flex-end', gap: 4, height: 72, position: 'relative' }}>
        {barData.map((v, i) => {
          const pct = (Math.abs(v) / maxAbs) * 45
          const pos = v >= 0
          return (
            <div key={i} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', flex: 1, height: '100%', justifyContent: 'center', position: 'relative' }}>
              {pos ? (
                <>
                  <div style={{ background: 'linear-gradient(180deg,#4dffb4,rgba(77,255,180,.3))', borderRadius: '2px 2px 0 0', width: '100%', position: 'absolute', bottom: '50%', height: pct + '%' }} />
                  <div style={{ fontFamily: 'var(--mono)', fontSize: 7, color: 'rgba(125,188,200,.55)', position: 'absolute', bottom: `calc(50% + ${pct}% + 3px)`, letterSpacing: '.04em' }}>+{v.toFixed(1)}%</div>
                </>
              ) : (
                <>
                  <div style={{ background: 'linear-gradient(0deg,#ff5c7a,rgba(255,92,122,.3))', borderRadius: '0 0 2px 2px', width: '100%', position: 'absolute', top: '50%', height: pct + '%' }} />
                  <div style={{ fontFamily: 'var(--mono)', fontSize: 7, color: 'rgba(125,188,200,.55)', position: 'absolute', top: `calc(50% + ${pct}% + 3px)`, letterSpacing: '.04em' }}>{v.toFixed(1)}%</div>
                </>
              )}
              <div style={{ position: 'absolute', top: '50%', left: 0, right: 0, height: 1, background: 'rgba(32,216,236,.18)' }} />
              <div style={{ fontFamily: 'var(--mono)', fontSize: 6, color: 'rgba(125,188,200,.55)', position: 'absolute', bottom: -14, letterSpacing: '.04em', whiteSpace: 'nowrap' }}>{barLabels[i] || ''}</div>
            </div>
          )
        })}
      </div>
    </div>
  )
}

// ── Main component ────────────────────────────────────────────
export default function Performance({ onBack }) {
  const [view, setView] = useState('week')
  const cfg = VIEWS[view]

  const portPos = cfg.portReturn.startsWith('+')

  return (
    <div style={{ height: '100%', overflowY: 'auto', background: '#000', color: 'rgba(199,236,244,.92)', fontFamily: "'Saira Condensed',sans-serif" }}>

      {/* TOP BAR */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '13px 18px 11px', borderBottom: '1px solid rgba(32,216,236,.18)', position: 'sticky', top: 0, background: 'rgba(0,0,0,.95)', backdropFilter: 'blur(12px)', zIndex: 5 }}>
        <div style={{ display: 'flex', alignItems: 'center' }}>
          <span onClick={onBack} style={{ color: '#20d8ec', fontSize: 16, marginRight: 10, cursor: 'pointer' }}>←</span>
          <span style={{ fontFamily: 'var(--display)', fontSize: 13, fontWeight: 700, letterSpacing: '.28em', color: '#7df0ff' }}>PERFORMANCE</span>
          <span style={{ width: 6, height: 6, borderRadius: '50%', background: '#4dffb4', boxShadow: '0 0 6px #4dffb4', display: 'inline-block', marginLeft: 8, verticalAlign: 'middle' }} />
        </div>
        <span style={{ fontFamily: 'var(--mono)', fontSize: 8, color: 'rgba(32,216,236,.38)', letterSpacing: '.12em' }}>vs SPY</span>
      </div>

      {/* TABS */}
      <div style={{ display: 'flex', borderBottom: '1px solid rgba(32,216,236,.18)', padding: '0 20px' }}>
        {[['WEEK', 'week'], ['MONTH', 'month'], ['YEAR', 'year']].map(([lbl, key]) => (
          <div key={key} onClick={() => setView(key)} style={{ fontFamily: 'var(--mono)', fontSize: 9, letterSpacing: '.2em', padding: '10px 18px 9px', cursor: 'pointer', color: view === key ? '#7df0ff' : 'rgba(32,216,236,.38)', borderBottom: `2px solid ${view === key ? '#7df0ff' : 'transparent'}`, marginBottom: -1, transition: 'color .15s' }}>
            {lbl}
          </div>
        ))}
      </div>

      {/* HERO NUMBERS */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', borderBottom: '1px solid rgba(32,216,236,.18)' }}>
        <div style={{ padding: '16px 20px', borderRight: '1px solid rgba(32,216,236,.18)' }}>
          <div style={{ fontFamily: 'var(--mono)', fontSize: 8, letterSpacing: '.18em', color: 'rgba(32,216,236,.38)', marginBottom: 5 }}>PORTFOLIO RETURN</div>
          <div style={{ fontFamily: 'var(--display)', fontSize: 34, fontWeight: 700, letterSpacing: '.03em', lineHeight: 1, background: portPos ? 'linear-gradient(135deg,#fff,#4dffb4)' : 'linear-gradient(135deg,#fff,#ff5c7a)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent' }}>
            {cfg.portReturn}
          </div>
          <div style={{ fontFamily: 'var(--mono)', fontSize: 8, color: 'rgba(125,188,200,.55)', letterSpacing: '.1em', marginTop: 4 }}>{cfg.portAbs}</div>
          <div style={{ display: 'inline-block', fontFamily: 'var(--mono)', fontSize: 8, letterSpacing: '.12em', padding: '2px 7px', border: '1px solid rgba(77,255,180,.35)', color: '#4dffb4', background: 'rgba(77,255,180,.06)', marginTop: 6 }}>{cfg.alphaTxt}</div>
        </div>
        <div style={{ padding: '16px 20px' }}>
          <div style={{ fontFamily: 'var(--mono)', fontSize: 8, letterSpacing: '.18em', color: 'rgba(32,216,236,.38)', marginBottom: 5 }}>S&P 500 (SPY)</div>
          <div style={{ fontFamily: 'var(--display)', fontSize: 28, fontWeight: 700, letterSpacing: '.03em', lineHeight: 1, color: 'rgba(255,255,255,.55)' }}>{cfg.spyReturn}</div>
          <div style={{ fontFamily: 'var(--mono)', fontSize: 8, color: 'rgba(125,188,200,.55)', letterSpacing: '.1em', marginTop: 4 }}>{cfg.date}</div>
        </div>
      </div>

      {/* CHART */}
      <EquityChart view={view} />

      {/* STATS GRID */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 1, background: 'rgba(32,216,236,.18)', borderBottom: '1px solid rgba(32,216,236,.18)' }}>
        {[
          ['SHARPE', cfg.stats.sharpe, 'neu'],
          ['WIN RATE', cfg.stats.winrate, 'neu'],
          ['ALPHA', cfg.stats.alpha, 'pos'],
          ['BEST WEEK', cfg.stats.best, 'pos'],
          ['WORST WEEK', cfg.stats.worst, 'neg'],
          ['MAX DD', cfg.stats.mdd, 'neg'],
        ].map(([lbl, val, cls]) => (
          <div key={lbl} style={{ background: '#000', padding: '13px 14px', textAlign: 'center' }}>
            <div style={{ fontFamily: 'var(--mono)', fontSize: 7, letterSpacing: '.16em', color: 'rgba(32,216,236,.38)', marginBottom: 5 }}>{lbl}</div>
            <div style={{ fontFamily: 'var(--display)', fontSize: 20, fontWeight: 600, letterSpacing: '.04em', color: cls === 'pos' ? '#4dffb4' : cls === 'neg' ? '#ff5c7a' : '#7df0ff' }}>{val}</div>
          </div>
        ))}
      </div>

      {/* BAR CHART */}
      <BarChart barData={cfg.barData} barLabels={cfg.barLabels} barLabel={cfg.barLabel} />
    </div>
  )
}
