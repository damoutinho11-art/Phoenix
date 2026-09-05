import { useEffect, useRef, useState } from 'react'
import {
  getRecompositionReview,
  getTodayProtocol,
  postTodayProtocolLogMeal,
  postTodayProtocolReplan,
} from '../../api/client'
import { CockpitShell, EmptyState, SourceStamp, StatusChip } from '../cockpit/CockpitPrimitives'
import { buildTodayProtocolModel } from './todayProtocolModel'
import {
  commandErrorMessage,
  loadProtocolSnapshot,
  requiresMealConfirmation,
  shouldStartCommand,
  STALE_PROTOCOL_MESSAGE,
} from './todayProtocolFlow'

const ORANGE = '#ff9f43'

function metric(value, suffix = '') {
  return Number.isFinite(value) ? `${value}${suffix}` : 'UNAVAILABLE'
}

function TargetMetric({ label, value, suffix }) {
  return (
    <div className="phx-today-protocol-metric">
      <span>{label}</span>
      <strong>{metric(value, suffix)}</strong>
    </div>
  )
}

function MealRow({ meal, pending, portionInputs, onPortionChange, onLog, onReplan, confirmMealId, onCancelLog, onConfirmLog }) {
  const primaryItem = meal.items[0]
  const portionKey = primaryItem ? `${meal.meal_id}:${primaryItem.item_id}` : null
  const total = meal.total || {}

  return (
    <article className="phx-today-protocol-meal" aria-label={`${meal.title || 'Protocol'} meal`}>
      <header className="phx-today-protocol-meal-head">
        <div>
          <span>{meal.timing || 'TIME UNAVAILABLE'}</span>
          <h2>{meal.title || 'UNTITLED MEAL'}</h2>
        </div>
        <StatusChip tone={meal.portable ? 'caution' : 'verified'}>{meal.portable ? 'PORTABLE' : 'PLANNED'}</StatusChip>
      </header>

      <div className="phx-today-protocol-items">
        {meal.items.map((item, index) => (
          <div className="phx-today-protocol-item" key={`${item.item_id || item.name}:${index}`}>
            <strong>{item.name || 'UNNAMED ITEM'}</strong>
            <span>{item.quantityLabel}</span>
            <small>{item.sourceLabel}</small>
            {item.sourceLinks.map(link => (
              <a key={`${link.label}:${link.href}`} href={link.href} target="_blank" rel="noreferrer">{link.label}</a>
            ))}
          </div>
        ))}
      </div>

      <div className="phx-today-protocol-total" aria-label={`${meal.title || 'Meal'} macro total`}>
        <span>{metric(total.calories, ' KCAL')}</span>
        <span>{metric(total.protein_g, 'G P')}</span>
        <span>{metric(total.carbs_g, 'G C')}</span>
        <span>{metric(total.fat_g, 'G F')}</span>
        <span>{meal.fibreLabel}</span>
      </div>

      {primaryItem && (
        <label className="phx-today-protocol-portion">
          <span>PORTION GRAMS</span>
          <input
            type="number"
            min="0.1"
            step="0.1"
            value={portionInputs[portionKey] ?? primaryItem.quantity_g ?? ''}
            onChange={event => onPortionChange(portionKey, event.target.value)}
            disabled={pending}
            aria-label={`Adjust ${primaryItem.name || 'meal'} grams`}
          />
        </label>
      )}

      <div className="phx-today-protocol-command-grid" aria-label={`${meal.title || 'Meal'} commands`}>
        <button type="button" onClick={() => onLog(meal)} disabled={pending}>EAT &amp; LOG</button>
        <button type="button" onClick={() => onReplan('replace', meal)} disabled={pending}>REPLACE</button>
        <button type="button" onClick={() => onReplan('adjust_portion', meal, primaryItem, portionKey)} disabled={pending || !primaryItem}>ADJUST PORTION</button>
        <button type="button" onClick={() => onReplan('skip', meal)} disabled={pending}>SKIP</button>
      </div>

      {confirmMealId === meal.meal_id && (
        <div className="phx-today-protocol-confirm" role="alert">
          <span>LOG THIS MEAL AS EATEN?</span>
          <button type="button" onClick={() => onConfirmLog(meal)} disabled={pending}>CONFIRM LOG</button>
          <button type="button" onClick={onCancelLog} disabled={pending}>CANCEL</button>
        </div>
      )}
    </article>
  )
}

const defaultApi = {
  getTodayProtocol,
  getRecompositionReview,
  postTodayProtocolLogMeal,
  postTodayProtocolReplan,
}

export default function TodayProtocol({ onBack, api = defaultApi }) {
  const [protocol, setProtocol] = useState(null)
  const [review, setReview] = useState(null)
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState(null)
  const [actionError, setActionError] = useState(null)
  const [pending, setPending] = useState(false)
  const [confirmMealId, setConfirmMealId] = useState(null)
  const [portionInputs, setPortionInputs] = useState({})
  const pendingRef = useRef(false)

  async function load() {
    setLoading(true)
    setLoadError(null)
    try {
      const snapshot = await loadProtocolSnapshot(api.getTodayProtocol, api.getRecompositionReview)
      setProtocol(snapshot.protocol)
      setReview(snapshot.review)
      if (snapshot.reviewUnavailable) setLoadError('Adjustment review unavailable. Today Protocol remains current.')
    } catch (error) {
      setLoadError('Today Protocol unavailable. Check that the backend is running.')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { load() }, [])

  function handleActionError(error) {
    setActionError(commandErrorMessage(error))
  }

  async function runAction(work) {
    if (!shouldStartCommand(pendingRef.current)) return
    pendingRef.current = true
    setPending(true)
    setActionError(null)
    try {
      await work()
    } catch (error) {
      handleActionError(error)
    } finally {
      pendingRef.current = false
      setPending(false)
    }
  }

  function handlePortionChange(key, value) {
    setPortionInputs(current => ({ ...current, [key]: value }))
  }

  function openLogConfirmation(meal) {
    if (!requiresMealConfirmation('log')) return
    setConfirmMealId(meal.meal_id)
    setActionError(null)
  }

  async function confirmLog(meal) {
    await runAction(async () => {
      await api.postTodayProtocolLogMeal({ protocol_id: protocol.protocol_id, meal_id: meal.meal_id })
      setConfirmMealId(null)
      await load()
    })
  }

  async function replan(action, meal, item, portionKey) {
    const payload = { protocol_id: protocol.protocol_id, action, meal_id: meal.meal_id }
    if (action === 'adjust_portion') {
      const quantity = Number(portionInputs[portionKey] ?? item?.quantity_g)
      if (!Number.isFinite(quantity) || quantity <= 0 || !item?.item_id) {
        setActionError('Enter a valid gram quantity before adjusting this portion.')
        return
      }
      payload.item_id = item.item_id
      payload.quantity_g = quantity
    }

    await runAction(async () => {
      const nextProtocol = await api.postTodayProtocolReplan(payload)
      setProtocol(nextProtocol)
      setConfirmMealId(null)
    })
  }

  if (loading && !protocol) return (
    <CockpitShell accent={ORANGE} className="phx-nutrition-cockpit" aria-label="Today Protocol">
      <EmptyState status="LOADING" title="Today Protocol loading" message="Reading the approved meal proposals." />
    </CockpitShell>
  )

  if (!protocol) return (
    <CockpitShell accent={ORANGE} className="phx-nutrition-cockpit" aria-label="Today Protocol">
      <EmptyState status="OFFLINE" title="Today Protocol unavailable" message={loadError || 'No protocol returned.'} />
      <div className="phx-today-protocol-retry"><button type="button" onClick={load}>RETRY</button></div>
    </CockpitShell>
  )

  const model = buildTodayProtocolModel(protocol)
  const stale = actionError === STALE_PROTOCOL_MESSAGE
  const fibreGap = model.fibreComplete
    ? Math.max(0, Number(protocol.food_constraints?.fibre_minimum_g || 0) - Number(model.plannedTotal.fibre_g || 0) - (protocol.logged_meals || []).reduce((sum, row) => sum + Number(row.fibre_g || 0), 0))
    : null
  const targetMatchLabel = model.targetMatched
    ? (model.nutritionBasis === 'estimated' ? 'ESTIMATED TARGET MATCH' : 'TARGET MATCHED')
    : 'CHECK TARGET GAP'

  return (
    <CockpitShell accent={ORANGE} className="phx-nutrition-cockpit phx-today-protocol-cockpit" aria-label="Today Protocol">
      <div className="phx-domain-frame phx-today-protocol-frame">
        <header className="phx-today-protocol-hero">
          <div>
            <span className="phx-today-protocol-eyebrow">PHOENIX · NUTRITION</span>
            <h1>TODAY PROTOCOL</h1>
            <p>Exact portions remain proposals until you confirm a single meal as eaten.</p>
          </div>
          <div className="phx-today-protocol-hero-actions">
            {onBack && <button type="button" onClick={onBack} disabled={pending}>BACK</button>}
            <StatusChip tone={model.targetMatched ? 'ready' : 'caution'}>{targetMatchLabel}</StatusChip>
          </div>
        </header>

        <section className="phx-today-protocol-summary" aria-label="Today Protocol target and review">
          <div>
            <span>TARGET</span>
            <div className="phx-today-protocol-metric-grid">
              <TargetMetric label="ENERGY" value={model.target.calories} suffix=" KCAL" />
              <TargetMetric label="PROTEIN" value={model.target.protein_g} suffix=" G" />
              <TargetMetric label="CARBS" value={model.target.carbs_g} suffix=" G" />
              <TargetMetric label="FAT" value={model.target.fat_g} suffix=" G" />
              <TargetMetric label="FIBRE MIN" value={protocol.food_constraints?.fibre_minimum_g} suffix=" G" />
            </div>
          </div>
          <div>
            <span>GAP</span>
            <div className="phx-today-protocol-metric-grid">
              <TargetMetric label="ENERGY" value={model.targetGap.calories} suffix=" KCAL" />
              <TargetMetric label="PROTEIN" value={model.targetGap.protein_g} suffix=" G" />
              <TargetMetric label="FIBRE GAP" value={fibreGap} suffix=" G" />
              <TargetMetric label="MEASUREMENTS" value={model.measurementsVerified ? 1 : null} suffix={model.measurementsVerified ? ' VERIFIED' : ''} />
              <TargetMetric label="REVIEW" value={review?.complete_days} suffix=" COMPLETE DAYS" />
            </div>
          </div>
        </section>

        {(loadError || actionError) && (
          <div className="phx-today-protocol-alert" role="alert">
            <span>{actionError || loadError}</span>
            <button type="button" onClick={load} disabled={pending}>{stale ? 'REFRESH' : 'RETRY'}</button>
          </div>
        )}

        <section className="phx-today-protocol-meal-grid" aria-label="Returned protocol meal rows">
          {model.meals.map(meal => (
            <MealRow
              key={meal.meal_id || meal.title}
              meal={meal}
              pending={pending}
              portionInputs={portionInputs}
              onPortionChange={handlePortionChange}
              onLog={openLogConfirmation}
              onReplan={replan}
              confirmMealId={confirmMealId}
              onCancelLog={() => setConfirmMealId(null)}
              onConfirmLog={confirmLog}
            />
          ))}
        </section>

        {!model.meals.length && <EmptyState status="EMPTY" title="No protocol meal rows" message="The service returned no meals, so nothing can be logged." />}
        <SourceStamp source="today protocol API" freshness={review?.status || 'review unavailable'} />
      </div>
    </CockpitShell>
  )
}
