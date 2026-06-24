import { useState, useEffect } from 'react'
import { getNutritionStatus, deleteMeal, getMealHistory, postJarvisChat } from '../../api/client'

const G = '#9dff6f'
const BG = '#0a0a0a'
const CARD = '#111'
const BORDER = '#1a1a1a'
const TEXT = '#e8e8e8'
const DIM = '#555'
const RED = '#ef5350'
const MONO = "'Share Tech Mono', monospace"
const DISPLAY = "'Oswald', 'Inter', sans-serif"

function ProteinRing({ logged, target }) {
  const r = 38, cx = 46, cy = 46
  const circ = 2 * Math.PI * r
  const pct = Math.min(1, logged / Math.max(1, target))
  const dash = circ * pct
  return (
    <svg width="92" height="92" viewBox="0 0 92 92" style={{ flexShrink: 0 }}>
      <circle cx={cx} cy={cy} r={r} fill="none" stroke="#1a2a1a" strokeWidth="6" />
      <circle
        cx={cx} cy={cy} r={r}
        fill="none" stroke={G} strokeWidth="6"
        strokeDasharray={`${dash.toFixed(1)} ${circ.toFixed(1)}`}
        strokeLinecap="round"
        transform={`rotate(-90 ${cx} ${cy})`}
      />
      <text x={cx} y={cy - 4} textAnchor="middle" fill={TEXT} fontSize="15" fontFamily={MONO}>
        {Math.round(logged)}g
      </text>
      <text x={cx} y={cy + 13} textAnchor="middle" fill={DIM} fontSize="10" fontFamily="Inter,sans-serif">
        /{target}g
      </text>
    </svg>
  )
}

function MacroRow({ label, logged, target }) {
  const pct = Math.min(1, logged / Math.max(1, target))
  const remaining = Math.max(0, target - logged)
  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '11px', marginBottom: '3px' }}>
        <span style={{ color: DIM, fontFamily: DISPLAY, letterSpacing: '0.06em' }}>{label}</span>
        <span style={{ color: TEXT, fontFamily: MONO }}>{Math.round(remaining)}g</span>
      </div>
      <div style={{ height: '3px', background: '#1a2a1a', borderRadius: '2px' }}>
        <div style={{ height: '100%', width: `${(pct * 100).toFixed(1)}%`, background: G, borderRadius: '2px' }} />
      </div>
    </div>
  )
}

function Btn({ onClick, children, primary }) {
  return (
    <button onClick={onClick} style={{
      flex: primary ? 1 : '0 0 auto',
      padding: '10px 14px',
      background: primary ? G : 'none',
      border: `1px solid ${primary ? G : '#2a2a2a'}`,
      borderRadius: '8px',
      color: primary ? '#000' : '#777',
      fontSize: '12px',
      fontWeight: 600,
      letterSpacing: '0.08em',
      fontFamily: DISPLAY,
      cursor: 'pointer',
    }}>
      {children}
    </button>
  )
}

function StatsStrip({ adherencePct, avgProtein }) {
  return (
    <div style={{ display: 'flex', gap: '12px', padding: '0 16px 16px' }}>
      <div style={{ flex: 1, background: CARD, border: `1px solid ${BORDER}`, borderRadius: '8px', padding: '10px 14px' }}>
        <div style={{ fontFamily: MONO, fontSize: '22px', color: adherencePct >= 80 ? G : adherencePct >= 60 ? '#f0b429' : RED }}>
          {adherencePct ?? '—'}%
        </div>
        <div style={{ fontSize: '10px', color: DIM, fontFamily: DISPLAY, letterSpacing: '0.08em', marginTop: '2px' }}>
          14-DAY ADHERENCE
        </div>
      </div>
      <div style={{ flex: 1, background: CARD, border: `1px solid ${BORDER}`, borderRadius: '8px', padding: '10px 14px' }}>
        <div style={{ fontFamily: MONO, fontSize: '22px', color: TEXT }}>
          {avgProtein != null ? `${avgProtein}g` : '—'}
        </div>
        <div style={{ fontSize: '10px', color: DIM, fontFamily: DISPLAY, letterSpacing: '0.08em', marginTop: '2px' }}>
          AVG PROTEIN
        </div>
      </div>
    </div>
  )
}

function CalorieChart({ history, targetCalories }) {
  const days7 = history.slice(-7)
  const withData = days7.filter(d => d.has_data)
  if (withData.length === 0) return null

  const W = 320, H = 110, PAD = { t: 10, r: 12, b: 24, l: 40 }
  const plotW = W - PAD.l - PAD.r
  const plotH = H - PAD.t - PAD.b

  const allCals = withData.map(d => d.total_calories)
  const maxCal = Math.max(targetCalories * 1.15, ...allCals)
  const minCal = Math.min(0, ...allCals)
  const yScale = v => plotH - ((v - minCal) / (maxCal - minCal)) * plotH

  const xStep = plotW / Math.max(1, days7.length - 1)
  const points = days7
    .map((d, i) => d.has_data ? `${(PAD.l + i * xStep).toFixed(1)},${(PAD.t + yScale(d.total_calories)).toFixed(1)}` : null)
    .filter(Boolean)

  const avgDeficit = withData.length > 0
    ? Math.round(withData.reduce((s, d) => s + (d.total_calories - targetCalories), 0) / withData.length)
    : null

  const targetY = PAD.t + yScale(targetCalories)

  const dayLabels = days7.map(d => {
    const dt = new Date(d.date + 'T00:00:00')
    return ['S','M','T','W','T','F','S'][dt.getDay()]
  })

  return (
    <div style={{ padding: '0 16px 16px' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: '8px' }}>
        <span style={{ fontSize: '11px', fontFamily: DISPLAY, letterSpacing: '0.1em', color: DIM }}>7-DAY CALORIES</span>
        {avgDeficit != null && (
          <span style={{ fontSize: '12px', fontFamily: MONO, color: avgDeficit <= 0 ? G : RED }}>
            {avgDeficit > 0 ? '+' : ''}{avgDeficit} kcal/day avg
          </span>
        )}
      </div>
      <svg width="100%" viewBox={`0 0 ${W} ${H}`} style={{ overflow: 'visible' }}>
        {/* Target line */}
        <line
          x1={PAD.l} y1={targetY} x2={W - PAD.r} y2={targetY}
          stroke={G} strokeWidth="1" strokeDasharray="4 3" opacity="0.4"
        />
        <text x={W - PAD.r + 2} y={targetY + 4} fontSize="8" fill={G} opacity="0.5" fontFamily={MONO}>TGT</text>

        {/* Data line */}
        {points.length >= 2 && (
          <polyline
            points={points.join(' ')}
            fill="none" stroke={G} strokeWidth="2" strokeLinejoin="round" strokeLinecap="round"
          />
        )}

        {/* Dots */}
        {days7.map((d, i) => {
          if (!d.has_data) return null
          const cx = PAD.l + i * xStep
          const cy = PAD.t + yScale(d.total_calories)
          const over = d.total_calories > targetCalories
          return (
            <circle key={d.date} cx={cx.toFixed(1)} cy={cy.toFixed(1)} r="3"
              fill={over ? RED : G} stroke={BG} strokeWidth="1.5" />
          )
        })}

        {/* X axis labels */}
        {days7.map((d, i) => (
          <text key={d.date} x={(PAD.l + i * xStep).toFixed(1)} y={H - 4}
            textAnchor="middle" fontSize="9" fill={DIM} fontFamily="Inter,sans-serif">
            {dayLabels[i]}
          </text>
        ))}

        {/* Y axis labels */}
        {[0, 0.5, 1].map(t => {
          const v = minCal + t * (maxCal - minCal)
          const y = PAD.t + yScale(v)
          return (
            <text key={t} x={PAD.l - 4} y={y + 3}
              textAnchor="end" fontSize="8" fill={DIM} fontFamily={MONO}>
              {Math.round(v / 100) * 100}
            </text>
          )
        })}
      </svg>
    </div>
  )
}

function AdherenceHeatmap({ history }) {
  const days14 = history.slice(-14)
  if (days14.length === 0) return null

  return (
    <div style={{ padding: '0 16px 16px' }}>
      <div style={{ fontSize: '11px', fontFamily: DISPLAY, letterSpacing: '0.1em', color: DIM, marginBottom: '8px' }}>
        14-DAY ADHERENCE
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: '4px' }}>
        {['M', 'T', 'W', 'T', 'F', 'S', 'S'].map((l, i) => (
          <div key={i} style={{ textAlign: 'center', fontSize: '9px', color: DIM, fontFamily: DISPLAY, marginBottom: '2px' }}>{l}</div>
        ))}
        {days14.map(d => {
          const bg = !d.has_data ? '#1a1a1a' : d.target_met ? '#1a3a1a' : '#3a1a1a'
          const dot = !d.has_data ? DIM : d.target_met ? G : RED
          const dt = new Date(d.date + 'T00:00:00')
          const label = dt.getDate()
          return (
            <div key={d.date} title={`${d.date}: ${d.has_data ? Math.round(d.total_calories) + ' kcal' : 'no data'}`}
              style={{
                aspectRatio: '1',
                background: bg,
                borderRadius: '4px',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                fontSize: '9px',
                color: dot,
                fontFamily: MONO,
              }}>
              {label}
            </div>
          )
        })}
      </div>
    </div>
  )
}

function TrendRead({ text, loading }) {
  if (!text && !loading) return null
  return (
    <div style={{ margin: '0 16px 16px', padding: '12px 14px', background: CARD, border: `1px solid ${BORDER}`, borderRadius: '8px' }}>
      <div style={{ fontSize: '10px', fontFamily: DISPLAY, letterSpacing: '0.1em', color: G, marginBottom: '6px' }}>
        PHOENIX TREND READ
      </div>
      {loading
        ? <div style={{ fontSize: '13px', color: DIM, fontFamily: 'Inter,sans-serif' }}>Analysing…</div>
        : <div style={{ fontSize: '13px', color: TEXT, fontFamily: 'Inter,sans-serif', lineHeight: 1.5 }}>{text}</div>
      }
    </div>
  )
}

function QuickAskChips({ onQuickAsk }) {
  const chips = [
    'What should I eat for dinner?',
    'Am I on track today?',
    'Can I eat more carbs after training?',
  ]
  return (
    <div style={{ padding: '0 16px 20px' }}>
      <div style={{ fontSize: '11px', fontFamily: DISPLAY, letterSpacing: '0.1em', color: DIM, marginBottom: '8px' }}>
        QUICK ASK
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
        {chips.map(chip => (
          <button key={chip} onClick={() => onQuickAsk(chip)}
            style={{
              background: 'none',
              border: `1px solid ${BORDER}`,
              borderRadius: '8px',
              padding: '10px 14px',
              color: '#aaa',
              fontSize: '13px',
              textAlign: 'left',
              cursor: 'pointer',
              fontFamily: 'Inter,sans-serif',
            }}>
            {chip}
          </button>
        ))}
      </div>
    </div>
  )
}

export default function NutritionDashboard({ onLogMeal, onRecipes, onWeight, onQuickAsk }) {
  const [status, setStatus] = useState(null)
  const [historyData, setHistoryData] = useState(null)
  const [trendText, setTrendText] = useState(null)
  const [trendLoading, setTrendLoading] = useState(false)
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

  useEffect(() => {
    load()
  }, [])

  useEffect(() => {
    if (!historyData) return
    setTrendLoading(true)
    postJarvisChat({
      domain: 'nutrition',
      message: 'Give me a one-sentence trend read on my nutrition this week',
    }).then(r => {
      setTrendText(r?.response || r?.text || null)
    }).catch(() => {}).finally(() => setTrendLoading(false))
  }, [historyData])

  async function handleDelete(id) {
    setDeleting(id)
    try { await deleteMeal(id); await load() } catch {}
    setDeleting(null)
  }

  if (loading) return (
    <div style={{ height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', background: BG, color: DIM }}>
      Loading…
    </div>
  )
  if (!status) return (
    <div style={{ height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', background: BG, color: RED }}>
      Could not reach backend
    </div>
  )

  const { target, logged, remaining_calories, remaining_protein_g, remaining_carbs_g, remaining_fat_g, suggested_recipes, is_training_day, phase, meal_log } = status
  const meals = meal_log || []
  const over = remaining_calories < 0

  return (
    <div style={{ height: '100%', overflowY: 'auto', background: BG, color: TEXT, fontFamily: 'Inter,sans-serif' }}>
      {/* Header */}
      <div style={{ padding: '14px 16px 10px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: `1px solid ${BORDER}` }}>
        <span style={{ fontFamily: DISPLAY, fontSize: '13px', letterSpacing: '0.12em', color: G, fontWeight: 600 }}>NUTRITION</span>
        <span style={{ fontSize: '11px', color: DIM }}>{is_training_day ? 'Training' : 'Rest'} · {(phase || '').toUpperCase()}</span>
      </div>

      {/* Stats strip */}
      {historyData && (
        <div style={{ paddingTop: '14px' }}>
          <StatsStrip
            adherencePct={historyData.adherence_pct}
            avgProtein={historyData.avg_protein_g}
          />
        </div>
      )}

      {/* Calories hero */}
      <div style={{ padding: '16px 16px 16px', textAlign: 'center' }}>
        <div style={{ fontFamily: MONO, fontSize: '72px', lineHeight: 1, color: over ? RED : TEXT }}>
          {Math.abs(Math.round(remaining_calories))}
        </div>
        <div style={{ fontSize: '11px', color: DIM, letterSpacing: '0.12em', marginTop: '4px', fontFamily: DISPLAY }}>
          KCAL {over ? 'OVER' : 'REMAINING'}
        </div>
      </div>

      {/* Ring + macros */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '20px', padding: '0 16px 20px' }}>
        <ProteinRing logged={logged?.total_protein_g ?? 0} target={target?.protein_g ?? 165} />
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: '10px' }}>
          <MacroRow label="CARBS" logged={logged?.total_carbs_g ?? 0} target={target?.carbs_g ?? 260} />
          <MacroRow label="FAT"   logged={logged?.total_fat_g ?? 0}   target={target?.fat_g ?? 60}  />
          <div style={{ fontSize: '11px', color: DIM, fontFamily: MONO }}>
            {Math.round(logged?.total_calories ?? 0)} / {target?.calories} kcal
          </div>
        </div>
      </div>

      {/* Actions */}
      <div style={{ display: 'flex', gap: '8px', padding: '0 16px 20px' }}>
        <Btn onClick={onLogMeal} primary>+ LOG MEAL</Btn>
        <Btn onClick={onRecipes}>RECIPES</Btn>
        <Btn onClick={onWeight}>WEIGHT</Btn>
      </div>

      {/* Calorie trend chart */}
      {historyData?.history && (
        <CalorieChart
          history={historyData.history}
          targetCalories={historyData.target_calories}
        />
      )}

      {/* Adherence heatmap */}
      {historyData?.history && (
        <AdherenceHeatmap history={historyData.history} />
      )}

      {/* JARVIS trend read */}
      <TrendRead text={trendText} loading={trendLoading} />

      {/* Quick-ask chips */}
      {onQuickAsk && <QuickAskChips onQuickAsk={onQuickAsk} />}

      {/* Meal log */}
      <div style={{ padding: '0 16px 24px' }}>
        <div style={{ fontSize: '11px', fontFamily: DISPLAY, letterSpacing: '0.1em', color: DIM, marginBottom: '10px' }}>
          TODAY · {meals.length} LOGGED
        </div>
        {meals.length === 0
          ? <div style={{ color: DIM, fontSize: '14px', padding: '8px 0' }}>Nothing logged yet.</div>
          : meals.map(m => (
            <div key={m.id} style={{ display: 'flex', alignItems: 'center', gap: '10px', padding: '10px 0', borderBottom: `1px solid ${BORDER}` }}>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: '14px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{m.name}</div>
                <div style={{ fontSize: '12px', color: DIM, marginTop: '2px', fontFamily: MONO }}>
                  {Math.round(m.calories)} kcal · {Math.round(m.protein_g)}g P{m.servings !== 1 ? ` · ×${m.servings}` : ''}
                </div>
              </div>
              <button
                onClick={() => handleDelete(m.id)}
                disabled={deleting === m.id}
                style={{ background: 'none', border: 'none', color: deleting === m.id ? '#333' : '#3a3a3a', fontSize: '18px', cursor: 'pointer', padding: '4px 6px', lineHeight: 1 }}
              >×</button>
            </div>
          ))
        }
      </div>

      {/* Suggested */}
      {suggested_recipes?.length > 0 && (
        <div style={{ padding: '0 16px 32px' }}>
          <div style={{ fontSize: '11px', fontFamily: DISPLAY, letterSpacing: '0.1em', color: DIM, marginBottom: '10px' }}>SUGGESTED NEXT</div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
            {suggested_recipes.slice(0, 3).map(r => (
              <button key={r.id} onClick={onLogMeal}
                style={{ background: CARD, border: `1px solid ${BORDER}`, borderRadius: '8px', padding: '12px', textAlign: 'left', cursor: 'pointer', width: '100%' }}>
                <div style={{ fontSize: '14px', color: TEXT }}>{r.name}</div>
                <div style={{ fontSize: '12px', color: DIM, marginTop: '3px', fontFamily: MONO }}>
                  {r.calories} kcal · {r.protein_g}g P · <span style={{ color: G }}>{r.category}</span>
                </div>
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
