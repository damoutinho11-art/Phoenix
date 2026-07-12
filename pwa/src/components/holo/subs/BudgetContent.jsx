import { useEffect, useState } from 'react'
import { ACC, G, Y, R, W, BODY, FM, FD, FB, a, mix, deep } from '../holoTokens'
import { getBudgetSummary, getBudgetMonths } from '../../../api/client'

// Category grouping mirrors the original BudgetDashboard so the holo view
// classifies transactions identically (savings-rate math stays the same).
const SAVINGS_CATS = new Set(['Investment', 'Emergency Fund'])
const FIXED_CATS = new Set(['Housing'])
const TRANSFER_CATS = new Set(['Transfers'])
const NON_SPENDING = new Set(['Income', ...SAVINGS_CATS, ...TRANSFER_CATS])

const euro = (value, digits = 2) => {
  const n = Number(value || 0)
  return n > 0 ? '€' + n.toFixed(digits) : '—'
}

const fmtMonth = m => {
  if (!m) return ''
  const [y, mo] = m.split('-')
  return new Date(+y, +mo - 1).toLocaleString('en-GB', { month: 'long', year: 'numeric' })
}

function BreakdownGroup({ title, subtitle, rows, color }) {
  if (!rows.length) return null
  const max = Math.max(...rows.map(([, v]) => v.total), 1)
  return (
    <div style={{ marginTop: 14 }}>
      <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 12, marginBottom: 8 }}>
        <span style={{ fontFamily: FM, fontSize: 8, letterSpacing: '.22em', color: a(color, 'cc') }}>{title}</span>
        <span style={{ fontFamily: FM, fontSize: 7, letterSpacing: '.1em', color: a(ACC, '77'), textAlign: 'right' }}>{subtitle}</span>
      </div>
      <div style={{ border: `1px solid ${a(ACC, '20')}`, background: deep(76) }}>
        {rows.map(([cat, data], i) => (
          <div key={cat} style={{ padding: '9px 12px', borderBottom: i < rows.length - 1 ? `1px solid ${a(ACC, '10')}` : 'none' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 5 }}>
              <span style={{ fontFamily: FB, fontSize: 13, color: mix(BODY, 90) }}>{cat}</span>
              <span style={{ fontFamily: FD, fontSize: 15, fontWeight: 600, color }}>{euro(data.total)}</span>
            </div>
            <div style={{ height: 3, background: a(ACC, '14'), overflow: 'hidden' }}>
              <div style={{ height: '100%', width: Math.max(4, (data.total / max) * 100) + '%', background: color, boxShadow: `0 0 8px ${mix(color, 53)}`, transition: 'width .4s ease' }} />
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}

function StatTile({ label, value, color }) {
  return (
    <div style={{ border: `1px solid ${a(ACC, '20')}`, background: deep(58), padding: '11px 12px', textAlign: 'center' }}>
      <div style={{ fontFamily: FM, fontSize: 7, letterSpacing: '.16em', color: a(ACC, '88'), marginBottom: 5 }}>{label}</div>
      <div style={{ fontFamily: FD, fontSize: 20, fontWeight: 700, color }}>{value}</div>
    </div>
  )
}

// ── FINANCE // BUDGET — monthly income / expense / savings breakdown ──
// Self-fetching (like BriefContent): reads /budget/summary + /budget/months.
export function BudgetContent() {
  const thisMonth = new Date().toISOString().slice(0, 7)
  const [month, setMonth] = useState(thisMonth)
  const [months, setMonths] = useState([thisMonth])
  const [summary, setSummary] = useState(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    getBudgetMonths()
      .then(r => {
        const list = r.months || []
        if (!list.includes(thisMonth)) list.unshift(thisMonth)
        setMonths(list)
      })
      .catch(() => {})
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useEffect(() => {
    let alive = true
    setLoading(true)
    getBudgetSummary(month)
      .then(r => { if (alive) setSummary(r) })
      .catch(() => { if (alive) setSummary(null) })
      .finally(() => { if (alive) setLoading(false) })
    return () => { alive = false }
  }, [month])

  const idx = months.indexOf(month)
  const prev = () => { if (idx < months.length - 1) setMonth(months[idx + 1]) }
  const next = () => { if (idx > 0) setMonth(months[idx - 1]) }

  const hasData = summary && (summary.income_total > 0 || summary.expenses_total > 0)
  const cats = summary?.by_category || {}
  const rows = Object.entries(cats).sort((x, y) => y[1].total - x[1].total)
  const savingsRows = rows.filter(([c]) => SAVINGS_CATS.has(c))
  const fixedRows = rows.filter(([c]) => FIXED_CATS.has(c))
  const flexRows = rows.filter(([c]) => !NON_SPENDING.has(c) && !FIXED_CATS.has(c))
  const transferRows = rows.filter(([c]) => TRANSFER_CATS.has(c))
  const totalSavings = (summary?.invested_total || 0) + (cats['Emergency Fund']?.total || 0)
  const rate = summary?.savings_rate || 0
  const savingsGood = rate >= 25

  return (
    <div>
      {/* month picker */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
        <span style={{ fontFamily: FM, fontSize: 8, letterSpacing: '.24em', color: a(ACC, 'cc') }}>MONTHLY LEDGER</span>
        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}>
          <button onClick={prev} disabled={idx >= months.length - 1} style={{ minWidth: 30, minHeight: 30, fontFamily: FD, fontSize: 16, color: ACC, background: deep(60), border: `1px solid ${a(ACC, '44')}`, cursor: idx >= months.length - 1 ? 'not-allowed' : 'pointer' }}>‹</button>
          <span style={{ fontFamily: FM, fontSize: 9, letterSpacing: '.12em', color: a(ACC, 'cc'), minWidth: 118, textAlign: 'center' }}>{fmtMonth(month)}</span>
          <button onClick={next} disabled={idx <= 0} style={{ minWidth: 30, minHeight: 30, fontFamily: FD, fontSize: 16, color: ACC, background: deep(60), border: `1px solid ${a(ACC, '44')}`, cursor: idx <= 0 ? 'not-allowed' : 'pointer' }}>›</button>
        </span>
      </div>

      {loading && (
        <div style={{ padding: '48px 0', textAlign: 'center', fontFamily: FM, fontSize: 9, letterSpacing: '.24em', color: a(ACC, '99') }}>LOADING LEDGER…</div>
      )}

      {!loading && !hasData && (
        <div style={{ padding: '44px 18px', textAlign: 'center', border: `1px dashed ${a(ACC, '30')}`, background: deep(60) }}>
          <div style={{ fontFamily: FD, fontSize: 20, fontWeight: 700, color: ACC, marginBottom: 8 }}>No transactions for {fmtMonth(month)}</div>
          <div style={{ fontFamily: FM, fontSize: '7.5px', letterSpacing: '.14em', color: a(ACC, '99'), lineHeight: 1.7 }}>
            UPLOAD A STATEMENT TO POPULATE THIS MONTH.<br />STATEMENT IMPORT ARRIVES IN A FOLLOW-UP STEP.
          </div>
        </div>
      )}

      {!loading && hasData && (
        <>
          <div style={{ textAlign: 'center', padding: '6px 0 4px' }}>
            <div style={{ fontFamily: FD, fontSize: 58, fontWeight: 700, lineHeight: 1, color: savingsGood ? G : ACC, textShadow: `0 0 40px ${mix(savingsGood ? G : ACC, 33)}` }}>{rate}%</div>
            <div style={{ fontFamily: FM, fontSize: 8, letterSpacing: '.2em', color: a(ACC, '99'), marginTop: 7 }}>SAVINGS RATE · TARGET 25%</div>
            {!savingsGood && <div style={{ fontFamily: FM, fontSize: 7, letterSpacing: '.15em', color: Y, marginTop: 4 }}>BELOW TARGET</div>}
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 8, marginTop: 14 }}>
            <StatTile label="INCOME" value={euro(summary.income_total, 0)} color={G} />
            <StatTile label="EXPENSES" value={euro(summary.expenses_total, 0)} color={R} />
            <StatTile label="SAVINGS" value={euro(totalSavings, 0)} color={ACC} />
          </div>

          <BreakdownGroup title="SAVINGS" subtitle="Counts toward savings rate" rows={savingsRows} color={G} />
          <BreakdownGroup title="FIXED COSTS" subtitle="Tracked, not the cut target" rows={fixedRows} color={W} />
          <BreakdownGroup title="FLEXIBLE SPENDING" subtitle="Where Phoenix looks for improvements" rows={flexRows} color={ACC} />
          <BreakdownGroup title="INTERNAL TRANSFERS" subtitle="Moved money, not income or spending" rows={transferRows} color={a(ACC, '77')} />

          {summary.insight && (
            <div style={{ marginTop: 16, padding: '12px 14px', background: deep(76), border: `1px solid ${a(ACC, '20')}`, borderLeft: `3px solid ${a(ACC, '99')}` }}>
              <div style={{ fontFamily: FM, fontSize: 7, letterSpacing: '.18em', color: a(ACC, '99'), marginBottom: 6 }}>PHOENIX ASSESSMENT</div>
              <div style={{ fontFamily: FB, fontSize: 13, lineHeight: 1.6, color: mix(BODY, 90) }}>{summary.insight}</div>
            </div>
          )}
        </>
      )}
    </div>
  )
}
