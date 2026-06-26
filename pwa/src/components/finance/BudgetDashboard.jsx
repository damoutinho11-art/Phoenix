import { useState, useEffect } from 'react'
import { getBudgetSummary, getBudgetMonths } from '../../api/client'
import { speak } from '../../services/tts'

const BG = '#0a0a0a'
const CARD = '#111'
const BORDER = '#1a1a1a'
const TEXT = '#e8e8e8'
const DIM = '#555'
const ORANGE = '#ff9f43'
const CYAN = '#20d8ec'
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
  'Income': '#fff',
  'Other': '#555',
}

function fmtMonth(m) {
  if (!m) return ''
  const [y, mo] = m.split('-')
  return new Date(+y, +mo - 1).toLocaleString('en-GB', { month: 'long', year: 'numeric' })
}

export default function BudgetDashboard({ onBack, onUpload }) {
  const today = new Date().toISOString().slice(0, 7)
  const [month, setMonth] = useState(today)
  const [months, setMonths] = useState([today])
  const [summary, setSummary] = useState(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    getBudgetMonths()
      .then(r => {
        const list = r.months || []
        if (!list.includes(today)) list.unshift(today)
        setMonths(list)
      })
      .catch(() => {})
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    setLoading(true)
    getBudgetSummary(month)
      .then(r => {
        setSummary(r)
        if (r.insight) speak(r.insight)
      })
      .catch(() => setSummary(null))
      .finally(() => setLoading(false))
  }, [month])

  function prevMonth() {
    const idx = months.indexOf(month)
    if (idx < months.length - 1) setMonth(months[idx + 1])
  }
  function nextMonth() {
    const idx = months.indexOf(month)
    if (idx > 0) setMonth(months[idx - 1])
  }

  const hasData = summary && (summary.income_total > 0 || summary.expenses_total > 0)
  const expenses = summary?.by_category
    ? Object.entries(summary.by_category)
        .filter(([cat]) => cat !== 'Income' && cat !== 'Investment')
        .sort((a, b) => b[1].total - a[1].total)
    : []
  const maxExpense = expenses.length ? Math.max(...expenses.map(([, v]) => v.total)) : 1

  return (
    <div style={{ height: '100%', overflowY: 'auto', background: BG, color: TEXT, fontFamily: 'Inter, sans-serif' }}>
      {/* Header */}
      <div style={{ padding: '14px 16px 10px', display: 'flex', alignItems: 'center', gap: 12, borderBottom: `1px solid ${BORDER}` }}>
        <button onClick={onBack} style={{ background: 'none', border: 'none', color: DIM, fontSize: 20, cursor: 'pointer', padding: 0, lineHeight: 1 }}>←</button>
        <span style={{ fontFamily: DISPLAY, fontSize: 13, color: ORANGE, letterSpacing: '0.12em', fontWeight: 600 }}>BUDGET</span>
        {/* Month selector */}
        <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 8 }}>
          <button onClick={prevMonth} style={{ background: 'none', border: 'none', color: DIM, fontSize: 16, cursor: 'pointer', padding: '0 4px' }}>‹</button>
          <span style={{ fontFamily: MONO, fontSize: 11, color: TEXT }}>{fmtMonth(month)}</span>
          <button onClick={nextMonth} style={{ background: 'none', border: 'none', color: DIM, fontSize: 16, cursor: 'pointer', padding: '0 4px' }}>›</button>
        </div>
      </div>

      {loading ? (
        <div style={{ padding: 40, textAlign: 'center', color: DIM, fontFamily: MONO, fontSize: 12 }}>Loading…</div>
      ) : !hasData ? (
        <div style={{ padding: '60px 24px', textAlign: 'center' }}>
          <div style={{ color: DIM, fontFamily: DISPLAY, fontSize: 14, marginBottom: 20 }}>No transactions for {fmtMonth(month)}.</div>
          <button onClick={onUpload} style={{
            padding: '11px 24px', background: ORANGE, border: 'none', borderRadius: 8,
            color: '#000', fontSize: 13, fontWeight: 700, fontFamily: DISPLAY, letterSpacing: '0.1em', cursor: 'pointer',
          }}>+ ADD TRANSACTIONS</button>
        </div>
      ) : (
        <>
          {/* Savings rate hero */}
          <div style={{ padding: '20px 16px 0', textAlign: 'center' }}>
            <div style={{ fontFamily: MONO, fontSize: 64, color: (summary.savings_rate >= 25) ? '#9dff6f' : ORANGE, lineHeight: 1 }}>
              {summary.savings_rate}%
            </div>
            <div style={{ fontSize: 10, color: DIM, fontFamily: DISPLAY, letterSpacing: '0.15em', marginTop: 6 }}>
              SAVINGS RATE · TARGET 25%
            </div>
          </div>

          {/* Income / Expenses / Invested row */}
          <div style={{ display: 'flex', gap: 8, padding: '16px 16px 0' }}>
            {[
              { label: 'INCOME', value: summary.income_total, color: '#9dff6f' },
              { label: 'EXPENSES', value: summary.expenses_total, color: '#ff5c7a' },
              { label: 'INVESTED', value: summary.invested_total, color: '#ffd56b' },
            ].map(({ label, value, color }) => (
              <div key={label} style={{ flex: 1, background: CARD, border: `1px solid ${BORDER}`, borderRadius: 8, padding: '10px 8px', textAlign: 'center' }}>
                <div style={{ fontFamily: MONO, fontSize: 16, color }}>{value > 0 ? `€${value.toFixed(0)}` : '—'}</div>
                <div style={{ fontSize: 9, color: DIM, fontFamily: DISPLAY, letterSpacing: '0.08em', marginTop: 4 }}>{label}</div>
              </div>
            ))}
          </div>

          {/* Spending by category */}
          {expenses.length > 0 && (
            <div style={{ padding: '16px 16px 0' }}>
              <div style={{ fontSize: 11, fontFamily: DISPLAY, letterSpacing: '0.1em', color: DIM, marginBottom: 10 }}>BY CATEGORY</div>
              <div style={{ background: CARD, border: `1px solid ${BORDER}`, borderRadius: 8, overflow: 'hidden' }}>
                {expenses.map(([cat, data], i) => {
                  const color = CAT_COLORS[cat] || DIM
                  const pct = Math.max(4, (data.total / maxExpense) * 100)
                  return (
                    <div key={cat} style={{
                      padding: '10px 14px',
                      borderBottom: i < expenses.length - 1 ? `1px solid ${BORDER}` : 'none',
                    }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 5 }}>
                        <span style={{ fontSize: 12, color: TEXT }}>{cat}</span>
                        <span style={{ fontFamily: MONO, fontSize: 12, color }}>€{data.total.toFixed(2)}</span>
                      </div>
                      <div style={{ height: 3, background: '#1a1a1a', borderRadius: 2 }}>
                        <div style={{ height: 3, width: `${pct}%`, background: color, borderRadius: 2 }} />
                      </div>
                    </div>
                  )
                })}
              </div>
            </div>
          )}

          {/* JARVIS insight */}
          {summary.insight && (
            <div style={{ margin: '16px 16px 0', padding: '12px 14px', background: CARD, border: `1px solid ${BORDER}`, borderLeft: `3px solid ${CYAN}`, borderRadius: 8 }}>
              <div style={{ fontSize: 10, fontFamily: DISPLAY, letterSpacing: '0.1em', color: CYAN, marginBottom: 6 }}>JARVIS ASSESSMENT</div>
              <div style={{ fontSize: 13, color: TEXT, lineHeight: 1.5 }}>{summary.insight}</div>
            </div>
          )}

          {/* Add transactions button */}
          <div style={{ padding: '16px 16px 32px' }}>
            <button onClick={onUpload} style={{
              width: '100%', padding: 12, background: 'none',
              border: `1px solid ${ORANGE}55`, borderRadius: 8,
              color: ORANGE, fontSize: 12, fontWeight: 600, fontFamily: DISPLAY,
              letterSpacing: '0.1em', cursor: 'pointer',
            }}>+ ADD TRANSACTIONS</button>
          </div>
        </>
      )}
    </div>
  )
}
