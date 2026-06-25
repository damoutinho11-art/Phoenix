import { useState } from 'react'

const CYAN = '#20d8ec'

const MOCK_HISTORY = [
  {
    id: 1, week: 'W26 2026', action: 'BUY', ticker: 'BTC', amount: 41.54,
    result_pct: null, status: 'PENDING',
    snippet: 'Crypto lane: BTC allocation below target, dual-lane mandate active.',
    thesis: 'BTC is currently at 10.0% weight, matching target. LHV Crypto platform ready. Weekly budget available. Standard accumulation buy.',
    outcome: null,
  },
  {
    id: 2, week: 'W25 2026', action: 'BUY', ticker: 'Quality ETF', amount: 62.31,
    result_pct: 1.2, status: 'WON',
    snippet: 'ETF lane: quality_etf below target. Strong value conditions.',
    thesis: 'Quality ETF sleeve at 9.8% vs 10% target. Lightyear route ready. Solid risk/reward for value-oriented accumulation.',
    outcome: 'Position gained +1.2% in the week following purchase. Target weight restored.',
  },
  {
    id: 3, week: 'W24 2026', action: 'BUY', ticker: 'BTC', amount: 41.54,
    result_pct: -2.1, status: 'LOST',
    snippet: 'Crypto lane accumulation. BTC dipped post-purchase.',
    thesis: 'Standard weekly BTC accumulation. Dual-lane mandate: crypto allocation active. LHV Crypto platform confirmed ready.',
    outcome: 'BTC dropped 2.1% the following week. Expected volatility within accumulation strategy — no constitution violation.',
  },
  {
    id: 4, week: 'W23 2026', action: 'HOLD', ticker: 'Portfolio', amount: 0,
    result_pct: 0.8, status: 'WON',
    snippet: 'All sleeves within band. No buys required this week.',
    thesis: 'Portfolio in transition_mode. All active sleeves within bands. Tactical reserve absorbing pending legacy settlement. No action triggered.',
    outcome: 'Portfolio appreciated 0.8% passively. Correct call — avoided over-trading.',
  },
  {
    id: 5, week: 'W22 2026', action: 'BUY', ticker: 'COIN', amount: 55.00,
    result_pct: 11.2, status: 'REJECTED',
    snippet: 'Discovery lane candidate rejected. +11.2% missed.',
    thesis: 'Coinbase (COIN) proposed as discovery sleeve allocation. Single-stock equities are outside constitution rules — only ETFs and crypto permitted. Constitution rule: no_random_new_assets = true. Brief rejected on constitution grounds.',
    outcome: 'COIN gained +11.2% the following week. Accountability note: constitution correctly blocked a single-stock position. The rule exists to prevent chasing individual names — the process was right even if this particular outcome stings.',
  },
  {
    id: 6, week: 'W21 2026', action: 'BUY', ticker: 'Global Core ETF', amount: 115.38,
    result_pct: 0.5, status: 'WON',
    snippet: 'Full budget to global_core_etf — sleeve underweight by 8%.',
    thesis: 'global_core_etf at 47% vs 55% target — well below minimum band. Full weekly budget directed to restore sleeve. Lightyear route confirmed.',
    outcome: 'Position gained 0.5%. Sleeve weight improved from 47% toward target.',
  },
  {
    id: 7, week: 'W20 2026', action: 'DEFER', ticker: 'BTC', amount: 41.54,
    result_pct: -5.3, status: 'DEFERRED',
    snippet: 'Deferred by user. BTC at local high — better entry anticipated.',
    thesis: 'User chose to defer crypto lane buy. BTC was at a recent local high. Deferral is valid under constitution — manual approval means manual override is always allowed.',
    outcome: 'BTC declined 5.3% the following week. Deferral was correct. No missed opportunity cost.',
  },
  {
    id: 8, week: 'W19 2026', action: 'BUY', ticker: 'Growth Nasdaq ETF', amount: 57.69,
    result_pct: 3.1, status: 'WON',
    snippet: 'Growth sleeve underweight. Strong earnings season tailwind.',
    thesis: 'growth_nasdaq_etf at 12% vs 15% target. ETF lane buy recommended. Lightyear route confirmed. Technology sector momentum positive.',
    outcome: 'Position gained 3.1%. Growth sleeve partially restored to target band.',
  },
]

const FILTERS = ['ALL', 'WON', 'LOST', 'PENDING', 'REJECTED', 'DEFERRED']

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

  const visible = filter === 'ALL' ? MOCK_HISTORY : MOCK_HISTORY.filter(e => e.status === filter)
  const selectedEntry = selected !== null ? MOCK_HISTORY.find(e => e.id === selected) : null

  return (
    <div style={{ height: '100%', overflowY: 'auto', padding: 16, background: '#0a0a0a', color: '#fff' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 16 }}>
        <button onClick={onBack} style={{ background: 'none', border: 'none', color: '#555', cursor: 'pointer', fontSize: 20, padding: 0 }}>←</button>
        <span style={{ fontFamily: "'Oswald', sans-serif", fontSize: 18, color: CYAN, letterSpacing: '0.1em' }}>BRIEF HISTORY</span>
        <span style={{ marginLeft: 'auto', fontFamily: "'Share Tech Mono', monospace", fontSize: 10, color: '#333' }}>
          History sync coming soon
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
