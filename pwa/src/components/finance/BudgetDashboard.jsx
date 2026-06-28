import { useState, useEffect } from 'react'
import { getBudgetSummary, getBudgetMonths } from '../../api/client'
import { speak } from '../../services/tts'

const FONTS_URL = 'https://fonts.googleapis.com/css2?family=Rajdhani:wght@500;600;700&family=Space+Grotesk:wght@300;400;500;600;700&family=Share+Tech+Mono&display=swap'
const KEYFRAMES = `@keyframes phScan { 0%{transform:translateX(-100%)} 100%{transform:translateX(100%)} }`

const MONO = "'Share Tech Mono', monospace"
const DISPLAY = "'Rajdhani', sans-serif"
const BODY = "'Space Grotesk', sans-serif"
const BG = '#060c12'
const CARD = '#070e15'
const GOLD = '#00bbdd'
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
  'Income':           '#fff',
  'Other':            'rgba(132,212,226,.5)',
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
    if (!document.getElementById('ph-fonts')) {
      const link = document.createElement('link')
      link.id = 'ph-fonts'; link.rel = 'stylesheet'; link.href = FONTS_URL
      document.head.appendChild(link)
    }
    if (!document.getElementById('ph-keyframes')) {
      const style = document.createElement('style')
      style.id = 'ph-keyframes'; style.textContent = KEYFRAMES
      document.head.appendChild(style)
    }
  }, [])

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
  const savingsGood = summary?.savings_rate >= 25

  return (
    <div style={{ height: '100%', overflowY: 'auto', paddingBottom: 100, background: BG, color: 'rgba(199,236,244,.92)', fontFamily: BODY }}>

      {/* Top bar */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '13px 18px 11px', borderBottom: border, position: 'sticky', top: 0, background: `${CARD}f5`, backdropFilter: 'blur(12px)', zIndex: 5, overflow: 'hidden' }}>
        <div style={{ position: 'absolute', top: 0, left: 0, right: 0, height: 1, background: `linear-gradient(90deg,transparent,${GOLD},transparent)`, animation: 'phScan 4s linear infinite' }} />
        <div style={{ display: 'flex', alignItems: 'center' }}>
          <span onClick={onBack} style={{ color: GOLD, fontSize: 16, marginRight: 10, cursor: 'pointer' }}>←</span>
          <span style={{ fontFamily: DISPLAY, fontSize: 16, fontWeight: 700, letterSpacing: '.28em', color: GOLD, textShadow: '0 0 20px rgba(0,187,221,.4)' }}>BUDGET</span>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <span onClick={prevMonth} style={{ color: GOLD, fontSize: 18, cursor: 'pointer', padding: '2px 6px', userSelect: 'none' }}>‹</span>
          <span style={{ fontFamily: MONO, fontSize: 9, color: 'rgba(0,187,221,.7)', letterSpacing: '.1em' }}>{fmtMonth(month)}</span>
          <span onClick={nextMonth} style={{ color: GOLD, fontSize: 18, cursor: 'pointer', padding: '2px 6px', userSelect: 'none' }}>›</span>
        </div>
      </div>

      {loading && (
        <div style={{ padding: 40, textAlign: 'center', color: muted, fontFamily: MONO, fontSize: 9, letterSpacing: '.2em' }}>LOADING…</div>
      )}

      {!loading && !hasData && (
        <div style={{ padding: '60px 24px', textAlign: 'center' }}>
          <div style={{ fontFamily: DISPLAY, fontSize: 20, fontWeight: 700, color: GOLD, marginBottom: 24, textShadow: '0 0 20px rgba(0,187,221,.3)' }}>
            No transactions for {fmtMonth(month)}.
          </div>
          <div
            onClick={onUpload}
            style={{ display: 'inline-block', padding: '12px 24px', border: `1px solid ${GOLD}`, background: 'rgba(0,187,221,.08)', color: GOLD, fontFamily: MONO, fontSize: 9, fontWeight: 700, letterSpacing: '.2em', cursor: 'pointer', userSelect: 'none', textShadow: '0 0 10px rgba(0,187,221,.4)' }}
          >
            + ADD TRANSACTIONS
          </div>
        </div>
      )}

      {!loading && hasData && (
        <>
          {/* Savings rate hero */}
          <div style={{ padding: '24px 18px 0', textAlign: 'center', position: 'relative', overflow: 'hidden' }}>
            <div style={{ position: 'absolute', inset: 0, background: 'radial-gradient(ellipse at center top, rgba(0,187,221,.06) 0%, transparent 70%)', pointerEvents: 'none' }} />
            <div style={{ fontFamily: DISPLAY, fontSize: 68, fontWeight: 700, color: savingsGood ? '#4dffb4' : GOLD, lineHeight: 1, textShadow: `0 0 40px ${savingsGood ? 'rgba(77,255,180,.4)' : 'rgba(0,187,221,.4)'}` }}>
              {summary.savings_rate}%
            </div>
            <div style={{ fontFamily: MONO, fontSize: 8, color: muted, letterSpacing: '.2em', marginTop: 8 }}>
              SAVINGS RATE · TARGET 25%
            </div>
            {!savingsGood && (
              <div style={{ fontFamily: MONO, fontSize: 7, color: 'rgba(0,187,221,.5)', letterSpacing: '.15em', marginTop: 4 }}>
                BELOW TARGET
              </div>
            )}
          </div>

          {/* Income / Expenses / Invested */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 8, padding: '16px 18px 0' }}>
            {[
              { label: 'INCOME',   value: summary.income_total,   color: '#4dffb4' },
              { label: 'EXPENSES', value: summary.expenses_total,  color: '#ff5c7a' },
              { label: 'INVESTED', value: summary.invested_total,  color: GOLD },
            ].map(({ label, value, color }) => (
              <div key={label} style={{ background: 'rgba(0,187,221,.02)', border, borderRadius: 3, padding: '10px 12px', textAlign: 'center' }}>
                <div style={{ fontFamily: MONO, fontSize: 7, letterSpacing: '.14em', color: muted, marginBottom: 5 }}>{label}</div>
                <div style={{ fontFamily: BODY, fontSize: 16, fontWeight: 700, color }}>{value > 0 ? `€${value.toFixed(0)}` : '—'}</div>
              </div>
            ))}
          </div>

          {/* Category breakdown */}
          {expenses.length > 0 && (
            <div style={{ padding: '16px 18px 0' }}>
              <div style={{ fontFamily: MONO, fontSize: 8, letterSpacing: '.22em', color: muted, marginBottom: 10 }}>BY CATEGORY</div>
              <div style={{ background: CARD, border, borderRadius: 4, overflow: 'hidden', position: 'relative' }}>
                <div style={{ position: 'absolute', top: 0, left: 0, right: 0, height: 1, background: `linear-gradient(90deg, rgba(0,187,221,.4), rgba(0,187,221,.1), transparent)` }} />
                {expenses.map(([cat, data], i) => {
                  const color = CAT_COLORS[cat] || muted
                  const pct = Math.max(4, (data.total / maxExpense) * 100)
                  return (
                    <div key={cat} style={{ padding: '10px 14px', borderBottom: i < expenses.length - 1 ? '1px solid rgba(0,187,221,.08)' : 'none' }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6 }}>
                        <span style={{ fontFamily: BODY, fontSize: 13, color: 'rgba(199,236,244,.87)' }}>{cat}</span>
                        <span style={{ fontFamily: BODY, fontSize: 13, fontWeight: 600, color }}>€{data.total.toFixed(2)}</span>
                      </div>
                      <div style={{ height: 3, background: 'rgba(255,255,255,.06)', borderRadius: 2, overflow: 'hidden' }}>
                        <div style={{ height: '100%', width: `${pct}%`, background: color, boxShadow: `0 0 8px ${color}`, borderRadius: 2, transition: 'width .4s ease' }} />
                      </div>
                    </div>
                  )
                })}
              </div>
            </div>
          )}

          {/* JARVIS insight */}
          {summary.insight && (
            <div style={{ margin: '16px 18px 0', padding: '12px 14px', background: CARD, border: '1px solid rgba(0,187,221,.18)', borderLeft: '3px solid rgba(0,187,221,.6)', borderRadius: 3 }}>
              <div style={{ fontFamily: MONO, fontSize: 7, letterSpacing: '.18em', color: 'rgba(0,187,221,.6)', marginBottom: 6 }}>JARVIS ASSESSMENT</div>
              <div style={{ fontFamily: BODY, fontSize: 13, color: 'rgba(199,236,244,.87)', lineHeight: 1.6 }}>{summary.insight}</div>
            </div>
          )}

          {/* Add transactions */}
          <div style={{ padding: '16px 18px 32px' }}>
            <div
              onClick={onUpload}
              style={{ width: '100%', padding: '12px 0', border: `1px solid rgba(0,187,221,.5)`, background: 'rgba(0,187,221,.06)', color: '#7de8ff', fontFamily: MONO, fontSize: 9, fontWeight: 700, letterSpacing: '.2em', cursor: 'pointer', userSelect: 'none', textAlign: 'center', textShadow: '0 0 10px rgba(0,187,221,.4)', borderRadius: 2 }}
            >
              + ADD TRANSACTIONS
            </div>
          </div>
        </>
      )}
    </div>
  )
}
