import { useState, useEffect, useRef } from 'react'
import { getFinanceSummary, postJarvisChat, postFinanceRefreshPrices } from '../../api/client'

// ── Static prototype data ──────────────────────────────────────
const ALLOC = [
  { label: 'TECH',   pct: 45, color: '#7df0ff' },
  { label: 'FIN',    pct: 22, color: '#20d8ec' },
  { label: 'ENERGY', pct: 18, color: '#0e8a98' },
  { label: 'OTHER',  pct: 15, color: 'rgba(32,216,236,.3)' },
]

const MOVERS = [
  { t: 'AAPL', n: 'Apple Inc.',   d:  3.2, v: 28400 },
  { t: 'NVDA', n: 'NVIDIA Corp.', d: -1.8, v: 19200 },
  { t: 'MSFT', n: 'Microsoft',    d:  0.9, v: 16800 },
]

const DELTAS = {
  day:   { pct: 1.8,  abs: 2540.20, pos: true  },
  week:  { pct: 4.2,  abs: 5840.50, pos: true  },
  month: { pct: 2.1,  abs: 3060.80, pos: false },
}

const BRIEF_TEXT = 'Portfolio up 1.8% on the session, outperforming SPY by 0.6%. NVDA under pressure ahead of earnings — consider trimming 15% before the print. AAPL momentum intact, target maintained. Cash at 8.2%, within allocation bounds.'

// ── Donut path algorithm ───────────────────────────────────────
function donutPath(cx, cy, r, ri, s0, s1) {
  const rad = d => (d - 90) * Math.PI / 180
  const a = rad(s0), b = rad(s1), la = (s1 - s0 > 180) ? 1 : 0
  const f = n => n.toFixed(2)
  return `M${f(cx + r * Math.cos(a))},${f(cy + r * Math.sin(a))} A${r},${r} 0 ${la},1 ${f(cx + r * Math.cos(b))},${f(cy + r * Math.sin(b))} L${f(cx + ri * Math.cos(b))},${f(cy + ri * Math.sin(b))} A${ri},${ri} 0 ${la},0 ${f(cx + ri * Math.cos(a))},${f(cy + ri * Math.sin(a))}Z`
}

function buildDonutSegments() {
  let cur = 0
  return ALLOC.map((a) => {
    const s = cur, e = cur + a.pct * 3.6
    cur = e
    return { ...a, d: donutPath(64, 64, 52, 34, s, e - 0.8) }
  })
}

// ── Sparkline ─────────────────────────────────────────────────
function SparklineSvg({ up }) {
  const p = up
    ? [10, 28, 22, 18, 32, 14, 20, 8, 26, 12, 6, 16, 4]
    : [8, 14, 20, 12, 26, 18, 30, 22, 28, 32, 26, 36, 30]
  const w = 56, h = 20
  const mn = Math.min(...p), mx = Math.max(...p)
  const spx = i => (i / (p.length - 1)) * w
  const spy = v => h - ((v - mn) / (mx - mn)) * h
  const pts = p.map((v, i) => `${spx(i).toFixed(1)},${spy(v).toFixed(1)}`).join(' ')
  return (
    <svg width={w} height={h} viewBox={`0 0 ${w} ${h}`}>
      <polyline points={pts} fill="none" stroke={up ? '#4dffb4' : '#ff5c7a'} strokeWidth="1.5" strokeLinejoin="round" />
    </svg>
  )
}

// ── Donut chart ───────────────────────────────────────────────
function DonutChart() {
  const [hovered, setHovered] = useState(null)
  const segments = buildDonutSegments()
  const label = hovered !== null ? ALLOC[hovered].pct + '%' : 'PORT'
  const sub = hovered !== null ? ALLOC[hovered].label : 'ALLOC'
  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 10 }}>
      <svg width="128" height="128" viewBox="0 0 128 128">
        {segments.map((seg, i) => (
          <path
            key={seg.label}
            d={seg.d}
            fill={seg.color}
            style={{ cursor: 'pointer', transition: 'opacity .2s', opacity: hovered !== null && hovered !== i ? 0.2 : 1 }}
            onMouseEnter={() => setHovered(i)}
            onMouseLeave={() => setHovered(null)}
          />
        ))}
        <circle cx="64" cy="64" r="55" fill="none" stroke="rgba(32,216,236,.1)" strokeWidth="1" />
        <circle cx="64" cy="64" r="32" fill="rgba(0,0,0,.75)" />
        <circle cx="64" cy="64" r="32" fill="none" stroke="rgba(32,216,236,.1)" strokeWidth="1" />
        <text x="64" y="61" textAnchor="middle" fontFamily="'Share Tech Mono',monospace" fontSize={hovered !== null ? '12' : '8'} fill="#7df0ff" letterSpacing="1">{label}</text>
        <text x="64" y="73" textAnchor="middle" fontFamily="'Share Tech Mono',monospace" fontSize="7" fill="rgba(32,216,236,.38)" letterSpacing="1">{sub}</text>
      </svg>
      <div style={{ width: '100%', display: 'flex', flexDirection: 'column', gap: 5 }}>
        {ALLOC.map(a => (
          <div key={a.label} style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
            <div style={{ width: 6, height: 6, borderRadius: 1, background: a.color, flexShrink: 0 }} />
            <span style={{ fontFamily: 'var(--mono)', fontSize: 7, color: 'rgba(125,188,200,.55)', letterSpacing: '.08em', flex: 1 }}>{a.label}</span>
            <span style={{ fontFamily: 'var(--mono)', fontSize: 9, color: 'rgba(199,236,244,.92)' }}>{a.pct}%</span>
          </div>
        ))}
      </div>
    </div>
  )
}

// ── Typewriter ────────────────────────────────────────────────
function useTypewriter(text, speed = 20) {
  const [displayed, setDisplayed] = useState('')
  const [done, setDone] = useState(false)
  useEffect(() => {
    setDisplayed('')
    setDone(false)
    let i = 0
    const tick = setInterval(() => {
      if (i <= text.length) { setDisplayed(text.slice(0, i)); i++ }
      else { setDone(true); clearInterval(tick) }
    }, speed)
    return () => clearInterval(tick)
  }, [text, speed])
  return { displayed, done }
}

// ── Main component ────────────────────────────────────────────
export default function FinanceDashboard({ onNav, onQuickAsk }) {
  const [tab, setTab] = useState('day')
  const [summary, setSummary] = useState(null)
  const [refreshing, setRefreshing] = useState(false)
  const [refreshMsg, setRefreshMsg] = useState('')
  const { displayed: briefText, done: briefDone } = useTypewriter(BRIEF_TEXT, 18)

  useEffect(() => {
    getFinanceSummary().then(setSummary).catch(() => {})
  }, [])

  async function handleRefresh() {
    setRefreshing(true)
    setRefreshMsg('')
    try {
      const r = await postFinanceRefreshPrices()
      const n = r.holdings_updated?.length ?? 0
      const f = r.failed?.length ?? 0
      setRefreshMsg(f > 0 ? `${n} updated · ${f} failed` : `${n} updated`)
      getFinanceSummary().then(setSummary).catch(() => {})
    } catch {
      setRefreshMsg('Refresh failed')
    } finally {
      setRefreshing(false)
    }
  }

  const delta = DELTAS[tab]
  const totalVal = summary?.total_invested ?? 142840.50

  return (
    <div style={{ height: '100%', overflowY: 'auto', background: '#000', color: 'rgba(199,236,244,.92)', fontFamily: "'Saira Condensed',sans-serif" }}>

      {/* TOP BAR */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '13px 18px 11px', borderBottom: '1px solid rgba(32,216,236,.18)', position: 'sticky', top: 0, background: 'rgba(0,0,0,.96)', backdropFilter: 'blur(12px)', zIndex: 5 }}>
        <div style={{ display: 'flex', alignItems: 'center' }}>
          <span style={{ fontFamily: 'var(--display)', fontSize: 13, fontWeight: 700, letterSpacing: '.28em', color: '#7df0ff' }}>FINANCE</span>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          {refreshMsg && <span style={{ fontFamily: 'var(--mono)', fontSize: 8, color: '#4dffb4', letterSpacing: '.1em' }}>{refreshMsg}</span>}
          <button onClick={handleRefresh} disabled={refreshing} style={{ background: 'none', border: 'none', cursor: 'pointer', fontFamily: 'var(--mono)', fontSize: 8, color: 'rgba(32,216,236,.38)', letterSpacing: '.14em', padding: 0 }}>
            {refreshing ? '⟳' : '↻'}
          </button>
          <span style={{ fontFamily: 'var(--mono)', fontSize: 8, color: 'rgba(32,216,236,.38)', letterSpacing: '.14em' }}>
            {summary?.as_of ? `UPDATED ${summary.as_of.slice(-5)} · LIVE` : 'UPDATED 16:43 · LIVE'}
          </span>
        </div>
      </div>

      {/* HERO */}
      <div style={{ padding: '22px 20px 16px', borderBottom: '1px solid rgba(32,216,236,.18)' }}>
        <div style={{ fontFamily: 'var(--mono)', fontSize: 8, letterSpacing: '.22em', color: 'rgba(32,216,236,.38)', marginBottom: 5 }}>TOTAL PORTFOLIO VALUE</div>
        <div style={{ fontFamily: 'var(--display)', fontSize: 40, fontWeight: 700, lineHeight: 1.05, background: 'linear-gradient(155deg,#fff 0%,#7df0ff 42%,#20d8ec 100%)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent', filter: 'drop-shadow(0 0 18px rgba(32,216,236,.5))' }}>
          ${totalVal.toLocaleString('en-US', { minimumFractionDigits: 2 })}
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginTop: 9 }}>
          <span style={{ fontFamily: 'var(--mono)', fontSize: 11, letterSpacing: '.08em', padding: '3px 8px', color: delta.pos ? '#4dffb4' : '#ff5c7a', border: `1px solid ${delta.pos ? 'rgba(77,255,180,.35)' : 'rgba(255,92,122,.35)'}`, background: delta.pos ? 'rgba(77,255,180,.06)' : 'rgba(255,92,122,.06)' }}>
            {delta.pos ? '▲ +' : '▼ −'}{Math.abs(delta.pct).toFixed(1)}%
          </span>
          <span style={{ fontFamily: "'Saira Condensed',sans-serif", fontSize: 13, fontWeight: 300, color: 'rgba(125,188,200,.55)' }}>
            {delta.pos ? '+' : '−'}${delta.abs.toLocaleString('en-US', { minimumFractionDigits: 2 })} today
          </span>
        </div>
      </div>

      {/* TABS */}
      <div style={{ display: 'flex', borderBottom: '1px solid rgba(32,216,236,.18)', padding: '0 20px' }}>
        {[['DAY', 'day'], ['WEEK', 'week'], ['MONTH', 'month']].map(([lbl, key]) => (
          <div key={key} onClick={() => setTab(key)} style={{ fontFamily: 'var(--mono)', fontSize: 9, letterSpacing: '.2em', padding: '10px 16px 9px', cursor: 'pointer', color: tab === key ? '#7df0ff' : 'rgba(32,216,236,.38)', borderBottom: `2px solid ${tab === key ? '#7df0ff' : 'transparent'}`, marginBottom: -1, transition: 'color .2s' }}>
            {lbl}
          </div>
        ))}
      </div>

      {/* TWO COL: Donut + Movers */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', borderBottom: '1px solid rgba(32,216,236,.18)' }}>
        {/* Donut */}
        <div style={{ background: 'rgba(0,0,0,.88)', padding: '14px 12px' }}>
          <div style={{ fontFamily: 'var(--mono)', fontSize: 9, letterSpacing: '.2em', color: 'rgba(32,216,236,.38)', marginBottom: 10 }}>ALLOCATION</div>
          <DonutChart />
        </div>

        {/* Movers */}
        <div style={{ background: 'rgba(0,0,0,.88)', borderLeft: '1px solid rgba(32,216,236,.18)', padding: '14px 11px' }}>
          <div style={{ fontFamily: 'var(--mono)', fontSize: 9, letterSpacing: '.2em', color: 'rgba(32,216,236,.38)', marginBottom: 10 }}>TOP MOVERS</div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {MOVERS.map(m => {
              const pos = m.d >= 0
              return (
                <div key={m.t} style={{ padding: '9px 10px', border: '1px solid rgba(32,216,236,.18)', background: 'rgba(32,216,236,.025)', position: 'relative' }}>
                  <div style={{ position: 'absolute', top: 0, left: 0, width: 8, height: 8, borderTop: '1px solid rgba(32,216,236,.55)', borderLeft: '1px solid rgba(32,216,236,.55)' }} />
                  <div style={{ position: 'absolute', bottom: 0, right: 0, width: 8, height: 8, borderBottom: '1px solid rgba(32,216,236,.55)', borderRight: '1px solid rgba(32,216,236,.55)' }} />
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                    <div>
                      <div style={{ fontFamily: 'var(--display)', fontSize: 15, fontWeight: 600, letterSpacing: '.05em', color: '#7df0ff' }}>{m.t}</div>
                      <div style={{ fontFamily: "'Saira Condensed',sans-serif", fontSize: 10, fontWeight: 300, color: 'rgba(125,188,200,.55)' }}>{m.n}</div>
                    </div>
                    <span style={{ fontFamily: 'var(--mono)', fontSize: 11, color: pos ? '#4dffb4' : '#ff5c7a' }}>
                      {pos ? '▲' : '▼'} {Math.abs(m.d).toFixed(1)}%
                    </span>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 6 }}>
                    <span style={{ fontFamily: 'var(--mono)', fontSize: 8, color: 'rgba(32,216,236,.38)' }}>${m.v.toLocaleString()}</span>
                    <SparklineSvg up={pos} />
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      </div>

      {/* JARVIS BRIEF */}
      <div style={{ padding: '16px 18px 18px' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 11 }}>
          <span style={{ fontFamily: 'var(--mono)', fontSize: 8, letterSpacing: '.22em', color: 'rgba(32,216,236,.38)' }}>JARVIS BRIEF</span>
          <span style={{ fontFamily: 'var(--mono)', fontSize: 7, letterSpacing: '.14em', color: '#20d8ec', border: '1px solid rgba(32,216,236,.28)', padding: '2px 7px' }}>REQUIRES APPROVAL</span>
        </div>
        <div style={{ background: 'rgba(0,0,0,.88)', border: '1px solid rgba(32,216,236,.18)', borderLeft: '3px solid #20d8ec', padding: '13px 14px' }}>
          <div style={{ fontFamily: "'Saira Condensed',sans-serif", fontSize: 13, fontWeight: 300, lineHeight: 1.75, color: 'rgba(199,236,244,.85)' }}>
            {briefText}
            {!briefDone && (
              <span style={{ display: 'inline-block', width: 7, height: 13, background: '#20d8ec', marginLeft: 2, verticalAlign: 'middle', animation: 'blink 1s step-end infinite' }} />
            )}
          </div>
        </div>
        <div
          onClick={() => onNav('brief')}
          style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 13, cursor: 'pointer', fontFamily: 'var(--mono)', fontSize: 8, letterSpacing: '.2em', color: '#20d8ec' }}
        >
          VIEW FULL BRIEF <span style={{ color: '#7df0ff' }}>→</span>
        </div>
      </div>

      {/* NAV BUTTONS */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, padding: '0 16px 24px' }}>
        {[['HOLDINGS', 'holdings'], ['PERFORMANCE', 'performance'], ['HISTORY', 'history'], ['BUDGET', 'budget']].map(([lbl, screen]) => (
          <button key={screen} onClick={() => onNav(screen)} className="action" style={{ padding: '13px 0', fontSize: 10, letterSpacing: '.14em' }}>
            {lbl}
          </button>
        ))}
      </div>
    </div>
  )
}
