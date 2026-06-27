import { useState, useEffect } from 'react'
import { getFinanceBriefHistory } from '../../api/client'

const border = '1px solid rgba(32,216,236,.18)'
const muted = 'rgba(32,216,236,.38)'

const STATUS_COLOR = {
  approved: '#4dffb4',
  pending:  '#20d8ec',
  deferred: 'rgba(32,216,236,.35)',
  rejected: 'rgba(255,92,122,.5)',
}

const STATUS_LABEL = {
  approved: 'APPROVED',
  pending:  'PENDING',
  deferred: 'DEFERRED',
  rejected: 'REJECTED',
}

function formatEur(value) {
  const n = Number(value)
  if (!Number.isFinite(n)) return '—'
  return n.toLocaleString('en-US', { style: 'currency', currency: 'EUR', minimumFractionDigits: 2 })
}

function formatDate(iso) {
  if (!iso) return '—'
  return iso.slice(0, 10)
}

function parseStoredBrief(brief) {
  if (!brief?.full_brief_json) return {}
  if (typeof brief.full_brief_json === 'object') return brief.full_brief_json
  try {
    const parsed = JSON.parse(brief.full_brief_json)
    return parsed && typeof parsed === 'object' ? parsed : {}
  } catch {
    return {}
  }
}

function getBriefRecommendations(brief) {
  const stored = parseStoredBrief(brief)
  if (Array.isArray(stored.recommendations) && stored.recommendations.length > 0) {
    return stored.recommendations.filter(item => item && item.asset)
  }
  if (!brief?.asset) return []
  return [{ asset: brief.asset, amount: brief.amount_eur, route: brief.route }]
}

function getBriefSummary(brief) {
  const stored = parseStoredBrief(brief)
  const recommendations = getBriefRecommendations(brief)
  const assetLabel = recommendations.length > 0
    ? recommendations.map(item => String(item.asset).toUpperCase()).join(' + ')
    : '—'
  const storedBudget = Number(stored.week_budget)
  const totalAmount = Number.isFinite(storedBudget) ? storedBudget : brief.amount_eur
  return { recommendations, assetLabel, totalAmount }
}

// ── Drawer ────────────────────────────────────────────────────
function Drawer({ brief, onClose }) {
  const statusColor = STATUS_COLOR[brief.status] || muted
  const outcomeNote = brief.outcome_note || null
  const outcomePct  = brief.outcome_pct != null ? brief.outcome_pct : null
  const { recommendations, assetLabel, totalAmount } = getBriefSummary(brief)

  return (
    <>
      <div onClick={onClose} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,.65)', zIndex: 15 }} />
      <div style={{ position: 'fixed', bottom: 0, left: 0, right: 0, maxWidth: 430, margin: '0 auto', background: '#000', borderTop: border, zIndex: 20, maxHeight: '78vh', overflowY: 'auto' }}>
        <div style={{ width: 36, height: 3, background: 'rgba(32,216,236,.18)', borderRadius: 2, margin: '10px auto 0' }} />
        <div style={{ padding: '16px 18px 36px' }}>

          <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 14 }}>
            <div>
              <div style={{ fontFamily: 'var(--display)', fontSize: 22, fontWeight: 700, color: '#fff', lineHeight: 1 }}>
                {assetLabel}
              </div>
              <div style={{ fontFamily: 'var(--mono)', fontSize: 8, color: muted, letterSpacing: '.12em', marginTop: 3 }}>
                {brief.week_label} · {formatDate(brief.created_at)}
              </div>
            </div>
            <span onClick={onClose} style={{ fontFamily: 'var(--mono)', fontSize: 9, color: muted, cursor: 'pointer', padding: 4 }}>✕ CLOSE</span>
          </div>

          {/* Status + amount */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginBottom: 12 }}>
            <div style={{ background: 'rgba(32,216,236,.025)', border, padding: '10px 12px' }}>
              <div style={{ fontFamily: 'var(--mono)', fontSize: 7, letterSpacing: '.16em', color: muted, marginBottom: 4 }}>ACTION</div>
              <div style={{ fontFamily: 'var(--mono)', fontSize: 13, color: '#4dffb4' }}>{brief.action || '—'}</div>
            </div>
            <div style={{ background: 'rgba(32,216,236,.025)', border, padding: '10px 12px' }}>
              <div style={{ fontFamily: 'var(--mono)', fontSize: 7, letterSpacing: '.16em', color: muted, marginBottom: 4 }}>TOTAL BUDGET</div>
              <div style={{ fontFamily: 'var(--mono)', fontSize: 13, color: '#7df0ff' }}>{formatEur(totalAmount)}</div>
            </div>
            <div style={{ background: 'rgba(32,216,236,.025)', border, padding: '10px 12px' }}>
              <div style={{ fontFamily: 'var(--mono)', fontSize: 7, letterSpacing: '.16em', color: muted, marginBottom: 4 }}>STATUS</div>
              <div style={{ fontFamily: 'var(--mono)', fontSize: 13, color: statusColor }}>{STATUS_LABEL[brief.status] || brief.status || '—'}</div>
            </div>
            <div style={{ background: 'rgba(32,216,236,.025)', border, padding: '10px 12px' }}>
              <div style={{ fontFamily: 'var(--mono)', fontSize: 7, letterSpacing: '.16em', color: muted, marginBottom: 4 }}>RECOMMENDATIONS</div>
              <div style={{ fontFamily: 'var(--mono)', fontSize: 13, color: '#7df0ff' }}>{recommendations.length}</div>
            </div>
          </div>

          {recommendations.length > 0 && (
            <div style={{ padding: '10px 13px', border, background: 'rgba(32,216,236,.02)', marginBottom: 12 }}>
              <div style={{ fontFamily: 'var(--mono)', fontSize: 7, letterSpacing: '.2em', color: muted, marginBottom: 8 }}>RECOMMENDATION LINES</div>
              {recommendations.map((recommendation, index) => (
                <div key={`${recommendation.asset}-${index}`} style={{ padding: '7px 0', borderTop: index === 0 ? 'none' : '1px solid rgba(32,216,236,.1)', fontFamily: 'var(--mono)', fontSize: 10, lineHeight: 1.5, overflowWrap: 'anywhere' }}>
                  <span style={{ color: '#fff' }}>{String(recommendation.asset).toUpperCase()}</span>
                  <span style={{ color: muted }}> — </span>
                  <span style={{ color: '#7df0ff' }}>{formatEur(recommendation.amount)}</span>
                  <span style={{ color: muted }}> — {recommendation.route || 'ROUTE NOT RECORDED'}</span>
                </div>
              ))}
            </div>
          )}

          {/* Outcome */}
          {(outcomePct != null || outcomeNote) && (
            <div style={{ padding: '10px 13px', border, background: 'rgba(32,216,236,.02)', marginBottom: 12 }}>
              <div style={{ fontFamily: 'var(--mono)', fontSize: 7, letterSpacing: '.2em', color: muted, marginBottom: 5 }}>OUTCOME</div>
              {outcomePct != null && (
                <div style={{ fontFamily: 'var(--display)', fontSize: 26, fontWeight: 700, color: outcomePct >= 0 ? '#4dffb4' : '#ff5c7a', marginBottom: 4 }}>
                  {outcomePct >= 0 ? '+' : ''}{outcomePct.toFixed(2)}%
                </div>
              )}
              {outcomeNote && (
                <div style={{ fontSize: 12, fontWeight: 300, lineHeight: 1.6, color: 'rgba(199,236,244,.72)' }}>{outcomeNote}</div>
              )}
            </div>
          )}

          {/* Thesis */}
          {brief.thesis && (
            <div style={{ border, borderLeft: '3px solid #20d8ec', padding: '12px 13px', marginBottom: 12 }}>
              <div style={{ fontFamily: 'var(--mono)', fontSize: 7, letterSpacing: '.2em', color: muted, marginBottom: 7 }}>THESIS</div>
              <div style={{ fontSize: 13, fontWeight: 300, lineHeight: 1.7, color: 'rgba(199,236,244,.85)' }}>{brief.thesis}</div>
            </div>
          )}

          {/* User action */}
          {brief.user_action_at && (
            <div style={{ fontFamily: 'var(--mono)', fontSize: 7, color: muted, letterSpacing: '.1em' }}>
              DECISION AT {formatDate(brief.user_action_at)}
            </div>
          )}
        </div>
      </div>
    </>
  )
}

const FILTER_KEYS = ['all', 'approved', 'pending', 'deferred', 'rejected']

export default function BriefHistory({ onBack }) {
  const [filterKey, setFilterKey] = useState('all')
  const [selected, setSelected] = useState(null)
  const [briefs, setBriefs] = useState(null)
  const [loadError, setLoadError] = useState(false)

  useEffect(() => {
    getFinanceBriefHistory()
      .then(r => setBriefs(Array.isArray(r.history) ? r.history : []))
      .catch(() => setLoadError(true))
  }, [])

  const loading = briefs === null && !loadError
  const list = briefs ?? []
  const filtered = filterKey === 'all' ? list : list.filter(b => b.status === filterKey)
  const selectedBrief = selected !== null ? list.find(b => b.id === selected) ?? null : null

  const approved = list.filter(b => b.status === 'approved').length
  const total = list.length
  const rejected = list.filter(b => b.status === 'rejected').length

  return (
    <div style={{ height: '100%', overflowY: 'auto', background: '#000', color: 'rgba(199,236,244,.92)', fontFamily: "'Saira Condensed',sans-serif" }}>

      {/* TOP BAR */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '13px 18px 11px', borderBottom: border, position: 'sticky', top: 0, background: 'rgba(0,0,0,.96)', backdropFilter: 'blur(12px)', zIndex: 5 }}>
        <div style={{ display: 'flex', alignItems: 'center' }}>
          <span onClick={onBack} style={{ color: '#20d8ec', fontSize: 16, marginRight: 10, cursor: 'pointer' }}>←</span>
          <span style={{ fontFamily: 'var(--display)', fontSize: 13, fontWeight: 700, letterSpacing: '.28em', color: '#7df0ff' }}>BRIEF HISTORY</span>
        </div>
        <span style={{ fontFamily: 'var(--mono)', fontSize: 8, color: muted, letterSpacing: '.14em' }}>{loading ? '…' : `${total} BRIEFS`}</span>
      </div>

      {loadError && (
        <div style={{ margin: 18, padding: '12px 14px', border: '1px solid rgba(255,92,122,.3)', background: 'rgba(255,92,122,.04)', color: '#ff5c7a', fontFamily: 'var(--mono)', fontSize: 8, letterSpacing: '.1em' }}>
          UNABLE TO LOAD BRIEF HISTORY
        </div>
      )}

      {/* STATS STRIP — real counts only, no fabricated returns */}
      {!loading && !loadError && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', borderBottom: border, background: 'rgba(32,216,236,.02)' }}>
          {[
            ['TOTAL', String(total),    '#7df0ff'],
            ['APPROVED', String(approved), '#4dffb4'],
            ['REJECTED', String(rejected), '#ffd56b'],
          ].map(([lbl, val, c]) => (
            <div key={lbl} style={{ padding: '12px 10px', borderRight: lbl !== 'REJECTED' ? border : 'none', textAlign: 'center' }}>
              <div style={{ fontFamily: 'var(--mono)', fontSize: 7, letterSpacing: '.14em', color: muted, marginBottom: 4 }}>{lbl}</div>
              <div style={{ fontFamily: 'var(--display)', fontSize: 17, fontWeight: 700, letterSpacing: '.03em', color: c }}>{val}</div>
            </div>
          ))}
        </div>
      )}

      {/* FILTER TABS */}
      <div style={{ display: 'flex', padding: '0 18px', borderBottom: border }}>
        {FILTER_KEYS.map(key => (
          <div key={key} onClick={() => setFilterKey(key)} style={{ fontFamily: 'var(--mono)', fontSize: 8, letterSpacing: '.18em', padding: '9px 10px 8px', cursor: 'pointer', color: filterKey === key ? '#7df0ff' : muted, borderBottom: `2px solid ${filterKey === key ? '#7df0ff' : 'transparent'}`, marginBottom: -1, transition: 'color .15s' }}>
            {key.toUpperCase()}
          </div>
        ))}
      </div>

      {/* BRIEF LIST */}
      {loading && (
        <div style={{ padding: '40px 20px', textAlign: 'center', fontFamily: 'var(--mono)', fontSize: 9, letterSpacing: '.2em', color: muted }}>
          LOADING…
        </div>
      )}

      {!loading && !loadError && list.length === 0 && (
        <div style={{ padding: '48px 24px', textAlign: 'center' }}>
          <div style={{ fontFamily: 'var(--mono)', fontSize: 8, letterSpacing: '.22em', color: muted, marginBottom: 12 }}>NO BRIEFS YET</div>
          <div style={{ fontSize: 13, fontWeight: 300, lineHeight: 1.7, color: 'rgba(199,236,244,.55)', maxWidth: 280, margin: '0 auto' }}>
            No real brief history yet.
          </div>
        </div>
      )}

      {!loading && filtered.length === 0 && list.length > 0 && (
        <div style={{ padding: '40px 20px', textAlign: 'center', fontFamily: 'var(--mono)', fontSize: 9, letterSpacing: '.2em', color: muted }}>
          NO BRIEFS IN THIS CATEGORY
        </div>
      )}

      <div style={{ display: 'flex', flexDirection: 'column' }}>
        {filtered.map(b => {
          const statusColor = STATUS_COLOR[b.status] || muted
          const hasOutcome = b.outcome_pct != null
          const { assetLabel, totalAmount } = getBriefSummary(b)
          return (
            <div
              key={b.id}
              onClick={() => setSelected(b.id)}
              style={{ padding: '13px 15px', borderBottom: '1px solid rgba(32,216,236,.08)', cursor: 'pointer', borderLeft: `3px solid ${statusColor}` }}
            >
              <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 5 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                  <span style={{ fontFamily: 'var(--mono)', fontSize: 8, letterSpacing: '.14em', color: muted }}>{b.week_label}</span>
                  <span style={{ fontFamily: 'var(--display)', fontSize: 10, fontWeight: 700, letterSpacing: '.16em', padding: '2px 7px', border: '1px solid rgba(77,255,180,.35)', color: '#4dffb4', background: 'rgba(77,255,180,.07)' }}>{b.action || '—'}</span>
                  <span style={{ fontFamily: 'var(--display)', fontSize: 16, fontWeight: 700, color: '#fff', lineHeight: 1, overflowWrap: 'anywhere' }}>{assetLabel}</span>
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 4, flexShrink: 0 }}>
                  {hasOutcome
                    ? <span style={{ fontFamily: 'var(--mono)', fontSize: 12, fontWeight: 600, color: b.outcome_pct >= 0 ? '#4dffb4' : '#ff5c7a' }}>{b.outcome_pct >= 0 ? '+' : ''}{Number(b.outcome_pct).toFixed(2)}%</span>
                    : <span style={{ fontFamily: 'var(--mono)', fontSize: 12, color: muted }}>—</span>
                  }
                  <span style={{ fontFamily: 'var(--mono)', fontSize: 7, letterSpacing: '.14em', padding: '2px 6px', border, color: statusColor }}>{STATUS_LABEL[b.status] || b.status}</span>
                </div>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginTop: 5 }}>
                <span style={{ fontFamily: 'var(--mono)', fontSize: 7, color: 'rgba(32,216,236,.3)', letterSpacing: '.1em' }}>{formatDate(b.created_at)}</span>
                {totalAmount != null && (
                  <span style={{ fontFamily: 'var(--mono)', fontSize: 8, color: 'rgba(199,236,244,.55)' }}>TOTAL {formatEur(totalAmount)}</span>
                )}
              </div>
            </div>
          )
        })}
      </div>

      {selectedBrief && <Drawer brief={selectedBrief} onClose={() => setSelected(null)} />}
    </div>
  )
}
