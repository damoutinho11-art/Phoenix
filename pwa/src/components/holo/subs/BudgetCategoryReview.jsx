import { useCallback, useEffect, useRef, useState } from 'react'
import {
  deleteBudgetLearnedMerchant,
  getBudgetCategoryReview,
  postBudgetCategoryCorrection,
} from '../../../api/client'
import { ACC, G, Y, R, W, BODY, INK, FM, FD, a, mix, deep } from '../holoTokens'
import { financeBody, financeButton, financeLabel, financeMicro } from './financeReadability'
import {
  buildCategoryCorrectionRequest,
  categoryCorrectionOutcome,
  createCategoryReviewDraft,
  createCategoryReviewLoading,
  normalizeCategoryReview,
} from './budgetCategoryReviewModel'

const REVIEW_CSS = `
.finance-category-review {
  min-width: 0;
}
.finance-category-review__header {
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto auto;
  align-items: center;
  gap: 14px;
  padding: 0 0 14px;
  border-bottom: 1px solid color-mix(in srgb, var(--phx-accent) 24%, transparent);
}
.finance-category-review__queue {
  border-bottom: 1px solid color-mix(in srgb, var(--phx-accent) 18%, transparent);
}
.finance-category-review__row {
  display: grid;
  grid-template-columns: minmax(0, 1fr) minmax(280px, .72fr);
  gap: 18px;
  min-width: 0;
  padding: 16px 0;
  border-top: 1px solid color-mix(in srgb, var(--phx-accent) 18%, transparent);
}
.finance-category-review__evidence,
.finance-category-review__controls {
  min-width: 0;
}
.finance-category-review__transactions {
  display: grid;
  gap: 7px;
  margin-top: 11px;
}
.finance-category-review__transaction {
  display: grid;
  grid-template-columns: 88px minmax(92px, .7fr) minmax(130px, 1fr) minmax(150px, 1.15fr);
  gap: 9px;
  min-width: 0;
  padding: 8px 0;
  border-top: 1px solid color-mix(in srgb, var(--phx-accent) 12%, transparent);
}
.finance-category-review__field {
  min-width: 0;
  overflow-wrap: anywhere;
}
.finance-category-review__controls select,
.finance-category-review__controls button,
.finance-category-review__header button,
.finance-category-review__state button,
.finance-category-review__memory button {
  min-height: 42px;
}
.finance-category-review :is(button, input, select):focus-visible {
  outline: 2px solid var(--phx-accent);
  outline-offset: 2px;
  border-color: var(--phx-accent) !important;
  box-shadow: 0 0 0 3px color-mix(in srgb, var(--phx-accent) 18%, transparent);
}
.finance-category-review__memory-row {
  display: grid;
  grid-template-columns: minmax(0, 1fr) minmax(110px, auto) auto;
  align-items: center;
  gap: 10px;
  min-width: 0;
  padding: 9px 0;
  border-top: 1px solid color-mix(in srgb, var(--phx-accent) 14%, transparent);
}
@media (max-width: 820px) {
  .finance-category-review__header,
  .finance-category-review__row {
    grid-template-columns: minmax(0, 1fr);
  }
  .finance-category-review__header {
    align-items: stretch;
  }
  .finance-category-review__transaction {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }
  .finance-category-review__memory-row {
    grid-template-columns: minmax(0, 1fr) auto;
  }
  .finance-category-review__memory-row > :first-child {
    grid-column: 1 / -1;
  }
}
`

const secondaryButtonStyle = {
  padding: '0 13px',
  ...financeButton({ fontWeight: 400, color: a(ACC, 'cc') }),
  background: deep(58),
  border: `1px solid ${a(ACC, '44')}`,
  cursor: 'pointer',
}

export const formatReviewMoney = value => {
  const amount = Number(value)
  return Number.isFinite(amount) ? `€${amount.toFixed(2)}` : '—'
}

function LockedFact({ label, children }) {
  return (
    <div className="finance-category-review__field">
      <div style={financeMicro({ color: a(ACC, '77') })}>{label}</div>
      <div style={{ marginTop: 3, ...financeBody({ fontSize: 12, lineHeight: 1.45, color: mix(BODY, 92) }) }}>{children || '—'}</div>
    </div>
  )
}

function MerchantCorrectionRow({ group, statementImportId, revision, review, refresh, onApplied }) {
  const [draft, setDraft] = useState(() => createCategoryReviewDraft(group))
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const currentCategories = new Set(group.transactions.map(transaction => transaction.category))
  const canApply = Boolean(
    draft
    && draft.category
    && !currentCategories.has(draft.category)
    && group.allowedCategories.includes(draft.category),
  )

  const apply = async () => {
    if (!canApply || busy) return
    const payload = buildCategoryCorrectionRequest(statementImportId, revision, draft)
    if (!payload) {
      setError('Correction details are incomplete. Refresh and try again.')
      return
    }
    setBusy(true)
    setError('')
    try {
      const response = await postBudgetCategoryCorrection(payload)
      const outcome = categoryCorrectionOutcome(review, response, draft)
      if (outcome.status === 'error') {
        if (outcome.draft) setDraft(outcome.draft)
        setError(outcome.message)
      } else {
        await onApplied(outcome)
      }
    } catch (requestError) {
      const outcome = categoryCorrectionOutcome(review, requestError, draft)
      if (outcome.refreshRequired) {
        await refresh()
        return
      }
      if (outcome.draft) setDraft(outcome.draft)
      setError(outcome.message)
    } finally {
      setBusy(false)
    }
  }

  return (
    <article className="finance-category-review__row">
      <div className="finance-category-review__evidence">
        <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 10, flexWrap: 'wrap' }}>
          <h3 style={{ margin: 0, fontFamily: FD, fontSize: 18, letterSpacing: 0, color: W, overflowWrap: 'anywhere' }}>{group.merchant}</h3>
          <span style={financeLabel({ color: ACC })}>{group.transactions.length} ROW{group.transactions.length === 1 ? '' : 'S'} · {formatReviewMoney(group.amountEur)}</span>
        </div>
        <div className="finance-category-review__transactions">
          {group.transactions.map(transaction => (
            <div className="finance-category-review__transaction" key={transaction.ordinal}>
              <LockedFact label="DATE · LOCKED">{transaction.date}</LockedFact>
              <LockedFact label="AMOUNT · LOCKED">{formatReviewMoney(transaction.amount_eur)}</LockedFact>
              <LockedFact label="MERCHANT · LOCKED">{transaction.merchant}</LockedFact>
              <LockedFact label="DESCRIPTION · LOCKED">{transaction.description}</LockedFact>
            </div>
          ))}
        </div>
      </div>

      <div className="finance-category-review__controls">
        <label style={{ display: 'block', ...financeLabel({ color: a(ACC, 'cc') }) }}>
          CORRECTED CATEGORY
          <select
            aria-label={`Corrected category for ${group.merchant}`}
            value={draft?.category || ''}
            onChange={event => { setDraft(previous => ({ ...previous, category: event.target.value })); setError('') }}
            style={{ width: '100%', minWidth: 0, boxSizing: 'border-box', marginTop: 7, padding: '0 10px', color: W, background: deep(72), border: `1px solid ${a(ACC, '44')}`, ...financeBody({ fontSize: 13 }) }}
          >
            <option value="">SELECT A CATEGORY</option>
            {group.allowedCategories.filter(category => !currentCategories.has(category)).map(category => (
              <option key={category} value={category}>{category}</option>
            ))}
          </select>
        </label>
        <label style={{ display: 'flex', alignItems: 'center', gap: 9, minHeight: 42, marginTop: 8, ...financeLabel({ color: a(ACC, 'aa') }), cursor: 'pointer' }}>
          <input
            type="checkbox"
            checked={Boolean(draft?.rememberMerchant)}
            onChange={event => { setDraft(previous => ({ ...previous, rememberMerchant: event.target.checked })); setError('') }}
            style={{ width: 18, height: 18, flexShrink: 0, accentColor: ACC }}
          />
          REMEMBER THIS MERCHANT
        </label>
        <button
          type="button"
          onClick={apply}
          disabled={!canApply || busy}
          style={{ width: '100%', minHeight: 42, padding: '0 12px', marginTop: 8, ...financeButton({ color: canApply ? INK : a(ACC, '66') }), background: canApply ? ACC : deep(52), border: `1px solid ${canApply ? ACC : a(ACC, '28')}`, cursor: canApply && !busy ? 'pointer' : 'not-allowed', boxShadow: canApply ? `0 0 22px ${a(ACC, '2f')}` : 'none' }}
        >
          {busy ? 'APPLYING CORRECTION…' : 'APPLY CORRECTION'}
        </button>
        {error && <div role="status" style={{ marginTop: 8, ...financeBody({ fontSize: 12, color: R }) }}>{error}</div>}
      </div>
    </article>
  )
}

function LearnedMerchantRules({ rules, refresh, onDone }) {
  const [busyRule, setBusyRule] = useState(null)
  const [error, setError] = useState('')

  const forget = async ruleId => {
    if (busyRule !== null) return
    setBusyRule(ruleId)
    setError('')
    try {
      await deleteBudgetLearnedMerchant(ruleId)
      await refresh()
      await onDone()
    } catch (requestError) {
      setError(requestError?.message || 'Could not forget this merchant rule. Try again.')
    } finally {
      setBusyRule(null)
    }
  }

  if (!rules.length) return null
  return (
    <section className="finance-category-review__memory" aria-labelledby="finance-category-memory-title" style={{ marginTop: 22 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10, alignItems: 'baseline', marginBottom: 7 }}>
        <h3 id="finance-category-memory-title" style={{ margin: 0, ...financeLabel({ color: a(ACC, 'cc') }) }}>LEARNED MERCHANTS</h3>
        <span style={financeMicro({ color: a(ACC, '77') })}>{rules.length} ACTIVE</span>
      </div>
      {rules.map(rule => (
        <div className="finance-category-review__memory-row" key={rule.id}>
          <span style={{ minWidth: 0, ...financeBody({ fontSize: 13, color: mix(BODY, 92) }), overflowWrap: 'anywhere' }}>{rule.normalized_merchant}</span>
          <span style={{ padding: '5px 8px', color: ACC, border: `1px solid ${a(ACC, '30')}`, background: a(ACC, '08'), ...financeMicro({ color: ACC }), overflowWrap: 'anywhere' }}>{rule.category}</span>
          <button type="button" onClick={() => forget(rule.id)} disabled={busyRule !== null} style={{ ...secondaryButtonStyle, minWidth: 82, color: busyRule === rule.id ? a(ACC, '77') : ACC, cursor: busyRule !== null ? 'wait' : 'pointer' }}>FORGET</button>
        </div>
      ))}
      {error && <div role="status" style={{ marginTop: 8, ...financeBody({ fontSize: 12, color: R }) }}>{error}</div>}
    </section>
  )
}

export function BudgetCategoryReview({ month, onDone, onCancel }) {
  const [state, setState] = useState(createCategoryReviewLoading)
  const requestId = useRef(0)

  const refresh = useCallback(async () => {
    const currentRequest = ++requestId.current
    setState(createCategoryReviewLoading())
    try {
      const payload = await getBudgetCategoryReview(month)
      if (currentRequest === requestId.current) setState(normalizeCategoryReview(payload))
    } catch (requestError) {
      if (currentRequest === requestId.current) setState(normalizeCategoryReview(null))
    }
  }, [month])

  useEffect(() => {
    refresh()
    return () => { requestId.current += 1 }
  }, [refresh])

  const handleApplied = useCallback(async outcome => {
    setState(outcome.review)
    await onDone()
  }, [onDone])

  const returnButton = <button type="button" onClick={onCancel} style={secondaryButtonStyle}>RETURN TO LEDGER</button>

  return (
    <section className="finance-category-review" aria-labelledby="finance-category-review-title">
      <style>{REVIEW_CSS}</style>
      <header className="finance-category-review__header">
        <div style={{ minWidth: 0 }}>
          <p style={{ margin: '0 0 4px', ...financeMicro({ color: a(ACC, '99') }) }}>TRANSACTION CLASSIFICATION</p>
          <h2 id="finance-category-review-title" style={{ margin: 0, fontFamily: FD, fontSize: 25, letterSpacing: 0, color: ACC }}>REVIEW OTHER</h2>
        </div>
        <div aria-label="Review progress" style={{ ...financeLabel({ color: state.status === 'ready' ? ACC : a(ACC, '99') }), overflowWrap: 'anywhere' }}>
          {state.status === 'loading' ? 'LOADING QUEUE' : `${state.unresolvedCount} OPEN · ${formatReviewMoney(state.unresolvedAmountEur)}`}
        </div>
        {returnButton}
      </header>

      {state.status === 'loading' && (
        <div className="finance-category-review__state" style={{ padding: '42px 0', textAlign: 'center', ...financeLabel({ color: a(ACC, '99') }) }}>LOADING CLASSIFICATION QUEUE…</div>
      )}

      {state.status === 'error' && (
        <div className="finance-category-review__state" style={{ padding: '26px 0', borderBottom: `1px solid ${a(R, '30')}` }}>
          <div style={financeLabel({ color: R })}>REVIEW UNAVAILABLE</div>
          <p style={{ margin: '7px 0 13px', ...financeBody({ color: mix(BODY, 84) }) }}>{state.blockers[0] || 'Review data could not be loaded.'}</p>
          <button type="button" onClick={refresh} style={secondaryButtonStyle}>RETRY REVIEW</button>
        </div>
      )}

      {state.status === 'blocked' && (
        <div className="finance-category-review__state" style={{ padding: '26px 0', borderBottom: `1px solid ${a(Y, '34')}` }}>
          <div style={financeLabel({ color: Y })}>VERIFIED STATEMENT REQUIRED</div>
          {state.blockers.map((blocker, index) => <p key={`${blocker}-${index}`} style={{ margin: index ? '4px 0 0' : '7px 0 0', ...financeBody({ color: mix(BODY, 84) }) }}>{blocker}</p>)}
        </div>
      )}

      {state.status === 'complete' && (
        <div className="finance-category-review__state" style={{ padding: '30px 0', borderBottom: `1px solid ${a(G, '34')}` }}>
          <div style={financeLabel({ color: G })}>CLASSIFICATION COMPLETE</div>
          <p style={{ margin: '7px 0 14px', ...financeBody({ color: mix(BODY, 84) }) }}>No verified statement rows remain in Other for this month.</p>
          {returnButton}
        </div>
      )}

      {state.status === 'ready' && (
        <div className="finance-category-review__queue">
          {state.groups.map(group => (
            <MerchantCorrectionRow
              key={group.merchantKey}
              group={group}
              statementImportId={state.statementImportId}
              revision={state.revision}
              review={state}
              refresh={refresh}
              onApplied={handleApplied}
            />
          ))}
        </div>
      )}

      {(state.status === 'ready' || state.status === 'complete' || state.status === 'blocked') && (
        <LearnedMerchantRules rules={state.learnedMerchants} refresh={refresh} onDone={onDone} />
      )}
    </section>
  )
}
