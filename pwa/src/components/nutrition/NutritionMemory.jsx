import { useEffect, useMemo, useState } from 'react'
import {
  getLidlStaples,
  getNutritionMemory,
  saveNutritionMemory,
  deleteNutritionMemory,
  getRecentMeals,
  getRepeatYesterdayPreview,
  logRepeatYesterday,
} from '../../api/client'

const LIME = '#9dff6f'
const LIME_BR = '#d5ffc7'
const BORDER = 'rgba(32,216,236,.18)'
const MUTED = 'rgba(32,216,236,.38)'
const TEXT_DIM = 'rgba(158,204,190,.58)'
const CYAN = '#20d8ec'

function fmt(value, suffix = '') {
  const n = Number(value || 0)
  const rounded = Math.round(n * 10) / 10
  return `${Number.isInteger(rounded) ? rounded.toFixed(0) : rounded}${suffix}`
}

function CountCard({ label, value }) {
  return (
    <div style={{ border: `1px solid ${BORDER}`, background: 'rgba(157,255,111,.025)', padding: '10px 11px' }}>
      <div style={{ fontFamily: 'var(--mono)', fontSize: 7, letterSpacing: '.16em', color: MUTED }}>{label}</div>
      <div style={{ fontFamily: 'var(--display)', fontSize: 24, color: LIME_BR, fontWeight: 700, marginTop: 3 }}>{value}</div>
    </div>
  )
}

function ActionButton({ children, onClick, tone = 'lime', disabled = false }) {
  const danger = tone === 'danger'
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      style={{
        border: `1px solid ${danger ? 'rgba(255,92,122,.42)' : 'rgba(157,255,111,.28)'}`,
        background: danger ? 'rgba(255,92,122,.045)' : 'rgba(157,255,111,.045)',
        color: danger ? '#ff5c7a' : LIME,
        fontFamily: 'var(--mono)',
        fontSize: 7,
        letterSpacing: '.14em',
        padding: '8px 9px',
        cursor: disabled ? 'not-allowed' : 'pointer',
        opacity: disabled ? .45 : 1,
      }}
    >{children}</button>
  )
}

function EntryRow({ entry, onDelete }) {
  return (
    <div style={{ display: 'grid', gridTemplateColumns: '1fr auto', gap: 10, alignItems: 'center', padding: '10px 0', borderBottom: `1px solid rgba(32,216,236,.08)` }}>
      <div>
        <div style={{ fontFamily: 'var(--display)', fontSize: 16, fontWeight: 700, color: '#fff' }}>{entry.name}</div>
        <div style={{ fontFamily: 'var(--mono)', fontSize: 7, letterSpacing: '.11em', color: TEXT_DIM, marginTop: 2 }}>
          {entry.kind.toUpperCase()} · {entry.item_type || 'general'} {entry.note ? `· ${entry.note}` : ''}
        </div>
      </div>
      <ActionButton tone="danger" onClick={() => onDelete(entry.id)}>DELETE</ActionButton>
    </div>
  )
}

export default function NutritionMemory({ onBack, onSuccess }) {
  const [memory, setMemory] = useState(null)
  const [staples, setStaples] = useState([])
  const [recent, setRecent] = useState([])
  const [repeat, setRepeat] = useState(null)
  const [manualAvoid, setManualAvoid] = useState('')
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState('')
  const [error, setError] = useState('')

  async function load() {
    setLoading(true)
    setError('')
    try {
      const [m, s, r, y] = await Promise.all([
        getNutritionMemory(),
        getLidlStaples(),
        getRecentMeals(8),
        getRepeatYesterdayPreview().catch(() => null),
      ])
      setMemory(m)
      setStaples(s.staples || [])
      setRecent(r.meals || [])
      setRepeat(y)
    } catch {
      setError('Nutrition memory unavailable. Backend may be offline.')
    }
    setLoading(false)
  }

  useEffect(() => { load() }, [])

  const summary = memory?.summary || {}
  const entries = memory?.entries || []
  const entryKeys = useMemo(() => new Set(entries.map(e => `${e.kind}:${e.item_type}:${e.item_id}:${e.name}`)), [entries])
  const topStaples = useMemo(() => staples.slice(0, 18), [staples])

  async function save(kind, item, note = '') {
    setSaving(`${kind}:${item.id || item.name}`)
    try {
      await saveNutritionMemory({
        kind,
        item_id: item.item_id || item.id || '',
        item_type: item.item_type || item.type || 'staple',
        name: item.name,
        note,
        payload: item,
        source: 'nutrition_memory_ui',
      })
      await load()
    } catch {
      setError('Could not save nutrition memory.')
    }
    setSaving('')
  }

  async function remove(memoryId) {
    try {
      await deleteNutritionMemory(memoryId)
      await load()
    } catch {
      setError('Could not delete nutrition memory entry.')
    }
  }

  async function saveManualAvoid() {
    const name = manualAvoid.trim()
    if (!name) return
    await save('dislike', { name, id: `manual-${name.toLowerCase().replace(/\s+/g, '-')}`, type: 'manual' }, 'Manual avoid food')
    setManualAvoid('')
  }

  async function repeatYesterday() {
    setSaving('repeat-yesterday')
    try {
      await logRepeatYesterday()
      onSuccess?.()
    } catch {
      setError('No meals from yesterday to repeat, or logging failed.')
      setSaving('')
    }
  }

  if (loading) return <div style={{ height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#000', color: MUTED, fontFamily: 'var(--mono)', fontSize: 12 }}>Loading nutrition memory…</div>

  return (
    <div style={{ height: '100%', display: 'flex', flexDirection: 'column', background: '#000', color: 'rgba(220,248,236,.94)', fontFamily: "'Saira Condensed',sans-serif" }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '13px 18px 11px', borderBottom: `1px solid ${BORDER}`, position: 'sticky', top: 0, background: 'rgba(0,0,0,.96)', backdropFilter: 'blur(12px)', zIndex: 5, flexShrink: 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', flex: 1 }}>
          <span onClick={onBack} style={{ color: CYAN, fontSize: 16, marginRight: 10, cursor: 'pointer' }}>←</span>
          <span style={{ fontFamily: 'var(--display)', fontSize: 13, fontWeight: 700, letterSpacing: '.28em', color: LIME_BR }}>NUTRITION MEMORY</span>
        </div>
        <span style={{ fontFamily: 'var(--mono)', fontSize: 8, letterSpacing: '.14em', color: LIME, border: `1px solid rgba(157,255,111,.32)`, background: 'rgba(157,255,111,.055)', padding: '2px 8px' }}>LOCAL · USER CONTROLLED</span>
      </div>

      <div style={{ flex: 1, overflowY: 'auto', paddingBottom: 130 }}>
        <div style={{ padding: '18px', borderBottom: `1px solid ${BORDER}`, background: 'linear-gradient(180deg,rgba(157,255,111,.045),transparent)' }}>
          <div style={{ fontFamily: 'var(--display)', fontSize: 32, fontWeight: 700, letterSpacing: '.08em', color: '#fff' }}>PERSONAL FOOD BRAIN</div>
          <div style={{ fontFamily: 'var(--mono)', fontSize: 8, letterSpacing: '.12em', color: TEXT_DIM, marginTop: 7 }}>
            Phoenix uses this local memory to boost favorites, prefer foods at home, and avoid foods you dislike. No AI credits required.
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: 7, marginTop: 14 }}>
            <CountCard label="FAVORITES" value={summary.favorite_count || 0} />
            <CountCard label="AVOID" value={summary.avoid_count || 0} />
            <CountCard label="PANTRY" value={summary.pantry_count || 0} />
            <CountCard label="PREFERRED" value={summary.preferred_count || 0} />
          </div>
        </div>

        {error && <div style={{ margin: '14px 18px 0', padding: '11px 13px', border: `1px solid rgba(255,92,122,.25)`, color: '#ff5c7a', fontFamily: 'var(--mono)', fontSize: 10 }}>{error}</div>}

        <div style={{ margin: '16px 18px 0', padding: '13px', border: `1px solid ${BORDER}`, background: 'rgba(157,255,111,.025)' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, alignItems: 'center' }}>
            <div>
              <div style={{ fontFamily: 'var(--mono)', fontSize: 7, letterSpacing: '.2em', color: MUTED }}>REPEAT YESTERDAY</div>
              <div style={{ fontFamily: 'var(--display)', fontSize: 19, color: '#fff', fontWeight: 700, marginTop: 3 }}>{repeat?.count || 0} MEALS AVAILABLE</div>
              {repeat?.loggable && <div style={{ fontFamily: 'var(--mono)', fontSize: 7, letterSpacing: '.1em', color: TEXT_DIM, marginTop: 3 }}>{fmt(repeat.total?.calories)} kcal · {fmt(repeat.total?.protein_g, 'g')} protein</div>}
            </div>
            <ActionButton onClick={repeatYesterday} disabled={!repeat?.loggable || saving === 'repeat-yesterday'}>{saving === 'repeat-yesterday' ? 'LOGGING…' : 'LOG AGAIN'}</ActionButton>
          </div>
        </div>

        <div style={{ padding: '16px 18px 0' }}>
          <div style={{ fontFamily: 'var(--mono)', fontSize: 8, letterSpacing: '.22em', color: MUTED, marginBottom: 9 }}>PANTRY / PREFERRED STAPLES</div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr', gap: 8 }}>
            {topStaples.map(staple => {
              const haveKey = `pantry:staple:${staple.id}:${staple.name}`
              const preferKey = `preferred:staple:${staple.id}:${staple.name}`
              const avoidKey = `dislike:staple:${staple.id}:${staple.name}`
              return (
                <div key={staple.id} style={{ border: `1px solid rgba(32,216,236,.12)`, background: 'rgba(157,255,111,.018)', padding: '10px 11px' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10 }}>
                    <div>
                      <div style={{ fontFamily: 'var(--display)', fontSize: 16, color: '#fff', fontWeight: 700 }}>{staple.name}</div>
                      <div style={{ fontFamily: 'var(--mono)', fontSize: 7, letterSpacing: '.1em', color: TEXT_DIM, marginTop: 2 }}>{fmt(staple.calories)} kcal · {fmt(staple.protein_g, 'g')} P · €{Number(staple.price_eur || 0).toFixed(2)}</div>
                    </div>
                    <div style={{ display: 'flex', gap: 6, alignItems: 'center', flexWrap: 'wrap', justifyContent: 'flex-end' }}>
                      <ActionButton onClick={() => save('pantry', { ...staple, item_type: 'staple' }, 'I have this at home')} disabled={entryKeys.has(haveKey) || saving === `pantry:${staple.id}`}>{entryKeys.has(haveKey) ? 'AT HOME' : 'HAVE'}</ActionButton>
                      <ActionButton onClick={() => save('preferred', { ...staple, item_type: 'staple' }, 'Preferred staple')} disabled={entryKeys.has(preferKey) || saving === `preferred:${staple.id}`}>{entryKeys.has(preferKey) ? 'PREFERRED' : 'PREFER'}</ActionButton>
                      <ActionButton tone="danger" onClick={() => save('dislike', { ...staple, item_type: 'staple' }, 'Avoid this food')} disabled={entryKeys.has(avoidKey) || saving === `dislike:${staple.id}`}>{entryKeys.has(avoidKey) ? 'AVOIDED' : 'AVOID'}</ActionButton>
                    </div>
                  </div>
                </div>
              )
            })}
          </div>
        </div>

        <div style={{ padding: '16px 18px 0' }}>
          <div style={{ fontFamily: 'var(--mono)', fontSize: 8, letterSpacing: '.22em', color: MUTED, marginBottom: 9 }}>MANUAL AVOID</div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr auto', gap: 8 }}>
            <input value={manualAvoid} onChange={e => setManualAvoid(e.target.value)} placeholder="e.g. mushrooms" style={{ minWidth: 0, background: 'rgba(0,0,0,.22)', border: `1px solid ${BORDER}`, color: '#fff', padding: '10px 11px', fontFamily: 'var(--display)', fontSize: 15 }} />
            <ActionButton tone="danger" onClick={saveManualAvoid} disabled={!manualAvoid.trim()}>SAVE AVOID</ActionButton>
          </div>
        </div>

        {recent.length > 0 && <div style={{ padding: '16px 18px 0' }}>
          <div style={{ fontFamily: 'var(--mono)', fontSize: 8, letterSpacing: '.22em', color: MUTED, marginBottom: 9 }}>RECENT MEALS</div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {recent.map(meal => (
              <div key={meal.id} style={{ display: 'grid', gridTemplateColumns: '1fr auto', gap: 10, alignItems: 'center', padding: '10px 11px', border: `1px solid rgba(32,216,236,.12)`, background: 'rgba(32,216,236,.025)' }}>
                <div>
                  <div style={{ fontFamily: 'var(--display)', fontSize: 16, color: '#fff', fontWeight: 700 }}>{meal.name}</div>
                  <div style={{ fontFamily: 'var(--mono)', fontSize: 7, letterSpacing: '.1em', color: TEXT_DIM, marginTop: 2 }}>{fmt(meal.calories)} kcal · {fmt(meal.protein_g, 'g')} P</div>
                </div>
                <div style={{ display: 'flex', gap: 6 }}>
                  <ActionButton onClick={() => save('favorite', { ...meal, item_id: meal.item_id, item_type: meal.item_type }, 'Favorite logged meal')}>FAVORITE</ActionButton>
                  <ActionButton tone="danger" onClick={() => save('dislike', { ...meal, item_id: meal.item_id, item_type: meal.item_type }, 'Avoid from recent meals')}>AVOID</ActionButton>
                </div>
              </div>
            ))}
          </div>
        </div>}

        <div style={{ padding: '16px 18px' }}>
          <div style={{ fontFamily: 'var(--mono)', fontSize: 8, letterSpacing: '.22em', color: MUTED, marginBottom: 9 }}>ACTIVE MEMORY</div>
          <div style={{ border: `1px solid ${BORDER}`, background: 'rgba(0,0,0,.16)', padding: '0 13px' }}>
            {entries.length > 0 ? entries.map(entry => <EntryRow key={entry.id} entry={entry} onDelete={remove} />) : (
              <div style={{ padding: '15px 0', fontFamily: 'var(--mono)', fontSize: 8, letterSpacing: '.13em', color: TEXT_DIM }}>NO MEMORY SAVED YET. MARK STAPLES, FAVORITES, OR AVOID FOODS ABOVE.</div>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
