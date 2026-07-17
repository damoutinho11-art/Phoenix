import { useEffect, useRef, useState } from 'react'
import {
  getTrainingCurrentPlan,
  getTrainingPlanHistory,
  getTrainingRules,
} from '../../../api/client.js'
import { normalizeTrainingPlan } from './trainingPlannerViewModel.js'
import TrainingWeekView from './TrainingWeekView.jsx'
import TrainingPlanHistory, { TrainingRulesView } from './TrainingPlanHistory.jsx'
import TrainingAdaptView from './TrainingAdaptView.jsx'
import {
  getNextModalFocus,
  getTrainingTabIndex,
  getTrainingViewState,
} from './trainingControlRoomViewModel.js'

const TABS = ['WEEK', 'ADAPT', 'HISTORY', 'RULES']
const EMPTY_CURRENT_PLAN_MESSAGE = 'No active training plan for the current horizon'
const FOCUSABLE_SELECTOR = [
  'a[href]',
  'button:not([disabled]):not([tabindex="-1"])',
  'input:not([disabled])',
  'select:not([disabled])',
  'textarea:not([disabled])',
  '[tabindex]:not([tabindex="-1"])',
].join(',')

const TAB_DATA_KEY = {
  WEEK: 'plan',
  HISTORY: 'history',
  RULES: 'rules',
}

const errorMessage = (reason, fallback) => reason?.message || fallback
const isEmptyCurrentPlan = result => (
  result.status === 'rejected' && result.reason?.message === EMPTY_CURRENT_PLAN_MESSAGE
)

export default function TrainingControlRoom({ onClose }) {
  const [tab, setTab] = useState('WEEK')
  const [plan, setPlan] = useState(null)
  const [history, setHistory] = useState([])
  const [rules, setRules] = useState(null)
  const [loading, setLoading] = useState(true)
  const [errors, setErrors] = useState({ plan: '', history: '', rules: '' })
  const tabRefs = useRef([])
  const roomRef = useRef(null)
  const onCloseRef = useRef(onClose)
  onCloseRef.current = onClose

  useEffect(() => {
    let alive = true

    Promise.allSettled([
      getTrainingCurrentPlan(),
      getTrainingPlanHistory(),
      getTrainingRules(),
    ]).then(([current, past, activeRules]) => {
      if (!alive) return

      if (current.status === 'fulfilled') {
        setPlan(current.value ? normalizeTrainingPlan(current.value) : null)
      }
      if (past.status === 'fulfilled') {
        const items = Array.isArray(past.value?.items) ? past.value.items : []
        setHistory(items.map(normalizeTrainingPlan))
      }
      if (activeRules.status === 'fulfilled') {
        setRules(activeRules.value || null)
      }

      setErrors({
        plan: current.status === 'rejected' && !isEmptyCurrentPlan(current)
          ? errorMessage(current.reason, 'Training plan unavailable.')
          : '',
        history: past.status === 'rejected'
          ? errorMessage(past.reason, 'Training history unavailable.')
          : '',
        rules: activeRules.status === 'rejected'
          ? errorMessage(activeRules.reason, 'Training rules unavailable.')
          : '',
      })
      setLoading(false)
    })

    return () => { alive = false }
  }, [])

  useEffect(() => {
    const previousFocus = document.activeElement
    const previousBodyOverflow = document.body.style.overflow

    const modalFocusables = () => Array.from(
      roomRef.current?.querySelectorAll(FOCUSABLE_SELECTOR) || [],
    ).filter(element => (
      element.tabIndex >= 0 &&
      element.getAttribute('aria-hidden') !== 'true' &&
      !element.closest('[inert]')
    ))

    const handleModalKeyDown = event => {
      if (event.key === 'Escape') {
        event.preventDefault()
        onCloseRef.current?.()
        return
      }
      if (event.key === 'Tab') {
        const nextFocus = getNextModalFocus(
          modalFocusables(),
          document.activeElement,
          event.shiftKey,
        )
        if (nextFocus) {
          event.preventDefault()
          nextFocus.focus()
        }
      }
    }

    document.body.style.overflow = 'hidden'
    window.addEventListener('keydown', handleModalKeyDown)
    tabRefs.current[0]?.focus()
    return () => {
      window.removeEventListener('keydown', handleModalKeyDown)
      document.body.style.overflow = previousBodyOverflow
      if (previousFocus?.isConnected && typeof previousFocus.focus === 'function') {
        previousFocus.focus()
      }
    }
  }, [])

  const activateTab = index => {
    const nextIndex = (index + TABS.length) % TABS.length
    setTab(TABS[nextIndex])
    tabRefs.current[nextIndex]?.focus()
  }

  const handleTabKeyDown = (event, index) => {
    if (event.key === 'ArrowLeft') {
      event.preventDefault()
      activateTab(index - 1)
    } else if (event.key === 'ArrowRight') {
      event.preventDefault()
      activateTab(index + 1)
    } else if (event.key === 'Home') {
      event.preventDefault()
      activateTab(0)
    } else if (event.key === 'End') {
      event.preventDefault()
      activateTab(TABS.length - 1)
    }
  }

  const activeError = errors[TAB_DATA_KEY[tab]] || ''
  const activeHasData = tab === 'WEEK'
    ? Boolean(plan)
    : tab === 'HISTORY'
      ? history.length > 0
      : tab === 'RULES'
        ? Boolean(rules)
        : true
  const activeState = getTrainingViewState({ loading, error: activeError, hasData: activeHasData })
  const panelId = `training-panel-${tab.toLowerCase()}`
  const tabId = `training-tab-${tab.toLowerCase()}`
  const closeRoom = () => onCloseRef.current?.()

  return (
    <div className="phx-scope-training training-control-room-layer">
      <button
        type="button"
        className="training-control-room-scrim"
        aria-label="Close Training Control Room"
        tabIndex={-1}
        onClick={closeRoom}
      />

      <section
        ref={roomRef}
        className="training-control-room"
        role="dialog"
        aria-modal="true"
        aria-labelledby="training-control-room-title"
      >
        <header className="training-control-header">
          <div className="training-control-heading">
            <div className="training-control-kicker"><i aria-hidden="true" />SYS.TRAINING // CONTROL ROOM</div>
            <h1 id="training-control-room-title">ADAPTIVE WEEK CONTROL</h1>
            <p>PLAN VERSION // LIFECYCLE // PUBLIC CONSTRAINTS</p>
          </div>
          <div className="training-control-actions">
            <span className={`training-plan-live-state ${plan?.status || 'empty'}`}>
              <i aria-hidden="true" />
              {loading ? 'SYNCING' : errors.plan ? 'PLAN ERROR' : plan?.status ? plan.status.toUpperCase() : 'NO ACTIVE PLAN'}
            </span>
            <span className="training-control-esc" aria-hidden="true">ESC</span>
            <button
              type="button"
              className="training-control-close"
              aria-label="Close Training Control Room"
              title="Close"
              onClick={closeRoom}
            >
              X
            </button>
          </div>
        </header>

        <div className="training-control-divider" />

        <div className="training-control-body">
          <nav className="training-control-tabs" role="tablist" aria-label="Training Control Room views">
            {TABS.map((value, index) => (
              <button
                key={value}
                ref={node => { tabRefs.current[index] = node }}
                id={`training-tab-${value.toLowerCase()}`}
                type="button"
                role="tab"
                className={`training-control-tab${tab === value ? ' active' : ''}`}
                aria-selected={tab === value}
                aria-controls={`training-panel-${value.toLowerCase()}`}
                tabIndex={tab === value ? 0 : -1}
                onClick={() => setTab(value)}
                onKeyDown={event => handleTabKeyDown(event, index)}
              >
                <span>{String(index + 1).padStart(2, '0')}</span>
                {value}
              </button>
            ))}
          </nav>

          {activeState.kind === 'loading' && (
            <div className={activeState.className} role={activeState.role} aria-live="polite">
              SYNCING TRAINING PLAN LEDGER
            </div>
          )}
          {activeState.kind === 'error' && (
            <div className={activeState.className} role={activeState.role}>
              {activeError}
            </div>
          )}

          <section
            key={tab}
            id={panelId}
            className="training-control-panel"
            role="tabpanel"
            aria-labelledby={tabId}
            tabIndex={0}
          >
            {tab === 'WEEK' && <TrainingWeekView plan={plan} loading={loading} error={errors.plan} />}
            {tab === 'HISTORY' && <TrainingPlanHistory items={history} currentPlanId={plan?.plan_id} loading={loading} error={errors.history} />}
            {tab === 'RULES' && <TrainingRulesView rules={rules} loading={loading} error={errors.rules} />}
            {tab === 'ADAPT' && (
              <TrainingAdaptView
                activePlan={plan}
                onApplied={active => {
                  setPlan(active)
                  setTab('WEEK')
                  requestAnimationFrame(() => tabRefs.current[getTrainingTabIndex('WEEK')]?.focus())
                }}
                onRejected={() => {
                  setTab('ADAPT')
                  requestAnimationFrame(() => tabRefs.current[getTrainingTabIndex('ADAPT')]?.focus())
                }}
              />
            )}
          </section>
        </div>
      </section>
    </div>
  )
}

export { TABS as TRAINING_CONTROL_ROOM_TABS }
