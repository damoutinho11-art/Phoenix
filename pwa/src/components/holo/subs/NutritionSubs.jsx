import { useState, useEffect, useMemo, useCallback } from 'react'
import { ACC, G, Y, R, W, BODY, INK, FM, FD, FB, a, mix, deep, pad2 } from '../holoTokens'
import { DINNERS, FUEL_NODES, FUEL_CURVE } from '../holoDomains'
import {
  getLidlStaples, getRecipes, getRecentMeals, lookupBarcode,
  getWeightHistory, logWeight,
} from '../../../api/client'
import {
  parseWeightInput,
  weightTrend,
  sparklinePoints,
  sparklinePath,
  formatDelta,
} from './weightTrendModel'
import {
  gramBasis,
  basisHint,
  supportsGrams,
  scaleToGrams,
  scaleToServings,
  searchFoods,
  barcodeFood,
  buildRepeatPayload,
  buildGramPayload,
  buildServingPayload,
  buildCustomPayload,
} from './mealPortionModel'
import BarcodeScanner from '../../BarcodeScanner'
import SubShell, { SubLabel } from './SubShell'

// ── NUTRITION // MEAL COMPOSER — food brain, scan, repeat, custom ──
// Portions come from the real food brain (60 Lidl staples + 156 recipes), a
// scanned barcode, or a previously logged meal — never a fixture list.
// Staples and per-100g scans are logged by typing grams; recipes carry no gram
// weight so they stay on serving multiples. `budget` is the real nutrition
// status (holoLive.mealBudget); portion arithmetic lives in mealPortionModel.
const EMPTY_CUSTOM = { name: '', calories: '', protein_g: '', carbs_g: '', fat_g: '' }

const MACRO_FIELDS = [
  ['calories', 'KCAL'],
  ['protein_g', 'PROTEIN G'],
  ['carbs_g', 'CARBS G'],
  ['fat_g', 'FATS G'],
]

const MODES = [
  ['brain', 'FOOD BRAIN'],
  ['recent', 'RECENT'],
  ['custom', 'CUSTOM'],
]

export function LogMealSub({ onClose, onLog, budget }) {
  const kcalOpen = Math.max(1, budget?.kcalOpen ?? 860)
  const proteinGap = Math.max(1, budget?.proteinGap ?? 53)
  const [mode, setMode] = useState('brain')
  const [staples, setStaples] = useState([])
  const [recipes, setRecipes] = useState([])
  const [recent, setRecent] = useState([])
  const [loading, setLoading] = useState(true)
  const [linkDown, setLinkDown] = useState(false)
  const [query, setQuery] = useState('')
  const [selected, setSelected] = useState(null)
  const [repeatMeal, setRepeatMeal] = useState(null)
  const [amount, setAmount] = useState('')
  const [custom, setCustom] = useState(EMPTY_CUSTOM)
  const [scannerOpen, setScannerOpen] = useState(false)
  const [scanState, setScanState] = useState('')
  const [posting, setPosting] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    let alive = true
    Promise.all([getLidlStaples(), getRecipes(), getRecentMeals(20)])
      .then(([s, r, m]) => {
        if (!alive) return
        setStaples(s?.staples || [])
        setRecipes(r?.recipes || [])
        setRecent(m?.meals || [])
      })
      .catch(() => { if (alive) setLinkDown(true) })
      .finally(() => { if (alive) setLoading(false) })
    return () => { alive = false }
  }, [])

  const results = useMemo(
    () => searchFoods(query, { staples, recipes }),
    [query, staples, recipes]
  )

  const byGrams = selected ? supportsGrams(selected) : false
  const hint = selected ? basisHint(selected.unit) : null

  const macros = mode === 'custom'
    ? buildCustomPayload(custom)
    : mode === 'recent'
      ? (repeatMeal ? buildRepeatPayload(repeatMeal) : null)
      : selected
        ? (byGrams ? scaleToGrams(selected, amount) : scaleToServings(selected, amount))
        : null

  const mk = Math.round(macros?.calories ?? 0)
  const mp = +(macros?.protein_g ?? 0).toFixed(1)
  const ready = macros !== null

  function changeMode(next) {
    setMode(next)
    setError('')
    if (next !== 'brain') setSelected(null)
    if (next !== 'recent') setRepeatMeal(null)
  }

  function selectFood(item) {
    setSelected(item)
    setError('')
    setAmount(supportsGrams(item) ? String(gramBasis(item.unit)) : '1')
  }

  function nudge(delta) {
    const next = Number(amount) + delta
    setAmount(String(byGrams ? Math.max(1, Math.round(next)) : Math.max(0.25, +next.toFixed(2))))
  }

  async function handleScan(code) {
    setScannerOpen(false)
    setScanState('LOOKING UP…')
    setError('')
    try {
      const food = barcodeFood(await lookupBarcode(code))
      if (!food) {
        setScanState('NO USABLE MACROS — ENTER THEM MANUALLY')
        return
      }
      setScanState('')
      setMode('brain')
      selectFood(food)
    } catch {
      setScanState('BARCODE NOT FOUND — ENTER IT MANUALLY')
    }
  }

  const confirm = async () => {
    if (!ready || posting) return
    const payload = mode === 'custom'
      ? buildCustomPayload(custom)
      : mode === 'recent'
        ? buildRepeatPayload(repeatMeal)
        : byGrams
          ? buildGramPayload(selected, amount)
          : buildServingPayload(selected, amount)
    if (!payload) {
      setError('CHECK THE VALUES ABOVE')
      return
    }
    setPosting(true)
    setError('')
    try {
      await onLog(payload)
      onClose()
    } catch {
      setError('LOG FAILED — LINK DOWN · TAP TO RETRY')
      setPosting(false)
    }
  }

  const bars = [
    { l: 'KCAL VS OPEN', v: `${mk} / ${kcalOpen}`, w: Math.min(100, (mk / kcalOpen) * 100).toFixed(0) + '%', c: mk > kcalOpen ? R : G },
    { l: 'PROTEIN VS GAP', v: `${mp} / ${proteinGap}G`, w: Math.min(100, (mp / proteinGap) * 100).toFixed(0) + '%', c: W },
  ]

  const tabStyle = on => ({
    flex: 1, minHeight: 34, fontFamily: FM, fontSize: 8, letterSpacing: '.18em',
    color: on ? INK : a(ACC, '99'), background: on ? ACC : deep(55),
    border: `1px solid ${a(ACC, on ? 'aa' : '2a')}`, cursor: 'pointer',
  })

  const fieldStyle = {
    width: '100%', minHeight: 38, padding: '0 10px', fontFamily: FD, fontSize: 17,
    fontWeight: 600, color: 'var(--phx-text)', background: deep(62),
    border: `1px solid ${a(ACC, '44')}`, outline: 'none',
  }

  const rowStyle = on => ({
    padding: '9px 11px', background: deep(on ? 40 : 55),
    border: `1px solid ${a(ACC, on ? '88' : '2a')}`, cursor: 'pointer', textAlign: 'left',
  })

  return (
    <SubShell subKey="logmeal" onClose={onClose} meta={`${kcalOpen} KCAL OPEN`}>
      <div style={{ display: 'flex', gap: 22, flexWrap: 'wrap' }}>
        <div style={{ flex: 1.4, minWidth: 300 }}>
          <div style={{ display: 'flex', gap: 6, marginBottom: 12 }}>
            {MODES.map(([key, label]) => (
              <button key={key} onClick={() => changeMode(key)} style={tabStyle(mode === key)}>{label}</button>
            ))}
          </div>

          {mode === 'brain' && (
            <>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 10 }}>
                <SubLabel style={{ marginBottom: 10 }}>
                  SEARCH — {loading ? 'LOADING FOOD BRAIN…' : `${staples.length} STAPLES · ${recipes.length} RECIPES`}
                </SubLabel>
                <button
                  onClick={() => { setScannerOpen(o => !o); setScanState('') }}
                  style={{ minHeight: 28, padding: '0 11px', fontFamily: FM, fontSize: 8, letterSpacing: '.18em', color: scannerOpen ? INK : ACC, background: scannerOpen ? ACC : deep(55), border: `1px solid ${a(ACC, '55')}`, cursor: 'pointer', marginBottom: 10, whiteSpace: 'nowrap' }}
                >
                  ▣ SCAN
                </button>
              </div>
              {scanState && (
                <div style={{ fontFamily: FM, fontSize: '7.5px', letterSpacing: '.14em', color: Y, marginBottom: 8 }}>{scanState}</div>
              )}
              {scannerOpen && (
                <div style={{ marginBottom: 10 }}>
                  <BarcodeScanner onDetected={handleScan} onClose={() => setScannerOpen(false)} />
                </div>
              )}
              <input
                value={query}
                onChange={e => setQuery(e.target.value)}
                placeholder="chicken, rice, skyr…"
                style={{ ...fieldStyle, fontSize: 15, marginBottom: 10 }}
              />
              {linkDown && (
                <div style={{ fontFamily: FM, fontSize: '7.5px', letterSpacing: '.14em', color: R, marginBottom: 8 }}>
                  FOOD BRAIN UNREACHABLE — USE CUSTOM
                </div>
              )}
              <div style={{ maxHeight: 214, overflowY: 'auto', display: 'grid', gap: 6 }}>
                {selected?.kind === 'barcode' && (
                  <div style={rowStyle(true)}>
                    <span style={{ display: 'flex', justifyContent: 'space-between', gap: 10, alignItems: 'baseline' }}>
                      <span style={{ fontFamily: FB, fontSize: 15, color: 'var(--phx-text)' }}>{selected.name}</span>
                      <span style={{ fontFamily: FM, fontSize: '7px', letterSpacing: '.1em', color: a(ACC, '77') }}>SCANNED</span>
                    </span>
                    <span style={{ display: 'block', fontFamily: FM, fontSize: '7.5px', letterSpacing: '.1em', color: a(ACC, '99'), marginTop: 4 }}>
                      {Math.round(selected.calories)} KCAL · {+selected.protein_g.toFixed(1)}P · {selected.unit ? `PER ${selected.unit}` : 'PER SERVING · NO WEIGHT GIVEN'}
                    </span>
                  </div>
                )}
                {results.map(f => {
                  const on = selected?.id === f.id
                  const per = supportsGrams(f) ? `PER ${f.unit}` : (f.serving || 'PER SERVING')
                  return (
                    <button key={`${f.kind}-${f.id}`} onClick={() => selectFood(f)} style={rowStyle(on)}>
                      <span style={{ display: 'flex', justifyContent: 'space-between', gap: 10, alignItems: 'baseline' }}>
                        <span style={{ fontFamily: FB, fontSize: 15, color: 'var(--phx-text)', lineHeight: 1.15 }}>{f.name}</span>
                        <span style={{ fontFamily: FM, fontSize: '7px', letterSpacing: '.1em', color: a(ACC, '77'), whiteSpace: 'nowrap' }}>{f.kind === 'recipe' ? 'RECIPE' : 'STAPLE'}</span>
                      </span>
                      <span style={{ display: 'block', fontFamily: FM, fontSize: '7.5px', letterSpacing: '.1em', color: a(ACC, '99'), marginTop: 4 }}>
                        {Math.round(f.calories || 0)} KCAL · {+(f.protein_g || 0).toFixed(1)}P · {per}
                      </span>
                    </button>
                  )
                })}
                {!loading && !results.length && (
                  <div style={{ fontFamily: FM, fontSize: 8, letterSpacing: '.14em', color: a(ACC, '77'), padding: '10px 2px' }}>
                    NO MATCH — SCAN IT OR USE CUSTOM
                  </div>
                )}
              </div>

              {selected && (
                <div style={{ marginTop: 13, padding: '11px 12px', background: deep(48), border: `1px solid ${a(ACC, '44')}` }}>
                  <SubLabel style={{ marginBottom: 8 }}>
                    {byGrams ? 'HOW MANY GRAMS' : 'HOW MANY SERVINGS'}{hint ? ` — ${hint.toUpperCase()}` : ''}
                  </SubLabel>
                  <div style={{ display: 'flex', gap: 7, alignItems: 'center' }}>
                    <button onClick={() => nudge(byGrams ? -10 : -0.5)} style={{ minWidth: 38, minHeight: 38, fontFamily: FM, fontSize: 13, color: ACC, background: deep(60), border: `1px solid ${a(ACC, '44')}`, cursor: 'pointer' }}>−</button>
                    <input
                      value={amount}
                      onChange={e => setAmount(e.target.value.replace(/[^\d.,]/g, ''))}
                      inputMode="decimal"
                      style={{ ...fieldStyle, textAlign: 'center' }}
                    />
                    <span style={{ fontFamily: FM, fontSize: 9, letterSpacing: '.14em', color: a(ACC, '99'), minWidth: 26 }}>{byGrams ? 'G' : '×'}</span>
                    <button onClick={() => nudge(byGrams ? 10 : 0.5)} style={{ minWidth: 38, minHeight: 38, fontFamily: FM, fontSize: 13, color: ACC, background: deep(60), border: `1px solid ${a(ACC, '44')}`, cursor: 'pointer' }}>+</button>
                  </div>
                </div>
              )}
            </>
          )}

          {mode === 'recent' && (
            <>
              <SubLabel>ATE IT AGAIN — TAP TO RE-LOG THE SAME AMOUNT</SubLabel>
              <div style={{ maxHeight: 300, overflowY: 'auto', display: 'grid', gap: 6 }}>
                {recent.map(m => {
                  const on = repeatMeal?.id === m.id
                  return (
                    <button key={m.id} onClick={() => { setRepeatMeal(m); setError('') }} style={rowStyle(on)}>
                      <span style={{ display: 'flex', justifyContent: 'space-between', gap: 10, alignItems: 'baseline' }}>
                        <span style={{ fontFamily: FB, fontSize: 15, color: 'var(--phx-text)', lineHeight: 1.15 }}>{m.name}</span>
                        <span style={{ fontFamily: FM, fontSize: '7px', letterSpacing: '.1em', color: a(ACC, '77'), whiteSpace: 'nowrap' }}>{(m.log_date || '').slice(5)}</span>
                      </span>
                      <span style={{ display: 'block', fontFamily: FM, fontSize: '7.5px', letterSpacing: '.1em', color: a(ACC, '99'), marginTop: 4 }}>
                        {Math.round(m.calories || 0)} KCAL · {+(m.protein_g || 0).toFixed(1)}P
                      </span>
                    </button>
                  )
                })}
                {!loading && !recent.length && (
                  <div style={{ fontFamily: FM, fontSize: 8, letterSpacing: '.14em', color: a(ACC, '77'), padding: '10px 2px' }}>
                    NOTHING LOGGED YET — START IN FOOD BRAIN
                  </div>
                )}
              </div>
            </>
          )}

          {mode === 'custom' && (
            <>
              <SubLabel>EXACT MACROS — LOG ANYTHING PHOENIX DOES NOT KNOW</SubLabel>
              <input
                value={custom.name}
                onChange={e => setCustom(c => ({ ...c, name: e.target.value }))}
                placeholder="What did you eat?"
                style={{ ...fieldStyle, fontSize: 15, marginBottom: 8 }}
              />
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 8 }}>
                {MACRO_FIELDS.map(([key, label]) => (
                  <label key={key} style={{ display: 'block' }}>
                    <span style={{ display: 'block', fontFamily: FM, fontSize: '7.5px', letterSpacing: '.2em', color: a(ACC, '99'), marginBottom: 4 }}>{label}</span>
                    <input
                      value={custom[key]}
                      onChange={e => setCustom(c => ({ ...c, [key]: e.target.value.replace(/[^\d.,]/g, '') }))}
                      inputMode="decimal"
                      placeholder="0"
                      style={fieldStyle}
                    />
                  </label>
                ))}
              </div>
            </>
          )}
        </div>

        <div style={{ flex: 1, minWidth: 258, textAlign: 'center' }}>
          <svg viewBox="0 0 130 130" style={{ width: 140, height: 140, display: 'block', margin: '0 auto' }}>
            <circle cx="65" cy="65" r="56" fill="none" stroke={a(ACC, '1e')} strokeWidth="6" />
            <circle cx="65" cy="65" r="56" fill="none" stroke={ACC} strokeWidth="6" strokeLinecap="round" strokeDasharray="351.9" strokeDashoffset={(351.9 * (1 - Math.min(1, mk / kcalOpen))).toFixed(1)} transform="rotate(-90 65 65)" style={{ filter: `drop-shadow(0 0 7px ${ACC})`, transition: 'stroke-dashoffset .5s cubic-bezier(.3,.8,.3,1)' }} />
            <circle cx="65" cy="65" r="46" fill="none" stroke={a(ACC, '22')} strokeWidth="1" strokeDasharray="2 4" />
          </svg>
          <div style={{ marginTop: -92, marginBottom: 52 }}>
            <div style={{ fontFamily: FD, fontSize: 28, fontWeight: 700, color: W, textShadow: `0 0 14px ${a(ACC, '66')}` }}>{mk}</div>
            <div style={{ fontFamily: FM, fontSize: '6.5px', letterSpacing: '.26em', color: a(ACC, '99') }}>KCAL COMPOSED</div>
          </div>
          {bars.map((mb, i) => (
            <div key={i} style={{ padding: '5px 0 7px', textAlign: 'left' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 4 }}>
                <span style={{ fontFamily: FM, fontSize: 8, letterSpacing: '.14em', color: mix(BODY, 72) }}>{mb.l}</span>
                <span style={{ fontFamily: FD, fontSize: 16, fontWeight: 600, color: mb.c }}>{mb.v}</span>
              </div>
              <div style={{ height: 5, background: a(ACC, '14'), border: `1px solid ${a(ACC, '20')}`, overflow: 'hidden' }}>
                <div style={{ height: '100%', width: mb.w, background: `linear-gradient(90deg, ${mix(mb.c, 53)}, ${mb.c})`, boxShadow: `0 0 8px ${mix(mb.c, 53)}`, transition: 'width .4s ease' }} />
              </div>
            </div>
          ))}
          <div style={{ fontFamily: FM, fontSize: 8, letterSpacing: '.14em', color: mk > kcalOpen ? R : G, margin: '10px 0 12px' }}>
            {mk > kcalOpen ? `OVER TARGET BY ${mk - kcalOpen} KCAL` : `AFTER LOG → ${kcalOpen - mk} KCAL OPEN`}
          </div>
          <button onClick={confirm} disabled={!ready || posting} style={{ minHeight: 46, width: '100%', fontFamily: FM, fontSize: 10, letterSpacing: '.24em', color: !ready ? a(ACC, '77') : INK, background: !ready ? deep(50) : `linear-gradient(135deg, ${ACC}, ${a(ACC, 'bb')})`, border: `1px solid ${!ready ? a(ACC, '30') : ACC}`, cursor: !ready || posting ? 'not-allowed' : 'pointer', boxShadow: !ready ? 'none' : `0 0 26px ${a(ACC, '55')}` }}>
            {!ready ? 'PICK A FOOD OR ENTER MACROS' : posting ? 'TRANSMITTING…' : `CONFIRM LOG · ${mk} KCAL`}
          </button>
          {error && (
            <div style={{ fontFamily: FM, fontSize: '7.5px', letterSpacing: '.14em', color: R, marginTop: 9 }}>
              {error}
            </div>
          )}
        </div>
      </div>
    </SubShell>
  )
}

// ── NUTRITION // DINNER CANDIDATES — 3 selectable cards + lock-in ──
// `dinners` (from holoLive.mapDinners) replaces the fixture candidates.
export function DinnerSub({ onClose, sel, locked, onPick, onLock, dinners, budget }) {
  const list = dinners || DINNERS
  const kcalOpen = Math.max(1, budget?.kcalOpen ?? 860)
  const proteinGap = Math.max(1, budget?.proteinGap ?? 53)
  const d = list[Math.min(sel, list.length - 1)]
  return (
    <SubShell subKey="dinner" onClose={onClose} meta={`PROTEIN GAP ${proteinGap}G`}>
      <div style={{ display: 'flex', gap: 14, flexWrap: 'wrap' }}>
        {list.map((dn, i) => {
          const isSel = i === sel
          return (
            <button key={i} onClick={() => onPick(i)} style={{ flex: 1, minWidth: 216, padding: '14px 15px', background: isSel ? `linear-gradient(180deg, ${a(ACC, '1c')}, ${deep(72)})` : `linear-gradient(180deg, ${a(ACC, '0a')}, ${deep(55)})`, border: `1px solid ${isSel ? ACC : a(ACC, '26')}`, cursor: 'pointer', textAlign: 'left', transform: isSel ? 'translateY(-4px)' : 'none', transition: 'transform .3s ease, border-color .3s ease', boxShadow: isSel ? `0 0 34px ${a(ACC, '33')}` : 'none' }}>
              <span style={{ display: 'block', fontFamily: FM, fontSize: '7.5px', letterSpacing: '.26em', color: dn.tc, marginBottom: 7 }}>▸ {dn.tag}</span>
              <span style={{ display: 'block', fontFamily: FB, fontSize: 21, fontWeight: 400, color: W, lineHeight: 1.15 }}>{dn.n}</span>
              <span style={{ display: 'flex', alignItems: 'baseline', gap: 8, margin: '8px 0 10px' }}>
                <span style={{ fontFamily: FD, fontSize: 32, fontWeight: 700, color: W, textShadow: `0 0 12px ${a(ACC, '66')}` }}>{dn.k}</span>
                <span style={{ fontFamily: FM, fontSize: 8, letterSpacing: '.14em', color: a(ACC, '99') }}>KCAL · {dn.p}G PROTEIN</span>
              </span>
              <span style={{ display: 'block', height: 5, background: a(ACC, '14'), border: `1px solid ${a(ACC, '20')}`, overflow: 'hidden', marginBottom: 4 }}>
                <span style={{ display: 'block', height: '100%', width: Math.min(100, (dn.p / proteinGap) * 100).toFixed(0) + '%', background: `linear-gradient(90deg, ${a(ACC, '88')}, ${ACC})`, boxShadow: `0 0 8px ${a(ACC, '66')}` }} />
              </span>
              <span style={{ display: 'block', fontFamily: FM, fontSize: 7, letterSpacing: '.12em', color: a(ACC, '99'), marginBottom: 9 }}>CLOSES {Math.min(100, Math.round((dn.p / proteinGap) * 100))}% OF PROTEIN GAP</span>
              <span style={{ display: 'block', fontFamily: FB, fontSize: '14.5px', fontWeight: 300, lineHeight: 1.45, color: mix(BODY, 78) }}>{dn.note}</span>
            </button>
          )
        })}
      </div>
      <div style={{ display: 'flex', gap: 14, alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', marginTop: 16, borderTop: `1px solid ${a(ACC, '1a')}`, paddingTop: 13 }}>
        <span style={{ fontFamily: FM, fontSize: '8.5px', letterSpacing: '.16em', color: a(ACC, '99') }}>
          AFTER DINNER → <span style={{ color: W }}>{Math.max(0, kcalOpen - d.k)} KCAL OPEN</span> · PROTEIN GAP <span style={{ color: W }}>{Math.max(0, proteinGap - d.p)}G</span>
        </span>
        <button onClick={onLock} style={{ minHeight: 44, padding: '0 26px', fontFamily: FM, fontSize: '9.5px', letterSpacing: '.22em', color: INK, background: locked ? `linear-gradient(135deg, ${G}, ${mix(G, 73)})` : `linear-gradient(135deg, ${ACC}, ${a(ACC, 'bb')})`, border: `1px solid ${locked ? G : ACC}`, cursor: 'pointer', boxShadow: `0 0 26px ${locked ? mix(G, 33) : a(ACC, '55')}` }}>
          {locked ? '✓ DINNER LOCKED · 19:30' : 'LOCK IN SELECTION'}
        </button>
      </div>
    </SubShell>
  )
}

// ── NUTRITION // FUEL TIMELINE — 06→24h rail + cumulative curve ──
export function PlanDaySub({ onClose }) {
  const ticks = [6, 9, 12, 15, 18, 21, 24].map(t => ({ left: (((t - 6) / 18) * 100).toFixed(1) + '%', label: pad2(t % 24) + ':00' }))
  const now = new Date()
  const nh = Math.min(24, Math.max(6, now.getHours() + now.getMinutes() / 60))
  const nowLeft = (((nh - 6) / 18) * 100).toFixed(1) + '%'
  const pts = FUEL_CURVE.map(p => (((p[0] - 6) / 18) * 640).toFixed(1) + ',' + (58 - (p[1] / 2100) * 50).toFixed(1)).join(' ')
  const legend = [
    { label: 'LOGGED', dot: { background: ACC } },
    { label: 'PROJECTED', dot: { border: `1px dashed ${ACC}` } },
    { label: 'OPTIONAL', dot: { border: `1px solid ${a(ACC, '44')}`, opacity: 0.5 } },
  ]
  return (
    <SubShell subKey="planday" onClose={onClose}>
      <div style={{ position: 'relative', height: 168, margin: '26px 6px 0' }}>
        {ticks.map((tk, i) => (
          <div key={i}>
            <div style={{ position: 'absolute', left: tk.left, top: 0, bottom: 0, width: 1, background: a(ACC, '12') }} />
            <div style={{ position: 'absolute', left: tk.left, bottom: -18, transform: 'translateX(-50%)', fontFamily: FM, fontSize: 7, letterSpacing: '.1em', color: a(ACC, '99') }}>{tk.label}</div>
          </div>
        ))}
        <div style={{ position: 'absolute', left: 0, right: 0, top: '50%', height: 1, background: `linear-gradient(90deg, ${a(ACC, '66')}, ${a(ACC, '22')})` }} />
        <div style={{ position: 'absolute', left: nowLeft, top: '6%', bottom: '6%', width: 1, background: G, boxShadow: `0 0 10px ${G}`, animation: 'holo-beamPulse 2.4s ease-in-out infinite' }} />
        <div style={{ position: 'absolute', left: nowLeft, top: -4, transform: 'translateX(-50%)', fontFamily: FM, fontSize: '6.5px', letterSpacing: '.2em', color: G }}>NOW</div>
        {FUEL_NODES.map((nd, i) => {
          const left = (((nd.h - 6) / 18) * 100).toFixed(1) + '%'
          const op = nd.st === 'opt' ? 0.5 : 1
          return (
            <div key={i}>
              <div style={{ position: 'absolute', left, top: '50%', transform: 'translate(-50%,-50%)', zIndex: 2 }}>
                <i style={{ display: 'block', width: 13, height: 13, borderRadius: '50%', background: nd.st === 'log' ? ACC : 'transparent', border: nd.st === 'log' ? `1px solid ${ACC}` : nd.st === 'proj' ? `1px dashed ${ACC}` : `1px solid ${a(ACC, '55')}`, boxShadow: nd.st === 'log' ? `0 0 12px ${ACC}` : nd.st === 'proj' ? `0 0 8px ${a(ACC, '44')}` : 'none', opacity: op }} />
              </div>
              <div style={{ position: 'absolute', left, top: '50%', transform: 'translateX(-50%)', marginTop: nd.up ? -56 : 16, textAlign: 'center', whiteSpace: 'nowrap', opacity: op }}>
                <div style={{ fontFamily: FB, fontSize: '14.5px', fontWeight: 400, color: 'var(--phx-text)', lineHeight: 1.15 }}>{nd.n}</div>
                <div style={{ fontFamily: FM, fontSize: 7, letterSpacing: '.1em', color: a(ACC, '99') }}>{nd.t} · {nd.k} KCAL</div>
              </div>
            </div>
          )
        })}
      </div>
      <div style={{ margin: '30px 6px 0' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 5 }}>
          <span style={{ fontFamily: FM, fontSize: '7.5px', letterSpacing: '.26em', color: a(ACC, '99') }}>CUMULATIVE FUEL CURVE</span>
          <span style={{ fontFamily: FM, fontSize: '7.5px', letterSpacing: '.14em', color: a(ACC, 'cc') }}>TARGET 2,100</span>
        </div>
        <svg viewBox="0 0 640 64" preserveAspectRatio="none" style={{ width: '100%', height: 76, display: 'block' }}>
          <line x1="0" y1="8" x2="640" y2="8" stroke={a(ACC, '44')} strokeWidth="1" strokeDasharray="5 5" />
          <polyline points={pts + ' 640,58 0,58'} fill={a(ACC, '14')} stroke="none" />
          <polyline points={pts} fill="none" stroke={ACC} strokeWidth="1.8" style={{ filter: `drop-shadow(0 0 4px ${ACC})` }} />
        </svg>
      </div>
      <div style={{ display: 'flex', gap: 14, justifyContent: 'center', marginTop: 14, flexWrap: 'wrap' }}>
        {legend.map((lg, i) => (
          <span key={i} style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontFamily: FM, fontSize: '7.5px', letterSpacing: '.14em', color: a(ACC, '99') }}>
            <i style={{ width: 9, height: 9, borderRadius: '50%', ...lg.dot }} />
            {lg.label}
          </span>
        ))}
      </div>
    </SubShell>
  )
}

// ── NUTRITION // MORNING WEIGH-IN — entry + sparse-log trend ──
// The weigh-in log is irregular by nature, so this screen states how old the
// newest reading is rather than presenting it as today's weight.
// Trend arithmetic lives in weightTrendModel.
export function WeighInSub({ onClose, onLogged }) {
  const [history, setHistory] = useState([])
  const [baseline, setBaseline] = useState(null)
  const [entry, setEntry] = useState('')
  const [loading, setLoading] = useState(true)
  const [posting, setPosting] = useState(false)
  const [error, setError] = useState('')

  const load = useCallback(async () => {
    try {
      // 3650 days: the log is sparse, and a 30-day window hides the whole cut.
      const data = await getWeightHistory(3650)
      setHistory(data?.weights || [])
      setBaseline(data?.baseline_weight_kg ?? null)
    } catch {
      setError('WEIGHT LOG UNREACHABLE')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { load() }, [load])

  const trend = useMemo(() => weightTrend(history, { today: new Date().toISOString().slice(0, 10) }), [history])
  const parsed = parseWeightInput(entry)
  const points = useMemo(() => sparklinePoints(history, 260, 64), [history])
  const path = useMemo(() => sparklinePath(history, 260, 64), [history])

  const submit = async () => {
    if (parsed === null || posting) return
    setPosting(true)
    setError('')
    try {
      await logWeight(parsed)
      setEntry('')
      await load()
      await onLogged?.()
    } catch {
      setError('LOG FAILED — LINK DOWN · TAP TO RETRY')
    } finally {
      setPosting(false)
    }
  }

  const stat = (label, value, color) => (
    <div style={{ flex: 1, minWidth: 96 }}>
      <div style={{ fontFamily: FM, fontSize: '6.5px', letterSpacing: '.24em', color: a(ACC, '99'), marginBottom: 4 }}>{label}</div>
      <div style={{ fontFamily: FD, fontSize: 21, fontWeight: 700, color: color || 'var(--phx-text)' }}>{value}</div>
    </div>
  )

  return (
    <SubShell subKey="weighin" onClose={onClose} meta={trend.latest ? `LAST ${trend.latest.kg} KG` : 'NO ENTRIES'}>
      <div style={{ display: 'flex', gap: 22, flexWrap: 'wrap' }}>
        <div style={{ flex: 1, minWidth: 268 }}>
          <SubLabel>THIS MORNING — KG</SubLabel>
          <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
            <input
              value={entry}
              onChange={e => setEntry(e.target.value.replace(/[^\d.,]/g, ''))}
              onKeyDown={e => e.key === 'Enter' && submit()}
              inputMode="decimal"
              placeholder="77.6"
              style={{ flex: 1, minWidth: 0, minHeight: 46, padding: '0 12px', fontFamily: FD, fontSize: 24, fontWeight: 700, color: 'var(--phx-text)', background: deep(62), border: `1px solid ${a(ACC, '44')}`, outline: 'none' }}
            />
            <button
              onClick={submit}
              disabled={parsed === null || posting}
              style={{ minHeight: 46, padding: '0 18px', fontFamily: FM, fontSize: 9, letterSpacing: '.2em', color: parsed === null ? a(ACC, '77') : INK, background: parsed === null ? deep(50) : `linear-gradient(135deg, ${ACC}, ${a(ACC, 'bb')})`, border: `1px solid ${parsed === null ? a(ACC, '30') : ACC}`, cursor: parsed === null || posting ? 'not-allowed' : 'pointer', whiteSpace: 'nowrap' }}
            >
              {posting ? 'SAVING…' : 'LOG'}
            </button>
          </div>
          {error && (
            <div style={{ fontFamily: FM, fontSize: '7.5px', letterSpacing: '.14em', color: R, marginTop: 9 }}>{error}</div>
          )}

          <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', marginTop: 20 }}>
            {stat('LATEST', trend.latest ? `${trend.latest.kg}` : '—')}
            {stat('VS PREVIOUS', formatDelta(trend.change), trend.change > 0 ? Y : trend.change < 0 ? G : undefined)}
            {stat('OVER WINDOW', formatDelta(trend.sinceFirst), trend.sinceFirst > 0 ? Y : trend.sinceFirst < 0 ? G : undefined)}
          </div>

          <div style={{ fontFamily: FM, fontSize: '7.5px', letterSpacing: '.12em', color: a(ACC, '99'), marginTop: 16, lineHeight: 1.7 }}>
            {loading ? 'LOADING LOG…' : trend.count === 0 ? 'NO WEIGH-INS YET' : (
              <>
                {trend.count} ENTRIES{trend.spanDays ? ` · ${trend.spanDays} DAYS` : ''}
                {baseline != null && <><br />BASELINE {baseline} KG</>}
                {trend.latestGapDays > 1 && (
                  <><br /><span style={{ color: Y }}>NEWEST READING IS {trend.latestGapDays} DAYS OLD</span></>
                )}
              </>
            )}
          </div>
        </div>

        <div style={{ flex: 1.1, minWidth: 280 }}>
          <SubLabel>TREND — SPACED BY REAL DATE</SubLabel>
          {points.length > 1 ? (
            <svg viewBox="0 0 260 64" style={{ width: '100%', height: 84, display: 'block', overflow: 'visible' }}>
              <polyline points={path} fill="none" stroke={ACC} strokeWidth="1.5" strokeLinejoin="round" strokeLinecap="round" style={{ filter: `drop-shadow(0 0 6px ${a(ACC, '88')})` }} />
              {points.map(p => (
                <circle key={p.date} cx={p.x} cy={p.y} r="2.5" fill={p === points[points.length - 1] ? W : ACC} />
              ))}
            </svg>
          ) : (
            <div style={{ fontFamily: FM, fontSize: 8, letterSpacing: '.14em', color: a(ACC, '77'), padding: '18px 2px' }}>
              {points.length === 1 ? 'ONE ENTRY — LOG AGAIN TOMORROW FOR A TREND' : 'NO DATA TO PLOT'}
            </div>
          )}
          <div style={{ maxHeight: 168, overflowY: 'auto', display: 'grid', gap: 4, marginTop: 12 }}>
            {[...history].reverse().map(w => (
              <div key={w.id ?? w.log_date} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', padding: '6px 9px', background: deep(56), border: `1px solid ${a(ACC, '20')}` }}>
                <span style={{ fontFamily: FM, fontSize: 8, letterSpacing: '.12em', color: a(ACC, '99') }}>{w.log_date}</span>
                <span style={{ fontFamily: FD, fontSize: 15, fontWeight: 600, color: 'var(--phx-text)' }}>{w.weight_kg} KG</span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </SubShell>
  )
}
