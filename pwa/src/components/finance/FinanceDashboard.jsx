import { useEffect, useMemo, useState } from 'react'
import {
  getFinanceDataCoverage,
  getFinanceManualBuyChecklist,
  getFinanceRecommendation,
  getFinanceResearchMemos,
  getFinanceResearchValidationRecords,
  getFinanceSummary,
} from '../../api/client'
import './FinanceDashboard.css'

const SLEEVE_META = {
  global_core_etf: { label: 'Global Core', description: 'Diversified world equity', color: '#18d7c8' },
  growth_nasdaq_etf: { label: 'Growth Nasdaq', description: 'Nasdaq growth sleeve', color: '#4d93d1' },
  quality_etf: { label: 'Quality Factor', description: 'Developed-market quality', color: '#7a69ce' },
  btc: { label: 'Bitcoin', description: 'Core crypto sleeve', color: '#9a7de3' },
  hype: { label: 'Hyperliquid', description: 'Phase-gated crypto sleeve', color: '#8059bd' },
  tao: { label: 'Bittensor', description: 'Phase-gated crypto sleeve', color: '#65419d' },
  discovery: { label: 'Discovery', description: 'Legacy discovery holdings', color: '#c9954c' },
  tactical_reserve: { label: 'Cash Reserve', description: 'Tactical liquidity buffer', color: '#365464' },
}

const SAFETY_FIELDS = [
  ['broker_connection', 'Broker connection'],
  ['orders_created', 'Orders created'],
  ['trades_executed', 'Trades executed'],
  ['portfolio_state_updated', 'Portfolio updated'],
  ['recommendation_overridden', 'Recommendation overridden'],
]

function money(value) {
  const amount = Number(value)
  if (!Number.isFinite(amount)) return '—'
  return `€${amount.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
}

function percent(value) {
  const number = Number(value)
  return Number.isFinite(number) ? `${(number * 100).toFixed(1)}%` : '—'
}

function humanize(value) {
  return String(value || '').replace(/_/g, ' ').replace(/\b\w/g, letter => letter.toUpperCase())
}

function symbolOf(candidate) {
  return candidate && typeof candidate === 'object' ? candidate.symbol || null : null
}

function SectionHeading({ eyebrow, title, note }) {
  return (
    <div className="fcc-section-heading">
      <div>
        <div className="fcc-eyebrow">[ {eyebrow} ]</div>
        <h2>{title}</h2>
      </div>
      {note && <p>{note}</p>}
    </div>
  )
}

function StatusChip({ tone = 'cyan', children }) {
  return <span className={`fcc-status-chip ${tone}`}>{children}</span>
}

function AllocationRing({ sleeves, total }) {
  const ring = useMemo(() => {
    let cursor = 0
    const stops = sleeves
      .filter(sleeve => Number(sleeve.current_weight) > 0)
      .map((sleeve) => {
        const start = cursor
        cursor += Number(sleeve.current_weight) * 100
        const color = SLEEVE_META[sleeve.name]?.color || '#55717b'
        return `${color} ${start.toFixed(2)}% ${cursor.toFixed(2)}%`
      })
    return stops.length ? `conic-gradient(${stops.join(', ')})` : 'conic-gradient(#17343b 0 100%)'
  }, [sleeves])

  return (
    <div className="fcc-allocation-ring" style={{ '--allocation-ring': ring }}>
      <div className="fcc-ring-core">
        <span>Allocation</span>
        <strong>{money(total)}</strong>
        <small>{sleeves.length} sleeves</small>
      </div>
    </div>
  )
}

function ManualActionCard({ item, index, onOpenBrief }) {
  const candidateStatus = item?.resolved_candidate?.broker_availability_status
  const verified = candidateStatus === 'public_verified'
  const eligible = item?.checklist_eligible === true
  const symbol = item?.symbol || item?.ticker

  return (
    <article className={`fcc-action-card ${eligible ? '' : 'blocked'}`}>
      <div className="fcc-corner top-left" />
      <div className="fcc-corner bottom-right" />
      <header>
        <div className="fcc-lane-label">{humanize(item?.route || item?.asset)} lane</div>
        {verified
          ? <StatusChip>✓ Public verified</StatusChip>
          : <StatusChip tone={eligible ? 'violet' : 'red'}>{eligible ? 'Manual route' : 'Review required'}</StatusChip>}
        <span className="fcc-step">Step {index + 1}</span>
      </header>
      <div className="fcc-action-title-row">
        <div>
          <h3>{symbol ? `Buy ${symbol}` : 'Instrument unavailable'}</h3>
          <p>{item?.instrument_display_name || humanize(item?.asset) || 'Awaiting backend instrument'}</p>
        </div>
        <div className="fcc-action-amount">
          <strong>{money(item?.amount)}</strong>
          <span>Manual buy</span>
        </div>
      </div>
      <dl className="fcc-action-meta">
        <div><dt>Platform</dt><dd>{item?.platform || 'Not returned'}</dd></div>
        <div><dt>Ticker</dt><dd>{symbol || 'Not returned'}</dd></div>
      </dl>
      <p className="fcc-instruction">
        {item?.broker_instruction || 'No manual broker instruction was returned. Do not place an order.'}
      </p>
      <button type="button" className="fcc-card-link" onClick={onOpenBrief}>
        Open manual workflow <span>→</span>
      </button>
    </article>
  )
}

function SafetyLock({ safety }) {
  return (
    <section className="fcc-safety-section">
      <SectionHeading eyebrow="Safety lock · Phase 1" title="Nothing leaves PHOENIX automatically" />
      <div className="fcc-safety-grid">
        {SAFETY_FIELDS.map(([key, label]) => {
          const value = safety?.[key]
          return (
            <div className={`fcc-safety-cell ${value === true ? 'unsafe' : ''}`} key={key}>
              <span className="fcc-safety-light" />
              <strong>{label}</strong>
              <small>{value === false ? 'False · locked' : value === true ? 'True · review now' : 'Not returned'}</small>
            </div>
          )
        })}
      </div>
    </section>
  )
}

function EmptyState({ children }) {
  return <div className="fcc-empty-state">{children}</div>
}

export default function FinanceDashboard({ onNav }) {
  const [summary, setSummary] = useState(null)
  const [recommendation, setRecommendation] = useState(null)
  const [checklist, setChecklist] = useState(null)
  const [coverage, setCoverage] = useState(null)
  const [memos, setMemos] = useState([])
  const [records, setRecords] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  useEffect(() => {
    let active = true
    Promise.allSettled([
      getFinanceSummary(),
      getFinanceRecommendation(),
      getFinanceManualBuyChecklist(),
      getFinanceDataCoverage(),
      getFinanceResearchMemos(),
      getFinanceResearchValidationRecords(),
    ]).then((results) => {
      if (!active) return
      const [summaryResult, recommendationResult, checklistResult, coverageResult, memosResult, recordsResult] = results
      if (summaryResult.status === 'fulfilled') setSummary(summaryResult.value)
      if (recommendationResult.status === 'fulfilled') setRecommendation(recommendationResult.value)
      if (checklistResult.status === 'fulfilled') setChecklist(checklistResult.value)
      if (coverageResult.status === 'fulfilled') setCoverage(coverageResult.value)
      if (memosResult.status === 'fulfilled') setMemos(memosResult.value?.memos || [])
      if (recordsResult.status === 'fulfilled') setRecords(recordsResult.value?.records || [])
      const failed = results.filter(result => result.status === 'rejected').length
      if (failed) setError(`${failed} finance data source${failed === 1 ? '' : 's'} unavailable. Missing fields are shown safely.`)
      setLoading(false)
    })
    return () => { active = false }
  }, [])

  const sleeves = Array.isArray(summary?.sleeve_summary) ? summary.sleeve_summary : []
  const checklistItems = Array.isArray(checklist?.checklist_items) ? checklist.checklist_items : []
  const coverageSections = coverage?.sections || {}
  const coverageSummary = coverageSections.coverage_summary || {}
  const safety = coverageSections.safety || checklist?.safety_flags || {}
  const qualityCoverage = coverageSections.etf_candidate_universe?.sleeves?.quality_etf || {}
  const researchWinner = qualityCoverage.research_winner || null
  const checklistCandidate = qualityCoverage.checklist_candidate || qualityCoverage.selected_candidate || null
  const researchSymbol = symbolOf(researchWinner)
  const checklistSymbol = symbolOf(checklistCandidate)
  const evidenceCount = Number(coverageSummary.current_legs_with_validated_research)
  const legCount = Number(coverageSummary.total_current_recommendation_legs)
  const evidenceLabel = Number.isFinite(evidenceCount) && Number.isFinite(legCount) ? `${evidenceCount}/${legCount}` : '—'

  const actionCopy = checklistItems.length
    ? `PHOENIX recommends ${checklistItems.map(item => `${money(item.amount)} ${item.symbol || item.ticker || humanize(item.asset)} via ${item.platform || humanize(item.route)}`).join(' and ')}. Manual only — nothing has been ordered or executed.`
    : 'No complete manual-buy checklist was returned. Nothing has been ordered or executed.'

  return (
    <main className="finance-command-center">
      <div className="fcc-grid-overlay" aria-hidden="true" />
      <div className="fcc-shell">
        <header className="fcc-command-bar">
          <div>
            <span className="fcc-kicker">PHOENIX</span>
            <h1>Finance Command Center</h1>
          </div>
          <div className="fcc-command-status">
            <span>{summary?.as_of ? `Portfolio · ${summary.as_of}` : 'Portfolio date pending'}</span>
            <i /> Online
          </div>
        </header>

        {error && <div className="fcc-data-warning">{error}</div>}

        <section className="fcc-hero-panel">
          <div className="fcc-hero-copy">
            <div className="fcc-eyebrow">[ Finance Command Center · {checklist?.week_label || recommendation?.week_label || 'Week pending'} ]</div>
            <span className="fcc-metric-label">Total portfolio value</span>
            <div className="fcc-total-value">{money(summary?.total_invested)}</div>
            <p className="fcc-weekly-directive">{loading ? 'Synchronizing verified finance surfaces…' : actionCopy}</p>
            <div className="fcc-status-strip">
              <StatusChip tone={coverage?.verdict === 'DATA_TRANSPARENT' ? 'cyan' : 'red'}>{coverage?.verdict || 'Coverage pending'}</StatusChip>
              <StatusChip>Evidence {evidenceLabel}</StatusChip>
              <StatusChip tone="violet">Manual only</StatusChip>
              <StatusChip>No trades executed</StatusChip>
              <StatusChip tone="yellow">{checklist?.requires_approval === false ? 'Approval not required' : 'Requires approval'}</StatusChip>
            </div>
          </div>
          <div className="fcc-authorization-orbit">
            <div className="fcc-orbit orbit-one" />
            <div className="fcc-orbit orbit-two" />
            <div className="fcc-orbit orbit-three" />
            <div className="fcc-orbit-core">
              <span>Week deployment</span>
              <strong>{money(checklist?.week_budget ?? recommendation?.week_budget)}</strong>
              <small>{checklistItems.length ? `${checklistItems.length} manual allocation${checklistItems.length === 1 ? '' : 's'}` : 'Awaiting checklist'}</small>
              <b>{checklist?.brief_status ? humanize(checklist.brief_status) : 'Authorization pending'}</b>
            </div>
          </div>
        </section>

        <section className="fcc-section">
          <SectionHeading eyebrow="This week" title="Manual actions" note="Broker actions remain outside PHOENIX." />
          {checklistItems.length
            ? <div className="fcc-action-grid">{checklistItems.map((item, index) => <ManualActionCard key={`${item.asset}-${index}`} item={item} index={index} onOpenBrief={() => onNav('brief')} />)}</div>
            : <EmptyState>No manual actions were returned. Do not infer or place a trade.</EmptyState>}
        </section>

        <section className="fcc-section">
          <SectionHeading eyebrow={`Why ${checklistSymbol || 'this ETF'}?`} title="Research merit separated from broker availability" />
          {researchWinner && checklistCandidate ? (
            <div className="fcc-selection-panel">
              <div className="fcc-candidate research">
                <span>Research winner</span>
                <strong>{researchSymbol || 'Not returned'}</strong>
                <p>{researchWinner.label || 'Backend research candidate'}</p>
                <StatusChip tone={researchWinner.broker_availability_status === 'public_verified' ? 'cyan' : 'yellow'}>
                  {humanize(researchWinner.broker_availability_status || 'Verification not returned')}
                </StatusChip>
              </div>
              <div className="fcc-resolution-arrow"><span>→</span><small>Resolved to verified</small></div>
              <div className="fcc-candidate checklist">
                <span>Checklist candidate</span>
                <strong>{checklistSymbol || 'Not returned'}</strong>
                <p>{checklistCandidate.label || 'Backend checklist candidate'}</p>
                <StatusChip tone={checklistCandidate.broker_availability_status === 'public_verified' ? 'cyan' : 'red'}>
                  {humanize(checklistCandidate.broker_availability_status || 'Verification not returned')}
                </StatusChip>
              </div>
              <blockquote>{qualityCoverage.selection_gap_reason || 'The backend did not return a selection-gap explanation.'}</blockquote>
              <p className="fcc-phase-note">Phase 1 protocol: only Lightyear public-verified instruments enter the manual checklist. PHOENIX displays this backend decision; it does not recompute or override it.</p>
            </div>
          ) : <EmptyState>ETF selection evidence is incomplete. No candidate is inferred by the cockpit.</EmptyState>}
        </section>

        <SafetyLock safety={safety} />

        <section className="fcc-section">
          <SectionHeading eyebrow="Portfolio snapshot" title="Current allocation" note={summary?.as_of ? `Canonical state · ${summary.as_of}` : 'Canonical date unavailable'} />
          {sleeves.length ? (
            <div className="fcc-portfolio-panel">
              <AllocationRing sleeves={sleeves} total={summary?.total_invested} />
              <div className="fcc-sleeve-list">
                {sleeves.map((sleeve) => {
                  const meta = SLEEVE_META[sleeve.name] || { label: humanize(sleeve.name), description: 'Portfolio sleeve', color: '#55717b' }
                  return (
                    <div className="fcc-sleeve-row" key={sleeve.name} style={{ '--sleeve-color': meta.color }}>
                      <div className="fcc-sleeve-copy"><strong>{meta.label}</strong><span>{meta.description}</span><small>{sleeve.name}</small></div>
                      <div className="fcc-sleeve-values"><strong>{percent(sleeve.current_weight)}</strong><span>{money(sleeve.value)}</span><small>Target {percent(sleeve.target_weight)}</small></div>
                    </div>
                  )
                })}
              </div>
            </div>
          ) : <EmptyState>Portfolio allocation is unavailable. No values are estimated.</EmptyState>}
        </section>

        <section className="fcc-section fcc-audit-section">
          <details>
            <summary>
              <div><span className="fcc-eyebrow">[ Advanced audit ]</span><strong>Research, validation and candidate comparison</strong></div>
              <StatusChip>Evidence {evidenceLabel}</StatusChip>
              <span className="fcc-disclosure">⌄</span>
            </summary>
            <div className="fcc-audit-body">
              <div className="fcc-audit-block">
                <h3>Research memos · advisory only</h3>
                {memos.length ? memos.map(memo => (
                  <button key={memo.id} type="button" onClick={() => onNav('research')} className="fcc-audit-row">
                    <span><strong>{humanize(memo.asset)}</strong><small>{memo.title}</small></span>
                    <b>{memo.evidence_summary?.evidence_status || memo.research_quality_status || 'Unverified'}</b>
                  </button>
                )) : <EmptyState>No research memos returned.</EmptyState>}
              </div>
              <div className="fcc-audit-block">
                <h3>Validation records · {records.length} returned</h3>
                {records.length ? records.slice(0, 8).map(record => (
                  <div className="fcc-audit-row" key={record.id}>
                    <span><strong>{humanize(record.field_name)}</strong><small>{humanize(record.asset)} · {humanize(record.check_type)}</small></span>
                    <b>{record.status || 'Unknown'}</b>
                  </div>
                )) : <EmptyState>No validation records returned.</EmptyState>}
              </div>
              <div className="fcc-audit-block full">
                <h3>Quality ETF candidates · backend comparison</h3>
                {(qualityCoverage.candidates || []).length ? qualityCoverage.candidates.map(candidate => (
                  <div className="fcc-audit-row" key={candidate.symbol}>
                    <span><strong>{candidate.symbol || 'No symbol'}</strong><small>{candidate.label || 'No candidate label'}</small></span>
                    <b className={candidate.symbol === checklistSymbol ? 'verified' : ''}>{candidate.symbol === researchSymbol ? 'Research winner' : candidate.symbol === checklistSymbol ? 'Checklist candidate' : humanize(candidate.broker_verification || 'Research only')}</b>
                  </div>
                )) : <EmptyState>No candidate comparison returned.</EmptyState>}
              </div>
            </div>
          </details>
        </section>

        <nav className="fcc-subnav" aria-label="Finance command center destinations">
          {[
            ['Weekly brief', 'brief'],
            ['Holdings', 'holdings'],
            ['Performance', 'performance'],
            ['Brief history', 'history'],
            ['Research desk', 'research'],
            ['Budget', 'budget'],
          ].map(([label, destination]) => (
            <button type="button" key={destination} onClick={() => onNav(destination)}>{label}<span>→</span></button>
          ))}
        </nav>
      </div>
    </main>
  )
}
