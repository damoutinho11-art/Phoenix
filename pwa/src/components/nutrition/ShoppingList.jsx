import { useEffect, useState } from 'react'
import { getNutritionShoppingList } from '../../api/client'

const LIME = '#9dff6f'
const LIME_BR = '#d5ffc7'
const BORDER = 'rgba(255,209,102,.18)'
const MUTED = 'rgba(255,209,102,.38)'
const TEXT_DIM = 'rgba(190,214,202,.72)'
const CYAN = '#ffd166'

function fmt(value, suffix = '') {
  const n = Number(value || 0)
  const rounded = Math.round(n * 10) / 10
  return `${Number.isInteger(rounded) ? rounded.toFixed(0) : rounded}${suffix}`
}

function Money({ value }) {
  return <span>€{Number(value || 0).toFixed(2)}</span>
}

function SummaryCard({ label, value, tone = LIME_BR }) {
  return (
    <div style={{ border: `1px solid ${BORDER}`, background: 'rgba(157,255,111,.025)', padding: '10px 11px' }}>
      <div style={{ fontFamily: 'var(--phx-font-mono)', fontSize: 7, letterSpacing: '.16em', color: MUTED }}>{label}</div>
      <div style={{ fontFamily: 'var(--phx-font-display)', fontSize: 20, fontWeight: 700, color: tone, marginTop: 3 }}>{value}</div>
    </div>
  )
}

function ItemRow({ item, mode = 'buy' }) {
  const border = mode === 'have' ? 'rgba(255,209,102,.14)' : 'rgba(157,255,111,.15)'
  const bg = mode === 'have' ? 'rgba(255,209,102,.025)' : 'rgba(157,255,111,.025)'
  return (
    <div style={{ display: 'grid', gridTemplateColumns: '1fr auto', gap: 10, padding: '10px 0', borderBottom: `1px solid rgba(255,209,102,.08)` }}>
      <div>
        <div style={{ fontFamily: 'var(--phx-font-display)', fontSize: 16, fontWeight: 700, color: '#fff', letterSpacing: '.04em' }}>{item.name}</div>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginTop: 5 }}>
          <span style={{ fontFamily: 'var(--phx-font-mono)', fontSize: 7, letterSpacing: '.12em', color: mode === 'have' ? CYAN : LIME, border: `1px solid ${border}`, background: bg, padding: '3px 6px' }}>{String(item.category || 'other').toUpperCase()}</span>
          <span style={{ fontFamily: 'var(--phx-font-mono)', fontSize: 7, letterSpacing: '.12em', color: TEXT_DIM, border: `1px solid rgba(255,209,102,.12)`, padding: '3px 6px' }}>{fmt(item.servings)}× · {item.unit || 'serving'}</span>
          {item.already_have && <span style={{ fontFamily: 'var(--phx-font-mono)', fontSize: 7, letterSpacing: '.12em', color: CYAN, border: `1px solid rgba(255,209,102,.24)`, background: 'rgba(255,209,102,.04)', padding: '3px 6px' }}>PANTRY</span>}
        </div>
      </div>
      <div style={{ textAlign: 'right', fontFamily: 'var(--phx-font-mono)', fontSize: 8, color: TEXT_DIM }}>
        <div style={{ color: mode === 'have' ? CYAN : LIME_BR, fontSize: 12 }}><Money value={item.estimated_cost_eur} /></div>
        <div>{fmt(item.calories)} kcal</div>
        <div>{fmt(item.protein_g, 'g')} P</div>
      </div>
    </div>
  )
}

function Section({ title, subtitle, children, accent = LIME }) {
  return (
    <div style={{ margin: '14px 18px 0', border: `1px solid rgba(255,209,102,.14)`, background: 'rgba(0,0,0,.16)' }}>
      <div style={{ padding: '12px 13px', borderBottom: `1px solid rgba(255,209,102,.10)`, display: 'flex', justifyContent: 'space-between', gap: 10 }}>
        <div>
          <div style={{ fontFamily: 'var(--phx-font-mono)', fontSize: 7.5, letterSpacing: '.18em', color: accent }}>{title}</div>
          {subtitle && <div style={{ fontSize: 12, lineHeight: 1.45, color: TEXT_DIM, marginTop: 4 }}>{subtitle}</div>}
        </div>
      </div>
      <div style={{ padding: '0 13px' }}>{children}</div>
    </div>
  )
}

export default function ShoppingList({ onBack }) {
  const [source, setSource] = useState('day_plan')
  const [data, setData] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  useEffect(() => {
    async function load() {
      setLoading(true)
      setError('')
      try {
        const result = await getNutritionShoppingList(source)
        setData(result)
      } catch {
        setError('Shopping list unavailable. Start the backend and refresh.')
      }
      setLoading(false)
    }
    load()
  }, [source])

  if (loading) return <div className="phx-scope-nutrition phx-state phx-state-loading" style={{ height: '100%', background: 'var(--phx-bg)' }}><span className="code">SYNC</span><p>Building shopping list…</p></div>

  const need = data?.need_to_buy || []
  const have = data?.already_have || []
  const categories = data?.categories || {}

  return (
    <div className="phx-scope-nutrition" style={{ height: '100%', display: 'flex', flexDirection: 'column', background: 'radial-gradient(circle at 78% 4%, color-mix(in srgb, var(--phx-nutrition) 7%, transparent), transparent 34rem), linear-gradient(180deg, #081208 0%, var(--phx-bg) 42%, #04090e 100%)', color: 'rgba(220,248,236,.94)', fontFamily: 'var(--phx-font-body)' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '13px 18px 11px', borderBottom: `1px solid ${BORDER}`, position: 'sticky', top: 0, background: 'rgba(0,0,0,.96)', backdropFilter: 'blur(12px)', zIndex: 5, flexShrink: 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', flex: 1 }}>
          <span onClick={onBack} style={{ color: CYAN, fontSize: 16, marginRight: 10, cursor: 'pointer' }}>←</span>
          <span style={{ fontFamily: 'var(--phx-font-display)', fontSize: 13, fontWeight: 700, letterSpacing: '.28em', color: LIME_BR, filter: 'drop-shadow(0 0 8px rgba(157,255,111,.22))' }}>SHOPPING LIST</span>
        </div>
        <span style={{ fontFamily: 'var(--phx-font-mono)', fontSize: 8, letterSpacing: '.14em', color: LIME, border: `1px solid rgba(157,255,111,.32)`, background: 'rgba(157,255,111,.055)', padding: '2px 8px' }}>LIDL · PANTRY AWARE</span>
      </div>

      <div style={{ flex: 1, overflowY: 'auto', paddingBottom: 130 }}>
        <div style={{ padding: '18px', borderBottom: `1px solid ${BORDER}`, background: 'linear-gradient(180deg,rgba(157,255,111,.045),transparent)' }}>
          <div style={{ fontFamily: 'var(--phx-font-display)', fontSize: 32, fontWeight: 700, letterSpacing: '.08em', color: '#fff' }}>GROCERY MODE</div>
          <div style={{ fontFamily: 'var(--phx-font-mono)', fontSize: 8, letterSpacing: '.12em', color: TEXT_DIM, marginTop: 7 }}>
            Phoenix converts meal plans into a shopping list. Pantry items are separated from missing ingredients. No ordering, no purchasing.
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginTop: 12 }}>
            <button onClick={() => setSource('day_plan')} style={{ padding: '11px 0', border: `1px solid ${source === 'day_plan' ? 'rgba(157,255,111,.45)' : BORDER}`, background: source === 'day_plan' ? 'rgba(157,255,111,.09)' : 'rgba(0,0,0,.18)', color: source === 'day_plan' ? LIME : MUTED, fontFamily: 'var(--phx-font-mono)', fontSize: 8, letterSpacing: '.16em', cursor: 'pointer' }}>FROM DAY PLAN</button>
            <button onClick={() => setSource('meal_builder')} style={{ padding: '11px 0', border: `1px solid ${source === 'meal_builder' ? 'rgba(157,255,111,.45)' : BORDER}`, background: source === 'meal_builder' ? 'rgba(157,255,111,.09)' : 'rgba(0,0,0,.18)', color: source === 'meal_builder' ? LIME : MUTED, fontFamily: 'var(--phx-font-mono)', fontSize: 8, letterSpacing: '.16em', cursor: 'pointer' }}>FROM NEXT MEAL</button>
          </div>
          {data?.source_title && <div style={{ marginTop: 11, fontSize: 13, lineHeight: 1.6, color: 'rgba(220,248,236,.78)' }}>{data.source_title} · {data.principle}</div>}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: 7, marginTop: 12 }}>
            <SummaryCard label="TO BUY" value={data?.need_to_buy_count || 0} />
            <SummaryCard label="PANTRY" value={data?.already_have_count || 0} tone={CYAN} />
            <SummaryCard label="MISSING €" value={<Money value={data?.estimated_missing_cost_eur} />} />
            <SummaryCard label="FULL €" value={<Money value={data?.estimated_full_cost_eur} />} tone={TEXT_DIM} />
          </div>
        </div>

        {error && <div style={{ margin: '14px 18px 0', padding: '11px 13px', border: `1px solid rgba(255,92,122,.25)`, color: '#ff5c7a', fontFamily: 'var(--phx-font-mono)', fontSize: 10 }}>{error}</div>}

        <Section title="NEED TO BUY" subtitle={`${need.length} missing ingredients from this ${source === 'day_plan' ? 'day plan' : 'meal suggestion'}.`}>
          {need.length ? need.map(item => <ItemRow key={`${item.item_type}-${item.item_id}-${item.name}`} item={item} />) : <div style={{ padding: '13px 0', color: TEXT_DIM, fontSize: 13 }}>Nothing missing. Your pantry covers this plan.</div>}
        </Section>

        {have.length > 0 && <Section title="ALREADY HAVE" subtitle="Marked as pantry in Nutrition Memory." accent={CYAN}>
          {have.map(item => <ItemRow key={`${item.item_type}-${item.item_id}-${item.name}`} item={item} mode="have" />)}
        </Section>}

        {Object.keys(categories).length > 0 && <Section title="LIDL CATEGORIES" subtitle="Same missing ingredients grouped for shopping speed.">
          {Object.entries(categories).map(([category, items]) => (
            <div key={category} style={{ padding: '10px 0', borderBottom: `1px solid rgba(255,209,102,.08)` }}>
              <div style={{ fontFamily: 'var(--phx-font-mono)', fontSize: 8, letterSpacing: '.14em', color: LIME, marginBottom: 6 }}>{category.toUpperCase()}</div>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                {items.map(item => <span key={`${item.item_id}-${item.name}`} style={{ fontFamily: 'var(--phx-font-mono)', fontSize: 7, letterSpacing: '.1em', color: TEXT_DIM, border: `1px solid rgba(255,209,102,.12)`, padding: '4px 7px' }}>{item.name} · <Money value={item.estimated_cost_eur} /></span>)}
              </div>
            </div>
          ))}
        </Section>}

        {data?.high_protein_basket?.length > 0 && <Section title="HIGH-PROTEIN BASKET" subtitle="Missing high-protein items from this list.">
          {data.high_protein_basket.map(item => <ItemRow key={`hp-${item.item_id}-${item.name}`} item={item} />)}
        </Section>}

        {data?.budget_basket?.length > 0 && <Section title="BUDGET BASKET" subtitle="Lower-cost or staple-heavy missing ingredients.">
          {data.budget_basket.map(item => <ItemRow key={`budget-${item.item_id}-${item.name}`} item={item} />)}
        </Section>}

        <div style={{ margin: '14px 18px 16px', padding: '11px 13px', border: `1px solid rgba(255,209,102,.16)`, background: 'rgba(255,209,102,.025)' }}>
          <div style={{ fontFamily: 'var(--phx-font-mono)', fontSize: 7, letterSpacing: '.2em', color: 'rgba(157,255,111,.48)', marginBottom: 6 }}>PHOENIX SAFETY</div>
          <div style={{ fontSize: '12.5px', lineHeight: 1.65, color: 'rgba(220,248,236,.78)' }}>
            Grocery mode is a checklist only. Prices are estimates from the local Lidl staple database, and recipes may need manual ingredient review. Phoenix never purchases anything.
          </div>
        </div>
      </div>
    </div>
  )
}
