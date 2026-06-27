import { useState, useEffect } from 'react'
import { getNutritionStatus, deleteMeal, getMealHistory, postJarvisChat } from '../../api/client'

// ─── Shared Colors ─────────────────────────────────────────────────────────────
const LIME = '#9dff6f'
const LIME_BR = '#d5ffc7'
const LIME_MUTED = 'rgba(157,255,111,.36)'
const BORDER = 'rgba(32,216,236,.18)'
const MUTED = 'rgba(32,216,236,.38)'
const TEXT_DIM = 'rgba(158,204,190,.58)'
const PROTEIN_COL = '#7df0ff'
const CARB_COL = '#ffd56b'
const FAT_COL = '#ff9f43'

// ─── Concentric Macro Rings ────────────────────────────────────────────────────
function MacroRings({ proteinPct, carbPct, fatPct }) {
  // protein: r=54 circ=339, carb: r=40 circ=251, fat: r=27 circ=170
  const pOff = (339 * (1 - proteinPct)).toFixed(0)
  const cOff = (251 * (1 - carbPct)).toFixed(0)
  const fOff = (170 * (1 - fatPct)).toFixed(0)

  return (
    <div style={{ display: 'grid', gridTemplateColumns: '128px 1fr', gap: 15, alignItems: 'center' }}>
      <div style={{ position: 'relative', width: 128, height: 128 }}>
        <svg width="128" height="128" viewBox="0 0 128 128">
          <circle cx="64" cy="64" r="54" fill="none" stroke="rgba(32,216,236,.10)" strokeWidth="8" />
          <circle cx="64" cy="64" r="54" fill="none" stroke={PROTEIN_COL} strokeWidth="8"
            strokeDasharray="339" strokeDashoffset={pOff}
            strokeLinecap="round" transform="rotate(-90 64 64)" />
          <circle cx="64" cy="64" r="40" fill="none" stroke={CARB_COL} strokeWidth="7"
            strokeDasharray="251" strokeDashoffset={cOff}
            strokeLinecap="round" transform="rotate(-90 64 64)" />
          <circle cx="64" cy="64" r="27" fill="none" stroke={FAT_COL} strokeWidth="6"
            strokeDasharray="170" strokeDashoffset={fOff}
            strokeLinecap="round" transform="rotate(-90 64 64)" />
        </svg>
        <div style={{ position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center' }}>
          <div style={{ fontFamily: 'var(--display)', fontSize: 26, fontWeight: 700, color: LIME_BR, lineHeight: 1 }}>GOOD</div>
          <div style={{ fontFamily: 'var(--mono)', fontSize: 7, letterSpacing: '.12em', color: MUTED, marginTop: 3 }}>BALANCE</div>
        </div>
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 7 }}>
        {[
          { label: 'PROTEIN', color: PROTEIN_COL, pct: Math.round(proteinPct * 100) },
          { label: 'CARBS',   color: CARB_COL,    pct: Math.round(carbPct * 100) },
          { label: 'FATS',    color: FAT_COL,      pct: Math.round(fatPct * 100) },
        ].map(({ label, color, pct }) => (
          <div key={label} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', fontFamily: 'var(--mono)', fontSize: 8, letterSpacing: '.09em', color: TEXT_DIM }}>
            <span>
              <i style={{ width: 7, height: 7, marginRight: 6, display: 'inline-block', background: color }} />
              {label}
            </span>
            <b style={{ color: 'rgba(220,248,236,.94)' }}>{pct}%</b>
          </div>
        ))}
      </div>
    </div>
  )
}

// ─── Main Component ────────────────────────────────────────────────────────────

export default function NutritionDashboard({ onBack, onLogMeal, onRecipes, onWeight, onQuickAsk }) {
  const [status, setStatus] = useState(null)
  const [historyData, setHistoryData] = useState(null)
  const [trendText, setTrendText] = useState(null)
  const [loading, setLoading] = useState(true)
  const [deleting, setDeleting] = useState(null)

  async function load() {
    setLoading(true)
    try {
      const [s, h] = await Promise.all([getNutritionStatus(), getMealHistory(14)])
      setStatus(s)
      setHistoryData(h)
    } catch {}
    setLoading(false)
  }

  useEffect(() => { load() }, [])

  useEffect(() => {
    if (!historyData) return
    postJarvisChat({ domain: 'nutrition', message: 'Give me a one-sentence trend read on my nutrition this week' })
      .then(r => setTrendText(r?.response || r?.text || null))
      .catch(() => {})
  }, [historyData])

  async function handleDelete(id) {
    setDeleting(id)
    try { await deleteMeal(id); await load() } catch {}
    setDeleting(null)
  }

  if (loading) return (
    <div style={{ height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#000', color: MUTED, fontFamily: 'var(--mono)', fontSize: 12 }}>Loading…</div>
  )

  // If no status, show prototype data
  const { target, logged, remaining_calories, is_training_day, phase, meal_log, suggested_recipes } = status || {}
  const meals = meal_log || []
  const kcalLogged = logged?.total_calories ?? 2060
  const kcalTarget = target?.calories ?? 2840
  const kcalLeft = remaining_calories ?? (kcalTarget - kcalLogged)
  const proteinLogged = logged?.total_protein_g ?? 142
  const proteinTarget = target?.protein_g ?? 188
  const carbLogged = logged?.total_carbs_g ?? 226
  const carbTarget = target?.carbs_g ?? 310
  const fatLogged = logged?.total_fat_g ?? 58
  const fatTarget = target?.fat_g ?? 78
  const calPct = Math.min(1, kcalLogged / Math.max(1, kcalTarget))

  const proteinPct = Math.min(1, proteinLogged / Math.max(1, proteinTarget))
  const carbPct = Math.min(1, carbLogged / Math.max(1, carbTarget))
  const fatPct = Math.min(1, fatLogged / Math.max(1, fatTarget))
  const overallPct = Math.round((proteinPct + carbPct + fatPct) / 3 * 100)

  // Heatmap data from history or prototype
  const heatData = historyData?.history?.slice(-14).map((d, i) => {
    const pct = d.calories / Math.max(1, historyData.target_calories || 2840)
    const st = pct > 0.9 && pct < 1.12 ? 'good' : pct >= 0.75 ? 'warn' : 'miss'
    return { label: ['M','T','W','T','F','S','S'][i % 7], state: st }
  }) || [
    { label: 'M', state: 'good' }, { label: 'T', state: 'good' }, { label: 'W', state: 'warn' },
    { label: 'T', state: 'good' }, { label: 'F', state: 'good' }, { label: 'S', state: 'miss' },
    { label: 'S', state: 'good' }, { label: 'M', state: 'good' }, { label: 'T', state: 'good' },
    { label: 'W', state: 'good' }, { label: 'T', state: 'warn' }, { label: 'F', state: 'good' },
    { label: 'S', state: 'good' }, { label: 'S', state: 'good' },
  ]

  const heatColors = {
    good: { bg: 'rgba(157,255,111,.18)', border: 'rgba(157,255,111,.28)', color: LIME_BR },
    warn: { bg: 'rgba(255,213,107,.12)', border: 'rgba(255,213,107,.2)', color: '#ffd56b' },
    miss: { bg: 'rgba(255,92,122,.10)', border: 'rgba(255,92,122,.18)', color: '#ff5c7a' },
  }

  return (
    <div style={{ height: '100%', display: 'flex', flexDirection: 'column', background: '#000', color: 'rgba(220,248,236,.94)', fontFamily: "'Saira Condensed',sans-serif" }}>
      {/* TOP BAR */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '13px 18px 11px', borderBottom: `1px solid ${BORDER}`, position: 'sticky', top: 0, background: 'rgba(0,0,0,.96)', backdropFilter: 'blur(12px)', zIndex: 5, flexShrink: 0 }}>
        <div style={{ display: 'flex', alignItems: 'center' }}>
          <span onClick={onBack} style={{ color: '#20d8ec', fontSize: 16, marginRight: 10, cursor: 'pointer' }}>←</span>
          <span style={{ fontFamily: 'var(--display)', fontSize: 13, fontWeight: 700, letterSpacing: '.28em', color: LIME_BR, filter: 'drop-shadow(0 0 8px rgba(157,255,111,.22))' }}>NUTRITION</span>
        </div>
        <span style={{ fontFamily: 'var(--mono)', fontSize: 8, letterSpacing: '.14em', color: LIME, border: `1px solid rgba(157,255,111,.32)`, background: 'rgba(157,255,111,.055)', padding: '2px 8px' }}>
          {phase ? phase.toUpperCase() + ' PHASE' : 'CUT PHASE'}
        </span>
      </div>

      <div style={{ flex: 1, overflowY: 'auto' }}>
        {/* CALORIE HERO */}
        <div style={{ padding: '20px 20px 18px', borderBottom: `1px solid ${BORDER}`, background: 'linear-gradient(180deg,rgba(157,255,111,.045),transparent)' }}>
          <div style={{ fontFamily: 'var(--mono)', fontSize: 8, letterSpacing: '.22em', color: MUTED, marginBottom: 8 }}>DAILY ENERGY TARGET</div>
          <div style={{ display: 'flex', alignItems: 'flex-end', gap: 14 }}>
            <div style={{ fontFamily: 'var(--display)', fontSize: 62, fontWeight: 700, lineHeight: .9, background: `linear-gradient(155deg,#fff 0%,${LIME_BR} 48%,${LIME} 100%)`, WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent', filter: 'drop-shadow(0 0 22px rgba(157,255,111,.38))' }}>
              {Math.round(kcalLogged).toLocaleString()}
            </div>
            <div style={{ fontFamily: 'var(--display)', fontSize: 16, letterSpacing: '.18em', color: LIME_MUTED, paddingBottom: 7 }}>/ {kcalTarget.toLocaleString()} KCAL</div>
          </div>
          <div style={{ fontFamily: 'var(--mono)', fontSize: 8, letterSpacing: '.14em', color: TEXT_DIM, marginTop: 10 }}>
            {Math.max(0, Math.round(kcalLeft))} KCAL LEFT · PROTEIN ON TRACK · DINNER PENDING
          </div>
          <div style={{ height: 3, background: 'rgba(157,255,111,.12)', marginTop: 10, overflow: 'hidden' }}>
            <div style={{ height: '100%', width: `${Math.min(100, calPct * 100).toFixed(0)}%`, background: `linear-gradient(90deg,${LIME},${LIME_BR})`, boxShadow: `0 0 10px ${LIME}` }} />
          </div>
        </div>

        {/* MACROS GRID */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', borderBottom: `1px solid ${BORDER}` }}>
          {[
            { label: 'PROTEIN', val: `${Math.round(proteinLogged)}g`, sub: `${proteinTarget}g target`, color: PROTEIN_COL },
            { label: 'CARBS',   val: `${Math.round(carbLogged)}g`,   sub: `${carbTarget}g target`,    color: CARB_COL },
            { label: 'FATS',    val: `${Math.round(fatLogged)}g`,    sub: `${fatTarget}g target`,      color: FAT_COL },
          ].map(({ label, val, sub, color }, i) => (
            <div key={label} style={{ padding: '13px 12px', borderRight: i < 2 ? `1px solid ${BORDER}` : 'none', textAlign: 'center' }}>
              <div style={{ fontFamily: 'var(--mono)', fontSize: 7, letterSpacing: '.16em', color: MUTED, marginBottom: 5 }}>{label}</div>
              <div style={{ fontFamily: 'var(--display)', fontSize: 23, fontWeight: 700, lineHeight: 1, color }}>{val}</div>
              <div style={{ fontFamily: 'var(--mono)', fontSize: 7, letterSpacing: '.08em', color: TEXT_DIM, marginTop: 4 }}>{sub}</div>
            </div>
          ))}
        </div>

        {/* MACRO BALANCE RINGS */}
        <div style={{ padding: '16px 18px', borderBottom: `1px solid ${BORDER}` }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
            <span style={{ fontFamily: 'var(--mono)', fontSize: 8, letterSpacing: '.22em', color: MUTED }}>MACRO BALANCE</span>
            <span style={{ fontFamily: 'var(--display)', fontSize: 16, fontWeight: 600, color: LIME }}>{overallPct}%</span>
          </div>
          <MacroRings proteinPct={proteinPct} carbPct={carbPct} fatPct={fatPct} />
        </div>

        {/* TODAY'S MEALS */}
        <div style={{ padding: '16px 18px', borderBottom: `1px solid ${BORDER}` }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
            <span style={{ fontFamily: 'var(--mono)', fontSize: 8, letterSpacing: '.22em', color: MUTED }}>TODAY'S MEALS</span>
            <span style={{ fontFamily: 'var(--display)', fontSize: 16, fontWeight: 600, color: LIME }}>{meals.length > 0 ? `${meals.length} / ${meals.length + (kcalLeft > 100 ? 1 : 0)}` : '3 / 4'}</span>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {meals.length > 0 ? meals.map(m => (
              <div key={m.id} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '11px 12px', border: `1px solid rgba(32,216,236,.12)`, background: 'rgba(157,255,111,.018)' }}>
                <div>
                  <div style={{ fontFamily: 'var(--display)', fontSize: 15, fontWeight: 600, letterSpacing: '.06em', color: '#fff' }}>{m.name}</div>
                  <div style={{ fontFamily: 'var(--mono)', fontSize: 7, letterSpacing: '.11em', color: TEXT_DIM, marginTop: 2 }}>{Math.round(m.protein_g)}G PROTEIN · {m.servings > 1 ? `×${m.servings}` : ''}</div>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                  <span style={{ fontFamily: 'var(--mono)', fontSize: 12, color: LIME_BR }}>{Math.round(m.calories)}</span>
                  <button onClick={() => handleDelete(m.id)} disabled={deleting === m.id}
                    style={{ background: 'none', border: 'none', color: MUTED, fontSize: 16, cursor: 'pointer', padding: '0 4px' }}>×</button>
                </div>
              </div>
            )) : [
              { name: 'Breakfast Bowl', meta: 'OATS · WHEY · BANANA', kcal: 620 },
              { name: 'Chicken Rice Box', meta: 'HIGH PROTEIN · PREP', kcal: 740 },
              { name: 'Greek Yogurt', meta: 'SNACK · RECOVERY', kcal: 280 },
              { name: 'Dinner Pending', meta: `${Math.round(kcalLeft)} KCAL AVAILABLE`, kcal: null },
            ].map((m, i) => (
              <div key={i} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '11px 12px', border: `1px solid rgba(32,216,236,.12)`, background: 'rgba(157,255,111,.018)' }}>
                <div>
                  <div style={{ fontFamily: 'var(--display)', fontSize: 15, fontWeight: 600, letterSpacing: '.06em', color: '#fff' }}>{m.name}</div>
                  <div style={{ fontFamily: 'var(--mono)', fontSize: 7, letterSpacing: '.11em', color: TEXT_DIM, marginTop: 2 }}>{m.meta}</div>
                </div>
                <span style={{ fontFamily: 'var(--mono)', fontSize: 12, color: LIME_BR }}>{m.kcal ? m.kcal : '+'}</span>
              </div>
            ))}
          </div>
        </div>

        {/* QUICK ACTIONS */}
        <div style={{ padding: '16px 18px', borderBottom: `1px solid ${BORDER}` }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
            <span style={{ fontFamily: 'var(--mono)', fontSize: 8, letterSpacing: '.22em', color: MUTED }}>QUICK ACTIONS</span>
            <span style={{ fontFamily: 'var(--display)', fontSize: 16, fontWeight: 600, color: LIME }}>LOG</span>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
            {[
              { label: 'LOG MEAL', action: onLogMeal },
              { label: 'RECIPES', action: onRecipes },
              { label: 'TRENDS', action: onWeight },
              { label: 'ASK PHOENIX', action: () => onQuickAsk?.('What should I eat for dinner?') },
            ].map(({ label, action }) => (
              <button key={label} onClick={action}
                style={{ padding: '12px 10px', border: `1px solid rgba(157,255,111,.22)`, background: 'rgba(157,255,111,.045)', fontFamily: 'var(--mono)', fontSize: 8, letterSpacing: '.16em', color: LIME, textAlign: 'center', cursor: 'pointer' }}>
                {label}
              </button>
            ))}
          </div>
        </div>

        {/* ADHERENCE HEATMAP (14 days) */}
        <div style={{ padding: '16px 18px', borderBottom: `1px solid ${BORDER}` }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
            <span style={{ fontFamily: 'var(--mono)', fontSize: 8, letterSpacing: '.22em', color: MUTED }}>ADHERENCE HEATMAP</span>
            <span style={{ fontFamily: 'var(--display)', fontSize: 16, fontWeight: 600, color: LIME }}>
              {heatData.filter(d => d.state === 'good').length} / {heatData.length}
            </span>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7,1fr)', gap: 5 }}>
            {heatData.map((d, i) => {
              const c = heatColors[d.state]
              return (
                <div key={i} style={{ height: 32, border: `1px solid ${c.border}`, background: c.bg, display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: 'var(--mono)', fontSize: 7, color: c.color }}>
                  {d.label}
                </div>
              )
            })}
          </div>
        </div>

        {/* PHOENIX NOTE */}
        {trendText && (
          <div style={{ margin: '14px 18px 0', padding: '11px 13px', border: `1px solid rgba(32,216,236,.16)`, borderLeft: `3px solid ${LIME}`, background: 'rgba(157,255,111,.025)' }}>
            <div style={{ fontFamily: 'var(--mono)', fontSize: 7, letterSpacing: '.2em', color: 'rgba(157,255,111,.48)', marginBottom: 6 }}>PHOENIX ASSESSMENT</div>
            <div style={{ fontSize: '12.5px', lineHeight: 1.65, color: 'rgba(220,248,236,.78)' }}>{trendText}</div>
          </div>
        )}

        <div style={{ height: 32 }} />
      </div>
    </div>
  )
}
