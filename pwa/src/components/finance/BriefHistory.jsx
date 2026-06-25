import { useState, useEffect } from 'react'
import { getFinanceBriefHistory } from '../../api/client'

const CYAN = '#20d8ec'

const ASSET_LABELS = {
  btc: 'BTC', hype: 'HYPE', tao: 'TAO',
  global_core_etf: 'Global Core ETF', growth_nasdaq_etf: 'Growth Nasdaq ETF',
  quality_etf: 'Quality ETF', discovery: 'Discovery',
  tactical_reserve: 'Tactical Reserve', portfolio: 'Portfolio',
}

function dbRowToEntry(row) {
  const status = (row.status || 'pending').toUpperCase()
  const displayStatus = status === 'APPROVED' ? 'APPROVED' : status
  return {
    id: row.id,
    week: row.week_label,
    action: (row.action || 'BUY').toUpperCase(),
    ticker: ASSET_LABELS[row.asset] || (row.asset || '—'),
    amount: row.amount_eur ?? 0,
    result_pct: row.outcome_pct ?? null,
    status: displayStatus,
    snippet: row.thesis ? row.thesis.slice(0, 90) + (row.thesis.length > 90 ? '…' : '') : '—',
    thesis: row.thesis || '—',
    outcome: row.outcome_note || null,
  }
}

const FILTERS = ['ALL', 'APPROVED', 'PENDING', 'DEFERRED', 'REJECTED']

function statusColor(s) {
  const m = { WON: '#9dff6f', LOST: '#ff6b6b', PENDING: CYAN, REJECTED: '#ffb347', DEFERRED: '#888' }
  return m[s] || '#555'
}

function actionColor(a) {
  return a === 'BUY' ? '#9dff6f' : a === 'SELL' ? '#ff6b6b' : '#888'
}

function Drawer({ entry, onClose }) {
  return (
    <>
      <div onClick={onClose} style={{ position: 'fixed', inset: 0, background: '#000a', zIndex: 10 }} />
      <div style={{
        position: 'fixed', bottom: 0, left: 0, right: 0, zIndex: 11,
        background: '#111', borderRadius: '12px 12px 0 0', padding: 20,
        borderTop: `2px solid ${statusColor(entry.status)}`, maxHeight: '70vh', overflowY: 'auto',
      }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 14 }}>
          <div>
            <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 4 }}>
              <span style={{ fontFamily: "'Share Tech Mono', monospace", fontSize: 11, color: '#555' }}>{entry.week}</span>
              <span style={{ fontSize: 9, background: statusColor(entry.status) + '22', color: statusColor(entry.status), padding: '2px 7px', borderRadius: 4, fontFamily: "'Oswald', sans-serif", letterSpacing: '0.08em' }}>
                {entry.status}
              </span>
            </div>
            <div style={{ fontFamily: "'Oswald', sans-serif", fontSize: 22, color: '#fff' }}>
              {entry.ticker} {entry.amount > 0 ? `€${entry.amount.toFixed(2)}` : ''}
            </div>
          </div>
          <button onClick={onClose} style={{ background: 'none', border: 'none', color: '#555', cursor: 'pointer', fontSize: 20 }}>✕</button>
        </div>

        <div style={{ background: '#0a0a0a', borderRadius: 6, padding: 12, marginBottom: 10 }}>
          <div style={{ fontFamily: "'Oswald', sans-serif", fontSize: 10, color: '#555', letterSpacing: '0.1em', marginBottom: 6 }}>THESIS</div>
          <div style={{ fontFamily: "'Share Tech Mono', monospace", fontSize: 12, color: '#ccc', lineHeight: 1.6 }}>{entry.thesis}</div>
        </div>

        {entry.outcome && (
          <div style={{ background: '#0a0a0a', borderRadius: 6, padding: 12, borderLeft: `3px solid ${statusColor(entry.status)}` }}>
            <div style={{ fontFamily: "'Oswald', sans-serif", fontSize: 10, color: statusColor(entry.status), letterSpacing: '0.1em', marginBottom: 6 }}>OUTCOME</div>
            <div style={{ fontFamily: "'Share Tech Mono', monospace", fontSize: 12, color: '#ccc', lineHeight: 1.6 }}>{entry.outcome}</div>
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
    <div style={{ height: '100%', overflowY: 'auto', padding: 16, background: '#0a0a0a', color: '#fff' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 16 }}>
        <button onClick={onBack} style={{ background: 'none', border: 'none', color: '#555', cursor: 'pointer', fontSize: 20, padding: 0 }}>←</button>
        <span style={{ fontFamily: "'Oswald', sans-serif", fontSize: 18, color: CYAN, letterSpacing: '0.1em' }}>BRIEF HISTORY</span>
        <span style={{ marginLeft: 'auto', fontFamily: "'Share Tech Mono', monospace", fontSize: 10, color: '#333' }}>
          {loading ? 'Loading…' : `${history.length} brief${history.length !== 1 ? 's' : ''}`}
        </span>
      </div>

      {/* Filter tabs */}
      <div style={{ display: 'flex', gap: 6, marginBottom: 14, flexWrap: 'wrap' }}>
        {FILTERS.map(f => (
          <button key={f} onClick={() => setFilter(f)} style={{
            background: filter === f ? CYAN + '22' : '#111',
            border: `1px solid ${filter === f ? CYAN : '#222'}`,
            borderRadius: 5, padding: '5px 10px', color: filter === f ? CYAN : '#555',
            fontFamily: "'Oswald', sans-serif", fontSize: 10, letterSpacing: '0.08em', cursor: 'pointer',
          }}>
            {f}
          </button>
        ))}
      </div>

      {!loading && history.length === 0 && (
        <div style={{ fontFamily: "'Share Tech Mono', monospace", fontSize: 12, color: '#444', textAlign: 'center', paddingTop: 40 }}>
          No briefs yet — open WEEKLY BRIEF to generate the first one.
        </div>
      )}

      {visible.map(entry => (
        <button key={entry.id} onClick={() => setSelected(entry.id)} style={{
          width: '100%', background: '#111', border: 'none', borderRadius: 8,
          padding: '12px 14px', marginBottom: 8, cursor: 'pointer', textAlign: 'left',
          borderLeft: `3px solid ${statusColor(entry.status)}`,
        }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 6 }}>
            <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
              <span style={{ fontFamily: "'Share Tech Mono', monospace", fontSize: 10, color: '#555' }}>{entry.week}</span>
              <span style={{
                fontSize: 9, background: actionColor(entry.action) + '22', color: actionColor(entry.action),
                padding: '1px 6px', borderRadius: 3, fontFamily: "'Oswald', sans-serif", letterSpacing: '0.08em',
              }}>
                {entry.action}
              </span>
            </div>
            <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
              {entry.result_pct !== null && (
                <span style={{
                  fontFamily: "'Share Tech Mono', monospace", fontSize: 11,
                  color: entry.result_pct >= 0 ? '#9dff6f' : '#ff6b6b',
                }}>
                  {entry.result_pct >= 0 ? '+' : ''}{entry.result_pct.toFixed(1)}%
                </span>
              )}
              <span style={{
                fontSize: 9, background: statusColor(entry.status) + '22', color: statusColor(entry.status),
                padding: '2px 7px', borderRadius: 4, fontFamily: "'Oswald', sans-serif", letterSpacing: '0.08em',
              }}>
                {entry.status}
              </span>
            </div>
          </div>
          <div style={{ fontFamily: "'Oswald', sans-serif", fontSize: 15, color: '#fff', marginBottom: 4 }}>
            {entry.ticker} {entry.amount > 0 ? `€${entry.amount.toFixed(2)}` : ''}
          </div>
          <div style={{ fontFamily: "'Share Tech Mono', monospace", fontSize: 11, color: '#555', lineHeight: 1.4 }}>
            {entry.snippet}
          </div>
        </button>
      ))}

      {selectedEntry && <Drawer entry={selectedEntry} onClose={() => setSelected(null)} />}
    </div>
  )
}
