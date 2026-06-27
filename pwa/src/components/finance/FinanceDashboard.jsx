import { useState, useEffect } from 'react'
import { getFinanceSummary, getFinanceBrief, getFinanceRecommendation, postFinanceRefreshPrices } from '../../api/client'

const SLEEVE_COLORS = ['#7df0ff', '#20d8ec', '#0e8a98', '#4dffb4', 'rgba(32,216,236,.5)', '#ffd56b', '#9f7dff']

// ── Donut path algorithm ───────────────────────────────────────
function donutPath(cx, cy, r, ri, s0, s1) {
  const rad = d => (d - 90) * Math.PI / 180
  const a = rad(s0), b = rad(s1), la = (s1 - s0 > 180) ? 1 : 0
  const f = n => n.toFixed(2)
  return `M${f(cx + r * Math.cos(a))},${f(cy + r * Math.sin(a))} A${r},${r} 0 ${la},1 ${f(cx + r * Math.cos(b))},${f(cy + r * Math.sin(b))} L${f(cx + ri * Math.cos(b))},${f(cy + ri * Math.sin(b))} A${ri},${ri} 0 ${la},0 ${f(cx + ri * Math.cos(a))},${f(cy + ri * Math.sin(a))}Z`
}

function buildDonutSegments(alloc) {
  let cur = 0
  return alloc.map((a) => {
    const s = cur, e = cur + a.pct * 3.6
    cur = e
    return { ...a, d: donutPath(64, 64, 52, 34, s, Math.max(s + 0.1, e - 0.8)) }
  })
}

// ── Donut chart ───────────────────────────────────────────────
function DonutChart({ alloc }) {
  const [hovered, setHovered] = useState(null)
  if (!alloc.length) return <div style={{ fontFamily: 'var(--mono)', fontSize: 9, color: 'rgba(32,216,236,.38)' }}>Loading…</div>
  const segments = buildDonutSegments(alloc)
  const label = hovered !== null ? alloc[hovered].pct.toFixed(1) + '%' : 'PORT'
  const sub = hovered !== null ? alloc[hovered].label : 'ALLOC'
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
        <text x="64" y="61" textAnchor="middle" fontFamily="'Share Tech Mono',monospace" fontSize={hovered !== null ? '11' : '8'} fill="#7df0ff" letterSpacing="1">{label}</text>
        <text x="64" y="73" textAnchor="middle" fontFamily="'Share Tech Mono',monospace" fontSize="7" fill="rgba(32,216,236,.38)" letterSpacing="1">{sub}</text>
      </svg>
      <div style={{ width: '100%', display: 'flex', flexDirection: 'column', gap: 5 }}>
        {alloc.map(a => (
          <div key={a.label} style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
            <div style={{ width: 6, height: 6, borderRadius: 1, background: a.color, flexShrink: 0 }} />
            <span style={{ fontFamily: 'var(--mono)', fontSize: 7, color: 'rgba(125,188,200,.55)', letterSpacing: '.08em', flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{a.label}</span>
            <span style={{ fontFamily: 'var(--mono)', fontSize: 9, color: 'rgba(199,236,244,.92)', flexShrink: 0 }}>{a.pct.toFixed(1)}%</span>
          </div>
        ))}
      </div>
    </div>
  )
}

// ── Markdown renderer (strips headings, renders bold) ─────────
function renderMarkdown(text) {
  return text.split('\n').map((line, li) => {
    const stripped = line.replace(/^#{1,3}\s*/, '')
    const parts = stripped.split(/\*\*/).map((part, i) =>
      i % 2 === 1 ? <strong key={i}>{part}</strong> : part
    )
    return <div key={li}>{parts}</div>
  })
}

// ── Typewriter ────────────────────────────────────────────────
function useTypewriter(text, speed = 20) {
  const [displayed, setDisplayed] = useState('')
  const [done, setDone] = useState(false)
  useEffect(() => {
    setDisplayed('')
    setDone(false)
    if (!text) { setDone(true); return }
    let i = 0
    const tick = setInterval(() => {
      if (i <= text.length) { setDisplayed(text.slice(0, i)); i++ }
      else { setDone(true); clearInterval(tick) }
    }, speed)
    return () => clearInterval(tick)
  }, [text, speed])
  return { displayed, done }
}

function bandColor(status) {
  if (!status) return 'rgba(32,216,236,.38)'
  if (status.includes('ABOVE')) return '#ff5c7a'
  if (status.includes('BELOW')) return '#ffd56b'
  return '#4dffb4'
}

// ── Main component ────────────────────────────────────────────
const _BRIEF_ERROR_STRINGS = [
  'Unable to generate brief',
  'Raw recommendation available',
  'Backend unreachable',
]

function _isBriefError(text) {
  return !text || _BRIEF_ERROR_STRINGS.some(s => text.includes(s))
}

function _recSummaryText(rec) {
  if (!rec) return ''
  const recs = Array.isArray(rec.recommendations) ? rec.recommendations : []
  const recLine = recs.length
    ? recs.map(r => `${String(r.asset).toUpperCase()} €${Number(r.amount).toFixed(2)}`).join(' + ')
    : 'No buys recommended this week.'
  const status = rec.brief_status ? rec.brief_status.toUpperCase() : 'PENDING APPROVAL'
  return [
    rec.week_label ? `Week ${rec.week_label} · Budget €${Number(rec.week_budget ?? 0).toFixed(2)}` : '',
    recLine,
    `Approval: ${status}`,
    'No trades executed. Manual approval required.',
  ].filter(Boolean).join('\n')
}

export default function FinanceDashboard({ onNav, onQuickAsk }) {
  const [summary, setSummary] = useState(null)
  const [summaryError, setSummaryError] = useState(false)
  const [rawBrief, setRawBrief] = useState('')
  const [rec, setRec] = useState(null)
  const [refreshing, setRefreshing] = useState(false)
  const [refreshMsg, setRefreshMsg] = useState('')

  const briefToDisplay = _isBriefError(rawBrief) ? _recSummaryText(rec) : rawBrief
  const { displayed: briefText, done: briefDone } = useTypewriter(briefToDisplay, 18)

  useEffect(() => {
    getFinanceSummary()
      .then(setSummary)
      .catch(() => setSummaryError(true))
    getFinanceBrief()
      .then(r => setRawBrief(r.brief || ''))
      .catch(() => setRawBrief(''))
    getFinanceRecommendation()
      .then(setRec)
      .catch(() => {})
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

  const sleeves = summary?.sleeve_summary ?? []
  const alloc = sleeves.map((s, i) => ({
    label: s.name.replace(/_/g, ' ').toUpperCase(),
    pct: s.current_weight * 100,
    color: SLEEVE_COLORS[i % SLEEVE_COLORS.length],
  }))
  const topSleeves = [...sleeves].sort((a, b) => b.value - a.value).slice(0, 3)
  const totalVal = summary?.total_invested ?? null

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
            {summary?.as_of ? `UPDATED ${summary.as_of.slice(11, 16)} · LIVE` : 'LOADING…'}
          </span>
        </div>
      </div>

      {/* HERO */}
      <div style={{ padding: '22px 20px 16px', borderBottom: '1px solid rgba(32,216,236,.18)' }}>
        <div style={{ fontFamily: 'var(--mono)', fontSize: 8, letterSpacing: '.22em', color: 'rgba(32,216,236,.38)', marginBottom: 5 }}>TOTAL PORTFOLIO VALUE</div>
        {summaryError ? (
          <div style={{ fontFamily: 'var(--mono)', fontSize: 11, color: '#ff6d7a', letterSpacing: '.08em', lineHeight: 1.6 }}>
            BACKEND UNREACHABLE<br />
            <span style={{ fontSize: 9, color: 'rgba(255,109,122,.6)' }}>Set VITE_API_URL in Vercel → redeploy</span>
          </div>
        ) : totalVal !== null ? (
          <div style={{ fontFamily: 'var(--display)', fontSize: 40, fontWeight: 700, lineHeight: 1.05, background: 'linear-gradient(155deg,#fff 0%,#7df0ff 42%,#20d8ec 100%)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent', filter: 'drop-shadow(0 0 18px rgba(32,216,236,.5))' }}>
            €{totalVal.toLocaleString('en-US', { minimumFractionDigits: 2 })}
          </div>
        ) : (
          <div style={{ fontFamily: 'var(--mono)', fontSize: 24, color: 'rgba(32,216,236,.38)' }}>Loading…</div>
        )}
        {summary?.staleness_warning && (
          <div style={{ fontFamily: 'var(--mono)', fontSize: 8, color: '#ffd56b', letterSpacing: '.1em', marginTop: 8 }}>
            ⚠ {summary.staleness_warning}
          </div>
        )}
      </div>

      {/* TWO COL: Donut + Sleeves */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', borderBottom: '1px solid rgba(32,216,236,.18)' }}>
        {/* Donut */}
        <div style={{ background: 'rgba(0,0,0,.88)', padding: '14px 12px' }}>
          <div style={{ fontFamily: 'var(--mono)', fontSize: 9, letterSpacing: '.2em', color: 'rgba(32,216,236,.38)', marginBottom: 10 }}>ALLOCATION</div>
          <DonutChart alloc={alloc} />
        </div>

        {/* Sleeves */}
        <div style={{ background: 'rgba(0,0,0,.88)', borderLeft: '1px solid rgba(32,216,236,.18)', padding: '14px 11px' }}>
          <div style={{ fontFamily: 'var(--mono)', fontSize: 9, letterSpacing: '.2em', color: 'rgba(32,216,236,.38)', marginBottom: 10 }}>TOP SLEEVES</div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {topSleeves.length > 0 ? topSleeves.map((s, i) => {
              const bc = bandColor(s.band_status)
              const label = s.name.replace(/_/g, ' ').toUpperCase()
              const shortLabel = label.split(' ').map(w => w[0]).join('').slice(0, 5)
              return (
                <div key={s.name} style={{ padding: '9px 10px', border: '1px solid rgba(32,216,236,.18)', background: 'rgba(32,216,236,.025)', position: 'relative' }}>
                  <div style={{ position: 'absolute', top: 0, left: 0, width: 8, height: 8, borderTop: '1px solid rgba(32,216,236,.55)', borderLeft: '1px solid rgba(32,216,236,.55)' }} />
                  <div style={{ position: 'absolute', bottom: 0, right: 0, width: 8, height: 8, borderBottom: '1px solid rgba(32,216,236,.55)', borderRight: '1px solid rgba(32,216,236,.55)' }} />
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                    <div>
                      <div style={{ fontFamily: 'var(--display)', fontSize: 15, fontWeight: 600, letterSpacing: '.05em', color: SLEEVE_COLORS[i] }}>{shortLabel}</div>
                      <div style={{ fontFamily: "'Saira Condensed',sans-serif", fontSize: 9, fontWeight: 300, color: 'rgba(125,188,200,.55)', lineHeight: 1.2 }}>{label}</div>
                    </div>
                    <span style={{ fontFamily: 'var(--mono)', fontSize: 8, color: bc, textAlign: 'right', maxWidth: 60 }}>
                      {(s.band_status || 'ON TARGET').replace(/_/g, ' ')}
                    </span>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 5 }}>
                    <span style={{ fontFamily: 'var(--mono)', fontSize: 8, color: 'rgba(32,216,236,.38)' }}>
                      €{(s.value ?? 0).toLocaleString('en-US', { maximumFractionDigits: 0 })}
                    </span>
                    <span style={{ fontFamily: 'var(--mono)', fontSize: 8, color: 'rgba(32,216,236,.38)' }}>
                      {(s.current_weight * 100).toFixed(1)}% / {(s.target_weight * 100).toFixed(1)}%
                    </span>
                  </div>
                </div>
              )
            }) : [0,1,2].map(i => (
              <div key={i} style={{ height: 68, border: '1px solid rgba(32,216,236,.08)', background: 'rgba(32,216,236,.01)' }} />
            ))}
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
            {briefText ? renderMarkdown(briefText) : <span style={{ color: 'rgba(32,216,236,.38)' }}>Loading brief…</span>}
            {!briefDone && briefText && (
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
        {[['HOLDINGS', 'holdings'], ['PERFORMANCE', 'performance'], ['HISTORY', 'history'], ['BUDGET', 'budget'], ['RESEARCH', 'research']].map(([lbl, screen]) => (
          <button key={screen} onClick={() => onNav(screen)} className="action" style={{ padding: '13px 0', fontSize: 10, letterSpacing: '.14em', gridColumn: screen === 'research' ? '1 / -1' : 'auto' }}>
            {lbl}
          </button>
        ))}
      </div>
    </div>
  )
}
