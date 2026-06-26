import { useState } from 'react'
import { parseBudgetTransactions, saveBudgetTransactions } from '../../api/client'

const CAT_COLORS = {
  'Food & Groceries': '#4dffb4',
  'Eating Out': '#ff8f2e',
  'Subscriptions': '#ff5c7a',
  'Transport': '#20d8ec',
  'Housing': '#9f7dff',
  'Health & Sport': '#7dffb4',
  'Shopping': '#ffd56b',
  'Investment': '#ffd56b',
  'Banking & Fees': '#888',
  'Income': '#9dff6f',
  'Other': 'rgba(132,212,226,.32)',
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
      <div className="glass" style={{ padding: '20px 16px 36px', width: '100%', maxWidth: 480, borderRadius: 0 }}>
        <div style={{ fontFamily: 'var(--mono)', fontSize: 9, color: 'var(--gold)', letterSpacing: '.12em', marginBottom: 16 }}>SELECT CATEGORY</div>
        {ALL_CATEGORIES.map(cat => (
          <button
            key={cat}
            onClick={() => { onChange(cat); onClose() }}
            style={{
              display: 'block', width: '100%', textAlign: 'left', padding: '10px 12px',
              background: cat === current ? 'rgba(32,216,236,.08)' : 'none',
              border: 'none',
              color: CAT_COLORS[cat] || 'var(--dim)', fontSize: 13, fontFamily: 'var(--body)',
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
    <div style={{ height: '100%', display: 'flex', flexDirection: 'column', background: '#000', color: 'rgba(199,236,244,.92)', fontFamily: "'Saira Condensed',sans-serif" }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', padding: '13px 18px 11px', borderBottom: '1px solid rgba(255,213,107,.18)', position: 'sticky', top: 0, background: 'rgba(0,0,0,.96)', backdropFilter: 'blur(12px)', zIndex: 5, flexShrink: 0 }}>
        <span onClick={onBack} style={{ color: '#ffd56b', fontSize: 16, marginRight: 10, cursor: 'pointer' }}>←</span>
        <span style={{ fontFamily: 'var(--display)', fontSize: 13, fontWeight: 700, letterSpacing: '.28em', color: '#ffd56b' }}>
          {transactions ? 'REVIEW TRANSACTIONS' : 'ADD TRANSACTIONS'}
        </span>
      </div>

      <div style={{ flex: 1, overflowY: 'auto', padding: 16 }}>
        {!transactions ? (
          <>
            {/* Tabs */}
            <div style={{ display: 'flex', gap: 8, marginBottom: 16 }}>
              {[['text', 'PASTE TEXT'], ['pdf', 'UPLOAD PDF']].map(([t, label]) => (
                <button key={t} onClick={() => setTab(t)} className={`action${tab === t ? ' warn' : ' ghost'}`} style={{ flex: 1, justifyContent: 'center' }}>
                  {label}
                </button>
              ))}
            </div>

            {tab === 'pdf' ? (
              <div style={{ padding: '40px 0', textAlign: 'center', color: 'var(--dim)', fontFamily: 'var(--display)', fontSize: 12, letterSpacing: '.1em' }}>
                PDF IMPORT COMING SOON
              </div>
            ) : (
              <>
                <div style={{ fontFamily: 'var(--mono)', fontSize: 9, color: 'var(--muted)', letterSpacing: '.08em', marginBottom: 8 }}>
                  PASTE LHV TRANSACTIONS
                </div>
                <div style={{ fontFamily: 'var(--mono)', fontSize: 10, color: 'var(--dim)', marginBottom: 12, padding: '8px 10px', background: 'rgba(1,10,13,.7)', border: '1px solid var(--line)' }}>
                  Time: 25.06.2026 Receiver: TORUPILLI SELVER ISETE Amount: 14.57 EUR...
                </div>
                <textarea
                  value={raw}
                  onChange={e => setRaw(e.target.value)}
                  placeholder="Paste your LHV transactions here..."
                  style={{
                    width: '100%', minHeight: 220,
                    background: 'rgba(1,10,13,.7)',
                    border: '1px solid var(--line)',
                    color: 'var(--text)', fontSize: 12, fontFamily: 'var(--mono)',
                    padding: '12px', resize: 'vertical', outline: 'none',
                    boxSizing: 'border-box',
                  }}
                />
                {parseError && (
                  <div style={{ color: 'var(--red)', fontFamily: 'var(--mono)', fontSize: 11, marginTop: 8 }}>{parseError}</div>
                )}
                <button
                  onClick={handleParse}
                  disabled={parsing || !raw.trim()}
                  className={`action lg${parsing || !raw.trim() ? ' ghost' : ''}`}
                  style={{ width: '100%', marginTop: 12, justifyContent: 'center' }}
                >
                  {parsing ? 'PARSING…' : 'PARSE TRANSACTIONS'}
                </button>
              </>
            )}
          </>
        ) : (
          <>
            <div style={{ fontFamily: 'var(--mono)', fontSize: 9, color: 'var(--muted)', letterSpacing: '.08em', marginBottom: 12 }}>
              {transactions.length} TRANSACTIONS FOUND — TAP CATEGORY TO EDIT
            </div>
            <div className="glass" style={{ overflow: 'hidden', marginBottom: 16 }}>
              {transactions.map((t, i) => (
                <div key={i} style={{
                  padding: '10px 14px',
                  borderBottom: i < transactions.length - 1 ? '1px solid var(--line)' : 'none',
                  display: 'flex', alignItems: 'center', gap: 10,
                }}>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontFamily: 'var(--body)', fontSize: 12, color: 'var(--text)', marginBottom: 2, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {t.merchant}
                    </div>
                    <div style={{ fontFamily: 'var(--mono)', fontSize: 9, color: 'var(--muted)' }}>{t.date}</div>
                  </div>
                  <button onClick={() => setPickerIdx(i)} style={{
                    padding: '3px 8px',
                    background: `${CAT_COLORS[t.category] || 'var(--dim)'}22`,
                    border: `1px solid ${CAT_COLORS[t.category] || 'var(--dim)'}55`,
                    color: CAT_COLORS[t.category] || 'var(--dim)',
                    fontFamily: 'var(--mono)', fontSize: 8, letterSpacing: '.06em',
                    cursor: 'pointer', whiteSpace: 'nowrap', flexShrink: 0,
                  }}>{t.category}</button>
                  <div style={{ fontFamily: 'var(--mono)', fontSize: 12, color: t.is_income ? 'var(--green)' : 'var(--text)', flexShrink: 0 }}>
                    {t.is_income ? '+' : ''}€{Math.abs(t.amount_eur).toFixed(2)}
                  </div>
                </div>
              ))}
            </div>
            <div style={{ display: 'flex', gap: 8 }}>
              <button onClick={() => setTransactions(null)} className="action ghost" style={{ flex: 1 }}>← RE-PARSE</button>
              <button onClick={handleSave} disabled={saving} className={`action safe lg${saving ? ' ghost' : ''}`} style={{ flex: 2 }}>
                {saving ? 'SAVING…' : 'SAVE ALL'}
              </button>
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
