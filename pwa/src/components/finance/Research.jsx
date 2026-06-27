import { useCallback, useEffect, useState } from 'react'
import { getFinanceResearchMemos, postFinanceResearchMemo } from '../../api/client'

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
  const [safety, setSafety] = useState(null)
  const [loadError, setLoadError] = useState(false)
  const [form, setForm] = useState(initialForm)
  const [submitting, setSubmitting] = useState(false)
  const [submitError, setSubmitError] = useState('')
  const [createdMessage, setCreatedMessage] = useState('')

  const loadMemos = useCallback(async () => {
    const response = await getFinanceResearchMemos()
    setMemos(Array.isArray(response.memos) ? response.memos : [])
    setSafety(response)
    setLoadError(false)
  }, [])

  useEffect(() => {
    loadMemos().catch(() => {
      setLoadError(true)
      setMemos([])
    })
  }, [loadMemos])

  function updateField(event) {
    const { name, value } = event.target
    setForm(current => ({ ...current, [name]: value }))
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
      await loadMemos()
    } catch {
      setSubmitError('Unable to save research memo. Check required fields and try again.')
    } finally {
      setSubmitting(false)
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
            </article>
          ))}
        </div>
      </div>
    </div>
  )
}
