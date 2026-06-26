import { useState, useEffect, useMemo } from 'react'
import { getRecipes } from '../../api/client'

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
    if (category)   list = list.filter(r => r.category === category)
    if (maxCal)     list = list.filter(r => r.calories <= +maxCal)
    if (minProtein) list = list.filter(r => r.protein_g >= +minProtein)
    if (search)     list = list.filter(r => r.name.toLowerCase().includes(search.toLowerCase()))
    return list
  }, [allRecipes, category, maxCal, minProtein, search])

  return (
    <div style={{ height: '100%', display: 'flex', flexDirection: 'column', background: 'transparent', color: 'var(--text)', fontFamily: 'var(--body)' }}>
      {/* Header */}
      <div style={{ padding: '14px 16px 10px', display: 'flex', alignItems: 'center', gap: 12, borderBottom: '1px solid var(--line)', flexShrink: 0 }}>
        <button onClick={onBack} className="action ghost" style={{ padding: '6px 10px', fontSize: 14 }}>←</button>
        <span style={{ fontFamily: 'var(--display)', fontSize: 13, letterSpacing: '.12em', color: 'var(--accent-nutrition)' }}>RECIPES</span>
        <span style={{ fontFamily: 'var(--mono)', fontSize: 11, color: 'var(--muted)', marginLeft: 'auto' }}>
          {filtered.length} / {allRecipes.length}
        </span>
      </div>

      {/* Search */}
      <div style={{ padding: '10px 16px', borderBottom: '1px solid var(--line)', flexShrink: 0 }}>
        <input
          value={search}
          onChange={e => setSearch(e.target.value)}
          placeholder="Search recipes…"
          style={{
            width: '100%', background: 'rgba(1,10,13,.7)',
            border: '1px solid var(--line)',
            padding: '9px 12px', color: 'var(--text)', fontSize: 13,
            fontFamily: 'var(--body)', outline: 'none', boxSizing: 'border-box',
          }}
        />
      </div>

      {/* Filters */}
      <div style={{ display: 'flex', gap: 8, padding: '8px 16px', overflowX: 'auto', flexShrink: 0, borderBottom: '1px solid var(--line)' }}>
        <select
          value={category}
          onChange={e => setCategory(e.target.value)}
          style={{
            background: 'rgba(1,10,13,.7)', border: '1px solid var(--line)',
            padding: '6px 8px', color: category ? 'var(--accent-nutrition)' : 'var(--muted)',
            fontSize: 11, cursor: 'pointer', fontFamily: 'var(--body)',
          }}
        >
          <option value="">All categories</option>
          {categories.map(c => <option key={c} value={c}>{c}</option>)}
        </select>
        <input
          type="number"
          placeholder="≤ kcal"
          value={maxCal}
          onChange={e => setMaxCal(e.target.value)}
          style={{
            width: 72, background: 'rgba(1,10,13,.7)', border: '1px solid var(--line)',
            padding: '6px 8px', color: maxCal ? 'var(--accent-nutrition)' : 'var(--muted)',
            fontSize: 11, outline: 'none',
          }}
        />
        <input
          type="number"
          placeholder="≥ P (g)"
          value={minProtein}
          onChange={e => setMinProtein(e.target.value)}
          style={{
            width: 72, background: 'rgba(1,10,13,.7)', border: '1px solid var(--line)',
            padding: '6px 8px', color: minProtein ? 'var(--accent-nutrition)' : 'var(--muted)',
            fontSize: 11, outline: 'none',
          }}
        />
        {(category || maxCal || minProtein || search) && (
          <button
            onClick={() => { setCategory(''); setMaxCal(''); setMinProtein(''); setSearch('') }}
            className="action ghost"
            style={{ padding: '4px 10px', fontSize: 10 }}
          >CLEAR</button>
        )}
      </div>

      {/* List */}
      <div style={{ flex: 1, overflowY: 'auto', padding: '4px 16px 32px' }}>
        {loading ? (
          <div style={{ padding: '40px 0', textAlign: 'center', color: 'var(--dim)', fontFamily: 'var(--mono)', fontSize: 12 }}>Loading…</div>
        ) : filtered.length === 0 ? (
          <div style={{ padding: '40px 0', textAlign: 'center', color: 'var(--dim)', fontFamily: 'var(--mono)', fontSize: 12 }}>No recipes match.</div>
        ) : filtered.map(r => (
          <div
            key={r.id}
            onClick={() => setExpanded(expanded === r.id ? null : r.id)}
            style={{ borderBottom: '1px solid var(--line)', cursor: 'pointer' }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: 8, padding: '12px 0 6px' }}>
              <div style={{ fontFamily: 'var(--body)', fontSize: 13, color: 'var(--text)', flex: 1 }}>{r.name}</div>
              <div style={{ fontFamily: 'var(--mono)', fontSize: 12, color: 'var(--accent-nutrition)', flexShrink: 0 }}>{r.protein_g}g P</div>
            </div>
            <div style={{ fontFamily: 'var(--mono)', fontSize: 10, color: 'var(--muted)', paddingBottom: 10 }}>
              {r.calories} kcal
              {r.category && <span style={{ color: 'var(--dim)', marginLeft: 10 }}>{r.category}</span>}
            </div>

            {expanded === r.id && (
              <div className="glass" style={{ padding: '12px 14px', marginBottom: 12 }}>
                <div style={{ display: 'flex', gap: 20, flexWrap: 'wrap' }}>
                  {[
                    { label: 'Protein', value: r.protein_g, color: 'var(--accent-nutrition)' },
                    { label: 'Carbs',   value: r.carbs_g },
                    { label: 'Fat',     value: r.fat_g },
                    ...(r.fiber_g > 0 ? [{ label: 'Fibre', value: r.fiber_g }] : []),
                    { label: 'kcal',    value: r.calories, unit: '' },
                  ].map(({ label, value, color, unit = 'g' }) => (
                    <div key={label} style={{ textAlign: 'center' }}>
                      <div style={{ fontFamily: 'var(--mono)', fontSize: 15, color: color || 'var(--text)' }}>{value}{unit}</div>
                      <div style={{ fontFamily: 'var(--body)', fontSize: 10, color: 'var(--muted)', marginTop: 2 }}>{label}</div>
                    </div>
                  ))}
                </div>
                {r.serving && (
                  <div style={{ fontFamily: 'var(--body)', fontSize: 11, color: 'var(--dim)', marginTop: 10 }}>Serving: {r.serving}</div>
                )}
                {r.page && (
                  <div style={{ fontFamily: 'var(--body)', fontSize: 11, color: 'var(--dim)', marginTop: 2 }}>Page {r.page}</div>
                )}
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  )
}
