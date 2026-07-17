import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const readSource = name => readFileSync(new URL(name, import.meta.url), 'utf8')

test('control room exposes the approved four-view hierarchy without Task 9 adapt behavior', () => {
  const room = readSource('./TrainingControlRoom.jsx')

  for (const label of ['WEEK', 'ADAPT', 'HISTORY', 'RULES']) {
    assert.match(room, new RegExp(`['"]${label}['"]`))
  }
  assert.match(room, /TrainingWeekView/)
  assert.match(room, /TrainingPlanHistory/)
  assert.match(room, /TrainingRulesView/)
  assert.match(room, /training-adapt-placeholder/)
  assert.doesNotMatch(room, /TrainingAdaptView|postTrainingPlanProposal|applyTrainingPlanProposal|rejectTrainingPlanProposal/)
})

test('control room loads Task 7 data and exposes real loading error and empty states', () => {
  const room = readSource('./TrainingControlRoom.jsx')
  const week = readSource('./TrainingWeekView.jsx')
  const history = readSource('./TrainingPlanHistory.jsx')

  for (const api of ['getTrainingCurrentPlan', 'getTrainingPlanHistory', 'getTrainingRules']) {
    assert.match(room, new RegExp(api))
  }
  assert.match(room, /normalizeTrainingPlan/)
  assert.match(room, /Promise\.allSettled/)
  assert.match(room, /training-plan-loading/)
  assert.match(room, /role="status"/)
  assert.match(room, /training-plan-error/)
  assert.match(room, /role="alert"/)
  assert.match(room, /NO ACTIVE PLAN/)
  assert.match(room, /No active training plan for the current horizon/)
  assert.match(room, /error=\{errors\.plan\}/)
  assert.match(room, /error=\{errors\.history\}/)
  assert.match(room, /error=\{errors\.rules\}/)
  assert.match(week, /!error/)
  assert.match(history, /!error/)
})

test('tabs expose roving focus and linked tab panels', () => {
  const room = readSource('./TrainingControlRoom.jsx')

  assert.match(room, /role="tablist"/)
  assert.match(room, /role="tab"/)
  assert.match(room, /aria-selected=/)
  assert.match(room, /aria-controls=/)
  assert.match(room, /tabIndex=/)
  assert.match(room, /onKeyDown=/)
  assert.match(room, /ArrowLeft/)
  assert.match(room, /ArrowRight/)
  assert.match(room, /Home/)
  assert.match(room, /End/)
  assert.match(room, /role="tabpanel"/)
  assert.match(room, /aria-labelledby=/)
  assert.match(room, /training-control-room-scrim[\s\S]*tabIndex=\{-1\}/)
})

test('week view preserves exactly seven stable cells and readable plan detail', () => {
  const week = readSource('./TrainingWeekView.jsx')

  assert.match(week, /WEEK_CELL_COUNT\s*=\s*7/)
  assert.match(week, /Array\.from\(\{ length: WEEK_CELL_COUNT \}/)
  assert.match(week, /training-week-day/)
  assert.match(week, /changed/)
  assert.match(week, /change_reason/)
  assert.match(week, /objective/)
  assert.match(week, /estimated_minutes/)
  assert.match(week, /validations/)
  assert.match(week, /planner_version/)
  assert.match(week, /status/)
})

test('history renders lifecycle lineage and rules expose only public readable policy', () => {
  const history = readSource('./TrainingPlanHistory.jsx')

  for (const field of ['plan_id', 'status', 'created_at', 'parent_plan_id', 'reason', 'changed_at', 'superseded_by']) {
    assert.match(history, new RegExp(field))
  }
  for (const field of ['objective', 'recovery_spacing', 'adaptation_limits', 'movement_families', 'preferences', 'temporary_constraints']) {
    assert.match(history, new RegExp(field))
  }
  assert.match(history, /href=/)
  assert.match(history, /NO PLAN HISTORY/)
  assert.match(history, /NO PUBLIC RULES AVAILABLE/)
  assert.doesNotMatch(history, /JSON\.stringify|rules\.planner\b/)
})

test('control room preserves scoped orange Training identity', () => {
  const room = readSource('./TrainingControlRoom.jsx')
  const css = readSource('../holo.css')
  const trainingCss = css.slice(css.indexOf('/* Training Control Room'))

  assert.match(room, /phx-scope-training/)
  assert.match(css, /training-control-room/)
  assert.match(trainingCss, /var\(--phx-accent\)/)
  assert.doesNotMatch(room, /financeReadability/)
  assert.doesNotMatch(trainingCss, /--phx-finance|--phx-calendar|#00bbdd|#9f7dff/i)
})

test('week cells and shell use stable responsive dimensions and visible focus', () => {
  const css = readSource('../holo.css')
  const trainingCss = css.slice(css.indexOf('/* Training Control Room'))
  const mobileStart = trainingCss.indexOf('@media (max-width: 760px)')
  const mobileCss = trainingCss.slice(mobileStart, trainingCss.indexOf('@media (prefers-reduced-motion', mobileStart))

  assert.match(trainingCss, /grid-template-columns:\s*repeat\(7,\s*minmax\(112px,\s*1fr\)\)/)
  assert.match(trainingCss, /max-height:\s*calc\(100dvh\s*-\s*\d+px\)/)
  assert.match(trainingCss, /\.training-control-tab:focus-visible/)
  assert.match(trainingCss, /@media\s*\(max-width:\s*760px\)[^}]*\{[\s\S]*grid-template-columns:\s*repeat\(2,[\s\S]*grid-template-columns:\s*repeat\(7,\s*118px\)/)
  assert.match(mobileCss, /\.training-control-room\s*\{[^}]*animation:\s*none/)
})
