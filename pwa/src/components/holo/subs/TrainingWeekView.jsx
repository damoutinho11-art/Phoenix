import {
  WEEK_CELL_COUNT,
  buildHybridWeekPresentation,
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

const currentIsoDate = () => new Date().toISOString().slice(0, 10)

const exerciseTarget = exercise => {
  const values = []
  if (Number.isFinite(exercise?.sets)) values.push(`${exercise.sets} SETS`)
  if (Number.isFinite(exercise?.reps)) values.push(`${exercise.reps} REPS`)
  if (Number.isFinite(exercise?.suggested_kg)) values.push(`${exercise.suggested_kg} KG`)
  if (Number.isFinite(exercise?.seconds)) values.push(`${exercise.seconds} SEC`)
  return values.length ? values.join(' // ') : 'TARGET UNSET'
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

const placeholderSlots = (plan, loading, error) => buildWeekSlots(plan).map(({ index, date }) => ({
  date,
  lifecycle: 'empty',
  intent: null,
  label: null,
  durationMinutes: null,
  sequencePosition: null,
  sequenceLength: null,
  highNeural: false,
  exercises: [],
  decisionReasons: [],
  placeholder: loading ? 'SYNCING DAY SLOT' : error ? 'PLAN DATA UNAVAILABLE' : 'NO SESSION ASSIGNED',
  index,
}))

export default function TrainingWeekView({
  plan,
  loading = false,
  error = '',
  todayIso = currentIsoDate(),
}) {
  const presentation = buildHybridWeekPresentation(plan, todayIso)
  const slots = presentation.slots.length
    ? presentation.slots
    : placeholderSlots(plan, loading, error)
  const viewState = getTrainingViewState({ loading, error, hasData: Boolean(plan) })
  const today = presentation.today
  const countSummary = `${String(presentation.counts.training).padStart(2, '0')} SESSIONS // ${String(presentation.counts.recovery).padStart(2, '0')} RECOVERY${
    presentation.counts.routed
      ? ` // ${String(presentation.counts.routed).padStart(2, '0')} ROUTED`
      : ''
  }`
  const sequenceSummary = ['ordinary', 'routed'].includes(presentation.sequenceMode)
    ? countSummary
    : ['peak', 'attempt'].includes(presentation.sequenceMode)
      ? `PHASE ROUTED // ${countSummary}`
      : presentation.sequenceMode === 'legacy'
        ? 'LEGACY PLAN'
        : 'SEQUENCE UNVERIFIED'

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

      <section aria-labelledby="training-hybrid-sequence-title">
        <div className="training-section-heading">
          <span id="training-hybrid-sequence-title">ACTIVE SEQUENCE</span>
          <b>{sequenceSummary}</b>
        </div>
        <div className="training-week-scroll" tabIndex={0} aria-label="Seven-day training plan">
          <div className="training-hybrid-sequence training-week-grid">
            {slots.map((slot, index) => {
              const isToday = slot.date === todayIso
              const slotTitle = slot.lifecycle === 'recovery'
                ? 'RECOVERY'
                : slot.label || 'SESSION IDENTITY UNVERIFIED'
              return (
                <article
                  key={slot.date || `training-day-${index}`}
                  className={[
                    'training-hybrid-slot',
                    'training-week-day',
                    slot.lifecycle,
                    isToday ? 'current' : '',
                    slot.highNeural ? 'high-neural' : '',
                  ].filter(Boolean).join(' ')}
                  tabIndex={0}
                  aria-current={isToday ? 'date' : undefined}
                  aria-label={`${displayDate(slot.date, DAY_FORMAT, `Day ${index + 1}`)} · ${slotTitle} · ${labelize(slot.lifecycle)}`}
                >
                  <header>
                    <div>
                      <span>{displayDate(slot.date, DAY_FORMAT, `DAY ${String(index + 1).padStart(2, '0')}`)}</span>
                      <time dateTime={slot.date || undefined}>
                        {displayDate(slot.date, DATE_FORMAT, loading ? 'SYNC' : 'OPEN')}
                      </time>
                    </div>
                    <b className="training-change-marker">{labelize(slot.lifecycle)}</b>
                  </header>

                  {slot.lifecycle === 'empty' ? (
                    <div className="training-day-empty">{slot.placeholder}</div>
                  ) : (
                    <>
                      <div className="training-session-type">
                        {slot.routed
                          ? `ROUTED FROM ${slot.label} // SEQUENCE ${String(slot.sequencePosition).padStart(2, '0')} / ${String(slot.sequenceLength).padStart(2, '0')}`
                          : slot.sequencePosition === null
                          ? slot.lifecycle === 'recovery' ? 'PHOENIX PLACED' : 'SEQUENCE UNVERIFIED'
                          : `SEQUENCE ${String(slot.sequencePosition).padStart(2, '0')} / ${String(slot.sequenceLength || 6).padStart(2, '0')}`}
                      </div>
                      <h3>{slotTitle}</h3>
                      <div className="training-day-duration">
                        <span>DURATION</span>
                        <strong>{Number.isFinite(slot.durationMinutes) ? `${slot.durationMinutes} MIN` : 'UNSET'}</strong>
                      </div>
                      <div className="training-day-empty">
                        {slot.changeReason
                          ? labelize(slot.changeReason)
                          : slot.highNeural
                            ? 'HIGH NEURAL'
                            : slot.decisionReasons[0] ? labelize(slot.decisionReasons[0]) : 'RECEIPT VERIFIED'}
                      </div>
                    </>
                  )}
                </article>
              )
            })}
          </div>
        </div>
      </section>

      <div className="training-hybrid-detail">
        <section className="training-hybrid-mission" aria-labelledby="training-hybrid-mission-title">
          <div className="training-section-heading">
            <span id="training-hybrid-mission-title">TODAY'S MISSION</span>
            <b>
              {today?.lifecycle === 'recovery'
                ? 'RECOVERY'
                : today?.sequencePosition
                  ? `${String(today.sequencePosition).padStart(2, '0')} / ${String(today.sequenceLength || 6).padStart(2, '0')}`
                  : 'UNVERIFIED'}
            </b>
          </div>
          <h3>
            {today?.lifecycle === 'recovery'
              ? 'RECOVERY'
              : today?.label || 'SESSION IDENTITY UNVERIFIED'}
          </h3>
          <p>
            {today?.lifecycle === 'recovery'
              ? today.changeReason
                ? `RECOVERY ROUTE // ${labelize(today.changeReason)}`
                : 'RECOVERY // RECEIPT AUTHORITY'
              : today
                ? Number.isFinite(today.durationMinutes) ? `${today.durationMinutes} MINUTES // RECEIPT AUTHORITY` : 'DURATION UNSET'
              : 'NO SESSION SCHEDULED TODAY'}
          </p>
          <ol className="training-day-exercises" aria-label="Today's authoritative movements">
            {today?.exercises.length > 0
              ? today.exercises.map((exercise, index) => (
                <li key={`${exercise?.name || 'movement'}-${index}`}>
                  <b>{String(index + 1).padStart(2, '0')}</b>
                  <span>{labelize(exercise?.name || 'movement')}</span>
                  <strong>{exerciseTarget(exercise)}</strong>
                </li>
              ))
              : <li>{today?.lifecycle === 'recovery' ? 'RECOVERY DAY // NO LOADED MOVEMENTS' : 'NO LOADED MOVEMENTS'}</li>}
          </ol>
        </section>

        <section className="training-hybrid-decisions" aria-labelledby="training-hybrid-decisions-title">
          <div className="training-section-heading">
            <span id="training-hybrid-decisions-title">PHOENIX DECISION</span>
            <b>{presentation.decisions.length ? 'RECEIPT EVIDENCE' : 'WITHHELD'}</b>
          </div>
          {presentation.decisions.length > 0 ? (
            <dl>
              {presentation.decisions.map(decision => (
                <div key={decision.code}>
                  <dt>{decision.label}</dt>
                  <dd>{decision.code}</dd>
                </div>
              ))}
            </dl>
          ) : (
            <p>NO VERIFIED DECISION EVIDENCE</p>
          )}
        </section>
      </div>

      <ValidationSummary validations={plan?.validations} />
    </div>
  )
}

export { WEEK_CELL_COUNT }
