import { useEffect, useState } from 'react'
import { getFinanceRecommendation, postBriefAction } from '../../api/client'

const border = '1px solid rgba(32,216,236,.18)'
const muted = 'rgba(32,216,236,.38)'

function formatEur(value) {
  const amount = Number(value)
  if (!Number.isFinite(amount)) return '—'
  return amount.toLocaleString('en-US', {
    style: 'currency',
    currency: 'EUR',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })
}

function humanize(value) {
  return value ? String(value).replace(/_/g, ' ').toUpperCase() : '—'
}

function Section({ title, children }) {
  return (
    <section style={{ padding: '16px 18px', borderBottom: border }}>
      <div style={{ fontFamily: 'var(--mono)', fontSize: 8, letterSpacing: '.22em', color: muted, marginBottom: 12 }}>{title}</div>
      {children}
    </section>
  )
}

function Stat({ label, value, color = '#7df0ff' }) {
  return (
    <div style={{ minWidth: 0, background: 'rgba(32,216,236,.03)', border, padding: '10px 12px' }}>
      <div style={{ fontFamily: 'var(--mono)', fontSize: 7, letterSpacing: '.18em', color: muted, marginBottom: 4 }}>{label}</div>
      <div style={{ fontFamily: 'var(--display)', fontSize: 14, fontWeight: 600, letterSpacing: '.04em', color, overflowWrap: 'anywhere' }}>{value}</div>
    </div>
  )
}

function CornerCard({ children }) {
  return (
    <div style={{ background: 'rgba(0,0,0,.9)', border, position: 'relative', overflow: 'hidden' }}>
      <div style={{ position: 'absolute', top: 0, left: 0, right: 0, height: 1, background: 'linear-gradient(90deg,transparent,#20d8ec,transparent)', opacity: .6 }} />
      <div style={{ position: 'absolute', top: 0, left: 0, width: 10, height: 10, borderTop: '1px solid rgba(32,216,236,.5)', borderLeft: '1px solid rgba(32,216,236,.5)' }} />
      <div style={{ position: 'absolute', top: 0, right: 0, width: 10, height: 10, borderTop: '1px solid rgba(32,216,236,.5)', borderRight: '1px solid rgba(32,216,236,.5)' }} />
      <div style={{ position: 'absolute', bottom: 0, left: 0, width: 10, height: 10, borderBottom: '1px solid rgba(32,216,236,.5)', borderLeft: '1px solid rgba(32,216,236,.5)' }} />
      <div style={{ position: 'absolute', bottom: 0, right: 0, width: 10, height: 10, borderBottom: '1px solid rgba(32,216,236,.5)', borderRight: '1px solid rgba(32,216,236,.5)' }} />
      {children}
    </div>
  )
}

function RecommendationCard({ recommendation }) {
  return (
    <CornerCard>
      <div style={{ padding: '14px 16px' }}>
        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12 }}>
          <div>
            <div style={{ fontFamily: 'var(--display)', fontSize: 22, fontWeight: 700, letterSpacing: '.06em', color: '#fff' }}>{recommendation.asset}</div>
            <div style={{ fontFamily: 'var(--mono)', fontSize: 8, color: '#4dffb4', letterSpacing: '.16em', marginTop: 3 }}>{humanize(recommendation.lane)} LANE</div>
          </div>
          <div style={{ fontFamily: 'var(--display)', fontSize: 20, fontWeight: 700, color: '#7df0ff', textAlign: 'right' }}>{formatEur(recommendation.amount)}</div>
        </div>
        <div style={{ marginTop: 12, paddingTop: 10, borderTop: border }}>
          <div style={{ fontFamily: 'var(--mono)', fontSize: 7, letterSpacing: '.18em', color: muted, marginBottom: 4 }}>ROUTE</div>
          <div style={{ fontFamily: 'var(--mono)', fontSize: 10, letterSpacing: '.08em', color: '#7df0ff', overflowWrap: 'anywhere' }}>{recommendation.route || '—'}</div>
        </div>
      </div>
    </CornerCard>
  )
}

function AllocationGrid({ allocations }) {
  const entries = allocations && typeof allocations === 'object' ? Object.entries(allocations) : []
  if (entries.length === 0) {
    return <div style={{ fontFamily: 'var(--mono)', fontSize: 8, color: muted, letterSpacing: '.12em' }}>NO TARGETS RETURNED</div>
  }

  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2,minmax(0,1fr))', gap: 8 }}>
      {entries.map(([name, target]) => (
        <div key={name} style={{ border, background: 'rgba(32,216,236,.025)', padding: '10px 11px', minWidth: 0 }}>
          <div style={{ fontFamily: 'var(--display)', fontSize: 12, fontWeight: 600, letterSpacing: '.04em', color: '#7df0ff', overflowWrap: 'anywhere' }}>{name}</div>
          <div style={{ fontFamily: 'var(--mono)', fontSize: 16, color: '#fff', marginTop: 5 }}>{Number.isFinite(Number(target)) ? `${Number(target).toFixed(1)}%` : '—'}</div>
        </div>
      ))}
    </div>
  )
}

export default function WeeklyBrief({ onBack }) {
  const [rec, setRec] = useState(null)
  const [error, setError] = useState('')
  const [actionDone, setActionDone] = useState(null)
  const [actionError, setActionError] = useState('')
  const [acting, setActing] = useState(false)

  useEffect(() => {
    let active = true
    getFinanceRecommendation()
      .then((response) => {
        if (active) setRec(response)
      })
      .catch((requestError) => {
        if (active) setError(requestError?.message || 'Unable to load the weekly brief.')
      })
    return () => { active = false }
  }, [])

  async function handleAction(actionName) {
    if (!rec?.brief_id) return
    setActing(true)
    setActionError('')
    try {
      await postBriefAction(rec.brief_id, actionName)
      setActionDone(actionName)
    } catch (requestError) {
      setActionError(requestError?.message || 'Unable to log this action.')
    } finally {
      setActing(false)
    }
  }

  const recommendations = Array.isArray(rec?.recommendations) ? rec.recommendations : []
  const warnings = Array.isArray(rec?.warnings) ? rec.warnings : []
  const newsThesis = typeof rec?.news_thesis === 'string' ? rec.news_thesis.trim() : ''
  const canLogApproval = Boolean(rec?.brief_id)

  return (
    <div style={{ height: '100%', overflowY: 'auto', background: '#000', color: 'rgba(199,236,244,.92)', fontFamily: "'Saira Condensed',sans-serif", paddingBottom: canLogApproval ? 100 : 0 }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '13px 18px 11px', borderBottom: border, position: 'sticky', top: 0, background: 'rgba(0,0,0,.95)', backdropFilter: 'blur(12px)', zIndex: 5 }}>
        <div style={{ display: 'flex', alignItems: 'center' }}>
          <span onClick={onBack} style={{ color: '#20d8ec', fontSize: 16, cursor: 'pointer', marginRight: 10 }}>←</span>
          <span style={{ fontFamily: 'var(--display)', fontSize: 13, fontWeight: 700, letterSpacing: '.28em', color: '#7df0ff' }}>WEEKLY BRIEF</span>
        </div>
        <span style={{ fontFamily: 'var(--mono)', fontSize: 8, color: muted, letterSpacing: '.14em' }}>{rec?.week_label || 'SYNCING'}</span>
      </div>

      {!rec && !error && (
        <div style={{ padding: '48px 18px', textAlign: 'center', fontFamily: 'var(--mono)', fontSize: 9, letterSpacing: '.18em', color: muted }}>LOADING WEEKLY RECOMMENDATION…</div>
      )}

      {error && (
        <div style={{ margin: 18, padding: 14, border: '1px solid rgba(255,92,122,.35)', background: 'rgba(255,92,122,.06)', color: '#ff5c7a', fontFamily: 'var(--mono)', fontSize: 9, lineHeight: 1.6 }}>
          WEEKLY BRIEF UNAVAILABLE<br />{error}
        </div>
      )}

      {rec && (
        <>
          <Section title="BRIEF STATUS">
            <CornerCard>
              <div style={{ padding: '14px 15px' }}>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
                  <Stat label="WEEK" value={rec.week_label || '—'} />
                  <Stat label="WEEK BUDGET" value={formatEur(rec.week_budget)} />
                  <Stat label="PORTFOLIO MODE" value={humanize(rec.portfolio_mode)} />
                  <Stat label="REGIME" value={humanize(rec.regime)} />
                  <Stat label="PHASE" value={rec.phase_label || '—'} />
                  <Stat label="APPROVAL" value={rec.requires_approval ? 'REQUIRED' : 'NOT REQUIRED'} color={rec.requires_approval ? '#ffd56b' : '#4dffb4'} />
                </div>
              </div>
            </CornerCard>
          </Section>

          <Section title="RATIONALE">
            <div style={{ background: 'rgba(0,0,0,.9)', border, borderLeft: '3px solid #20d8ec', padding: '14px 15px', fontSize: 14, fontWeight: 300, lineHeight: 1.7, color: 'rgba(199,236,244,.88)' }}>
              {rec.rationale || 'No rationale returned for this brief.'}
            </div>
          </Section>

          <Section title="RECOMMENDATIONS">
            {recommendations.length > 0
              ? <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>{recommendations.map((recommendation, index) => <RecommendationCard key={`${recommendation.asset}-${index}`} recommendation={recommendation} />)}</div>
              : <div style={{ fontFamily: 'var(--mono)', fontSize: 9, color: muted, letterSpacing: '.12em' }}>NO BUYS RECOMMENDED THIS WEEK</div>}
          </Section>

          <Section title="DYNAMIC ASSET TARGETS">
            <AllocationGrid allocations={rec.dynamic_targets} />
          </Section>

          <Section title="SLEEVE TARGETS">
            <AllocationGrid allocations={rec.sleeve_targets} />
          </Section>

          {warnings.length > 0 && (
            <Section title="WARNINGS">
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                {warnings.map((warning, index) => (
                  <div key={index} style={{ display: 'flex', alignItems: 'flex-start', gap: 10, padding: '10px 12px', border: '1px solid rgba(255,213,107,.18)', background: 'rgba(255,213,107,.03)' }}>
                    <span style={{ color: '#ffd56b', flexShrink: 0 }}>⚠</span>
                    <span style={{ fontSize: 13, fontWeight: 300, lineHeight: 1.5, color: 'rgba(255,213,107,.82)' }}>{String(warning)}</span>
                  </div>
                ))}
              </div>
            </Section>
          )}

          <Section title="NEWS THESIS">
            <div style={{ background: 'rgba(0,0,0,.9)', border, borderLeft: '3px solid #20d8ec', padding: '14px 15px', fontSize: 14, fontWeight: 300, lineHeight: 1.7, color: newsThesis ? 'rgba(199,236,244,.88)' : 'rgba(125,188,200,.65)' }}>
              {newsThesis || 'No live news thesis returned for this brief.'}
            </div>
          </Section>

          {!canLogApproval && (
            <div style={{ margin: '0 18px 18px', padding: 12, border, color: muted, fontFamily: 'var(--mono)', fontSize: 8, letterSpacing: '.1em', textAlign: 'center' }}>APPROVAL LOGGING UNAVAILABLE FOR THIS BRIEF.</div>
          )}
        </>
      )}

      {rec && canLogApproval && (
        <div style={{ position: 'fixed', bottom: 0, left: 0, right: 0, background: 'rgba(0,0,0,.97)', borderTop: border, padding: '14px 18px 24px', backdropFilter: 'blur(12px)', zIndex: 10 }}>
          {actionDone ? (
            <div style={{ textAlign: 'center', fontFamily: 'var(--mono)', fontSize: 10, letterSpacing: '.22em', padding: '4px 0', color: actionDone === 'approve' ? '#4dffb4' : actionDone === 'reject' ? '#ff5c7a' : muted }}>
              {actionDone === 'approve' ? 'BRIEF APPROVED' : actionDone === 'defer' ? 'BRIEF DEFERRED' : 'BRIEF REJECTED'}
            </div>
          ) : (
            <div style={{ maxWidth: 430, margin: '0 auto' }}>
              {actionError && <div style={{ color: '#ff5c7a', fontFamily: 'var(--mono)', fontSize: 8, textAlign: 'center', marginBottom: 8 }}>{actionError}</div>}
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1.6fr', gap: 10 }}>
                <button onClick={() => handleAction('defer')} disabled={acting} style={{ fontFamily: 'var(--mono)', fontSize: 9, letterSpacing: '.18em', padding: '13px 0', cursor: acting ? 'wait' : 'pointer', border, color: muted, background: 'transparent' }}>DEFER</button>
                <button onClick={() => handleAction('reject')} disabled={acting} style={{ fontFamily: 'var(--mono)', fontSize: 9, letterSpacing: '.18em', padding: '13px 0', cursor: acting ? 'wait' : 'pointer', border: '1px solid rgba(255,92,122,.35)', color: '#ff5c7a', background: 'rgba(255,92,122,.04)' }}>REJECT</button>
                <button onClick={() => handleAction('approve')} disabled={acting} style={{ fontFamily: 'var(--mono)', fontSize: 10, fontWeight: 700, letterSpacing: '.18em', padding: '13px 0', cursor: acting ? 'wait' : 'pointer', border: '1px solid #20d8ec', color: '#000', background: '#20d8ec', boxShadow: '0 0 16px rgba(32,216,236,.45)' }}>▶ APPROVE</button>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
