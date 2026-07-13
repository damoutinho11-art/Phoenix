import { useEffect, useState } from 'react'
import { ACC, G, Y, R, W, BODY, FM, FD, FB, a, mix, deep } from '../holoTokens'
import {
  getFinanceResearchMemos,
  getFinanceResearchValidationRecords,
  getFinanceResearchMemo,
  deleteFinanceResearchMemo,
} from '../../../api/client'

const verdictColor = { BUY_CANDIDATE: G, WATCH: ACC, REJECT: R, INSUFFICIENT_DATA: Y }
const valColor = { PASS: G, WARNING: Y, FAIL: R, UNVERIFIED: ACC }
const qualityLabel = {
  UNREVIEWED: ['UNREVIEWED', a(ACC, '99')],
  NEEDS_MORE_EVIDENCE: ['NEEDS MORE EVIDENCE', Y],
  VALIDATED: ['VALIDATED', G],
  REJECTED: ['REJECTED', R],
}
const fmtDate = v => {
  if (!v) return '—'
  const d = new Date(v)
  return Number.isNaN(d.getTime()) ? String(v) : d.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })
}

function MemoCard({ memo, onDelete }) {
  const [open, setOpen] = useState(false)
  const [detail, setDetail] = useState(null)
  const [detailErr, setDetailErr] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const vc = verdictColor[memo.verdict] || ACC
  const [qLabel, qColor] = qualityLabel[memo.research_quality_status || 'UNREVIEWED'] || qualityLabel.UNREVIEWED

  const toggleEvidence = async () => {
    if (open) { setOpen(false); return }
    setOpen(true); setDetail(null); setDetailErr(false)
    try { setDetail(await getFinanceResearchMemo(memo.id)) } catch { setDetailErr(true) }
  }
  const del = async () => {
    setDeleting(true)
    try { await deleteFinanceResearchMemo(memo.id); onDelete(memo.id) }
    catch { setDeleting(false) }
  }

  return (
    <div style={{ padding: '12px 13px', border: `1px solid ${a(ACC, '18')}`, borderLeft: `3px solid ${vc}`, background: deep(58) }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10, alignItems: 'flex-start' }}>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontFamily: FD, fontSize: 16, fontWeight: 700, color: W, lineHeight: 1.25 }}>{memo.title}</div>
          <div style={{ fontFamily: FM, fontSize: 7, color: a(ACC, '99'), marginTop: 4, letterSpacing: '.1em' }}>{[memo.asset, memo.sleeve].filter(Boolean).join(' · ').toUpperCase() || 'UNSCOPED'}</div>
        </div>
        <div style={{ display: 'flex', alignItems: 'flex-start', gap: 10, flexShrink: 0 }}>
          <div style={{ textAlign: 'right' }}>
            <div style={{ fontFamily: FM, fontSize: 7, color: vc, letterSpacing: '.1em' }}>{memo.verdict}</div>
            <div style={{ fontFamily: FM, fontSize: 7, color: a(ACC, '99'), marginTop: 3 }}>{String(memo.status).toUpperCase()}</div>
          </div>
          <button onClick={del} disabled={deleting} style={{ background: 'none', border: 'none', color: mix(R, 40), fontFamily: FM, fontSize: 10, cursor: 'pointer', padding: '0 2px', lineHeight: 1 }}>{deleting ? '…' : '✕'}</button>
        </div>
      </div>

      <div style={{ marginTop: 10, fontFamily: FB, fontSize: 12, lineHeight: 1.65, color: mix(BODY, 82), whiteSpace: 'pre-wrap' }}>{memo.thesis}</div>

      {Array.isArray(memo.risks) && memo.risks.length > 0 && (
        <div style={{ marginTop: 9 }}>
          <div style={{ fontFamily: FM, fontSize: 7, color: a(ACC, '99'), letterSpacing: '.14em', marginBottom: 4 }}>RISKS</div>
          {memo.risks.map((rk, i) => <div key={i} style={{ fontFamily: FB, fontSize: 11, color: mix(Y, 78), lineHeight: 1.5 }}>· {rk}</div>)}
        </div>
      )}

      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10, marginTop: 10, fontFamily: FM, fontSize: 7, color: a(ACC, '99') }}>
        <span>CONFIDENCE {memo.data_confidence}</span>
        <span>{fmtDate(memo.created_at)}</span>
      </div>

      <div style={{ marginTop: 10, paddingTop: 9, borderTop: `1px solid ${a(ACC, '12')}`, display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8 }}>
        <span style={{ fontFamily: FM, fontSize: 7, color: qColor, letterSpacing: '.1em' }}>{qLabel}</span>
        <button onClick={toggleEvidence} style={{ background: 'none', border: 0, padding: 0, cursor: 'pointer', fontFamily: FM, fontSize: 7, letterSpacing: '.1em', color: ACC }}>{open ? 'HIDE EVIDENCE' : 'VIEW EVIDENCE'}</button>
      </div>
      <div style={{ fontFamily: FM, fontSize: 6, color: a(ACC, '77'), marginTop: 4, letterSpacing: '.1em' }}>RESEARCH TRUST ONLY · NOT A TRADE SIGNAL</div>

      {open && (
        <div style={{ marginTop: 10 }}>
          {!detail && !detailErr && <div style={{ fontFamily: FM, fontSize: 7, color: a(ACC, '99') }}>LOADING LINKED EVIDENCE…</div>}
          {detailErr && <div style={{ fontFamily: FM, fontSize: 7, color: R }}>UNABLE TO LOAD LINKED EVIDENCE</div>}
          {detail && (
            <>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 4, marginBottom: 8 }}>
                {[['PASS', detail.evidence_summary?.pass_count], ['WARN', detail.evidence_summary?.warning_count], ['FAIL', detail.evidence_summary?.fail_count], ['OPEN', detail.evidence_summary?.unverified_count]].map(([l, v]) => (
                  <div key={l} style={{ padding: '6px 3px', border: `1px solid ${a(ACC, '12')}`, textAlign: 'center' }}>
                    <div style={{ fontFamily: FM, fontSize: 6, color: a(ACC, '99') }}>{l}</div>
                    <div style={{ fontFamily: FD, fontSize: 13, color: ACC, marginTop: 2 }}>{v ?? 0}</div>
                  </div>
                ))}
              </div>
              {detail.validation_records?.length === 0 && <div style={{ fontFamily: FB, fontSize: 11, color: mix(BODY, 55) }}>No validation records are linked to this memo.</div>}
              {detail.validation_records?.map(rec => (
                <div key={rec.id} style={{ padding: '7px 0', borderTop: `1px solid ${a(ACC, '10')}` }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8 }}>
                    <span style={{ fontFamily: FM, fontSize: 8, color: W }}>{rec.field_name}</span>
                    <span style={{ fontFamily: FM, fontSize: 7, color: valColor[rec.status] || ACC }}>{rec.status}</span>
                  </div>
                  <div style={{ fontFamily: FM, fontSize: 7, color: a(ACC, '99'), marginTop: 3 }}>{rec.check_type} · {String(rec.confidence).toUpperCase()} CONFIDENCE</div>
                </div>
              ))}
            </>
          )}
        </div>
      )}
    </div>
  )
}

// ── FINANCE // RESEARCH — analysis memos + validation records (read-only trust) ──
// Slow LLM generation (autopilot / synthesize / draft) stays on the legacy
// screen; this lane surfaces the memo library, linked evidence, and deletes.
export function ResearchContent() {
  const [memos, setMemos] = useState(null)
  const [records, setRecords] = useState(null)
  const [safety, setSafety] = useState(null)
  const [error, setError] = useState(false)

  useEffect(() => {
    let alive = true
    Promise.all([getFinanceResearchMemos(), getFinanceResearchValidationRecords()])
      .then(([m, v]) => {
        if (!alive) return
        setMemos(Array.isArray(m.memos) ? m.memos : [])
        setSafety(m)
        setRecords(Array.isArray(v.records) ? v.records : [])
      })
      .catch(() => { if (alive) setError(true) })
    return () => { alive = false }
  }, [])

  const safe = safety?.research_only === true && safety?.trades_executed === false && safety?.portfolio_state_updated === false

  if (error) return <div style={{ padding: '20px 0', fontFamily: FM, fontSize: 9, letterSpacing: '.14em', color: R }}>UNABLE TO LOAD RESEARCH</div>
  if (memos === null) return <div style={{ padding: '48px 0', textAlign: 'center', fontFamily: FM, fontSize: 9, letterSpacing: '.24em', color: a(ACC, '99') }}>LOADING RESEARCH…</div>

  return (
    <div>
      <div style={{ padding: '9px 11px', border: `1px solid ${mix(G, 22)}`, background: mix(G, 4), fontFamily: FM, fontSize: 7, letterSpacing: '.12em', color: G, lineHeight: 1.6, marginBottom: 12 }}>
        {safe ? 'SAFETY CONFIRMED · ' : ''}RESEARCH ONLY · NO TRADES EXECUTED · NO PORTFOLIO UPDATE
      </div>

      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
        <span style={{ fontFamily: FM, fontSize: 8, letterSpacing: '.2em', color: a(ACC, 'cc') }}>MEMOS</span>
        <span style={{ fontFamily: FM, fontSize: 8, color: a(ACC, '99') }}>{memos.length}</span>
      </div>

      {memos.length === 0 && (
        <div style={{ padding: '30px 16px', border: `1px solid ${a(ACC, '18')}`, background: deep(58), textAlign: 'center', fontFamily: FB, fontSize: 13, lineHeight: 1.7, color: mix(BODY, 65) }}>
          No research memos yet. Memos are analysis only and do not create trades.
        </div>
      )}

      <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        {memos.map(m => <MemoCard key={m.id} memo={m} onDelete={id => setMemos(prev => prev.filter(x => x.id !== id))} />)}
      </div>

      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', margin: '20px 0 10px', paddingTop: 14, borderTop: `1px solid ${a(ACC, '18')}` }}>
        <span style={{ fontFamily: FM, fontSize: 8, letterSpacing: '.2em', color: a(ACC, 'cc') }}>VALIDATION RECORDS</span>
        <span style={{ fontFamily: FM, fontSize: 8, color: a(ACC, '99') }}>{records?.length ?? '…'}</span>
      </div>

      {records?.length === 0 && (
        <div style={{ padding: '20px 14px', border: `1px solid ${a(ACC, '18')}`, background: deep(58), textAlign: 'center', fontFamily: FB, fontSize: 12, lineHeight: 1.6, color: mix(BODY, 55) }}>
          No research validation records yet. Evidence checks are research-only audit artifacts.
        </div>
      )}

      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        {records?.map(rec => (
          <div key={rec.id} style={{ padding: '10px 12px', border: `1px solid ${a(ACC, '18')}`, borderLeft: `3px solid ${valColor[rec.status] || ACC}`, background: deep(58) }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10 }}>
              <div style={{ minWidth: 0 }}>
                <div style={{ fontFamily: FD, fontSize: 14, fontWeight: 700, color: W }}>{rec.field_name}</div>
                <div style={{ fontFamily: FM, fontSize: 7, color: a(ACC, '99'), marginTop: 3 }}>{rec.check_type} · {String(rec.asset || 'UNSCOPED').toUpperCase()}</div>
              </div>
              <div style={{ textAlign: 'right', flexShrink: 0 }}>
                <div style={{ fontFamily: FM, fontSize: 8, color: valColor[rec.status] || ACC }}>{rec.status}</div>
                <div style={{ fontFamily: FM, fontSize: 7, color: a(ACC, '99'), marginTop: 3 }}>{String(rec.confidence).toUpperCase()} CONFIDENCE</div>
              </div>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10, marginTop: 8, fontFamily: FM, fontSize: 7, color: a(ACC, '99') }}>
              <span>{rec.deviation_pct == null ? 'DEVIATION NOT RECORDED' : `DEVIATION ${rec.deviation_pct}%`}</span>
              <span>{fmtDate(rec.created_at)}</span>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
