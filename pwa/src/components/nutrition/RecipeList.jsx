import { useState, useEffect, useMemo } from 'react'
import { getRecipes } from '../../api/client'

const LIME = '#9dff6f'
const LIME_BR = '#d5ffc7'
const BORDER = 'rgba(32,216,236,.18)'
const MUTED = 'rgba(32,216,236,.38)'
const TEXT_DIM = 'rgba(158,204,190,.58)'

const PROTO_RECIPES = [
  { id: 'p1', name: 'Chicken Burrito Bowl', meta: 'CHICKEN · RICE · BEANS · SALSA · YOGURT SAUCE', tags: ['52G PROTEIN', 'FAST'], kcal: 760, protein_g: 52 },
  { id: 'p2', name: 'Salmon Potato Plate',  meta: 'SALMON · POTATO · GREENS · OLIVE OIL',          tags: ['46G PROTEIN', 'RECOVERY'], kcal: 790, protein_g: 46 },
  { id: 'p3', name: 'Turkey Pasta',         meta: 'TURKEY MINCE · PASTA · TOMATO · PARMESAN',       tags: ['58G PROTEIN', 'TRAINING DAY'], kcal: 820, protein_g: 58 },
  { id: 'p4', name: 'Greek Yogurt Stack',   meta: 'YOGURT · GRANOLA · WHEY · BERRIES',              tags: ['44G PROTEIN', 'LIGHT'], kcal: 610, protein_g: 44 },
]

const FILTERS = ['MATCH TODAY', 'HIGH PROTEIN', 'FAST', 'CHEAP', 'PREP']

export default function RecipeList({ onBack }) {
  const [allRecipes, setAllRecipes] = useState([])
  const [loading, setLoading] = useState(true)
  const [activeFilter, setActiveFilter] = useState('MATCH TODAY')
  const [expanded, setExpanded] = useState(null)

  useEffect(() => {
    async function load() {
      try {
        const data = await getRecipes()
        setAllRecipes(data.recipes || [])
      } catch {}
      setLoading(false)
    }
    load()
  }, [])

  // Use API data if available, otherwise prototype data
  const displayRecipes = allRecipes.length > 0
    ? allRecipes.slice(0, 8).map(r => ({
        id: r.id,
        name: r.name,
        meta: r.category || '',
        tags: [`${r.protein_g}G PROTEIN`],
        kcal: r.calories,
        protein_g: r.protein_g,
        carbs_g: r.carbs_g,
        fat_g: r.fat_g,
      }))
    : PROTO_RECIPES

  return (
    <div style={{ height: '100%', display: 'flex', flexDirection: 'column', background: '#000', color: 'rgba(220,248,236,.94)', fontFamily: "'Saira Condensed',sans-serif" }}>
      {/* TOP BAR */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '13px 18px 11px', borderBottom: `1px solid ${BORDER}`, position: 'sticky', top: 0, background: 'rgba(0,0,0,.96)', backdropFilter: 'blur(12px)', zIndex: 5, flexShrink: 0 }}>
        <div style={{ display: 'flex', alignItems: 'center' }}>
          <span onClick={onBack} style={{ color: '#20d8ec', fontSize: 16, marginRight: 10, cursor: 'pointer' }}>←</span>
          <span style={{ fontFamily: 'var(--display)', fontSize: 13, fontWeight: 700, letterSpacing: '.28em', color: LIME_BR, filter: 'drop-shadow(0 0 8px rgba(157,255,111,.22))' }}>RECIPES</span>
        </div>
        <span style={{ fontFamily: 'var(--mono)', fontSize: 8, letterSpacing: '.14em', color: LIME, border: `1px solid rgba(157,255,111,.32)`, background: 'rgba(157,255,111,.055)', padding: '2px 8px' }}>
          780 KCAL LEFT
        </span>
      </div>

      <div style={{ flex: 1, overflowY: 'auto' }}>
        {/* HERO */}
        <div style={{ padding: '18px', borderBottom: `1px solid ${BORDER}`, background: 'linear-gradient(180deg,rgba(157,255,111,.04),transparent)' }}>
          <div style={{ fontFamily: 'var(--display)', fontSize: 32, fontWeight: 700, letterSpacing: '.08em', color: '#fff', filter: 'drop-shadow(0 0 14px rgba(157,255,111,.28))' }}>DINNER OPTIONS</div>
          <div style={{ fontFamily: 'var(--mono)', fontSize: 8, letterSpacing: '.12em', color: TEXT_DIM, lineHeight: 1.7, marginTop: 6 }}>
            Matched to today: high protein, moderate carbs, cut-phase friendly.
          </div>
        </div>

        {/* FILTER TABS */}
        <div style={{ display: 'flex', gap: 6, overflowX: 'auto', padding: '10px 18px', borderBottom: `1px solid ${BORDER}` }}>
          {FILTERS.map(f => (
            <button
              key={f}
              onClick={() => setActiveFilter(f)}
              style={{
                flexShrink: 0, fontFamily: 'var(--mono)', fontSize: 8, letterSpacing: '.16em',
                border: `1px solid ${f === activeFilter ? 'rgba(157,255,111,.34)' : BORDER}`,
                padding: '7px 10px', background: f === activeFilter ? 'rgba(157,255,111,.055)' : 'none',
                color: f === activeFilter ? LIME : MUTED, cursor: 'pointer',
              }}
            >
              {f}
            </button>
          ))}
        </div>

        {/* RECIPE LIST */}
        <div>
          {loading && allRecipes.length === 0 ? (
            <div style={{ padding: '40px', textAlign: 'center', color: MUTED, fontFamily: 'var(--mono)', fontSize: 12 }}>Loading…</div>
          ) : displayRecipes.map((r, i) => (
            <div
              key={r.id}
              onClick={() => setExpanded(expanded === r.id ? null : r.id)}
              style={{ padding: '14px 16px', borderBottom: `1px solid rgba(32,216,236,.08)`, display: 'grid', gridTemplateColumns: '1fr 72px', gap: 12, cursor: 'pointer' }}
            >
              <div>
                <div style={{ fontFamily: 'var(--display)', fontSize: 18, fontWeight: 700, letterSpacing: '.05em', color: '#fff' }}>{r.name}</div>
                <div style={{ fontFamily: 'var(--mono)', fontSize: 7, letterSpacing: '.1em', color: TEXT_DIM, marginTop: 4, lineHeight: 1.6 }}>{r.meta}</div>
                <div style={{ display: 'flex', gap: 5, flexWrap: 'wrap', marginTop: 8 }}>
                  {r.tags?.map(t => (
                    <span key={t} style={{ fontFamily: 'var(--mono)', fontSize: 7, letterSpacing: '.1em', color: LIME, border: `1px solid rgba(157,255,111,.22)`, padding: '2px 6px', background: 'rgba(157,255,111,.035)' }}>{t}</span>
                  ))}
                </div>
                {expanded === r.id && r.carbs_g && (
                  <div style={{ display: 'flex', gap: 16, marginTop: 12 }}>
                    {[
                      { label: 'CARBS', val: `${r.carbs_g}g` },
                      { label: 'FAT', val: `${r.fat_g}g` },
                    ].map(({ label, val }) => (
                      <div key={label}>
                        <div style={{ fontFamily: 'var(--mono)', fontSize: 9, color: MUTED, letterSpacing: '.1em', marginBottom: 2 }}>{label}</div>
                        <div style={{ fontFamily: 'var(--display)', fontSize: 14, color: '#fff' }}>{val}</div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
              <div>
                <div style={{ fontFamily: 'var(--display)', fontSize: 24, fontWeight: 700, color: LIME_BR, textAlign: 'right', lineHeight: 1 }}>{r.kcal}</div>
                <div style={{ fontFamily: 'var(--mono)', fontSize: 7, color: MUTED, textAlign: 'right', marginTop: 4 }}>KCAL</div>
              </div>
            </div>
          ))}
        </div>

        {/* PHOENIX NOTE */}
        <div style={{ margin: '14px 18px 32px', padding: '11px 13px', border: `1px solid rgba(32,216,236,.16)`, borderLeft: `3px solid ${LIME}`, background: 'rgba(157,255,111,.025)' }}>
          <div style={{ fontFamily: 'var(--mono)', fontSize: 7, letterSpacing: '.2em', color: 'rgba(157,255,111,.48)', marginBottom: 6 }}>PHOENIX RECIPE LOGIC</div>
          <div style={{ fontSize: '12.5px', lineHeight: 1.65, color: 'rgba(220,248,236,.78)' }}>
            Recipes are selected by the day's remaining calories, protein gap, training load, and preparation time.
          </div>
        </div>
      </div>
    </div>
  )
}
