import {
  WEEK_CELL_COUNT,
  buildWeekSlots,
  getTrainingViewState,
  getValidationPresentation,
} from './trainingControlRoomViewModel.js'

const DAY_FORMAT = new Intl.DateTimeFormat(undefined, {
  weekday: 'short',
  timeZone: 'UTC',
})

const DATE_FORMAT = new Intl.DateTimeFormat(undefined, {
  month: 'short',
  day: '2-digit',
  timeZone: 'UTC',
})

const labelize = value => String(value || '')
  .replaceAll('_', ' ')
  .replaceAll('-', ' ')
  .toUpperCase()

const isoDate = value => {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return null
  const parsed = new Date(`${value}T00:00:00Z`)
  return Number.isNaN(parsed.getTime()) ? null : parsed
}

const displayDate = (value, formatter, fallback) => {
  const date = isoDate(value)
  return date ? formatter.format(date).toUpperCase() : fallback
}

function PlanMetadata({ plan }) {
  const status = plan?.status || 'empty'
  return (
    <div className="training-plan-metadata" aria-label="Plan version metadata">
      <div className={`training-plan-version ${status}`}>
        <span>{status === 'proposed' ? 'PROPOSED VERSION' : status === 'active' ? 'ACTIVE VERSION' : 'PLAN VERSION'}</span>
        <strong>{plan?.plan_id || 'UNASSIGNED'}</strong>
      </div>
      <dl>
        <div><dt>CYCLE</dt><dd>{plan?.cycle_id || 'NO ACTIVE PLAN'}</dd></div>
        <div><dt>PLANNER</dt><dd>{plan?.planner_version || 'UNAVAILABLE'}</dd></div>
        <div><dt>STATUS</dt><dd className={status}>{labelize(status)}</dd></div>
      </dl>
    </div>
  )
}

function ValidationSummary({ validations = [] }) {
  const rows = Array.isArray(validations) ? validations : []
  const presentation = getValidationPresentation(rows)

  return (
    <section className="training-validation-summary" aria-labelledby="training-validation-title">
      <div className="training-section-heading">
        <span id="training-validation-title">VALIDATION SUMMARY</span>
        <b className={presentation.tone}>
          {rows.length ? `${presentation.passed}/${presentation.total} CLEAR // ${presentation.label}` : 'NO VALIDATIONS'}
        </b>
      </div>
      {rows.length > 0 && (
        <ul className="training-validation-list">
          {rows.map((validation, index) => (
            <li
              key={`${validation?.rule || 'validation'}-${index}`}
              className={getValidationPresentation([validation]).tone}
            >
              <i aria-hidden="true" />
              <span>{labelize(validation?.rule)}</span>
              <strong>{validation?.detail || (validation?.passed ? 'CHECK PASSED' : 'CHECK FAILED')}</strong>
            </li>
          ))}
        </ul>
      )}
    </section>
  )
}

export default function TrainingWeekView({ plan, loading = false, error = '' }) {
  const slots = buildWeekSlots(plan)
  const viewState = getTrainingViewState({ loading, error, hasData: Boolean(plan) })
  const planValidation = getValidationPresentation(plan?.validations)

  return (
    <div className="training-week-view">
      <div className="training-view-heading">
        <div>
          <span>AUTHORITATIVE HORIZON</span>
          <h2>SEVEN-DAY PLAN</h2>
        </div>
        <span className="training-view-count">07 CELLS // STABLE</span>
      </div>

      <PlanMetadata plan={plan} />

      {viewState.kind === 'empty' && (
        <div className={viewState.className} role={viewState.role}>NO ACTIVE PLAN</div>
      )}

      <div className="training-week-scroll" tabIndex={0} aria-label="Seven-day training plan">
        <div className="training-week-grid">
          {slots.map(({ index, date, day }) => {
            const changed = Boolean(day?.change_reason)
            const exercises = Array.isArray(day?.exercises) ? day.exercises : []
            return (
              <article
                key={date || `training-day-${index}`}
                className={`training-week-day${changed ? ` changed ${planValidation.tone}` : ''}${day ? '' : ' empty'}`}
              >
                <header>
                  <div>
                    <span>{displayDate(date, DAY_FORMAT, `DAY ${String(index + 1).padStart(2, '0')}`)}</span>
                    <time dateTime={date || undefined}>{displayDate(date, DATE_FORMAT, loading ? 'SYNC' : 'OPEN')}</time>
                  </div>
                  {changed && <b className="training-change-marker">CHANGED</b>}
                </header>

                {day ? (
                  <>
                    <div className="training-session-type">{labelize(day.session_type || 'session')}</div>
                    <h3>{labelize(day.objective || 'objective pending')}</h3>
                    <div className="training-day-duration">
                      <span>DURATION</span>
                      <strong>{Number.isFinite(day.estimated_minutes) ? `${day.estimated_minutes} MIN` : 'UNSET'}</strong>
                    </div>
                    <ul className="training-day-exercises" aria-label="Session movements">
                      {exercises.length > 0
                        ? exercises.slice(0, 3).map((exercise, exerciseIndex) => (
                          <li key={`${exercise?.name || 'movement'}-${exerciseIndex}`}>{labelize(exercise?.name || 'movement')}</li>
                        ))
                        : <li>NO LOADED MOVEMENTS</li>}
                    </ul>
                    {changed && <p className="training-change-reason">{day.change_reason}</p>}
                  </>
                ) : (
                  <div className="training-day-empty">{loading ? 'SYNCING DAY SLOT' : error ? 'PLAN DATA UNAVAILABLE' : 'NO SESSION ASSIGNED'}</div>
                )}
              </article>
            )
          })}
        </div>
      </div>

      <ValidationSummary validations={plan?.validations} />
    </div>
  )
}

export { WEEK_CELL_COUNT }
