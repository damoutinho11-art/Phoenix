import { useState, useEffect } from 'react'
import { getBudgetSummary, getBudgetMonths } from '../../api/client'
import { speak } from '../../services/tts'

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
  'Income': '#fff',
  'Other': 'rgba(132,212,226,.32)',
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
    <div style={{ height: '100%', overflowY: 'auto', background: '#000', color: 'rgba(199,236,244,.92)', fontFamily: "'Saira Condensed',sans-serif" }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '13px 18px 11px', borderBottom: '1px solid rgba(255,213,107,.18)', position: 'sticky', top: 0, background: 'rgba(0,0,0,.96)', backdropFilter: 'blur(12px)', zIndex: 5 }}>
        <div style={{ display: 'flex', alignItems: 'center' }}>
          <span onClick={onBack} style={{ color: '#ffd56b', fontSize: 16, marginRight: 10, cursor: 'pointer' }}>←</span>
          <span style={{ fontFamily: 'var(--display)', fontSize: 13, fontWeight: 700, letterSpacing: '.28em', color: '#ffd56b' }}>BUDGET</span>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <button onClick={prevMonth} style={{ background: 'none', border: 'none', color: '#ffd56b', fontSize: 16, cursor: 'pointer', padding: '2px 6px' }}>‹</button>
          <span style={{ fontFamily: 'var(--mono)', fontSize: 9, color: 'rgba(255,213,107,.7)', letterSpacing: '.1em' }}>{fmtMonth(month)}</span>
          <button onClick={nextMonth} style={{ background: 'none', border: 'none', color: '#ffd56b', fontSize: 16, cursor: 'pointer', padding: '2px 6px' }}>›</button>
        </div>
      </div>

      {loading ? (
        <div style={{ padding: 40, textAlign: 'center', color: 'var(--dim)', fontFamily: 'var(--mono)', fontSize: 12 }}>Loading…</div>
      ) : !hasData ? (
        <div style={{ padding: '60px 24px', textAlign: 'center' }}>
          <div style={{ color: 'var(--dim)', fontFamily: 'var(--display)', fontSize: 14, marginBottom: 20 }}>No transactions for {fmtMonth(month)}.</div>
          <button onClick={onUpload} className="action warn lg">+ ADD TRANSACTIONS</button>
        </div>
      ) : (
        <>
          {/* Savings rate hero */}
          <div style={{ padding: '20px 16px 0', textAlign: 'center' }}>
            <div style={{ fontFamily: 'var(--display)', fontSize: 64, color: summary.savings_rate >= 25 ? 'var(--green)' : 'var(--gold)', lineHeight: 1 }}>
              {summary.savings_rate}%
            </div>
            <div style={{ fontFamily: 'var(--mono)', fontSize: 9, color: 'var(--muted)', letterSpacing: '.15em', marginTop: 6 }}>
              SAVINGS RATE · TARGET 25%
            </div>
          </div>

          {/* Income / Expenses / Invested row */}
          <div style={{ display: 'flex', gap: 8, padding: '16px 16px 0' }}>
            {[
              { label: 'INCOME',   value: summary.income_total,   color: 'var(--green)' },
              { label: 'EXPENSES', value: summary.expenses_total,  color: 'var(--red)' },
              { label: 'INVESTED', value: summary.invested_total,  color: 'var(--gold)' },
            ].map(({ label, value, color }) => (
              <div key={label} className="metric" style={{ flex: 1, flexDirection: 'column', alignItems: 'center', textAlign: 'center' }}>
                <div className="label">{label}</div>
                <div className="value" style={{ fontSize: 16, color }}>{value > 0 ? `€${value.toFixed(0)}` : '—'}</div>
              </div>
            ))}
          </div>

          {/* Spending by category */}
          {expenses.length > 0 && (
            <div style={{ padding: '16px 16px 0' }}>
              <div className="panel-title">BY CATEGORY</div>
              <div className="glass" style={{ overflow: 'hidden' }}>
                {expenses.map(([cat, data], i) => {
                  const color = CAT_COLORS[cat] || 'var(--dim)'
                  const pct = Math.max(4, (data.total / maxExpense) * 100)
                  return (
                    <div key={cat} style={{
                      padding: '10px 14px',
                      borderBottom: i < expenses.length - 1 ? '1px solid var(--line)' : 'none',
                    }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 5 }}>
                        <span style={{ fontFamily: 'var(--body)', fontSize: 12, color: 'var(--text)' }}>{cat}</span>
                        <span style={{ fontFamily: 'var(--mono)', fontSize: 11, color }}>€{data.total.toFixed(2)}</span>
                      </div>
                      <div className="bar">
                        <span style={{ width: `${pct}%`, background: color, boxShadow: `0 0 8px ${color}` }} />
                      </div>
                    </div>
                  )
                })}
              </div>
            </div>
          )}

          {/* JARVIS insight */}
          {summary.insight && (
            <div className="glass" style={{ margin: '16px 16px 0', padding: '12px 14px', borderLeft: '3px solid var(--cyan)' }}>
              <div style={{ fontFamily: 'var(--mono)', fontSize: 9, color: 'var(--cyan)', letterSpacing: '.1em', marginBottom: 6 }}>JARVIS ASSESSMENT</div>
              <div style={{ fontFamily: 'var(--body)', fontSize: 13, color: 'var(--text)', lineHeight: 1.5 }}>{summary.insight}</div>
            </div>
          )}

          {/* Add transactions */}
          <div style={{ padding: '16px 16px 32px' }}>
            <button onClick={onUpload} className="action warn lg" style={{ width: '100%', justifyContent: 'center' }}>
              + ADD TRANSACTIONS
            </button>
          </div>
        </>
      )}
    </div>
  )
}
