import { useState, useEffect, useMemo } from 'react'
import { getRecipes, getLidlStaples, logMeal, lookupBarcode } from '../../api/client'
import BarcodeScanner from '../BarcodeScanner'

const G = '#9dff6f'
const BG = '#0a0a0a'
const CARD = '#111'
const BORDER = '#1a1a1a'
const TEXT = '#e8e8e8'
const DIM = '#555'
const MONO = "'Share Tech Mono', monospace"
const DISPLAY = "'Oswald', 'Inter', sans-serif"

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
  const [scanState, setScanState] = useState(null) // null | 'scanning' | 'not_found'

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
    <div style={{ height: '100%', display: 'flex', flexDirection: 'column', background: BG, color: TEXT, fontFamily: 'Inter,sans-serif' }}>
      {/* Header */}
      <div style={{ padding: '14px 16px 10px', display: 'flex', alignItems: 'center', gap: '12px', borderBottom: `1px solid ${BORDER}`, flexShrink: 0 }}>
        <button onClick={onBack} style={{ background: 'none', border: 'none', color: DIM, fontSize: '22px', cursor: 'pointer', padding: 0, lineHeight: 1 }}>‹</button>
        <span style={{ fontFamily: DISPLAY, fontSize: '13px', letterSpacing: '0.12em', color: G, fontWeight: 600, flex: 1 }}>LOG MEAL</span>
        {scanState === 'scanning' && (
          <span style={{ fontSize: '11px', color: DIM, fontFamily: DISPLAY }}>scanning…</span>
        )}
        {scanState === 'not_found' && (
          <span style={{ fontSize: '11px', color: '#ef5350', fontFamily: DISPLAY }}>not found</span>
        )}
        <button
          onClick={() => { setScannerOpen(o => !o); setScanState(null) }}
          style={{
            background: scannerOpen ? '#1a2a1a' : 'none',
            border: `1px solid ${scannerOpen ? G : '#2a2a2a'}`,
            borderRadius: '8px',
            padding: '7px 10px',
            color: scannerOpen ? G : DIM,
            fontSize: '16px',
            cursor: 'pointer',
            lineHeight: 1,
          }}
          title="Scan barcode"
        >
          ▣
        </button>
      </div>

      {/* Barcode scanner */}
      {scannerOpen && (
        <BarcodeScanner
          onDetected={handleBarcode}
          onClose={() => setScannerOpen(false)}
        />
      )}

      {/* Tabs */}
      <div style={{ display: 'flex', borderBottom: `1px solid ${BORDER}`, flexShrink: 0 }}>
        {['recipes', 'staples'].map(t => (
          <button key={t} onClick={() => { setTab(t); setSelected(null); setSearch('') }}
            style={{
              flex: 1, padding: '10px 0', background: 'none', border: 'none',
              borderBottom: tab === t ? `2px solid ${G}` : '2px solid transparent',
              color: tab === t ? G : DIM,
              fontSize: '12px', fontWeight: 600, letterSpacing: '0.08em',
              fontFamily: DISPLAY, cursor: 'pointer',
            }}>
            {t.toUpperCase()}
          </button>
        ))}
      </div>

      {/* Search */}
      <div style={{ padding: '10px 16px', borderBottom: `1px solid ${BORDER}`, flexShrink: 0 }}>
        <input
          value={search}
          onChange={e => setSearch(e.target.value)}
          placeholder={`Search ${tab}…`}
          style={{ width: '100%', background: CARD, border: `1px solid ${BORDER}`, borderRadius: '8px', padding: '9px 12px', color: TEXT, fontSize: '14px', fontFamily: 'Inter,sans-serif', outline: 'none', boxSizing: 'border-box' }}
        />
      </div>

      {/* Selected + serving adjuster */}
      {selected && (
        <div style={{ padding: '12px 16px', background: '#0a1a0a', borderBottom: `1px solid ${G}22`, flexShrink: 0 }}>
          <div style={{ fontSize: '14px', color: TEXT, marginBottom: '10px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {selected.name}
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            {/* Stepper */}
            <button onClick={() => adjustServings(-0.5)}
              style={{ width: '34px', height: '34px', background: '#1a2a1a', border: `1px solid ${G}33`, borderRadius: '8px', color: G, fontSize: '20px', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', lineHeight: 1 }}>
              −
            </button>
            <span style={{ fontFamily: MONO, fontSize: '20px', color: TEXT, minWidth: '38px', textAlign: 'center' }}>{servings}</span>
            <button onClick={() => adjustServings(0.5)}
              style={{ width: '34px', height: '34px', background: '#1a2a1a', border: `1px solid ${G}33`, borderRadius: '8px', color: G, fontSize: '20px', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', lineHeight: 1 }}>
              +
            </button>
            <span style={{ fontSize: '12px', color: DIM, fontFamily: MONO, marginLeft: '4px' }}>
              {scaledCal} kcal · {scaledProt}g P
            </span>
            <button onClick={handleLog} disabled={logging}
              style={{ marginLeft: 'auto', background: logging ? '#1a2a1a' : G, border: 'none', borderRadius: '8px', padding: '10px 22px', color: logging ? DIM : '#000', fontSize: '13px', fontWeight: 700, cursor: logging ? 'default' : 'pointer', fontFamily: DISPLAY, letterSpacing: '0.06em' }}>
              {logging ? '…' : 'LOG'}
            </button>
          </div>
          {error && <div style={{ fontSize: '12px', color: '#ef5350', marginTop: '6px' }}>{error}</div>}
        </div>
      )}

      {/* Item list */}
      <div style={{ flex: 1, overflowY: 'auto', padding: '4px 16px 32px' }}>
        {loading ? (
          <div style={{ padding: '40px 0', textAlign: 'center', color: DIM }}>Loading…</div>
        ) : filtered.length === 0 ? (
          <div style={{ padding: '40px 0', textAlign: 'center', color: DIM }}>Nothing found.</div>
        ) : filtered.map(item => {
          const isSelected = selected?.id === item.id && selected?.name === item.name
          return (
            <div key={`${tab}-${item.id}`} onClick={() => selectItem(item)}
              style={{
                padding: '12px 0',
                borderBottom: `1px solid ${BORDER}`,
                cursor: 'pointer',
                borderLeft: isSelected ? `3px solid ${G}` : '3px solid transparent',
                paddingLeft: isSelected ? '10px' : 0,
              }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: '8px' }}>
                <div style={{ fontSize: '14px', color: isSelected ? TEXT : TEXT, flex: 1 }}>{item.name}</div>
                <div style={{ fontSize: '12px', color: G, fontFamily: MONO, flexShrink: 0 }}>{item.protein_g}g P</div>
              </div>
              <div style={{ fontSize: '12px', color: DIM, marginTop: '2px', fontFamily: MONO }}>
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
