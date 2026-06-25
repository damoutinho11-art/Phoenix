import { useState, useEffect } from 'react'
import { getFinanceRecommendation } from '../../api/client'

const CYAN = '#20d8ec'

const LABEL_MAP = {
  btc: 'BTC', hype: 'HYPE', tao: 'TAO',
  global_core_etf: 'Global Core ETF', growth_nasdaq_etf: 'Growth Nasdaq ETF',
  quality_etf: 'Quality ETF', discovery: 'Discovery', tactical_reserve: 'Tactical Reserve',
}

const MODE_LABELS = {
  normal_weekly_mode: 'NORMAL', construction_mode: 'CONSTRUCTION',
  transition_mode: 'TRANSITION', rebalance_watch_mode: 'REBALANCE WATCH',
}

function Header({ onBack, mode }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 20 }}>
      <button onClick={onBack} style={{ background: 'none', border: 'none', color: '#555', cursor: 'pointer', fontSize: 20, padding: 0, lineHeight: 1 }}>
        ←
      </button>
      <span style={{ fontFamily: "'Oswald', sans-serif", fontSize: 18, color: CYAN, letterSpacing: '0.1em' }}>
        WEEKLY BRIEF
      </span>
      {mode && (
        <span style={{
          marginLeft: 'auto', fontSize: 9, background: '#0a2226',
          border: `1px solid ${CYAN}44`, color: CYAN, borderRadius: 4,
          padding: '3px 8px', fontFamily: "'Share Tech Mono', monospace", letterSpacing: '0.08em',
        }}>
          {MODE_LABELS[mode] || mode.toUpperCase()}
        </span>
      )}
    </div>
  )
}

function ConfirmState({ action, onBack }) {
  const cfg = {
    approved: { icon: '✓', color: '#9dff6f', label: 'APPROVED', note: 'Logged. Execute manually in your broker app.' },
    deferred:  { icon: '⏸', color: '#ffb347', label: 'DEFERRED', note: 'Deferred to next week.' },
    rejected:  { icon: '✕', color: '#ff6b6b', label: 'REJECTED', note: 'Brief rejected and discarded.' },
  }[action]

  return (
    <div style={{ textAlign: 'center', padding: '60px 0' }}>
      <div style={{ fontSize: 48, color: cfg.color, marginBottom: 12 }}>{cfg.icon}</div>
      <div style={{ fontFamily: "'Oswald', sans-serif", fontSize: 28, color: cfg.color, letterSpacing: '0.1em' }}>
        {cfg.label}
      </div>
      <div style={{ fontFamily: "'Share Tech Mono', monospace", fontSize: 12, color: '#555', marginTop: 8 }}>
        {cfg.note}
      </div>
      <button onClick={onBack} style={{
        marginTop: 28, background: '#111', border: '1px solid #333', borderRadius: 6,
        padding: '10px 24px', color: '#888', fontFamily: "'Oswald', sans-serif", fontSize: 12,
        letterSpacing: '0.1em', cursor: 'pointer',
      }}>
        BACK
      </button>
    </div>
  )
}

function RecCard({ rec, laneColor, laneLabel }) {
  return (
    <div style={{ background: '#111', borderRadius: 8, padding: 16, marginBottom: 10, borderLeft: `3px solid ${laneColor}` }}>
      <div style={{ fontFamily: "'Oswald', sans-serif", fontSize: 10, color: laneColor, letterSpacing: '0.12em', marginBottom: 6 }}>
        {laneLabel}
      </div>
      <div style={{ fontFamily: "'Oswald', sans-serif", fontSize: 32, color: '#fff', lineHeight: 1 }}>
        {LABEL_MAP[rec.asset] || rec.asset}{' '}
        <span style={{ color: '#9dff6f' }}>€{rec.amount.toFixed(2)}</span>
      </div>
      <div style={{ fontFamily: "'Share Tech Mono', monospace", fontSize: 11, color: '#555', marginTop: 6 }}>
        via {rec.route} · BUY
      </div>
    </div>
  )
}

export default function WeeklyBrief({ onBack }) {
  const [rec, setRec] = useState(null)
  const [loading, setLoading] = useState(true)
  const [action, setAction] = useState(null)

  useEffect(() => {
    getFinanceRecommendation()
      .then(r => { setRec(r); setLoading(false) })
      .catch(() => setLoading(false))
  }, [])

  const cryptoRec = rec?.recommendations.find(r => r.lane === 'crypto')
  const etfRec = rec?.recommendations.find(r => r.lane === 'etf')

  return (
    <div style={{ height: '100%', overflowY: 'auto', padding: 16, background: '#0a0a0a', color: '#fff' }}>
      <Header onBack={onBack} mode={rec?.portfolio_mode} />

      {action ? (
        <ConfirmState action={action} onBack={() => setAction(null)} />
      ) : loading ? (
        <div style={{ color: '#444', fontFamily: "'Share Tech Mono', monospace", textAlign: 'center', paddingTop: 60 }}>
          Loading…
        </div>
      ) : (
        <>
          {cryptoRec && <RecCard rec={cryptoRec} laneColor="#f7931a" laneLabel="CRYPTO LANE" />}
          {etfRec && <RecCard rec={etfRec} laneColor={CYAN} laneLabel="ETF LANE" />}

          {!cryptoRec && !etfRec && (
            <div style={{ background: '#111', borderRadius: 8, padding: 24, textAlign: 'center', marginBottom: 10 }}>
              <div style={{ fontFamily: "'Oswald', sans-serif", fontSize: 16, color: '#555' }}>NO BUYS THIS WEEK</div>
            </div>
          )}

          {/* Budget row */}
          <div style={{ background: '#111', borderRadius: 8, padding: 14, marginBottom: 12 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span style={{ fontFamily: "'Share Tech Mono', monospace", fontSize: 11, color: '#555', letterSpacing: '0.08em' }}>
                WEEKLY BUDGET
              </span>
              <span style={{ fontFamily: "'Share Tech Mono', monospace", fontSize: 15, color: '#fff' }}>
                €{rec?.week_budget?.toFixed(2) ?? '—'}
              </span>
            </div>
          </div>

          {/* Warnings */}
          {rec?.warnings?.length > 0 && (
            <div style={{ background: '#130e00', border: '1px solid #ffb34733', borderRadius: 8, padding: 14, marginBottom: 12 }}>
              <div style={{ fontFamily: "'Oswald', sans-serif", fontSize: 11, color: '#ffb347', letterSpacing: '0.1em', marginBottom: 8 }}>
                WARNINGS
              </div>
              {rec.warnings.map((w, i) => (
                <div key={i} style={{
                  fontFamily: "'Share Tech Mono', monospace", fontSize: 11, color: '#ccc',
                  marginBottom: i < rec.warnings.length - 1 ? 6 : 0,
                  paddingLeft: 10, borderLeft: '2px solid #ffb347',
                }}>
                  {w}
                </div>
              ))}
            </div>
          )}

          {/* Action buttons */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 8, marginTop: 4 }}>
            <button onClick={() => setAction('approved')} style={{
              background: '#071a07', border: '1px solid #9dff6f55', borderRadius: 6,
              padding: '14px 0', color: '#9dff6f', fontFamily: "'Oswald', sans-serif",
              fontSize: 12, letterSpacing: '0.1em', cursor: 'pointer',
            }}>APPROVE</button>
            <button onClick={() => setAction('deferred')} style={{
              background: '#1a1000', border: '1px solid #ffb34755', borderRadius: 6,
              padding: '14px 0', color: '#ffb347', fontFamily: "'Oswald', sans-serif",
              fontSize: 12, letterSpacing: '0.1em', cursor: 'pointer',
            }}>DEFER</button>
            <button onClick={() => setAction('rejected')} style={{
              background: '#1a0707', border: '1px solid #ff6b6b55', borderRadius: 6,
              padding: '14px 0', color: '#ff6b6b', fontFamily: "'Oswald', sans-serif",
              fontSize: 12, letterSpacing: '0.1em', cursor: 'pointer',
            }}>REJECT</button>
          </div>
        </>
      )}
    </div>
  )
}
