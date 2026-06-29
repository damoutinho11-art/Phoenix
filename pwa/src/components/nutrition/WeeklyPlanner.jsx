import { useEffect, useMemo, useState } from 'react'
import { getNutritionWeeklyPlan, logWeeklyPlan } from '../../api/client'

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

function money(value) {
  return `€${safeNumber(value).toFixed(2)}`
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

function normalizeDays(days = []) {
  return days.map(day => ({
    ...day,
    meals: normalizeMeals(day.meals || []),
  }))
}

function scaleItem(item, nextServings) {
  const current = Math.max(0.01, safeNumber(item.servings, 1))
  const servings = Math.max(0.25, Math.min(8, roundMacro(nextServings)))
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

function totalDays(days = []) {
  return totalItems(days.flatMap(day => (day.meals || []).flatMap(meal => meal.items || [])))
}

function MacroGrid({ total, prefix = '' }) {
  const cells = [
    ['KCAL', fmt(total?.calories)],
    ['PROTEIN', fmt(total?.protein_g, 'g')],
    ['CARBS', fmt(total?.carbs_g, 'g')],
    ['FATS', fmt(total?.fat_g, 'g')],
  ]
  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: 7, marginTop: 10 }}>
      {cells.map(([label, val]) => (
        <div key={label} style={{ border: `1px solid ${BORDER}`, background: 'rgba(157,255,111,.025)', padding: '8px 9px' }}>
          <div style={{ fontFamily: 'var(--mono)', fontSize: 7, letterSpacing: '.14em', color: MUTED }}>{prefix}{label}</div>
          <div style={{ fontFamily: 'var(--display)', fontSize: 16, fontWeight: 700, color: '#fff', marginTop: 3 }}>{val}</div>
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
    fontFamily: 'var(--mono)',
    fontSize: 7,
    letterSpacing: '.12em',
    padding: '5px 8px',
    cursor: 'pointer',
  }
}

function MealEditor({ meal, onMeal }) {
  const total = useMemo(() => totalItems(meal.items || []), [meal])

  function updateItem(index, updater) {
    onMeal({
      ...meal,
      items: (meal.items || []).map((item, i) => (i === index ? updater(item) : item)),
    })
  }

  return (
    <div style={{ borderTop: `1px solid rgba(32,216,236,.10)`, marginTop: 10, paddingTop: 10 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12 }}>
        <div>
          <div style={{ fontFamily: 'var(--mono)', fontSize: 7, letterSpacing: '.14em', color: CYAN }}>{String(meal.slot || '').replace('_', ' ').toUpperCase()}</div>
          <div style={{ fontFamily: 'var(--display)', fontSize: 18, fontWeight: 700, color: '#fff', letterSpacing: '.05em', marginTop: 2 }}>{meal.title}</div>
        </div>
        <div style={{ textAlign: 'right', fontFamily: 'var(--mono)', color: TEXT_DIM, fontSize: 8 }}>
          <div style={{ color: LIME_BR, fontSize: 12 }}>{fmt(total.calories)} kcal</div>
          <div>{fmt(total.protein_g, 'g')} P · {money(total.price_eur)}</div>
        </div>
      </div>
      {(meal.items || []).map((item, index) => (
        <div key={`${item.item_id}-${item.name}-${index}`} style={{ display: 'grid', gridTemplateColumns: '1fr auto', gap: 10, padding: '9px 0', borderBottom: `1px solid rgba(32,216,236,.08)` }}>
          <div>
            <div style={{ fontFamily: 'var(--display)', fontSize: 14, fontWeight: 600, color: '#fff' }}>{item.name}</div>
            <div style={{ fontFamily: 'var(--mono)', fontSize: 7, letterSpacing: '.1em', color: TEXT_DIM, marginTop: 2 }}>{fmt(item.servings)}× · {item.unit || 'serving'}</div>
            <div style={{ display: 'flex', gap: 6, marginTop: 7 }}>
              <button onClick={() => updateItem(index, current => scaleItem(current, safeNumber(current.servings, 1) - 0.25))} style={miniButtonStyle()}>−</button>
              <button onClick={() => updateItem(index, current => scaleItem(current, safeNumber(current.servings, 1) + 0.25))} style={miniButtonStyle()}>+</button>
              <button onClick={() => onMeal({ ...meal, items: (meal.items || []).filter((_, i) => i !== index) })} style={miniButtonStyle('rgba(255,92,122,.55)')}>REMOVE</button>
            </div>
          </div>
          <div style={{ textAlign: 'right', fontFamily: 'var(--mono)', fontSize: 8, color: TEXT_DIM }}>
            <div>{fmt(item.calories)} kcal</div>
            <div>{fmt(item.protein_g, 'g')} P</div>
            <div>{fmt(item.carbs_g, 'g')} C · {fmt(item.fat_g, 'g')} F</div>
          </div>
        </div>
      ))}
    </div>
  )
}

function DayCard({ day, onDay }) {
  const total = useMemo(() => totalMeals(day.meals || []), [day])
  return (
    <div style={{ border: `1px solid rgba(157,255,111,.18)`, background: 'linear-gradient(180deg,rgba(157,255,111,.04),rgba(0,0,0,.1))', padding: 14 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12 }}>
        <div>
          <div style={{ fontFamily: 'var(--mono)', fontSize: 8, letterSpacing: '.16em', color: day.is_training_day ? LIME : CYAN }}>{day.label}</div>
          <div style={{ fontSize: 12, lineHeight: 1.5, color: TEXT_DIM, marginTop: 4 }}>{day.date} · {day.meals?.length || 0} meals · {day.is_training_day ? 'higher-carb recovery day' : 'controlled rest-day baseline'}</div>
        </div>
        <div style={{ textAlign: 'right', fontFamily: 'var(--display)', color: LIME_BR, fontSize: 17, whiteSpace: 'nowrap' }}>{money(total.price_eur)}</div>
      </div>
      <MacroGrid total={total} />
      {(day.meals || []).map((meal, index) => (
        <MealEditor
          key={`${day.date}-${meal.meal_id}-${index}`}
          meal={meal}
          onMeal={nextMeal => onDay({
            ...day,
            meals: (day.meals || []).map((m, i) => (i === index ? nextMeal : m)).filter(m => (m.items || []).length > 0),
          })}
        />
      ))}
      <button onClick={() => onDay({ ...day, meals: [] })} style={{ ...miniButtonStyle('rgba(255,92,122,.58)'), marginTop: 10 }}>REMOVE DAY</button>
    </div>
  )
}

function Section({ title, children, subtitle }) {
  return (
    <div style={{ margin: '14px 18px 0', border: `1px solid rgba(32,216,236,.14)`, background: 'rgba(0,0,0,.16)' }}>
      <div style={{ padding: '12px 13px', borderBottom: `1px solid rgba(32,216,236,.10)` }}>
        <div style={{ fontFamily: 'var(--mono)', fontSize: 7.5, letterSpacing: '.18em', color: LIME }}>{title}</div>
        {subtitle && <div style={{ fontSize: 12, lineHeight: 1.45, color: TEXT_DIM, marginTop: 4 }}>{subtitle}</div>}
      </div>
      <div style={{ padding: '0 13px 12px' }}>{children}</div>
    </div>
  )
}

export default function WeeklyPlanner({ onBack, onSuccess }) {
  const [data, setData] = useState(null)
  const [days, setDays] = useState([])
  const [dayCount, setDayCount] = useState(7)
  const [loading, setLoading] = useState(true)
  const [logging, setLogging] = useState(false)
  const [error, setError] = useState('')

  async function load(count = dayCount) {
    setLoading(true)
    setError('')
    try {
      const plan = await getNutritionWeeklyPlan(count)
      setData(plan)
      setDays(normalizeDays(plan.days || []))
    } catch {
      setError('Weekly planner unavailable. Backend may be offline.')
    }
    setLoading(false)
  }

  useEffect(() => { load(dayCount) }, [])

  async function handleDayCount(nextCount) {
    setDayCount(nextCount)
    await load(nextCount)
  }

  const total = useMemo(() => totalDays(days), [days])
  const activeDays = days.filter(day => (day.meals || []).length > 0)
  const avg = activeDays.length ? {
    calories: roundMacro(total.calories / activeDays.length),
    protein_g: roundMacro(total.protein_g / activeDays.length),
    carbs_g: roundMacro(total.carbs_g / activeDays.length),
    fat_g: roundMacro(total.fat_g / activeDays.length),
    price_eur: roundMacro(total.price_eur / activeDays.length),
  } : total

  async function handleLogWeek() {
    setLogging(true)
    setError('')
    try {
      await logWeeklyPlan({
        plan_id: data.plan_id,
        days: activeDays.map(day => ({
          date: day.date,
          meals: (day.meals || []).map(meal => ({
            meal_id: meal.meal_id || meal.id || meal.slot,
            slot: meal.slot,
            title: meal.title,
            items: meal.items,
          })),
        })),
      })
      onSuccess?.()
    } catch {
      setError('Could not log this weekly plan. Refresh and try again.')
      setLogging(false)
    }
  }

  if (loading) return <div style={{ height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#000', color: MUTED, fontFamily: 'var(--mono)', fontSize: 12 }}>Planning the week…</div>

  return (
    <div style={{ height: '100%', display: 'flex', flexDirection: 'column', background: '#000', color: 'rgba(220,248,236,.94)', fontFamily: "'Saira Condensed',sans-serif" }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '13px 18px 11px', borderBottom: `1px solid ${BORDER}`, position: 'sticky', top: 0, background: 'rgba(0,0,0,.96)', backdropFilter: 'blur(12px)', zIndex: 5, flexShrink: 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', flex: 1 }}>
          <span onClick={onBack} style={{ color: CYAN, fontSize: 16, marginRight: 10, cursor: 'pointer' }}>←</span>
          <span style={{ fontFamily: 'var(--display)', fontSize: 13, fontWeight: 700, letterSpacing: '.28em', color: LIME_BR, filter: 'drop-shadow(0 0 8px rgba(157,255,111,.22))' }}>WEEKLY PREP</span>
        </div>
        <span style={{ fontFamily: 'var(--mono)', fontSize: 8, letterSpacing: '.14em', color: LIME, border: `1px solid rgba(157,255,111,.32)`, background: 'rgba(157,255,111,.055)', padding: '2px 8px' }}>3–7 DAYS · APPROVAL FIRST</span>
      </div>

      <div style={{ flex: 1, overflowY: 'auto', paddingBottom: 130 }}>
        <div style={{ padding: '18px', borderBottom: `1px solid ${BORDER}`, background: 'linear-gradient(180deg,rgba(157,255,111,.045),transparent)' }}>
          <div style={{ fontFamily: 'var(--display)', fontSize: 32, fontWeight: 700, letterSpacing: '.08em', color: '#fff' }}>MEAL PREP SYSTEM</div>
          <div style={{ fontFamily: 'var(--mono)', fontSize: 8, letterSpacing: '.12em', color: TEXT_DIM, marginTop: 7 }}>Phoenix plans 3–7 days, rotates foods, separates pantry items, and builds the weekly Lidl basket. Nothing is logged or bought without approval.</div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 8, marginTop: 12 }}>
            {[3, 5, 7].map(count => (
              <button key={count} onClick={() => handleDayCount(count)} style={{ padding: '10px 0', border: `1px solid ${dayCount === count ? 'rgba(157,255,111,.45)' : BORDER}`, background: dayCount === count ? 'rgba(157,255,111,.09)' : 'rgba(0,0,0,.18)', color: dayCount === count ? LIME : MUTED, fontFamily: 'var(--mono)', fontSize: 8, letterSpacing: '.16em', cursor: 'pointer' }}>{count} DAYS</button>
            ))}
          </div>
          {data?.summary && <div style={{ marginTop: 11, fontSize: 13, lineHeight: 1.6, color: 'rgba(220,248,236,.78)' }}>{data.summary}</div>}
          <MacroGrid total={total} prefix="WEEK " />
          <MacroGrid total={avg} prefix="AVG " />
        </div>

        {error && <div style={{ margin: '14px 18px 0', padding: '11px 13px', border: `1px solid rgba(255,92,122,.25)`, color: '#ff5c7a', fontFamily: 'var(--mono)', fontSize: 10 }}>{error}</div>}

        <Section title="BATCH PREP" subtitle="Cook/stock these groups first. Pantry items are handled in the shopping list logic.">
          {(data?.batch_prep || []).length ? data.batch_prep.map(block => (
            <div key={block.category} style={{ padding: '10px 0', borderBottom: `1px solid rgba(32,216,236,.08)` }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10 }}>
                <div style={{ fontFamily: 'var(--mono)', fontSize: 8, letterSpacing: '.14em', color: LIME }}>{String(block.category).toUpperCase()} · {String(block.action).toUpperCase()}</div>
                <div style={{ fontFamily: 'var(--display)', color: LIME_BR }}>{money(block.estimated_cost_eur)}</div>
              </div>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginTop: 7 }}>
                {(block.items || []).map(item => <span key={`${block.category}-${item.item_id}-${item.name}`} style={{ fontFamily: 'var(--mono)', fontSize: 7, letterSpacing: '.1em', color: TEXT_DIM, border: `1px solid rgba(32,216,236,.12)`, padding: '4px 7px' }}>{item.name} · {fmt(item.servings)}×</span>)}
              </div>
            </div>
          )) : <div style={{ padding: '12px 0', color: TEXT_DIM, fontSize: 13 }}>No batch-prep blocks returned.</div>}
        </Section>

        <Section title="WEEKLY SHOPPING" subtitle="Pantry-aware estimate from the weekly plan.">
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: 7, paddingTop: 11 }}>
            {[
              ['TO BUY', data?.shopping_list?.need_to_buy_count || 0],
              ['PANTRY', data?.shopping_list?.already_have_count || 0],
              ['MISSING €', money(data?.shopping_list?.estimated_missing_cost_eur || 0)],
              ['FULL €', money(data?.shopping_list?.estimated_full_cost_eur || 0)],
            ].map(([label, value]) => (
              <div key={label} style={{ border: `1px solid ${BORDER}`, background: 'rgba(32,216,236,.025)', padding: '8px 9px' }}>
                <div style={{ fontFamily: 'var(--mono)', fontSize: 7, letterSpacing: '.14em', color: MUTED }}>{label}</div>
                <div style={{ fontFamily: 'var(--display)', fontSize: 15, fontWeight: 700, color: LIME_BR, marginTop: 3 }}>{value}</div>
              </div>
            ))}
          </div>
        </Section>

        <div style={{ padding: '16px 18px 8px', display: 'flex', flexDirection: 'column', gap: 12 }}>
          {days.map((day, index) => (
            <DayCard
              key={`${day.date}-${index}`}
              day={day}
              onDay={nextDay => setDays(days.map((d, i) => (i === index ? nextDay : d)))}
            />
          ))}
        </div>

        {activeDays.length > 0 && <div style={{ margin: '0 18px 16px' }}>
          <button
            onClick={handleLogWeek}
            disabled={logging || activeDays.length === 0 || total.calories <= 0}
            style={{ width: '100%', padding: '15px 0', border: 'none', background: logging ? 'rgba(157,255,111,.3)' : LIME, color: '#001204', fontFamily: 'var(--display)', fontSize: 15, fontWeight: 700, letterSpacing: '.22em', textAlign: 'center', boxShadow: `0 0 18px rgba(157,255,111,.28)`, cursor: logging ? 'not-allowed' : 'pointer' }}
          >
            {logging ? 'LOGGING WEEK…' : `LOG WEEK · ${activeDays.length} DAYS`}
          </button>
        </div>}

        <div style={{ margin: '0 18px 16px', padding: '11px 13px', border: `1px solid rgba(32,216,236,.16)`, background: 'rgba(32,216,236,.025)' }}>
          <div style={{ fontFamily: 'var(--mono)', fontSize: 7, letterSpacing: '.2em', color: 'rgba(157,255,111,.48)', marginBottom: 6 }}>PHOENIX SAFETY</div>
          <div style={{ fontSize: '12.5px', lineHeight: 1.65, color: 'rgba(220,248,236,.78)' }}>Weekly prep is local-first and approval-first. Phoenix can plan the week, but you edit days/meals and approve before anything is logged. Grocery output is a checklist only.</div>
        </div>
      </div>
    </div>
  )
}
