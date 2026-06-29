import { useState, useEffect, useMemo } from 'react'
import { getRecipes, getNutritionStatus } from '../../api/client'

const LIME = '#9dff6f'
const LIME_BR = '#d5ffc7'
const BORDER = 'rgba(32,216,236,.18)'
const MUTED = 'rgba(32,216,236,.38)'
const TEXT_DIM = 'rgba(158,204,190,.58)'

const FILTERS = ['MATCH TODAY', 'HIGH PROTEIN', 'CHEAP']
const DISABLED_FILTERS = ['FAST', 'PREP']

function normalizeRecipe(r) {
  return {
    id: r.id,
    name: r.name,
    meta: r.category || r.serving || '',
    serving: r.serving || '',
    source_serving: r.source_serving || r.serving || '',
    serving_count: Number(r.serving_count || 1),
    serving_basis: r.serving_basis || 'single_serving',
    is_batch_recipe: Boolean(r.is_batch_recipe),
    kcal: Number(r.calories || 0),
    protein_g: Number(r.protein_g || 0),
    carbs_g: Number(r.carbs_g || 0),
    fat_g: Number(r.fat_g || 0),
    fiber_g: Number(r.fiber_g || 0),
    full_kcal: Number(r.full_calories || r.calories || 0),
    full_protein_g: Number(r.full_protein_g || r.protein_g || 0),
    full_carbs_g: Number(r.full_carbs_g || r.carbs_g || 0),
    full_fat_g: Number(r.full_fat_g || r.fat_g || 0),
    category: (r.category || '').toLowerCase(),
    api_tags: Array.isArray(r.tags) ? r.tags : [],
    portion_unit: r.portion_unit || '',
    serving_note: r.serving_note || '',
  }
}

function recipeScore(recipe, status, filter) {
  const kcalLeft = Math.max(0, status?.remaining_calories ?? 9999)
  const proteinLeft = Math.max(0, status?.remaining_protein_g ?? 80)
  const carbLeft = Math.max(0, status?.remaining_carbs_g ?? 200)
  const proteinDensity = recipe.kcal > 0 ? recipe.protein_g / recipe.kcal : 0
  let score = proteinDensity * 1000

  if (filter === 'HIGH PROTEIN') return recipe.protein_g * 10 + proteinDensity * 500
  if (filter === 'CHEAP') {
    const cheapHit = /egg|oat|rice|potato|beans|lentil|tuna|yogurt|chicken|cottage/i.test(recipe.name + ' ' + recipe.meta)
    return (cheapHit ? 300 : 0) + recipe.protein_g * 3 - recipe.kcal / 20
  }

  score += recipe.kcal <= kcalLeft ? 220 : -Math.min(220, (recipe.kcal - kcalLeft) / 3)
  score += Math.max(0, 80 - Math.abs(recipe.protein_g - Math.min(proteinLeft, 55)))
  if (status?.is_training_day) {
    score += recipe.carbs_g <= carbLeft ? 40 : -20
    score += recipe.carbs_g >= 35 ? 25 : 0
  } else {
    score += recipe.carbs_g <= Math.max(60, carbLeft) ? 35 : -35
  }
  if (recipe.is_batch_recipe) score += 35
  if (recipe.full_kcal > 1800) score -= 20
  if (recipe.kcal > 850) score -= 80
  return score
}

export default function RecipeList({ onBack }) {
  const [allRecipes, setAllRecipes] = useState([])
  const [status, setStatus] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [activeFilter, setActiveFilter] = useState('MATCH TODAY')
  const [expanded, setExpanded] = useState(null)

  useEffect(() => {
    async function load() {
      setLoading(true)
      setError(null)
      try {
        const [recipesData, statusData] = await Promise.all([getRecipes(), getNutritionStatus()])
        setAllRecipes((recipesData.recipes || []).map(normalizeRecipe))
        setStatus(statusData)
      } catch {
        setError('Recipe data unavailable. No prototype meals shown.')
      }
      setLoading(false)
    }
    load()
  }, [])

  const displayRecipes = useMemo(() => {
    const filtered = allRecipes.filter(r => {
      if (activeFilter === 'HIGH PROTEIN') return r.protein_g >= 35
      if (activeFilter === 'CHEAP') return /egg|oat|rice|potato|beans|lentil|tuna|yogurt|chicken|cottage/i.test(r.name + ' ' + r.meta)
      return true
    })
    return [...filtered]
      .sort((a, b) => recipeScore(b, status, activeFilter) - recipeScore(a, status, activeFilter))
      .slice(0, 12)
      .map(r => ({
        ...r,
        tags: [
          ...r.api_tags,
          `${Math.round(r.protein_g)}G PROTEIN`,
          r.kcal <= Math.max(0, status?.remaining_calories ?? 0) ? 'FITS TODAY' : 'CHECK SERVING',
          status?.is_training_day && r.carbs_g >= 35 ? 'TRAINING CARBS' : null,
        ].filter(Boolean).filter((t, i, arr) => arr.indexOf(t) === i).slice(0, 6),
      }))
  }, [allRecipes, status, activeFilter])

  const kcalLeft = Math.max(0, Math.round(status?.remaining_calories || 0))
  const proteinLeft = Math.max(0, Math.round(status?.remaining_protein_g || 0))

  return (
    <div style={{ height: '100%', display: 'flex', flexDirection: 'column', background: '#000', color: 'rgba(220,248,236,.94)', fontFamily: "'Saira Condensed',sans-serif" }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '13px 18px 11px', borderBottom: `1px solid ${BORDER}`, position: 'sticky', top: 0, background: 'rgba(0,0,0,.96)', backdropFilter: 'blur(12px)', zIndex: 5, flexShrink: 0 }}>
        <div style={{ display: 'flex', alignItems: 'center' }}>
          <span onClick={onBack} style={{ color: '#20d8ec', fontSize: 16, marginRight: 10, cursor: 'pointer' }}>←</span>
          <span style={{ fontFamily: 'var(--display)', fontSize: 13, fontWeight: 700, letterSpacing: '.28em', color: LIME_BR, filter: 'drop-shadow(0 0 8px rgba(157,255,111,.22))' }}>RECIPES</span>
        </div>
        <span style={{ fontFamily: 'var(--mono)', fontSize: 8, letterSpacing: '.14em', color: LIME, border: `1px solid rgba(157,255,111,.32)`, background: 'rgba(157,255,111,.055)', padding: '2px 8px' }}>
          {status ? `${kcalLeft} KCAL · ${proteinLeft}G P` : 'LIVE TARGET'}
        </span>
      </div>

      <div style={{ flex: 1, overflowY: 'auto' }}>
        <div style={{ padding: '18px', borderBottom: `1px solid ${BORDER}`, background: 'linear-gradient(180deg,rgba(157,255,111,.04),transparent)' }}>
          <div style={{ fontFamily: 'var(--display)', fontSize: 32, fontWeight: 700, letterSpacing: '.08em', color: '#fff', filter: 'drop-shadow(0 0 14px rgba(157,255,111,.28))' }}>NEXT MEAL OPTIONS</div>
          <div style={{ fontFamily: 'var(--mono)', fontSize: 8, letterSpacing: '.12em', color: TEXT_DIM, lineHeight: 1.7, marginTop: 6 }}>
            Ranked by loggable serving, not full batch. Batch recipes show per-serving macros so a 3000 kcal bake is never treated as one meal.
          </div>
        </div>

        <div style={{ display: 'flex', gap: 6, overflowX: 'auto', padding: '10px 18px', borderBottom: `1px solid ${BORDER}` }}>
          {FILTERS.map(f => (
            <button key={f} onClick={() => setActiveFilter(f)} style={{ flexShrink: 0, fontFamily: 'var(--mono)', fontSize: 8, letterSpacing: '.16em', border: `1px solid ${f === activeFilter ? 'rgba(157,255,111,.34)' : BORDER}`, padding: '7px 10px', background: f === activeFilter ? 'rgba(157,255,111,.055)' : 'none', color: f === activeFilter ? LIME : MUTED, cursor: 'pointer' }}>{f}</button>
          ))}
          {DISABLED_FILTERS.map(f => (
            <button key={f} disabled title="Recipe metadata not available yet" style={{ flexShrink: 0, fontFamily: 'var(--mono)', fontSize: 8, letterSpacing: '.16em', border: `1px solid rgba(32,216,236,.08)`, padding: '7px 10px', background: 'none', color: 'rgba(32,216,236,.18)', cursor: 'not-allowed' }}>{f}</button>
          ))}
        </div>

        <div>
          {loading ? (
            <div style={{ padding: '40px', textAlign: 'center', color: MUTED, fontFamily: 'var(--mono)', fontSize: 12 }}>Loading recipes…</div>
          ) : error ? (
            <div style={{ padding: '40px 24px', textAlign: 'center', color: MUTED, fontFamily: 'var(--mono)', fontSize: 11, lineHeight: 1.7 }}>{error}</div>
          ) : displayRecipes.length === 0 ? (
            <div style={{ padding: '40px 24px', textAlign: 'center', color: MUTED, fontFamily: 'var(--mono)', fontSize: 11, lineHeight: 1.7 }}>No recipes match this filter with the current dataset.</div>
          ) : displayRecipes.map(r => (
            <div key={r.id} onClick={() => setExpanded(expanded === r.id ? null : r.id)} style={{ padding: '14px 16px', borderBottom: `1px solid rgba(32,216,236,.08)`, display: 'grid', gridTemplateColumns: '1fr 72px', gap: 12, cursor: 'pointer' }}>
              <div>
                <div style={{ fontFamily: 'var(--display)', fontSize: 18, fontWeight: 700, letterSpacing: '.05em', color: '#fff' }}>{r.name}</div>
                <div style={{ fontFamily: 'var(--mono)', fontSize: 7, letterSpacing: '.1em', color: TEXT_DIM, marginTop: 4, lineHeight: 1.6 }}>
                  {r.meta}{r.serving ? ` · ${r.serving}` : ''}{r.is_batch_recipe ? ` · full batch ${Math.round(r.full_kcal)} kcal` : ''}
                </div>
                <div style={{ display: 'flex', gap: 5, flexWrap: 'wrap', marginTop: 8 }}>
                  {r.tags.map(t => <span key={t} style={{ fontFamily: 'var(--mono)', fontSize: 7, letterSpacing: '.1em', color: LIME, border: `1px solid rgba(157,255,111,.22)`, padding: '2px 6px', background: 'rgba(157,255,111,.035)' }}>{t}</span>)}
                </div>
                {expanded === r.id && (
                  <div style={{ display: 'flex', gap: 16, marginTop: 12 }}>
                    {[
                      { label: 'CARBS', val: `${Math.round(r.carbs_g)}g` },
                      { label: 'FAT', val: `${Math.round(r.fat_g)}g` },
                      { label: 'FIBER', val: `${Math.round(r.fiber_g)}g` },
                      { label: r.is_batch_recipe ? 'FULL BATCH' : 'SERVING', val: r.is_batch_recipe ? `${Math.round(r.full_kcal)} kcal` : 'single' },
                    ].map(({ label, val }) => <div key={label}><div style={{ fontFamily: 'var(--mono)', fontSize: 9, color: MUTED, letterSpacing: '.1em', marginBottom: 2 }}>{label}</div><div style={{ fontFamily: 'var(--display)', fontSize: 14, color: '#fff' }}>{val}</div></div>)}
                  </div>
                )}
              </div>
              <div>
                <div style={{ fontFamily: 'var(--display)', fontSize: 24, fontWeight: 700, color: LIME_BR, textAlign: 'right', lineHeight: 1 }}>{Math.round(r.kcal)}</div>
                <div style={{ fontFamily: 'var(--mono)', fontSize: 7, color: MUTED, textAlign: 'right', marginTop: 4 }}>KCAL</div>
              </div>
            </div>
          ))}
        </div>

        <div style={{ margin: '14px 18px 32px', padding: '11px 13px', border: `1px solid rgba(32,216,236,.16)`, borderLeft: `3px solid ${LIME}`, background: 'rgba(157,255,111,.025)' }}>
          <div style={{ fontFamily: 'var(--mono)', fontSize: 7, letterSpacing: '.2em', color: 'rgba(157,255,111,.48)', marginBottom: 6 }}>PHOENIX RECIPE LOGIC</div>
          <div style={{ fontSize: '12.5px', lineHeight: 1.65, color: 'rgba(220,248,236,.78)' }}>
            Recipe macros are now shown per loggable serving. Full-batch calories remain visible for meal prep, while FAST/PREP filters stay disabled until the dataset has real prep-time metadata.
          </div>
        </div>
      </div>
    </div>
  )
}
