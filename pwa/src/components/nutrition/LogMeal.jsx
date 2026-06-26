import { useState, useEffect, useMemo } from 'react'
import { getRecipes, getLidlStaples, logMeal, lookupBarcode } from '../../api/client'
import BarcodeScanner from '../BarcodeScanner'

export default function LogMeal({ onBack, onSuccess }) {
  const [tab, setTab] = useState('recipes')
  const [recipes, setRecipes] = useState([])
  const [staples, setStaples] = useState([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [selected, setSelected] = useState(null)
  const [servings, setServings] = useState(1)
  const [logging, setLogging] = useState(false)
  const [error, setError] = useState('')
  const [scannerOpen, setScannerOpen] = useState(false)
  const [scanState, setScanState] = useState(null)

  useEffect(() => {
    async function load() {
      try {
        const [rData, sData] = await Promise.all([getRecipes(), getLidlStaples()])
        setRecipes(rData.recipes || [])
        setStaples(sData.staples || [])
      } catch {}
      setLoading(false)
    }
    load()
  }, [])

  const items = tab === 'recipes' ? recipes : staples

  const filtered = useMemo(() => {
    if (!search.trim()) return items
    const q = search.toLowerCase()
    return items.filter(i => i.name.toLowerCase().includes(q))
  }, [items, search])

  function selectItem(item) {
    setSelected(item)
    setServings(1)
    setError('')
  }

  function adjustServings(delta) {
    setServings(s => Math.max(0.5, +(s + delta).toFixed(1)))
  }

  async function handleBarcode(code) {
    setScannerOpen(false)
    setScanState('scanning')
    setError('')
    try {
      const product = await lookupBarcode(code)
      setScanState(null)
      setSelected({
        id: `barcode-${code}`,
        name: product.name,
        calories: product.calories,
        protein_g: product.protein_g,
        fat_g: product.fat_g,
        carbs_g: product.carbs_g,
        source: 'barcode',
      })
      setServings(1)
    } catch {
      setScanState('not_found')
      setTimeout(() => setScanState(null), 3000)
    }
  }

  async function handleLog() {
    if (!selected) return
    setLogging(true)
    setError('')
    try {
      const isBarcode = selected.source === 'barcode'
      await logMeal({
        item_id: String(selected.id),
        item_type: isBarcode ? 'barcode' : tab === 'recipes' ? 'recipe' : 'staple',
        name: selected.name,
        servings,
        calories:   +(selected.calories   * servings).toFixed(1),
        protein_g:  +(selected.protein_g  * servings).toFixed(1),
        fat_g:      +(selected.fat_g      * servings).toFixed(1),
        carbs_g:    +(selected.carbs_g    * servings).toFixed(1),
        source: isBarcode ? 'barcode' : tab === 'recipes' ? 'recipe' : 'lidl_staple',
      })
      onSuccess()
    } catch {
      setError('Log failed — try again.')
      setLogging(false)
    }
  }

  const scaledCal  = selected ? Math.round(selected.calories  * servings) : 0
  const scaledProt = selected ? +(selected.protein_g * servings).toFixed(1) : 0

  return (
    <div style={{ height: '100%', display: 'flex', flexDirection: 'column', background: 'transparent', color: 'var(--text)', fontFamily: 'var(--body)' }}>
      {/* Header */}
      <div style={{ padding: '14px 16px 10px', display: 'flex', alignItems: 'center', gap: 12, borderBottom: '1px solid var(--line)', flexShrink: 0 }}>
        <button onClick={onBack} className="action ghost" style={{ padding: '6px 10px', fontSize: 14 }}>←</button>
        <span style={{ fontFamily: 'var(--display)', fontSize: 13, letterSpacing: '.12em', color: 'var(--accent-nutrition)', flex: 1 }}>
          LOG MEAL
        </span>
        {scanState === 'scanning' && (
          <span style={{ fontFamily: 'var(--mono)', fontSize: 10, color: 'var(--muted)' }}>scanning…</span>
        )}
        {scanState === 'not_found' && (
          <span style={{ fontFamily: 'var(--mono)', fontSize: 10, color: 'var(--red)' }}>not found</span>
        )}
        <button
          onClick={() => { setScannerOpen(o => !o); setScanState(null) }}
          className={`action${scannerOpen ? '' : ' ghost'}`}
          style={scannerOpen ? { borderColor: 'var(--accent-nutrition)', color: 'var(--accent-nutrition)' } : {}}
          title="Scan barcode"
        >▣</button>
      </div>

      {/* Barcode scanner */}
      {scannerOpen && (
        <BarcodeScanner
          onDetected={handleBarcode}
          onClose={() => setScannerOpen(false)}
        />
      )}

      {/* Tabs */}
      <div style={{ display: 'flex', borderBottom: '1px solid var(--line)', flexShrink: 0 }}>
        {['recipes', 'staples'].map(t => (
          <button key={t} onClick={() => { setTab(t); setSelected(null); setSearch('') }}
            style={{
              flex: 1, padding: '10px 0', background: 'none', border: 'none',
              borderBottom: tab === t ? '2px solid var(--accent-nutrition)' : '2px solid transparent',
              color: tab === t ? 'var(--accent-nutrition)' : 'var(--muted)',
              fontSize: 11, letterSpacing: '.1em',
              fontFamily: 'var(--display)', cursor: 'pointer',
            }}>
            {t.toUpperCase()}
          </button>
        ))}
      </div>

      {/* Search */}
      <div style={{ padding: '10px 16px', borderBottom: '1px solid var(--line)', flexShrink: 0 }}>
        <input
          value={search}
          onChange={e => setSearch(e.target.value)}
          placeholder={`Search ${tab}…`}
          style={{
            width: '100%', background: 'rgba(1,10,13,.7)',
            border: '1px solid var(--line)',
            padding: '9px 12px', color: 'var(--text)', fontSize: 13,
            fontFamily: 'var(--body)', outline: 'none', boxSizing: 'border-box',
          }}
        />
      </div>

      {/* Selected + serving adjuster */}
      {selected && (
        <div style={{ padding: '12px 16px', background: 'rgba(125,255,207,.04)', borderBottom: '1px solid rgba(125,255,207,.15)', flexShrink: 0 }}>
          <div style={{ fontFamily: 'var(--body)', fontSize: 13, color: 'var(--text)', marginBottom: 10, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {selected.name}
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <button onClick={() => adjustServings(-0.5)} className="action ghost" style={{ width: 34, height: 34, fontSize: 20, color: 'var(--accent-nutrition)', padding: 0 }}>−</button>
            <span style={{ fontFamily: 'var(--mono)', fontSize: 20, color: 'var(--text)', minWidth: 38, textAlign: 'center' }}>{servings}</span>
            <button onClick={() => adjustServings(0.5)} className="action ghost" style={{ width: 34, height: 34, fontSize: 20, color: 'var(--accent-nutrition)', padding: 0 }}>+</button>
            <span style={{ fontFamily: 'var(--mono)', fontSize: 11, color: 'var(--muted)', marginLeft: 4 }}>
              {scaledCal} kcal · {scaledProt}g P
            </span>
            <button
              onClick={handleLog}
              disabled={logging}
              className={`action safe${logging ? ' ghost' : ''}`}
              style={{ marginLeft: 'auto' }}
            >
              {logging ? '…' : 'LOG'}
            </button>
          </div>
          {error && <div style={{ fontFamily: 'var(--mono)', fontSize: 11, color: 'var(--red)', marginTop: 6 }}>{error}</div>}
        </div>
      )}

      {/* Item list */}
      <div style={{ flex: 1, overflowY: 'auto', padding: '4px 16px 32px' }}>
        {loading ? (
          <div style={{ padding: '40px 0', textAlign: 'center', color: 'var(--dim)', fontFamily: 'var(--mono)', fontSize: 12 }}>Loading…</div>
        ) : filtered.length === 0 ? (
          <div style={{ padding: '40px 0', textAlign: 'center', color: 'var(--dim)', fontFamily: 'var(--mono)', fontSize: 12 }}>Nothing found.</div>
        ) : filtered.map(item => {
          const isSelected = selected?.id === item.id && selected?.name === item.name
          return (
            <div key={`${tab}-${item.id}`} onClick={() => selectItem(item)}
              style={{
                padding: '12px 0 12px',
                paddingLeft: isSelected ? 10 : 0,
                borderBottom: '1px solid var(--line)',
                borderLeft: isSelected ? '3px solid var(--accent-nutrition)' : '3px solid transparent',
                cursor: 'pointer',
              }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: 8 }}>
                <div style={{ fontFamily: 'var(--body)', fontSize: 13, color: 'var(--text)', flex: 1 }}>{item.name}</div>
                <div style={{ fontFamily: 'var(--mono)', fontSize: 12, color: 'var(--accent-nutrition)', flexShrink: 0 }}>{item.protein_g}g P</div>
              </div>
              <div style={{ fontFamily: 'var(--mono)', fontSize: 10, color: 'var(--muted)', marginTop: 2 }}>
                {item.calories} kcal
                {tab === 'staples' && item.unit ? ` / ${item.unit}` : ''}
                {tab === 'staples' && item.price_eur ? ` · €${item.price_eur.toFixed(2)}` : ''}
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}
