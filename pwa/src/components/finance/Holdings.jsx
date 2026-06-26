import { useState, useEffect } from 'react'
import { getFinanceHoldings, postJarvisChat } from '../../api/client'

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
        position: 'fixed', inset: 0, background: 'rgba(0,0,0,.72)', zIndex: 10, backdropFilter: 'blur(8px)',
      }} />
      <div className="glass" style={{
        position: 'fixed', bottom: 0, left: 0, right: 0, zIndex: 11,
        padding: 20, borderTop: '2px solid var(--cyan)', borderRadius: 0,
      }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 14 }}>
          <div>
            <div style={{ fontFamily: 'var(--display)', fontSize: 20, color: '#fff' }}>
              {holding.display_name}
            </div>
            {!holding.is_legacy && (
              <div style={{ fontFamily: 'var(--mono)', fontSize: 9, color: 'var(--muted)', marginTop: 2 }}>
                {holding.sleeve} · {holding.route}
              </div>
            )}
          </div>
          <button onClick={onClose} className="action ghost" style={{ padding: '6px 10px' }}>✕</button>
        </div>

        <div style={{ display: 'flex', gap: 10, marginBottom: 14 }}>
          <div className="metric" style={{ flex: 1 }}>
            <div><div className="label">VALUE</div></div>
            <div className="value" style={{ fontSize: 20 }}>€{holding.amount.toFixed(2)}</div>
          </div>
          {!holding.is_legacy && (
            <div className="metric" style={{ flex: 1 }}>
              <div><div className="label">WEIGHT</div></div>
              <div className="value" style={{ fontSize: 20, color: statusColor(holding.band_status) }}>
                {(holding.current_weight * 100).toFixed(1)}%
              </div>
            </div>
          )}
        </div>

        <div className="glass" style={{ padding: 12, borderLeft: '3px solid var(--cyan)', marginBottom: 14 }}>
          <div style={{ fontFamily: 'var(--mono)', fontSize: 9, color: 'var(--cyan)', letterSpacing: '.1em', marginBottom: 6 }}>
            JARVIS NOTE
          </div>
          <div style={{ fontFamily: 'var(--mono)', fontSize: 11, color: loading ? 'var(--dim)' : 'var(--text)', lineHeight: 1.5 }}>
            {loading ? 'Analysing…' : text}
          </div>
        </div>

        <button
          onClick={() => { onQuickAsk(`Tell me more about my ${holding.display_name} position`); onClose() }}
          className="action"
          style={{ width: '100%', padding: '12px 0', fontSize: 10, letterSpacing: '.14em' }}
        >
          ASK JARVIS MORE
        </button>
      </div>
    </>
  )
}

function HoldingRow({ holding, onClick }) {
  const isLegacy = holding.is_legacy
  const color = isLegacy ? 'var(--dim)' : statusColor(holding.band_status)
  const borderColor = isLegacy ? 'rgba(32,216,236,.05)' : color

  return (
    <button onClick={onClick} className="row" style={{
      width: '100%', marginBottom: 6, textAlign: 'left',
      borderLeft: `3px solid ${borderColor}`, cursor: 'pointer',
    }}>
      <div className="row-main" style={{ flex: 1 }}>
        <div className="row-title">{holding.display_name}</div>
        <div className="row-sub">
          {isLegacy ? `maps to ${holding.maps_to}` : holding.route}
          {isLegacy && <span style={{ marginLeft: 8, color: 'var(--gold)', opacity: .6, fontSize: 8 }}>LEGACY</span>}
        </div>
      </div>
      <div style={{ textAlign: 'right' }}>
        <div style={{ fontFamily: 'var(--mono)', fontSize: 13, color: 'var(--cyan-br)' }}>
          €{holding.amount.toFixed(2)}
        </div>
        {!isLegacy && (
          <div style={{ fontFamily: 'var(--mono)', fontSize: 8, color, marginTop: 2, letterSpacing: '.06em' }}>
            {statusLabel(holding.band_status)}
          </div>
        )}
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
    <div style={{ height: '100%', overflowY: 'auto', padding: 16, background: 'transparent', color: 'var(--text)' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 16 }}>
        <button onClick={onBack} className="action ghost" style={{ padding: '6px 10px', fontSize: 14 }}>←</button>
        <span style={{ fontFamily: 'var(--display)', fontSize: 18, color: 'var(--cyan)', letterSpacing: '.1em' }}>HOLDINGS</span>
      </div>

      {/* Prices note */}
      <div className="badge warn" style={{ display: 'block', marginBottom: 14, padding: '8px 12px' }}>
        Prices not live — refresh from dashboard for current values
      </div>

      {/* Sort tabs */}
      <div style={{ display: 'flex', gap: 8, marginBottom: 14 }}>
        {[['BY VALUE', 'value'], ['BY STATUS', 'status']].map(([label, key]) => (
          <button key={key} onClick={() => setSortBy(key)} className={`action${sortBy === key ? '' : ' ghost'}`}>
            {label}
          </button>
        ))}
      </div>

      {loading ? (
        <div style={{ color: 'var(--dim)', fontFamily: 'var(--mono)', textAlign: 'center', paddingTop: 40 }}>Loading…</div>
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
