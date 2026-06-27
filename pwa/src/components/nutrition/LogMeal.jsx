import { useState, useEffect, useMemo } from 'react'
import { getRecipes, getLidlStaples, logMeal, lookupBarcode } from '../../api/client'
import BarcodeScanner from '../BarcodeScanner'

const LIME = '#9dff6f'
const LIME_BR = '#d5ffc7'
const BORDER = 'rgba(32,216,236,.18)'
const MUTED = 'rgba(32,216,236,.38)'
const TEXT_DIM = 'rgba(158,204,190,.58)'
const CYAN = '#20d8ec'

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
    <div style={{ height: '100%', display: 'flex', flexDirection: 'column', background: '#000', color: 'rgba(220,248,236,.94)', fontFamily: "'Saira Condensed',sans-serif" }}>
      {/* TOP BAR */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '13px 18px 11px', borderBottom: `1px solid ${BORDER}`, position: 'sticky', top: 0, background: 'rgba(0,0,0,.96)', backdropFilter: 'blur(12px)', zIndex: 5, flexShrink: 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', flex: 1 }}>
          <span onClick={onBack} style={{ color: CYAN, fontSize: 16, marginRight: 10, cursor: 'pointer' }}>←</span>
          <span style={{ fontFamily: 'var(--display)', fontSize: 13, fontWeight: 700, letterSpacing: '.28em', color: LIME_BR, filter: 'drop-shadow(0 0 8px rgba(157,255,111,.22))' }}>MEAL LOGGER</span>
          {scanState === 'scanning' && (
            <span style={{ fontFamily: 'var(--mono)', fontSize: 8, color: MUTED, marginLeft: 10 }}>SCANNING…</span>
          )}
          {scanState === 'not_found' && (
            <span style={{ fontFamily: 'var(--mono)', fontSize: 8, color: '#ff5c7a', marginLeft: 10 }}>NOT FOUND</span>
          )}
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <span style={{ fontFamily: 'var(--mono)', fontSize: 8, letterSpacing: '.14em', color: LIME, border: `1px solid rgba(157,255,111,.32)`, background: 'rgba(157,255,111,.055)', padding: '2px 8px' }}>MANUAL</span>
          <button
            onClick={() => { setScannerOpen(o => !o); setScanState(null) }}
            style={{ background: scannerOpen ? 'rgba(157,255,111,.08)' : 'none', border: `1px solid ${scannerOpen ? 'rgba(157,255,111,.34)' : BORDER}`, color: scannerOpen ? LIME : MUTED, padding: '4px 8px', fontFamily: 'var(--mono)', fontSize: 10, cursor: 'pointer' }}
          >▣</button>
        </div>
      </div>

      {/* Barcode scanner */}
      {scannerOpen && (
        <BarcodeScanner onDetected={handleBarcode} onClose={() => setScannerOpen(false)} />
      )}

      <div style={{ flex: 1, overflowY: 'auto' }}>
        {/* HERO */}
        <div style={{ padding: '18px', borderBottom: `1px solid ${BORDER}`, background: 'linear-gradient(180deg,rgba(157,255,111,.04),transparent)' }}>
          <div style={{ fontFamily: 'var(--display)', fontSize: 32, fontWeight: 700, letterSpacing: '.08em', color: '#fff' }}>LOG FOOD</div>
          <div style={{ fontFamily: 'var(--mono)', fontSize: 8, letterSpacing: '.12em', color: TEXT_DIM, marginTop: 7 }}>Barcode, photo, voice, or manual entry.</div>
        </div>

        {/* SCAN BOX */}
        <div style={{ padding: '16px 18px', borderBottom: `1px solid ${BORDER}` }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
            <span style={{ fontFamily: 'var(--mono)', fontSize: 8, letterSpacing: '.22em', color: MUTED }}>QUICK SCAN</span>
            <span style={{ fontFamily: 'var(--display)', fontSize: 16, fontWeight: 600, color: LIME }}>PHOTO</span>
          </div>
          <div
            onClick={() => setScannerOpen(true)}
            style={{ height: 148, border: `1px dashed rgba(157,255,111,.34)`, background: 'rgba(157,255,111,.025)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexDirection: 'column', gap: 8, cursor: 'pointer' }}
          >
            <div style={{ fontSize: 42, color: LIME, filter: 'drop-shadow(0 0 14px rgba(157,255,111,.32))' }}>◎</div>
            <div style={{ fontFamily: 'var(--mono)', fontSize: 8, letterSpacing: '.18em', color: LIME }}>TAP TO SCAN MEAL</div>
          </div>
          <button
            onClick={() => { /* ask phoenix */ }}
            style={{ marginTop: 12, width: '100%', padding: '15px 0', border: `1px solid ${LIME}`, background: 'transparent', color: LIME, fontFamily: 'var(--display)', fontSize: 15, fontWeight: 700, letterSpacing: '.22em', textAlign: 'center', cursor: 'pointer' }}
          >
            ASK PHOENIX TO ESTIMATE
          </button>
        </div>

        {/* MANUAL ENTRY */}
        <div style={{ padding: '16px 18px', borderBottom: `1px solid ${BORDER}` }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
            <span style={{ fontFamily: 'var(--mono)', fontSize: 8, letterSpacing: '.22em', color: MUTED }}>MANUAL ENTRY</span>
            <span style={{ fontFamily: 'var(--display)', fontSize: 16, fontWeight: 600, color: LIME }}>
              {selected ? 'SELECTED' : tab.toUpperCase()}
            </span>
          </div>

          {/* Tabs */}
          <div style={{ display: 'flex', gap: 8, marginBottom: 12 }}>
            {['recipes', 'staples'].map(t => (
              <button key={t} onClick={() => { setTab(t); setSelected(null); setSearch('') }}
                style={{ flex: 1, padding: '8px 0', background: t === tab ? 'rgba(157,255,111,.06)' : 'none', border: `1px solid ${t === tab ? 'rgba(157,255,111,.34)' : BORDER}`, color: t === tab ? LIME : MUTED, fontFamily: 'var(--mono)', fontSize: 8, letterSpacing: '.16em', cursor: 'pointer' }}>
                {t.toUpperCase()}
              </button>
            ))}
          </div>

          {/* Search */}
          <input
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder={`Search ${tab}…`}
            style={{ width: '100%', background: 'rgba(157,255,111,.025)', border: `1px solid ${BORDER}`, padding: '10px 12px', color: 'rgba(220,248,236,.94)', fontSize: 13, fontFamily: "'Saira Condensed',sans-serif", outline: 'none', boxSizing: 'border-box', marginBottom: 10 }}
          />

          {/* Selected item */}
          {selected && (
            <div style={{ padding: '12px 14px', background: 'rgba(157,255,111,.04)', border: `1px solid rgba(157,255,111,.2)`, marginBottom: 12 }}>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginBottom: 12 }}>
                <div style={{ gridColumn: '1/-1', border: `1px solid ${BORDER}`, background: 'rgba(157,255,111,.025)', padding: 11 }}>
                  <div style={{ fontFamily: 'var(--mono)', fontSize: 7, letterSpacing: '.16em', color: MUTED, marginBottom: 7 }}>MEAL NAME</div>
                  <div style={{ fontFamily: 'var(--display)', fontSize: 22, fontWeight: 700, color: '#fff' }}>{selected.name}</div>
                </div>
                {[
                  { label: 'KCAL', val: scaledCal },
                  { label: 'PROTEIN', val: `${scaledProt}g` },
                  { label: 'CARBS', val: `${+(selected.carbs_g * servings).toFixed(0)}g` },
                  { label: 'FATS', val: `${+(selected.fat_g * servings).toFixed(0)}g` },
                ].map(({ label, val }) => (
                  <div key={label} style={{ border: `1px solid ${BORDER}`, background: 'rgba(157,255,111,.025)', padding: 11 }}>
                    <div style={{ fontFamily: 'var(--mono)', fontSize: 7, letterSpacing: '.16em', color: MUTED, marginBottom: 7 }}>{label}</div>
                    <div style={{ fontFamily: 'var(--display)', fontSize: 22, fontWeight: 700, color: '#fff' }}>{val}</div>
                  </div>
                ))}
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 12 }}>
                <button onClick={() => adjustServings(-0.5)} style={{ width: 40, height: 40, background: 'none', border: `1px solid ${BORDER}`, color: LIME, fontSize: 20, cursor: 'pointer', fontFamily: 'var(--display)', flexShrink: 0 }}>−</button>
                <span style={{ fontFamily: 'var(--mono)', fontSize: 18, color: '#fff', minWidth: 40, textAlign: 'center' }}>{servings}×</span>
                <button onClick={() => adjustServings(0.5)} style={{ width: 40, height: 40, background: 'none', border: `1px solid ${BORDER}`, color: LIME, fontSize: 20, cursor: 'pointer', fontFamily: 'var(--display)', flexShrink: 0 }}>+</button>
                <span style={{ fontFamily: 'var(--mono)', fontSize: 9, color: MUTED }}>SERVINGS</span>
              </div>
              {error && <div style={{ fontFamily: 'var(--mono)', fontSize: 11, color: '#ff5c7a', marginBottom: 8 }}>{error}</div>}
              <button
                onClick={handleLog}
                disabled={logging}
                style={{ width: '100%', padding: '15px 0', border: 'none', background: logging ? 'rgba(157,255,111,.3)' : LIME, color: '#001204', fontFamily: 'var(--display)', fontSize: 15, fontWeight: 700, letterSpacing: '.22em', textAlign: 'center', boxShadow: `0 0 18px rgba(157,255,111,.28)`, cursor: 'pointer' }}
              >
                {logging ? 'SAVING…' : 'SAVE MEAL'}
              </button>
            </div>
          )}

          {/* Item list */}
          {loading ? (
            <div style={{ padding: '24px 0', textAlign: 'center', color: MUTED, fontFamily: 'var(--mono)', fontSize: 12 }}>Loading…</div>
          ) : filtered.length === 0 ? (
            <div style={{ padding: '24px 0', textAlign: 'center', color: MUTED, fontFamily: 'var(--mono)', fontSize: 12 }}>Nothing found.</div>
          ) : filtered.map(item => {
            const isSel = selected?.id === item.id && selected?.name === item.name
            return (
              <div key={`${tab}-${item.id}`} onClick={() => selectItem(item)}
                style={{ padding: '11px 12px', borderBottom: `1px solid rgba(32,216,236,.08)`, cursor: 'pointer', borderLeft: `3px solid ${isSel ? LIME : 'transparent'}`, background: isSel ? 'rgba(157,255,111,.04)' : 'none' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: 8 }}>
                  <div style={{ fontFamily: 'var(--display)', fontSize: 15, fontWeight: 600, color: '#fff', flex: 1 }}>{item.name}</div>
                  <div style={{ fontFamily: 'var(--mono)', fontSize: 12, color: LIME_BR, flexShrink: 0 }}>{item.protein_g}g P</div>
                </div>
                <div style={{ fontFamily: 'var(--mono)', fontSize: 7, color: TEXT_DIM, marginTop: 2 }}>
                  {item.calories} kcal{tab === 'staples' && item.price_eur ? ` · €${item.price_eur.toFixed(2)}` : ''}
                </div>
              </div>
            )
          })}
        </div>

        {/* PHOENIX NOTE */}
        <div style={{ margin: '14px 18px 32px', padding: '11px 13px', border: `1px solid rgba(32,216,236,.16)`, borderLeft: `3px solid ${LIME}`, background: 'rgba(157,255,111,.025)' }}>
          <div style={{ fontFamily: 'var(--mono)', fontSize: 7, letterSpacing: '.2em', color: 'rgba(157,255,111,.48)', marginBottom: 6 }}>PHOENIX SAFETY</div>
          <div style={{ fontSize: '12.5px', lineHeight: 1.65, color: 'rgba(220,248,236,.78)' }}>
            Nutrition estimates should be editable. PHOENIX can suggest, but you confirm the logged meal.
          </div>
        </div>
      </div>
    </div>
  )
}
