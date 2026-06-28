import { useEffect, useState } from 'react'
import { getFinanceHoldings } from '../../api/client'

const FONTS_URL = 'https://fonts.googleapis.com/css2?family=Rajdhani:wght@500;600;700&family=Space+Grotesk:wght@300;400;500;600;700&family=Share+Tech+Mono&display=swap'
const KEYFRAMES = `@keyframes phScan { 0%{transform:translateX(-100%)} 100%{transform:translateX(100%)} }`

const border = '1px solid rgba(0,187,221,.18)'
const muted = 'rgba(0,187,221,.45)'
const MONO = "'Share Tech Mono', monospace"
const DISPLAY = "'Rajdhani', sans-serif"
const BODY = "'Space Grotesk', sans-serif"
const BG = '#060c12'
const CARD = '#070e15'
const ACCENT = '#00bbdd'

function formatEur(value) {
  const amount = Number(value)
  if (!Number.isFinite(amount)) return '—'
  return amount.toLocaleString('en-US', { style: 'currency', currency: 'EUR', minimumFractionDigits: 2, maximumFractionDigits: 2 })
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

function Field({ label, value, color = ACCENT }) {
  return (
    <div style={{ background: 'rgba(0,187,221,.03)', border, padding: '10px 12px', minWidth: 0 }}>
      <div style={{ fontFamily: MONO, fontSize: 7, letterSpacing: '.18em', color: muted, marginBottom: 4 }}>{label}</div>
      <div style={{ fontFamily: MONO, fontSize: 11, letterSpacing: '.03em', color, overflowWrap: 'anywhere' }}>{value ?? '—'}</div>
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
      <div onClick={onClose} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,.7)', zIndex: 15 }} />
      <div style={{ position: 'fixed', bottom: 88, left: 0, right: 0, maxWidth: 430, margin: '0 auto', background: CARD, borderTop: `1px solid rgba(0,187,221,.3)`, zIndex: 20, maxHeight: '70vh', overflowY: 'auto' }}>
        <div style={{ position: 'absolute', top: 0, left: 0, right: 0, height: 1, background: `linear-gradient(90deg, rgba(0,187,221,.6), rgba(0,187,221,.15), transparent)` }} />
        <div style={{ width: 36, height: 3, background: 'rgba(0,187,221,.25)', borderRadius: 2, margin: '12px auto 14px' }} />
        <div style={{ padding: '0 18px 30px' }}>
          <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12, marginBottom: 16 }}>
            <div>
              <div style={{ fontFamily: DISPLAY, fontSize: 24, fontWeight: 700, letterSpacing: '.04em', color: '#eef6f9', lineHeight: 1.1 }}>{holding.display_name}</div>
              <div style={{ fontFamily: MONO, fontSize: 8, color: muted, marginTop: 5, letterSpacing: '.14em' }}>{isActive ? 'ACTIVE SLEEVE' : 'LEGACY HOLDING'}</div>
            </div>
            <span onClick={onClose} style={{ fontFamily: MONO, fontSize: 10, color: muted, cursor: 'pointer', padding: 4, flexShrink: 0 }}>✕ CLOSE</span>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
            {fields.map(([label, value, color]) => <Field key={label} label={label} value={value} color={color} />)}
          </div>
          {onQuickAsk && (
            <button
              onClick={() => { onQuickAsk(`Tell me more about ${holding.display_name}`); onClose() }}
              style={{ marginTop: 14, width: '100%', fontFamily: MONO, fontSize: 9, letterSpacing: '.18em', padding: '11px 0', border: `1px solid rgba(0,187,221,.4)`, color: '#7de8ff', background: 'transparent', cursor: 'pointer', textShadow: '0 0 8px rgba(0,187,221,.5)' }}
            >ASK JARVIS MORE</button>
          )}
        </div>
      </div>
    </>
  )
}

function SectionHeading({ title, count }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '11px 14px 8px', borderBottom: '1px solid rgba(0,187,221,.1)', background: 'rgba(0,187,221,.02)' }}>
      <span style={{ fontFamily: DISPLAY, fontSize: 13, fontWeight: 700, letterSpacing: '.22em', color: ACCENT }}>{title}</span>
      <span style={{ fontFamily: MONO, fontSize: 7, letterSpacing: '.14em', color: muted }}>{count} ITEMS</span>
    </div>
  )
}

function ActiveRow({ holding, onClick }) {
  const type = assetType(holding)
  return (
    <div onClick={onClick} style={{ padding: '12px 14px', borderBottom: '1px solid rgba(0,187,221,.07)', cursor: 'pointer' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12 }}>
        <div style={{ minWidth: 0 }}>
          <div style={{ fontFamily: DISPLAY, fontSize: 16, fontWeight: 600, letterSpacing: '.04em', color: ACCENT }}>{holding.display_name}</div>
          <div style={{ fontFamily: MONO, fontSize: 7, letterSpacing: '.1em', color: muted, marginTop: 3, overflowWrap: 'anywhere' }}>{holding.key}</div>
        </div>
        <div style={{ fontFamily: BODY, fontSize: 14, fontWeight: 600, color: '#eef6f9', flexShrink: 0 }}>{formatEur(holding.amount)}</div>
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
    <div onClick={onClick} style={{ padding: '12px 14px', borderBottom: '1px solid rgba(0,187,221,.07)', cursor: 'pointer' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12 }}>
        <div style={{ minWidth: 0 }}>
          <div style={{ fontFamily: DISPLAY, fontSize: 16, fontWeight: 600, letterSpacing: '.04em', color: 'rgba(199,236,244,.87)' }}>{holding.display_name}</div>
          <div style={{ fontFamily: MONO, fontSize: 7, letterSpacing: '.1em', color: muted, marginTop: 3, overflowWrap: 'anywhere' }}>{holding.key}</div>
        </div>
        <div style={{ fontFamily: BODY, fontSize: 14, fontWeight: 600, color: '#eef6f9', flexShrink: 0 }}>{formatEur(holding.amount)}</div>
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
    if (!document.getElementById('ph-fonts')) {
      const link = document.createElement('link')
      link.id = 'ph-fonts'; link.rel = 'stylesheet'; link.href = FONTS_URL
      document.head.appendChild(link)
    }
    if (!document.getElementById('ph-keyframes')) {
      const style = document.createElement('style')
      style.id = 'ph-keyframes'; style.textContent = KEYFRAMES
      document.head.appendChild(style)
    }
  }, [])

  useEffect(() => {
    let active = true
    getFinanceHoldings()
      .then((response) => { if (active) setData(response) })
      .catch((requestError) => { if (active) setError(requestError?.message || 'Unable to load holdings.') })
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
    <div style={{ height: '100%', overflowY: 'auto', paddingBottom: 100, background: BG, color: 'rgba(199,236,244,.92)', fontFamily: BODY }}>

      {/* Top bar */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '13px 18px 11px', borderBottom: border, position: 'sticky', top: 0, background: `${CARD}f5`, backdropFilter: 'blur(12px)', zIndex: 5, overflow: 'hidden' }}>
        <div style={{ position: 'absolute', top: 0, left: 0, right: 0, height: 1, background: `linear-gradient(90deg,transparent,${ACCENT},transparent)`, animation: 'phScan 4s linear infinite' }} />
        <div style={{ display: 'flex', alignItems: 'center' }}>
          <span onClick={onBack} style={{ color: ACCENT, fontSize: 16, marginRight: 10, cursor: 'pointer' }}>←</span>
          <span style={{ fontFamily: DISPLAY, fontSize: 16, fontWeight: 700, letterSpacing: '.28em', color: ACCENT, textShadow: '0 0 20px rgba(0,187,221,.4)' }}>HOLDINGS</span>
        </div>
        <span style={{ fontFamily: MONO, fontSize: 8, color: muted, letterSpacing: '.14em' }}>{data ? `${positionCount} POSITIONS` : 'SYNCING'}</span>
      </div>

      {/* Total */}
      <div style={{ padding: '16px 18px', borderBottom: border, background: 'rgba(0,187,221,.02)', position: 'relative', overflow: 'hidden' }}>
        <div style={{ position: 'absolute', top: 0, left: 0, right: 0, height: 1, background: `linear-gradient(90deg, rgba(0,187,221,.4), rgba(0,187,221,.1), transparent)` }} />
        <div style={{ fontFamily: MONO, fontSize: 7, letterSpacing: '.2em', color: muted, marginBottom: 6 }}>TOTAL HOLDINGS</div>
        <div style={{ fontFamily: BODY, fontSize: 32, fontWeight: 700, color: data ? ACCENT : muted, textShadow: data ? '0 0 30px rgba(0,187,221,.35)' : 'none', letterSpacing: '-0.02em' }}>
          {data ? formatEur(total) : 'Loading…'}
        </div>
        <div style={{ fontFamily: MONO, fontSize: 8, letterSpacing: '.12em', color: muted, marginTop: 5 }}>AS OF {data?.as_of || '—'}</div>
      </div>

      {!data && !error && (
        <div style={{ padding: '42px 18px', textAlign: 'center', fontFamily: MONO, fontSize: 9, letterSpacing: '.18em', color: muted }}>LOADING BACKEND HOLDINGS…</div>
      )}

      {error && (
        <div style={{ margin: 18, padding: 14, border: '1px solid rgba(255,92,122,.35)', background: 'rgba(255,92,122,.06)', color: '#ff5c7a', fontFamily: MONO, fontSize: 9, lineHeight: 1.6 }}>
          HOLDINGS UNAVAILABLE<br />{error}
        </div>
      )}

      {data && (
        <>
          <SectionHeading title="ACTIVE SLEEVES" count={activeHoldings.length} />
          {activeHoldings.length > 0
            ? activeHoldings.map((holding) => <ActiveRow key={holding.key} holding={holding} onClick={() => setSelected({ holding, kind: 'active' })} />)
            : <div style={{ padding: '20px 14px', color: muted, fontFamily: MONO, fontSize: 8, letterSpacing: '.12em' }}>NO ACTIVE SLEEVES REPORTED</div>}

          <SectionHeading title="LEGACY HOLDINGS" count={legacyHoldings.length} />
          {legacyHoldings.length > 0
            ? legacyHoldings.map((holding) => <LegacyRow key={holding.key} holding={holding} onClick={() => setSelected({ holding, kind: 'legacy' })} />)
            : <div style={{ padding: '20px 14px', color: muted, fontFamily: MONO, fontSize: 8, letterSpacing: '.12em' }}>NO LEGACY HOLDINGS REPORTED</div>}
        </>
      )}

      {selected && <Drawer holding={selected.holding} kind={selected.kind} onClose={() => setSelected(null)} onQuickAsk={onQuickAsk} />}
    </div>
  )
}
