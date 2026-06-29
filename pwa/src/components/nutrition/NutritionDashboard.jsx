import { useState, useEffect } from 'react'
import { getNutritionStatus, deleteMeal, getMealHistory, postJarvisChat } from '../../api/client'

const LIME = '#9dff6f'
const LIME_BR = '#d5ffc7'
const BORDER = 'rgba(32,216,236,.18)'
const MUTED = 'rgba(32,216,236,.38)'
const TEXT_DIM = 'rgba(158,204,190,.58)'
const PROTEIN_COL = '#7df0ff'
const CARB_COL = '#ffd56b'
const FAT_COL = '#ff9f43'

function clampPct(value, target) {
  return Math.min(1, Math.max(0, value / Math.max(1, target)))
}

function statusLabel(status) {
  if (!status) return 'EMPTY'
  if (status === 'good') return 'LOCKED'
  if (status === 'warn') return 'PARTIAL'
  if (status === 'miss') return 'MISSED'
  return 'EMPTY'
}

function MacroRings({ proteinPct, carbPct, fatPct, label }) {
  const pOff = (339 * (1 - proteinPct)).toFixed(0)
  const cOff = (251 * (1 - carbPct)).toFixed(0)
  const fOff = (170 * (1 - fatPct)).toFixed(0)

  return (
    <div style={{ display: 'grid', gridTemplateColumns: '128px 1fr', gap: 15, alignItems: 'center' }}>
      <div style={{ position: 'relative', width: 128, height: 128 }}>
        <svg width="128" height="128" viewBox="0 0 128 128">
          <circle cx="64" cy="64" r="54" fill="none" stroke="rgba(32,216,236,.10)" strokeWidth="8" />
          <circle cx="64" cy="64" r="54" fill="none" stroke={PROTEIN_COL} strokeWidth="8" strokeDasharray="339" strokeDashoffset={pOff} strokeLinecap="round" transform="rotate(-90 64 64)" />
          <circle cx="64" cy="64" r="40" fill="none" stroke={CARB_COL} strokeWidth="7" strokeDasharray="251" strokeDashoffset={cOff} strokeLinecap="round" transform="rotate(-90 64 64)" />
          <circle cx="64" cy="64" r="27" fill="none" stroke={FAT_COL} strokeWidth="6" strokeDasharray="170" strokeDashoffset={fOff} strokeLinecap="round" transform="rotate(-90 64 64)" />
        </svg>
        <div style={{ position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center' }}>
          <div style={{ fontFamily: 'var(--display)', fontSize: 23, fontWeight: 700, color: LIME_BR, lineHeight: 1 }}>{label}</div>
          <div style={{ fontFamily: 'var(--mono)', fontSize: 7, letterSpacing: '.12em', color: MUTED, marginTop: 3 }}>TODAY</div>
        </div>
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 7 }}>
        {[
          { label: 'PROTEIN', color: PROTEIN_COL, pct: Math.round(proteinPct * 100) },
          { label: 'CARBS', color: CARB_COL, pct: Math.round(carbPct * 100) },
          { label: 'FATS', color: FAT_COL, pct: Math.round(fatPct * 100) },
        ].map(({ label, color, pct }) => (
          <div key={label} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', fontFamily: 'var(--mono)', fontSize: 8, letterSpacing: '.09em', color: TEXT_DIM }}>
            <span><i style={{ width: 7, height: 7, marginRight: 6, display: 'inline-block', background: color }} />{label}</span>
            <b style={{ color: 'rgba(220,248,236,.94)' }}>{pct}%</b>
          </div>
        ))}
      </div>
    </div>
  )
}

function EmptyMeals({ kcalLeft, proteinLeft, onLogMeal }) {
  return (
    <button onClick={onLogMeal} style={{ width: '100%', textAlign: 'left', padding: '14px 13px', border: `1px dashed rgba(157,255,111,.26)`, background: 'rgba(157,255,111,.025)', cursor: 'pointer' }}>
      <div style={{ fontFamily: 'var(--display)', fontSize: 17, fontWeight: 700, letterSpacing: '.06em', color: '#fff' }}>NO MEALS LOGGED TODAY</div>
      <div style={{ fontFamily: 'var(--mono)', fontSize: 7, letterSpacing: '.11em', color: TEXT_DIM, marginTop: 4 }}>
        LOG FIRST MEAL · {Math.round(kcalLeft)} KCAL OPEN · {Math.round(proteinLeft)}G PROTEIN OPEN
      </div>
    </button>
  )
}

export default function NutritionDashboard({ onBack, onLogMeal, onRecipes, onWeight, onQuickAsk, onMealBuilder, onDayPlanner, onMemory, onShopping, onWeeklyPlanner, onAcceptanceGate, onCalendarBridge }) {
  const [status, setStatus] = useState(null)
  const [historyData, setHistoryData] = useState(null)
  const [trendText, setTrendText] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [deleting, setDeleting] = useState(null)

  async function load() {
    setLoading(true)
    setError(null)
    try {
      const [s, h] = await Promise.all([getNutritionStatus(), getMealHistory(14)])
      setStatus(s)
      setHistoryData(h)
    } catch (err) {
      setError('Nutrition data unavailable. No prototype values shown.')
    }
    setLoading(false)
  }

  useEffect(() => { load() }, [])

  useEffect(() => {
    if (!historyData?.logged_days) return
    postJarvisChat({ domain: 'nutrition', message: 'Give me a one-sentence trend read on my nutrition this week using only logged data.' })
      .then(r => setTrendText(r?.response || r?.text || null))
      .catch(() => {})
  }, [historyData])

  async function handleDelete(id) {
    setDeleting(id)
    try { await deleteMeal(id); await load() } catch {}
    setDeleting(null)
  }

  if (loading) return <div style={{ height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#000', color: MUTED, fontFamily: 'var(--mono)', fontSize: 12 }}>Loading nutrition…</div>
  if (error || !status) return (
    <div style={{ height: '100%', background: '#000', color: 'rgba(220,248,236,.94)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24, textAlign: 'center' }}>
      <div>
        <div style={{ fontFamily: 'var(--display)', fontSize: 24, color: LIME_BR, marginBottom: 8 }}>NUTRITION OFFLINE</div>
        <div style={{ fontFamily: 'var(--mono)', fontSize: 10, color: TEXT_DIM }}>{error || 'No nutrition status returned.'}</div>
      </div>
    </div>
  )

  const { target, logged, remaining_calories, remaining_protein_g, remaining_carbs_g, is_training_day, phase, meal_log, recovery_protocol } = status
  const meals = meal_log || []
  const kcalLogged = logged?.total_calories || 0
  const kcalTarget = target?.calories || 0
  const kcalLeft = remaining_calories || 0
  const proteinLogged = logged?.total_protein_g || 0
  const proteinTarget = target?.protein_g || 0
  const proteinLeft = remaining_protein_g || 0
  const carbLogged = logged?.total_carbs_g || 0
  const carbTarget = target?.carbs_g || 0
  const fatLogged = logged?.total_fat_g || 0
  const fatTarget = target?.fat_g || 0
  const calPct = clampPct(kcalLogged, kcalTarget)
  const proteinPct = clampPct(proteinLogged, proteinTarget)
  const carbPct = clampPct(carbLogged, carbTarget)
  const fatPct = clampPct(fatLogged, fatTarget)
  const overallPct = Math.round((proteinPct + carbPct + fatPct) / 3 * 100)
  const proteinLine = status.protein_target_met ? 'PROTEIN MET' : `${Math.max(0, Math.round(proteinLeft))}G PROTEIN LEFT`
  const dayLine = is_training_day ? 'TRAINING DAY' : 'REST DAY'
  const nextStep = meals.length === 0 ? 'NO MEALS LOGGED' : kcalLeft > 150 ? 'NEXT MEAL OPEN' : 'DAY NEAR CLOSED'

  const DAYS_LABELS = ['M','T','W','T','F','S','S']
  const heatData = (historyData?.history || []).slice(-14).map((d, i) => ({
    label: DAYS_LABELS[i % 7],
    state: d.adherence_status === 'good' ? 'good' : d.adherence_status === 'warn' ? 'warn' : d.has_data ? 'miss' : 'empty',
  }))

  const heatColors = {
    good: { bg: 'rgba(157,255,111,.18)', border: 'rgba(157,255,111,.28)', color: LIME_BR },
    warn: { bg: 'rgba(255,213,107,.12)', border: 'rgba(255,213,107,.2)', color: '#ffd56b' },
    miss: { bg: 'rgba(255,92,122,.10)', border: 'rgba(255,92,122,.18)', color: '#ff5c7a' },
    empty: { bg: 'rgba(32,216,236,.035)', border: 'rgba(32,216,236,.08)', color: MUTED },
  }

  return (
    <div style={{ height: '100%', display: 'flex', flexDirection: 'column', background: '#000', color: 'rgba(220,248,236,.94)', fontFamily: "'Saira Condensed',sans-serif" }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '13px 18px 11px', borderBottom: `1px solid ${BORDER}`, position: 'sticky', top: 0, background: 'rgba(0,0,0,.96)', backdropFilter: 'blur(12px)', zIndex: 5, flexShrink: 0 }}>
        <div style={{ display: 'flex', alignItems: 'center' }}>
          {onBack && <span onClick={onBack} style={{ color: '#20d8ec', fontSize: 16, marginRight: 10, cursor: 'pointer' }}>←</span>}
          <span style={{ fontFamily: 'var(--display)', fontSize: 13, fontWeight: 700, letterSpacing: '.28em', color: LIME_BR, filter: 'drop-shadow(0 0 8px rgba(157,255,111,.22))' }}>NUTRITION</span>
        </div>
        <span style={{ fontFamily: 'var(--mono)', fontSize: 8, letterSpacing: '.14em', color: LIME, border: `1px solid rgba(157,255,111,.32)`, background: 'rgba(157,255,111,.055)', padding: '2px 8px' }}>
          {phase?.toUpperCase()} · {dayLine}
        </span>
      </div>

      <div style={{ flex: 1, overflowY: 'auto', paddingBottom: 88 }}>
        <div style={{ padding: '20px 20px 18px', borderBottom: `1px solid ${BORDER}`, background: 'linear-gradient(180deg,rgba(157,255,111,.045),transparent)' }}>
          <div style={{ fontFamily: 'var(--mono)', fontSize: 8, letterSpacing: '.22em', color: MUTED, marginBottom: 8 }}>DAILY ENERGY TARGET</div>
          <div style={{ display: 'flex', alignItems: 'flex-end', gap: 14 }}>
            <div style={{ fontFamily: 'var(--display)', fontSize: 62, fontWeight: 700, lineHeight: .9, background: `linear-gradient(155deg,#fff 0%,${LIME_BR} 48%,${LIME} 100%)`, WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent', filter: 'drop-shadow(0 0 22px rgba(157,255,111,.38))' }}>
              {Math.round(kcalLogged).toLocaleString()}
            </div>
            <div style={{ fontFamily: 'var(--display)', fontSize: 16, letterSpacing: '.18em', color: LIME, opacity: .42, paddingBottom: 7 }}>/ {kcalTarget.toLocaleString()} KCAL</div>
          </div>
          <div style={{ fontFamily: 'var(--mono)', fontSize: 8, letterSpacing: '.14em', color: TEXT_DIM, marginTop: 10 }}>
            {Math.max(0, Math.round(kcalLeft))} KCAL LEFT · {proteinLine} · {nextStep}
          </div>
          <div style={{ height: 3, background: 'rgba(157,255,111,.12)', marginTop: 10, overflow: 'hidden' }}>
            <div style={{ height: '100%', width: `${Math.min(100, calPct * 100).toFixed(0)}%`, background: `linear-gradient(90deg,${LIME},${LIME_BR})`, boxShadow: `0 0 10px ${LIME}` }} />
          </div>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', borderBottom: `1px solid ${BORDER}` }}>
          {[
            { label: 'PROTEIN', val: `${Math.round(proteinLogged)}g`, sub: `${proteinTarget}g target`, color: PROTEIN_COL },
            { label: 'CARBS', val: `${Math.round(carbLogged)}g`, sub: `${carbTarget}g target`, color: CARB_COL },
            { label: 'FATS', val: `${Math.round(fatLogged)}g`, sub: `${fatTarget}g target`, color: FAT_COL },
          ].map(({ label, val, sub, color }, i) => (
            <div key={label} style={{ padding: '13px 12px', borderRight: i < 2 ? `1px solid ${BORDER}` : 'none', textAlign: 'center' }}>
              <div style={{ fontFamily: 'var(--mono)', fontSize: 7, letterSpacing: '.16em', color: MUTED, marginBottom: 5 }}>{label}</div>
              <div style={{ fontFamily: 'var(--display)', fontSize: 23, fontWeight: 700, lineHeight: 1, color }}>{val}</div>
              <div style={{ fontFamily: 'var(--mono)', fontSize: 7, letterSpacing: '.08em', color: TEXT_DIM, marginTop: 4 }}>{sub}</div>
            </div>
          ))}
        </div>

        <div style={{ padding: '16px 18px', borderBottom: `1px solid ${BORDER}` }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
            <span style={{ fontFamily: 'var(--mono)', fontSize: 8, letterSpacing: '.22em', color: MUTED }}>MACRO BALANCE</span>
            <span style={{ fontFamily: 'var(--display)', fontSize: 16, fontWeight: 600, color: LIME }}>{overallPct}%</span>
          </div>
          <MacroRings proteinPct={proteinPct} carbPct={carbPct} fatPct={fatPct} label={statusLabel(status.adherence_status)} />
        </div>

        <div style={{ padding: '16px 18px', borderBottom: `1px solid ${BORDER}` }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
            <span style={{ fontFamily: 'var(--mono)', fontSize: 8, letterSpacing: '.22em', color: MUTED }}>TODAY'S MEALS</span>
            <span style={{ fontFamily: 'var(--display)', fontSize: 16, fontWeight: 600, color: LIME }}>{meals.length} LOGGED</span>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {meals.length > 0 ? meals.map(m => (
              <div key={m.id} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '11px 12px', border: `1px solid rgba(32,216,236,.12)`, background: 'rgba(157,255,111,.018)' }}>
                <div>
                  <div style={{ fontFamily: 'var(--display)', fontSize: 15, fontWeight: 600, letterSpacing: '.06em', color: '#fff' }}>{m.name}</div>
                  <div style={{ fontFamily: 'var(--mono)', fontSize: 7, letterSpacing: '.11em', color: TEXT_DIM, marginTop: 2 }}>{Math.round(m.protein_g)}G PROTEIN · {m.servings > 1 ? `×${m.servings}` : '×1'}</div>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                  <span style={{ fontFamily: 'var(--mono)', fontSize: 12, color: LIME_BR }}>{Math.round(m.calories)}</span>
                  <button onClick={() => handleDelete(m.id)} disabled={deleting === m.id} style={{ background: 'none', border: 'none', color: MUTED, fontSize: 16, cursor: 'pointer', padding: '0 4px' }}>×</button>
                </div>
              </div>
            )) : <EmptyMeals kcalLeft={kcalLeft} proteinLeft={proteinLeft} onLogMeal={onLogMeal} />}
          </div>
        </div>

        <div style={{ padding: '16px 18px', borderBottom: `1px solid ${BORDER}` }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
            <span style={{ fontFamily: 'var(--mono)', fontSize: 8, letterSpacing: '.22em', color: MUTED }}>RECOVERY PROTOCOL</span>
            <span style={{ fontFamily: 'var(--display)', fontSize: 16, fontWeight: 600, color: LIME }}>{is_training_day ? 'FUEL' : 'BASE'}</span>
          </div>
          <div style={{ padding: '13px 13px', border: `1px solid rgba(157,255,111,.16)`, background: 'rgba(157,255,111,.025)' }}>
            <div style={{ fontFamily: 'var(--display)', fontSize: 18, fontWeight: 700, color: '#fff', letterSpacing: '.07em' }}>{recovery_protocol?.title}</div>
            <div style={{ fontSize: '12.5px', lineHeight: 1.6, color: 'rgba(220,248,236,.78)', marginTop: 6 }}>{recovery_protocol?.primary}</div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 5, marginTop: 10 }}>
              {(recovery_protocol?.checks || []).map(check => (
                <div key={check} style={{ fontFamily: 'var(--mono)', fontSize: 7.5, letterSpacing: '.1em', color: TEXT_DIM }}>◆ {check}</div>
              ))}
            </div>
          </div>
        </div>

        <div style={{ padding: '16px 18px', borderBottom: `1px solid ${BORDER}` }}>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
            {[
              { label: 'ACCEPTANCE', action: onAcceptanceGate },
              { label: 'CALENDAR', action: onCalendarBridge },
              { label: 'WEEKLY PREP', action: onWeeklyPlanner },
              { label: 'PLAN DAY', action: onDayPlanner },
              { label: 'BUILD MEAL', action: onMealBuilder },
              { label: 'MEMORY', action: onMemory },
              { label: 'SHOPPING', action: onShopping },
              { label: 'LOG MEAL', action: onLogMeal },
              { label: 'RECIPES', action: onRecipes },
              { label: 'TRENDS', action: onWeight },
              { label: 'ASK PHOENIX', action: () => onQuickAsk?.(`Build my next meal. I have ${Math.round(kcalLeft)} kcal, ${Math.round(proteinLeft)}g protein, and ${Math.round(remaining_carbs_g || 0)}g carbs remaining.`) },
            ].map(({ label, action }) => (
              <button key={label} onClick={action} style={{ padding: '12px 10px', border: `1px solid rgba(157,255,111,.22)`, background: 'rgba(157,255,111,.045)', fontFamily: 'var(--mono)', fontSize: 8, letterSpacing: '.16em', color: LIME, textAlign: 'center', cursor: 'pointer' }}>{label}</button>
            ))}
          </div>
        </div>

        <div style={{ padding: '16px 18px', borderBottom: `1px solid ${BORDER}` }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
            <span style={{ fontFamily: 'var(--mono)', fontSize: 8, letterSpacing: '.22em', color: MUTED }}>ADHERENCE HEATMAP</span>
            <span style={{ fontFamily: 'var(--display)', fontSize: 16, fontWeight: 600, color: LIME }}>{historyData?.good_days || 0} / {historyData?.logged_days || 0}</span>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7,1fr)', gap: 5 }}>
            {heatData.map((d, i) => {
              const c = heatColors[d.state]
              return <div key={i} title={d.state} style={{ height: 32, border: `1px solid ${c.border}`, background: c.bg, display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: 'var(--mono)', fontSize: 7, color: c.color }}>{d.label}</div>
            })}
          </div>
        </div>

        {trendText && <div style={{ margin: '14px 18px 0', padding: '11px 13px', border: `1px solid rgba(32,216,236,.16)`, borderLeft: `3px solid ${LIME}`, background: 'rgba(157,255,111,.025)' }}>
          <div style={{ fontFamily: 'var(--mono)', fontSize: 7, letterSpacing: '.2em', color: 'rgba(157,255,111,.48)', marginBottom: 6 }}>PHOENIX ASSESSMENT</div>
          <div style={{ fontSize: '12.5px', lineHeight: 1.65, color: 'rgba(220,248,236,.78)' }}>{trendText}</div>
        </div>}

        <div style={{ height: 32 }} />
      </div>
    </div>
  )
}
