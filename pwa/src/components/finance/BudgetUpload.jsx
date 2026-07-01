import { useState } from 'react'
import { parseBudgetPdf, parseBudgetTransactions, saveBudgetTransactions } from '../../api/client'

const FONTS_URL = 'https://fonts.googleapis.com/css2?family=Rajdhani:wght@500;600;700&family=Space+Grotesk:wght@300;400;500;600;700&family=Share+Tech+Mono&display=swap'
const KEYFRAMES = `@keyframes phScan { 0%{transform:translateX(-100%)} 100%{transform:translateX(100%)} }`

const MONO = "'Share Tech Mono', monospace"
const DISPLAY = "'Rajdhani', sans-serif"
const BODY = "'Space Grotesk', sans-serif"
const BG = '#060c12'
const CARD = '#070e15'
const ACCENT = '#00bbdd'
const border = '1px solid rgba(0,187,221,.18)'
const muted = 'rgba(0,187,221,.45)'

const CAT_COLORS = {
  'Food & Groceries': '#4dffb4',
  'Eating Out':       '#ff8f2e',
  'Subscriptions':    '#ff5c7a',
  'Transport':        '#00bbdd',
  'Housing':          '#9f7dff',
  'Health & Sport':   '#7dffb4',
  'Shopping':         '#ffd56b',
  'Investment':       '#ffd56b',
  'Banking & Fees':   '#888',
  'Income':           '#9dff6f',
  'Other':            'rgba(132,212,226,.5)',
}

const ALL_CATEGORIES = [
  'Housing', 'Food & Groceries', 'Eating Out', 'Transport',
  'Subscriptions', 'Health & Sport', 'Shopping', 'Investment',
  'Income', 'Banking & Fees', 'Other',
]

function CategoryPicker({ current, onChange, onClose }) {
  return (
    <div
      onClick={e => e.target === e.currentTarget && onClose()}
      style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,.88)', zIndex: 200, display: 'flex', alignItems: 'flex-end', justifyContent: 'center' }}
    >
      <div style={{ padding: '20px 16px 100px', width: '100%', maxWidth: 480, background: CARD, borderTop: `1px solid rgba(0,187,221,.3)`, position: 'relative', overflow: 'hidden' }}>
        <div style={{ position: 'absolute', top: 0, left: 0, right: 0, height: 1, background: `linear-gradient(90deg, rgba(0,187,221,.6), rgba(0,187,221,.15), transparent)` }} />
        <div style={{ width: 36, height: 3, background: 'rgba(0,187,221,.25)', borderRadius: 2, margin: '0 auto 16px' }} />
        <div style={{ fontFamily: MONO, fontSize: 9, color: muted, letterSpacing: '.18em', marginBottom: 14 }}>SELECT CATEGORY</div>
        {ALL_CATEGORIES.map(cat => (
          <div
            key={cat}
            onClick={() => { onChange(cat); onClose() }}
            style={{
              display: 'block', width: '100%', textAlign: 'left', padding: '10px 12px',
              background: cat === current ? 'rgba(0,187,221,.08)' : 'transparent',
              border: 'none', borderBottom: '1px solid rgba(0,187,221,.06)',
              color: CAT_COLORS[cat] || muted, fontSize: 14, fontFamily: BODY,
              cursor: 'pointer', marginBottom: 0,
            }}
          >{cat}</div>
        ))}
      </div>
    </div>
  )
}

export default function BudgetUpload({ onBack, onSaved }) {
  const [tab, setTab] = useState('text')
  const [raw, setRaw] = useState('')
  const [pdfFile, setPdfFile] = useState(null)
  const [parsing, setParsing] = useState(false)
  const [parseError, setParseError] = useState('')
  const [transactions, setTransactions] = useState(null)
  const [saving, setSaving] = useState(false)
  const [pickerIdx, setPickerIdx] = useState(null)

  // inject fonts once
  if (typeof document !== 'undefined' && !document.getElementById('ph-fonts')) {
    const link = document.createElement('link')
    link.id = 'ph-fonts'; link.rel = 'stylesheet'; link.href = FONTS_URL
    document.head.appendChild(link)
  }
  if (typeof document !== 'undefined' && !document.getElementById('ph-keyframes')) {
    const style = document.createElement('style')
    style.id = 'ph-keyframes'; style.textContent = KEYFRAMES
    document.head.appendChild(style)
  }

  async function handleParse() {
    if (!raw.trim()) return
    setParsing(true); setParseError('')
    try {
      const r = await parseBudgetTransactions(raw.trim())
      setTransactions(r.transactions)
    } catch (err) {
      setParseError(err.message || 'Parse failed. Check your text and try again.')
    } finally { setParsing(false) }
  }

  async function handlePdfParse() {
    if (!pdfFile) return
    setParsing(true); setParseError('')
    try {
      const r = await parseBudgetPdf(pdfFile)
      setTransactions(r.transactions)
    } catch (err) {
      setParseError(err.message || 'PDF parse failed. Use a text-based PDF or paste the statement text.')
    } finally { setParsing(false) }
  }

  function updateCategory(idx, cat) {
    setTransactions(prev => prev.map((t, i) => i === idx ? { ...t, category: cat } : t))
  }

  async function handleSave() {
    setSaving(true)
    try {
      await saveBudgetTransactions(transactions)
      onSaved()
    } catch { setSaving(false) }
  }

  return (
    <div style={{ height: '100%', display: 'flex', flexDirection: 'column', background: BG, color: 'rgba(199,236,244,.92)', fontFamily: BODY }}>

      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', padding: '13px 18px 11px', borderBottom: border, position: 'sticky', top: 0, background: `${CARD}f5`, backdropFilter: 'blur(12px)', zIndex: 5, flexShrink: 0, overflow: 'hidden' }}>
        <div style={{ position: 'absolute', top: 0, left: 0, right: 0, height: 1, background: `linear-gradient(90deg,transparent,${ACCENT},transparent)`, animation: 'phScan 4s linear infinite' }} />
        <span onClick={onBack} style={{ color: ACCENT, fontSize: 16, marginRight: 10, cursor: 'pointer' }}>←</span>
        <span style={{ fontFamily: DISPLAY, fontSize: 16, fontWeight: 700, letterSpacing: '.28em', color: ACCENT, textShadow: '0 0 20px rgba(0,187,221,.4)' }}>
          {transactions ? 'REVIEW TRANSACTIONS' : 'ADD TRANSACTIONS'}
        </span>
      </div>

      <div style={{ flex: 1, overflowY: 'auto', padding: 18, paddingBottom: 100 }}>
        {!transactions ? (
          <>
            {/* Tabs */}
            <div style={{ display: 'flex', gap: 8, marginBottom: 16 }}>
              {[['text', 'PASTE TEXT'], ['pdf', 'UPLOAD PDF']].map(([t, label]) => (
                <div
                  key={t}
                  onClick={() => { setTab(t); setParseError('') }}
                  style={{
                    flex: 1, textAlign: 'center', padding: '10px 0',
                    fontFamily: MONO, fontSize: 9, fontWeight: 700, letterSpacing: '.18em',
                    cursor: 'pointer', userSelect: 'none', borderRadius: 2,
                    border: tab === t ? `1px solid ${ACCENT}` : border,
                    color: tab === t ? '#7de8ff' : muted,
                    background: tab === t ? 'rgba(0,187,221,.08)' : 'transparent',
                    textShadow: tab === t ? '0 0 8px rgba(0,187,221,.5)' : 'none',
                  }}
                >{label}</div>
              ))}
            </div>

            {tab === 'pdf' ? (
              <>
                <div style={{ fontFamily: MONO, fontSize: 8, color: muted, letterSpacing: '.15em', marginBottom: 8 }}>
                  UPLOAD LHV PDF STATEMENT
                </div>
                <label
                  htmlFor="budget-pdf-upload"
                  style={{
                    display: 'block', padding: '28px 14px', textAlign: 'center', cursor: 'pointer',
                    border: pdfFile ? `1px solid rgba(0,187,221,.6)` : border,
                    background: pdfFile ? 'rgba(0,187,221,.06)' : 'rgba(0,187,221,.02)',
                    boxShadow: pdfFile ? '0 0 30px rgba(0,187,221,.08)' : 'none',
                    borderRadius: 3, marginBottom: 10,
                  }}
                >
                  <input
                    id="budget-pdf-upload"
                    type="file"
                    accept="application/pdf,.pdf"
                    onChange={e => { setPdfFile(e.target.files?.[0] || null); setParseError('') }}
                    style={{ display: 'none' }}
                  />
                  <div style={{ fontFamily: DISPLAY, fontSize: 16, fontWeight: 700, letterSpacing: '.16em', color: pdfFile ? '#7de8ff' : muted, marginBottom: 8 }}>
                    {pdfFile ? pdfFile.name : 'TAP TO SELECT PDF'}
                  </div>
                  <div style={{ fontFamily: MONO, fontSize: 9, color: 'rgba(0,187,221,.35)', lineHeight: 1.6 }}>
                    Text-based bank PDFs only · max 8 MB · file is parsed, not stored
                  </div>
                </label>
                {parseError && (
                  <div style={{ color: '#ff5c7a', fontFamily: MONO, fontSize: 11, marginTop: 8 }}>{parseError}</div>
                )}
                <div
                  onClick={!parsing && pdfFile ? handlePdfParse : undefined}
                  style={{
                    width: '100%', marginTop: 12, padding: '12px 0',
                    border: `1px solid ${!pdfFile || parsing ? 'rgba(0,187,221,.2)' : 'rgba(0,187,221,.6)'}`,
                    background: !pdfFile || parsing ? 'transparent' : 'rgba(0,187,221,.06)',
                    color: !pdfFile || parsing ? muted : '#7de8ff',
                    fontFamily: MONO, fontSize: 9, fontWeight: 700, letterSpacing: '.2em',
                    textAlign: 'center', cursor: !pdfFile || parsing ? 'default' : 'pointer',
                    textShadow: !pdfFile || parsing ? 'none' : '0 0 10px rgba(0,187,221,.5)',
                    userSelect: 'none', borderRadius: 2, boxSizing: 'border-box',
                  }}
                >
                  {parsing ? 'EXTRACTING PDF…' : 'PARSE PDF TRANSACTIONS'}
                </div>
              </>
            ) : (
              <>
                <div style={{ fontFamily: MONO, fontSize: 8, color: muted, letterSpacing: '.15em', marginBottom: 8 }}>
                  PASTE LHV TRANSACTIONS
                </div>
                <div style={{ fontFamily: MONO, fontSize: 10, color: 'rgba(0,187,221,.35)', marginBottom: 12, padding: '8px 10px', background: 'rgba(0,187,221,.02)', border }}>
                  Time: 25.06.2026 Receiver: TORUPILLI SELVER ISETE Amount: 14.57 EUR...
                </div>
                <textarea
                  value={raw}
                  onChange={e => setRaw(e.target.value)}
                  placeholder="Paste your LHV transactions here..."
                  style={{
                    width: '100%', minHeight: 220,
                    background: 'rgba(0,187,221,.02)',
                    border,
                    color: 'rgba(199,236,244,.87)', fontSize: 12, fontFamily: MONO,
                    padding: '12px', resize: 'vertical', outline: 'none',
                    boxSizing: 'border-box', borderRadius: 2,
                  }}
                />
                {parseError && (
                  <div style={{ color: '#ff5c7a', fontFamily: MONO, fontSize: 11, marginTop: 8 }}>{parseError}</div>
                )}
                <div
                  onClick={!parsing && raw.trim() ? handleParse : undefined}
                  style={{
                    width: '100%', marginTop: 12, padding: '12px 0',
                    border: `1px solid ${!raw.trim() || parsing ? 'rgba(0,187,221,.2)' : 'rgba(0,187,221,.6)'}`,
                    background: !raw.trim() || parsing ? 'transparent' : 'rgba(0,187,221,.06)',
                    color: !raw.trim() || parsing ? muted : '#7de8ff',
                    fontFamily: MONO, fontSize: 9, fontWeight: 700, letterSpacing: '.2em',
                    textAlign: 'center', cursor: !raw.trim() || parsing ? 'default' : 'pointer',
                    textShadow: !raw.trim() || parsing ? 'none' : '0 0 10px rgba(0,187,221,.5)',
                    userSelect: 'none', borderRadius: 2, boxSizing: 'border-box',
                  }}
                >
                  {parsing ? 'PARSING…' : 'PARSE TRANSACTIONS'}
                </div>
              </>
            )}
          </>
        ) : (
          <>
            <div style={{ fontFamily: MONO, fontSize: 8, color: muted, letterSpacing: '.12em', marginBottom: 12 }}>
              {transactions.length} TRANSACTIONS FOUND · TAP CATEGORY TO EDIT
            </div>
            <div style={{ background: CARD, border, borderRadius: 4, overflow: 'hidden', marginBottom: 14, position: 'relative' }}>
              <div style={{ position: 'absolute', top: 0, left: 0, right: 0, height: 1, background: `linear-gradient(90deg, rgba(0,187,221,.4), rgba(0,187,221,.1), transparent)` }} />
              {transactions.map((t, i) => (
                <div key={i} style={{ padding: '10px 14px', borderBottom: i < transactions.length - 1 ? '1px solid rgba(0,187,221,.07)' : 'none', display: 'flex', alignItems: 'center', gap: 10 }}>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontFamily: BODY, fontSize: 13, color: 'rgba(199,236,244,.87)', marginBottom: 2, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{t.merchant}</div>
                    <div style={{ fontFamily: MONO, fontSize: 8, color: muted }}>{t.date}</div>
                  </div>
                  <div
                    onClick={() => setPickerIdx(i)}
                    style={{
                      padding: '3px 8px',
                      background: `${CAT_COLORS[t.category] || muted}22`,
                      border: `1px solid ${CAT_COLORS[t.category] || muted}55`,
                      color: CAT_COLORS[t.category] || muted,
                      fontFamily: MONO, fontSize: 8, letterSpacing: '.06em',
                      cursor: 'pointer', whiteSpace: 'nowrap', flexShrink: 0, borderRadius: 2,
                    }}
                  >{t.category}</div>
                  <div style={{ fontFamily: BODY, fontSize: 13, fontWeight: 600, color: t.is_income ? '#4dffb4' : 'rgba(199,236,244,.87)', flexShrink: 0 }}>
                    {t.is_income ? '+' : ''}€{Math.abs(t.amount_eur).toFixed(2)}
                  </div>
                </div>
              ))}
            </div>
            <div style={{ display: 'flex', gap: 8 }}>
              <div
                onClick={() => setTransactions(null)}
                style={{ flex: 1, padding: '11px 0', border, color: muted, background: 'transparent', fontFamily: MONO, fontSize: 9, letterSpacing: '.18em', textAlign: 'center', cursor: 'pointer', userSelect: 'none', borderRadius: 2 }}
              >← RE-PARSE</div>
              <div
                onClick={!saving ? handleSave : undefined}
                style={{ flex: 2, padding: '11px 0', border: `1px solid rgba(0,187,221,.6)`, color: '#7de8ff', background: 'rgba(0,187,221,.08)', fontFamily: MONO, fontSize: 9, fontWeight: 700, letterSpacing: '.18em', textAlign: 'center', cursor: saving ? 'wait' : 'pointer', userSelect: 'none', textShadow: '0 0 10px rgba(0,187,221,.5)', borderRadius: 2 }}
              >{saving ? 'SAVING…' : 'SAVE ALL'}</div>
            </div>
          </>
        )}
      </div>

      {pickerIdx !== null && (
        <CategoryPicker
          current={transactions[pickerIdx]?.category}
          onChange={cat => updateCategory(pickerIdx, cat)}
          onClose={() => setPickerIdx(null)}
        />
      )}
    </div>
  )
}
