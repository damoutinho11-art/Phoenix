import { useEffect, useState } from 'react'
import { getFinanceHoldings } from '../../api/client'

const border = '1px solid rgba(32,216,236,.18)'
const muted = 'rgba(32,216,236,.38)'

function formatEur(value) {
  const amount = Number(value)
  if (!Number.isFinite(amount)) return '—'
  return amount.toLocaleString('en-US', {
    style: 'currency',
    currency: 'EUR',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })
}

function formatWeight(value) {
  const weight = Number(value)
  return Number.isFinite(weight) ? `${(weight * 100).toFixed(1)}%` : '—'
}

function humanize(value) {
  return value ? String(value).replace(/_/g, ' ').toUpperCase() : '—'
}

function assetType(holding) {
  if (holding.is_crypto) return 'CRYPTO'
  const descriptor = `${holding.key || ''} ${holding.route || ''}`.toLowerCase()
  return descriptor.includes('cash') || descriptor.includes('reserve') ? 'CASH' : 'ETF'
}

function bandColor(status) {
  if (status === 'within_band') return '#4dffb4'
  if (status === 'above_max') return '#ff5c7a'
  if (status === 'below_min') return '#ffd56b'
  return muted
}

function Field({ label, value, color = '#7df0ff' }) {
  return (
    <div style={{ background: 'rgba(32,216,236,.03)', border, padding: '10px 12px', minWidth: 0 }}>
      <div style={{ fontFamily: 'var(--mono)', fontSize: 7, letterSpacing: '.18em', color: muted, marginBottom: 4 }}>{label}</div>
      <div style={{ fontFamily: 'var(--mono)', fontSize: 11, letterSpacing: '.03em', color, overflowWrap: 'anywhere' }}>{value ?? '—'}</div>
    </div>
  )
}

function Drawer({ holding, kind, onClose, onQuickAsk }) {
  const isActive = kind === 'active'
  const fields = isActive
    ? [
        ['KEY', holding.key],
        ['TYPE', assetType(holding)],
        ['AMOUNT', formatEur(holding.amount)],
        ['ROUTE', holding.route || '—'],
        ['CURRENT WEIGHT', formatWeight(holding.current_weight)],
        ['TARGET WEIGHT', formatWeight(holding.target_weight)],
        ['BAND STATUS', humanize(holding.band_status), bandColor(holding.band_status)],
      ]
    : [
        ['KEY', holding.key],
        ['AMOUNT', formatEur(holding.amount)],
        ['MAPS TO', holding.maps_to || '—'],
        ['CLASSIFICATION', humanize(holding.classification)],
      ]

  return (
    <>
      <div onClick={onClose} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,.6)', zIndex: 15 }} />
      <div style={{ position: 'fixed', bottom: 0, left: 0, right: 0, maxWidth: 430, margin: '0 auto', background: '#000', borderTop: border, zIndex: 20, maxHeight: '70vh', overflowY: 'auto' }}>
        <div style={{ width: 36, height: 3, background: 'rgba(32,216,236,.18)', borderRadius: 2, margin: '10px auto 14px' }} />
        <div style={{ padding: '0 18px 30px' }}>
          <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12, marginBottom: 16 }}>
            <div>
              <div style={{ fontFamily: 'var(--display)', fontSize: 24, fontWeight: 700, letterSpacing: '.04em', color: '#fff', lineHeight: 1.1 }}>{holding.display_name}</div>
              <div style={{ fontFamily: 'var(--mono)', fontSize: 8, color: muted, marginTop: 5, letterSpacing: '.14em' }}>{isActive ? 'ACTIVE SLEEVE' : 'LEGACY HOLDING'}</div>
            </div>
            <span onClick={onClose} style={{ fontFamily: 'var(--mono)', fontSize: 10, color: muted, cursor: 'pointer', padding: 4, flexShrink: 0 }}>✕ CLOSE</span>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
            {fields.map(([label, value, color]) => <Field key={label} label={label} value={value} color={color} />)}
          </div>

          {onQuickAsk && (
            <button
              onClick={() => { onQuickAsk(`Tell me more about ${holding.display_name}`); onClose() }}
              style={{ marginTop: 14, width: '100%', fontFamily: 'var(--mono)', fontSize: 9, letterSpacing: '.18em', padding: '11px 0', border: '1px solid rgba(32,216,236,.28)', color: '#20d8ec', background: 'transparent', cursor: 'pointer' }}
            >ASK JARVIS MORE</button>
          )}
        </div>
      </div>
    </>
  )
}

function SectionHeading({ title, count }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '11px 14px 8px', borderBottom: '1px solid rgba(32,216,236,.1)', background: 'rgba(32,216,236,.025)' }}>
      <span style={{ fontFamily: 'var(--display)', fontSize: 11, fontWeight: 700, letterSpacing: '.22em', color: '#7df0ff' }}>{title}</span>
      <span style={{ fontFamily: 'var(--mono)', fontSize: 7, letterSpacing: '.14em', color: muted }}>{count} ITEMS</span>
    </div>
  )
}

function ActiveRow({ holding, onClick }) {
  const type = assetType(holding)
  return (
    <div onClick={onClick} style={{ padding: '12px 14px', borderBottom: '1px solid rgba(32,216,236,.08)', cursor: 'pointer' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12 }}>
        <div style={{ minWidth: 0 }}>
          <div style={{ fontFamily: 'var(--display)', fontSize: 16, fontWeight: 600, letterSpacing: '.04em', color: '#7df0ff' }}>{holding.display_name}</div>
          <div style={{ fontFamily: 'var(--mono)', fontSize: 7, letterSpacing: '.1em', color: muted, marginTop: 3, overflowWrap: 'anywhere' }}>{holding.key}</div>
        </div>
        <div style={{ fontFamily: 'var(--mono)', fontSize: 13, color: '#fff', flexShrink: 0 }}>{formatEur(holding.amount)}</div>
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2,minmax(0,1fr))', gap: '7px 12px', marginTop: 10 }}>
        <Field label="CURRENT / TARGET" value={`${formatWeight(holding.current_weight)} / ${formatWeight(holding.target_weight)}`} />
        <Field label="BAND STATUS" value={humanize(holding.band_status)} color={bandColor(holding.band_status)} />
        <Field label="ROUTE" value={holding.route || '—'} />
        <Field label="ASSET TYPE" value={type} />
      </div>
    </div>
  )
}

function LegacyRow({ holding, onClick }) {
  return (
    <div onClick={onClick} style={{ padding: '12px 14px', borderBottom: '1px solid rgba(32,216,236,.08)', cursor: 'pointer' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12 }}>
        <div style={{ minWidth: 0 }}>
          <div style={{ fontFamily: 'var(--display)', fontSize: 16, fontWeight: 600, letterSpacing: '.04em', color: 'rgba(199,236,244,.92)' }}>{holding.display_name}</div>
          <div style={{ fontFamily: 'var(--mono)', fontSize: 7, letterSpacing: '.1em', color: muted, marginTop: 3, overflowWrap: 'anywhere' }}>{holding.key}</div>
        </div>
        <div style={{ fontFamily: 'var(--mono)', fontSize: 13, color: '#fff', flexShrink: 0 }}>{formatEur(holding.amount)}</div>
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginTop: 10 }}>
        <Field label="MAPS TO" value={holding.maps_to || '—'} />
        <Field label="CLASSIFICATION" value={humanize(holding.classification)} />
      </div>
    </div>
  )
}

export default function Holdings({ onBack, onQuickAsk }) {
  const [data, setData] = useState(null)
  const [error, setError] = useState('')
  const [selected, setSelected] = useState(null)

  useEffect(() => {
    let active = true
    getFinanceHoldings()
      .then((response) => {
        if (active) setData(response)
      })
      .catch((requestError) => {
        if (active) setError(requestError?.message || 'Unable to load holdings.')
      })
    return () => { active = false }
  }, [])

  const activeHoldings = Array.isArray(data?.holdings) ? data.holdings : []
  const legacyHoldings = Array.isArray(data?.legacy_holdings) ? data.legacy_holdings : []
  const total = [...activeHoldings, ...legacyHoldings].reduce((sum, holding) => {
    const amount = Number(holding.amount)
    return sum + (Number.isFinite(amount) ? amount : 0)
  }, 0)
  const positionCount = activeHoldings.length + legacyHoldings.length

  return (
    <div style={{ height: '100%', overflowY: 'auto', background: '#000', color: 'rgba(199,236,244,.92)', fontFamily: "'Saira Condensed',sans-serif" }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '13px 18px 11px', borderBottom: border, position: 'sticky', top: 0, background: 'rgba(0,0,0,.96)', backdropFilter: 'blur(12px)', zIndex: 5 }}>
        <div style={{ display: 'flex', alignItems: 'center' }}>
          <span onClick={onBack} style={{ color: '#20d8ec', fontSize: 16, marginRight: 10, cursor: 'pointer' }}>←</span>
          <span style={{ fontFamily: 'var(--display)', fontSize: 13, fontWeight: 700, letterSpacing: '.28em', color: '#7df0ff' }}>HOLDINGS</span>
        </div>
        <span style={{ fontFamily: 'var(--mono)', fontSize: 8, color: muted, letterSpacing: '.14em' }}>{data ? `${positionCount} POSITIONS` : 'SYNCING'}</span>
      </div>

      <div style={{ padding: '16px 18px', borderBottom: border, background: 'rgba(32,216,236,.025)' }}>
        <div style={{ fontFamily: 'var(--mono)', fontSize: 7, letterSpacing: '.2em', color: muted, marginBottom: 5 }}>TOTAL HOLDINGS</div>
        <div style={{ fontFamily: 'var(--display)', fontSize: 28, fontWeight: 700, color: data ? '#7df0ff' : muted }}>{data ? formatEur(total) : 'Loading…'}</div>
        <div style={{ fontFamily: 'var(--mono)', fontSize: 8, letterSpacing: '.12em', color: muted, marginTop: 5 }}>AS OF {data?.as_of || '—'}</div>
      </div>

      {!data && !error && (
        <div style={{ padding: '42px 18px', textAlign: 'center', fontFamily: 'var(--mono)', fontSize: 9, letterSpacing: '.18em', color: muted }}>LOADING BACKEND HOLDINGS…</div>
      )}

      {error && (
        <div style={{ margin: 18, padding: 14, border: '1px solid rgba(255,92,122,.35)', background: 'rgba(255,92,122,.06)', color: '#ff5c7a', fontFamily: 'var(--mono)', fontSize: 9, lineHeight: 1.6 }}>
          HOLDINGS UNAVAILABLE<br />{error}
        </div>
      )}

      {data && (
        <>
          <SectionHeading title="ACTIVE SLEEVES" count={activeHoldings.length} />
          {activeHoldings.length > 0
            ? activeHoldings.map((holding) => <ActiveRow key={holding.key} holding={holding} onClick={() => setSelected({ holding, kind: 'active' })} />)
            : <div style={{ padding: '20px 14px', color: muted, fontFamily: 'var(--mono)', fontSize: 8, letterSpacing: '.12em' }}>NO ACTIVE SLEEVES REPORTED</div>}

          <SectionHeading title="LEGACY HOLDINGS" count={legacyHoldings.length} />
          {legacyHoldings.length > 0
            ? legacyHoldings.map((holding) => <LegacyRow key={holding.key} holding={holding} onClick={() => setSelected({ holding, kind: 'legacy' })} />)
            : <div style={{ padding: '20px 14px', color: muted, fontFamily: 'var(--mono)', fontSize: 8, letterSpacing: '.12em' }}>NO LEGACY HOLDINGS REPORTED</div>}
        </>
      )}

      {selected && <Drawer holding={selected.holding} kind={selected.kind} onClose={() => setSelected(null)} onQuickAsk={onQuickAsk} />}
    </div>
  )
}
