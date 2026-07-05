import { useEffect, useMemo, useState } from 'react'
import { getNutritionDayPlan, logDayPlan } from '../../api/client'

const LIME = '#9dff6f'
const LIME_BR = '#d5ffc7'
const BORDER = 'rgba(32,216,236,.18)'
const MUTED = 'rgba(32,216,236,.38)'
const TEXT_DIM = 'rgba(158,204,190,.58)'
const CYAN = '#20d8ec'

function safeNumber(value, fallback = 0) {
  const n = Number(value)
  return Number.isFinite(n) ? n : fallback
}

function roundMacro(value) {
  const rounded = Math.round(safeNumber(value) * 10) / 10
  return Number.isInteger(rounded) ? Number(rounded.toFixed(0)) : rounded
}

function fmt(value, suffix = '') {
  const n = roundMacro(value)
  return `${Number.isInteger(n) ? n.toFixed(0) : n}${suffix}`
}

function normalizeItems(items = []) {
  return items.map(item => ({
    ...item,
    servings: safeNumber(item.servings, 1),
    calories: roundMacro(item.calories),
    protein_g: roundMacro(item.protein_g),
    carbs_g: roundMacro(item.carbs_g),
    fat_g: roundMacro(item.fat_g),
    price_eur: roundMacro(item.price_eur || 0),
  }))
}

function normalizeMeals(meals = []) {
  return meals.map(meal => ({
    ...meal,
    meal_id: meal.id || meal.meal_id || meal.slot,
    items: normalizeItems(meal.items || []),
  }))
}

function scaleItem(item, nextServings) {
  const current = Math.max(0.01, safeNumber(item.servings, 1))
  const servings = Math.max(0.25, Math.min(6, roundMacro(nextServings)))
  const factor = servings / current
  return {
    ...item,
    servings,
    calories: roundMacro(item.calories * factor),
    protein_g: roundMacro(item.protein_g * factor),
    carbs_g: roundMacro(item.carbs_g * factor),
    fat_g: roundMacro(item.fat_g * factor),
    price_eur: roundMacro((item.price_eur || 0) * factor),
  }
}

function totalItems(items = []) {
  return {
    calories: roundMacro(items.reduce((sum, item) => sum + safeNumber(item.calories), 0)),
    protein_g: roundMacro(items.reduce((sum, item) => sum + safeNumber(item.protein_g), 0)),
    carbs_g: roundMacro(items.reduce((sum, item) => sum + safeNumber(item.carbs_g), 0)),
    fat_g: roundMacro(items.reduce((sum, item) => sum + safeNumber(item.fat_g), 0)),
    price_eur: roundMacro(items.reduce((sum, item) => sum + safeNumber(item.price_eur), 0)),
  }
}

function totalMeals(meals = []) {
  return totalItems(meals.flatMap(meal => meal.items || []))
}

function MacroStrip({ total, labelPrefix = '' }) {
  const cells = [
    ['KCAL', fmt(total?.calories)],
    ['PROTEIN', fmt(total?.protein_g, 'g')],
    ['CARBS', fmt(total?.carbs_g, 'g')],
    ['FATS', fmt(total?.fat_g, 'g')],
  ]
  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: 7, marginTop: 10 }}>
      {cells.map(([label, val]) => (
        <div key={label} style={{ border: `1px solid ${BORDER}`, background: 'rgba(157,255,111,.025)', padding: '9px 10px' }}>
          <div style={{ fontFamily: 'var(--phx-font-mono)', fontSize: 7, letterSpacing: '.16em', color: MUTED }}>{labelPrefix}{label}</div>
          <div style={{ fontFamily: 'var(--phx-font-display)', fontSize: 18, fontWeight: 700, color: '#fff', marginTop: 3 }}>{val}</div>
        </div>
      ))}
    </div>
  )
}

function miniButtonStyle(color = LIME) {
  return {
    border: `1px solid ${color}`,
    background: 'rgba(0,0,0,.22)',
    color,
    fontFamily: 'var(--phx-font-mono)',
    fontSize: 7,
    letterSpacing: '.12em',
    padding: '5px 8px',
    cursor: 'pointer',
  }
}

function PlanMealCard({ meal, onMeal }) {
  const total = useMemo(() => totalItems(meal.items || []), [meal])

  function updateItem(index, updater) {
    onMeal({
      ...meal,
      items: (meal.items || []).map((item, i) => (i === index ? updater(item) : item)),
    })
  }

  return (
    <div style={{ border: `1px solid rgba(157,255,111,.18)`, background: 'linear-gradient(180deg,rgba(157,255,111,.04),rgba(0,0,0,.1))', padding: 14 }}>
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12 }}>
        <div>
          <div style={{ fontFamily: 'var(--phx-font-mono)', fontSize: 8, letterSpacing: '.16em', color: CYAN }}>{String(meal.slot || '').replace('_', ' ').toUpperCase()} · {meal.timing || 'planned'}</div>
          <div style={{ fontFamily: 'var(--phx-font-display)', fontSize: 22, fontWeight: 700, color: '#fff', letterSpacing: '.06em', marginTop: 3 }}>{meal.title}</div>
          <div style={{ fontSize: 13, lineHeight: 1.55, color: 'rgba(220,248,236,.78)', marginTop: 5 }}>{meal.reason}</div>
        </div>
        {total.price_eur > 0 && <div style={{ fontFamily: 'var(--phx-font-display)', fontSize: 17, color: LIME_BR, whiteSpace: 'nowrap' }}>€{Number(total.price_eur).toFixed(2)}</div>}
      </div>

      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginTop: 10 }}>
        {(meal.tags || []).map(tag => (
          <span key={tag} style={{ fontFamily: 'var(--phx-font-mono)', fontSize: 7, letterSpacing: '.12em', color: LIME, border: `1px solid rgba(157,255,111,.24)`, background: 'rgba(157,255,111,.045)', padding: '3px 7px' }}>{tag}</span>
        ))}
        <span style={{ fontFamily: 'var(--phx-font-mono)', fontSize: 7, letterSpacing: '.12em', color: CYAN, border: `1px solid rgba(32,216,236,.24)`, background: 'rgba(32,216,236,.045)', padding: '3px 7px' }}>EDITABLE</span>
      </div>

      <MacroStrip total={total} />

      <div style={{ marginTop: 12, borderTop: `1px solid rgba(32,216,236,.10)` }}>
        {(meal.items || []).map((item, index) => (
          <div key={`${item.item_id}-${item.name}-${index}`} style={{ display: 'grid', gridTemplateColumns: '1fr auto', gap: 10, padding: '10px 0', borderBottom: `1px solid rgba(32,216,236,.08)` }}>
            <div>
              <div style={{ fontFamily: 'var(--phx-font-display)', fontSize: 15, fontWeight: 600, color: '#fff' }}>{item.name}</div>
              <div style={{ fontFamily: 'var(--phx-font-mono)', fontSize: 7, letterSpacing: '.1em', color: TEXT_DIM, marginTop: 2 }}>{fmt(item.servings)}× · {item.unit}</div>
              <div style={{ display: 'flex', gap: 6, marginTop: 8 }}>
                <button onClick={() => updateItem(index, current => scaleItem(current, safeNumber(current.servings, 1) - 0.25))} style={miniButtonStyle()}>−</button>
                <button onClick={() => updateItem(index, current => scaleItem(current, safeNumber(current.servings, 1) + 0.25))} style={miniButtonStyle()}>+</button>
                <button onClick={() => onMeal({ ...meal, items: (meal.items || []).filter((_, i) => i !== index) })} style={miniButtonStyle('rgba(255,92,122,.55)')}>REMOVE</button>
              </div>
            </div>
            <div style={{ textAlign: 'right', fontFamily: 'var(--phx-font-mono)', fontSize: 8, color: TEXT_DIM }}>
              <div>{fmt(item.calories)} kcal</div>
              <div>{fmt(item.protein_g, 'g')} P</div>
              <div>{fmt(item.carbs_g, 'g')} C · {fmt(item.fat_g, 'g')} F</div>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}

export default function DayPlanner({ onBack, onSuccess }) {
  const [data, setData] = useState(null)
  const [meals, setMeals] = useState([])
  const [loading, setLoading] = useState(true)
  const [logging, setLogging] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    async function load() {
      setLoading(true)
      setError('')
      try {
        const plan = await getNutritionDayPlan()
        setData(plan)
        setMeals(normalizeMeals(plan.meals || []))
      } catch {
        setError('Day planner unavailable. Backend may be offline.')
      }
      setLoading(false)
    }
    load()
  }, [])

  const plannedTotal = useMemo(() => totalMeals(meals), [meals])
  const target = data?.remaining_target || {}
  const gap = {
    calories: roundMacro(safeNumber(target.calories) - safeNumber(plannedTotal.calories)),
    protein_g: roundMacro(safeNumber(target.protein_g) - safeNumber(plannedTotal.protein_g)),
    carbs_g: roundMacro(safeNumber(target.carbs_g) - safeNumber(plannedTotal.carbs_g)),
    fat_g: roundMacro(safeNumber(target.fat_g) - safeNumber(plannedTotal.fat_g)),
  }

  async function handleLogPlan() {
    setLogging(true)
    setError('')
    try {
      await logDayPlan({
        plan_id: data.plan_id,
        meals: meals.map(meal => ({
          meal_id: meal.meal_id || meal.id || meal.slot,
          slot: meal.slot,
          title: meal.title,
          items: meal.items,
        })),
      })
      onSuccess?.()
    } catch {
      setError('Could not log this day plan. Refresh and try again.')
      setLogging(false)
    }
  }

  if (loading) return <div className="phx-scope-nutrition phx-state phx-state-loading" style={{ height: '100%', background: 'var(--phx-bg)' }}><span className="code">SYNC</span><p>Planning the day…</p></div>

  return (
    <div className="phx-scope-nutrition" style={{ height: '100%', display: 'flex', flexDirection: 'column', background: 'radial-gradient(circle at 78% 4%, color-mix(in srgb, var(--phx-nutrition) 7%, transparent), transparent 34rem), linear-gradient(180deg, #081208 0%, var(--phx-bg) 42%, #04090e 100%)', color: 'rgba(220,248,236,.94)', fontFamily: 'var(--phx-font-body)' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '13px 18px 11px', borderBottom: `1px solid ${BORDER}`, position: 'sticky', top: 0, background: 'rgba(0,0,0,.96)', backdropFilter: 'blur(12px)', zIndex: 5, flexShrink: 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', flex: 1 }}>
          <span onClick={onBack} style={{ color: CYAN, fontSize: 16, marginRight: 10, cursor: 'pointer' }}>←</span>
          <span style={{ fontFamily: 'var(--phx-font-display)', fontSize: 13, fontWeight: 700, letterSpacing: '.28em', color: LIME_BR, filter: 'drop-shadow(0 0 8px rgba(157,255,111,.22))' }}>DAY PLANNER</span>
        </div>
        <span style={{ fontFamily: 'var(--phx-font-mono)', fontSize: 8, letterSpacing: '.14em', color: LIME, border: `1px solid rgba(157,255,111,.32)`, background: 'rgba(157,255,111,.055)', padding: '2px 8px' }}>FULL DAY · APPROVAL FIRST</span>
      </div>

      <div style={{ flex: 1, overflowY: 'auto', paddingBottom: 130 }}>
        <div style={{ padding: '18px', borderBottom: `1px solid ${BORDER}`, background: 'linear-gradient(180deg,rgba(157,255,111,.045),transparent)' }}>
          <div style={{ fontFamily: 'var(--phx-font-display)', fontSize: 32, fontWeight: 700, letterSpacing: '.08em', color: '#fff' }}>FULL DAY PLANNER</div>
          <div style={{ fontFamily: 'var(--phx-font-mono)', fontSize: 8, letterSpacing: '.12em', color: TEXT_DIM, marginTop: 7 }}>
            Phoenix builds the remaining day from Lidl staples and recipes. Edit every ingredient before approval.
          </div>
          {data?.summary && <div style={{ marginTop: 11, fontSize: 13, lineHeight: 1.6, color: 'rgba(220,248,236,.78)' }}>{data.summary}</div>}
          <MacroStrip total={plannedTotal} />
          <div style={{ marginTop: 10, display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: 7 }}>
            {[
              ['KCAL GAP', fmt(gap.calories)],
              ['PROTEIN GAP', fmt(gap.protein_g, 'g')],
              ['CARB GAP', fmt(gap.carbs_g, 'g')],
              ['FAT GAP', fmt(gap.fat_g, 'g')],
            ].map(([label, val]) => (
              <div key={label} style={{ border: `1px solid rgba(32,216,236,.12)`, padding: '8px 9px', background: 'rgba(32,216,236,.025)' }}>
                <div style={{ fontFamily: 'var(--phx-font-mono)', fontSize: 7, letterSpacing: '.14em', color: MUTED }}>{label}</div>
                <div style={{ fontFamily: 'var(--phx-font-display)', fontSize: 15, fontWeight: 700, color: LIME_BR, marginTop: 3 }}>{val}</div>
              </div>
            ))}
          </div>
        </div>

        {error && <div style={{ margin: '14px 18px 0', padding: '11px 13px', border: `1px solid rgba(255,92,122,.25)`, color: '#ff5c7a', fontFamily: 'var(--phx-font-mono)', fontSize: 10 }}>{error}</div>}

        {meals.length === 0 ? (
          <div style={{ margin: 18, padding: 18, border: `1px solid ${BORDER}`, background: 'rgba(157,255,111,.025)' }}>
            <div style={{ fontFamily: 'var(--phx-font-display)', fontSize: 22, color: '#fff', fontWeight: 700 }}>NO DAY PLAN PROPOSED</div>
            <div style={{ fontSize: 13, lineHeight: 1.6, color: 'rgba(220,248,236,.76)', marginTop: 6 }}>{data?.summary || 'The day is near closed or there is not enough macro room for a safe plan.'}</div>
          </div>
        ) : (
          <div style={{ padding: '16px 18px 8px', display: 'flex', flexDirection: 'column', gap: 12 }}>
            {meals.map((meal, index) => (
              <PlanMealCard
                key={`${meal.meal_id}-${index}`}
                meal={meal}
                onMeal={nextMeal => setMeals(meals.map((m, i) => (i === index ? nextMeal : m)).filter(m => (m.items || []).length > 0))}
              />
            ))}
          </div>
        )}

        {data?.recovery_notes?.length > 0 && <div style={{ margin: '8px 18px 12px', padding: '11px 13px', border: `1px solid rgba(32,216,236,.16)`, borderLeft: `3px solid ${LIME}`, background: 'rgba(157,255,111,.025)' }}>
          <div style={{ fontFamily: 'var(--phx-font-mono)', fontSize: 7, letterSpacing: '.2em', color: 'rgba(157,255,111,.48)', marginBottom: 6 }}>RECOVERY LOGIC</div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
            {data.recovery_notes.map(note => <div key={note} style={{ fontFamily: 'var(--phx-font-mono)', fontSize: 7.5, letterSpacing: '.1em', color: TEXT_DIM }}>◆ {note}</div>)}
          </div>
        </div>}

        {meals.length > 0 && <div style={{ margin: '0 18px 16px' }}>
          <button
            onClick={handleLogPlan}
            disabled={logging || meals.length === 0 || plannedTotal.calories <= 0}
            style={{ width: '100%', padding: '15px 0', border: 'none', background: logging ? 'rgba(157,255,111,.3)' : LIME, color: '#001204', fontFamily: 'var(--phx-font-display)', fontSize: 15, fontWeight: 700, letterSpacing: '.22em', textAlign: 'center', boxShadow: `0 0 18px rgba(157,255,111,.28)`, cursor: logging ? 'not-allowed' : 'pointer' }}
          >
            {logging ? 'LOGGING FULL PLAN…' : `LOG FULL PLAN · ${meals.length} MEALS`}
          </button>
        </div>}

        <div style={{ margin: '0 18px 16px', padding: '11px 13px', border: `1px solid rgba(32,216,236,.16)`, background: 'rgba(32,216,236,.025)' }}>
          <div style={{ fontFamily: 'var(--phx-font-mono)', fontSize: 7, letterSpacing: '.2em', color: 'rgba(157,255,111,.48)', marginBottom: 6 }}>PHOENIX SAFETY</div>
          <div style={{ fontSize: '12.5px', lineHeight: 1.65, color: 'rgba(220,248,236,.78)' }}>
            Autonomous means Phoenix plans and prepares. You edit quantities, remove meals, and approve before anything is logged. No AI credits are needed for this planner.
          </div>
        </div>
      </div>
    </div>
  )
}
