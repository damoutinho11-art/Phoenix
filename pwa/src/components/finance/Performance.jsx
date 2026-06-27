import { useEffect, useState } from 'react'
import { getFinancePerformanceHistory } from '../../api/client'

const border = '1px solid rgba(32,216,236,.18)'
const muted = 'rgba(32,216,236,.38)'

function formatEur(value) {
  const amount = Number(value)
  if (!Number.isFinite(amount)) return 'NOT RECORDED'
  return amount.toLocaleString('en-US', {
    style: 'currency',
    currency: 'EUR',
    minimumFractionDigits: 2,
  })
}

function formatTimestamp(value) {
  if (!value) return 'TIMESTAMP UNAVAILABLE'
  const date = new Date(value)
  return Number.isNaN(date.getTime()) ? String(value) : date.toLocaleString()
}

export default function Performance({ onBack }) {
  const [snapshots, setSnapshots] = useState(null)
  const [loadError, setLoadError] = useState(false)

  useEffect(() => {
    getFinancePerformanceHistory()
      .then(response => setSnapshots(Array.isArray(response.snapshots) ? response.snapshots : []))
      .catch(() => setLoadError(true))
  }, [])

  const loading = snapshots === null && !loadError

  return (
    <div style={{ height: '100%', overflowY: 'auto', background: '#000', color: 'rgba(199,236,244,.92)', fontFamily: "'Saira Condensed',sans-serif" }}>

      {/* TOP BAR */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '13px 18px 11px', borderBottom: border, position: 'sticky', top: 0, background: 'rgba(0,0,0,.95)', backdropFilter: 'blur(12px)', zIndex: 5 }}>
        <div style={{ display: 'flex', alignItems: 'center' }}>
          <span onClick={onBack} style={{ color: '#20d8ec', fontSize: 16, marginRight: 10, cursor: 'pointer' }}>←</span>
          <span style={{ fontFamily: 'var(--display)', fontSize: 13, fontWeight: 700, letterSpacing: '.28em', color: '#7df0ff' }}>PERFORMANCE</span>
        </div>
        <span style={{ fontFamily: 'var(--mono)', fontSize: 8, color: muted, letterSpacing: '.12em' }}>REAL DATA ONLY</span>
      </div>

      {loading && (
        <div style={{ padding: '48px 24px', textAlign: 'center', fontFamily: 'var(--mono)', fontSize: 9, letterSpacing: '.2em', color: muted }}>
          LOADING REAL PERFORMANCE HISTORY…
        </div>
      )}

      {loadError && (
        <div style={{ margin: 18, padding: '12px 14px', border: '1px solid rgba(255,92,122,.3)', background: 'rgba(255,92,122,.04)', color: '#ff5c7a', fontFamily: 'var(--mono)', fontSize: 8, letterSpacing: '.1em' }}>
          UNABLE TO LOAD PERFORMANCE HISTORY
        </div>
      )}

      {!loading && !loadError && snapshots.length === 0 && (
        <div style={{ padding: '48px 24px', textAlign: 'center' }}>
        <div style={{ fontFamily: 'var(--mono)', fontSize: 8, letterSpacing: '.22em', color: muted, marginBottom: 18 }}>NO DATA</div>
        <div style={{ fontFamily: 'var(--display)', fontSize: 20, fontWeight: 700, color: '#7df0ff', lineHeight: 1.4, maxWidth: 360, margin: '0 auto 28px' }}>
          No real performance history yet. Record and apply manual transactions to begin tracking.
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 10, maxWidth: 320, margin: '0 auto', textAlign: 'left' }}>
          {[
            'Approve a weekly brief',
            'Complete the buy manually in your broker',
            'Record the transaction in the ledger',
            'Apply it to portfolio state',
          ].map((step, i) => (
            <div key={i} style={{ display: 'flex', alignItems: 'flex-start', gap: 10, padding: '10px 13px', border, background: 'rgba(32,216,236,.02)' }}>
              <span style={{ fontFamily: 'var(--mono)', fontSize: 8, color: '#20d8ec', flexShrink: 0, marginTop: 1 }}>{i + 1}.</span>
              <span style={{ fontSize: 12, fontWeight: 300, color: 'rgba(199,236,244,.72)', lineHeight: 1.5 }}>{step}</span>
            </div>
          ))}
        </div>

        <div style={{ marginTop: 32, padding: '12px 16px', border: '1px solid rgba(77,255,180,.2)', background: 'rgba(77,255,180,.025)', maxWidth: 320, margin: '32px auto 0' }}>
          <div style={{ fontFamily: 'var(--mono)', fontSize: 7, letterSpacing: '.16em', color: '#4dffb4', marginBottom: 5 }}>SAFETY NOTE</div>
          <div style={{ fontSize: 11, fontWeight: 300, lineHeight: 1.55, color: 'rgba(77,255,180,.75)' }}>
            No trades executed. No simulated returns. Performance data will reflect only your real recorded transactions.
          </div>
        </div>
        </div>
      )}

      {!loading && !loadError && snapshots.length > 0 && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10, padding: 18 }}>
          <div style={{ fontFamily: 'var(--mono)', fontSize: 8, letterSpacing: '.18em', color: muted }}>
            {snapshots.length} REAL SNAPSHOT{snapshots.length === 1 ? '' : 'S'} · NEWEST FIRST
          </div>
          {snapshots.map((snapshot, index) => (
            <div key={snapshot.id ?? index} style={{ padding: '12px 14px', border, background: 'rgba(32,216,236,.02)' }}>
              <div style={{ fontFamily: 'var(--mono)', fontSize: 8, color: '#7df0ff', letterSpacing: '.08em', marginBottom: 10 }}>
                {formatTimestamp(snapshot.created_at)}
              </div>
              {[
                ['TOTAL VALUE', snapshot.total_value_eur],
                ['INVESTED VALUE', snapshot.invested_value_eur],
                ['CASH', snapshot.cash_eur],
              ].map(([label, value]) => (
                <div key={label} style={{ display: 'flex', justifyContent: 'space-between', gap: 16, marginBottom: 6 }}>
                  <span style={{ fontFamily: 'var(--mono)', fontSize: 7, letterSpacing: '.12em', color: muted }}>{label}</span>
                  <span style={{ fontFamily: 'var(--display)', fontSize: 14, color: value == null ? muted : '#7df0ff', textAlign: 'right' }}>
                    {formatEur(value)}
                  </span>
                </div>
              ))}
              <div style={{ fontFamily: 'var(--mono)', fontSize: 7, color: muted, letterSpacing: '.1em', marginTop: 9 }}>
                {snapshot.trigger === 'ledger_apply' ? 'EXPLICIT LEDGER APPLY' : String(snapshot.trigger || 'RECORDED SNAPSHOT').toUpperCase()}
                {snapshot.transaction_id != null ? ` · TRANSACTION ${snapshot.transaction_id}` : ''}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
