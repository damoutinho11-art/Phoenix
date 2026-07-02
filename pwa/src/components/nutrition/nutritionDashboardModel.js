function numeric(value) {
  const n = Number(value)
  return Number.isFinite(n) ? n : 0
}

function clampRatio(value, target) {
  return Math.min(1, Math.max(0, numeric(value) / Math.max(1, numeric(target))))
}

function roundWhole(value) {
  return Math.round(numeric(value))
}

function macroState(logged, target) {
  const ratio = clampRatio(logged, target)
  if (ratio >= 1) return 'locked'
  if (ratio >= 0.75) return 'closing'
  if (ratio > 0) return 'open'
  return 'empty'
}


function mealChoiceKcal(remainingCalories, fallback) {
  if (remainingCalories <= 0) return fallback
  return Math.min(fallback, Math.max(280, roundWhole(remainingCalories)))
}

function buildMealChoices({ remainingCalories, remainingProtein, remainingCarbs, isTrainingDay }) {
  const proteinNeed = Math.max(0, roundWhole(remainingProtein))
  const carbNeed = Math.max(0, roundWhole(remainingCarbs))
  const trainingMeta = isTrainingDay ? 'training-day option' : 'steady option'

  return [
    {
      key: 'protein-bowl',
      title: 'Protein Bowl',
      kcal: mealChoiceKcal(remainingCalories, 560),
      protein: Math.max(32, Math.min(45, proteinNeed || 42)),
      meta: trainingMeta,
      copy: 'Higher-protein meal shell for the next logged meal. User chooses the actual food before saving.',
      result: 'Protein-forward next meal; keeps dinner useful while staying inside the remaining fuel window.',
    },
    {
      key: 'light-plate',
      title: 'Light Plate',
      kcal: mealChoiceKcal(remainingCalories, 410),
      protein: Math.max(24, Math.min(36, proteinNeed || 34)),
      meta: 'lighter closeout',
      copy: 'Lower-calorie shell for days where you want to keep a larger buffer.',
      result: 'Lighter closeout; useful when remaining calories are limited or the day is nearly closed.',
    },
    {
      key: 'carb-support',
      title: 'Carb Support',
      kcal: mealChoiceKcal(remainingCalories, 520),
      protein: Math.max(25, Math.min(40, proteinNeed || 35)),
      meta: `${carbNeed}g carbs open`,
      copy: 'Balanced shell when training or rehearsal demand needs steadier energy.',
      result: 'Balanced meal with moderate carbs; useful when performance demand is still ahead.',
    },
  ]
}

function buildCalorieTimeline(meals, caloriesTarget, caloriesLogged) {
  let running = 0
  const checkpoints = meals.slice(0, 5).map((meal, index) => {
    running += numeric(meal.calories)
    return {
      label: meal.name || `Meal ${index + 1}`,
      value: roundWhole(running),
    }
  })

  if (!checkpoints.length && caloriesLogged > 0) {
    checkpoints.push({ label: 'Logged', value: roundWhole(caloriesLogged) })
  }

  return {
    target: roundWhole(caloriesTarget),
    checkpoints,
  }
}

export function buildNutritionDashboardModel(status, historyData) {
  const target = status?.target || {}
  const logged = status?.logged || {}
  const meals = Array.isArray(status?.meal_log) ? status.meal_log : []

  const caloriesLogged = numeric(logged.total_calories)
  const caloriesTarget = numeric(target.calories)
  const proteinLogged = numeric(logged.total_protein_g)
  const proteinTarget = numeric(target.protein_g)
  const carbsLogged = numeric(logged.total_carbs_g)
  const carbsTarget = numeric(target.carbs_g)
  const fatLogged = numeric(logged.total_fat_g)
  const fatTarget = numeric(target.fat_g)

  const remainingCalories = numeric(status?.remaining_calories)
  const remainingProtein = numeric(status?.remaining_protein_g)
  const remainingCarbs = numeric(status?.remaining_carbs_g)
  const remainingFat = numeric(status?.remaining_fat_g)

  const caloriesPct = clampRatio(caloriesLogged, caloriesTarget)
  const proteinPct = clampRatio(proteinLogged, proteinTarget)
  const carbsPct = clampRatio(carbsLogged, carbsTarget)
  const fatPct = clampRatio(fatLogged, fatTarget)
  const overallPct = Math.round(((proteinPct + carbsPct + fatPct) / 3) * 100)

  const proteinLine = status?.protein_target_met
    ? 'PROTEIN MET'
    : `${Math.max(0, roundWhole(remainingProtein))}G PROTEIN LEFT`
  const dayLine = status?.is_training_day ? 'TRAINING DAY' : 'REST DAY'
  const nextStep = meals.length === 0
    ? 'LOG FIRST MEAL'
    : remainingCalories > 350
      ? 'BUILD NEXT MEAL'
      : remainingCalories > 120
        ? 'LIGHT CLOSEOUT'
        : 'DAY NEAR CLOSED'

  const primarySignal = status?.adherence_status === 'good'
    ? 'LOCKED'
    : status?.adherence_status === 'warn'
      ? 'PARTIAL'
      : status?.adherence_status === 'miss'
        ? 'MISSED'
        : meals.length
          ? 'IN PROGRESS'
          : 'EMPTY'

  const dayLabels = ['M', 'T', 'W', 'T', 'F', 'S', 'S']
  const heatData = (historyData?.history || []).slice(-14).map((d, i) => ({
    label: dayLabels[i % 7],
    state: d.adherence_status === 'good' ? 'good' : d.adherence_status === 'warn' ? 'warn' : d.has_data ? 'miss' : 'empty',
  }))

  const commandProtocol = [
    {
      label: 'Energy window',
      value: `${Math.max(0, roundWhole(remainingCalories))} kcal open`,
      state: remainingCalories <= 120 ? 'locked' : meals.length ? 'active' : 'open',
    },
    {
      label: 'Protein floor',
      value: proteinLine,
      state: status?.protein_target_met ? 'locked' : proteinLogged > 0 ? 'active' : 'open',
    },
    {
      label: 'Meal ledger',
      value: `${meals.length} logged today`,
      state: meals.length ? 'active' : 'open',
    },
    {
      label: 'Approval boundary',
      value: 'manual actions only',
      state: 'locked',
    },
  ]

  const macroMatrix = [
    {
      label: 'Protein',
      logged: roundWhole(proteinLogged),
      target: roundWhole(proteinTarget),
      remaining: Math.max(0, roundWhole(remainingProtein)),
      unit: 'g',
      pct: proteinPct,
      color: '#7df0ff',
      state: macroState(proteinLogged, proteinTarget),
    },
    {
      label: 'Carbs',
      logged: roundWhole(carbsLogged),
      target: roundWhole(carbsTarget),
      remaining: Math.max(0, roundWhole(remainingCarbs)),
      unit: 'g',
      pct: carbsPct,
      color: '#ffd56b',
      state: macroState(carbsLogged, carbsTarget),
    },
    {
      label: 'Fats',
      logged: roundWhole(fatLogged),
      target: roundWhole(fatTarget),
      remaining: Math.max(0, roundWhole(remainingFat)),
      unit: 'g',
      pct: fatPct,
      color: '#ff9f43',
      state: macroState(fatLogged, fatTarget),
    },
  ]

  return {
    phaseLabel: String(status?.phase || 'phase unknown').toUpperCase(),
    dayLine,
    meals,
    target: {
      calories: roundWhole(caloriesTarget),
      protein: roundWhole(proteinTarget),
      carbs: roundWhole(carbsTarget),
      fat: roundWhole(fatTarget),
    },
    logged: {
      calories: roundWhole(caloriesLogged),
      protein: roundWhole(proteinLogged),
      carbs: roundWhole(carbsLogged),
      fat: roundWhole(fatLogged),
    },
    remaining: {
      calories: Math.max(0, roundWhole(remainingCalories)),
      protein: Math.max(0, roundWhole(remainingProtein)),
      carbs: Math.max(0, roundWhole(remainingCarbs)),
      fat: Math.max(0, roundWhole(remainingFat)),
    },
    pct: { calories: caloriesPct, protein: proteinPct, carbs: carbsPct, fat: fatPct },
    overallPct,
    primarySignal,
    proteinLine,
    nextStep,
    commandProtocol,
    macroMatrix,
    heatData,
    historyMeta: `${historyData?.good_days || 0} / ${historyData?.logged_days || 0}`,
    visibleDaysMeta: `${historyData?.logged_days || 0} / 7`,
    calorieTimeline: buildCalorieTimeline(meals, caloriesTarget, caloriesLogged),
    mealChoices: buildMealChoices({
      remainingCalories,
      remainingProtein,
      remainingCarbs,
      isTrainingDay: Boolean(status?.is_training_day),
    }),
    memory: status?.memory || {},
  }
}
