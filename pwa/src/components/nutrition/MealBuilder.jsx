import { useEffect, useMemo, useState } from 'react'
import { getNutritionMealBuilder, logBuiltMeal, logMeal } from '../../api/client'

const LIME = '#9dff6f'
const LIME_BR = '#d5ffc7'
const BORDER = 'rgba(32,216,236,.18)'
const MUTED = 'rgba(32,216,236,.38)'
const TEXT_DIM = 'rgba(158,204,190,.58)'
const CYAN = '#20d8ec'
const TEMPLATE_KEY = 'phoenix_nutrition_meal_templates_v1'
const MEAL_SLOTS = [
  ['breakfast', 'BREAKFAST'],
  ['lunch', 'LUNCH'],
  ['dinner', 'DINNER'],
  ['snack', 'SNACK'],
  ['post_training', 'POST-TRAINING'],
]

function fmt(value, suffix = '') {
  const n = Number(value || 0)
  const rounded = Math.round(n * 10) / 10
  return `${Number.isInteger(rounded) ? rounded.toFixed(0) : rounded}${suffix}`
}

function safeNumber(value, fallback = 0) {
  const n = Number(value)
  return Number.isFinite(n) ? n : fallback
}

function roundMacro(value) {
  const rounded = Math.round(safeNumber(value) * 10) / 10
  return Number.isInteger(rounded) ? Number(rounded.toFixed(0)) : rounded
}

function normalizeItems(items = []) {
  return items.map(item => ({
    ...item,
    original_servings: safeNumber(item.original_servings ?? item.servings, 1),
    servings: safeNumber(item.servings, 1),
    calories: roundMacro(item.calories),
    protein_g: roundMacro(item.protein_g),
    carbs_g: roundMacro(item.carbs_g),
    fat_g: roundMacro(item.fat_g),
    price_eur: roundMacro(item.price_eur || 0),
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

function MacroStrip({ total }) {
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
          <div style={{ fontFamily: 'var(--mono)', fontSize: 7, letterSpacing: '.16em', color: MUTED }}>{label}</div>
          <div style={{ fontFamily: 'var(--display)', fontSize: 18, fontWeight: 700, color: '#fff', marginTop: 3 }}>{val}</div>
        </div>
      ))}
    </div>
  )
}

function SlotPicker({ slot, onSlot }) {
  return (
    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginTop: 12 }}>
      {MEAL_SLOTS.map(([value, label]) => (
        <button
          key={value}
          onClick={() => onSlot(value)}
          style={{
            border: `1px solid ${slot === value ? 'rgba(157,255,111,.55)' : 'rgba(32,216,236,.18)'}`,
            background: slot === value ? 'rgba(157,255,111,.10)' : 'rgba(0,0,0,.18)',
            color: slot === value ? LIME : MUTED,
            fontFamily: 'var(--mono)',
            fontSize: 7,
            letterSpacing: '.14em',
            padding: '5px 8px',
            cursor: 'pointer',
          }}
        >{label}</button>
      ))}
    </div>
  )
}

function EditableItems({ items, onItems }) {
  function updateItem(index, updater) {
    onItems(items.map((item, i) => (i === index ? updater(item) : item)))
  }

  return (
    <div style={{ marginTop: 12, borderTop: `1px solid rgba(32,216,236,.10)` }}>
      {items.map((item, index) => (
        <div key={`${item.item_id}-${item.name}-${index}`} style={{ display: 'grid', gridTemplateColumns: '1fr auto', gap: 10, padding: '10px 0', borderBottom: `1px solid rgba(32,216,236,.08)` }}>
          <div>
            <div style={{ fontFamily: 'var(--display)', fontSize: 15, fontWeight: 600, color: '#fff' }}>{item.name}</div>
            <div style={{ fontFamily: 'var(--mono)', fontSize: 7, letterSpacing: '.1em', color: TEXT_DIM, marginTop: 2 }}>{fmt(item.servings)}× · {item.unit}</div>
            <div style={{ display: 'flex', gap: 6, marginTop: 8 }}>
              <button onClick={() => updateItem(index, current => scaleItem(current, safeNumber(current.servings, 1) - 0.25))} style={miniButtonStyle()}>−</button>
              <button onClick={() => updateItem(index, current => scaleItem(current, safeNumber(current.servings, 1) + 0.25))} style={miniButtonStyle()}>+</button>
              <button onClick={() => onItems(items.filter((_, i) => i !== index))} style={miniButtonStyle('rgba(255,92,122,.55)')}>REMOVE</button>
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

function SuggestionCard({ suggestion, onLog, logging, onSaveTemplate }) {
  const [slot, setSlot] = useState('next_meal')
  const [items, setItems] = useState(() => normalizeItems(suggestion.items || []))
  const [saved, setSaved] = useState(false)
  const total = useMemo(() => totalItems(items), [items])
  const canLog = suggestion.loggable && items.length > 0 && total.calories > 0

  function resetItems() {
    setItems(normalizeItems(suggestion.items || []))
    setSaved(false)
  }

  function saveTemplate() {
    onSaveTemplate?.({
      id: `template-${Date.now()}-${suggestion.id}`,
      title: suggestion.title,
      reason: suggestion.reason,
      tags: [...(suggestion.tags || []), 'TEMPLATE'],
      meal_slot: slot,
      items,
      total,
      saved_at: new Date().toISOString(),
    })
    setSaved(true)
  }

  return (
    <div style={{ border: `1px solid rgba(157,255,111,.18)`, background: 'linear-gradient(180deg,rgba(157,255,111,.045),rgba(0,0,0,.1))', padding: 14 }}>
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12 }}>
        <div>
          <div style={{ fontFamily: 'var(--display)', fontSize: 22, fontWeight: 700, color: '#fff', letterSpacing: '.06em' }}>{suggestion.title}</div>
          <div style={{ fontSize: 13, lineHeight: 1.55, color: 'rgba(220,248,236,.78)', marginTop: 5 }}>{suggestion.reason}</div>
        </div>
        {total.price_eur > 0 && (
          <div style={{ fontFamily: 'var(--display)', fontSize: 17, color: LIME_BR, whiteSpace: 'nowrap' }}>€{Number(total.price_eur).toFixed(2)}</div>
        )}
      </div>

      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginTop: 10 }}>
        {(suggestion.tags || []).map(tag => (
          <span key={tag} style={{ fontFamily: 'var(--mono)', fontSize: 7, letterSpacing: '.12em', color: LIME, border: `1px solid rgba(157,255,111,.24)`, background: 'rgba(157,255,111,.045)', padding: '3px 7px' }}>{tag}</span>
        ))}
        <span style={{ fontFamily: 'var(--mono)', fontSize: 7, letterSpacing: '.12em', color: CYAN, border: `1px solid rgba(32,216,236,.24)`, background: 'rgba(32,216,236,.045)', padding: '3px 7px' }}>EDITABLE</span>
      </div>

      <SlotPicker slot={slot} onSlot={setSlot} />
      <MacroStrip total={total} />
      <EditableItems items={items} onItems={setItems} />

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginTop: 12 }}>
        <button onClick={resetItems} style={{ padding: '11px 0', border: `1px solid ${BORDER}`, background: 'rgba(32,216,236,.035)', color: MUTED, fontFamily: 'var(--mono)', fontSize: 8, letterSpacing: '.16em', cursor: 'pointer' }}>RESET</button>
        <button onClick={saveTemplate} disabled={saved || items.length === 0} style={{ padding: '11px 0', border: `1px solid rgba(157,255,111,.24)`, background: saved ? 'rgba(157,255,111,.13)' : 'rgba(157,255,111,.045)', color: LIME, fontFamily: 'var(--mono)', fontSize: 8, letterSpacing: '.16em', cursor: 'pointer' }}>{saved ? 'TEMPLATE SAVED' : 'SAVE TEMPLATE'}</button>
      </div>

      <button
        onClick={() => onLog({ suggestion_id: suggestion.id, title: suggestion.title, meal_slot: slot, items })}
        disabled={!canLog || logging === suggestion.id}
        style={{ width: '100%', marginTop: 10, padding: '14px 0', border: 'none', background: (!canLog || logging === suggestion.id) ? 'rgba(157,255,111,.3)' : LIME, color: '#001204', fontFamily: 'var(--display)', fontSize: 15, fontWeight: 700, letterSpacing: '.22em', textAlign: 'center', boxShadow: `0 0 18px rgba(157,255,111,.28)`, cursor: canLog ? 'pointer' : 'not-allowed' }}
      >
        {logging === suggestion.id ? 'LOGGING…' : 'LOG THIS MEAL'}
      </button>
    </div>
  )
}

function TemplateCard({ template, onLog, onDelete, logging }) {
  const total = template.total || totalItems(template.items || [])
  return (
    <div style={{ border: `1px solid rgba(32,216,236,.14)`, background: 'rgba(32,216,236,.025)', padding: 12 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10 }}>
        <div>
          <div style={{ fontFamily: 'var(--display)', fontSize: 18, fontWeight: 700, color: '#fff' }}>{template.title}</div>
          <div style={{ fontFamily: 'var(--mono)', fontSize: 7, letterSpacing: '.12em', color: TEXT_DIM, marginTop: 3 }}>{(template.meal_slot || 'next_meal').replace('_', ' ').toUpperCase()} · {template.items?.length || 0} ITEMS</div>
        </div>
        {total.price_eur > 0 && <div style={{ fontFamily: 'var(--display)', color: LIME_BR }}>€{Number(total.price_eur).toFixed(2)}</div>}
      </div>
      <MacroStrip total={total} />
      <div style={{ display: 'grid', gridTemplateColumns: '1fr auto', gap: 8, marginTop: 10 }}>
        <button onClick={() => onLog(template)} disabled={logging === template.id} style={{ padding: '11px 0', border: 'none', background: LIME, color: '#001204', fontFamily: 'var(--display)', fontSize: 12, fontWeight: 700, letterSpacing: '.18em', cursor: 'pointer' }}>{logging === template.id ? 'LOGGING…' : 'LOG TEMPLATE'}</button>
        <button onClick={() => onDelete(template.id)} style={{ padding: '0 12px', border: `1px solid rgba(255,92,122,.45)`, background: 'rgba(255,92,122,.035)', color: '#ff5c7a', fontFamily: 'var(--mono)', fontSize: 8, letterSpacing: '.12em', cursor: 'pointer' }}>DELETE</button>
      </div>
    </div>
  )
}

function readTemplates() {
  try {
    return JSON.parse(localStorage.getItem(TEMPLATE_KEY) || '[]')
  } catch {
    return []
  }
}

function writeTemplates(templates) {
  localStorage.setItem(TEMPLATE_KEY, JSON.stringify(templates.slice(0, 8)))
}

export default function MealBuilder({ onBack, onSuccess }) {
  const [data, setData] = useState(null)
  const [loading, setLoading] = useState(true)
  const [logging, setLogging] = useState(null)
  const [error, setError] = useState('')
  const [templates, setTemplates] = useState(() => readTemplates())

  useEffect(() => {
    async function load() {
      setLoading(true)
      setError('')
      try {
        setData(await getNutritionMealBuilder())
      } catch {
        setError('Meal builder unavailable. Backend may be offline.')
      }
      setLoading(false)
    }
    load()
  }, [])

  function saveTemplate(template) {
    const next = [template, ...templates.filter(t => t.id !== template.id)].slice(0, 8)
    setTemplates(next)
    writeTemplates(next)
  }

  function deleteTemplate(templateId) {
    const next = templates.filter(t => t.id !== templateId)
    setTemplates(next)
    writeTemplates(next)
  }

  async function handleLog(payload) {
    setLogging(payload.suggestion_id)
    setError('')
    try {
      await logBuiltMeal(payload)
      onSuccess?.()
    } catch {
      setError('Could not log this proposal. Refresh and try again.')
      setLogging(null)
    }
  }

  async function handleLogTemplate(template) {
    const total = template.total || totalItems(template.items || [])
    setLogging(template.id)
    setError('')
    try {
      await logMeal({
        item_id: template.id,
        item_type: 'built_template',
        name: `Phoenix Template ${(template.meal_slot || 'next_meal').replace('_', ' ').toUpperCase()}: ${template.title}`,
        servings: 1,
        calories: total.calories,
        protein_g: total.protein_g,
        fat_g: total.fat_g,
        carbs_g: total.carbs_g,
        source: `phoenix_meal_template:${template.meal_slot || 'next_meal'}`,
      })
      onSuccess?.()
    } catch {
      setError('Could not log this saved template. Refresh and try again.')
      setLogging(null)
    }
  }

  if (loading) return <div className="phx-scope-nutrition phx-state phx-state-loading" style={{ height: '100%', background: 'var(--phx-bg)' }}><span className="code">SYNC</span><p>Building meal options…</p></div>

  const suggestions = data?.suggestions || []

  return (
    <div className="phx-scope-nutrition" style={{ height: '100%', display: 'flex', flexDirection: 'column', background: 'radial-gradient(circle at 78% 4%, color-mix(in srgb, var(--phx-nutrition) 7%, transparent), transparent 34rem), linear-gradient(180deg, #081208 0%, var(--phx-bg) 42%, #04090e 100%)', color: 'rgba(220,248,236,.94)', fontFamily: 'var(--phx-font-body)' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '13px 18px 11px', borderBottom: `1px solid ${BORDER}`, position: 'sticky', top: 0, background: 'rgba(0,0,0,.96)', backdropFilter: 'blur(12px)', zIndex: 5, flexShrink: 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', flex: 1 }}>
          <span onClick={onBack} style={{ color: CYAN, fontSize: 16, marginRight: 10, cursor: 'pointer' }}>←</span>
          <span style={{ fontFamily: 'var(--display)', fontSize: 13, fontWeight: 700, letterSpacing: '.28em', color: LIME_BR, filter: 'drop-shadow(0 0 8px rgba(157,255,111,.22))' }}>MEAL BUILDER</span>
        </div>
        <span style={{ fontFamily: 'var(--mono)', fontSize: 8, letterSpacing: '.14em', color: LIME, border: `1px solid rgba(157,255,111,.32)`, background: 'rgba(157,255,111,.055)', padding: '2px 8px' }}>EDITABLE · APPROVAL FIRST</span>
      </div>

      <div style={{ flex: 1, overflowY: 'auto', paddingBottom: 120 }}>
        <div style={{ padding: '18px', borderBottom: `1px solid ${BORDER}`, background: 'linear-gradient(180deg,rgba(157,255,111,.045),transparent)' }}>
          <div style={{ fontFamily: 'var(--display)', fontSize: 32, fontWeight: 700, letterSpacing: '.08em', color: '#fff' }}>AUTONOMOUS MEAL BUILDER</div>
          <div style={{ fontFamily: 'var(--mono)', fontSize: 8, letterSpacing: '.12em', color: TEXT_DIM, marginTop: 7 }}>
            Phoenix proposes. You can edit ingredients, choose the meal slot, save templates, then approve the log.
          </div>
          {data && <div style={{ marginTop: 12, display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 8 }}>
            {[
              ['KCAL LEFT', fmt(data.remaining_calories)],
              ['PROTEIN LEFT', fmt(data.remaining_protein_g, 'g')],
              ['CARBS LEFT', fmt(data.remaining_carbs_g, 'g')],
            ].map(([label, val]) => (
              <div key={label} style={{ border: `1px solid ${BORDER}`, padding: '9px 10px', background: 'rgba(157,255,111,.025)' }}>
                <div style={{ fontFamily: 'var(--mono)', fontSize: 7, letterSpacing: '.16em', color: MUTED }}>{label}</div>
                <div style={{ fontFamily: 'var(--display)', fontSize: 18, fontWeight: 700, color: LIME_BR }}>{val}</div>
              </div>
            ))}
          </div>}
          {data?.summary && <div style={{ marginTop: 11, fontSize: 13, lineHeight: 1.6, color: 'rgba(220,248,236,.78)' }}>{data.summary}</div>}
        </div>

        {error && <div style={{ margin: '14px 18px 0', padding: '11px 13px', border: `1px solid rgba(255,92,122,.25)`, color: '#ff5c7a', fontFamily: 'var(--mono)', fontSize: 10 }}>{error}</div>}

        <div style={{ padding: '16px 18px 8px', display: 'flex', flexDirection: 'column', gap: 12 }}>
          {suggestions.length === 0 ? (
            <div style={{ padding: 18, border: `1px solid ${BORDER}`, background: 'rgba(157,255,111,.025)' }}>
              <div style={{ fontFamily: 'var(--display)', fontSize: 22, color: '#fff', fontWeight: 700 }}>NO FULL MEAL PROPOSED</div>
              <div style={{ fontSize: 13, lineHeight: 1.6, color: 'rgba(220,248,236,.76)', marginTop: 6 }}>{data?.summary || 'The day is near closed or there is not enough macro room for a safe proposal.'}</div>
            </div>
          ) : suggestions.map(s => <SuggestionCard key={s.id} suggestion={s} onLog={handleLog} logging={logging} onSaveTemplate={saveTemplate} />)}
        </div>

        {templates.length > 0 && <div style={{ padding: '8px 18px 16px' }}>
          <div style={{ fontFamily: 'var(--mono)', fontSize: 8, letterSpacing: '.22em', color: MUTED, marginBottom: 10 }}>SAVED MEAL TEMPLATES</div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr', gap: 10 }}>
            {templates.map(template => (
              <TemplateCard key={template.id} template={template} onLog={handleLogTemplate} onDelete={deleteTemplate} logging={logging} />
            ))}
          </div>
        </div>}

        {data?.day_plan?.length > 0 && <div style={{ padding: '0 18px 16px' }}>
          <div style={{ fontFamily: 'var(--mono)', fontSize: 8, letterSpacing: '.22em', color: MUTED, marginBottom: 10 }}>FULL DAY LOGIC</div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 8 }}>
            {data.day_plan.map(step => (
              <div key={step.slot} style={{ border: `1px solid rgba(32,216,236,.14)`, background: 'rgba(157,255,111,.018)', padding: 11 }}>
                <div style={{ fontFamily: 'var(--display)', fontSize: 15, fontWeight: 700, color: '#fff' }}>{step.title}</div>
                <div style={{ fontSize: 12, lineHeight: 1.55, color: TEXT_DIM, marginTop: 5 }}>{step.guidance}</div>
              </div>
            ))}
          </div>
        </div>}

        <div style={{ margin: '0 18px 16px', padding: '11px 13px', border: `1px solid rgba(32,216,236,.16)`, borderLeft: `3px solid ${LIME}`, background: 'rgba(157,255,111,.025)' }}>
          <div style={{ fontFamily: 'var(--mono)', fontSize: 7, letterSpacing: '.2em', color: 'rgba(157,255,111,.48)', marginBottom: 6 }}>PHOENIX SAFETY</div>
          <div style={{ fontSize: '12.5px', lineHeight: 1.65, color: 'rgba(220,248,236,.78)' }}>
            Autonomous means Phoenix proposes and prepares the meal. You edit and approve before anything is logged. Templates stay local in this browser.
          </div>
        </div>
      </div>
    </div>
  )
}
