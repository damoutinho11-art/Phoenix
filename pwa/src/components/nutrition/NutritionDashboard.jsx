import { useState, useEffect } from 'react'
import { getNutritionStatus, deleteMeal, getMealHistory, postJarvisChat } from '../../api/client'
import { CockpitShell, DataPanel, EmptyState, SourceStamp, StatusChip } from '../cockpit/CockpitPrimitives'
import { buildNutritionDashboardModel } from './nutritionDashboardModel'


const LIME = '#9dff6f'
const LIME_BR = '#d5ffc7'
const PROTEIN_COL = '#7df0ff'
const CARB_COL = '#ffd56b'
const FAT_COL = '#ff9f43'

function safeRound(value) {
  const n = Number(value)
  return Number.isFinite(n) ? Math.round(n) : 0
}

function statusTone(status) {
  if (status === 'good') return 'ready'
  if (status === 'warn') return 'caution'
  if (status === 'miss') return 'danger'
  return 'verified'
}

function ProgressBar({ pct, color = LIME }) {
  return (
    <div className="phx-progress-track" aria-hidden="true">
      <span
        className="phx-progress-fill"
        style={{ width: `${Math.min(100, Math.max(0, pct * 100)).toFixed(0)}%`, background: `linear-gradient(90deg, ${color}, ${LIME_BR})` }}
      />
    </div>
  )
}

function MacroRings({ proteinPct, carbPct, fatPct, label }) {
  const pOff = (339 * (1 - proteinPct)).toFixed(0)
  const cOff = (251 * (1 - carbPct)).toFixed(0)
  const fOff = (170 * (1 - fatPct)).toFixed(0)

  return (
    <div className="phx-macro-rings">
      <div className="phx-ring-stack">
        <svg width="132" height="132" viewBox="0 0 132 132" aria-hidden="true">
          <circle cx="66" cy="66" r="56" fill="none" stroke="rgba(157,255,111,.10)" strokeWidth="8" />
          <circle cx="66" cy="66" r="56" fill="none" stroke={PROTEIN_COL} strokeWidth="8" strokeDasharray="339" strokeDashoffset={pOff} strokeLinecap="round" transform="rotate(-90 66 66)" />
          <circle cx="66" cy="66" r="41" fill="none" stroke={CARB_COL} strokeWidth="7" strokeDasharray="251" strokeDashoffset={cOff} strokeLinecap="round" transform="rotate(-90 66 66)" />
          <circle cx="66" cy="66" r="28" fill="none" stroke={FAT_COL} strokeWidth="6" strokeDasharray="170" strokeDashoffset={fOff} strokeLinecap="round" transform="rotate(-90 66 66)" />
        </svg>
        <div className="phx-ring-center">
          <strong>{label}</strong>
          <span>TODAY</span>
        </div>
      </div>
      <div className="phx-legend-stack">
        {[
          { label: 'PROTEIN', color: PROTEIN_COL, pct: Math.round(proteinPct * 100) },
          { label: 'CARBS', color: CARB_COL, pct: Math.round(carbPct * 100) },
          { label: 'FATS', color: FAT_COL, pct: Math.round(fatPct * 100) },
        ].map(({ label, color, pct }) => (
          <div key={label} className="phx-legend-row">
            <span><i style={{ background: color }} />{label}</span>
            <b>{pct}%</b>
          </div>
        ))}
      </div>
    </div>
  )
}

function EmptyMeals({ kcalLeft, proteinLeft, onLogMeal }) {
  return (
    <button onClick={onLogMeal} className="phx-empty-action phx-nutrition-empty-action">
      <strong>NO MEALS LOGGED TODAY</strong>
      <span>LOG FIRST MEAL · {safeRound(kcalLeft)} KCAL OPEN · {safeRound(proteinLeft)}G PROTEIN OPEN</span>
    </button>
  )
}

function MealRow({ meal, deleting, onDelete }) {
  return (
    <div className="phx-command-row phx-meal-ledger-row">
      <div>
        <div className="phx-command-title">{meal.name}</div>
        <div className="phx-command-sub">{safeRound(meal.protein_g)}G PROTEIN · {safeRound(meal.carbs_g)}G CARBS · {safeRound(meal.fat_g)}G FAT · {meal.servings > 1 ? `×${meal.servings}` : '×1'}</div>
      </div>
      <div className="phx-row-actions">
        <span>{safeRound(meal.calories)} KCAL</span>
        <button onClick={() => onDelete(meal.id)} disabled={deleting === meal.id} aria-label={`Delete ${meal.name}`}>×</button>
      </div>
    </div>
  )
}

function CommandButton({ label, action, primary = false }) {
  return (
    <button type="button" onClick={action} className={`phx-command-button ${primary ? 'phx-command-button-primary' : ''}`}>
      {label}
    </button>
  )
}

function MacroMatrix({ macros }) {
  return (
    <div className="phx-nutrition-macro-matrix">
      {macros.map(macro => (
        <div key={macro.label} className={`phx-nutrition-macro-row phx-macro-state-${macro.state}`}>
          <div className="phx-nutrition-macro-head">
            <span><i style={{ background: macro.color }} />{macro.label}</span>
            <b>{Math.round(macro.pct * 100)}%</b>
          </div>
          <ProgressBar pct={macro.pct} color={macro.color} />
          <div className="phx-nutrition-macro-foot">
            <span>{macro.logged}{macro.unit} / {macro.target}{macro.unit}</span>
            <span>{macro.remaining}{macro.unit} left</span>
          </div>
        </div>
      ))}
    </div>
  )
}

function ProtocolStack({ items }) {
  return (
    <div className="phx-protocol-stack">
      {items.map((item, index) => (
        <div key={item.label} className={`phx-protocol-step phx-protocol-${item.state}`}>
          <span className="phx-protocol-index">{String(index + 1).padStart(2, '0')}</span>
          <div>
            <strong>{item.label}</strong>
            <span>{item.value}</span>
          </div>
        </div>
      ))}
    </div>
  )
}


function CompactMealLedger({ meals, kcalLeft, proteinLeft, deleting, onDelete, onLogMeal }) {
  const previewMeals = meals.slice(0, 3)
  return (
    <div className="phx-nutrition-hero-ledger">
      <div className="phx-nutrition-hero-ledger-head">
        <span>RECENT MEAL LEDGER</span>
        <b>{meals.length} LOGGED</b>
      </div>
      {previewMeals.length > 0 ? previewMeals.map(meal => (
        <div key={meal.id} className="phx-nutrition-hero-meal">
          <div>
            <strong>{meal.name}</strong>
            <span>{safeRound(meal.protein_g)}G P · {safeRound(meal.carbs_g)}G C · {safeRound(meal.fat_g)}G F</span>
          </div>
          <div className="phx-nutrition-hero-meal-action">
            <b>{safeRound(meal.calories)} KCAL</b>
            <button onClick={() => onDelete(meal.id)} disabled={deleting === meal.id} aria-label={`Delete ${meal.name}`}>×</button>
          </div>
        </div>
      )) : (
        <EmptyMeals kcalLeft={kcalLeft} proteinLeft={proteinLeft} onLogMeal={onLogMeal} />
      )}
    </div>
  )
}

function SafetyStrip({ memory }) {
  const favoriteCount = memory?.favorite_count || 0
  const avoidCount = memory?.avoid_count || 0
  const pantryCount = memory?.pantry_count || 0
  return (
    <div className="phx-nutrition-safety-strip" aria-label="Nutrition safety locks">
      <span>LOGGED-DATA ONLY</span>
      <span>USER-APPROVED PLANS</span>
      <span>NO MEDICAL CLAIMS</span>
      <span>{favoriteCount} FAV · {avoidCount} AVOID · {pantryCount} PANTRY</span>
    </div>
  )
}

function NutritionFeatureCard({ code, title, meta, children, actionLabel, action, primary = false }) {
  return (
    <article className={`phx-nutrition-feature-card ${primary ? 'phx-nutrition-feature-card-primary' : ''}`}>
      <div className="phx-nutrition-feature-head">
        <span>{code}</span>
        <b>{meta}</b>
      </div>
      <h2>{title}</h2>
      <div className="phx-nutrition-feature-body">{children}</div>
      {action && <button type="button" onClick={action} className="phx-nutrition-feature-action">{actionLabel}</button>}
    </article>
  )
}

function WeeklySignal({ heatData, historyMeta }) {
  const days = heatData.length ? heatData.slice(-7) : [
    { label: 'M', state: 'empty' },
    { label: 'T', state: 'empty' },
    { label: 'W', state: 'empty' },
    { label: 'T', state: 'empty' },
    { label: 'F', state: 'empty' },
    { label: 'S', state: 'empty' },
    { label: 'S', state: 'empty' },
  ]

  return (
    <div className="phx-nutrition-week-signal">
      <div className="phx-nutrition-week-score"><strong>{historyMeta}</strong><span>GOOD / LOGGED</span></div>
      <div className="phx-nutrition-week-dots">
        {days.map((day, index) => <i key={`${day.label}-${index}`} className={`phx-heat-${day.state}`}>{day.label}</i>)}
      </div>
    </div>
  )
}

function FoodBrainSignal({ memory }) {
  const favoriteCount = memory?.favorite_count || 0
  const avoidCount = memory?.avoid_count || 0
  const pantryCount = memory?.pantry_count || 0
  return (
    <div className="phx-nutrition-brain-signal">
      <div><strong>{favoriteCount}</strong><span>favorites</span></div>
      <div><strong>{avoidCount}</strong><span>avoid</span></div>
      <div><strong>{pantryCount}</strong><span>pantry</span></div>
    </div>
  )
}


function DayModeTabs({ mode, onModeChange, defaultLabel }) {
  const modes = [
    { key: 'auto', label: defaultLabel || 'AUTO' },
    { key: 'rest', label: 'REST' },
    { key: 'performance', label: 'PERFORMANCE' },
  ]
  return (
    <div className="phx-nutrition-mode-tabs" aria-label="Nutrition mode selector">
      {modes.map(item => (
        <button
          key={item.key}
          type="button"
          onClick={() => onModeChange(item.key)}
          className={mode === item.key ? 'active' : ''}
        >
          {item.label}
        </button>
      ))}
    </div>
  )
}

function modeResultText(mode, selectedChoice, defaultDayLine) {
  if (!selectedChoice) return 'Choose a next meal shell to preview the next action.'
  if (mode === 'rest') return `${selectedChoice.result} Rest mode keeps the next meal lighter and leaves a wider buffer.`
  if (mode === 'performance') return `${selectedChoice.result} Performance mode keeps energy steadier for rehearsal, training, or a longer day.`
  return `${selectedChoice.result} ${defaultDayLine} mode uses current logged data only.`
}

function FuelTimeline({ timeline, target, selectedChoice }) {
  const checkpoints = timeline?.checkpoints || []
  const safeTarget = Math.max(1, Number(target) || 1)
  const plannedValue = checkpoints.length
    ? Math.min(safeTarget, checkpoints[checkpoints.length - 1].value + (selectedChoice?.kcal || 0))
    : Math.min(safeTarget, selectedChoice?.kcal || 0)
  const points = checkpoints.map((point, index) => {
    const total = Math.max(1, Math.max(checkpoints.length - 1, 1))
    const x = 42 + (index / total) * 330
    const y = 162 - Math.min(1, point.value / safeTarget) * 108
    return { ...point, x, y }
  })
  const plannedPoint = { x: 440, y: 162 - Math.min(1, plannedValue / safeTarget) * 108, value: plannedValue }
  const polyPoints = [...points, plannedPoint].map(p => `${p.x.toFixed(0)},${p.y.toFixed(0)}`).join(' ')

  return (
    <div className="phx-nutrition-chart-card">
      <div className="phx-nutrition-chart-head"><span>KCAL TIMELINE</span><b>TARGET {safeRound(safeTarget)}</b></div>
      <svg className="phx-nutrition-line-chart" viewBox="0 0 500 210" role="img" aria-label="Daily calorie timeline">
        <line x1="36" y1="162" x2="468" y2="162" />
        <line className="target" x1="36" y1="54" x2="468" y2="54" />
        {polyPoints && <polyline points={polyPoints} />}
        {points.map((point, index) => (
          <g key={`${point.label}-${index}`}>
            <circle cx={point.x} cy={point.y} r="5" />
            <text x={point.x - 12} y="188">M{index + 1}</text>
          </g>
        ))}
        <circle className="planned" cx={plannedPoint.x} cy={plannedPoint.y} r="5" />
        <text className="planned-text" x="408" y="188">NEXT</text>
        <text className="target-text" x="410" y="44">TARGET</text>
      </svg>
    </div>
  )
}

function MacroProgressBars({ macros }) {
  return (
    <div className="phx-nutrition-progress-bars">
      {macros.map(macro => (
        <div key={macro.label} className="phx-nutrition-progress-row">
          <span>{macro.label}</span>
          <ProgressBar pct={macro.pct} color={macro.color} />
          <b>{Math.round(macro.pct * 100)}%</b>
        </div>
      ))}
    </div>
  )
}

function MealChoiceDeck({ choices, selectedKey, onSelect }) {
  return (
    <div className="phx-nutrition-choice-deck">
      {choices.map(choice => (
        <button
          key={choice.key}
          type="button"
          onClick={() => onSelect(choice.key)}
          className={selectedKey === choice.key ? 'active' : ''}
        >
          <span>{choice.meta}</span>
          <strong>{choice.title}</strong>
          <small>{choice.copy}</small>
          <b>{choice.kcal} kcal · {choice.protein}g protein</b>
        </button>
      ))}
    </div>
  )
}

function FinishedOutputCard({ code, title, meta, children, wide = false }) {
  return (
    <article className={`phx-nutrition-output-card ${wide ? 'phx-nutrition-output-card-wide' : ''}`}>
      <div className="phx-nutrition-feature-head">
        <span>{code}</span>
        <b>{meta}</b>
      </div>
      <h2>{title}</h2>
      {children}
    </article>
  )
}

function SubsectionRoute({ code, title, copy, action, primary = false }) {
  return (
    <button type="button" onClick={action} className={`phx-nutrition-route-card ${primary ? 'phx-nutrition-route-card-primary' : ''}`}>
      <span>{code}</span>
      <strong>{title}</strong>
      <small>{copy}</small>
    </button>
  )
}

function SafetyLocks({ memory }) {
  const favoriteCount = memory?.favorite_count || 0
  const avoidCount = memory?.avoid_count || 0
  const pantryCount = memory?.pantry_count || 0
  return (
    <div className="phx-nutrition-lock-grid">
      <div><strong>LOCAL FIRST</strong><span>sqlite logs + local food brain</span></div>
      <div><strong>APPROVAL ONLY</strong><span>no auto food logging</span></div>
      <div><strong>MEMORY</strong><span>{favoriteCount} favorites · {avoidCount} dislikes · {pantryCount} pantry</span></div>
      <div><strong>CLAIM SAFE</strong><span>no medical or guarantee language</span></div>
    </div>
  )
}

export default function NutritionDashboard({
  onBack,
  onLogMeal,
  onRecipes,
  onWeight,
  onQuickAsk,
  onMealBuilder,
  onDayPlanner,
  onMemory,
  onShopping,
  onWeeklyPlanner,
  onAcceptanceGate,
  onCalendarBridge,
}) {
  const [status, setStatus] = useState(null)
  const [historyData, setHistoryData] = useState(null)
  const [trendText, setTrendText] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [deleting, setDeleting] = useState(null)
  const [dayMode, setDayMode] = useState('auto')
  const [selectedMealKey, setSelectedMealKey] = useState(null)

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

  useEffect(() => {
    load()
  }, [])

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

  if (loading) return (
    <CockpitShell accent={LIME} className="phx-nutrition-cockpit" aria-label="Nutrition Command Center">
      <EmptyState status="LOADING" title="Nutrition loading" message="Reading persisted nutrition logs only." />
    </CockpitShell>
  )

  if (error || !status) return (
    <CockpitShell accent={LIME} className="phx-nutrition-cockpit" aria-label="Nutrition Command Center">
      <EmptyState status="OFFLINE" title="Nutrition unavailable" message={error || 'No nutrition status returned.'} />
    </CockpitShell>
  )

  const model = buildNutritionDashboardModel(status, historyData)
  const selectedChoice = model.mealChoices.find(choice => choice.key === selectedMealKey) || model.mealChoices[0]
  const selectedChoiceKey = selectedChoice?.key || null
  const nextResultText = modeResultText(dayMode, selectedChoice, model.dayLine)

  return (
    <CockpitShell accent={LIME} className="phx-nutrition-cockpit" aria-label="Nutrition Command Center">
      <div className="phx-domain-frame phx-nutrition-frame">
        <header className="phx-command-hero phx-nutrition-command-hero phx-nutrition-command-hero-v3 phx-nutrition-finance-copy phx-enter">
          <div className="phx-hud-ring" />
          <div className="phx-command-topbar">
            <span>PHOENIX · PERSONAL HEURISTIC OPERATING ENGINE</span>
            <span className="phx-command-online"><i />{model.phaseLabel} · {model.dayLine}</span>
          </div>

          <div className="phx-command-hero-grid phx-nutrition-hero-grid">
            <div>
              <div className="phx-command-kicker">PHOENIX</div>
              <h1 className="phx-command-title-xl finance-command-title phx-nutrition-command-title-finance">
                <span>NUTRITION</span>
                <span className="accent">COMMAND CENTER</span>
              </h1>

              <div className="phx-command-label-line">DAILY ENERGY TARGET</div>
              <div className="phx-command-value-row">
                <span className="phx-command-unit">KCAL</span>
                <strong className="phx-command-value phx-hud-glitch">{model.logged.calories.toLocaleString()}</strong>
                <span className="phx-command-denominator">/ {model.target.calories.toLocaleString()}</span>
              </div>
              <div className="phx-command-brief">
                <strong>{model.remaining.calories} KCAL LEFT · {model.primarySignal}</strong><br />
                {nextResultText} No medical claims; plans stay user-approved.
              </div>
              <ProgressBar pct={model.pct.calories} />
              <DayModeTabs mode={dayMode} onModeChange={setDayMode} defaultLabel={model.dayLine} />

              <div className="phx-nutrition-primary-actions">
                <CommandButton label="LOG MEAL" action={onLogMeal} primary />
                <CommandButton label="BUILD NEXT" action={onMealBuilder} />
                <CommandButton label="PLAN DAY" action={onDayPlanner} />
              </div>
            </div>

            <aside className="phx-core-card phx-nutrition-core-card phx-nutrition-finance-core">
              <div className="phx-core-code">FC-001</div>
              <div className="phx-core-title">
                <strong>FUEL CORE</strong>
                <span>MACRO BALANCE</span>
              </div>
              <MacroRings proteinPct={model.pct.protein} carbPct={model.pct.carbs} fatPct={model.pct.fat} label={model.primarySignal} />
              <CompactMealLedger
                meals={model.meals}
                kcalLeft={model.remaining.calories}
                proteinLeft={model.remaining.protein}
                deleting={deleting}
                onDelete={handleDelete}
                onLogMeal={onLogMeal}
              />
              <SafetyStrip memory={model.memory} />
              <SourceStamp source="sqlite nutrition logs" freshness={`${model.meals.length} meals today`} />
              <div className="phx-core-status">
                {onBack && <button className="phx-command-button phx-command-button-ghost" onClick={onBack}>BACK</button>}
                <StatusChip tone={statusTone(status.adherence_status)}>{model.primarySignal}</StatusChip>
              </div>
            </aside>
          </div>
        </header>

        {trendText && (
          <div className="phx-nutrition-inline-trend">
            <strong>LOGGED TREND READ</strong>
            <span>{trendText}</span>
          </div>
        )}

        <DataPanel eyebrow="[ OPENING OUTPUTS ]" title="Finished Nutrition Outputs" meta="TODAY">
          <div className="phx-panel-body">
            <div className="phx-nutrition-output-grid">
              <FinishedOutputCard code="FUEL" title="Daily Fuel Graph" meta={`${model.logged.calories} / ${model.target.calories} KCAL`} wide>
                <p className="phx-nutrition-output-copy">Shows how today’s meals accumulated and where the selected next meal would land.</p>
                <FuelTimeline timeline={model.calorieTimeline} target={model.target.calories} selectedChoice={selectedChoice} />
              </FinishedOutputCard>

              <FinishedOutputCard code="MACRO" title="Macro Progress" meta={`${model.overallPct}% OVERALL`}>
                <p className="phx-nutrition-output-copy">Phoenix surfaces the result of the macro engine as simple progress bars.</p>
                <MacroProgressBars macros={model.macroMatrix} />
              </FinishedOutputCard>

              <FinishedOutputCard code="WEEK" title="Week Rhythm" meta={`${model.visibleDaysMeta} DAYS`}>
                <p className="phx-nutrition-output-copy">Shows logged-day rhythm. Detailed trend review stays in History.</p>
                <WeeklySignal heatData={model.heatData} historyMeta={model.historyMeta} />
              </FinishedOutputCard>

              <FinishedOutputCard code="CHOICE" title="Choose Next Meal" meta="USER CONTROL" wide>
                <p className="phx-nutrition-output-copy">Choose a meal shell to preview the next action. Nothing is saved until you open Build Next or Log Meal.</p>
                <MealChoiceDeck choices={model.mealChoices} selectedKey={selectedChoiceKey} onSelect={setSelectedMealKey} />
              </FinishedOutputCard>
            </div>
          </div>
        </DataPanel>

        <DataPanel eyebrow="[ DETAIL ROUTES ]" title="Nutrition Detail Routes" meta="SUBSECTIONS">
          <div className="phx-panel-body">
            <div className="phx-nutrition-route-grid phx-nutrition-route-grid-clean">
              <SubsectionRoute code="MEALS" title="Meals" copy="Full meal ledger, add/edit/delete, recipes, and daily history." action={onLogMeal} primary />
              <SubsectionRoute code="PLAN" title="Plan" copy="Build next meal and review the user-approved day plan." action={onDayPlanner} />
              <SubsectionRoute code="TARGETS" title="Targets" copy="Preferences, pantry, saved choices, and manual settings." action={onMemory} />
              <SubsectionRoute code="HISTORY" title="History" copy="Weekly rhythm, trends, and previous-day review." action={onWeight} />
            </div>
          </div>
        </DataPanel>
      </div>
    </CockpitShell>
  )
}
