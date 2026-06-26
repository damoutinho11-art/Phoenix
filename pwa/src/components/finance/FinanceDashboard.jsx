import { useState, useEffect } from 'react'
import { getFinanceSummary, postJarvisChat, postFinanceRefreshPrices } from '../../api/client'

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
  if (s === 'within_band') return 'var(--green)'
  if (s === 'below_min') return 'var(--gold)'
  return 'var(--red)'
}

function statusVariant(s) {
  if (s === 'within_band') return 'safe'
  if (s === 'below_min') return 'warn'
  return 'danger'
}

function SleeveBar({ sleeve }) {
  const current = sleeve.current_weight * 100
  const target = sleeve.target_weight * 100
  const color = statusColor(sleeve.band_status)
  const pct = Math.min(current, 100)
  return (
    <div style={{ marginBottom: 12 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
        <span style={{ fontFamily: 'var(--mono)', fontSize: 9, color: 'var(--muted)', letterSpacing: '.06em' }}>
          {LABEL_MAP[sleeve.name] || sleeve.name}
        </span>
        <span style={{ fontFamily: 'var(--mono)', fontSize: 9, color }}>
          {current.toFixed(1)}% / {target.toFixed(1)}%
        </span>
      </div>
      <div className="bar">
        <span style={{
          width: `${pct}%`,
          background: `linear-gradient(90deg, ${color}, ${color}bb)`,
          boxShadow: `0 0 8px ${color}`,
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

  return (
    <div style={{ height: '100%', overflowY: 'auto', padding: 16, background: 'transparent', color: 'var(--text)' }}>

      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
        <div>
          <div className="eyebrow">PORTFOLIO</div>
          <div style={{ fontFamily: 'var(--mono)', fontSize: 9, color: 'var(--muted)' }}>
            {summary?.as_of || '—'}
          </div>
        </div>
        {summary?.staleness_warning
          ? <span className="badge warn">⚠ STALE</span>
          : <span className="badge live">● LIVE</span>
        }
      </div>

      {/* Hero total */}
      <div style={{ textAlign: 'center', marginBottom: 24 }}>
        <div style={{ fontFamily: 'var(--mono)', fontSize: 9, color: 'var(--muted)', marginBottom: 6, letterSpacing: '.15em', textTransform: 'uppercase' }}>
          TOTAL INVESTED
        </div>
        <div style={{ fontFamily: 'var(--display)', fontSize: 48, color: '#fff', lineHeight: 1, textShadow: '0 0 20px rgba(32,216,236,.5)' }}>
          {loading ? '—' : `€${(summary?.total_invested ?? 0).toFixed(2)}`}
        </div>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 10, marginTop: 10 }}>
          <button
            onClick={handleRefresh}
            disabled={refreshing}
            className={`action${refreshing ? ' ghost' : ''}`}
          >
            {refreshing ? '⟳ FETCHING…' : '↻ REFRESH PRICES'}
          </button>
          {refreshMsg && (
            <span className="badge safe">{refreshMsg}</span>
          )}
        </div>
        {summary?.staleness_warning && (
          <div style={{ fontFamily: 'var(--mono)', fontSize: 9, color: 'var(--gold)', marginTop: 6 }}>
            ⚠ {summary.staleness_warning}
          </div>
        )}
      </div>

      {/* Sleeve allocation */}
      <div className="glass" style={{ padding: 14, marginBottom: 12 }}>
        <div className="panel-title">SLEEVE ALLOCATION</div>
        {(summary?.sleeve_summary ?? []).map(s => (
          <SleeveBar key={s.name} sleeve={s} />
        ))}
        {loading && (
          <div style={{ fontFamily: 'var(--mono)', fontSize: 11, color: 'var(--dim)', textAlign: 'center', padding: 8 }}>
            Loading…
          </div>
        )}
        <div style={{ display: 'flex', gap: 14, marginTop: 10 }}>
          {[['within_band', 'var(--green)', 'ON TARGET'], ['below_min', 'var(--gold)', 'BELOW MIN'], ['above_max', 'var(--red)', 'ABOVE MAX']].map(([k, c, l]) => (
            <div key={k} style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
              <div style={{ width: 6, height: 6, borderRadius: '50%', background: c }} />
              <span style={{ fontFamily: 'var(--mono)', fontSize: 8, color: 'var(--muted)' }}>{l}</span>
            </div>
          ))}
        </div>
      </div>

      {/* JARVIS brief */}
      <div className="glass" style={{ padding: 14, borderLeft: '3px solid var(--cyan)', marginBottom: 12 }}>
        <div className="panel-title" style={{ color: 'var(--cyan)', fontSize: 11 }}>JARVIS BRIEF</div>
        <div style={{ fontFamily: 'var(--mono)', fontSize: 11, color: jarvisText ? 'var(--text)' : 'var(--dim)', lineHeight: 1.6 }}>
          {jarvisText || 'Analysing portfolio…'}
        </div>
      </div>

      {/* Quick nav */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
        {[['BRIEF', 'brief'], ['HOLDINGS', 'holdings'], ['PERFORMANCE', 'performance'], ['HISTORY', 'history']].map(([label, screen]) => (
          <button key={screen} onClick={() => onNav(screen)} className="action" style={{ padding: '13px 0', fontSize: 10, letterSpacing: '.14em' }}>
            {label}
          </button>
        ))}
        <button onClick={() => onNav('budget')} className="action warn" style={{ gridColumn: '1 / -1', padding: '13px 0', fontSize: 10, letterSpacing: '.14em', borderColor: 'rgba(255,213,107,.5)', color: 'var(--gold)' }}>
          BUDGET
        </button>
      </div>
    </div>
  )
}
