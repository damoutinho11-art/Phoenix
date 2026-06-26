import { useState, useEffect } from 'react'
import { getFinanceRecommendation, postBriefAction } from '../../api/client'

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
      <button onClick={onBack} className="action ghost" style={{ padding: '6px 10px', fontSize: 14 }}>←</button>
      <span style={{ fontFamily: 'var(--display)', fontSize: 18, color: 'var(--cyan)', letterSpacing: '.1em' }}>
        WEEKLY BRIEF
      </span>
      {mode && (
        <span className="badge live" style={{ marginLeft: 'auto' }}>
          {MODE_LABELS[mode] || mode.toUpperCase()}
        </span>
      )}
    </div>
  )
}

function ConfirmState({ action, weekLabel, onBack }) {
  const cfg = {
    approved: { color: 'var(--green)', label: 'APPROVED', note: 'Execute manually in your broker app.' },
    deferred:  { color: 'var(--gold)', label: 'DEFERRED', note: 'Deferred to next week.' },
    rejected:  { color: 'var(--red)',  label: 'REJECTED', note: 'Brief rejected.' },
  }[action]

  return (
    <div style={{ textAlign: 'center', padding: '60px 0' }}>
      <div style={{ fontFamily: 'var(--display)', fontSize: 48, color: cfg.color, letterSpacing: '.1em', marginBottom: 12 }}>
        {cfg.label}
      </div>
      {weekLabel && (
        <div style={{ fontFamily: 'var(--mono)', fontSize: 10, color: 'var(--muted)', marginTop: 6 }}>
          Logged — {weekLabel} {cfg.label}
        </div>
      )}
      <div style={{ fontFamily: 'var(--mono)', fontSize: 11, color: 'var(--dim)', marginTop: 4 }}>
        {cfg.note}
      </div>
      <button onClick={onBack} className="action ghost" style={{ marginTop: 28, padding: '10px 24px' }}>
        BACK
      </button>
    </div>
  )
}

function RecCard({ rec, laneColor, laneLabel }) {
  return (
    <div className="glass" style={{ padding: 16, marginBottom: 10, borderLeft: `3px solid ${laneColor}` }}>
      <div style={{ fontFamily: 'var(--mono)', fontSize: 9, color: laneColor, letterSpacing: '.12em', marginBottom: 6 }}>
        {laneLabel}
      </div>
      <div style={{ fontFamily: 'var(--display)', fontSize: 32, color: '#fff', lineHeight: 1 }}>
        {LABEL_MAP[rec.asset] || rec.asset}{' '}
        <span style={{ color: 'var(--green)' }}>€{rec.amount.toFixed(2)}</span>
      </div>
      <div style={{ fontFamily: 'var(--mono)', fontSize: 10, color: 'var(--muted)', marginTop: 6 }}>
        via {rec.route} · BUY
      </div>
    </div>
  )
}

export default function WeeklyBrief({ onBack }) {
  const [rec, setRec] = useState(null)
  const [loading, setLoading] = useState(true)
  const [action, setAction] = useState(null)
  const [acting, setActing] = useState(false)

  useEffect(() => {
    getFinanceRecommendation()
      .then(r => { setRec(r); setLoading(false) })
      .catch(() => setLoading(false))
  }, [])

  async function handleAction(actionName) {
    if (!rec?.brief_id) {
      setAction({ name: actionName, weekLabel: rec?.week_label })
      return
    }
    setActing(true)
    try {
      await postBriefAction(rec.brief_id, actionName)
      setAction({ name: actionName, weekLabel: rec.week_label })
    } catch {
      setAction({ name: actionName, weekLabel: rec?.week_label })
    } finally {
      setActing(false)
    }
  }

  const cryptoRec = rec?.recommendations.find(r => r.lane === 'crypto')
  const etfRec = rec?.recommendations.find(r => r.lane === 'etf')

  return (
    <div style={{ height: '100%', overflowY: 'auto', padding: 16, background: 'transparent', color: 'var(--text)' }}>
      <Header onBack={onBack} mode={rec?.portfolio_mode} />

      {action ? (
        <ConfirmState action={action.name} weekLabel={action.weekLabel} onBack={() => setAction(null)} />
      ) : loading ? (
        <div style={{ color: 'var(--dim)', fontFamily: 'var(--mono)', textAlign: 'center', paddingTop: 60 }}>
          Loading…
        </div>
      ) : (
        <>
          {cryptoRec && <RecCard rec={cryptoRec} laneColor="#f7931a" laneLabel="CRYPTO LANE" />}
          {etfRec && <RecCard rec={etfRec} laneColor="var(--cyan)" laneLabel="ETF LANE" />}

          {!cryptoRec && !etfRec && (
            <div className="glass" style={{ padding: 24, textAlign: 'center', marginBottom: 10 }}>
              <div className="panel-title" style={{ color: 'var(--dim)' }}>NO BUYS THIS WEEK</div>
            </div>
          )}

          {/* Budget row */}
          <div className="glass" style={{ padding: 14, marginBottom: 12 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span style={{ fontFamily: 'var(--mono)', fontSize: 9, color: 'var(--muted)', letterSpacing: '.08em' }}>
                WEEKLY BUDGET
              </span>
              <span style={{ fontFamily: 'var(--display)', fontSize: 22, color: '#fff' }}>
                €{rec?.week_budget?.toFixed(2) ?? '—'}
              </span>
            </div>
          </div>

          {/* Warnings */}
          {rec?.warnings?.length > 0 && (
            <div className="glass" style={{ padding: 14, marginBottom: 12, borderLeft: '3px solid var(--gold)' }}>
              <div className="panel-title" style={{ color: 'var(--gold)' }}>WARNINGS</div>
              {rec.warnings.map((w, i) => (
                <div key={i} style={{
                  fontFamily: 'var(--mono)', fontSize: 10, color: 'var(--text)',
                  marginBottom: i < rec.warnings.length - 1 ? 6 : 0,
                  paddingLeft: 10, borderLeft: '2px solid var(--gold)',
                }}>
                  {w}
                </div>
              ))}
            </div>
          )}

          {/* News context */}
          {rec?.news_thesis && (
            <div className="glass" style={{ padding: 14, marginBottom: 12, borderLeft: '3px solid var(--gold)' }}>
              <div style={{ fontFamily: 'var(--mono)', fontSize: 9, color: 'var(--gold)', letterSpacing: '.12em', marginBottom: 8 }}>
                JARVIS NEWS CONTEXT
              </div>
              <div style={{ fontFamily: 'var(--body)', fontSize: 13, color: 'var(--text)', lineHeight: 1.5 }}>
                {rec.news_thesis}
              </div>
            </div>
          )}

          {/* Action buttons */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 8, marginTop: 4 }}>
            <button onClick={() => handleAction('approved')} disabled={acting} className={`action safe lg${acting ? ' ghost' : ''}`}>
              APPROVE
            </button>
            <button onClick={() => handleAction('deferred')} disabled={acting} className={`action warn lg${acting ? ' ghost' : ''}`}>
              DEFER
            </button>
            <button onClick={() => handleAction('rejected')} disabled={acting} className={`action danger lg${acting ? ' ghost' : ''}`}>
              REJECT
            </button>
          </div>
        </>
      )}
    </div>
  )
}
