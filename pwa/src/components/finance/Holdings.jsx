import { useState, useEffect } from 'react'
import { getFinanceHoldings, postJarvisChat } from '../../api/client'

const CYAN = '#20d8ec'

function statusColor(s) {
  if (s === 'within_band') return '#9dff6f'
  if (s === 'below_min') return '#ffb347'
  return '#ff6b6b'
}

function statusLabel(s) {
  if (s === 'within_band') return 'ON TARGET'
  if (s === 'below_min') return 'BELOW MIN'
  if (s === 'above_max') return 'ABOVE MAX'
  return s?.toUpperCase() ?? '—'
}

function Drawer({ holding, onClose, onQuickAsk }) {
  const [text, setText] = useState('')
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    postJarvisChat({ domain: 'finance', message: `Tell me about my ${holding.display_name} position in one sentence` })
      .then(r => { setText(r.response); setLoading(false) })
      .catch(() => { setText('Unable to load analysis.'); setLoading(false) })
  }, [holding.display_name])

  return (
    <>
      <div onClick={onClose} style={{
        position: 'fixed', inset: 0, background: '#000a', zIndex: 10,
      }} />
      <div style={{
        position: 'fixed', bottom: 0, left: 0, right: 0, zIndex: 11,
        background: '#111', borderRadius: '12px 12px 0 0', padding: 20,
        borderTop: `2px solid ${CYAN}`,
      }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 14 }}>
          <div>
            <div style={{ fontFamily: "'Oswald', sans-serif", fontSize: 20, color: '#fff' }}>
              {holding.display_name}
            </div>
            {!holding.is_legacy && (
              <div style={{ fontFamily: "'Share Tech Mono', monospace", fontSize: 11, color: '#555', marginTop: 2 }}>
                {holding.sleeve} · {holding.route}
              </div>
            )}
          </div>
          <button onClick={onClose} style={{ background: 'none', border: 'none', color: '#555', cursor: 'pointer', fontSize: 20 }}>✕</button>
        </div>

        <div style={{ display: 'flex', gap: 10, marginBottom: 14 }}>
          <div style={{ flex: 1, background: '#0a0a0a', borderRadius: 6, padding: 12 }}>
            <div style={{ fontFamily: "'Share Tech Mono', monospace", fontSize: 10, color: '#555', marginBottom: 4 }}>VALUE</div>
            <div style={{ fontFamily: "'Oswald', sans-serif", fontSize: 22, color: '#fff' }}>€{holding.amount.toFixed(2)}</div>
          </div>
          {!holding.is_legacy && (
            <div style={{ flex: 1, background: '#0a0a0a', borderRadius: 6, padding: 12 }}>
              <div style={{ fontFamily: "'Share Tech Mono', monospace", fontSize: 10, color: '#555', marginBottom: 4 }}>WEIGHT</div>
              <div style={{ fontFamily: "'Oswald', sans-serif", fontSize: 22, color: statusColor(holding.band_status) }}>
                {(holding.current_weight * 100).toFixed(1)}%
              </div>
            </div>
          )}
        </div>

        <div style={{ background: '#0a0a0a', borderRadius: 6, padding: 12, borderLeft: `3px solid ${CYAN}`, marginBottom: 14 }}>
          <div style={{ fontFamily: "'Oswald', sans-serif", fontSize: 10, color: CYAN, letterSpacing: '0.1em', marginBottom: 6 }}>
            JARVIS NOTE
          </div>
          <div style={{ fontFamily: "'Share Tech Mono', monospace", fontSize: 12, color: loading ? '#444' : '#ccc', lineHeight: 1.5 }}>
            {loading ? 'Analysing…' : text}
          </div>
        </div>

        <button
          onClick={() => { onQuickAsk(`Tell me more about my ${holding.display_name} position`); onClose() }}
          style={{
            width: '100%', background: '#0a2226', border: `1px solid ${CYAN}44`, borderRadius: 6,
            padding: '12px 0', color: CYAN, fontFamily: "'Oswald', sans-serif",
            fontSize: 13, letterSpacing: '0.1em', cursor: 'pointer',
          }}
        >
          ASK JARVIS MORE
        </button>
      </div>
    </>
  )
}

function HoldingRow({ holding, onClick }) {
  const isLegacy = holding.is_legacy
  const color = isLegacy ? '#555' : statusColor(holding.band_status)

  return (
    <button onClick={onClick} style={{
      width: '100%', background: '#111', border: 'none', borderRadius: 8,
      padding: '12px 14px', marginBottom: 8, cursor: 'pointer', textAlign: 'left',
      borderLeft: `3px solid ${isLegacy ? '#2a2a2a' : color}`,
    }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div>
          <div style={{ fontFamily: "'Oswald', sans-serif", fontSize: 15, color: '#fff' }}>
            {holding.display_name}
          </div>
          <div style={{ fontFamily: "'Share Tech Mono', monospace", fontSize: 10, color: '#555', marginTop: 2 }}>
            {isLegacy ? `maps to ${holding.maps_to}` : holding.route}
            {isLegacy && <span style={{ marginLeft: 8, color: '#ffb34799', fontSize: 9 }}>LEGACY</span>}
          </div>
        </div>
        <div style={{ textAlign: 'right' }}>
          <div style={{ fontFamily: "'Share Tech Mono', monospace", fontSize: 14, color: '#fff' }}>
            €{holding.amount.toFixed(2)}
          </div>
          {!isLegacy && (
            <div style={{
              fontFamily: "'Share Tech Mono', monospace", fontSize: 9,
              color, marginTop: 2, letterSpacing: '0.06em',
            }}>
              {statusLabel(holding.band_status)}
            </div>
          )}
        </div>
      </div>
    </button>
  )
}

export default function Holdings({ onBack, onQuickAsk }) {
  const [data, setData] = useState(null)
  const [loading, setLoading] = useState(true)
  const [sortBy, setSortBy] = useState('value')
  const [selected, setSelected] = useState(null)

  useEffect(() => {
    getFinanceHoldings()
      .then(d => { setData(d); setLoading(false) })
      .catch(() => setLoading(false))
  }, [])

  const allHoldings = data ? [
    ...data.holdings.map(h => ({ ...h, is_legacy: false })),
    ...data.legacy_holdings.map(h => ({ ...h, is_legacy: true })),
  ] : []

  const sorted = [...allHoldings].sort((a, b) => {
    if (sortBy === 'value') return b.amount - a.amount
    const order = { below_min: 0, above_max: 1, within_band: 2, undefined: 3 }
    return (order[a.band_status] ?? 3) - (order[b.band_status] ?? 3)
  })

  const selectedHolding = selected ? allHoldings.find(h => h.key === selected) : null

  return (
    <div style={{ height: '100%', overflowY: 'auto', padding: 16, background: '#0a0a0a', color: '#fff' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 16 }}>
        <button onClick={onBack} style={{ background: 'none', border: 'none', color: '#555', cursor: 'pointer', fontSize: 20, padding: 0 }}>←</button>
        <span style={{ fontFamily: "'Oswald', sans-serif", fontSize: 18, color: CYAN, letterSpacing: '0.1em' }}>HOLDINGS</span>
      </div>

      {/* Prices note */}
      <div style={{ background: '#0d0d00', border: '1px solid #ffb34722', borderRadius: 6, padding: '8px 12px', marginBottom: 14 }}>
        <span style={{ fontFamily: "'Share Tech Mono', monospace", fontSize: 10, color: '#ffb34799' }}>
          Prices not live — update portfolio_state.json for current values
        </span>
      </div>

      {/* Sort tabs */}
      <div style={{ display: 'flex', gap: 8, marginBottom: 14 }}>
        {[['BY VALUE', 'value'], ['BY STATUS', 'status']].map(([label, key]) => (
          <button key={key} onClick={() => setSortBy(key)} style={{
            background: sortBy === key ? CYAN + '22' : '#111',
            border: `1px solid ${sortBy === key ? CYAN : '#222'}`,
            borderRadius: 6, padding: '7px 14px', color: sortBy === key ? CYAN : '#555',
            fontFamily: "'Oswald', sans-serif", fontSize: 11, letterSpacing: '0.08em', cursor: 'pointer',
          }}>
            {label}
          </button>
        ))}
      </div>

      {loading ? (
        <div style={{ color: '#444', fontFamily: "'Share Tech Mono', monospace", textAlign: 'center', paddingTop: 40 }}>Loading…</div>
      ) : (
        sorted.map(h => (
          <HoldingRow key={h.key} holding={h} onClick={() => setSelected(h.key)} />
        ))
      )}

      {selectedHolding && (
        <Drawer
          holding={selectedHolding}
          onClose={() => setSelected(null)}
          onQuickAsk={onQuickAsk}
        />
      )}
    </div>
  )
}
