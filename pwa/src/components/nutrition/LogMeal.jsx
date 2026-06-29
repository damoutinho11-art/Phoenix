import { useState, useEffect, useMemo } from 'react'
import { getRecipes, getLidlStaples, getRecentMeals, logMeal, lookupBarcode } from '../../api/client'
import BarcodeScanner from '../BarcodeScanner'

const LIME = '#9dff6f'
const LIME_BR = '#d5ffc7'
const BORDER = 'rgba(32,216,236,.18)'
const MUTED = 'rgba(32,216,236,.38)'
const TEXT_DIM = 'rgba(158,204,190,.58)'
const CYAN = '#20d8ec'

const EMPTY_CUSTOM = {
  name: '',
  calories: '',
  protein_g: '',
  carbs_g: '',
  fat_g: '',
}

function parseMacro(value) {
  const parsed = Number(value)
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : null
}

function macroSummary(item) {
  const base = `${Math.round(item.calories || 0)} kcal · ${+(item.protein_g || 0).toFixed(1)}g P · ${Math.round(item.carbs_g || 0)}g C · ${Math.round(item.fat_g || 0)}g F`
  if (item.is_batch_recipe && item.full_calories) {
    return `${base} · ${item.serving || '1 serving'} · full batch ${Math.round(item.full_calories)} kcal`
  }
  if (item.serving && item.item_type !== 'custom') return `${base} · ${item.serving}`
  return base
}

export default function LogMeal({ onBack, onSuccess }) {
  const [tab, setTab] = useState('recipes')
  const [recipes, setRecipes] = useState([])
  const [staples, setStaples] = useState([])
  const [recent, setRecent] = useState([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [selected, setSelected] = useState(null)
  const [servings, setServings] = useState(1)
  const [logging, setLogging] = useState(false)
  const [error, setError] = useState('')
  const [scannerOpen, setScannerOpen] = useState(false)
  const [scanState, setScanState] = useState(null)
  const [custom, setCustom] = useState(EMPTY_CUSTOM)

  async function refreshRecent() {
    try {
      const rData = await getRecentMeals(20)
      setRecent(rData.meals || [])
    } catch {}
  }

  useEffect(() => {
    async function load() {
      try {
        const [rData, sData, recentData] = await Promise.all([
          getRecipes(),
          getLidlStaples(),
          getRecentMeals(20),
        ])
        setRecipes(rData.recipes || [])
        setStaples(sData.staples || [])
        setRecent(recentData.meals || [])
      } catch {}
      setLoading(false)
    }
    load()
  }, [])

  const items = tab === 'recipes' ? recipes : tab === 'staples' ? staples : tab === 'recent' ? recent : []

  const filtered = useMemo(() => {
    if (!search.trim()) return items
    const q = search.toLowerCase()
    return items.filter(i => i.name.toLowerCase().includes(q))
  }, [items, search])

  function changeTab(nextTab) {
    setTab(nextTab)
    setSelected(null)
    setSearch('')
    setError('')
  }

  function selectItem(item) {
    const normalized = tab === 'recent'
      ? {
          ...item,
          source: 'recent',
          original_meal_id: item.id,
          id: `recent-${item.id}`,
        }
      : item
    setSelected(normalized)
    setServings(1)
    setError('')
  }

  function adjustServings(delta) {
    setServings(s => Math.max(0.25, +(s + delta).toFixed(2)))
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

  async function savePayload(payload) {
    setLogging(true)
    setError('')
    try {
      await logMeal(payload)
      await refreshRecent()
      onSuccess?.()
    } catch {
      setError('Log failed — try again.')
      setLogging(false)
    }
  }

  async function handleLog() {
    if (!selected) return
    const isBarcode = selected.source === 'barcode'
    const isRecent = selected.source === 'recent'
    const itemType = isBarcode
      ? 'barcode'
      : isRecent
        ? (selected.item_type || 'manual')
        : tab === 'recipes'
          ? 'recipe'
          : tab === 'staples'
            ? 'staple'
            : 'manual'
    const source = isBarcode
      ? 'barcode'
      : isRecent
        ? 'repeat'
        : tab === 'recipes'
          ? 'recipe'
          : tab === 'staples'
            ? 'lidl_staple'
            : 'manual'

    await savePayload({
      item_id: String(selected.id),
      item_type: itemType,
      name: selected.name,
      servings,
      calories:   +(selected.calories   * servings).toFixed(1),
      protein_g:  +(selected.protein_g  * servings).toFixed(1),
      fat_g:      +(selected.fat_g      * servings).toFixed(1),
      carbs_g:    +(selected.carbs_g    * servings).toFixed(1),
      source,
    })
  }

  async function handleCustomLog() {
    const calories = parseMacro(custom.calories)
    const protein = parseMacro(custom.protein_g)
    const carbs = parseMacro(custom.carbs_g)
    const fat = parseMacro(custom.fat_g)
    const name = custom.name.trim()
    if (!name || calories === null || protein === null || carbs === null || fat === null) {
      setError('Enter name, kcal, protein, carbs, and fats.')
      return
    }
    await savePayload({
      item_id: `custom-${Date.now()}`,
      item_type: 'custom',
      name,
      servings: 1,
      calories: +calories.toFixed(1),
      protein_g: +protein.toFixed(1),
      fat_g: +fat.toFixed(1),
      carbs_g: +carbs.toFixed(1),
      source: 'custom_manual',
    })
  }

  const scaledCal  = selected ? Math.round(selected.calories  * servings) : 0
  const scaledProt = selected ? +(selected.protein_g * servings).toFixed(1) : 0

  return (
    <div style={{ height: '100%', display: 'flex', flexDirection: 'column', background: '#000', color: 'rgba(220,248,236,.94)', fontFamily: "'Saira Condensed',sans-serif" }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '13px 18px 11px', borderBottom: `1px solid ${BORDER}`, position: 'sticky', top: 0, background: 'rgba(0,0,0,.96)', backdropFilter: 'blur(12px)', zIndex: 5, flexShrink: 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', flex: 1 }}>
          <span onClick={onBack} style={{ color: CYAN, fontSize: 16, marginRight: 10, cursor: 'pointer' }}>←</span>
          <span style={{ fontFamily: 'var(--display)', fontSize: 13, fontWeight: 700, letterSpacing: '.28em', color: LIME_BR, filter: 'drop-shadow(0 0 8px rgba(157,255,111,.22))' }}>MEAL LOGGER</span>
          {scanState === 'scanning' && <span style={{ fontFamily: 'var(--mono)', fontSize: 8, color: MUTED, marginLeft: 10 }}>SCANNING…</span>}
          {scanState === 'not_found' && <span style={{ fontFamily: 'var(--mono)', fontSize: 8, color: '#ff5c7a', marginLeft: 10 }}>NOT FOUND</span>}
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <span style={{ fontFamily: 'var(--mono)', fontSize: 8, letterSpacing: '.14em', color: LIME, border: `1px solid rgba(157,255,111,.32)`, background: 'rgba(157,255,111,.055)', padding: '2px 8px' }}>MANUAL</span>
          <button onClick={() => { setScannerOpen(o => !o); setScanState(null) }} style={{ background: scannerOpen ? 'rgba(157,255,111,.08)' : 'none', border: `1px solid ${scannerOpen ? 'rgba(157,255,111,.34)' : BORDER}`, color: scannerOpen ? LIME : MUTED, padding: '4px 8px', fontFamily: 'var(--mono)', fontSize: 10, cursor: 'pointer' }}>▣</button>
        </div>
      </div>

      {scannerOpen && <BarcodeScanner onDetected={handleBarcode} onClose={() => setScannerOpen(false)} />}

      <div style={{ flex: 1, overflowY: 'auto', paddingBottom: 88 }}>
        <div style={{ padding: '18px', borderBottom: `1px solid ${BORDER}`, background: 'linear-gradient(180deg,rgba(157,255,111,.04),transparent)' }}>
          <div style={{ fontFamily: 'var(--display)', fontSize: 32, fontWeight: 700, letterSpacing: '.08em', color: '#fff' }}>LOG FOOD</div>
          <div style={{ fontFamily: 'var(--mono)', fontSize: 8, letterSpacing: '.12em', color: TEXT_DIM, marginTop: 7 }}>Barcode, recipe, Lidl staple, repeat meal, or exact custom macros.</div>
        </div>

        <div style={{ padding: '16px 18px', borderBottom: `1px solid ${BORDER}` }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
            <span style={{ fontFamily: 'var(--mono)', fontSize: 8, letterSpacing: '.22em', color: MUTED }}>QUICK SCAN</span>
            <span style={{ fontFamily: 'var(--display)', fontSize: 16, fontWeight: 600, color: LIME }}>BARCODE</span>
          </div>
          <div onClick={() => setScannerOpen(true)} style={{ height: 112, border: `1px dashed rgba(157,255,111,.34)`, background: 'rgba(157,255,111,.025)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexDirection: 'column', gap: 8, cursor: 'pointer' }}>
            <div style={{ fontSize: 36, color: LIME, filter: 'drop-shadow(0 0 14px rgba(157,255,111,.32))' }}>◎</div>
            <div style={{ fontFamily: 'var(--mono)', fontSize: 8, letterSpacing: '.18em', color: LIME }}>TAP TO SCAN BARCODE</div>
          </div>
        </div>

        <div style={{ padding: '16px 18px', borderBottom: `1px solid ${BORDER}` }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
            <span style={{ fontFamily: 'var(--mono)', fontSize: 8, letterSpacing: '.22em', color: MUTED }}>ENTRY MODE</span>
            <span style={{ fontFamily: 'var(--display)', fontSize: 16, fontWeight: 600, color: LIME }}>{selected ? 'SELECTED' : tab.toUpperCase()}</span>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: 8, marginBottom: 12 }}>
            {['recipes', 'staples', 'recent', 'custom'].map(t => (
              <button key={t} onClick={() => changeTab(t)} style={{ padding: '8px 0', background: t === tab ? 'rgba(157,255,111,.06)' : 'none', border: `1px solid ${t === tab ? 'rgba(157,255,111,.34)' : BORDER}`, color: t === tab ? LIME : MUTED, fontFamily: 'var(--mono)', fontSize: 7.5, letterSpacing: '.12em', cursor: 'pointer' }}>
                {t.toUpperCase()}
              </button>
            ))}
          </div>

          {tab !== 'custom' && (
            <input value={search} onChange={e => setSearch(e.target.value)} placeholder={`Search ${tab}…`} style={{ width: '100%', background: 'rgba(157,255,111,.025)', border: `1px solid ${BORDER}`, padding: '10px 12px', color: 'rgba(220,248,236,.94)', fontSize: 13, fontFamily: "'Saira Condensed',sans-serif", outline: 'none', boxSizing: 'border-box', marginBottom: 10 }} />
          )}

          {tab === 'custom' && (
            <div style={{ padding: '12px 14px', background: 'rgba(157,255,111,.025)', border: `1px solid rgba(157,255,111,.14)`, marginBottom: 12 }}>
              <div style={{ fontFamily: 'var(--mono)', fontSize: 7, letterSpacing: '.16em', color: MUTED, marginBottom: 9 }}>CUSTOM FOOD · EXACT MACROS</div>
              <input value={custom.name} onChange={e => setCustom(c => ({ ...c, name: e.target.value }))} placeholder="Meal name" style={{ width: '100%', background: 'rgba(0,0,0,.22)', border: `1px solid ${BORDER}`, padding: '10px 12px', color: '#fff', fontSize: 14, fontFamily: "'Saira Condensed',sans-serif", outline: 'none', boxSizing: 'border-box', marginBottom: 8 }} />
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2,1fr)', gap: 8 }}>
                {[
                  ['calories', 'KCAL'],
                  ['protein_g', 'PROTEIN G'],
                  ['carbs_g', 'CARBS G'],
                  ['fat_g', 'FATS G'],
                ].map(([field, label]) => (
                  <input key={field} type="number" min="0" value={custom[field]} onChange={e => setCustom(c => ({ ...c, [field]: e.target.value }))} placeholder={label} style={{ background: 'rgba(0,0,0,.22)', border: `1px solid ${BORDER}`, padding: '10px 12px', color: '#fff', fontSize: 13, fontFamily: 'var(--mono)', outline: 'none', boxSizing: 'border-box' }} />
                ))}
              </div>
              {error && <div style={{ fontFamily: 'var(--mono)', fontSize: 11, color: '#ff5c7a', marginTop: 9 }}>{error}</div>}
              <button onClick={handleCustomLog} disabled={logging} style={{ width: '100%', marginTop: 12, padding: '14px 0', border: 'none', background: logging ? 'rgba(157,255,111,.3)' : LIME, color: '#001204', fontFamily: 'var(--display)', fontSize: 15, fontWeight: 700, letterSpacing: '.22em', textAlign: 'center', boxShadow: `0 0 18px rgba(157,255,111,.28)`, cursor: 'pointer' }}>
                {logging ? 'SAVING…' : 'SAVE CUSTOM MEAL'}
              </button>
            </div>
          )}

          {selected && tab !== 'custom' && (
            <div style={{ padding: '12px 14px', background: 'rgba(157,255,111,.04)', border: `1px solid rgba(157,255,111,.2)`, marginBottom: 12 }}>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginBottom: 12 }}>
                <div style={{ gridColumn: '1/-1', border: `1px solid ${BORDER}`, background: 'rgba(157,255,111,.025)', padding: 11 }}>
                  <div style={{ fontFamily: 'var(--mono)', fontSize: 7, letterSpacing: '.16em', color: MUTED, marginBottom: 7 }}>{selected.source === 'recent' ? 'REPEAT MEAL' : 'MEAL NAME'}</div>
                  <div style={{ fontFamily: 'var(--display)', fontSize: 22, fontWeight: 700, color: '#fff' }}>{selected.name}</div>
                  {selected.serving && <div style={{ fontFamily: 'var(--mono)', fontSize: 7, letterSpacing: '.12em', color: TEXT_DIM, marginTop: 4 }}>{selected.serving}{selected.is_batch_recipe && selected.full_calories ? ` · full batch ${Math.round(selected.full_calories)} kcal` : ''}</div>}
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
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5,1fr)', gap: 7, marginBottom: 12 }}>
                {[0.25, 0.5, 1, 1.5, 2].map(v => (
                  <button key={v} onClick={() => setServings(v)} style={{ padding: '8px 0', background: servings === v ? 'rgba(157,255,111,.08)' : 'none', border: `1px solid ${servings === v ? 'rgba(157,255,111,.34)' : BORDER}`, color: servings === v ? LIME : MUTED, fontFamily: 'var(--mono)', fontSize: 8, cursor: 'pointer' }}>{v}×</button>
                ))}
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 12 }}>
                <button onClick={() => adjustServings(-0.25)} style={{ width: 40, height: 40, background: 'none', border: `1px solid ${BORDER}`, color: LIME, fontSize: 20, cursor: 'pointer', fontFamily: 'var(--display)', flexShrink: 0 }}>−</button>
                <span style={{ fontFamily: 'var(--mono)', fontSize: 18, color: '#fff', minWidth: 48, textAlign: 'center' }}>{servings}×</span>
                <button onClick={() => adjustServings(0.25)} style={{ width: 40, height: 40, background: 'none', border: `1px solid ${BORDER}`, color: LIME, fontSize: 20, cursor: 'pointer', fontFamily: 'var(--display)', flexShrink: 0 }}>+</button>
                <span style={{ fontFamily: 'var(--mono)', fontSize: 9, color: MUTED }}>{selected.is_batch_recipe ? 'LOGGABLE SERVINGS' : 'SERVINGS'}</span>
              </div>
              {error && <div style={{ fontFamily: 'var(--mono)', fontSize: 11, color: '#ff5c7a', marginBottom: 8 }}>{error}</div>}
              <button onClick={handleLog} disabled={logging} style={{ width: '100%', padding: '15px 0', border: 'none', background: logging ? 'rgba(157,255,111,.3)' : LIME, color: '#001204', fontFamily: 'var(--display)', fontSize: 15, fontWeight: 700, letterSpacing: '.22em', textAlign: 'center', boxShadow: `0 0 18px rgba(157,255,111,.28)`, cursor: 'pointer' }}>
                {logging ? 'SAVING…' : selected.source === 'recent' ? 'REPEAT MEAL' : 'SAVE MEAL'}
              </button>
            </div>
          )}

          {tab !== 'custom' && (loading ? (
            <div style={{ padding: '24px 0', textAlign: 'center', color: MUTED, fontFamily: 'var(--mono)', fontSize: 12 }}>Loading…</div>
          ) : filtered.length === 0 ? (
            <div style={{ padding: '24px 0', textAlign: 'center', color: MUTED, fontFamily: 'var(--mono)', fontSize: 12 }}>{tab === 'recent' ? 'No previous meals yet.' : 'Nothing found.'}</div>
          ) : filtered.map(item => {
            const isSel = selected?.id === (tab === 'recent' ? `recent-${item.id}` : item.id)
            return (
              <div key={`${tab}-${item.id}`} onClick={() => selectItem(item)} style={{ padding: '11px 12px', borderBottom: `1px solid rgba(32,216,236,.08)`, cursor: 'pointer', borderLeft: `3px solid ${isSel ? LIME : 'transparent'}`, background: isSel ? 'rgba(157,255,111,.04)' : 'none' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: 8 }}>
                  <div style={{ fontFamily: 'var(--display)', fontSize: 15, fontWeight: 600, color: '#fff', flex: 1 }}>{item.name}</div>
                  <div style={{ fontFamily: 'var(--mono)', fontSize: 12, color: LIME_BR, flexShrink: 0 }}>{+(item.protein_g || 0).toFixed(1)}g P</div>
                </div>
                <div style={{ fontFamily: 'var(--mono)', fontSize: 7, color: TEXT_DIM, marginTop: 2 }}>
                  {macroSummary(item)}{tab === 'staples' && item.price_eur ? ` · €${item.price_eur.toFixed(2)}` : ''}{tab === 'staples' && item.category ? ` · ${String(item.category).toUpperCase()}` : ''}{tab === 'recent' && item.log_date ? ` · ${item.log_date}` : ''}
                </div>
                {Array.isArray(item.tags) && item.tags.length > 0 && (
                  <div style={{ display: 'flex', gap: 5, flexWrap: 'wrap', marginTop: 6 }}>
                    {item.tags.slice(0, 4).map(t => <span key={t} style={{ fontFamily: 'var(--mono)', fontSize: 7, letterSpacing: '.1em', color: LIME, border: `1px solid rgba(157,255,111,.18)`, padding: '1px 5px', background: 'rgba(157,255,111,.025)' }}>{t}</span>)}
                  </div>
                )}
              </div>
            )
          }))}
        </div>

        <div style={{ margin: '14px 18px 32px', padding: '11px 13px', border: `1px solid rgba(32,216,236,.16)`, borderLeft: `3px solid ${LIME}`, background: 'rgba(157,255,111,.025)' }}>
          <div style={{ fontFamily: 'var(--mono)', fontSize: 7, letterSpacing: '.2em', color: 'rgba(157,255,111,.48)', marginBottom: 6 }}>PHOENIX SAFETY</div>
          <div style={{ fontSize: '12.5px', lineHeight: 1.65, color: 'rgba(220,248,236,.78)' }}>
            Recipe entries log the displayed serving unit, not the full batch. Custom entries are saved only after you confirm the macros.
          </div>
        </div>
      </div>
    </div>
  )
}
