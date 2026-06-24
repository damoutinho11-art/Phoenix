import { useState, useEffect, useMemo } from 'react'
import { getRecipes } from '../../api/client'

const G = '#9dff6f'
const BG = '#0a0a0a'
const CARD = '#111'
const BORDER = '#1a1a1a'
const TEXT = '#e8e8e8'
const DIM = '#555'
const MONO = "'Share Tech Mono', monospace"
const DISPLAY = "'Oswald', 'Inter', sans-serif"

function MacroChip({ label, value, unit = 'g', color }) {
  return (
    <div style={{ textAlign: 'center' }}>
      <div style={{ fontFamily: MONO, fontSize: '14px', color: color || TEXT }}>{value}{unit}</div>
      <div style={{ fontSize: '10px', color: DIM, marginTop: '2px' }}>{label}</div>
    </div>
  )
}

export default function RecipeList({ onBack }) {
  const [allRecipes, setAllRecipes] = useState([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [category, setCategory] = useState('')
  const [maxCal, setMaxCal] = useState('')
  const [minProtein, setMinProtein] = useState('')
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

  const categories = useMemo(() =>
    [...new Set(allRecipes.map(r => r.category))].filter(Boolean).sort()
  , [allRecipes])

  const filtered = useMemo(() => {
    let list = allRecipes
    if (category) list = list.filter(r => r.category === category)
    if (maxCal)   list = list.filter(r => r.calories <= +maxCal)
    if (minProtein) list = list.filter(r => r.protein_g >= +minProtein)
    if (search)   list = list.filter(r => r.name.toLowerCase().includes(search.toLowerCase()))
    return list
  }, [allRecipes, category, maxCal, minProtein, search])

  return (
    <div style={{ height: '100%', display: 'flex', flexDirection: 'column', background: BG, color: TEXT, fontFamily: 'Inter,sans-serif' }}>
      {/* Header */}
      <div style={{ padding: '14px 16px 10px', display: 'flex', alignItems: 'center', gap: '12px', borderBottom: `1px solid ${BORDER}`, flexShrink: 0 }}>
        <button onClick={onBack} style={{ background: 'none', border: 'none', color: DIM, fontSize: '22px', cursor: 'pointer', padding: 0, lineHeight: 1 }}>‹</button>
        <span style={{ fontFamily: DISPLAY, fontSize: '13px', letterSpacing: '0.12em', color: G, fontWeight: 600 }}>RECIPES</span>
        <span style={{ fontSize: '11px', color: DIM, marginLeft: 'auto' }}>{filtered.length} / {allRecipes.length}</span>
      </div>

      {/* Search */}
      <div style={{ padding: '10px 16px', borderBottom: `1px solid ${BORDER}`, flexShrink: 0 }}>
        <input
          value={search}
          onChange={e => setSearch(e.target.value)}
          placeholder="Search recipes…"
          style={{ width: '100%', background: CARD, border: `1px solid ${BORDER}`, borderRadius: '8px', padding: '9px 12px', color: TEXT, fontSize: '14px', fontFamily: 'Inter,sans-serif', outline: 'none', boxSizing: 'border-box' }}
        />
      </div>

      {/* Filters */}
      <div style={{ display: 'flex', gap: '8px', padding: '8px 16px', overflowX: 'auto', flexShrink: 0, borderBottom: `1px solid ${BORDER}` }}>
        <select
          value={category}
          onChange={e => setCategory(e.target.value)}
          style={{ background: CARD, border: `1px solid ${BORDER}`, borderRadius: '6px', padding: '6px 8px', color: category ? G : DIM, fontSize: '12px', cursor: 'pointer', fontFamily: 'Inter,sans-serif' }}
        >
          <option value="">All categories</option>
          {categories.map(c => <option key={c} value={c}>{c}</option>)}
        </select>
        <input
          type="number"
          placeholder="≤ kcal"
          value={maxCal}
          onChange={e => setMaxCal(e.target.value)}
          style={{ width: '72px', background: CARD, border: `1px solid ${BORDER}`, borderRadius: '6px', padding: '6px 8px', color: maxCal ? G : DIM, fontSize: '12px', outline: 'none' }}
        />
        <input
          type="number"
          placeholder="≥ P (g)"
          value={minProtein}
          onChange={e => setMinProtein(e.target.value)}
          style={{ width: '72px', background: CARD, border: `1px solid ${BORDER}`, borderRadius: '6px', padding: '6px 8px', color: minProtein ? G : DIM, fontSize: '12px', outline: 'none' }}
        />
        {(category || maxCal || minProtein || search) && (
          <button
            onClick={() => { setCategory(''); setMaxCal(''); setMinProtein(''); setSearch('') }}
            style={{ background: 'none', border: `1px solid #2a2a2a`, borderRadius: '6px', padding: '6px 10px', color: DIM, fontSize: '11px', cursor: 'pointer' }}
          >Clear</button>
        )}
      </div>

      {/* List */}
      <div style={{ flex: 1, overflowY: 'auto', padding: '4px 16px 32px' }}>
        {loading ? (
          <div style={{ padding: '40px 0', textAlign: 'center', color: DIM }}>Loading…</div>
        ) : filtered.length === 0 ? (
          <div style={{ padding: '40px 0', textAlign: 'center', color: DIM }}>No recipes match.</div>
        ) : filtered.map(r => (
          <div
            key={r.id}
            onClick={() => setExpanded(expanded === r.id ? null : r.id)}
            style={{ padding: '12px 0', borderBottom: `1px solid ${BORDER}`, cursor: 'pointer' }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: '8px' }}>
              <div style={{ fontSize: '14px', color: TEXT, flex: 1 }}>{r.name}</div>
              <div style={{ fontSize: '12px', color: G, fontFamily: MONO, flexShrink: 0 }}>{r.protein_g}g P</div>
            </div>
            <div style={{ fontSize: '12px', color: DIM, marginTop: '3px', fontFamily: MONO }}>
              {r.calories} kcal{r.category ? <span style={{ color: '#3a3a3a', marginLeft: '8px' }}>{r.category}</span> : null}
            </div>

            {expanded === r.id && (
              <div style={{ marginTop: '10px', background: CARD, borderRadius: '8px', padding: '12px 14px' }}>
                <div style={{ display: 'flex', gap: '20px', flexWrap: 'wrap' }}>
                  <MacroChip label="Protein"  value={r.protein_g} color={G} />
                  <MacroChip label="Carbs"    value={r.carbs_g} />
                  <MacroChip label="Fat"      value={r.fat_g} />
                  {r.fiber_g > 0 && <MacroChip label="Fibre" value={r.fiber_g} />}
                  <MacroChip label="kcal" value={r.calories} unit="" />
                </div>
                {r.serving && (
                  <div style={{ fontSize: '11px', color: DIM, marginTop: '10px' }}>Serving: {r.serving}</div>
                )}
                {r.page && (
                  <div style={{ fontSize: '11px', color: DIM, marginTop: '2px' }}>Page {r.page}</div>
                )}
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  )
}
