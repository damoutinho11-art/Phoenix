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

function marketPrice(value, currency) {
  const amount = Number(value)
  return Number.isFinite(amount) ? `${amount.toLocaleString('en-US', { maximumFractionDigits: 4 })} ${currency || ''}`.trim() : '—'
}

function LightyearStatus({ candidate }) {
  const verified = candidate?.lightyear_available === true && candidate?.lightyear_confidence === 'high'
  const unavailable = candidate?.lightyear_available === false
  return (
    <div style={{ color: verified ? '#4dffb4' : unavailable ? '#ff5c7a' : '#ffd56b' }}>
      <div style={{ fontFamily: 'var(--mono)', fontSize: 8, letterSpacing: '.1em' }}>
        {verified ? 'LIGHTYEAR PUBLIC CATALOGUE VERIFIED' : unavailable ? 'NOT FOUND IN LIGHTYEAR PUBLIC CATALOGUE' : 'LIGHTYEAR AVAILABILITY NOT VERIFIED'}
      </div>
      <div style={{ fontFamily: 'var(--mono)', fontSize: 7, color: muted, marginTop: 3 }}>{humanize(candidate?.lightyear_confidence)}</div>
      {candidate?.lightyear_url && verified && (
        <a href={candidate.lightyear_url} target="_blank" rel="noreferrer" style={{ display: 'inline-block', color: '#20d8ec', fontFamily: 'var(--mono)', fontSize: 7, marginTop: 5 }}>OPEN PUBLIC LIGHTYEAR PAGE ↗</a>
      )}
    </div>
  )
}

function ResolvedInstrument({ instrument }) {
  const candidate = instrument?.resolved_candidate
  if (!candidate) {
    return (
      <div style={{ marginTop: 10, padding: '10px 11px', border: '1px solid rgba(255,213,107,.25)', color: '#ffd56b', fontSize: 12 }}>
        ETF candidate unresolved. Manual confirmation required.
      </div>
    )
  }
  const verified = candidate.lightyear_available === true && candidate.lightyear_confidence === 'high'
  return (
    <div style={{ marginTop: 10, padding: '11px 12px', border, background: 'rgba(32,216,236,.025)' }}>
      <div style={{ fontFamily: 'var(--mono)', fontSize: 7, letterSpacing: '.16em', color: muted }}>RESOLVED ETF CANDIDATE</div>
      <div style={{ fontFamily: 'var(--display)', fontSize: 17, fontWeight: 700, color: '#7df0ff', marginTop: 5 }}>{candidate.symbol || '—'}</div>
      <div style={{ fontSize: 12, color: 'rgba(199,236,244,.82)', marginTop: 2 }}>{candidate.label || '—'}</div>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginTop: 9 }}>
        <Stat label="MARKET PRICE" value={marketPrice(candidate.raw_price, candidate.currency)} />
        <Stat label="EUR PRICE" value={formatEur(candidate.eur_price)} />
        <Stat label="MARKET SOURCE" value={instrument.market_data_source || candidate.market_data_source || '—'} />
        <Stat label="BROKER SOURCE" value={instrument.broker_source || '—'} />
      </div>
      <div style={{ marginTop: 9 }}><LightyearStatus candidate={candidate} /></div>
      {!verified && <div style={{ marginTop: 8, color: '#ffd56b', fontSize: 12 }}>Lightyear availability not verified. Manual confirmation required.</div>}
    </div>
  )
}

function CandidateComparison({ candidates }) {
  const values = Array.isArray(candidates) ? candidates : []
  if (values.length === 0) return null
  return (
    <div style={{ marginTop: 10, paddingTop: 10, borderTop: border }}>
      <div style={{ fontFamily: 'var(--mono)', fontSize: 7, letterSpacing: '.16em', color: muted, marginBottom: 8 }}>INSTRUMENT CANDIDATE COMPARISON</div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 7 }}>
        {values.map((candidate, index) => {
          const score = candidate?.score_components?.total_score
          const verified = candidate.lightyear_available === true && candidate.lightyear_confidence === 'high'
          return (
            <div key={`${candidate.symbol || 'candidate'}-${index}`} style={{ padding: '9px 10px', border: `1px solid ${candidate.selected ? 'rgba(77,255,180,.35)' : 'rgba(32,216,236,.14)'}`, background: candidate.selected ? 'rgba(77,255,180,.025)' : 'rgba(0,0,0,.35)' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 8 }}>
                <div style={{ minWidth: 0 }}>
                  <div style={{ fontFamily: 'var(--display)', fontSize: 14, fontWeight: 700, color: candidate.selected ? '#4dffb4' : '#7df0ff' }}>{candidate.symbol || '—'}</div>
                  <div style={{ fontSize: 10, color: 'rgba(199,236,244,.7)', overflowWrap: 'anywhere' }}>{candidate.label || '—'}</div>
                </div>
                <div style={{ fontFamily: 'var(--mono)', fontSize: 7, color: candidate.selected ? '#4dffb4' : muted, flexShrink: 0 }}>{candidate.selected ? 'SELECTED' : 'NOT SELECTED'}</div>
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2,minmax(0,1fr))', gap: '5px 8px', marginTop: 7, fontFamily: 'var(--mono)', fontSize: 7, color: muted }}>
                <span>YFINANCE · {humanize(candidate.fetch_status)}</span>
                <span>SCORE · {Number.isFinite(Number(score)) ? Number(score).toFixed(0) : '—'}</span>
                <span>PRICE · {marketPrice(candidate.raw_price, candidate.currency)}</span>
                <span style={{ color: verified ? '#4dffb4' : candidate.lightyear_available === false ? '#ff5c7a' : '#ffd56b' }}>LIGHTYEAR · {verified ? 'VERIFIED' : candidate.lightyear_available === false ? 'NOT FOUND' : 'UNKNOWN'}</span>
              </div>
              <div style={{ fontSize: 10, lineHeight: 1.45, color: 'rgba(199,236,244,.68)', marginTop: 7 }}>{candidate.reason || candidate.error || 'No candidate reason returned.'}</div>
            </div>
          )
        })}
      </div>
    </div>
  )
}

function RecommendationCard({ recommendation }) {
  const instrument = recommendation.instrument && typeof recommendation.instrument === 'object' ? recommendation.instrument : {}
  const identifiers = [
    ['TICKER', instrument.ticker],
    ['ISIN', instrument.isin],
    ['EXCHANGE', instrument.exchange],
  ].filter(([, value]) => value)
  return (
    <CornerCard>
      <div style={{ padding: '14px 16px' }}>
        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12 }}>
          <div style={{ minWidth: 0 }}>
            <div style={{ fontFamily: 'var(--display)', fontSize: 19, fontWeight: 700, letterSpacing: '.04em', color: '#fff', overflowWrap: 'anywhere' }}>{instrument.display_name || recommendation.asset}</div>
            <div style={{ fontFamily: 'var(--mono)', fontSize: 7, color: muted, letterSpacing: '.12em', marginTop: 3, overflowWrap: 'anywhere' }}>ASSET KEY · {recommendation.asset}</div>
            {instrument.candidate_label && <div style={{ fontSize: 11, color: 'rgba(125,188,200,.7)', marginTop: 4 }}>{instrument.candidate_label}</div>}
            <div style={{ fontFamily: 'var(--mono)', fontSize: 8, color: '#4dffb4', letterSpacing: '.16em', marginTop: 3 }}>{humanize(recommendation.lane)} LANE</div>
          </div>
          <div style={{ fontFamily: 'var(--display)', fontSize: 20, fontWeight: 700, color: '#7df0ff', textAlign: 'right' }}>{formatEur(recommendation.amount)}</div>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginTop: 12, paddingTop: 10, borderTop: border }}>
          <Stat label="ROUTE" value={recommendation.route || '—'} />
          <Stat label="PLATFORM" value={instrument.platform || '—'} />
        </div>
        {identifiers.length > 0 && (
          <div style={{ display: 'grid', gridTemplateColumns: `repeat(${Math.min(identifiers.length, 2)},minmax(0,1fr))`, gap: 8, marginTop: 8 }}>
            {identifiers.map(([label, value]) => <Stat key={label} label={label} value={value} />)}
          </div>
        )}
        {recommendation.lane === 'etf' && <ResolvedInstrument instrument={instrument} />}
        {instrument.confirmation_required && (
          <div style={{ marginTop: 10, padding: '9px 10px', border: '1px solid rgba(255,213,107,.3)', background: 'rgba(255,213,107,.04)', color: '#ffd56b' }}>
            <div style={{ fontFamily: 'var(--mono)', fontSize: 8, letterSpacing: '.12em', marginBottom: 4 }}>NEEDS CONFIRMATION</div>
            <div style={{ fontSize: 12 }}>Instrument confirmation required before manual buy.</div>
          </div>
        )}
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

function TextList({ items, emptyText = 'NONE REPORTED', color = 'rgba(199,236,244,.78)' }) {
  const values = Array.isArray(items) ? items : []
  if (values.length === 0) {
    return <div style={{ fontFamily: 'var(--mono)', fontSize: 8, letterSpacing: '.1em', color: muted }}>{emptyText}</div>
  }
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
      {values.map((item, index) => (
        <div key={index} style={{ display: 'flex', alignItems: 'flex-start', gap: 7, fontSize: 12, lineHeight: 1.45, color }}>
          <span style={{ color: '#20d8ec', flexShrink: 0 }}>›</span>
          <span>{typeof item === 'string' ? item : item?.reason || JSON.stringify(item)}</span>
        </div>
      ))}
    </div>
  )
}

function EtfCandidateCard({ candidate }) {
  const selected = Boolean(candidate.selected)
  const instrument = candidate.instrument && typeof candidate.instrument === 'object' ? candidate.instrument : {}
  return (
    <div style={{ border: `1px solid ${selected ? 'rgba(77,255,180,.38)' : 'rgba(32,216,236,.18)'}`, background: selected ? 'rgba(77,255,180,.035)' : 'rgba(32,216,236,.02)', padding: '12px 13px' }}>
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 10 }}>
        <div style={{ minWidth: 0 }}>
          <div style={{ fontFamily: 'var(--mono)', fontSize: 7, letterSpacing: '.16em', color: muted }}>RANK {candidate.rank ?? '—'}</div>
          <div style={{ fontFamily: 'var(--display)', fontSize: 16, fontWeight: 700, color: selected ? '#4dffb4' : '#7df0ff', overflowWrap: 'anywhere', marginTop: 3 }}>{candidate.sleeve || '—'}</div>
          {instrument.display_name && <div style={{ fontSize: 11, color: 'rgba(199,236,244,.78)', marginTop: 4 }}>{instrument.display_name}</div>}
          {instrument.candidate_label && <div style={{ fontFamily: 'var(--mono)', fontSize: 7, lineHeight: 1.4, color: muted, marginTop: 3 }}>{instrument.candidate_label}</div>}
        </div>
        <div style={{ textAlign: 'right', flexShrink: 0 }}>
          <div style={{ fontFamily: 'var(--mono)', fontSize: 7, letterSpacing: '.14em', color: muted }}>FINAL SCORE</div>
          <div style={{ fontFamily: 'var(--display)', fontSize: 20, fontWeight: 700, color: '#fff' }}>{Number.isFinite(Number(candidate.final_score)) ? Number(candidate.final_score).toFixed(1) : '—'}</div>
          <div style={{ fontFamily: 'var(--mono)', fontSize: 7, letterSpacing: '.12em', color: selected ? '#4dffb4' : muted }}>{selected ? 'SELECTED' : 'NOT SELECTED'}</div>
        </div>
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginTop: 10 }}>
        <div style={{ padding: 9, border, minWidth: 0 }}>
          <div style={{ fontFamily: 'var(--mono)', fontSize: 7, letterSpacing: '.14em', color: '#4dffb4', marginBottom: 6 }}>POSITIVE DRIVERS</div>
          <TextList items={candidate.main_positive_drivers} />
        </div>
        <div style={{ padding: 9, border, minWidth: 0 }}>
          <div style={{ fontFamily: 'var(--mono)', fontSize: 7, letterSpacing: '.14em', color: '#ffd56b', marginBottom: 6 }}>PENALTIES</div>
          <TextList items={candidate.main_penalties} />
        </div>
      </div>
      <div style={{ marginTop: 9, paddingTop: 9, borderTop: border, fontSize: 12, lineHeight: 1.5, color: 'rgba(199,236,244,.78)' }}>{candidate.reason || 'No reason returned.'}</div>
      <CandidateComparison candidates={instrument.candidates} />
    </div>
  )
}

function LaneCard({ title, lane }) {
  const data = lane && typeof lane === 'object' ? lane : {}
  return (
    <div style={{ border, background: 'rgba(32,216,236,.02)', padding: '12px 13px' }}>
      <div style={{ fontFamily: 'var(--mono)', fontSize: 7, letterSpacing: '.18em', color: muted }}>{title}</div>
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10, marginTop: 6 }}>
        <div style={{ fontFamily: 'var(--display)', fontSize: 16, fontWeight: 700, color: '#7df0ff', overflowWrap: 'anywhere' }}>{data.asset || '—'}</div>
        <div style={{ fontFamily: 'var(--display)', fontSize: 16, fontWeight: 700, color: '#fff', flexShrink: 0 }}>{formatEur(data.amount)}</div>
      </div>
      <div style={{ fontFamily: 'var(--mono)', fontSize: 8, letterSpacing: '.09em', color: '#4dffb4', marginTop: 5, overflowWrap: 'anywhere' }}>{humanize(data.status)}</div>
      <div style={{ fontSize: 12, lineHeight: 1.5, color: 'rgba(199,236,244,.78)', marginTop: 8 }}>{data.reason || 'No lane reason returned.'}</div>
    </div>
  )
}

function RiskControls({ controls }) {
  const data = controls && typeof controls === 'object' ? controls : {}
  const rows = [
    ['BTC MAX', Number.isFinite(Number(data.btc_max)) ? `${(Number(data.btc_max) * 100).toFixed(1)}%` : '—'],
    ['TOTAL CRYPTO HARD MAX', Number.isFinite(Number(data.total_crypto_hard_max)) ? `${(Number(data.total_crypto_hard_max) * 100).toFixed(1)}%` : '—'],
    ['BTC BUY ROOM', formatEur(data.btc_buy_room)],
    ['TOTAL CRYPTO BUY ROOM', formatEur(data.total_crypto_buy_room)],
    ['WEEKLY BTC CAP', formatEur(data.weekly_btc_cap)],
    ['WEEKLY TOTAL CRYPTO CAP', formatEur(data.weekly_total_crypto_cap)],
  ]
  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2,minmax(0,1fr))', gap: 8 }}>
      {rows.map(([label, value]) => <Stat key={label} label={label} value={value} />)}
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
  const etfVerdict = rec?.etf_scoring_verdict && typeof rec.etf_scoring_verdict === 'object' ? rec.etf_scoring_verdict : {}
  const etfCandidates = Array.isArray(etfVerdict.sleeves) ? etfVerdict.sleeves : []
  const laneMandate = rec?.weekly_dual_lane_mandate && typeof rec.weekly_dual_lane_mandate === 'object' ? rec.weekly_dual_lane_mandate : {}
  const portfolioModeDetails = rec?.portfolio_mode_details && typeof rec.portfolio_mode_details === 'object' ? rec.portfolio_mode_details : {}
  const approvalSummary = rec?.approval_ticket_summary && typeof rec.approval_ticket_summary === 'object' ? rec.approval_ticket_summary : {}

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

          <Section title="RECOMMENDATION AUDIT">
            <div style={{ border, background: 'rgba(32,216,236,.025)', padding: '11px 13px', marginBottom: 10 }}>
              <div style={{ fontFamily: 'var(--mono)', fontSize: 7, letterSpacing: '.16em', color: muted }}>SELECTED ETF SLEEVE</div>
              <div style={{ fontFamily: 'var(--display)', fontSize: 18, fontWeight: 700, color: '#4dffb4', marginTop: 4, overflowWrap: 'anywhere' }}>{etfVerdict.selected_ideal_etf || 'NONE SELECTED'}</div>
            </div>
            {etfCandidates.length > 0
              ? <div style={{ display: 'flex', flexDirection: 'column', gap: 9 }}>{etfCandidates.map((candidate, index) => <EtfCandidateCard key={`${candidate.sleeve || 'candidate'}-${index}`} candidate={candidate} />)}</div>
              : <div style={{ fontFamily: 'var(--mono)', fontSize: 8, color: muted, letterSpacing: '.12em' }}>NO ETF SCORING VERDICT RETURNED</div>}
          </Section>

          <Section title="LANE LOGIC">
            <div style={{ display: 'flex', flexDirection: 'column', gap: 9 }}>
              <LaneCard title="CRYPTO LANE" lane={laneMandate.crypto_lane} />
              <LaneCard title="STOCK / FUND / ETF LANE" lane={laneMandate.stock_fund_etf_lane} />
            </div>
          </Section>

          <Section title="RISK CONTROLS">
            <RiskControls controls={laneMandate.risk_controls} />
            <div style={{ marginTop: 12, border, background: 'rgba(32,216,236,.02)', padding: '11px 12px' }}>
              <div style={{ fontFamily: 'var(--mono)', fontSize: 7, letterSpacing: '.16em', color: muted, marginBottom: 7 }}>MANUAL APPROVAL SAFETY CHECKS</div>
              <TextList items={approvalSummary.safety_checks} emptyText="NO SAFETY CHECKS RETURNED" />
            </div>
            {['blocked_actions', 'fallback_actions', 'reserve_actions'].map((key) => {
              const actions = Array.isArray(approvalSummary[key]) ? approvalSummary[key] : []
              return actions.length > 0 ? (
                <div key={key} style={{ marginTop: 8, border: '1px solid rgba(255,213,107,.18)', background: 'rgba(255,213,107,.025)', padding: '10px 12px' }}>
                  <div style={{ fontFamily: 'var(--mono)', fontSize: 7, letterSpacing: '.14em', color: '#ffd56b', marginBottom: 6 }}>{humanize(key)}</div>
                  <TextList items={actions} color="rgba(255,213,107,.82)" />
                </div>
              ) : null
            })}
          </Section>

          <Section title="PORTFOLIO MODE">
            <CornerCard>
              <div style={{ padding: '13px 14px' }}>
                <div style={{ fontFamily: 'var(--display)', fontSize: 18, fontWeight: 700, color: '#7df0ff', overflowWrap: 'anywhere' }}>{portfolioModeDetails.mode || '—'}</div>
                <div style={{ fontFamily: 'var(--mono)', fontSize: 7, letterSpacing: '.16em', color: muted, marginTop: 12, marginBottom: 7 }}>REASONS</div>
                <TextList items={portfolioModeDetails.reasons} emptyText="NO MODE REASONS RETURNED" />
                <div style={{ fontFamily: 'var(--mono)', fontSize: 7, letterSpacing: '.16em', color: muted, marginTop: 12, marginBottom: 7 }}>GUIDANCE</div>
                <div style={{ fontSize: 12, lineHeight: 1.55, color: 'rgba(199,236,244,.78)' }}>{portfolioModeDetails.guidance || 'No portfolio mode guidance returned.'}</div>
              </div>
            </CornerCard>
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
