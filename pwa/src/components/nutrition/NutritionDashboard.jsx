import { useState, useEffect } from 'react'
import { getNutritionStatus, deleteMeal, getMealHistory, postJarvisChat } from '../../api/client'

const G = 'var(--accent-nutrition)'

function ProteinRing({ logged, target }) {
  const r = 38, cx = 46, cy = 46
  const circ = 2 * Math.PI * r
  const pct = Math.min(1, logged / Math.max(1, target))
  const dash = circ * pct
  return (
    <svg width="92" height="92" viewBox="0 0 92 92" style={{ flexShrink: 0 }}>
      <circle cx={cx} cy={cy} r={r} fill="none" stroke="rgba(125,255,207,.12)" strokeWidth="6" />
      <circle
        cx={cx} cy={cy} r={r}
        fill="none" stroke="#9dff6f" strokeWidth="6"
        strokeDasharray={`${dash.toFixed(1)} ${circ.toFixed(1)}`}
        strokeLinecap="round"
        transform={`rotate(-90 ${cx} ${cy})`}
      />
      <text x={cx} y={cy - 4} textAnchor="middle" fill="var(--text)" fontSize="15" fontFamily="'Share Tech Mono', monospace">
        {Math.round(logged)}g
      </text>
      <text x={cx} y={cy + 13} textAnchor="middle" fill="var(--muted)" fontSize="10" fontFamily="'Saira Condensed', sans-serif">
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
      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 3 }}>
        <span style={{ fontFamily: 'var(--display)', fontSize: 10, color: 'var(--muted)', letterSpacing: '.06em' }}>{label}</span>
        <span style={{ fontFamily: 'var(--mono)', fontSize: 10, color: 'var(--text)' }}>{Math.round(remaining)}g</span>
      </div>
      <div className="bar">
        <span style={{ width: `${(pct * 100).toFixed(1)}%`, background: '#9dff6f', boxShadow: '0 0 8px #9dff6f' }} />
      </div>
    </div>
  )
}

function StatsStrip({ adherencePct, avgProtein }) {
  return (
    <div style={{ display: 'flex', gap: 12, padding: '0 16px 16px' }}>
      <div className="metric" style={{ flex: 1, flexDirection: 'column', alignItems: 'flex-start' }}>
        <div className="label">14-DAY ADHERENCE</div>
        <div className="value" style={{ fontSize: 22, color: adherencePct >= 80 ? '#9dff6f' : adherencePct >= 60 ? 'var(--gold)' : 'var(--red)' }}>
          {adherencePct ?? '—'}%
        </div>
      </div>
      <div className="metric" style={{ flex: 1, flexDirection: 'column', alignItems: 'flex-start' }}>
        <div className="label">AVG PROTEIN</div>
        <div className="value" style={{ fontSize: 22 }}>
          {avgProtein != null ? `${avgProtein}g` : '—'}
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
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 8 }}>
        <span className="panel-title" style={{ marginBottom: 0 }}>7-DAY CALORIES</span>
        {avgDeficit != null && (
          <span style={{ fontFamily: 'var(--mono)', fontSize: 11, color: avgDeficit <= 0 ? '#9dff6f' : 'var(--red)' }}>
            {avgDeficit > 0 ? '+' : ''}{avgDeficit} kcal/day
          </span>
        )}
      </div>
      <svg width="100%" viewBox={`0 0 ${W} ${H}`} style={{ overflow: 'visible' }}>
        <line x1={PAD.l} y1={targetY} x2={W - PAD.r} y2={targetY}
          stroke="#9dff6f" strokeWidth="1" strokeDasharray="4 3" opacity="0.4" />
        <text x={W - PAD.r + 2} y={targetY + 4} fontSize="8" fill="#9dff6f" opacity="0.5" fontFamily="'Share Tech Mono', monospace">TGT</text>

        {points.length >= 2 && (
          <polyline points={points.join(' ')} fill="none" stroke="#9dff6f" strokeWidth="2" strokeLinejoin="round" strokeLinecap="round" />
        )}

        {days7.map((d, i) => {
          if (!d.has_data) return null
          const cx = PAD.l + i * xStep
          const cy = PAD.t + yScale(d.total_calories)
          const over = d.total_calories > targetCalories
          return (
            <circle key={d.date} cx={cx.toFixed(1)} cy={cy.toFixed(1)} r="3"
              fill={over ? 'var(--red)' : '#9dff6f'} stroke="var(--bg)" strokeWidth="1.5" />
          )
        })}

        {days7.map((d, i) => (
          <text key={d.date} x={(PAD.l + i * xStep).toFixed(1)} y={H - 4}
            textAnchor="middle" fontSize="9" fill="var(--dim)" fontFamily="'Saira Condensed', sans-serif">
            {dayLabels[i]}
          </text>
        ))}

        {[0, 0.5, 1].map(t => {
          const v = minCal + t * (maxCal - minCal)
          const y = PAD.t + yScale(v)
          return (
            <text key={t} x={PAD.l - 4} y={y + 3}
              textAnchor="end" fontSize="8" fill="var(--dim)" fontFamily="'Share Tech Mono', monospace">
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
      <div className="panel-title">14-DAY ADHERENCE</div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: 4 }}>
        {['M', 'T', 'W', 'T', 'F', 'S', 'S'].map((l, i) => (
          <div key={i} style={{ textAlign: 'center', fontFamily: 'var(--display)', fontSize: 9, color: 'var(--dim)', marginBottom: 2 }}>{l}</div>
        ))}
        {days14.map(d => {
          const bg = !d.has_data ? 'rgba(1,10,13,.46)' : d.target_met ? 'rgba(125,255,207,.12)' : 'rgba(255,109,122,.1)'
          const dot = !d.has_data ? 'var(--dim)' : d.target_met ? '#9dff6f' : 'var(--red)'
          const dt = new Date(d.date + 'T00:00:00')
          return (
            <div key={d.date} title={`${d.date}: ${d.has_data ? Math.round(d.total_calories) + ' kcal' : 'no data'}`}
              style={{
                aspectRatio: '1', background: bg,
                border: '1px solid rgba(32,216,236,.1)',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                fontFamily: 'var(--mono)', fontSize: 9, color: dot,
              }}>
              {dt.getDate()}
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
    <div className="glass" style={{ margin: '0 16px 16px', padding: '12px 14px', borderLeft: '3px solid #9dff6f' }}>
      <div style={{ fontFamily: 'var(--mono)', fontSize: 9, color: '#9dff6f', letterSpacing: '.1em', marginBottom: 6 }}>
        PHOENIX TREND READ
      </div>
      {loading
        ? <div style={{ fontFamily: 'var(--body)', fontSize: 13, color: 'var(--dim)' }}>Analysing…</div>
        : <div style={{ fontFamily: 'var(--body)', fontSize: 13, color: 'var(--text)', lineHeight: 1.5 }}>{text}</div>
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
      <div className="panel-title">QUICK ASK</div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
        {chips.map(chip => (
          <button key={chip} onClick={() => onQuickAsk(chip)} className="action ghost" style={{ textAlign: 'left', padding: '10px 14px', fontSize: 11 }}>
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

  useEffect(() => { load() }, [])

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
    <div style={{ height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'transparent', color: 'var(--dim)', fontFamily: 'var(--mono)' }}>
      Loading…
    </div>
  )
  if (!status) return (
    <div style={{ height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'transparent', color: 'var(--red)', fontFamily: 'var(--mono)' }}>
      Could not reach backend
    </div>
  )

  const { target, logged, remaining_calories, suggested_recipes, is_training_day, phase, meal_log } = status
  const meals = meal_log || []
  const over = remaining_calories < 0

  return (
    <div style={{ height: '100%', overflowY: 'auto', background: 'transparent', color: 'var(--text)', fontFamily: 'var(--body)' }}>
      {/* Header */}
      <div style={{ padding: '14px 16px 10px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '1px solid var(--line)' }}>
        <span style={{ fontFamily: 'var(--display)', fontSize: 13, letterSpacing: '.12em', color: '#9dff6f' }}>NUTRITION</span>
        <span style={{ fontFamily: 'var(--mono)', fontSize: 9, color: 'var(--muted)' }}>{is_training_day ? 'Training' : 'Rest'} · {(phase || '').toUpperCase()}</span>
      </div>

      {/* Stats strip */}
      {historyData && (
        <div style={{ paddingTop: 14 }}>
          <StatsStrip adherencePct={historyData.adherence_pct} avgProtein={historyData.avg_protein_g} />
        </div>
      )}

      {/* Calories hero */}
      <div style={{ padding: '16px 16px', textAlign: 'center' }}>
        <div style={{ fontFamily: 'var(--mono)', fontSize: 72, lineHeight: 1, color: over ? 'var(--red)' : 'var(--text)', textShadow: `0 0 30px ${over ? 'var(--red)' : '#9dff6f'}` }}>
          {Math.abs(Math.round(remaining_calories))}
        </div>
        <div style={{ fontFamily: 'var(--display)', fontSize: 10, color: 'var(--muted)', letterSpacing: '.12em', marginTop: 4 }}>
          KCAL {over ? 'OVER' : 'REMAINING'}
        </div>
      </div>

      {/* Ring + macros */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 20, padding: '0 16px 20px' }}>
        <ProteinRing logged={logged?.total_protein_g ?? 0} target={target?.protein_g ?? 165} />
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 10 }}>
          <MacroRow label="CARBS" logged={logged?.total_carbs_g ?? 0} target={target?.carbs_g ?? 260} />
          <MacroRow label="FAT"   logged={logged?.total_fat_g ?? 0}   target={target?.fat_g ?? 60} />
          <div style={{ fontFamily: 'var(--mono)', fontSize: 10, color: 'var(--muted)' }}>
            {Math.round(logged?.total_calories ?? 0)} / {target?.calories} kcal
          </div>
        </div>
      </div>

      {/* Actions */}
      <div style={{ display: 'flex', gap: 8, padding: '0 16px 20px' }}>
        <button onClick={onLogMeal} className="action safe lg" style={{ flex: 1 }}>+ LOG MEAL</button>
        <button onClick={onRecipes} className="action ghost">RECIPES</button>
        <button onClick={onWeight} className="action ghost">WEIGHT</button>
      </div>

      {/* Calorie trend chart */}
      {historyData?.history && (
        <CalorieChart history={historyData.history} targetCalories={historyData.target_calories} />
      )}

      {/* Adherence heatmap */}
      {historyData?.history && (
        <AdherenceHeatmap history={historyData.history} />
      )}

      <TrendRead text={trendText} loading={trendLoading} />

      {onQuickAsk && <QuickAskChips onQuickAsk={onQuickAsk} />}

      {/* Meal log */}
      <div style={{ padding: '0 16px 24px' }}>
        <div className="panel-title">TODAY · {meals.length} LOGGED</div>
        {meals.length === 0
          ? <div style={{ color: 'var(--dim)', fontFamily: 'var(--mono)', fontSize: 11, padding: '8px 0' }}>Nothing logged yet.</div>
          : meals.map(m => (
            <div key={m.id} className="row" style={{ marginBottom: 6, alignItems: 'center' }}>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div className="row-title" style={{ fontSize: 13 }}>{m.name}</div>
                <div className="row-sub">
                  {Math.round(m.calories)} kcal · {Math.round(m.protein_g)}g P{m.servings !== 1 ? ` · ×${m.servings}` : ''}
                </div>
              </div>
              <button
                onClick={() => handleDelete(m.id)}
                disabled={deleting === m.id}
                className="action ghost"
                style={{ padding: '4px 8px', fontSize: 16, color: deleting === m.id ? 'var(--dim)' : 'var(--muted)' }}
              >×</button>
            </div>
          ))
        }
      </div>

      {/* Suggested */}
      {suggested_recipes?.length > 0 && (
        <div style={{ padding: '0 16px 32px' }}>
          <div className="panel-title">SUGGESTED NEXT</div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {suggested_recipes.slice(0, 3).map(r => (
              <button key={r.id} onClick={onLogMeal} className="row" style={{ flexDirection: 'column', alignItems: 'flex-start', cursor: 'pointer' }}>
                <div className="row-title" style={{ fontSize: 13 }}>{r.name}</div>
                <div className="row-sub">
                  {r.calories} kcal · {r.protein_g}g P · <span style={{ color: '#9dff6f' }}>{r.category}</span>
                </div>
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
