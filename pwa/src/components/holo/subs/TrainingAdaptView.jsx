import { useEffect, useRef, useState } from 'react'
import {
  applyTrainingPlanProposal,
  postTrainingPlanProposal,
  rejectTrainingPlanProposal,
} from '../../../api/client.js'
import {
  describeTrainingPlanDay,
  getAdaptValidationTone,
  getAppliedTrainingPlanOutcome,
  getProposalLifecycleState,
  getProposalRequestState,
  normalizeTrainingAdaptProposal,
} from './trainingAdaptViewModel.js'

const MODES = ['MOVE', 'SKIP', 'REPLACE']

const labelize = value => String(value || '')
  .replaceAll('_', ' ')
  .replaceAll('-', ' ')
  .toUpperCase()

const readableValues = values => {
  if (!values || typeof values !== 'object') return 'NO VALUES'
  return Object.entries(values)
    .map(([key, value]) => `${labelize(key)}: ${Array.isArray(value) ? value.join(', ') : String(value)}`)
    .join(' // ')
}

function TrainingPlanPreview({ proposal, onReject, onApply, applyDisabled, busy }) {
  const headingRef = useRef(null)
  const validations = Array.isArray(proposal?.validations) ? proposal.validations : []
  const constraints = Array.isArray(proposal?.interpreted_constraints) ? proposal.interpreted_constraints : []
  const changedDays = Array.isArray(proposal?.changedDays) ? proposal.changedDays : []
  const tone = getAdaptValidationTone(validations, proposal?.validationEvidenceComplete)

  useEffect(() => {
    const frame = requestAnimationFrame(() => headingRef.current?.focus())
    return () => cancelAnimationFrame(frame)
  }, [proposal?.plan_id])

  return (
    <section className="training-adapt-preview" aria-labelledby="training-adapt-preview-title">
      <header className="training-view-heading">
        <div>
          <span>PROPOSAL // REVIEW BEFORE AUTHORITY</span>
          <h2 id="training-adapt-preview-title" ref={headingRef} tabIndex={-1}>REPLAN PREVIEW</h2>
        </div>
        <span className={`training-adapt-status ${tone}`}>{labelize(tone)}</span>
      </header>

      <div className="training-adapt-summary">
        <div><span>PROPOSAL ID</span><strong>{proposal?.plan_id || 'UNASSIGNED'}</strong></div>
        <div><span>PARENT PLAN</span><strong>{proposal?.parent_plan_id || 'ROOT PLAN'}</strong></div>
        <div><span>CHANGED DAYS</span><strong>{String(changedDays.length).padStart(2, '0')}</strong></div>
      </div>

      <section className="training-adapt-constraints" aria-labelledby="training-adapt-constraints-title">
        <div className="training-section-heading">
          <span id="training-adapt-constraints-title">INTERPRETED CONSTRAINTS</span>
          <b className={proposal?.constraintEvidenceComplete ? 'passed' : 'unverified'}>
            {proposal?.constraintEvidenceComplete ? 'PLANNER INPUT LOCKED' : 'NO USABLE INTERPRETATION'}
          </b>
        </div>
        {constraints.length > 0 ? (
          <ul className="training-adapt-constraint-list">
            {constraints.map((constraint, index) => (
              <li key={`${constraint?.kind || 'constraint'}-${index}`}>
                <strong>{labelize(constraint?.kind || 'constraint')}</strong>
                <span>{readableValues(constraint?.values)}</span>
              </li>
            ))}
          </ul>
        ) : <p className="training-adapt-empty">THE PLANNER DID NOT RETURN A USABLE CONSTRAINT RECORD.</p>}
      </section>

      <section className="training-adapt-diff" aria-labelledby="training-adapt-diff-title">
        <div className="training-section-heading">
          <span id="training-adapt-diff-title">CHANGED DAYS // BEFORE AND AFTER</span>
          <b className={proposal?.diffEvidenceComplete ? tone : 'unverified'}>{changedDays.length ? 'REVIEW REQUIRED' : 'NO USABLE DAY EVIDENCE'}</b>
        </div>
        <div className="training-adapt-diff-scroll">
          <div className="training-adapt-diff-grid" role="table" aria-label="Changed training days">
            <div className="training-adapt-diff-head" role="row">
              <span role="columnheader">DATE</span><span role="columnheader">BEFORE</span><span role="columnheader">AFTER</span><span role="columnheader">REASON</span><span role="columnheader">VALIDATION</span>
            </div>
            {changedDays.map((row, index) => (
              <div className="training-adapt-diff-row" role="row" key={`${row?.date || 'day'}-${index}`}>
                <time role="cell" dateTime={row?.date || undefined}>{row?.date || 'UNSET'}</time>
                <span role="cell"><b>BEFORE</b>{describeTrainingPlanDay(row?.before)}</span>
                <span role="cell"><b>AFTER</b>{describeTrainingPlanDay(row?.after)}</span>
                <span role="cell">{row?.reason || row?.after?.change_reason || 'PLANNER RECALCULATION'}</span>
                <span role="cell" className={`training-adapt-day-status ${tone}`}>{labelize(tone)}</span>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="training-adapt-validations" aria-labelledby="training-adapt-validations-title">
        <div className="training-section-heading">
          <span id="training-adapt-validations-title">EVERY VALIDATION</span>
          <b className={tone}>{labelize(tone)}</b>
        </div>
        <ul className="training-validation-list">
          {validations.length > 0 ? validations.map((validation, index) => (
            <li key={`${validation?.rule || 'validation'}-${index}`} className={validation?.passed ? 'passed' : validation?.severity === 'hard' ? 'blocked' : 'warning'}>
              <i aria-hidden="true" />
              <span>{labelize(validation?.rule || 'validation')}</span>
              <strong>{validation?.detail || (validation?.passed ? 'CHECK PASSED' : 'CHECK FAILED')}</strong>
            </li>
          )) : (
            <li className="unverified">
              <i aria-hidden="true" />
              <span>VALIDATION EVIDENCE</span>
              <strong>NO USABLE VALIDATION RECORD</strong>
            </li>
          )}
        </ul>
      </section>

      <div className="training-adapt-commands">
        <button type="button" className="training-adapt-reject" onClick={onReject} disabled={busy}>REJECT</button>
        <button type="button" className="training-adapt-apply" onClick={onApply} disabled={!proposal.canApply || applyDisabled || busy}>APPLY PLAN</button>
      </div>
    </section>
  )
}

export default function TrainingAdaptView({ activePlan, onApplied, onRejected }) {
  const [mode, setMode] = useState('MOVE')
  const [intent, setIntent] = useState('')
  const [sourceDate, setSourceDate] = useState('')
  const [targetDate, setTargetDate] = useState('')
  const [date, setDate] = useState('')
  const [fromExercise, setFromExercise] = useState('')
  const [toExercise, setToExercise] = useState('')
  const [proposal, setProposal] = useState(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  async function propose(payload) {
    const requestState = getProposalRequestState()
    setProposal(requestState.proposal)
    setBusy(requestState.busy)
    setError(requestState.error)
    try {
      setProposal(normalizeTrainingAdaptProposal(await postTrainingPlanProposal(payload)))
    } catch (err) {
      setError(err?.message || 'PHOENIX could not build a valid replan.')
    } finally {
      setBusy(false)
    }
  }

  async function apply() {
    if (!proposal?.canApply || busy) return
    const currentProposal = proposal
    setBusy(true)
    setError('')
    try {
      const outcome = getAppliedTrainingPlanOutcome(
        await applyTrainingPlanProposal(currentProposal.plan_id),
        currentProposal,
      )
      if (!outcome.valid) {
        setProposal(getProposalLifecycleState('apply', false, currentProposal).proposal)
        setError('Plan apply returned invalid lifecycle evidence. The proposal remains available for review.')
        return
      }
      const lifecycle = getProposalLifecycleState('apply', true, currentProposal)
      onApplied?.(outcome.plan)
      setProposal(lifecycle.proposal)
      setIntent('')
    } catch (err) {
      setProposal(getProposalLifecycleState('apply', false, currentProposal).proposal)
      setError(err?.message || 'Plan apply failed. The active plan was not changed.')
    } finally {
      setBusy(false)
    }
  }

  async function reject() {
    if (!proposal || busy) return
    const currentProposal = proposal
    setBusy(true)
    setError('')
    try {
      await rejectTrainingPlanProposal(currentProposal.plan_id)
      const lifecycle = getProposalLifecycleState('reject', true, currentProposal)
      setProposal(lifecycle.proposal)
      onRejected?.()
    } catch (err) {
      setProposal(getProposalLifecycleState('reject', false, currentProposal).proposal)
      setError(err?.message || 'Plan rejection failed. The proposal remains available for review.')
    } finally {
      setBusy(false)
    }
  }

  const submitQuickAction = event => {
    event.preventDefault()
    let constraint
    if (mode === 'MOVE') {
      if (!sourceDate || !targetDate) {
        setError('Choose both the source date and target date before previewing.')
        return
      }
      constraint = { kind: 'move_session', source: 'user', values: { source_date: sourceDate, target_date: targetDate } }
    } else if (mode === 'SKIP') {
      if (!date) {
        setError('Choose the session date to skip before previewing.')
        return
      }
      constraint = { kind: 'skip_session', source: 'user', values: { date } }
    } else {
      if (!date || !fromExercise.trim() || !toExercise.trim()) {
        setError('Choose the date and name both exercises before previewing a replacement.')
        return
      }
      constraint = {
        kind: 'replace_exercise',
        source: 'user',
        values: { date, from: fromExercise.trim(), to: toExercise.trim() },
      }
    }
    propose({ constraints: [constraint] })
  }

  const hardFailure = !proposal?.validationEvidenceComplete || proposal.validations.some(row => row.severity === 'hard' && !row.passed)

  return (
    <section className="training-adapt-view">
      <div className="training-view-heading">
        <div>
          <span>CONSTRAINT CHANNEL // PREVIEW ONLY</span>
          <h2>ADAPT THE WEEK</h2>
        </div>
        <span className="training-view-count">ACTIVE // {activePlan?.plan_id || 'NONE'}</span>
      </div>

      <div className="training-adapt-actions" role="group" aria-label="Adaptation type">
        {MODES.map(kind => (
          <button key={kind} type="button" onClick={() => { setMode(kind); setError('') }} aria-pressed={mode === kind}>
            {kind}
          </button>
        ))}
      </div>

      <form className="training-adapt-quick-form" onSubmit={submitQuickAction}>
        {mode === 'MOVE' && (
          <>
            <label>SOURCE DATE<input type="date" value={sourceDate} onChange={event => setSourceDate(event.target.value)} /></label>
            <label>TARGET DATE<input type="date" value={targetDate} onChange={event => setTargetDate(event.target.value)} /></label>
          </>
        )}
        {mode === 'SKIP' && <label>SESSION DATE<input type="date" value={date} onChange={event => setDate(event.target.value)} /></label>}
        {mode === 'REPLACE' && (
          <>
            <label>SESSION DATE<input type="date" value={date} onChange={event => setDate(event.target.value)} /></label>
            <label>FROM EXERCISE<input type="text" value={fromExercise} onChange={event => setFromExercise(event.target.value)} /></label>
            <label>TO EXERCISE<input type="text" value={toExercise} onChange={event => setToExercise(event.target.value)} /></label>
          </>
        )}
        <button type="submit" disabled={busy}>PREVIEW {mode}</button>
      </form>

      <form className="training-adapt-intent-form" onSubmit={event => { event.preventDefault(); propose({ intent: intent.trim() }) }}>
        <label htmlFor="training-adapt-intent">TELL PHOENIX WHAT CHANGED</label>
        <input id="training-adapt-intent" value={intent} onChange={event => setIntent(event.target.value)} placeholder="Move today's training to tomorrow" />
        <button type="submit" disabled={!intent.trim() || busy}>PREVIEW REPLAN</button>
      </form>

      {error && <p className="training-adapt-error" role="alert">{error}</p>}
      {proposal && <TrainingPlanPreview proposal={proposal} onReject={reject} onApply={apply} applyDisabled={!proposal.canApply || hardFailure || busy} busy={busy} />}
    </section>
  )
}
