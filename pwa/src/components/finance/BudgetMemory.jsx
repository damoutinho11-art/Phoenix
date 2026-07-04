import { useEffect, useMemo, useState } from 'react'
import { getBudgetMemory, saveBudgetMemory } from '../../api/client'

const MONO = "'Share Tech Mono', monospace"
const DISPLAY = "'Rajdhani', sans-serif"
const BODY = "'Space Grotesk', sans-serif"
const BG = '#060c12'
const CARD = '#070e15'
const GOLD = '#00bbdd'
const border = '1px solid rgba(0,187,221,.18)'
const muted = 'rgba(0,187,221,.45)'

const CATEGORY_COLORS = {
  Housing: '#9f7dff',
  'Emergency Fund': '#4dffb4',
  Investment: '#ffd56b',
  Transfers: '#2c7080',
  Income: '#4dffb4',
  'Eating Out': '#ff8f2e',
  'Food & Groceries': '#4dffb4',
  Transport: '#00bbdd',
  Subscriptions: '#ff5c7a',
  Shopping: '#ffd56b',
  'Health & Sport': '#7dffb4',
  'Banking & Fees': '#888',
  Other: 'rgba(132,212,226,.5)',
}

function asPrettyJson(value) {
  return JSON.stringify(value || {}, null, 2)
}

function parseList(value) {
  return String(value || '')
    .split(',')
    .map(item => item.trim())
    .filter(Boolean)
}

function Chip({ children, color = GOLD }) {
  return (
    <span style={{
      display: 'inline-flex', alignItems: 'center', gap: 6,
      padding: '5px 8px', border: `1px solid ${color}55`, borderRadius: 999,
      color, background: `${color}12`, fontFamily: MONO, fontSize: 8, letterSpacing: '.08em',
    }}>
      {children}
    </span>
  )
}

function Panel({ title, subtitle, children }) {
  return (
    <section style={{ margin: '14px 18px 0', background: CARD, border, borderRadius: 4, overflow: 'hidden', position: 'relative' }}>
      <div style={{ position: 'absolute', top: 0, left: 0, right: 0, height: 1, background: 'linear-gradient(90deg, rgba(0,187,221,.4), rgba(0,187,221,.1), transparent)' }} />
      <div style={{ padding: '12px 14px', borderBottom: '1px solid rgba(0,187,221,.08)' }}>
        <div style={{ fontFamily: MONO, fontSize: 8, letterSpacing: '.22em', color: muted }}>{title}</div>
        {subtitle && <div style={{ fontFamily: BODY, fontSize: 12, color: 'rgba(199,236,244,.55)', marginTop: 4 }}>{subtitle}</div>}
      </div>
      <div style={{ padding: 14 }}>{children}</div>
    </section>
  )
}

function Field({ label, children }) {
  return (
    <label style={{ display: 'block' }}>
      <div style={{ fontFamily: MONO, fontSize: 7, letterSpacing: '.16em', color: muted, marginBottom: 6 }}>{label}</div>
      {children}
    </label>
  )
}

const inputStyle = {
  width: '100%', boxSizing: 'border-box', background: 'rgba(0,187,221,.04)', border,
  borderRadius: 3, color: 'rgba(199,236,244,.92)', padding: '10px 11px',
  fontFamily: BODY, fontSize: 13, outline: 'none',
}

export default function BudgetMemory({ onBack }) {
  const [profile, setProfile] = useState(null)
  const [draftJson, setDraftJson] = useState('')
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [saved, setSaved] = useState(false)

  useEffect(() => {
  }, [])

  useEffect(() => {
    setLoading(true)
    getBudgetMemory()
      .then(payload => {
        const loaded = payload.profile || {}
        setProfile(loaded)
        setDraftJson(asPrettyJson(loaded))
      })
      .catch(err => setError(err.message || 'Could not load budget memory'))
      .finally(() => setLoading(false))
  }, [])

  const rules = Array.isArray(profile?.merchant_rules) ? profile.merchant_rules : []
  const ruleCount = rules.length
  const salaryRule = rules.find(rule => String(rule?.category || '').toLowerCase() === 'income')
  const fixed = Array.isArray(profile?.fixed_categories) ? profile.fixed_categories : []
  const flexible = Array.isArray(profile?.flexible_categories) ? profile.flexible_categories : []
  const nonSpending = Array.isArray(profile?.non_spending_categories) ? profile.non_spending_categories : []

  const parsedDraft = useMemo(() => {
    try { return JSON.parse(draftJson || '{}') } catch { return null }
  }, [draftJson])

  function updateProfile(patch) {
    const next = { ...(profile || {}), ...patch }
    setProfile(next)
    setDraftJson(asPrettyJson(next))
    setSaved(false)
    setError('')
  }

  function updateList(key, value) {
    updateProfile({ [key]: parseList(value) })
  }

  async function save() {
    setError('')
    setSaved(false)
    if (!parsedDraft || typeof parsedDraft !== 'object' || Array.isArray(parsedDraft)) {
      setError('Memory JSON is not valid.')
      return
    }
    setSaving(true)
    try {
      const payload = await saveBudgetMemory(parsedDraft)
      const next = payload.profile || parsedDraft
      setProfile(next)
      setDraftJson(asPrettyJson(next))
      setSaved(true)
    } catch (err) {
      setError(err.message || 'Could not save budget memory')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="phx-scope-budget" style={{ height: '100%', overflowY: 'auto', paddingBottom: 100, background: BG, color: 'rgba(199,236,244,.92)', fontFamily: BODY }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '13px 18px 11px', borderBottom: border, position: 'sticky', top: 0, background: `${CARD}f5`, backdropFilter: 'blur(12px)', zIndex: 5 }}>
        <div style={{ display: 'flex', alignItems: 'center' }}>
          <span onClick={onBack} style={{ color: GOLD, fontSize: 16, marginRight: 10, cursor: 'pointer' }}>←</span>
          <span style={{ fontFamily: DISPLAY, fontSize: 16, fontWeight: 700, letterSpacing: '.28em', color: GOLD, textShadow: '0 0 20px rgba(0,187,221,.4)' }}>BUDGET MEMORY</span>
        </div>
        <button
          onClick={save}
          disabled={saving || loading}
          style={{ border: `1px solid ${GOLD}`, background: 'rgba(0,187,221,.08)', color: GOLD, fontFamily: MONO, fontSize: 8, fontWeight: 700, letterSpacing: '.16em', padding: '8px 10px', borderRadius: 2, cursor: saving ? 'wait' : 'pointer' }}
        >
          {saving ? 'SAVING…' : 'SAVE'}
        </button>
      </div>

      {loading && <div style={{ padding: 40, textAlign: 'center', color: muted, fontFamily: MONO, fontSize: 9, letterSpacing: '.2em' }}>LOADING MEMORY…</div>}

      {!loading && profile && (
        <>
          <div style={{ padding: '24px 18px 4px', textAlign: 'center' }}>
            <div style={{ fontFamily: DISPLAY, fontSize: 42, fontWeight: 700, color: GOLD, lineHeight: 1, textShadow: '0 0 40px rgba(0,187,221,.35)' }}>
              PERSONAL BUDGET BRAIN
            </div>
            <div style={{ fontFamily: MONO, fontSize: 8, color: muted, letterSpacing: '.2em', marginTop: 9 }}>
              SALARY TIMING · FIXED COSTS · SAVINGS RULES · MERCHANT MEMORY
            </div>
          </div>

          <Panel title="CORE RULES" subtitle="The rules Phoenix uses before it stores imported transactions.">
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, minmax(0, 1fr))', gap: 10 }}>
              <Field label="SAVINGS TARGET %">
                <input
                  style={inputStyle}
                  type="number"
                  min="0"
                  max="100"
                  value={profile.savings_target_pct ?? 25}
                  onChange={e => updateProfile({ savings_target_pct: Number(e.target.value || 0) })}
                />
              </Field>
              <Field label="SALARY CUTOFF DAY">
                <input
                  style={inputStyle}
                  type="number"
                  min="1"
                  max="31"
                  value={profile.salary_day_cutoff ?? 25}
                  onChange={e => updateProfile({ salary_day_cutoff: Number(e.target.value || 25) })}
                />
              </Field>
              <Field label="MONTH-END SALARY">
                <button
                  type="button"
                  onClick={() => updateProfile({ salary_next_month: !profile.salary_next_month })}
                  style={{ ...inputStyle, cursor: 'pointer', color: profile.salary_next_month ? '#4dffb4' : '#ff5c7a', fontFamily: MONO, letterSpacing: '.12em', fontWeight: 700 }}
                >
                  {profile.salary_next_month ? 'NEXT MONTH' : 'SAME MONTH'}
                </button>
              </Field>
            </div>
            <div style={{ marginTop: 12, display: 'grid', gridTemplateColumns: 'repeat(3, minmax(0, 1fr))', gap: 8 }}>
              <div style={{ background: 'rgba(77,255,180,.05)', border: '1px solid rgba(77,255,180,.16)', borderRadius: 3, padding: 10 }}>
                <div style={{ fontFamily: MONO, fontSize: 7, color: '#4dffb4', letterSpacing: '.16em' }}>SALARY RULE</div>
                <div style={{ marginTop: 5, fontSize: 12, color: 'rgba(199,236,244,.78)' }}>{salaryRule ? 'Rahvusooper salary near month-end goes to next budget month.' : 'No salary rule found.'}</div>
              </div>
              <div style={{ background: 'rgba(0,187,221,.04)', border, borderRadius: 3, padding: 10 }}>
                <div style={{ fontFamily: MONO, fontSize: 7, color: GOLD, letterSpacing: '.16em' }}>MERCHANT RULES</div>
                <div style={{ marginTop: 5, fontSize: 12, color: 'rgba(199,236,244,.78)' }}>{ruleCount} active rules classify imports before storage.</div>
              </div>
              <div style={{ background: 'rgba(255,213,107,.05)', border: '1px solid rgba(255,213,107,.16)', borderRadius: 3, padding: 10 }}>
                <div style={{ fontFamily: MONO, fontSize: 7, color: '#ffd56b', letterSpacing: '.16em' }}>SAVINGS LOGIC</div>
                <div style={{ marginTop: 5, fontSize: 12, color: 'rgba(199,236,244,.78)' }}>Emergency Fund plus Investments count toward savings rate.</div>
              </div>
            </div>
          </Panel>

          <Panel title="CATEGORY LANES" subtitle="These lanes control how the Budget dashboard separates money.">
            <div style={{ display: 'grid', gridTemplateColumns: '1fr', gap: 12 }}>
              <Field label="FIXED CATEGORIES">
                <input style={inputStyle} value={fixed.join(', ')} onChange={e => updateList('fixed_categories', e.target.value)} />
              </Field>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>{fixed.map(cat => <Chip key={cat} color={CATEGORY_COLORS[cat] || GOLD}>{cat}</Chip>)}</div>
              <Field label="FLEXIBLE CATEGORIES">
                <input style={inputStyle} value={flexible.join(', ')} onChange={e => updateList('flexible_categories', e.target.value)} />
              </Field>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>{flexible.map(cat => <Chip key={cat} color={CATEGORY_COLORS[cat] || GOLD}>{cat}</Chip>)}</div>
              <Field label="NON-SPENDING CATEGORIES">
                <input style={inputStyle} value={nonSpending.join(', ')} onChange={e => updateList('non_spending_categories', e.target.value)} />
              </Field>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>{nonSpending.map(cat => <Chip key={cat} color={CATEGORY_COLORS[cat] || GOLD}>{cat}</Chip>)}</div>
            </div>
          </Panel>

          <Panel title="MERCHANT MEMORY" subtitle="Phoenix applies the first matching rule when importing PDFs or text.">
            <div style={{ display: 'grid', gap: 8 }}>
              {rules.map((rule, index) => {
                const color = CATEGORY_COLORS[rule.category] || GOLD
                return (
                  <div key={`${rule.category}-${index}`} style={{ display: 'grid', gridTemplateColumns: '1fr auto', gap: 10, alignItems: 'center', padding: '9px 10px', border: '1px solid rgba(0,187,221,.09)', borderRadius: 3, background: 'rgba(255,255,255,.02)' }}>
                    <div>
                      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 5, marginBottom: 5 }}>
                        {(rule.contains || []).map(token => <Chip key={token} color="rgba(199,236,244,.65)">{token}</Chip>)}
                      </div>
                      <div style={{ fontFamily: MONO, fontSize: 7, color: 'rgba(199,236,244,.42)', letterSpacing: '.12em' }}>
                        {rule.is_income ? 'INCOME' : 'OUTFLOW'}{rule.fixed ? ' · FIXED' : ''}{rule.budget_month ? ` · ${String(rule.budget_month).replace(/_/g, ' ').toUpperCase()}` : ''}
                      </div>
                    </div>
                    <Chip color={color}>{rule.category || 'Other'}</Chip>
                  </div>
                )
              })}
            </div>
          </Panel>

          <Panel title="ADVANCED MEMORY JSON" subtitle="Edit carefully. Save persists this profile locally in Phoenix.">
            <textarea
              value={draftJson}
              onChange={e => { setDraftJson(e.target.value); setSaved(false); setError('') }}
              spellCheck={false}
              style={{ ...inputStyle, minHeight: 260, resize: 'vertical', fontFamily: MONO, fontSize: 10, lineHeight: 1.55 }}
            />
            {error && <div style={{ marginTop: 10, color: '#ff5c7a', fontFamily: BODY, fontSize: 12 }}>{error}</div>}
            {saved && <div style={{ marginTop: 10, color: '#4dffb4', fontFamily: BODY, fontSize: 12 }}>Budget memory saved.</div>}
            <button
              onClick={save}
              disabled={saving}
              style={{ marginTop: 12, width: '100%', padding: '12px 0', border: `1px solid rgba(0,187,221,.5)`, background: 'rgba(0,187,221,.06)', color: '#7de8ff', fontFamily: MONO, fontSize: 9, fontWeight: 700, letterSpacing: '.2em', cursor: saving ? 'wait' : 'pointer', borderRadius: 2 }}
            >
              {saving ? 'SAVING MEMORY…' : 'SAVE BUDGET MEMORY'}
            </button>
          </Panel>
        </>
      )}
    </div>
  )
}
