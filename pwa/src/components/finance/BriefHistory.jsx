import { useState, useEffect } from 'react'
import { getFinanceBriefHistory, postBriefAction, deleteBrief } from '../../api/client'

const KEYFRAMES = `@keyframes phScan { 0%{transform:translateX(-100%)} 100%{transform:translateX(100%)} }`

const border = '1px solid rgba(0,187,221,.18)'
const muted = 'rgba(0,187,221,.45)'
const MONO = "'Share Tech Mono', monospace"
const DISPLAY = "'Rajdhani', sans-serif"
const BODY = "'Space Grotesk', sans-serif"
const BG = '#060c12'
const CARD = '#070e15'
const ACCENT = '#00bbdd'

const STATUS_COLOR = {
  approved: '#4dffb4',
  pending:  ACCENT,
  deferred: 'rgba(0,187,221,.4)',
  rejected: 'rgba(255,92,122,.7)',
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
  } catch { return {} }
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

function Field({ label, value, color = ACCENT }) {
  return (
    <div style={{ background: 'rgba(0,187,221,.03)', border, padding: '10px 12px', minWidth: 0 }}>
      <div style={{ fontFamily: MONO, fontSize: 7, letterSpacing: '.16em', color: muted, marginBottom: 4 }}>{label}</div>
      <div style={{ fontFamily: MONO, fontSize: 13, color, overflowWrap: 'anywhere' }}>{value}</div>
    </div>
  )
}

function Drawer({ brief, onClose, onAction, onDelete }) {
  const [acting, setActing] = useState(false)
  const [acted, setActed] = useState(null)
  const [actError, setActError] = useState('')
  const [deleting, setDeleting] = useState(false)
  const [deleted, setDeleted] = useState(false)

  async function handleAction(action) {
    setActing(true); setActError('')
    try {
      await postBriefAction(brief.id, action)
      setActed(action)
      if (onAction) onAction(brief.id, action)
    } catch (e) { setActError(e?.message || 'Action failed.') }
    finally { setActing(false) }
  }

  async function handleDelete() {
    setDeleting(true); setActError('')
    try {
      await deleteBrief(brief.id)
      setDeleted(true)
      if (onDelete) onDelete(brief.id)
      setTimeout(onClose, 600)
    } catch (e) { setActError(e?.message || 'Delete failed.') }
    finally { setDeleting(false) }
  }

  const statusColor = STATUS_COLOR[brief.status] || muted
  const outcomeNote = brief.outcome_note || null
  const outcomePct  = brief.outcome_pct != null ? brief.outcome_pct : null
  const { recommendations, assetLabel, totalAmount } = getBriefSummary(brief)
  const canAct = !acted && (brief.status === 'pending' || brief.status === 'deferred')
  const canDelete = !deleted && brief.status === 'rejected'

  return (
    <>
      <div onClick={onClose} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,.7)', zIndex: 15 }} />
      <div style={{ position: 'fixed', bottom: 88, left: 0, right: 0, maxWidth: 430, margin: '0 auto', background: CARD, borderTop: `1px solid rgba(0,187,221,.3)`, zIndex: 20, maxHeight: '78vh', overflowY: 'auto' }}>
        <div style={{ position: 'absolute', top: 0, left: 0, right: 0, height: 1, background: `linear-gradient(90deg, rgba(0,187,221,.6), rgba(0,187,221,.15), transparent)` }} />
        <div style={{ width: 36, height: 3, background: 'rgba(0,187,221,.25)', borderRadius: 2, margin: '12px auto 0' }} />
        <div style={{ padding: '16px 18px 36px' }}>

          <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 14 }}>
            <div>
              <div style={{ fontFamily: DISPLAY, fontSize: 22, fontWeight: 700, color: '#eef6f9', lineHeight: 1 }}>{assetLabel}</div>
              <div style={{ fontFamily: MONO, fontSize: 8, color: muted, letterSpacing: '.12em', marginTop: 3 }}>{brief.week_label} · {formatDate(brief.created_at)}</div>
            </div>
            <span onClick={onClose} style={{ fontFamily: MONO, fontSize: 9, color: muted, cursor: 'pointer', padding: 4 }}>✕ CLOSE</span>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginBottom: 12 }}>
            <Field label="ACTION" value={brief.action || '—'} color="#4dffb4" />
            <Field label="TOTAL BUDGET" value={formatEur(totalAmount)} />
            <Field label="STATUS" value={STATUS_LABEL[brief.status] || brief.status || '—'} color={statusColor} />
            <Field label="RECOMMENDATIONS" value={String(recommendations.length)} />
          </div>

          {recommendations.length > 0 && (
            <div style={{ padding: '10px 13px', border, background: 'rgba(0,187,221,.02)', marginBottom: 12 }}>
              <div style={{ fontFamily: MONO, fontSize: 7, letterSpacing: '.2em', color: muted, marginBottom: 8 }}>RECOMMENDATION LINES</div>
              {recommendations.map((rec, index) => (
                <div key={`${rec.asset}-${index}`} style={{ padding: '7px 0', borderTop: index === 0 ? 'none' : '1px solid rgba(0,187,221,.1)', fontFamily: MONO, fontSize: 10, lineHeight: 1.5, overflowWrap: 'anywhere' }}>
                  <span style={{ color: '#eef6f9' }}>{String(rec.asset).toUpperCase()}</span>
                  <span style={{ color: muted }}> — </span>
                  <span style={{ color: ACCENT }}>{formatEur(rec.amount)}</span>
                  <span style={{ color: muted }}> — {rec.route || 'ROUTE NOT RECORDED'}</span>
                </div>
              ))}
            </div>
          )}

          {(outcomePct != null || outcomeNote) && (
            <div style={{ padding: '10px 13px', border, background: 'rgba(0,187,221,.02)', marginBottom: 12 }}>
              <div style={{ fontFamily: MONO, fontSize: 7, letterSpacing: '.2em', color: muted, marginBottom: 5 }}>OUTCOME</div>
              {outcomePct != null && (
                <div style={{ fontFamily: DISPLAY, fontSize: 26, fontWeight: 700, color: outcomePct >= 0 ? '#4dffb4' : '#ff5c7a', marginBottom: 4 }}>
                  {outcomePct >= 0 ? '+' : ''}{outcomePct.toFixed(2)}%
                </div>
              )}
              {outcomeNote && <div style={{ fontSize: 12, fontWeight: 300, lineHeight: 1.6, color: 'rgba(199,236,244,.72)', fontFamily: BODY }}>{outcomeNote}</div>}
            </div>
          )}

          {brief.thesis && (
            <div style={{ border, borderLeft: `3px solid rgba(0,187,221,.6)`, padding: '12px 13px', marginBottom: 12 }}>
              <div style={{ fontFamily: MONO, fontSize: 7, letterSpacing: '.2em', color: muted, marginBottom: 7 }}>THESIS</div>
              <div style={{ fontSize: 13, fontWeight: 300, lineHeight: 1.7, color: 'rgba(199,236,244,.85)', fontFamily: BODY }}>{brief.thesis}</div>
            </div>
          )}

          {brief.user_action_at && (
            <div style={{ fontFamily: MONO, fontSize: 7, color: muted, letterSpacing: '.1em' }}>
              DECISION AT {formatDate(brief.user_action_at)}
            </div>
          )}

          {canAct && (
            <div style={{ marginTop: 16, paddingTop: 14, borderTop: border }}>
              <div style={{ fontFamily: MONO, fontSize: 7, letterSpacing: '.16em', color: muted, marginBottom: 9 }}>ACTIONS</div>
              {actError && <div style={{ color: '#ff5c7a', fontFamily: MONO, fontSize: 7, marginBottom: 7 }}>{actError}</div>}
              <div style={{ display: 'flex', gap: 9 }}>
                <button onClick={() => handleAction('defer')} disabled={acting} style={{ flex: 1, padding: '10px 0', border: '1px solid rgba(180,200,210,.35)', background: 'linear-gradient(180deg, rgba(255,255,255,.04), transparent 55%), rgba(180,200,210,.04)', color: '#b4c8d2', fontFamily: MONO, fontSize: 8, letterSpacing: '.14em', cursor: acting ? 'wait' : 'pointer' }}>DEFER</button>
                <button onClick={() => handleAction('reject')} disabled={acting} style={{ flex: 1, padding: '10px 0', border: '1px solid rgba(255,92,122,.6)', background: 'linear-gradient(180deg, rgba(255,255,255,.04), transparent 55%), rgba(255,92,122,.06)', color: '#ff8fa0', fontFamily: MONO, fontSize: 8, letterSpacing: '.14em', cursor: acting ? 'wait' : 'pointer' }}>REJECT</button>
              </div>
            </div>
          )}
          {acted && (
            <div style={{ marginTop: 14, padding: '9px 11px', border: `1px solid ${acted === 'reject' ? 'rgba(255,92,122,.4)' : border}`, fontFamily: MONO, fontSize: 8, color: acted === 'reject' ? '#ff8fa0' : muted, letterSpacing: '.12em' }}>
              BRIEF {acted.toUpperCase()}ED
            </div>
          )}

          {canDelete && (
            <div style={{ marginTop: 16, paddingTop: 14, borderTop: '1px solid rgba(255,92,122,.15)' }}>
              {actError && <div style={{ color: '#ff5c7a', fontFamily: MONO, fontSize: 7, marginBottom: 7 }}>{actError}</div>}
              <button
                onClick={handleDelete}
                disabled={deleting}
                style={{ width: '100%', padding: '10px 0', border: '1px solid rgba(255,92,122,.35)', background: 'linear-gradient(180deg, rgba(255,255,255,.04), transparent 55%), rgba(255,92,122,.05)', color: 'rgba(255,92,122,.6)', fontFamily: MONO, fontSize: 8, letterSpacing: '.16em', cursor: deleting ? 'wait' : 'pointer' }}
              >
                {deleting ? 'DELETING…' : 'DELETE BRIEF'}
              </button>
            </div>
          )}
          {deleted && (
            <div style={{ marginTop: 14, padding: '9px 11px', border: '1px solid rgba(255,92,122,.25)', fontFamily: MONO, fontSize: 8, color: 'rgba(255,92,122,.5)', letterSpacing: '.12em' }}>
              BRIEF DELETED
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
    if (!document.getElementById('ph-keyframes')) {
      const style = document.createElement('style')
      style.id = 'ph-keyframes'; style.textContent = KEYFRAMES
      document.head.appendChild(style)
    }
  }, [])

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
    <div className="phx-scope-finance" style={{ height: '100%', overflowY: 'auto', paddingBottom: 100, background: BG, color: 'rgba(199,236,244,.92)', fontFamily: BODY }}>

      {/* Top bar */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '13px 18px 11px', borderBottom: border, position: 'sticky', top: 0, background: `${CARD}f5`, backdropFilter: 'blur(12px)', zIndex: 5, overflow: 'hidden' }}>
        <div style={{ position: 'absolute', top: 0, left: 0, right: 0, height: 1, background: `linear-gradient(90deg,transparent,${ACCENT},transparent)`, animation: 'phScan 4s linear infinite' }} />
        <div style={{ display: 'flex', alignItems: 'center' }}>
          <span onClick={onBack} style={{ color: ACCENT, fontSize: 16, marginRight: 10, cursor: 'pointer' }}>←</span>
          <span style={{ fontFamily: DISPLAY, fontSize: 16, fontWeight: 700, letterSpacing: '.28em', color: ACCENT, textShadow: '0 0 20px rgba(0,187,221,.4)' }}>BRIEF HISTORY</span>
        </div>
        <span style={{ fontFamily: MONO, fontSize: 8, color: muted, letterSpacing: '.14em' }}>{loading ? '…' : `${total} BRIEFS`}</span>
      </div>

      {loadError && (
        <div style={{ margin: 18, padding: '12px 14px', border: '1px solid rgba(255,92,122,.3)', background: 'rgba(255,92,122,.04)', color: '#ff5c7a', fontFamily: MONO, fontSize: 8, letterSpacing: '.1em' }}>
          UNABLE TO LOAD BRIEF HISTORY
        </div>
      )}

      {/* Stats strip */}
      {!loading && !loadError && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', borderBottom: border, background: 'rgba(0,187,221,.02)' }}>
          {[['TOTAL', String(total), ACCENT], ['APPROVED', String(approved), '#4dffb4'], ['REJECTED', String(rejected), '#ffd56b']].map(([lbl, val, c], i) => (
            <div key={lbl} style={{ padding: '12px 10px', borderRight: i < 2 ? border : 'none', textAlign: 'center' }}>
              <div style={{ fontFamily: MONO, fontSize: 7, letterSpacing: '.14em', color: muted, marginBottom: 4 }}>{lbl}</div>
              <div style={{ fontFamily: DISPLAY, fontSize: 17, fontWeight: 700, letterSpacing: '.03em', color: c }}>{val}</div>
            </div>
          ))}
        </div>
      )}

      {/* Filter tabs */}
      <div style={{ display: 'flex', padding: '0 18px', borderBottom: border, background: CARD }}>
        {FILTER_KEYS.map(key => (
          <div key={key} onClick={() => setFilterKey(key)} style={{ fontFamily: MONO, fontSize: 8, letterSpacing: '.18em', padding: '9px 10px 8px', cursor: 'pointer', color: filterKey === key ? ACCENT : muted, borderBottom: `2px solid ${filterKey === key ? ACCENT : 'transparent'}`, marginBottom: -1, transition: 'color .15s' }}>
            {key.toUpperCase()}
          </div>
        ))}
      </div>

      {loading && (
        <div style={{ padding: '40px 20px', textAlign: 'center', fontFamily: MONO, fontSize: 9, letterSpacing: '.2em', color: muted }}>LOADING…</div>
      )}

      {!loading && !loadError && list.length === 0 && (
        <div style={{ padding: '48px 24px', textAlign: 'center' }}>
          <div style={{ fontFamily: MONO, fontSize: 8, letterSpacing: '.22em', color: muted, marginBottom: 12 }}>NO BRIEFS YET</div>
          <div style={{ fontSize: 13, fontWeight: 300, lineHeight: 1.7, color: 'rgba(199,236,244,.55)', maxWidth: 280, margin: '0 auto', fontFamily: BODY }}>No real brief history yet.</div>
        </div>
      )}

      {!loading && filtered.length === 0 && list.length > 0 && (
        <div style={{ padding: '40px 20px', textAlign: 'center', fontFamily: MONO, fontSize: 9, letterSpacing: '.2em', color: muted }}>NO BRIEFS IN THIS CATEGORY</div>
      )}

      {/* Brief list */}
      <div style={{ display: 'flex', flexDirection: 'column' }}>
        {filtered.map(b => {
          const statusColor = STATUS_COLOR[b.status] || muted
          const hasOutcome = b.outcome_pct != null
          const { assetLabel, totalAmount } = getBriefSummary(b)
          return (
            <div
              key={b.id}
              onClick={() => setSelected(b.id)}
              style={{ padding: '13px 15px', borderBottom: '1px solid rgba(0,187,221,.07)', cursor: 'pointer', borderLeft: `3px solid ${statusColor}` }}
            >
              <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 5 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                  <span style={{ fontFamily: MONO, fontSize: 8, letterSpacing: '.14em', color: muted }}>{b.week_label}</span>
                  <span style={{ fontFamily: MONO, fontSize: 9, fontWeight: 700, letterSpacing: '.16em', padding: '2px 7px', border: '1px solid rgba(77,255,180,.35)', color: '#4dffb4', background: 'rgba(77,255,180,.07)' }}>{b.action || '—'}</span>
                  <span style={{ fontFamily: DISPLAY, fontSize: 16, fontWeight: 700, color: '#eef6f9', lineHeight: 1, overflowWrap: 'anywhere' }}>{assetLabel}</span>
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 4, flexShrink: 0 }}>
                  {hasOutcome
                    ? <span style={{ fontFamily: BODY, fontSize: 13, fontWeight: 600, color: b.outcome_pct >= 0 ? '#4dffb4' : '#ff5c7a' }}>{b.outcome_pct >= 0 ? '+' : ''}{Number(b.outcome_pct).toFixed(2)}%</span>
                    : <span style={{ fontFamily: MONO, fontSize: 12, color: muted }}>—</span>
                  }
                  <span style={{ fontFamily: MONO, fontSize: 7, letterSpacing: '.14em', padding: '2px 6px', border, color: statusColor }}>{STATUS_LABEL[b.status] || b.status}</span>
                </div>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginTop: 5 }}>
                <span style={{ fontFamily: MONO, fontSize: 7, color: 'rgba(0,187,221,.3)', letterSpacing: '.1em' }}>{formatDate(b.created_at)}</span>
                {totalAmount != null && (
                  <span style={{ fontFamily: MONO, fontSize: 8, color: 'rgba(199,236,244,.55)' }}>TOTAL {formatEur(totalAmount)}</span>
                )}
              </div>
            </div>
          )
        })}
      </div>

      {selectedBrief && (
        <Drawer
          brief={selectedBrief}
          onClose={() => setSelected(null)}
          onAction={(id, action) => {
            setBriefs(prev => prev.map(b => b.id === id ? { ...b, status: action === 'reject' ? 'rejected' : 'deferred' } : b))
          }}
          onDelete={(id) => {
            setBriefs(prev => prev.filter(b => b.id !== id))
            setSelected(null)
          }}
        />
      )}
    </div>
  )
}
