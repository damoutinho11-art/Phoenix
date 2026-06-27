import { useCallback, useEffect, useState } from 'react'
import {
  getFinanceResearchMemos,
  getFinanceResearchMemo,
  getFinanceResearchValidationRecords,
  postFinanceResearchMemo,
  postFinanceResearchDraftMemo,
  postFinanceResearchMemoQualityGate,
  postFinanceResearchQualityGateAll,
  postFinanceResearchGenerateEvidence,
  postFinanceResearchSynthesizeMemo,
  postFinanceResearchMemoAutopilot,
  postFinanceResearchAutopilotRun,
} from '../../api/client'

const border = '1px solid rgba(32,216,236,.18)'
const muted = 'rgba(32,216,236,.38)'
const fieldStyle = {
  width: '100%',
  boxSizing: 'border-box',
  background: 'rgba(32,216,236,.025)',
  border,
  borderRadius: 0,
  color: 'rgba(199,236,244,.92)',
  fontFamily: "'Saira Condensed',sans-serif",
  fontSize: 13,
  padding: '9px 10px',
  outline: 'none',
}

const initialForm = {
  asset: '',
  sleeve: '',
  title: '',
  thesis: '',
  risks: '',
  data_confidence: 'MEDIUM',
  verdict: 'WATCH',
  status: 'draft',
  notes: '',
}

const verdictColor = {
  BUY_CANDIDATE: '#4dffb4',
  WATCH: '#7df0ff',
  REJECT: '#ff5c7a',
  INSUFFICIENT_DATA: '#ffd56b',
}

const validationStatusColor = {
  PASS: '#4dffb4',
  WARNING: '#ffd56b',
  FAIL: '#ff5c7a',
  UNVERIFIED: '#7df0ff',
}

const evidenceStatusMeta = {
  NO_EVIDENCE: { label: 'No evidence attached yet', color: muted },
  EVIDENCE_STRONG: { label: 'Evidence strong', color: '#4dffb4' },
  NEEDS_RESEARCH: { label: 'Needs more research', color: '#ffd56b' },
  BLOCKED_BY_FAIL: { label: 'Blocked by failed validation', color: '#ff5c7a' },
}

const qualityStatusMeta = {
  UNREVIEWED: { label: 'UNREVIEWED', color: muted },
  NEEDS_MORE_EVIDENCE: { label: 'NEEDS MORE EVIDENCE', color: '#ffd56b' },
  VALIDATED: { label: 'VALIDATED', color: '#4dffb4' },
  REJECTED: { label: 'REJECTED', color: '#ff5c7a' },
}

function FieldLabel({ children }) {
  return <div style={{ fontFamily: 'var(--mono)', fontSize: 7, letterSpacing: '.17em', color: muted, marginBottom: 5 }}>{children}</div>
}

function formatDate(value) {
  if (!value) return 'DATE UNAVAILABLE'
  const date = new Date(value)
  return Number.isNaN(date.getTime()) ? String(value) : date.toLocaleString()
}

export default function Research({ onBack }) {
  const [memos, setMemos] = useState(null)
  const [validationRecords, setValidationRecords] = useState(null)
  const [safety, setSafety] = useState(null)
  const [loadError, setLoadError] = useState(false)
  const [form, setForm] = useState(initialForm)
  const [submitting, setSubmitting] = useState(false)
  const [submitError, setSubmitError] = useState('')
  const [createdMessage, setCreatedMessage] = useState('')
  const [selectedMemoId, setSelectedMemoId] = useState(null)
  const [selectedMemoDetail, setSelectedMemoDetail] = useState(null)
  const [detailError, setDetailError] = useState(false)
  const [draftForm, setDraftForm] = useState({ asset: '', sleeve: '' })
  const [drafting, setDrafting] = useState(false)
  const [draftResult, setDraftResult] = useState(null)
  const [draftError, setDraftError] = useState('')
  const [qualityRunning, setQualityRunning] = useState(null)
  const [qualityAllRunning, setQualityAllRunning] = useState(false)
  const [qualityAllResult, setQualityAllResult] = useState(null)
  const [evidenceRunning, setEvidenceRunning] = useState(null)
  const [evidenceResults, setEvidenceResults] = useState({})
  const [synthesisRunning, setSynthesisRunning] = useState(null)
  const [synthesisResults, setSynthesisResults] = useState({})
  const [autopilotRunning, setAutopilotRunning] = useState(null)
  const [autopilotResults, setAutopilotResults] = useState({})
  const [globalAutopilotRunning, setGlobalAutopilotRunning] = useState(false)
  const [globalAutopilotResult, setGlobalAutopilotResult] = useState(null)

  const loadResearch = useCallback(async () => {
    const [memoResponse, validationResponse] = await Promise.all([
      getFinanceResearchMemos(),
      getFinanceResearchValidationRecords(),
    ])
    setMemos(Array.isArray(memoResponse.memos) ? memoResponse.memos : [])
    setValidationRecords(Array.isArray(validationResponse.records) ? validationResponse.records : [])
    setSafety(memoResponse)
    setLoadError(false)
  }, [])

  useEffect(() => {
    loadResearch().catch(() => {
      setLoadError(true)
      setMemos([])
      setValidationRecords([])
    })
  }, [loadResearch])

  function updateField(event) {
    const { name, value } = event.target
    setForm(current => ({ ...current, [name]: value }))
  }

  async function toggleMemoEvidence(memoId) {
    if (selectedMemoId === memoId) {
      setSelectedMemoId(null)
      setSelectedMemoDetail(null)
      setDetailError(false)
      return
    }
    setSelectedMemoId(memoId)
    setSelectedMemoDetail(null)
    setDetailError(false)
    try {
      setSelectedMemoDetail(await getFinanceResearchMemo(memoId))
    } catch {
      setDetailError(true)
    }
  }

  async function handleSubmit(event) {
    event.preventDefault()
    setSubmitting(true)
    setSubmitError('')
    setCreatedMessage('')
    const risks = form.risks.split(/\r?\n/).map(value => value.trim()).filter(Boolean)
    try {
      const response = await postFinanceResearchMemo({
        asset: form.asset.trim() || null,
        sleeve: form.sleeve.trim() || null,
        title: form.title.trim(),
        thesis: form.thesis.trim(),
        risks,
        data_confidence: form.data_confidence,
        verdict: form.verdict,
        status: form.status,
        notes: form.notes.trim() || null,
      })
      setSafety(response)
      setCreatedMessage(`MEMO ${response.memo_id} SAVED · RESEARCH ONLY`)
      setForm(initialForm)
      await loadResearch()
    } catch {
      setSubmitError('Unable to save research memo. Check required fields and try again.')
    } finally {
      setSubmitting(false)
    }
  }

  async function handleDraftSubmit(event) {
    event.preventDefault()
    if (!draftForm.asset.trim()) return
    setDrafting(true)
    setDraftError('')
    setDraftResult(null)
    try {
      const response = await postFinanceResearchDraftMemo({
        asset: draftForm.asset.trim(),
        sleeve: draftForm.sleeve.trim() || null,
      })
      setDraftResult(response)
      setDraftForm({ asset: '', sleeve: '' })
      await loadResearch()
    } catch {
      setDraftError('Unable to generate draft memo. Check asset name and try again.')
    } finally {
      setDrafting(false)
    }
  }

  async function handleQualityGate(memoId) {
    setQualityRunning(memoId)
    try {
      await postFinanceResearchMemoQualityGate(memoId)
      await loadResearch()
    } catch {
      // silent — list refresh will show current state
    } finally {
      setQualityRunning(null)
    }
  }

  async function handleSynthesizeMemo(memoId) {
    setSynthesisRunning(memoId)
    try {
      const response = await postFinanceResearchSynthesizeMemo(memoId, false)
      setSynthesisResults(prev => ({ ...prev, [memoId]: response.synthesis_result }))
      await loadResearch()
    } catch {
      // silent — list refresh will show current state
    } finally {
      setSynthesisRunning(null)
    }
  }

  async function handleGenerateEvidence(memoId) {
    setEvidenceRunning(memoId)
    try {
      const response = await postFinanceResearchGenerateEvidence(memoId, false)
      setEvidenceResults(prev => ({ ...prev, [memoId]: response }))
      await loadResearch()
    } catch {
      // silent — user can retry
    } finally {
      setEvidenceRunning(null)
    }
  }

  async function handleMemoAutopilot(memoId) {
    setAutopilotRunning(memoId)
    try {
      const response = await postFinanceResearchMemoAutopilot(memoId)
      setAutopilotResults(prev => ({ ...prev, [memoId]: response }))
      await loadResearch()
    } catch {
      // silent — list refresh shows current state
    } finally {
      setAutopilotRunning(null)
    }
  }

  async function handleGlobalAutopilot() {
    setGlobalAutopilotRunning(true)
    setGlobalAutopilotResult(null)
    try {
      const response = await postFinanceResearchAutopilotRun()
      setGlobalAutopilotResult(response)
      await loadResearch()
    } catch {
      setGlobalAutopilotResult({ error: true })
    } finally {
      setGlobalAutopilotRunning(false)
    }
  }

  async function handleQualityGateAll() {
    setQualityAllRunning(true)
    setQualityAllResult(null)
    try {
      const response = await postFinanceResearchQualityGateAll()
      setQualityAllResult(response.total_evaluated)
      await loadResearch()
    } catch {
      setQualityAllResult(0)
    } finally {
      setQualityAllRunning(false)
    }
  }

  const safetyConfirmed = safety?.research_only === true
    && safety?.trades_executed === false
    && safety?.portfolio_state_updated === false

  return (
    <div style={{ height: '100%', overflowY: 'auto', background: '#000', color: 'rgba(199,236,244,.92)', fontFamily: "'Saira Condensed',sans-serif" }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '13px 18px 11px', borderBottom: border, position: 'sticky', top: 0, background: 'rgba(0,0,0,.96)', backdropFilter: 'blur(12px)', zIndex: 5 }}>
        <div style={{ display: 'flex', alignItems: 'center' }}>
          <span onClick={onBack} style={{ color: '#20d8ec', fontSize: 16, marginRight: 10, cursor: 'pointer' }}>←</span>
          <span style={{ fontFamily: 'var(--display)', fontSize: 13, fontWeight: 700, letterSpacing: '.28em', color: '#7df0ff' }}>RESEARCH</span>
        </div>
        <span style={{ fontFamily: 'var(--mono)', fontSize: 8, color: safetyConfirmed ? '#4dffb4' : muted, letterSpacing: '.12em' }}>
          {safetyConfirmed ? 'SAFETY CONFIRMED' : 'RESEARCH ONLY'}
        </span>
      </div>

      <div style={{ margin: '14px 16px 0', padding: '9px 11px', border: '1px solid rgba(77,255,180,.22)', background: 'rgba(77,255,180,.025)', fontFamily: 'var(--mono)', fontSize: 7, letterSpacing: '.12em', color: '#4dffb4', lineHeight: 1.6 }}>
        RESEARCH ONLY · NO TRADES EXECUTED · NO PORTFOLIO UPDATE
      </div>

      <div style={{ margin: '10px 16px 0', padding: '9px 11px', border: '1px solid rgba(125,240,255,.15)', background: 'rgba(125,240,255,.012)', fontFamily: 'var(--mono)', fontSize: 7, color: '#7df0ff', letterSpacing: '.12em', lineHeight: 1.6 }}>
        PHOENIX synthesizes research from evidence. This does not approve a trade.
      </div>

      <div style={{ margin: '10px 16px 0', padding: '9px 11px', border: '1px solid rgba(77,255,180,.2)', background: 'rgba(77,255,180,.015)' }}>
        <div style={{ fontFamily: 'var(--mono)', fontSize: 7, color: '#4dffb4', letterSpacing: '.12em', marginBottom: 7 }}>PHOENIX runs research autonomously. This does not approve or execute a trade.</div>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
          <button
            type="button"
            onClick={handleGlobalAutopilot}
            disabled={globalAutopilotRunning}
            style={{ padding: '7px 12px', border: '1px solid rgba(77,255,180,.3)', background: 'rgba(77,255,180,.06)', color: '#4dffb4', fontFamily: 'var(--mono)', fontSize: 7, letterSpacing: '.12em', cursor: globalAutopilotRunning ? 'wait' : 'pointer' }}
          >
            {globalAutopilotRunning ? 'RUNNING AUTOPILOT…' : 'RUN FINANCE AUTOPILOT'}
          </button>
          {globalAutopilotResult && !globalAutopilotResult.error && (
            <span style={{ fontFamily: 'var(--mono)', fontSize: 7, color: '#4dffb4' }}>{globalAutopilotResult.total_legs} LEG(S) PROCESSED · RESEARCH ONLY · NO TRADES</span>
          )}
          {globalAutopilotResult?.error && (
            <span style={{ fontFamily: 'var(--mono)', fontSize: 7, color: '#ff5c7a' }}>AUTOPILOT ERROR — CHECK LOGS</span>
          )}
        </div>
      </div>

      <div style={{ margin: '10px 16px 0', padding: '9px 11px', border, background: 'rgba(32,216,236,.015)' }}>
        <div style={{ fontFamily: 'var(--mono)', fontSize: 7, color: muted, letterSpacing: '.12em', marginBottom: 7 }}>PHOENIX validates research quality. This does not approve a trade.</div>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          <button
            type="button"
            onClick={handleQualityGateAll}
            disabled={qualityAllRunning}
            style={{ padding: '7px 12px', border, background: 'rgba(32,216,236,.07)', color: '#7df0ff', fontFamily: 'var(--mono)', fontSize: 7, letterSpacing: '.12em', cursor: qualityAllRunning ? 'wait' : 'pointer' }}
          >
            {qualityAllRunning ? 'EVALUATING…' : 'RUN ALL QUALITY GATES'}
          </button>
          {qualityAllResult !== null && (
            <span style={{ fontFamily: 'var(--mono)', fontSize: 7, color: '#4dffb4' }}>{qualityAllResult} MEMO(S) EVALUATED</span>
          )}
        </div>
      </div>

      <form onSubmit={handleDraftSubmit} style={{ padding: '16px', borderBottom: border }}>
        <div style={{ fontFamily: 'var(--mono)', fontSize: 8, letterSpacing: '.2em', color: muted, marginBottom: 8 }}>DRAFT MEMO FROM PORTFOLIO CONTEXT</div>
        <div style={{ marginBottom: 10, fontSize: 12, lineHeight: 1.55, color: 'rgba(199,236,244,.6)' }}>
          Generates a draft memo from local PHOENIX data only. No external sources. Draft only — requires human review.
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
          <label>
            <FieldLabel>ASSET *</FieldLabel>
            <input required value={draftForm.asset} onChange={(e) => setDraftForm(f => ({ ...f, asset: e.target.value }))} placeholder="btc, quality_etf…" style={fieldStyle} />
          </label>
          <label>
            <FieldLabel>SLEEVE (OPTIONAL)</FieldLabel>
            <input value={draftForm.sleeve} onChange={(e) => setDraftForm(f => ({ ...f, sleeve: e.target.value }))} placeholder="optional" style={fieldStyle} />
          </label>
        </div>
        {draftError && <div style={{ marginTop: 8, color: '#ff5c7a', fontFamily: 'var(--mono)', fontSize: 8 }}>{draftError}</div>}
        {draftResult && (
          <div style={{ marginTop: 8, padding: '8px 10px', border: '1px solid rgba(77,255,180,.25)', background: 'rgba(77,255,180,.025)', fontFamily: 'var(--mono)', fontSize: 7, color: '#4dffb4', lineHeight: 1.6 }}>
            DRAFT MEMO #{draftResult.memo_id} CREATED · DRAFT ONLY — REQUIRES HUMAN REVIEW
          </div>
        )}
        <button type="submit" disabled={drafting} style={{ width: '100%', marginTop: 10, padding: '10px 0', border, background: 'rgba(32,216,236,.06)', color: '#7df0ff', fontFamily: 'var(--mono)', fontSize: 8, letterSpacing: '.16em', cursor: drafting ? 'wait' : 'pointer' }}>
          {drafting ? 'DRAFTING…' : 'DRAFT MEMO'}
        </button>
      </form>

      <form onSubmit={handleSubmit} style={{ padding: '16px', borderBottom: border }}>
        <div style={{ fontFamily: 'var(--mono)', fontSize: 8, letterSpacing: '.2em', color: muted, marginBottom: 12 }}>CREATE RESEARCH MEMO</div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
          <label>
            <FieldLabel>ASSET</FieldLabel>
            <input name="asset" value={form.asset} onChange={updateField} placeholder="quality_etf" style={fieldStyle} />
          </label>
          <label>
            <FieldLabel>SLEEVE</FieldLabel>
            <input name="sleeve" value={form.sleeve} onChange={updateField} placeholder="optional" style={fieldStyle} />
          </label>
        </div>
        <label style={{ display: 'block', marginTop: 10 }}>
          <FieldLabel>TITLE</FieldLabel>
          <input name="title" value={form.title} onChange={updateField} required style={fieldStyle} />
        </label>
        <label style={{ display: 'block', marginTop: 10 }}>
          <FieldLabel>THESIS</FieldLabel>
          <textarea name="thesis" value={form.thesis} onChange={updateField} required rows={4} style={{ ...fieldStyle, resize: 'vertical' }} />
        </label>
        <label style={{ display: 'block', marginTop: 10 }}>
          <FieldLabel>RISKS · ONE PER LINE</FieldLabel>
          <textarea name="risks" value={form.risks} onChange={updateField} required rows={3} style={{ ...fieldStyle, resize: 'vertical' }} />
        </label>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginTop: 10 }}>
          <label>
            <FieldLabel>DATA CONFIDENCE</FieldLabel>
            <select name="data_confidence" value={form.data_confidence} onChange={updateField} style={fieldStyle}>
              {['HIGH', 'MEDIUM', 'LOW', 'INSUFFICIENT'].map(value => <option key={value}>{value}</option>)}
            </select>
          </label>
          <label>
            <FieldLabel>STATUS</FieldLabel>
            <select name="status" value={form.status} onChange={updateField} style={fieldStyle}>
              {['draft', 'active', 'archived'].map(value => <option key={value}>{value}</option>)}
            </select>
          </label>
        </div>
        <label style={{ display: 'block', marginTop: 10 }}>
          <FieldLabel>VERDICT · ANALYTICAL LABEL ONLY</FieldLabel>
          <select name="verdict" value={form.verdict} onChange={updateField} style={fieldStyle}>
            {['BUY_CANDIDATE', 'WATCH', 'REJECT', 'INSUFFICIENT_DATA'].map(value => <option key={value}>{value}</option>)}
          </select>
        </label>
        <label style={{ display: 'block', marginTop: 10 }}>
          <FieldLabel>NOTES</FieldLabel>
          <textarea name="notes" value={form.notes} onChange={updateField} rows={2} style={{ ...fieldStyle, resize: 'vertical' }} />
        </label>

        {submitError && <div style={{ marginTop: 10, color: '#ff5c7a', fontFamily: 'var(--mono)', fontSize: 8 }}>{submitError}</div>}
        {createdMessage && <div style={{ marginTop: 10, color: '#4dffb4', fontFamily: 'var(--mono)', fontSize: 8 }}>{createdMessage}</div>}
        <button type="submit" disabled={submitting} className="action" style={{ width: '100%', marginTop: 12, padding: '12px 0', fontSize: 10, letterSpacing: '.16em' }}>
          {submitting ? 'SAVING…' : 'SAVE RESEARCH MEMO'}
        </button>
      </form>

      <div style={{ padding: '16px' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 11 }}>
          <span style={{ fontFamily: 'var(--mono)', fontSize: 8, letterSpacing: '.2em', color: muted }}>MEMOS</span>
          <span style={{ fontFamily: 'var(--mono)', fontSize: 8, color: muted }}>{memos === null ? '…' : memos.length}</span>
        </div>

        {loadError && <div style={{ padding: 12, border: '1px solid rgba(255,92,122,.3)', color: '#ff5c7a', fontFamily: 'var(--mono)', fontSize: 8 }}>UNABLE TO LOAD RESEARCH MEMOS</div>}
        {memos === null && !loadError && <div style={{ padding: 24, textAlign: 'center', color: muted, fontFamily: 'var(--mono)', fontSize: 8 }}>LOADING RESEARCH MEMOS…</div>}
        {memos?.length === 0 && !loadError && (
          <div style={{ padding: '30px 16px', border, background: 'rgba(32,216,236,.02)', textAlign: 'center', fontSize: 13, lineHeight: 1.7, color: 'rgba(199,236,244,.65)' }}>
            No research memos yet. Research memos are analysis only and do not create trades.
          </div>
        )}

        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {memos?.map(memo => (
            <article key={memo.id} style={{ padding: '12px 13px', border, borderLeft: `3px solid ${verdictColor[memo.verdict] || '#20d8ec'}`, background: 'rgba(32,216,236,.02)' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10, alignItems: 'flex-start' }}>
                <div>
                  <div style={{ fontFamily: 'var(--display)', fontSize: 16, fontWeight: 700, color: '#fff', lineHeight: 1.25 }}>{memo.title}</div>
                  <div style={{ fontFamily: 'var(--mono)', fontSize: 7, color: muted, marginTop: 4 }}>{[memo.asset, memo.sleeve].filter(Boolean).join(' · ').toUpperCase() || 'UNSCOPED'}</div>
                </div>
                <div style={{ textAlign: 'right', flexShrink: 0 }}>
                  <div style={{ fontFamily: 'var(--mono)', fontSize: 7, color: verdictColor[memo.verdict] || '#7df0ff' }}>{memo.verdict}</div>
                  <div style={{ fontFamily: 'var(--mono)', fontSize: 7, color: muted, marginTop: 3 }}>{String(memo.status).toUpperCase()}</div>
                </div>
              </div>
              <div style={{ marginTop: 10, fontSize: 12, lineHeight: 1.65, color: 'rgba(199,236,244,.78)', whiteSpace: 'pre-wrap' }}>{memo.thesis}</div>
              {Array.isArray(memo.risks) && memo.risks.length > 0 && (
                <div style={{ marginTop: 9 }}>
                  <div style={{ fontFamily: 'var(--mono)', fontSize: 7, color: muted, letterSpacing: '.14em', marginBottom: 4 }}>RISKS</div>
                  {memo.risks.map((risk, index) => <div key={index} style={{ fontSize: 11, color: 'rgba(255,213,107,.72)', lineHeight: 1.5 }}>· {risk}</div>)}
                </div>
              )}
              <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10, marginTop: 10, fontFamily: 'var(--mono)', fontSize: 7, color: muted }}>
                <span>CONFIDENCE {memo.data_confidence}</span>
                <span>{formatDate(memo.created_at)}</span>
              </div>
              {memo.notes && <div style={{ marginTop: 8, fontSize: 11, color: 'rgba(199,236,244,.5)', whiteSpace: 'pre-wrap' }}>{memo.notes}</div>}
              {(() => {
                const status = memo.evidence_summary?.evidence_status || 'NO_EVIDENCE'
                const meta = evidenceStatusMeta[status] || evidenceStatusMeta.NO_EVIDENCE
                return (
                  <div style={{ marginTop: 10, paddingTop: 9, borderTop: '1px solid rgba(32,216,236,.1)' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10, alignItems: 'center' }}>
                      <span style={{ fontFamily: 'var(--mono)', fontSize: 8, color: meta.color }}>{meta.label}</span>
                      <button type="button" onClick={() => toggleMemoEvidence(memo.id)} style={{ background: 'none', border: 0, padding: 0, cursor: 'pointer', fontFamily: 'var(--mono)', fontSize: 7, letterSpacing: '.1em', color: '#20d8ec' }}>
                        {selectedMemoId === memo.id ? 'HIDE EVIDENCE' : 'VIEW EVIDENCE'}
                      </button>
                    </div>
                    <div style={{ fontFamily: 'var(--mono)', fontSize: 6, color: muted, marginTop: 4, letterSpacing: '.1em' }}>RESEARCH TRUST ONLY · NOT A TRADE SIGNAL</div>
                    {(() => {
                      const qStatus = memo.research_quality_status || 'UNREVIEWED'
                      const qMeta = qualityStatusMeta[qStatus] || qualityStatusMeta.UNREVIEWED
                      const isRunning = qualityRunning === memo.id
                      return (
                        <div style={{ marginTop: 8, display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8 }}>
                          <div>
                            <span style={{ fontFamily: 'var(--mono)', fontSize: 7, color: qMeta.color, letterSpacing: '.1em' }}>{qMeta.label}</span>
                            {memo.research_quality_reason && qStatus !== 'UNREVIEWED' && (
                              <div style={{ fontFamily: 'var(--mono)', fontSize: 6, color: muted, marginTop: 2, lineHeight: 1.5 }}>{memo.research_quality_reason}</div>
                            )}
                          </div>
                          <button
                            type="button"
                            onClick={() => handleQualityGate(memo.id)}
                            disabled={isRunning}
                            style={{ background: 'none', border, padding: '4px 8px', cursor: isRunning ? 'wait' : 'pointer', fontFamily: 'var(--mono)', fontSize: 6, letterSpacing: '.1em', color: '#20d8ec', flexShrink: 0 }}
                          >
                            {isRunning ? 'EVALUATING…' : 'RUN QUALITY GATE'}
                          </button>
                        </div>
                      )
                    })()}
                    {(() => {
                      const isGenerating = evidenceRunning === memo.id
                      const evResult = evidenceResults[memo.id]
                      return (
                        <div style={{ marginTop: 8, display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8 }}>
                          <div>
                            {evResult && (
                              <span style={{ fontFamily: 'var(--mono)', fontSize: 6, color: '#4dffb4', letterSpacing: '.1em' }}>
                                {evResult.generated_count} GENERATED · {evResult.skipped_count} SKIPPED · EVIDENCE FROM EXISTING PHOENIX DATA ONLY
                              </span>
                            )}
                          </div>
                          <button
                            type="button"
                            onClick={() => handleGenerateEvidence(memo.id)}
                            disabled={isGenerating}
                            style={{ background: 'none', border, padding: '4px 8px', cursor: isGenerating ? 'wait' : 'pointer', fontFamily: 'var(--mono)', fontSize: 6, letterSpacing: '.1em', color: '#7df0ff', flexShrink: 0 }}
                          >
                            {isGenerating ? 'GENERATING…' : 'GENERATE EVIDENCE'}
                          </button>
                        </div>
                      )
                    })()}
                    {(() => {
                      const isSynthesizing = synthesisRunning === memo.id
                      const synResult = synthesisResults[memo.id]
                      return (
                        <div style={{ marginTop: 8, display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8 }}>
                          <div>
                            {synResult && (
                              <span style={{ fontFamily: 'var(--mono)', fontSize: 6, color: '#7df0ff', letterSpacing: '.1em' }}>
                                {synResult.verdict} · {synResult.data_confidence} · RULE {synResult.rule_applied} · SYNTHESIS ONLY
                              </span>
                            )}
                          </div>
                          <button
                            type="button"
                            onClick={() => handleSynthesizeMemo(memo.id)}
                            disabled={isSynthesizing}
                            style={{ background: 'none', border, padding: '4px 8px', cursor: isSynthesizing ? 'wait' : 'pointer', fontFamily: 'var(--mono)', fontSize: 6, letterSpacing: '.1em', color: '#7df0ff', flexShrink: 0 }}
                          >
                            {isSynthesizing ? 'SYNTHESIZING…' : 'SYNTHESIZE MEMO'}
                          </button>
                        </div>
                      )
                    })()}
                    {(() => {
                      const isRunning = autopilotRunning === memo.id
                      const apResult = autopilotResults[memo.id]
                      return (
                        <div style={{ marginTop: 8, paddingTop: 7, borderTop: '1px solid rgba(77,255,180,.1)', display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8 }}>
                          <div>
                            {apResult && (
                              <span style={{ fontFamily: 'var(--mono)', fontSize: 6, color: '#4dffb4', letterSpacing: '.1em' }}>
                                {apResult.final_memo?.verdict} · {apResult.final_memo?.research_quality_status} · AUTOPILOT · NO TRADES
                              </span>
                            )}
                          </div>
                          <button
                            type="button"
                            onClick={() => handleMemoAutopilot(memo.id)}
                            disabled={isRunning}
                            style={{ background: 'none', border: '1px solid rgba(77,255,180,.3)', padding: '4px 8px', cursor: isRunning ? 'wait' : 'pointer', fontFamily: 'var(--mono)', fontSize: 6, letterSpacing: '.1em', color: '#4dffb4', flexShrink: 0 }}
                          >
                            {isRunning ? 'RUNNING AUTOPILOT…' : 'RUN RESEARCH AUTOPILOT'}
                          </button>
                        </div>
                      )
                    })()}

                    {selectedMemoId === memo.id && !selectedMemoDetail && !detailError && (
                      <div style={{ marginTop: 9, fontFamily: 'var(--mono)', fontSize: 7, color: muted }}>LOADING LINKED EVIDENCE…</div>
                    )}
                    {selectedMemoId === memo.id && detailError && (
                      <div style={{ marginTop: 9, fontFamily: 'var(--mono)', fontSize: 7, color: '#ff5c7a' }}>UNABLE TO LOAD LINKED EVIDENCE</div>
                    )}
                    {selectedMemoId === memo.id && selectedMemoDetail && (
                      <div style={{ marginTop: 10 }}>
                        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: 4, marginBottom: 8 }}>
                          {[
                            ['PASS', selectedMemoDetail.evidence_summary?.pass_count],
                            ['WARN', selectedMemoDetail.evidence_summary?.warning_count],
                            ['FAIL', selectedMemoDetail.evidence_summary?.fail_count],
                            ['OPEN', selectedMemoDetail.evidence_summary?.unverified_count],
                          ].map(([label, value]) => (
                            <div key={label} style={{ padding: '6px 3px', border: '1px solid rgba(32,216,236,.1)', textAlign: 'center' }}>
                              <div style={{ fontFamily: 'var(--mono)', fontSize: 6, color: muted }}>{label}</div>
                              <div style={{ fontFamily: 'var(--display)', fontSize: 13, color: '#7df0ff', marginTop: 2 }}>{value ?? 0}</div>
                            </div>
                          ))}
                        </div>
                        {selectedMemoDetail.validation_records?.length === 0 && (
                          <div style={{ fontSize: 11, color: 'rgba(199,236,244,.5)' }}>No validation records are linked to this memo.</div>
                        )}
                        {selectedMemoDetail.validation_records?.map(record => (
                          <div key={record.id} style={{ padding: '7px 0', borderTop: '1px solid rgba(32,216,236,.08)' }}>
                            <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8 }}>
                              <span style={{ fontFamily: 'var(--mono)', fontSize: 8, color: '#fff' }}>{record.field_name}</span>
                              <span style={{ fontFamily: 'var(--mono)', fontSize: 7, color: validationStatusColor[record.status] || '#7df0ff' }}>{record.status}</span>
                            </div>
                            <div style={{ fontFamily: 'var(--mono)', fontSize: 7, color: muted, marginTop: 3 }}>{record.check_type} · {String(record.confidence).toUpperCase()} CONFIDENCE</div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                )
              })()}
            </article>
          ))}
        </div>

        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', margin: '22px 0 11px', paddingTop: 16, borderTop: border }}>
          <span style={{ fontFamily: 'var(--mono)', fontSize: 8, letterSpacing: '.2em', color: muted }}>VALIDATION RECORDS</span>
          <span style={{ fontFamily: 'var(--mono)', fontSize: 8, color: muted }}>{validationRecords === null ? '…' : validationRecords.length}</span>
        </div>

        {validationRecords === null && !loadError && (
          <div style={{ padding: 20, textAlign: 'center', color: muted, fontFamily: 'var(--mono)', fontSize: 8 }}>LOADING VALIDATION RECORDS…</div>
        )}
        {validationRecords?.length === 0 && !loadError && (
          <div style={{ padding: '20px 14px', border, background: 'rgba(32,216,236,.02)', textAlign: 'center', fontSize: 12, lineHeight: 1.6, color: 'rgba(199,236,244,.55)' }}>
            No research validation records yet. Evidence checks are research-only audit artifacts.
          </div>
        )}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {validationRecords?.map(record => (
            <article key={record.id} style={{ padding: '10px 12px', border, borderLeft: `3px solid ${validationStatusColor[record.status] || '#20d8ec'}`, background: 'rgba(32,216,236,.02)' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10 }}>
                <div>
                  <div style={{ fontFamily: 'var(--display)', fontSize: 14, fontWeight: 700, color: '#fff' }}>{record.field_name}</div>
                  <div style={{ fontFamily: 'var(--mono)', fontSize: 7, color: muted, marginTop: 3 }}>{record.check_type} · {String(record.asset || 'UNSCOPED').toUpperCase()}</div>
                </div>
                <div style={{ textAlign: 'right', flexShrink: 0 }}>
                  <div style={{ fontFamily: 'var(--mono)', fontSize: 8, color: validationStatusColor[record.status] || '#7df0ff' }}>{record.status}</div>
                  <div style={{ fontFamily: 'var(--mono)', fontSize: 7, color: muted, marginTop: 3 }}>{String(record.confidence).toUpperCase()} CONFIDENCE</div>
                </div>
              </div>
              {(record.primary_value != null || record.secondary_value != null || record.consensus_value != null) && (
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 6, marginTop: 9 }}>
                  {[
                    ['PRIMARY', record.primary_value],
                    ['SECONDARY', record.secondary_value],
                    ['CONSENSUS', record.consensus_value],
                  ].map(([label, value]) => (
                    <div key={label} style={{ padding: '7px 6px', border: '1px solid rgba(32,216,236,.1)', minWidth: 0 }}>
                      <div style={{ fontFamily: 'var(--mono)', fontSize: 6, color: muted, letterSpacing: '.1em' }}>{label}</div>
                      <div style={{ fontFamily: 'var(--mono)', fontSize: 8, color: value == null ? muted : '#7df0ff', marginTop: 3, overflowWrap: 'anywhere' }}>{value ?? '—'}</div>
                    </div>
                  ))}
                </div>
              )}
              <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10, marginTop: 8, fontFamily: 'var(--mono)', fontSize: 7, color: muted }}>
                <span>{record.deviation_pct == null ? 'DEVIATION NOT RECORDED' : `DEVIATION ${record.deviation_pct}%`}</span>
                <span>{formatDate(record.created_at)}</span>
              </div>
              {record.notes && <div style={{ marginTop: 7, fontSize: 11, color: 'rgba(199,236,244,.5)' }}>{record.notes}</div>}
            </article>
          ))}
        </div>
      </div>
    </div>
  )
}
