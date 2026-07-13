import { useEffect, useState } from 'react'
import { ACC, G, Y, R, W, BODY, INK, FM, FD, FB, a, mix, deep } from '../holoTokens'
import { getFinanceBriefHistory, postBriefAction, deleteBrief } from '../../../api/client'
import { financeBody, financeButton, financeLabel, financeMicro } from './financeReadability'

const STATUS_COLOR = { approved: G, pending: ACC, deferred: a(ACC, '66'), rejected: R }
const STATUS_LABEL = { approved: 'APPROVED', pending: 'PENDING', deferred: 'DEFERRED', rejected: 'REJECTED' }
const FILTERS = ['all', 'approved', 'pending', 'deferred', 'rejected']

const eur = v => {
  const n = Number(v)
  return Number.isFinite(n) ? n.toLocaleString('en-US', { style: 'currency', currency: 'EUR', minimumFractionDigits: 2 }) : '—'
}
const day = iso => (iso ? String(iso).slice(0, 10) : '—')

function parseStored(b) {
  if (!b?.full_brief_json) return {}
  if (typeof b.full_brief_json === 'object') return b.full_brief_json
  try { const p = JSON.parse(b.full_brief_json); return p && typeof p === 'object' ? p : {} } catch { return {} }
}
function recsOf(b) {
  const s = parseStored(b)
  if (Array.isArray(s.recommendations) && s.recommendations.length) return s.recommendations.filter(r => r && r.asset)
  return b?.asset ? [{ asset: b.asset, amount: b.amount_eur, route: b.route }] : []
}
function summary(b) {
  const recs = recsOf(b)
  const label = recs.length ? recs.map(r => String(r.asset).toUpperCase()).join(' + ') : '—'
  const budget = Number(parseStored(b).week_budget)
  return { recs, label, total: Number.isFinite(budget) ? budget : b.amount_eur }
}

function Detail({ brief, onActed, onDeleted }) {
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')
  const { recs, total } = summary(brief)
  const canAct = brief.status === 'pending' || brief.status === 'deferred'
  const canDelete = brief.status === 'rejected'

  const act = async action => {
    setBusy(true); setErr('')
    try { await postBriefAction(brief.id, action); onActed(brief.id, action) }
    catch (e) { setErr(e?.message || 'Action failed.') }
    finally { setBusy(false) }
  }
  const del = async () => {
    setBusy(true); setErr('')
    try { await deleteBrief(brief.id); onDeleted(brief.id) }
    catch (e) { setErr(e?.message || 'Delete failed.'); setBusy(false) }
  }

  return (
    <div style={{ padding: '12px 13px', background: deep(60), borderTop: `1px solid ${a(ACC, '18')}` }}>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginBottom: 10 }}>
        <Cell label="ACTION" value={brief.action || '—'} color={G} />
        <Cell label="TOTAL BUDGET" value={eur(total)} />
        <Cell label="STATUS" value={STATUS_LABEL[brief.status] || brief.status} color={STATUS_COLOR[brief.status] || a(ACC, '99')} />
        <Cell label="LINES" value={String(recs.length)} />
      </div>
      {recs.length > 0 && (
        <div style={{ padding: '9px 11px', border: `1px solid ${a(ACC, '18')}`, marginBottom: 10 }}>
          <div style={{ ...financeLabel({ fontSize: 9, letterSpacing: '.16em', color: a(ACC, '99') }), marginBottom: 7 }}>RECOMMENDATION LINES</div>
          {recs.map((r, i) => (
            <div key={i} style={{ padding: '6px 0', borderTop: i ? `1px solid ${a(ACC, '10')}` : 'none', fontFamily: FM, fontSize: 10, lineHeight: 1.5, overflowWrap: 'anywhere' }}>
              <span style={{ color: W }}>{String(r.asset).toUpperCase()}</span>
              <span style={{ color: a(ACC, '99') }}> — </span>
              <span style={{ color: ACC }}>{eur(r.amount)}</span>
              <span style={{ color: a(ACC, '99') }}> — {r.route || 'ROUTE NOT RECORDED'}</span>
            </div>
          ))}
        </div>
      )}
      {(brief.outcome_pct != null || brief.outcome_note) && (
        <div style={{ padding: '9px 11px', border: `1px solid ${a(ACC, '18')}`, marginBottom: 10 }}>
          <div style={{ ...financeLabel({ fontSize: 9, letterSpacing: '.16em', color: a(ACC, '99') }), marginBottom: 5 }}>OUTCOME</div>
          {brief.outcome_pct != null && (
            <div style={{ fontFamily: FD, fontSize: 24, fontWeight: 700, color: brief.outcome_pct >= 0 ? G : R, marginBottom: 4 }}>{brief.outcome_pct >= 0 ? '+' : ''}{Number(brief.outcome_pct).toFixed(2)}%</div>
          )}
          {brief.outcome_note && <div style={financeBody({ fontSize: 13, lineHeight: 1.6, color: mix(BODY, 82) })}>{brief.outcome_note}</div>}
        </div>
      )}
      {brief.thesis && (
        <div style={{ border: `1px solid ${a(ACC, '18')}`, borderLeft: `3px solid ${a(ACC, '99')}`, padding: '11px 12px', marginBottom: 10 }}>
          <div style={{ ...financeLabel({ fontSize: 9, letterSpacing: '.16em', color: a(ACC, '99') }), marginBottom: 6 }}>THESIS</div>
          <div style={financeBody({ fontSize: 13, lineHeight: 1.65, color: mix(BODY, 88) })}>{brief.thesis}</div>
        </div>
      )}
      {err && <div style={{ color: R, fontFamily: FM, fontSize: 9, marginBottom: 8 }}>{err}</div>}
      {canAct && (
        <div style={{ display: 'flex', gap: 8 }}>
          <button onClick={() => act('defer')} disabled={busy} style={{ flex: 1, minHeight: 38, ...financeButton({ fontWeight: 400, color: mix(BODY, 80) }), background: deep(50), border: `1px solid ${a(ACC, '30')}`, cursor: busy ? 'wait' : 'pointer' }}>DEFER</button>
          <button onClick={() => act('reject')} disabled={busy} style={{ flex: 1, minHeight: 38, ...financeButton({ fontWeight: 400, color: R }), background: mix(R, 6), border: `1px solid ${mix(R, 40)}`, cursor: busy ? 'wait' : 'pointer' }}>REJECT</button>
        </div>
      )}
      {canDelete && (
        <button onClick={del} disabled={busy} style={{ width: '100%', minHeight: 38, ...financeButton({ fontWeight: 400, color: mix(R, 70) }), background: mix(R, 5), border: `1px solid ${mix(R, 30)}`, cursor: busy ? 'wait' : 'pointer' }}>{busy ? 'DELETING…' : 'DELETE BRIEF'}</button>
      )}
    </div>
  )
}

function Cell({ label, value, color = ACC }) {
  return (
    <div style={{ background: deep(50), border: `1px solid ${a(ACC, '18')}`, padding: '9px 11px', minWidth: 0 }}>
      <div style={{ ...financeMicro({ color: a(ACC, '99') }), marginBottom: 4 }}>{label}</div>
      <div style={{ fontFamily: FM, fontSize: 13, color, overflowWrap: 'anywhere' }}>{value}</div>
    </div>
  )
}

// ── FINANCE // BRIEF HISTORY — past weekly briefs + decisions (audit trail) ──
export function BriefHistoryContent() {
  const [briefs, setBriefs] = useState(null)
  const [error, setError] = useState(false)
  const [filter, setFilter] = useState('all')
  const [open, setOpen] = useState(null)

  useEffect(() => {
    let alive = true
    getFinanceBriefHistory()
      .then(r => { if (alive) setBriefs(Array.isArray(r.history) ? r.history : []) })
      .catch(() => { if (alive) setError(true) })
    return () => { alive = false }
  }, [])

  if (error) return <div style={{ padding: '20px 0', ...financeLabel({ fontSize: 9, color: R }) }}>UNABLE TO LOAD BRIEF HISTORY</div>
  if (briefs === null) return <div style={{ padding: '48px 0', textAlign: 'center', ...financeLabel({ fontSize: 9, letterSpacing: '.18em', color: a(ACC, '99') }) }}>LOADING…</div>

  const list = briefs
  const filtered = filter === 'all' ? list : list.filter(b => b.status === filter)
  const total = list.length
  const approved = list.filter(b => b.status === 'approved').length
  const rejected = list.filter(b => b.status === 'rejected').length

  return (
    <div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 8, marginBottom: 12 }}>
        {[['TOTAL', total, ACC], ['APPROVED', approved, G], ['REJECTED', rejected, Y]].map(([l, v, c]) => (
          <div key={l} style={{ border: `1px solid ${a(ACC, '20')}`, background: deep(58), padding: '10px 12px', textAlign: 'center' }}>
            <div style={{ fontFamily: FM, fontSize: 9, letterSpacing: '.14em', color: a(ACC, '99'), marginBottom: 4 }}>{l}</div>
            <div style={{ fontFamily: FD, fontSize: 18, fontWeight: 700, color: c }}>{v}</div>
          </div>
        ))}
      </div>

      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 12 }}>
        {FILTERS.map(k => (
          <button key={k} onClick={() => setFilter(k)} style={{ minHeight: 28, padding: '0 10px', fontFamily: FM, fontSize: 9, letterSpacing: '.14em', color: filter === k ? INK : a(ACC, 'cc'), background: filter === k ? ACC : deep(58), border: `1px solid ${a(ACC, filter === k ? '99' : '30')}`, cursor: 'pointer' }}>{k.toUpperCase()}</button>
        ))}
      </div>

      {list.length === 0 && <div style={{ padding: '40px 0', textAlign: 'center', fontFamily: FM, fontSize: 9, letterSpacing: '.16em', color: a(ACC, '99') }}>NO REAL BRIEF HISTORY YET</div>}
      {list.length > 0 && filtered.length === 0 && <div style={{ padding: '30px 0', textAlign: 'center', fontFamily: FM, fontSize: 9, letterSpacing: '.16em', color: a(ACC, '99') }}>NO BRIEFS IN THIS CATEGORY</div>}

      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        {filtered.map(b => {
          const sc = STATUS_COLOR[b.status] || a(ACC, '99')
          const { label } = summary(b)
          const isOpen = open === b.id
          return (
            <div key={b.id} style={{ border: `1px solid ${a(ACC, '18')}`, borderLeft: `3px solid ${sc}`, background: deep(58) }}>
              <div onClick={() => setOpen(isOpen ? null : b.id)} style={{ padding: '11px 13px', cursor: 'pointer' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10, alignItems: 'flex-start' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', minWidth: 0 }}>
                    <span style={{ fontFamily: FM, fontSize: 9, letterSpacing: '.14em', color: a(ACC, '99') }}>{b.week_label}</span>
                    <span style={{ fontFamily: FM, fontSize: 9, fontWeight: 700, letterSpacing: '.16em', padding: '2px 7px', border: `1px solid ${mix(G, 35)}`, color: G, background: mix(G, 7) }}>{b.action || '—'}</span>
                    <span style={{ fontFamily: FD, fontSize: 16, fontWeight: 700, color: W, lineHeight: 1, overflowWrap: 'anywhere' }}>{label}</span>
                  </div>
                  <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 4, flexShrink: 0 }}>
                    {b.outcome_pct != null
                      ? <span style={{ fontFamily: FB, fontSize: 13, fontWeight: 600, color: b.outcome_pct >= 0 ? G : R }}>{b.outcome_pct >= 0 ? '+' : ''}{Number(b.outcome_pct).toFixed(2)}%</span>
                      : <span style={{ fontFamily: FM, fontSize: 12, color: a(ACC, '99') }}>—</span>}
                    <span style={{ fontFamily: FM, fontSize: 9, letterSpacing: '.14em', padding: '2px 6px', border: `1px solid ${a(ACC, '18')}`, color: sc }}>{STATUS_LABEL[b.status] || b.status}</span>
                  </div>
                </div>
                <div style={{ fontFamily: FM, fontSize: 9, color: a(ACC, '55'), letterSpacing: '.1em', marginTop: 5 }}>{day(b.created_at)}</div>
              </div>
              {isOpen && (
                <Detail
                  brief={b}
                  onActed={(id, action) => setBriefs(prev => prev.map(x => x.id === id ? { ...x, status: action === 'reject' ? 'rejected' : 'deferred' } : x))}
                  onDeleted={id => { setBriefs(prev => prev.filter(x => x.id !== id)); setOpen(null) }}
                />
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}
