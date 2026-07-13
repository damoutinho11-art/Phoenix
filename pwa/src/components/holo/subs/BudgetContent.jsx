import { useCallback, useEffect, useState } from 'react'
import { ACC, G, Y, R, W, BODY, INK, FM, FD, FB, a, mix, deep } from '../holoTokens'
import {
  getBudgetSummary,
  getBudgetMonths,
  parseBudgetTransactions,
  parseBudgetPdf,
  saveBudgetTransactions,
  getBudgetMemory,
  saveBudgetMemory,
} from '../../../api/client'
import { financeButton, financeLabel, financeMicro } from './financeReadability'

// Category grouping mirrors the original BudgetDashboard so the holo view
// classifies transactions identically (savings-rate math stays the same).
const SAVINGS_CATS = new Set(['Investment', 'Emergency Fund'])
const FIXED_CATS = new Set(['Housing'])
const TRANSFER_CATS = new Set(['Transfers'])
const NON_SPENDING = new Set(['Income', ...SAVINGS_CATS, ...TRANSFER_CATS])

const ALL_CATEGORIES = [
  'Housing', 'Food & Groceries', 'Eating Out', 'Transport',
  'Subscriptions', 'Health & Sport', 'Shopping', 'Investment',
  'Income', 'Banking & Fees', 'Other',
]

// category → token (no raw hex): reuse domain accents + semantic status colors
const CAT_COLOR = {
  Income: G,
  Investment: ACC,
  'Food & Groceries': 'var(--phx-nutrition)',
  'Eating Out': 'var(--phx-training)',
  Subscriptions: R,
  Transport: ACC,
  Housing: 'var(--phx-calendar)',
  'Health & Sport': G,
  Shopping: Y,
  'Banking & Fees': a(ACC, '55'),
  Other: a(ACC, '55'),
}
const catColor = c => CAT_COLOR[c] || a(ACC, '55')

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
        <span style={financeLabel({ fontSize: 9, letterSpacing: '.16em', color: a(color, 'cc') })}>{title}</span>
        <span style={financeMicro({ color: a(ACC, '77'), textAlign: 'right' })}>{subtitle}</span>
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
      <div style={{ ...financeMicro({ color: a(ACC, '88') }), marginBottom: 5 }}>{label}</div>
      <div style={{ fontFamily: FD, fontSize: 20, fontWeight: 700, color }}>{value}</div>
    </div>
  )
}

function AddButton({ onClick, label }) {
  return (
    <button onClick={onClick} style={{ minHeight: 44, padding: '0 20px', ...financeButton({ color: INK }), background: `linear-gradient(135deg, ${ACC}, ${a(ACC, 'bb')})`, border: `1px solid ${ACC}`, cursor: 'pointer', boxShadow: `0 0 22px ${a(ACC, '33')}` }}>{label}</button>
  )
}

// ── FINANCE // BUDGET — monthly income / expense / savings breakdown ──
// Self-fetching (like BriefContent): reads /budget/summary + /budget/months.
// Switches into an upload sub-mode to parse + save a statement, then refetches.
export function BudgetContent() {
  const thisMonth = new Date().toISOString().slice(0, 7)
  const [month, setMonth] = useState(thisMonth)
  const [months, setMonths] = useState([thisMonth])
  const [summary, setSummary] = useState(null)
  const [loading, setLoading] = useState(true)
  const [mode, setMode] = useState('view') // 'view' | 'upload'

  const loadMonths = useCallback(() => {
    getBudgetMonths()
      .then(r => {
        const list = r.months || []
        if (!list.includes(thisMonth)) list.unshift(thisMonth)
        setMonths(list)
      })
      .catch(() => {})
  }, [thisMonth])

  const loadSummary = useCallback(m => {
    let alive = true
    setLoading(true)
    getBudgetSummary(m)
      .then(r => { if (alive) setSummary(r) })
      .catch(() => { if (alive) setSummary(null) })
      .finally(() => { if (alive) setLoading(false) })
    return () => { alive = false }
  }, [])

  useEffect(() => { loadMonths() }, [loadMonths])
  useEffect(() => loadSummary(month), [month, loadSummary])

  const idx = months.indexOf(month)
  const prev = () => { if (idx < months.length - 1) setMonth(months[idx + 1]) }
  const next = () => { if (idx > 0) setMonth(months[idx - 1]) }

  const afterSave = () => {
    loadMonths()
    loadSummary(month)
    setMode('view')
  }

  if (mode === 'upload') {
    return <UploadStage onDone={afterSave} onCancel={() => setMode('view')} />
  }
  if (mode === 'memory') {
    return <MemoryStage onDone={() => { loadSummary(month); setMode('view') }} onCancel={() => setMode('view')} />
  }

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
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 10, flexWrap: 'wrap', marginBottom: 12 }}>
        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 10 }}>
          <span style={{ fontFamily: FM, fontSize: 9, letterSpacing: '.18em', color: a(ACC, 'cc') }}>MONTHLY LEDGER</span>
          <button onClick={() => setMode('memory')} style={{ minHeight: 28, padding: '0 10px', fontFamily: FM, fontSize: 9, letterSpacing: '.16em', color: a(ACC, 'cc'), background: deep(58), border: `1px solid ${a(ACC, '30')}`, cursor: 'pointer' }}>⚙ MEMORY</button>
        </span>
        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}>
          <button onClick={prev} disabled={idx >= months.length - 1} style={{ minWidth: 30, minHeight: 30, fontFamily: FD, fontSize: 16, color: ACC, background: deep(60), border: `1px solid ${a(ACC, '44')}`, cursor: idx >= months.length - 1 ? 'not-allowed' : 'pointer' }}>‹</button>
          <span style={{ fontFamily: FM, fontSize: 9, letterSpacing: '.12em', color: a(ACC, 'cc'), minWidth: 118, textAlign: 'center' }}>{fmtMonth(month)}</span>
          <button onClick={next} disabled={idx <= 0} style={{ minWidth: 30, minHeight: 30, fontFamily: FD, fontSize: 16, color: ACC, background: deep(60), border: `1px solid ${a(ACC, '44')}`, cursor: idx <= 0 ? 'not-allowed' : 'pointer' }}>›</button>
        </span>
      </div>

      {loading && (
        <div style={{ padding: '48px 0', textAlign: 'center', fontFamily: FM, fontSize: 9, letterSpacing: '.18em', color: a(ACC, '99') }}>LOADING LEDGER…</div>
      )}

      {!loading && !hasData && (
        <div style={{ padding: '40px 18px', textAlign: 'center', border: `1px dashed ${a(ACC, '30')}`, background: deep(60) }}>
          <div style={{ fontFamily: FD, fontSize: 20, fontWeight: 700, color: ACC, marginBottom: 8 }}>No transactions for {fmtMonth(month)}</div>
          <div style={{ fontFamily: FM, fontSize: 9, letterSpacing: '.14em', color: a(ACC, '99'), lineHeight: 1.7, marginBottom: 18 }}>
            UPLOAD A STATEMENT TO POPULATE THIS MONTH.
          </div>
          <AddButton onClick={() => setMode('upload')} label="+ ADD TRANSACTIONS" />
        </div>
      )}

      {!loading && hasData && (
        <>
          <div style={{ textAlign: 'center', padding: '6px 0 4px' }}>
            <div style={{ fontFamily: FD, fontSize: 58, fontWeight: 700, lineHeight: 1, color: savingsGood ? G : ACC, textShadow: `0 0 40px ${mix(savingsGood ? G : ACC, 33)}` }}>{rate}%</div>
            <div style={{ fontFamily: FM, fontSize: 9, letterSpacing: '.16em', color: a(ACC, '99'), marginTop: 7 }}>SAVINGS RATE · TARGET 25%</div>
            {!savingsGood && <div style={{ fontFamily: FM, fontSize: 9, letterSpacing: '.15em', color: Y, marginTop: 4 }}>BELOW TARGET</div>}
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
              <div style={{ fontFamily: FM, fontSize: 9, letterSpacing: '.18em', color: a(ACC, '99'), marginBottom: 6 }}>PHOENIX ASSESSMENT</div>
              <div style={{ fontFamily: FB, fontSize: 13, lineHeight: 1.6, color: mix(BODY, 90) }}>{summary.insight}</div>
            </div>
          )}

          <div style={{ display: 'flex', justifyContent: 'center', marginTop: 18 }}>
            <AddButton onClick={() => setMode('upload')} label="+ ADD TRANSACTIONS" />
          </div>
        </>
      )}
    </div>
  )
}

// ── upload sub-mode: paste text or PDF → parse → review → save ──
function UploadStage({ onDone, onCancel }) {
  const [input, setInput] = useState('text') // 'text' | 'pdf'
  const [raw, setRaw] = useState('')
  const [pdfFile, setPdfFile] = useState(null)
  const [parsing, setParsing] = useState(false)
  const [error, setError] = useState('')
  const [transactions, setTransactions] = useState(null)
  const [saving, setSaving] = useState(false)
  const [pickerIdx, setPickerIdx] = useState(null)

  const parseText = async () => {
    if (!raw.trim() || parsing) return
    setParsing(true); setError('')
    try {
      const r = await parseBudgetTransactions(raw.trim())
      setTransactions(r.transactions || [])
    } catch (err) {
      setError(err.message || 'Parse failed. Check your text and try again.')
    } finally { setParsing(false) }
  }

  const parsePdf = async () => {
    if (!pdfFile || parsing) return
    setParsing(true); setError('')
    try {
      const r = await parseBudgetPdf(pdfFile)
      setTransactions(r.transactions || [])
    } catch (err) {
      setError(err.message || 'PDF parse failed. Use a text-based PDF or paste the statement.')
    } finally { setParsing(false) }
  }

  const save = async () => {
    if (saving) return
    setSaving(true); setError('')
    try {
      await saveBudgetTransactions(transactions)
      onDone()
    } catch (err) {
      setError(err.message || 'Save failed — link down. Try again.')
      setSaving(false)
    }
  }

  const inputTab = (id, label) => (
    <button key={id} onClick={() => { setInput(id); setError('') }} style={{ flex: 1, minHeight: 40, fontFamily: FM, fontSize: 9, fontWeight: 700, letterSpacing: '.18em', cursor: 'pointer', border: `1px solid ${input === id ? ACC : a(ACC, '30')}`, color: input === id ? INK : a(ACC, 'cc'), background: input === id ? `linear-gradient(135deg, ${ACC}, ${a(ACC, 'bb')})` : deep(58) }}>{label}</button>
  )
  const parseBtnStyle = enabled => ({ width: '100%', marginTop: 12, minHeight: 44, fontFamily: FM, fontSize: 9, fontWeight: 700, letterSpacing: '.16em', color: enabled ? INK : a(ACC, '77'), background: enabled ? `linear-gradient(135deg, ${ACC}, ${a(ACC, 'bb')})` : deep(50), border: `1px solid ${enabled ? ACC : a(ACC, '30')}`, cursor: enabled ? 'pointer' : 'not-allowed' })

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
        <span style={{ fontFamily: FM, fontSize: 9, letterSpacing: '.18em', color: a(ACC, 'cc') }}>{transactions ? 'REVIEW TRANSACTIONS' : 'ADD TRANSACTIONS'}</span>
        <button onClick={onCancel} style={{ minHeight: 30, padding: '0 12px', fontFamily: FM, fontSize: 9, letterSpacing: '.16em', color: a(ACC, 'cc'), background: deep(60), border: `1px solid ${a(ACC, '44')}`, cursor: 'pointer' }}>← LEDGER</button>
      </div>

      {!transactions ? (
        <>
          <div style={{ display: 'flex', gap: 8, marginBottom: 14 }}>
            {inputTab('text', 'PASTE TEXT')}
            {inputTab('pdf', 'UPLOAD PDF')}
          </div>

          {input === 'pdf' ? (
            <>
              <div style={{ fontFamily: FM, fontSize: 9, letterSpacing: '.14em', color: a(ACC, '99'), marginBottom: 8 }}>UPLOAD A TEXT-BASED BANK PDF</div>
              <label htmlFor="holo-budget-pdf" style={{ display: 'block', padding: '26px 14px', textAlign: 'center', cursor: 'pointer', border: `1px ${pdfFile ? 'solid' : 'dashed'} ${a(ACC, pdfFile ? '60' : '30')}`, background: deep(pdfFile ? 66 : 55) }}>
                <input id="holo-budget-pdf" type="file" accept="application/pdf,.pdf" onChange={e => { setPdfFile(e.target.files?.[0] || null); setError('') }} style={{ display: 'none' }} />
                <div style={{ fontFamily: FD, fontSize: 16, fontWeight: 700, letterSpacing: '.14em', color: pdfFile ? W : a(ACC, '99'), marginBottom: 6 }}>{pdfFile ? pdfFile.name : 'TAP TO SELECT PDF'}</div>
                <div style={{ fontFamily: FM, fontSize: 9, letterSpacing: '.06em', color: a(ACC, '77'), lineHeight: 1.6 }}>Text-based PDFs only · max 8 MB · parsed, not stored</div>
              </label>
              {error && <div style={{ color: R, fontFamily: FM, fontSize: 10, marginTop: 8 }}>{error}</div>}
              <button onClick={parsePdf} disabled={!pdfFile || parsing} style={parseBtnStyle(!!pdfFile && !parsing)}>{parsing ? 'EXTRACTING PDF…' : 'PARSE PDF TRANSACTIONS'}</button>
            </>
          ) : (
            <>
              <div style={{ fontFamily: FM, fontSize: 9, letterSpacing: '.14em', color: a(ACC, '99'), marginBottom: 8 }}>PASTE BANK TRANSACTIONS</div>
              <textarea value={raw} onChange={e => setRaw(e.target.value)} placeholder="Paste your statement text here…" className="phx-input" style={{ width: '100%', minHeight: 200, fontFamily: FM, fontSize: 12, padding: 12, resize: 'vertical', boxSizing: 'border-box' }} />
              {error && <div style={{ color: R, fontFamily: FM, fontSize: 10, marginTop: 8 }}>{error}</div>}
              <button onClick={parseText} disabled={!raw.trim() || parsing} style={parseBtnStyle(!!raw.trim() && !parsing)}>{parsing ? 'PARSING…' : 'PARSE TRANSACTIONS'}</button>
            </>
          )}
        </>
      ) : (
        <>
          <div style={{ fontFamily: FM, fontSize: 9, letterSpacing: '.12em', color: a(ACC, '99'), marginBottom: 10 }}>{transactions.length} TRANSACTIONS FOUND · TAP CATEGORY TO EDIT</div>
          <div style={{ border: `1px solid ${a(ACC, '20')}`, background: deep(76), marginBottom: 14 }}>
            {transactions.map((t, i) => (
              <div key={i} style={{ padding: '10px 14px', borderBottom: i < transactions.length - 1 ? `1px solid ${a(ACC, '10')}` : 'none', display: 'flex', alignItems: 'center', gap: 10 }}>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontFamily: FB, fontSize: 13, color: mix(BODY, 90), overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{t.merchant}</div>
                  <div style={{ fontFamily: FM, fontSize: 9, color: a(ACC, '77') }}>{t.date}</div>
                </div>
                <button onClick={() => setPickerIdx(i)} style={{ padding: '4px 8px', background: mix(catColor(t.category), 13), border: `1px solid ${mix(catColor(t.category), 33)}`, color: catColor(t.category), fontFamily: FM, fontSize: 9, letterSpacing: '.06em', cursor: 'pointer', whiteSpace: 'nowrap', flexShrink: 0 }}>{t.category}</button>
                <div style={{ fontFamily: FD, fontSize: 15, fontWeight: 600, color: t.is_income ? G : W, flexShrink: 0 }}>{t.is_income ? '+' : ''}€{Math.abs(t.amount_eur).toFixed(2)}</div>
              </div>
            ))}
          </div>
          {error && <div style={{ color: R, fontFamily: FM, fontSize: 10, marginBottom: 10 }}>{error}</div>}
          <div style={{ display: 'flex', gap: 8 }}>
            <button onClick={() => setTransactions(null)} style={{ flex: 1, minHeight: 44, fontFamily: FM, fontSize: 9, letterSpacing: '.18em', color: a(ACC, 'cc'), background: deep(58), border: `1px solid ${a(ACC, '30')}`, cursor: 'pointer' }}>← RE-PARSE</button>
            <button onClick={save} disabled={saving} style={{ flex: 2, minHeight: 44, fontFamily: FM, fontSize: 9, fontWeight: 700, letterSpacing: '.18em', color: INK, background: `linear-gradient(135deg, ${ACC}, ${a(ACC, 'bb')})`, border: `1px solid ${ACC}`, cursor: saving ? 'wait' : 'pointer', boxShadow: `0 0 22px ${a(ACC, '33')}` }}>{saving ? 'SAVING…' : `SAVE ALL · ${transactions.length}`}</button>
          </div>
        </>
      )}

      {pickerIdx !== null && (
        <CategoryPicker
          current={transactions[pickerIdx]?.category}
          onChange={cat => setTransactions(prev => prev.map((t, i) => (i === pickerIdx ? { ...t, category: cat } : t)))}
          onClose={() => setPickerIdx(null)}
        />
      )}
    </div>
  )
}

// ── memory sub-mode: savings target, category lanes, merchant rules ──
const prettyJson = v => JSON.stringify(v || {}, null, 2)
const parseList = v => String(v || '').split(',').map(s => s.trim()).filter(Boolean)

function MemField({ label, children }) {
  return (
    <label style={{ display: 'block' }}>
      <div style={{ fontFamily: FM, fontSize: 9, letterSpacing: '.16em', color: a(ACC, '88'), marginBottom: 6 }}>{label}</div>
      {children}
    </label>
  )
}

function ChipRow({ items }) {
  if (!items.length) return null
  return (
    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginTop: 2 }}>
      {items.map(c => (
        <span key={c} style={{ display: 'inline-flex', alignItems: 'center', padding: '4px 8px', border: `1px solid ${mix(catColor(c), 33)}`, color: catColor(c), background: mix(catColor(c), 10), fontFamily: FM, fontSize: 9, letterSpacing: '.06em' }}>{c}</span>
      ))}
    </div>
  )
}

function MemoryStage({ onDone, onCancel }) {
  const [profile, setProfile] = useState(null)
  const [draft, setDraft] = useState('')
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    let alive = true
    getBudgetMemory()
      .then(p => { if (alive) { const loaded = p.profile || {}; setProfile(loaded); setDraft(prettyJson(loaded)) } })
      .catch(err => { if (alive) setError(err.message || 'Could not load budget memory') })
      .finally(() => { if (alive) setLoading(false) })
    return () => { alive = false }
  }, [])

  const update = patch => {
    const next = { ...(profile || {}), ...patch }
    setProfile(next)
    setDraft(prettyJson(next))
    setError('')
  }
  const updateList = (key, value) => update({ [key]: parseList(value) })

  const save = async () => {
    if (saving) return
    let payload
    try { payload = JSON.parse(draft || '{}') } catch { setError('Memory JSON is not valid.'); return }
    if (!payload || typeof payload !== 'object' || Array.isArray(payload)) { setError('Memory JSON is not valid.'); return }
    setSaving(true); setError('')
    try {
      await saveBudgetMemory(payload)
      onDone()
    } catch (err) {
      setError(err.message || 'Save failed — link down. Try again.')
      setSaving(false)
    }
  }

  const fixed = Array.isArray(profile?.fixed_categories) ? profile.fixed_categories : []
  const flexible = Array.isArray(profile?.flexible_categories) ? profile.flexible_categories : []
  const nonSpending = Array.isArray(profile?.non_spending_categories) ? profile.non_spending_categories : []
  const rules = Array.isArray(profile?.merchant_rules) ? profile.merchant_rules : []
  const inputStyle = { width: '100%', boxSizing: 'border-box', padding: '10px 11px', fontFamily: FB, fontSize: 13 }

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
        <span style={{ fontFamily: FM, fontSize: 9, letterSpacing: '.18em', color: a(ACC, 'cc') }}>BUDGET MEMORY</span>
        <span style={{ display: 'inline-flex', gap: 8 }}>
          <button onClick={onCancel} style={{ minHeight: 30, padding: '0 12px', fontFamily: FM, fontSize: 9, letterSpacing: '.16em', color: a(ACC, 'cc'), background: deep(60), border: `1px solid ${a(ACC, '44')}`, cursor: 'pointer' }}>← LEDGER</button>
          <button onClick={save} disabled={saving || loading} style={{ minHeight: 30, padding: '0 16px', fontFamily: FM, fontSize: 9, fontWeight: 700, letterSpacing: '.16em', color: INK, background: `linear-gradient(135deg, ${ACC}, ${a(ACC, 'bb')})`, border: `1px solid ${ACC}`, cursor: saving ? 'wait' : 'pointer' }}>{saving ? 'SAVING…' : 'SAVE'}</button>
        </span>
      </div>

      {loading && <div style={{ padding: '48px 0', textAlign: 'center', fontFamily: FM, fontSize: 9, letterSpacing: '.18em', color: a(ACC, '99') }}>LOADING MEMORY…</div>}

      {!loading && profile && (
        <>
          <div style={{ fontFamily: FM, fontSize: 9, letterSpacing: '.16em', color: a(ACC, 'cc'), marginBottom: 10 }}>CORE RULES</div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(120px, 1fr))', gap: 10 }}>
            <MemField label="SAVINGS TARGET %">
              <input className="phx-input" type="number" min="0" max="100" style={inputStyle} value={profile.savings_target_pct ?? 25} onChange={e => update({ savings_target_pct: Number(e.target.value || 0) })} />
            </MemField>
            <MemField label="SALARY CUTOFF DAY">
              <input className="phx-input" type="number" min="1" max="31" style={inputStyle} value={profile.salary_day_cutoff ?? 25} onChange={e => update({ salary_day_cutoff: Number(e.target.value || 25) })} />
            </MemField>
            <MemField label="MONTH-END SALARY">
              <button type="button" onClick={() => update({ salary_next_month: !profile.salary_next_month })} className="phx-input" style={{ ...inputStyle, cursor: 'pointer', fontFamily: FM, fontWeight: 700, letterSpacing: '.12em', color: profile.salary_next_month ? G : R }}>
                {profile.salary_next_month ? 'NEXT MONTH' : 'SAME MONTH'}
              </button>
            </MemField>
          </div>

          <div style={{ fontFamily: FM, fontSize: 9, letterSpacing: '.16em', color: a(ACC, 'cc'), margin: '16px 0 10px' }}>CATEGORY LANES</div>
          <div style={{ display: 'grid', gap: 12 }}>
            <MemField label="FIXED CATEGORIES">
              <input className="phx-input" style={inputStyle} value={fixed.join(', ')} onChange={e => updateList('fixed_categories', e.target.value)} />
            </MemField>
            <ChipRow items={fixed} />
            <MemField label="FLEXIBLE CATEGORIES">
              <input className="phx-input" style={inputStyle} value={flexible.join(', ')} onChange={e => updateList('flexible_categories', e.target.value)} />
            </MemField>
            <ChipRow items={flexible} />
            <MemField label="NON-SPENDING CATEGORIES">
              <input className="phx-input" style={inputStyle} value={nonSpending.join(', ')} onChange={e => updateList('non_spending_categories', e.target.value)} />
            </MemField>
            <ChipRow items={nonSpending} />
          </div>

          {rules.length > 0 && (
            <>
              <div style={{ fontFamily: FM, fontSize: 9, letterSpacing: '.16em', color: a(ACC, 'cc'), margin: '16px 0 10px' }}>MERCHANT MEMORY <span style={{ color: a(ACC, '77') }}>· {rules.length} RULES · READ ONLY</span></div>
              <div style={{ display: 'grid', gap: 8 }}>
                {rules.map((rule, i) => (
                  <div key={i} style={{ display: 'flex', justifyContent: 'space-between', gap: 10, alignItems: 'center', padding: '9px 11px', border: `1px solid ${a(ACC, '14')}`, background: deep(58) }}>
                    <div style={{ minWidth: 0 }}>
                      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 5, marginBottom: 5 }}>
                        {(rule.contains || []).map(tok => <span key={tok} style={{ padding: '3px 7px', border: `1px solid ${a(ACC, '22')}`, color: mix(BODY, 80), fontFamily: FM, fontSize: 9 }}>{tok}</span>)}
                      </div>
                      <div style={{ fontFamily: FM, fontSize: 9, letterSpacing: '.12em', color: a(ACC, '77') }}>
                        {rule.is_income ? 'INCOME' : 'OUTFLOW'}{rule.fixed ? ' · FIXED' : ''}{rule.budget_month ? ' · ' + String(rule.budget_month).replace(/_/g, ' ').toUpperCase() : ''}
                      </div>
                    </div>
                    <span style={{ flexShrink: 0, padding: '4px 8px', border: `1px solid ${mix(catColor(rule.category), 33)}`, color: catColor(rule.category), background: mix(catColor(rule.category), 10), fontFamily: FM, fontSize: 9 }}>{rule.category || 'Other'}</span>
                  </div>
                ))}
              </div>
            </>
          )}

          <div style={{ fontFamily: FM, fontSize: 9, letterSpacing: '.16em', color: a(ACC, 'cc'), margin: '16px 0 8px' }}>ADVANCED MEMORY JSON <span style={{ color: a(ACC, '77') }}>· EDIT CAREFULLY</span></div>
          <textarea className="phx-input" value={draft} spellCheck={false} onChange={e => { setDraft(e.target.value); setError('') }} style={{ width: '100%', boxSizing: 'border-box', minHeight: 200, resize: 'vertical', fontFamily: FM, fontSize: 10, lineHeight: 1.55, padding: 11 }} />
          {error && <div style={{ marginTop: 10, color: R, fontFamily: FB, fontSize: 12 }}>{error}</div>}
          <button onClick={save} disabled={saving} style={{ marginTop: 12, width: '100%', minHeight: 44, fontFamily: FM, fontSize: 9, fontWeight: 700, letterSpacing: '.16em', color: INK, background: `linear-gradient(135deg, ${ACC}, ${a(ACC, 'bb')})`, border: `1px solid ${ACC}`, cursor: saving ? 'wait' : 'pointer', boxShadow: `0 0 22px ${a(ACC, '33')}` }}>{saving ? 'SAVING MEMORY…' : 'SAVE BUDGET MEMORY'}</button>
        </>
      )}
    </div>
  )
}

function CategoryPicker({ current, onChange, onClose }) {
  return (
    <div onClick={e => e.target === e.currentTarget && onClose()} style={{ position: 'fixed', inset: 0, background: 'color-mix(in srgb, black 82%, transparent)', backdropFilter: 'blur(6px)', zIndex: 120, display: 'flex', alignItems: 'flex-end', justifyContent: 'center', animation: 'holo-fadeIn .2s ease both' }}>
      <div style={{ width: '100%', maxWidth: 480, maxHeight: '70vh', overflowY: 'auto', padding: '18px 16px 28px', background: deep(94), borderTop: `1px solid ${a(ACC, '44')}` }}>
        <div style={{ width: 36, height: 3, background: a(ACC, '30'), margin: '0 auto 16px' }} />
        <div style={{ fontFamily: FM, fontSize: 9, letterSpacing: '.18em', color: a(ACC, '99'), marginBottom: 12 }}>SELECT CATEGORY</div>
        {ALL_CATEGORIES.map(cat => (
          <button key={cat} onClick={() => { onChange(cat); onClose() }} style={{ display: 'block', width: '100%', textAlign: 'left', minHeight: 42, padding: '10px 12px', background: cat === current ? a(ACC, '10') : 'transparent', border: 'none', borderBottom: `1px solid ${a(ACC, '10')}`, color: catColor(cat), fontSize: 14, fontFamily: FB, cursor: 'pointer' }}>{cat}</button>
        ))}
      </div>
    </div>
  )
}
