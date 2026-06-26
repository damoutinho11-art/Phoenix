import { useState } from 'react'
import { parseBudgetTransactions, saveBudgetTransactions } from '../../api/client'

const BG = '#0a0a0a'
const CARD = '#111'
const BORDER = '#1a1a1a'
const TEXT = '#e8e8e8'
const DIM = '#555'
const ORANGE = '#ff9f43'
const MONO = "'Share Tech Mono', monospace"
const DISPLAY = "'Oswald', 'Inter', sans-serif"

const CAT_COLORS = {
  'Food & Groceries': '#4dffb4',
  'Eating Out': '#ff9f43',
  'Subscriptions': '#ff5c7a',
  'Transport': '#20d8ec',
  'Housing': '#9f7dff',
  'Health & Sport': '#7dffb4',
  'Shopping': '#ffd56b',
  'Investment': '#ffd56b',
  'Banking & Fees': '#888',
  'Income': '#9dff6f',
  'Other': '#555',
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
      style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.88)', zIndex: 200, display: 'flex', alignItems: 'flex-end', justifyContent: 'center' }}
    >
      <div style={{ background: '#131313', border: `1px solid ${BORDER}`, borderRadius: '16px 16px 0 0', padding: '20px 16px 36px', width: '100%', maxWidth: 480 }}>
        <div style={{ fontSize: 11, fontFamily: DISPLAY, letterSpacing: '0.12em', color: ORANGE, marginBottom: 16 }}>SELECT CATEGORY</div>
        {ALL_CATEGORIES.map(cat => (
          <button
            key={cat}
            onClick={() => { onChange(cat); onClose() }}
            style={{
              display: 'block', width: '100%', textAlign: 'left', padding: '10px 12px',
              background: cat === current ? '#1a1a1a' : 'none',
              border: 'none', borderRadius: 6,
              color: CAT_COLORS[cat] || DIM, fontSize: 13, fontFamily: 'Inter, sans-serif',
              cursor: 'pointer', marginBottom: 2,
            }}
          >{cat}</button>
        ))}
      </div>
    </div>
  )
}

export default function BudgetUpload({ onBack, onSaved }) {
  const [tab, setTab] = useState('text')
  const [raw, setRaw] = useState('')
  const [parsing, setParsing] = useState(false)
  const [parseError, setParseError] = useState('')
  const [transactions, setTransactions] = useState(null)
  const [saving, setSaving] = useState(false)
  const [pickerIdx, setPickerIdx] = useState(null)

  async function handleParse() {
    if (!raw.trim()) return
    setParsing(true)
    setParseError('')
    try {
      const r = await parseBudgetTransactions(raw.trim())
      setTransactions(r.transactions)
    } catch {
      setParseError('Parse failed. Check your text and try again.')
    } finally {
      setParsing(false)
    }
  }

  function updateCategory(idx, cat) {
    setTransactions(prev => prev.map((t, i) => i === idx ? { ...t, category: cat } : t))
  }

  async function handleSave() {
    setSaving(true)
    try {
      await saveBudgetTransactions(transactions)
      onSaved()
    } catch {
      setSaving(false)
    }
  }

  return (
    <div style={{ height: '100%', display: 'flex', flexDirection: 'column', background: BG, color: TEXT, fontFamily: 'Inter, sans-serif' }}>
      {/* Header */}
      <div style={{ padding: '14px 16px 10px', display: 'flex', alignItems: 'center', gap: 12, borderBottom: `1px solid ${BORDER}`, flexShrink: 0 }}>
        <button onClick={onBack} style={{ background: 'none', border: 'none', color: DIM, fontSize: 20, cursor: 'pointer', padding: 0, lineHeight: 1 }}>←</button>
        <span style={{ fontFamily: DISPLAY, fontSize: 13, color: ORANGE, letterSpacing: '0.12em', fontWeight: 600 }}>
          {transactions ? 'REVIEW TRANSACTIONS' : 'ADD TRANSACTIONS'}
        </span>
      </div>

      <div style={{ flex: 1, overflowY: 'auto', padding: 16 }}>
        {!transactions ? (
          <>
            {/* Tabs */}
            <div style={{ display: 'flex', gap: 8, marginBottom: 16 }}>
              {[['text', 'PASTE TEXT'], ['pdf', 'UPLOAD PDF']].map(([t, label]) => (
                <button key={t} onClick={() => setTab(t)} style={{
                  flex: 1, padding: '9px', border: `1px solid ${tab === t ? ORANGE : BORDER}`,
                  background: tab === t ? '#1a1200' : 'none', borderRadius: 8,
                  color: tab === t ? ORANGE : DIM, fontSize: 11, fontWeight: 600,
                  fontFamily: DISPLAY, letterSpacing: '0.08em', cursor: 'pointer',
                }}>{label}</button>
              ))}
            </div>

            {tab === 'pdf' ? (
              <div style={{ padding: '40px 0', textAlign: 'center', color: DIM, fontFamily: DISPLAY, fontSize: 12, letterSpacing: '0.1em' }}>
                PDF IMPORT COMING SOON
              </div>
            ) : (
              <>
                <div style={{ fontSize: 11, color: DIM, fontFamily: DISPLAY, letterSpacing: '0.08em', marginBottom: 8 }}>
                  PASTE LHV TRANSACTIONS
                </div>
                <div style={{ fontSize: 11, color: '#444', fontFamily: MONO, marginBottom: 12, padding: '8px 10px', background: '#0d0d0d', borderRadius: 6, border: `1px solid ${BORDER}` }}>
                  Time: 25.06.2026 Receiver: TORUPILLI SELVER ISETE Amount: 14.57 EUR...
                </div>
                <textarea
                  value={raw}
                  onChange={e => setRaw(e.target.value)}
                  placeholder="Paste your LHV transactions here..."
                  style={{
                    width: '100%', minHeight: 220, background: '#0d0d0d',
                    border: `1px solid ${BORDER}`, borderRadius: 8,
                    color: TEXT, fontSize: 12, fontFamily: MONO,
                    padding: '12px', resize: 'vertical', outline: 'none',
                    boxSizing: 'border-box',
                  }}
                />
                {parseError && (
                  <div style={{ color: '#ff5c7a', fontSize: 12, marginTop: 8 }}>{parseError}</div>
                )}
                <button
                  onClick={handleParse}
                  disabled={parsing || !raw.trim()}
                  style={{
                    width: '100%', marginTop: 12, padding: 13,
                    background: parsing || !raw.trim() ? '#1a1a1a' : ORANGE,
                    border: 'none', borderRadius: 8,
                    color: parsing || !raw.trim() ? DIM : '#000',
                    fontSize: 13, fontWeight: 700, fontFamily: DISPLAY,
                    letterSpacing: '0.1em', cursor: parsing || !raw.trim() ? 'default' : 'pointer',
                  }}
                >
                  {parsing ? 'PARSING…' : 'PARSE TRANSACTIONS'}
                </button>
              </>
            )}
          </>
        ) : (
          <>
            <div style={{ fontSize: 11, color: DIM, fontFamily: DISPLAY, letterSpacing: '0.08em', marginBottom: 12 }}>
              {transactions.length} TRANSACTIONS FOUND — TAP CATEGORY TO EDIT
            </div>
            <div style={{ background: CARD, border: `1px solid ${BORDER}`, borderRadius: 8, overflow: 'hidden', marginBottom: 16 }}>
              {transactions.map((t, i) => (
                <div key={i} style={{
                  padding: '10px 14px',
                  borderBottom: i < transactions.length - 1 ? `1px solid ${BORDER}` : 'none',
                  display: 'flex', alignItems: 'center', gap: 10,
                }}>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 12, color: TEXT, fontWeight: 500, marginBottom: 2, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {t.merchant}
                    </div>
                    <div style={{ fontFamily: MONO, fontSize: 10, color: DIM }}>{t.date}</div>
                  </div>
                  <button onClick={() => setPickerIdx(i)} style={{
                    padding: '3px 8px', background: `${CAT_COLORS[t.category] || DIM}22`,
                    border: `1px solid ${CAT_COLORS[t.category] || DIM}55`,
                    borderRadius: 4, color: CAT_COLORS[t.category] || DIM,
                    fontSize: 10, fontFamily: DISPLAY, letterSpacing: '0.06em',
                    cursor: 'pointer', whiteSpace: 'nowrap', flexShrink: 0,
                  }}>{t.category}</button>
                  <div style={{ fontFamily: MONO, fontSize: 13, color: t.is_income ? '#9dff6f' : TEXT, flexShrink: 0 }}>
                    {t.is_income ? '+' : ''}€{Math.abs(t.amount_eur).toFixed(2)}
                  </div>
                </div>
              ))}
            </div>
            <div style={{ display: 'flex', gap: 8 }}>
              <button onClick={() => setTransactions(null)} style={{
                flex: 1, padding: 12, background: 'none', border: `1px solid ${BORDER}`,
                borderRadius: 8, color: DIM, fontSize: 12, fontFamily: DISPLAY,
                letterSpacing: '0.08em', cursor: 'pointer',
              }}>← RE-PARSE</button>
              <button onClick={handleSave} disabled={saving} style={{
                flex: 2, padding: 12, background: saving ? '#1a2e1a' : '#9dff6f',
                border: 'none', borderRadius: 8, color: '#000',
                fontSize: 13, fontWeight: 700, fontFamily: DISPLAY,
                letterSpacing: '0.1em', cursor: saving ? 'default' : 'pointer',
              }}>{saving ? 'SAVING…' : 'SAVE ALL'}</button>
            </div>
          </>
        )}
        <div style={{ height: 32 }} />
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
