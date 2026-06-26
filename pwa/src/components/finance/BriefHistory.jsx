import { useState, useEffect } from 'react'
import { getFinanceBriefHistory } from '../../api/client'

const ASSET_LABELS = {
  btc: 'BTC', hype: 'HYPE', tao: 'TAO',
  global_core_etf: 'Global Core ETF', growth_nasdaq_etf: 'Growth Nasdaq ETF',
  quality_etf: 'Quality ETF', discovery: 'Discovery',
  tactical_reserve: 'Tactical Reserve', portfolio: 'Portfolio',
}

function dbRowToEntry(row) {
  const status = (row.status || 'pending').toUpperCase()
  return {
    id: row.id,
    week: row.week_label,
    action: (row.action || 'BUY').toUpperCase(),
    ticker: ASSET_LABELS[row.asset] || (row.asset || '—'),
    amount: row.amount_eur ?? 0,
    result_pct: row.outcome_pct ?? null,
    status,
    snippet: row.thesis ? row.thesis.slice(0, 90) + (row.thesis.length > 90 ? '…' : '') : '—',
    thesis: row.thesis || '—',
    outcome: row.outcome_note || null,
  }
}

const FILTERS = ['ALL', 'APPROVED', 'PENDING', 'DEFERRED', 'REJECTED']

function statusVariant(s) {
  const m = { APPROVED: 'safe', PENDING: 'live', DEFERRED: 'warn', REJECTED: 'danger' }
  return m[s] || ''
}

function statusColor(s) {
  const m = { APPROVED: 'var(--green)', PENDING: 'var(--cyan)', DEFERRED: 'var(--gold)', REJECTED: 'var(--red)' }
  return m[s] || 'var(--dim)'
}

function actionColor(a) {
  return a === 'BUY' ? 'var(--green)' : a === 'SELL' ? 'var(--red)' : 'var(--dim)'
}

function Drawer({ entry, onClose }) {
  const borderColor = statusColor(entry.status)
  return (
    <>
      <div onClick={onClose} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,.72)', zIndex: 10, backdropFilter: 'blur(8px)' }} />
      <div className="glass" style={{
        position: 'fixed', bottom: 0, left: 0, right: 0, zIndex: 11,
        padding: 20, borderTop: `2px solid ${borderColor}`, borderRadius: 0,
        maxHeight: '70vh', overflowY: 'auto',
      }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 14 }}>
          <div>
            <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 4 }}>
              <span style={{ fontFamily: 'var(--mono)', fontSize: 10, color: 'var(--muted)' }}>{entry.week}</span>
              <span className={`badge ${statusVariant(entry.status)}`}>{entry.status}</span>
            </div>
            <div style={{ fontFamily: 'var(--display)', fontSize: 22, color: '#fff' }}>
              {entry.ticker} {entry.amount > 0 ? `€${entry.amount.toFixed(2)}` : ''}
            </div>
          </div>
          <button onClick={onClose} className="action ghost" style={{ padding: '6px 10px' }}>✕</button>
        </div>

        <div className="glass" style={{ padding: 12, marginBottom: 10 }}>
          <div style={{ fontFamily: 'var(--mono)', fontSize: 9, color: 'var(--muted)', letterSpacing: '.1em', marginBottom: 6 }}>THESIS</div>
          <div style={{ fontFamily: 'var(--mono)', fontSize: 11, color: 'var(--text)', lineHeight: 1.6 }}>{entry.thesis}</div>
        </div>

        {entry.outcome && (
          <div className="glass" style={{ padding: 12, borderLeft: `3px solid ${borderColor}` }}>
            <div style={{ fontFamily: 'var(--mono)', fontSize: 9, color: borderColor, letterSpacing: '.1em', marginBottom: 6 }}>OUTCOME</div>
            <div style={{ fontFamily: 'var(--mono)', fontSize: 11, color: 'var(--text)', lineHeight: 1.6 }}>{entry.outcome}</div>
          </div>
        )}
      </div>
    </>
  )
}

export default function BriefHistory({ onBack }) {
  const [filter, setFilter] = useState('ALL')
  const [selected, setSelected] = useState(null)
  const [history, setHistory] = useState([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    getFinanceBriefHistory()
      .then(r => { setHistory((r.history || []).map(dbRowToEntry)); setLoading(false) })
      .catch(() => setLoading(false))
  }, [])

  const visible = filter === 'ALL' ? history : history.filter(e => e.status === filter)
  const selectedEntry = selected !== null ? history.find(e => e.id === selected) : null

  return (
    <div style={{ height: '100%', overflowY: 'auto', padding: 16, background: 'transparent', color: 'var(--text)' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 16 }}>
        <button onClick={onBack} className="action ghost" style={{ padding: '6px 10px', fontSize: 14 }}>←</button>
        <span style={{ fontFamily: 'var(--display)', fontSize: 18, color: 'var(--cyan)', letterSpacing: '.1em' }}>BRIEF HISTORY</span>
        <span style={{ marginLeft: 'auto', fontFamily: 'var(--mono)', fontSize: 9, color: 'var(--dim)' }}>
          {loading ? 'Loading…' : `${history.length} brief${history.length !== 1 ? 's' : ''}`}
        </span>
      </div>

      {/* Filter tabs */}
      <div style={{ display: 'flex', gap: 6, marginBottom: 14, flexWrap: 'wrap' }}>
        {FILTERS.map(f => (
          <button key={f} onClick={() => setFilter(f)} className={`action${filter === f ? '' : ' ghost'}`} style={{ fontSize: 8 }}>
            {f}
          </button>
        ))}
      </div>

      {!loading && history.length === 0 && (
        <div style={{ fontFamily: 'var(--mono)', fontSize: 11, color: 'var(--dim)', textAlign: 'center', paddingTop: 40 }}>
          No briefs yet — open WEEKLY BRIEF to generate the first one.
        </div>
      )}

      {visible.map(entry => (
        <button key={entry.id} onClick={() => setSelected(entry.id)} className="row" style={{
          width: '100%', marginBottom: 6, textAlign: 'left',
          borderLeft: `3px solid ${statusColor(entry.status)}`, cursor: 'pointer',
          flexDirection: 'column', alignItems: 'flex-start',
        }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', width: '100%', marginBottom: 6 }}>
            <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
              <span style={{ fontFamily: 'var(--mono)', fontSize: 9, color: 'var(--muted)' }}>{entry.week}</span>
              <span className="badge" style={{ color: actionColor(entry.action), borderColor: actionColor(entry.action) + '44' }}>{entry.action}</span>
            </div>
            <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
              {entry.result_pct !== null && (
                <span style={{ fontFamily: 'var(--mono)', fontSize: 10, color: entry.result_pct >= 0 ? 'var(--green)' : 'var(--red)' }}>
                  {entry.result_pct >= 0 ? '+' : ''}{entry.result_pct.toFixed(1)}%
                </span>
              )}
              <span className={`badge ${statusVariant(entry.status)}`}>{entry.status}</span>
            </div>
          </div>
          <div className="row-title" style={{ marginBottom: 4 }}>
            {entry.ticker} {entry.amount > 0 ? `€${entry.amount.toFixed(2)}` : ''}
          </div>
          <div className="row-sub">{entry.snippet}</div>
        </button>
      ))}

      {selectedEntry && <Drawer entry={selectedEntry} onClose={() => setSelected(null)} />}
    </div>
  )
}
