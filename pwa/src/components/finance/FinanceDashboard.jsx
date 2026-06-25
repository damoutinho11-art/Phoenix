import { useState, useEffect } from 'react'
import { getFinanceSummary, postJarvisChat, postFinanceRefreshPrices } from '../../api/client'

const CYAN = '#20d8ec'

const LABEL_MAP = {
  global_core_etf: 'Global Core ETF',
  growth_nasdaq_etf: 'Growth Nasdaq ETF',
  quality_etf: 'Quality ETF',
  btc: 'Bitcoin',
  hype: 'Hyperliquid',
  tao: 'Bittensor',
  discovery: 'Discovery',
  tactical_reserve: 'Tactical Reserve',
}

function statusColor(s) {
  if (s === 'within_band') return '#9dff6f'
  if (s === 'below_min') return '#ffb347'
  return '#ff6b6b'
}

function SleeveBar({ sleeve }) {
  const current = sleeve.current_weight * 100
  const target = sleeve.target_weight * 100
  const color = statusColor(sleeve.band_status)
  return (
    <div style={{ marginBottom: 10 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 3 }}>
        <span style={{ fontSize: 11, color: '#888', fontFamily: "'Share Tech Mono', monospace" }}>
          {LABEL_MAP[sleeve.name] || sleeve.name}
        </span>
        <span style={{ fontSize: 11, color, fontFamily: "'Share Tech Mono', monospace" }}>
          {current.toFixed(1)}% / {target.toFixed(1)}%
        </span>
      </div>
      <div style={{ height: 5, background: '#1a1a1a', borderRadius: 3, position: 'relative' }}>
        <div style={{
          position: 'absolute',
          left: `${Math.min(target, 100)}%`,
          top: -2, width: 1, height: 9,
          background: '#444', transform: 'translateX(-50%)',
        }} />
        <div style={{
          width: `${Math.min(current, 100)}%`,
          height: '100%', background: color, borderRadius: 3,
        }} />
      </div>
    </div>
  )
}

export default function FinanceDashboard({ onNav, onQuickAsk }) {
  const [summary, setSummary] = useState(null)
  const [jarvisText, setJarvisText] = useState('')
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [refreshMsg, setRefreshMsg] = useState('')

  function loadSummary() {
    setLoading(true)
    getFinanceSummary()
      .then(s => {
        setSummary(s)
        setLoading(false)
        postJarvisChat({ domain: 'finance', message: 'Give me a one-sentence portfolio status' })
          .then(r => setJarvisText(r.response))
          .catch(() => setJarvisText('Unable to load JARVIS brief.'))
      })
      .catch(() => setLoading(false))
  }

  async function handleRefresh() {
    setRefreshing(true)
    setRefreshMsg('')
    try {
      const r = await postFinanceRefreshPrices()
      const n = r.holdings_updated?.length ?? 0
      const f = r.failed?.length ?? 0
      setRefreshMsg(f > 0 ? `${n} updated · ${f} failed` : `${n} holdings updated`)
      loadSummary()
    } catch {
      setRefreshMsg('Refresh failed')
    } finally {
      setRefreshing(false)
    }
  }

  useEffect(() => { loadSummary() }, []) // eslint-disable-line react-hooks/exhaustive-deps

  const totalLegacy = summary
    ? summary.sleeve_summary.reduce((acc, s) => {
        // legacy is implied from total minus active holdings
        return acc
      }, 0)
    : 0

  return (
    <div style={{ height: '100%', overflowY: 'auto', padding: 16, background: '#0a0a0a', color: '#fff' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
        <span style={{ fontFamily: "'Oswald', sans-serif", fontSize: 18, color: CYAN, letterSpacing: '0.1em' }}>
          PORTFOLIO
        </span>
        <span style={{ fontFamily: "'Share Tech Mono', monospace", fontSize: 11, color: '#555' }}>
          {summary?.as_of || '—'}
        </span>
      </div>

      {/* Hero total */}
      <div style={{ textAlign: 'center', marginBottom: 24 }}>
        <div style={{ fontFamily: "'Share Tech Mono', monospace", fontSize: 10, color: '#555', marginBottom: 4, letterSpacing: '0.15em' }}>
          TOTAL INVESTED
        </div>
        <div style={{ fontFamily: "'Oswald', sans-serif", fontSize: 52, color: '#fff', lineHeight: 1 }}>
          {loading ? '—' : `€${(summary?.total_invested ?? 0).toFixed(2)}`}
        </div>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 10, marginTop: 8 }}>
          <button
            onClick={handleRefresh}
            disabled={refreshing}
            style={{
              background: 'none', border: `1px solid ${refreshing ? '#333' : CYAN + '55'}`,
              borderRadius: 4, padding: '4px 10px', cursor: refreshing ? 'default' : 'pointer',
              color: refreshing ? '#444' : CYAN,
              fontFamily: "'Share Tech Mono', monospace", fontSize: 10,
              letterSpacing: '0.08em', transition: 'border-color 0.2s',
            }}
          >
            {refreshing ? '⟳ FETCHING…' : '↻ REFRESH PRICES'}
          </button>
          {refreshMsg && (
            <span style={{ fontFamily: "'Share Tech Mono', monospace", fontSize: 10, color: '#9dff6f' }}>
              {refreshMsg}
            </span>
          )}
        </div>
        {summary?.staleness_warning && (
          <div style={{ fontFamily: "'Share Tech Mono', monospace", fontSize: 10, color: '#ffb347', marginTop: 6 }}>
            ⚠ {summary.staleness_warning}
          </div>
        )}
      </div>

      {/* Sleeve allocation */}
      <div style={{ background: '#111', borderRadius: 8, padding: 14, marginBottom: 12 }}>
        <div style={{ fontFamily: "'Oswald', sans-serif", fontSize: 11, color: '#555', letterSpacing: '0.1em', marginBottom: 12 }}>
          SLEEVE ALLOCATION
        </div>
        {(summary?.sleeve_summary ?? []).map(s => (
          <SleeveBar key={s.name} sleeve={s} />
        ))}
        {loading && (
          <div style={{ fontFamily: "'Share Tech Mono', monospace", fontSize: 12, color: '#333', textAlign: 'center', padding: 8 }}>
            Loading…
          </div>
        )}
        <div style={{ display: 'flex', gap: 14, marginTop: 10 }}>
          {[['within_band', '#9dff6f', 'ON TARGET'], ['below_min', '#ffb347', 'BELOW MIN'], ['above_max', '#ff6b6b', 'ABOVE MAX']].map(([k, c, l]) => (
            <div key={k} style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
              <div style={{ width: 7, height: 7, borderRadius: '50%', background: c }} />
              <span style={{ fontSize: 9, color: '#555', fontFamily: "'Share Tech Mono', monospace" }}>{l}</span>
            </div>
          ))}
        </div>
      </div>

      {/* JARVIS brief */}
      <div style={{ background: '#111', borderRadius: 8, padding: 14, borderLeft: `3px solid ${CYAN}`, marginBottom: 12 }}>
        <div style={{ fontFamily: "'Oswald', sans-serif", fontSize: 11, color: CYAN, letterSpacing: '0.1em', marginBottom: 6 }}>
          JARVIS BRIEF
        </div>
        <div style={{ fontFamily: "'Share Tech Mono', monospace", fontSize: 12, color: jarvisText ? '#ccc' : '#444', lineHeight: 1.6 }}>
          {jarvisText || 'Analysing portfolio…'}
        </div>
      </div>

      {/* Quick nav */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
        {[['BRIEF', 'brief'], ['HOLDINGS', 'holdings'], ['PERFORMANCE', 'performance'], ['HISTORY', 'history']].map(([label, screen]) => (
          <button key={screen} onClick={() => onNav(screen)} style={{
            background: '#111', border: '1px solid #222', borderRadius: 6,
            padding: '13px 0', color: CYAN,
            fontFamily: "'Oswald', sans-serif", fontSize: 13, letterSpacing: '0.1em', cursor: 'pointer',
          }}>
            {label}
          </button>
        ))}
      </div>
    </div>
  )
}
