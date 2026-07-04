import { useEffect, useState } from 'react'
import { getFinancePerformanceHistory, deletePerformanceSnapshot } from '../../api/client'

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
  if (!Number.isFinite(amount)) return 'NOT RECORDED'
  return amount.toLocaleString('en-US', { style: 'currency', currency: 'EUR', minimumFractionDigits: 2 })
}

function formatTimestamp(value) {
  if (!value) return 'TIMESTAMP UNAVAILABLE'
  const date = new Date(value)
  return Number.isNaN(date.getTime()) ? String(value) : date.toLocaleString()
}

export default function Performance({ onBack }) {
  const [snapshots, setSnapshots] = useState(null)
  const [loadError, setLoadError] = useState(false)
  const [deleting, setDeleting] = useState(null)

  useEffect(() => {
    if (!document.getElementById('ph-keyframes')) {
      const style = document.createElement('style')
      style.id = 'ph-keyframes'; style.textContent = KEYFRAMES
      document.head.appendChild(style)
    }
  }, [])

  useEffect(() => {
    getFinancePerformanceHistory()
      .then(response => setSnapshots(Array.isArray(response.snapshots) ? response.snapshots : []))
      .catch(() => setLoadError(true))
  }, [])

  const loading = snapshots === null && !loadError

  return (
    <div className="phx-scope-finance" style={{ height: '100%', overflowY: 'auto', paddingBottom: 100, background: BG, color: 'rgba(199,236,244,.92)', fontFamily: BODY }}>

      {/* Top bar */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '13px 18px 11px', borderBottom: border, position: 'sticky', top: 0, background: `${CARD}f5`, backdropFilter: 'blur(12px)', zIndex: 5, overflow: 'hidden' }}>
        <div style={{ position: 'absolute', top: 0, left: 0, right: 0, height: 1, background: `linear-gradient(90deg,transparent,${ACCENT},transparent)`, animation: 'phScan 4s linear infinite' }} />
        <div style={{ display: 'flex', alignItems: 'center' }}>
          <span onClick={onBack} style={{ color: ACCENT, fontSize: 16, marginRight: 10, cursor: 'pointer' }}>←</span>
          <span style={{ fontFamily: DISPLAY, fontSize: 16, fontWeight: 700, letterSpacing: '.28em', color: ACCENT, textShadow: '0 0 20px rgba(0,187,221,.4)' }}>PERFORMANCE</span>
        </div>
        <span style={{ fontFamily: MONO, fontSize: 8, color: muted, letterSpacing: '.12em' }}>REAL DATA ONLY</span>
      </div>

      {loading && (
        <div style={{ padding: '48px 24px', textAlign: 'center', fontFamily: MONO, fontSize: 9, letterSpacing: '.2em', color: muted }}>
          LOADING REAL PERFORMANCE HISTORY…
        </div>
      )}

      {loadError && (
        <div style={{ margin: 18, padding: '12px 14px', border: '1px solid rgba(255,92,122,.3)', background: 'rgba(255,92,122,.04)', color: '#ff5c7a', fontFamily: MONO, fontSize: 8, letterSpacing: '.1em' }}>
          UNABLE TO LOAD PERFORMANCE HISTORY
        </div>
      )}

      {/* Empty state */}
      {!loading && !loadError && snapshots.length === 0 && (
        <div style={{ padding: '48px 24px', textAlign: 'center' }}>
          <div style={{ fontFamily: MONO, fontSize: 8, letterSpacing: '.22em', color: muted, marginBottom: 18 }}>NO DATA</div>
          <div style={{ fontFamily: DISPLAY, fontSize: 22, fontWeight: 700, color: ACCENT, lineHeight: 1.4, maxWidth: 360, margin: '0 auto 28px', textShadow: '0 0 20px rgba(0,187,221,.3)' }}>
            No real performance history yet.
          </div>
          <div style={{ fontSize: 13, color: 'rgba(199,236,244,.6)', lineHeight: 1.6, maxWidth: 300, margin: '0 auto 28px', fontFamily: BODY }}>
            Record and apply manual transactions to begin tracking.
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: 8, maxWidth: 320, margin: '0 auto', textAlign: 'left' }}>
            {[
              'Approve a weekly brief',
              'Complete the buy manually in your broker',
              'Record the transaction in the ledger',
              'Apply it to portfolio state',
            ].map((step, i) => (
              <div key={i} style={{ display: 'flex', alignItems: 'flex-start', gap: 10, padding: '10px 13px', border, background: 'rgba(0,187,221,.02)', borderRadius: 3 }}>
                <span style={{ fontFamily: MONO, fontSize: 9, color: ACCENT, flexShrink: 0, marginTop: 1, textShadow: '0 0 8px rgba(0,187,221,.4)' }}>{i + 1}.</span>
                <span style={{ fontSize: 13, fontWeight: 400, color: 'rgba(199,236,244,.8)', lineHeight: 1.55, fontFamily: BODY }}>{step}</span>
              </div>
            ))}
          </div>

          <div style={{ marginTop: 24, padding: '12px 16px', border: '1px solid rgba(77,255,180,.2)', background: 'rgba(77,255,180,.025)', maxWidth: 320, margin: '24px auto 0', borderRadius: 3 }}>
            <div style={{ fontFamily: MONO, fontSize: 7, letterSpacing: '.16em', color: '#4dffb4', marginBottom: 5 }}>SAFETY NOTE</div>
            <div style={{ fontSize: 12, fontWeight: 300, lineHeight: 1.55, color: 'rgba(77,255,180,.75)', fontFamily: BODY }}>
              No trades executed. No simulated returns. Performance data will reflect only your real recorded transactions.
            </div>
          </div>
        </div>
      )}

      {/* Snapshot list */}
      {!loading && !loadError && snapshots.length > 0 && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10, padding: 18 }}>
          <div style={{ fontFamily: MONO, fontSize: 8, letterSpacing: '.18em', color: muted }}>
            {snapshots.length} REAL SNAPSHOT{snapshots.length === 1 ? '' : 'S'} · NEWEST FIRST
          </div>
          {snapshots.map((snapshot, index) => (
            <div key={snapshot.id ?? index} style={{ padding: '12px 14px', border, background: 'rgba(0,187,221,.02)', borderRadius: 3, position: 'relative', overflow: 'hidden' }}>
              <div style={{ position: 'absolute', top: 0, left: 0, right: 0, height: 1, background: 'linear-gradient(90deg, rgba(0,187,221,.4), rgba(0,187,221,.1), transparent)' }} />
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 12 }}>
                <div style={{ fontFamily: MONO, fontSize: 8, color: ACCENT, letterSpacing: '.08em' }}>
                  {formatTimestamp(snapshot.created_at)}
                </div>
                <button
                  onClick={async () => {
                    setDeleting(snapshot.id)
                    try {
                      await deletePerformanceSnapshot(snapshot.id)
                      setSnapshots(prev => prev.filter(s => s.id !== snapshot.id))
                    } finally { setDeleting(null) }
                  }}
                  disabled={deleting === snapshot.id}
                  style={{ background: 'none', border: 'none', color: 'rgba(255,92,122,.4)', fontFamily: MONO, fontSize: 7, letterSpacing: '.1em', cursor: 'pointer', padding: '2px 4px' }}
                >
                  {deleting === snapshot.id ? '…' : '✕'}
                </button>
              </div>
              {[
                ['TOTAL VALUE', snapshot.total_value_eur],
                ['INVESTED VALUE', snapshot.invested_value_eur],
                ['CASH', snapshot.cash_eur],
              ].map(([label, value]) => (
                <div key={label} style={{ display: 'flex', justifyContent: 'space-between', gap: 16, marginBottom: 8 }}>
                  <span style={{ fontFamily: MONO, fontSize: 7, letterSpacing: '.12em', color: muted }}>{label}</span>
                  <span style={{ fontFamily: BODY, fontSize: 15, fontWeight: 600, color: value == null ? muted : ACCENT, textAlign: 'right', textShadow: value != null ? '0 0 12px rgba(0,187,221,.3)' : 'none' }}>
                    {formatEur(value)}
                  </span>
                </div>
              ))}
              <div style={{ fontFamily: MONO, fontSize: 7, color: 'rgba(0,187,221,.3)', letterSpacing: '.1em', marginTop: 10, paddingTop: 8, borderTop: '1px solid rgba(0,187,221,.08)' }}>
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
