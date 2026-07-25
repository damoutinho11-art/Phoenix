import {
  getLifecyclePresentation,
  getTrainingViewState,
  getValidationPresentation,
} from './trainingControlRoomViewModel.js'

const labelize = value => String(value || '')
  .replaceAll('_', ' ')
  .replaceAll('-', ' ')
  .toUpperCase()

const formatDateTime = value => {
  if (!value) return 'NOT RECORDED'
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return String(value)
  return new Intl.DateTimeFormat(undefined, {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(date).toUpperCase()
}

const safePlanAnchor = value => String(value || 'unassigned').replace(/[^a-zA-Z0-9_-]/g, '-')

const readableValue = value => {
  if (Array.isArray(value)) return value.map(readableValue).join(', ')
  if (value && typeof value === 'object') {
    return Object.entries(value)
      .map(([key, item]) => `${labelize(key)}: ${readableValue(item)}`)
      .join(' / ')
  }
  if (typeof value === 'boolean') return value ? 'YES' : 'NO'
  if (value === null || value === undefined || value === '') return 'UNSET'
  return labelize(value)
}

function PlanLink({ planId, emptyLabel = 'ROOT PLAN' }) {
  if (!planId) return <span>{emptyLabel}</span>
  return <a href={`#training-plan-${safePlanAnchor(planId)}`}>{planId}</a>
}

export default function TrainingPlanHistory({ items = [], currentPlanId, loading = false, error = '' }) {
  const plans = Array.isArray(items) ? items : []
  const viewState = getTrainingViewState({ loading, error, hasData: plans.length > 0 })

  return (
    <div className="training-history-view">
      <div className="training-view-heading">
        <div>
          <span>IMMUTABLE REVISION LEDGER</span>
          <h2>PLAN HISTORY</h2>
        </div>
        <span className="training-view-count">{String(plans.length).padStart(2, '0')} PLANS</span>
      </div>

      {viewState.kind === 'empty' && (
        <div className={viewState.className} role={viewState.role}>NO PLAN HISTORY</div>
      )}

      {plans.length > 0 && (
        <div className="training-history-list">
          {plans.map((plan, index) => {
            const validations = Array.isArray(plan?.validations) ? plan.validations : []
            const validation = getValidationPresentation(validations)
            const lifecycle = getLifecyclePresentation(plan, currentPlanId)
            return (
              <article
                key={plan?.plan_id || `plan-history-${index}`}
                id={`training-plan-${safePlanAnchor(plan?.plan_id)}`}
                className="training-history-item"
              >
                <header>
                  <div className="training-history-version">
                    <span>PLAN ID</span>
                    <strong>{plan?.plan_id || 'UNASSIGNED'}</strong>
                  </div>
                  <span className={`training-lifecycle-status ${lifecycle.status}`}>
                    {lifecycle.statusLabel}
                  </span>
                </header>

                <dl className="training-history-metadata">
                  <div><dt>CREATED</dt><dd>{formatDateTime(plan?.created_at)}</dd></div>
                  <div><dt>CHANGED</dt><dd>{formatDateTime(plan?.changed_at)}</dd></div>
                  <div><dt>PARENT</dt><dd><PlanLink planId={plan?.parent_plan_id} /></dd></div>
                  <div>
                    <dt>{lifecycle.relationLabel}</dt>
                    <dd>
                      {lifecycle.relationPlanId
                        ? <PlanLink planId={lifecycle.relationPlanId} />
                        : <span>{lifecycle.relationText}</span>}
                    </dd>
                  </div>
                  <div><dt>PLANNER</dt><dd>{plan?.planner_version || 'UNAVAILABLE'}</dd></div>
                  <div><dt>CYCLE</dt><dd>{plan?.cycle_id || 'UNAVAILABLE'}</dd></div>
                </dl>

                <div className="training-history-reason">
                  <span>REASON SUMMARY</span>
                  <p>{plan?.reason || 'No lifecycle reason recorded.'}</p>
                </div>

                <div className={`training-history-validation ${validation.tone}`}>
                  {validations.length
                    ? `${validation.passed}/${validation.total} VALIDATIONS CLEAR // ${validation.label}`
                    : 'NO VALIDATION RECORD'}
                </div>
              </article>
            )
          })}
        </div>
      )}
    </div>
  )
}

function RuleMetricList({ title, items, unit }) {
  const rows = items && typeof items === 'object' && !Array.isArray(items)
    ? Object.entries(items)
    : []

  return (
    <section className="training-rule-section">
      <h3>{title}</h3>
      {rows.length > 0 ? (
        <dl className="training-rule-metrics">
          {rows.map(([key, value]) => (
            <div key={key}>
              <dt>{labelize(key)}</dt>
              <dd>{readableValue(value)}{unit ? ` ${unit}` : key.endsWith('_pct') ? '%' : ''}</dd>
            </div>
          ))}
        </dl>
      ) : <p className="training-rule-empty">NONE PUBLISHED</p>}
    </section>
  )
}

function ConstraintList({ title, items }) {
  const rows = Array.isArray(items) ? items : []
  return (
    <section className="training-rule-section">
      <h3>{title}</h3>
      {rows.length > 0 ? (
        <ul className="training-constraint-list">
          {rows.map((item, index) => (
            <li key={`${item?.kind || 'constraint'}-${index}`}>
              <div><strong>{labelize(item?.kind || 'constraint')}</strong><span>{labelize(item?.source || 'system')}</span></div>
              <p>{readableValue(item?.values)}</p>
            </li>
          ))}
        </ul>
      ) : <p className="training-rule-empty">NONE ACTIVE</p>}
    </section>
  )
}

export function TrainingRulesView({ rules, loading = false, error = '' }) {
  const families = rules?.movement_families && typeof rules.movement_families === 'object'
    ? Object.entries(rules.movement_families)
    : []
  const viewState = getTrainingViewState({ loading, error, hasData: Boolean(rules) })

  return (
    <div className="training-rules-view">
      <div className="training-view-heading">
        <div>
          <span>READ-ONLY PUBLIC POLICY</span>
          <h2>TRAINING RULES</h2>
        </div>
        <span className="training-view-count">{rules?.planner_version || 'NO VERSION'}</span>
      </div>

      {viewState.kind === 'empty' && (
        <div className={viewState.className} role={viewState.role}>NO PUBLIC RULES AVAILABLE</div>
      )}

      {rules && (
        <>
          <section className="training-rules-objective">
            <span>PRIMARY OBJECTIVE</span>
            <strong>{labelize(rules.objective || 'unassigned')}</strong>
            <p>ACTIVE PLAN // {rules.active_plan_id || 'NONE'}</p>
          </section>

          <div className="training-rules-grid">
            <RuleMetricList title="RECOVERY SPACING" items={rules.recovery_spacing} unit="HOURS" />
            <RuleMetricList title="ADAPTATION LIMITS" items={rules.adaptation_limits} />

            <section className="training-rule-section training-movement-families">
              <h3>MOVEMENT FAMILIES</h3>
              {families.length > 0 ? (
                <dl>
                  {families.map(([family, movements]) => (
                    <div key={family}>
                      <dt>{labelize(family)}</dt>
                      <dd>{readableValue(movements)}</dd>
                    </div>
                  ))}
                </dl>
              ) : <p className="training-rule-empty">NONE PUBLISHED</p>}
            </section>

            <ConstraintList title="PREFERENCES" items={rules.preferences} />
            <ConstraintList title="TEMPORARY CONSTRAINTS" items={rules.temporary_constraints} />
          </div>
        </>
      )}
    </div>
  )
}
