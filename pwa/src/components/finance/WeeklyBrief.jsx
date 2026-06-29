import { useEffect, useState } from 'react'
import { getFinanceLedger, getFinanceManualBuyChecklist, getFinanceRecommendation, getFinanceTransactionApplyPreview, postBriefAction, postFinanceResearchAutopilotRun, postFinanceTransactionApply, postFinanceTransactionVoid, postManualFinanceTransaction } from '../../api/client'

const FONTS_URL = 'https://fonts.googleapis.com/css2?family=Rajdhani:wght@500;600;700&family=Space+Grotesk:wght@300;400;500;600;700&family=Share+Tech+Mono&display=swap'
const KEYFRAMES = `
  @keyframes phScan { 0%{transform:translateX(-100%)} 100%{transform:translateX(100%)} }
  @keyframes phApproveGlow { 0%,100%{box-shadow:0 0 20px rgba(0,187,221,.5),0 0 40px rgba(0,187,221,.2)} 50%{box-shadow:0 0 36px rgba(0,187,221,.9),0 0 70px rgba(0,187,221,.4)} }
  @keyframes phBlink { 0%,100%{opacity:1} 50%{opacity:.2} }
`

const border = '1px solid rgba(0,187,221,.18)'
const muted = 'rgba(0,187,221,.45)'
const MONO = "'Share Tech Mono', monospace"
const DISPLAY = "'Rajdhani', sans-serif"
const BODY = "'Space Grotesk', sans-serif"
const BG = '#060c12'
const CARD = '#070e15'
const ACCENT = '#00bbdd'

const inputStyle = {
  width: '100%', boxSizing: 'border-box', border,
  background: 'rgba(0,187,221,.025)', color: '#c7ecf4',
  fontFamily: MONO, fontSize: 10, padding: '9px 10px', outline: 'none',
}

function formatEur(value) {
  const amount = Number(value)
  if (!Number.isFinite(amount)) return '—'
  return amount.toLocaleString('en-US', { style: 'currency', currency: 'EUR', minimumFractionDigits: 2, maximumFractionDigits: 2 })
}

function humanize(value) {
  return value ? String(value).replace(/_/g, ' ').toUpperCase() : '—'
}

// Primary section — full visual weight
function Section({ title, children }) {
  return (
    <section style={{ padding: '16px 18px', borderBottom: border }}>
      <div style={{ fontFamily: MONO, fontSize: 8, letterSpacing: '.22em', color: muted, marginBottom: 12 }}>{title}</div>
      {children}
    </section>
  )
}

// Collapsible audit section — secondary weight, collapsed by default
function AuditSection({ title, children, defaultOpen = false }) {
  const [open, setOpen] = useState(defaultOpen)
  return (
    <div style={{ borderBottom: border }}>
      <button
        onClick={() => setOpen(o => !o)}
        style={{
          width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          padding: '12px 18px', background: 'transparent', border: 'none', cursor: 'pointer',
        }}
      >
        <span style={{ fontFamily: MONO, fontSize: 8, letterSpacing: '.22em', color: 'rgba(0,187,221,.3)' }}>{title}</span>
        <span style={{ fontFamily: MONO, fontSize: 9, color: 'rgba(0,187,221,.3)', flexShrink: 0, marginLeft: 8 }}>{open ? '▲' : '▼'}</span>
      </button>
      {open && <div style={{ padding: '0 18px 16px' }}>{children}</div>}
    </div>
  )
}

function Stat({ label, value, color = ACCENT }) {
  return (
    <div style={{ minWidth: 0, background: 'rgba(0,187,221,.03)', border, padding: '10px 12px' }}>
      <div style={{ fontFamily: MONO, fontSize: 7, letterSpacing: '.18em', color: muted, marginBottom: 4 }}>{label}</div>
      <div style={{ fontFamily: DISPLAY, fontSize: 14, fontWeight: 600, letterSpacing: '.04em', color, overflowWrap: 'anywhere' }}>{value}</div>
    </div>
  )
}

function CornerCard({ children }) {
  return (
    <div style={{ background: 'rgba(6,12,18,.9)', border, position: 'relative', overflow: 'hidden' }}>
      <div style={{ position: 'absolute', top: 0, left: 0, right: 0, height: 1, background: `linear-gradient(90deg,transparent,${ACCENT},transparent)`, opacity: .4 }} />
      <div style={{ position: 'absolute', top: 0, left: 0, width: 10, height: 10, borderTop: `1px solid rgba(0,187,221,.5)`, borderLeft: `1px solid rgba(0,187,221,.5)` }} />
      <div style={{ position: 'absolute', top: 0, right: 0, width: 10, height: 10, borderTop: `1px solid rgba(0,187,221,.5)`, borderRight: `1px solid rgba(0,187,221,.5)` }} />
      <div style={{ position: 'absolute', bottom: 0, left: 0, width: 10, height: 10, borderBottom: `1px solid rgba(0,187,221,.5)`, borderLeft: `1px solid rgba(0,187,221,.5)` }} />
      <div style={{ position: 'absolute', bottom: 0, right: 0, width: 10, height: 10, borderBottom: `1px solid rgba(0,187,221,.5)`, borderRight: `1px solid rgba(0,187,221,.5)` }} />
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
      <div style={{ fontFamily: MONO, fontSize: 8, letterSpacing: '.1em' }}>
        {verified ? 'LIGHTYEAR PUBLIC CATALOGUE VERIFIED' : unavailable ? 'NOT FOUND IN LIGHTYEAR PUBLIC CATALOGUE' : 'LIGHTYEAR AVAILABILITY NOT VERIFIED'}
      </div>
      <div style={{ fontFamily: MONO, fontSize: 7, color: muted, marginTop: 3 }}>{humanize(candidate?.lightyear_confidence)}</div>
      {candidate?.lightyear_url && verified && (
        <a href={candidate.lightyear_url} target="_blank" rel="noreferrer" style={{ display: 'inline-block', color: ACCENT, fontFamily: MONO, fontSize: 7, marginTop: 5 }}>OPEN PUBLIC LIGHTYEAR PAGE ↗</a>
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
    <div style={{ marginTop: 10, padding: '11px 12px', border, background: 'rgba(0,187,221,.025)' }}>
      <div style={{ fontFamily: MONO, fontSize: 7, letterSpacing: '.16em', color: muted }}>RESOLVED ETF CANDIDATE</div>
      <div style={{ fontFamily: DISPLAY, fontSize: 17, fontWeight: 700, color: ACCENT, marginTop: 5 }}>{candidate.symbol || '—'}</div>
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
      <div style={{ fontFamily: MONO, fontSize: 7, letterSpacing: '.16em', color: muted, marginBottom: 8 }}>INSTRUMENT CANDIDATE COMPARISON</div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 7 }}>
        {values.map((candidate, index) => {
          const score = candidate?.score_components?.total_score
          const verified = candidate.lightyear_available === true && candidate.lightyear_confidence === 'high'
          return (
            <div key={`${candidate.symbol || 'candidate'}-${index}`} style={{ padding: '9px 10px', border: `1px solid ${candidate.selected ? 'rgba(77,255,180,.35)' : 'rgba(0,187,221,.14)'}`, background: candidate.selected ? 'rgba(77,255,180,.025)' : 'rgba(0,0,0,.35)' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 8 }}>
                <div style={{ minWidth: 0 }}>
                  <div style={{ fontFamily: DISPLAY, fontSize: 14, fontWeight: 700, color: candidate.selected ? '#4dffb4' : ACCENT }}>{candidate.symbol || '—'}</div>
                  <div style={{ fontSize: 10, color: 'rgba(199,236,244,.7)', overflowWrap: 'anywhere' }}>{candidate.label || '—'}</div>
                </div>
                <div style={{ fontFamily: MONO, fontSize: 7, color: candidate.selected ? '#4dffb4' : muted, flexShrink: 0 }}>{candidate.selected ? 'SELECTED' : 'NOT SELECTED'}</div>
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2,minmax(0,1fr))', gap: '5px 8px', marginTop: 7, fontFamily: MONO, fontSize: 7, color: muted }}>
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

function ResearchLegRow({ leg }) {
  const statusColor = leg.evidence_status === 'EVIDENCE_STRONG' ? '#4dffb4'
    : leg.evidence_status === 'BLOCKED_BY_FAIL' ? '#ff5c7a'
    : leg.evidence_status === 'NEEDS_RESEARCH' ? '#ffd56b'
    : muted
  return (
    <div style={{ border, background: 'rgba(0,187,221,.02)', padding: '9px 12px' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8 }}>
        <div style={{ fontFamily: DISPLAY, fontSize: 13, fontWeight: 700, color: ACCENT, overflowWrap: 'anywhere' }}>{leg.asset}</div>
        <div style={{ fontFamily: MONO, fontSize: 7, letterSpacing: '.12em', color: statusColor, flexShrink: 0 }}>{leg.evidence_status}</div>
      </div>
      {leg.memo_title && <div style={{ fontSize: 11, color: 'rgba(199,236,244,.72)', marginTop: 3, overflowWrap: 'anywhere' }}>{leg.memo_title}</div>}
      {leg.research_warning && <div style={{ fontFamily: MONO, fontSize: 7, color: statusColor, marginTop: 5, lineHeight: 1.5 }}>{leg.research_warning}</div>}
    </div>
  )
}

function ManualBuyChecklistSection({ checklist, error, onRecordTransaction }) {
  const items = Array.isArray(checklist?.checklist_items) ? checklist.checklist_items : []
  const ready = checklist?.checklist_status === 'READY_FOR_MANUAL_REVIEW'
  return (
    <Section title="MANUAL BUY CHECKLIST">
      {!checklist && !error && <div style={{ fontFamily: MONO, fontSize: 8, color: muted, letterSpacing: '.12em' }}>LOADING MANUAL CHECKLIST…</div>}
      {error && <div style={{ padding: '10px 12px', border: '1px solid rgba(255,92,122,.3)', color: '#ff5c7a', fontFamily: MONO, fontSize: 8, lineHeight: 1.5 }}>MANUAL CHECKLIST UNAVAILABLE · {error}</div>}
      {checklist && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          <div style={{ padding: '10px 12px', border: ready ? '1px solid rgba(77,255,180,.25)' : '1px solid rgba(255,213,107,.3)', background: ready ? 'rgba(77,255,180,.03)' : 'rgba(255,213,107,.035)' }}>
            <div style={{ fontFamily: MONO, fontSize: 8, letterSpacing: '.12em', color: ready ? '#4dffb4' : '#ffd56b' }}>{checklist.checklist_status}</div>
            <div style={{ fontSize: 12, lineHeight: 1.55, marginTop: 5, color: 'rgba(199,236,244,.8)' }}>Open your broker manually to complete this buy. PHOENIX has not executed anything.</div>
          </div>
          {items.map((item, index) => (
            <CornerCard key={`${item.asset}-${index}`}>
              <div style={{ padding: '13px 15px' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10, alignItems: 'flex-start' }}>
                  <div style={{ minWidth: 0 }}>
                    <div style={{ fontFamily: DISPLAY, fontSize: 16, fontWeight: 700, color: ACCENT, overflowWrap: 'anywhere' }}>{String(item.asset || '—').toUpperCase()}</div>
                    <div style={{ fontSize: 11, color: 'rgba(199,236,244,.72)', marginTop: 3, overflowWrap: 'anywhere' }}>{item.instrument_display_name || item.ticker || 'Instrument details unavailable'}</div>
                  </div>
                  <div style={{ fontFamily: DISPLAY, fontSize: 18, color: '#fff', flexShrink: 0 }}>{formatEur(item.amount)}</div>
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginTop: 10 }}>
                  <Stat label="PLATFORM" value={item.platform || item.route || '—'} />
                  <Stat label="TICKER / SYMBOL" value={item.ticker || item.resolved_candidate?.symbol || 'Needs confirmation'} />
                  <Stat label="RESEARCH" value={item.evidence_status || 'NO_EVIDENCE'} color={item.evidence_status === 'EVIDENCE_STRONG' ? '#4dffb4' : '#ffd56b'} />
                  <Stat label="VERDICT" value={item.research_verdict || '—'} />
                </div>
                {item.research_warning && <div style={{ marginTop: 9, color: '#ffd56b', fontSize: 11, lineHeight: 1.5 }}>{item.research_warning}</div>}
                <div style={{ marginTop: 10, padding: '9px 10px', border, background: 'rgba(0,187,221,.02)', fontSize: 12, lineHeight: 1.55, color: 'rgba(199,236,244,.86)' }}>{item.broker_instruction || item.manual_action_text}</div>
                {Array.isArray(item.pre_buy_checks) && item.pre_buy_checks.length > 0 && (
                  <div style={{ marginTop: 10 }}>
                    <div style={{ fontFamily: MONO, fontSize: 7, letterSpacing: '.14em', color: muted, marginBottom: 6 }}>PRE-BUY CHECKS</div>
                    <TextList items={item.pre_buy_checks} />
                  </div>
                )}
                <button type="button" onClick={() => onRecordTransaction(item.asset)} style={{ marginTop: 11, width: '100%', padding: '9px 0', border: `1px solid rgba(0,187,221,.6)`, background: 'transparent', color: '#7de8ff', fontFamily: MONO, fontSize: 8, fontWeight: 700, letterSpacing: '.14em', cursor: 'pointer', textShadow: '0 0 10px rgba(0,187,221,.6)' }}>
                  RECORD TRANSACTION →
                </button>
              </div>
            </CornerCard>
          ))}
        </div>
      )}
    </Section>
  )
}

function RecommendationCard({ recommendation }) {
  const instrument = recommendation.instrument && typeof recommendation.instrument === 'object' ? recommendation.instrument : {}
  const identifiers = [['TICKER', instrument.ticker], ['ISIN', instrument.isin], ['EXCHANGE', instrument.exchange]].filter(([, v]) => v)
  return (
    <CornerCard>
      <div style={{ padding: '14px 16px' }}>
        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12 }}>
          <div style={{ minWidth: 0 }}>
            <div style={{ fontFamily: DISPLAY, fontSize: 19, fontWeight: 700, letterSpacing: '.04em', color: '#eef6f9', overflowWrap: 'anywhere' }}>{instrument.display_name || recommendation.asset}</div>
            <div style={{ fontFamily: MONO, fontSize: 7, color: muted, letterSpacing: '.12em', marginTop: 3, overflowWrap: 'anywhere' }}>ASSET KEY · {recommendation.asset}</div>
            {instrument.candidate_label && <div style={{ fontSize: 11, color: 'rgba(125,188,200,.7)', marginTop: 4 }}>{instrument.candidate_label}</div>}
            <div style={{ fontFamily: MONO, fontSize: 8, color: '#4dffb4', letterSpacing: '.16em', marginTop: 3 }}>{humanize(recommendation.lane)} LANE</div>
          </div>
          <div style={{ fontFamily: DISPLAY, fontSize: 20, fontWeight: 700, color: ACCENT, textAlign: 'right', textShadow: '0 0 16px rgba(0,187,221,.4)' }}>{formatEur(recommendation.amount)}</div>
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
            <div style={{ fontFamily: MONO, fontSize: 8, letterSpacing: '.12em', marginBottom: 4 }}>NEEDS CONFIRMATION</div>
            <div style={{ fontSize: 12 }}>Instrument confirmation required before manual buy.</div>
          </div>
        )}
      </div>
    </CornerCard>
  )
}

function AllocationGrid({ allocations }) {
  const entries = allocations && typeof allocations === 'object' ? Object.entries(allocations) : []
  if (entries.length === 0) return <div style={{ fontFamily: MONO, fontSize: 8, color: muted, letterSpacing: '.12em' }}>NO TARGETS RETURNED</div>
  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2,minmax(0,1fr))', gap: 8 }}>
      {entries.map(([name, target]) => (
        <div key={name} style={{ border, background: 'rgba(0,187,221,.025)', padding: '10px 11px', minWidth: 0 }}>
          <div style={{ fontFamily: DISPLAY, fontSize: 12, fontWeight: 600, letterSpacing: '.04em', color: ACCENT, overflowWrap: 'anywhere' }}>{name}</div>
          <div style={{ fontFamily: MONO, fontSize: 16, color: '#fff', marginTop: 5 }}>{Number.isFinite(Number(target)) ? `${Number(target).toFixed(1)}%` : '—'}</div>
        </div>
      ))}
    </div>
  )
}

function TextList({ items, emptyText = 'NONE REPORTED', color = 'rgba(199,236,244,.78)' }) {
  const values = Array.isArray(items) ? items : []
  if (values.length === 0) return <div style={{ fontFamily: MONO, fontSize: 8, letterSpacing: '.1em', color: muted }}>{emptyText}</div>
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
      {values.map((item, index) => (
        <div key={index} style={{ display: 'flex', alignItems: 'flex-start', gap: 7, fontSize: 12, lineHeight: 1.45, color }}>
          <span style={{ color: ACCENT, flexShrink: 0 }}>›</span>
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
    <div style={{ border: `1px solid ${selected ? 'rgba(77,255,180,.38)' : 'rgba(0,187,221,.18)'}`, background: selected ? 'rgba(77,255,180,.035)' : 'rgba(0,187,221,.02)', padding: '12px 13px' }}>
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 10 }}>
        <div style={{ minWidth: 0 }}>
          <div style={{ fontFamily: MONO, fontSize: 7, letterSpacing: '.16em', color: muted }}>RANK {candidate.rank ?? '—'}</div>
          <div style={{ fontFamily: DISPLAY, fontSize: 16, fontWeight: 700, color: selected ? '#4dffb4' : ACCENT, overflowWrap: 'anywhere', marginTop: 3 }}>{candidate.sleeve || '—'}</div>
          {instrument.display_name && <div style={{ fontSize: 11, color: 'rgba(199,236,244,.78)', marginTop: 4 }}>{instrument.display_name}</div>}
          {instrument.candidate_label && <div style={{ fontFamily: MONO, fontSize: 7, lineHeight: 1.4, color: muted, marginTop: 3 }}>{instrument.candidate_label}</div>}
        </div>
        <div style={{ textAlign: 'right', flexShrink: 0 }}>
          <div style={{ fontFamily: MONO, fontSize: 7, letterSpacing: '.14em', color: muted }}>FINAL SCORE</div>
          <div style={{ fontFamily: DISPLAY, fontSize: 20, fontWeight: 700, color: '#fff' }}>{Number.isFinite(Number(candidate.final_score)) ? Number(candidate.final_score).toFixed(1) : '—'}</div>
          <div style={{ fontFamily: MONO, fontSize: 7, letterSpacing: '.12em', color: selected ? '#4dffb4' : muted }}>{selected ? 'SELECTED' : 'NOT SELECTED'}</div>
        </div>
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginTop: 10 }}>
        <div style={{ padding: 9, border, minWidth: 0 }}>
          <div style={{ fontFamily: MONO, fontSize: 7, letterSpacing: '.14em', color: '#4dffb4', marginBottom: 6 }}>POSITIVE DRIVERS</div>
          <TextList items={candidate.main_positive_drivers} />
        </div>
        <div style={{ padding: 9, border, minWidth: 0 }}>
          <div style={{ fontFamily: MONO, fontSize: 7, letterSpacing: '.14em', color: '#ffd56b', marginBottom: 6 }}>PENALTIES</div>
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
    <div style={{ border, background: 'rgba(0,187,221,.02)', padding: '12px 13px' }}>
      <div style={{ fontFamily: MONO, fontSize: 7, letterSpacing: '.18em', color: muted }}>{title}</div>
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10, marginTop: 6 }}>
        <div style={{ fontFamily: DISPLAY, fontSize: 16, fontWeight: 700, color: ACCENT, overflowWrap: 'anywhere' }}>{data.asset || '—'}</div>
        <div style={{ fontFamily: DISPLAY, fontSize: 16, fontWeight: 700, color: '#fff', flexShrink: 0 }}>{formatEur(data.amount)}</div>
      </div>
      <div style={{ fontFamily: MONO, fontSize: 8, letterSpacing: '.09em', color: '#4dffb4', marginTop: 5, overflowWrap: 'anywhere' }}>{humanize(data.status)}</div>
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

function FormField({ label, children }) {
  return (
    <label style={{ display: 'block', minWidth: 0 }}>
      <div style={{ fontFamily: MONO, fontSize: 7, letterSpacing: '.14em', color: muted, marginBottom: 4 }}>{label}</div>
      {children}
    </label>
  )
}

function LedgerApplyRow({ transaction, onApplied }) {
  const applied = Boolean(transaction.portfolio_state_updated)
  const voided = Boolean(transaction.voided)
  const [preview, setPreview] = useState(null)
  const [previewLoading, setPreviewLoading] = useState(false)
  const [previewError, setPreviewError] = useState('')
  const [applying, setApplying] = useState(false)
  const [applyResult, setApplyResult] = useState(null)
  const [applyError, setApplyError] = useState('')
  const [voiding, setVoiding] = useState(false)
  const [voidResult, setVoidResult] = useState(null)
  const [voidError, setVoidError] = useState('')

  async function loadPreview() {
    setPreviewLoading(true); setPreviewError('')
    try { const data = await getFinanceTransactionApplyPreview(transaction.id); setPreview(data) }
    catch (err) { setPreviewError(err?.message || 'Preview failed.') }
    finally { setPreviewLoading(false) }
  }

  async function applyTransaction() {
    setApplying(true); setApplyError('')
    try {
      const result = await postFinanceTransactionApply(transaction.id)
      setApplyResult(result); setPreview(null)
      if (onApplied) onApplied()
    } catch (err) { setApplyError(err?.message || 'Apply failed.') }
    finally { setApplying(false) }
  }

  async function voidTransaction() {
    if (!window.confirm('Void this transaction? If it was applied, the portfolio state will be reversed.')) return
    setVoiding(true); setVoidError('')
    try {
      const result = await postFinanceTransactionVoid(transaction.id, 'Manual void by user')
      setVoidResult(result)
      if (onApplied) onApplied()
    } catch (err) { setVoidError(err?.message || 'Void failed.') }
    finally { setVoiding(false) }
  }

  if (voided || voidResult) {
    return (
      <div style={{ borderTop: border, paddingTop: 8, marginTop: 2, opacity: 0.45 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8, fontFamily: MONO, fontSize: 8 }}>
          <span style={{ color: '#ff5c7a', minWidth: 0, overflowWrap: 'anywhere', textDecoration: 'line-through' }}>{transaction.symbol || transaction.asset} · {transaction.units} UNITS</span>
          <span style={{ color: 'rgba(199,236,244,.4)', flexShrink: 0 }}>{formatEur(transaction.amount_eur)}</span>
        </div>
        <div style={{ fontFamily: MONO, fontSize: 7, color: '#ff5c7a', letterSpacing: '.12em', marginTop: 4 }}>
          VOIDED{voidResult?.portfolio_state_reversed ? ' · PORTFOLIO STATE REVERSED' : ''}
        </div>
      </div>
    )
  }

  return (
    <div style={{ borderTop: border, paddingTop: 8, marginTop: 2 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8, fontFamily: MONO, fontSize: 8 }}>
        <span style={{ color: ACCENT, minWidth: 0, overflowWrap: 'anywhere' }}>{transaction.symbol || transaction.asset} · {transaction.units} UNITS</span>
        <span style={{ color: 'rgba(199,236,244,.78)', flexShrink: 0 }}>{formatEur(transaction.amount_eur)}</span>
      </div>
      <div style={{ marginTop: 5 }}>
        {applied || applyResult ? (
          <div style={{ fontFamily: MONO, fontSize: 7, color: '#4dffb4', letterSpacing: '.12em' }}>
            APPLIED TO PORTFOLIO STATE
            {applyResult && <div style={{ color: 'rgba(77,255,180,.75)', letterSpacing: '.08em', marginTop: 3, lineHeight: 1.5, textTransform: 'none' }}>Portfolio state updated from your manual record.</div>}
            <div style={{ marginTop: 6 }}>
              {voidError && <div style={{ color: '#ff5c7a', marginBottom: 4 }}>{voidError}</div>}
              <button onClick={voidTransaction} disabled={voiding} style={{ fontFamily: MONO, fontSize: 7, letterSpacing: '.1em', padding: '4px 8px', border: '1px solid rgba(255,92,122,.5)', color: '#ff8fa0', background: 'transparent', cursor: voiding ? 'wait' : 'pointer' }}>
                {voiding ? 'VOIDING…' : 'VOID & REVERSE'}
              </button>
            </div>
          </div>
        ) : (
          <>
            {!preview && !previewLoading && (
              <div style={{ display: 'flex', gap: 6 }}>
                <button onClick={loadPreview} style={{ fontFamily: MONO, fontSize: 7, letterSpacing: '.12em', padding: '5px 8px', border, color: ACCENT, background: 'transparent', cursor: 'pointer' }}>PREVIEW PORTFOLIO IMPACT</button>
                <button onClick={voidTransaction} disabled={voiding} style={{ fontFamily: MONO, fontSize: 7, letterSpacing: '.1em', padding: '5px 8px', border: '1px solid rgba(255,92,122,.4)', color: '#ff8fa0', background: 'transparent', cursor: voiding ? 'wait' : 'pointer' }}>
                  {voiding ? 'VOIDING…' : 'VOID'}
                </button>
              </div>
            )}
            {previewLoading && <span style={{ fontFamily: MONO, fontSize: 7, color: muted }}>LOADING PREVIEW…</span>}
            {previewError && <span style={{ fontFamily: MONO, fontSize: 7, color: '#ff5c7a' }}>{previewError}</span>}
            {preview && (
              <div style={{ marginTop: 6, padding: '8px 9px', border: `1px solid rgba(0,187,221,.22)`, background: 'rgba(0,187,221,.025)' }}>
                <div style={{ fontFamily: MONO, fontSize: 7, letterSpacing: '.12em', color: muted, marginBottom: 5 }}>APPLY PREVIEW</div>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 6, fontFamily: MONO, fontSize: 7 }}>
                  <div>
                    <div style={{ color: muted, marginBottom: 2 }}>BEFORE</div>
                    <div style={{ color: 'rgba(199,236,244,.82)' }}>{preview.asset}: {formatEur(preview.before.holdings?.[preview.asset])}</div>
                    {preview.before.units?.[preview.asset] != null && <div style={{ color: muted }}>{preview.before.units[preview.asset]} units</div>}
                  </div>
                  <div>
                    <div style={{ color: '#4dffb4', marginBottom: 2 }}>AFTER</div>
                    <div style={{ color: '#4dffb4' }}>{preview.asset}: {formatEur(preview.after.holdings?.[preview.asset])}</div>
                    {preview.after.units?.[preview.asset] != null && <div style={{ color: 'rgba(77,255,180,.75)' }}>{preview.after.units[preview.asset]} units</div>}
                  </div>
                </div>
                <div style={{ fontFamily: MONO, fontSize: 7, color: '#ffd56b', marginTop: 6 }}>
                  +{formatEur(preview.amount_eur_delta)} · +{preview.units_delta} units
                  {preview.fee_eur > 0 && ` · fee ${formatEur(preview.fee_eur)}`}
                </div>
                {applyError && <div style={{ color: '#ff5c7a', fontSize: 7, marginTop: 5 }}>{applyError}</div>}
                <button onClick={applyTransaction} disabled={applying} style={{ marginTop: 8, width: '100%', padding: '8px 0', border: `1px solid ${ACCENT}`, background: 'transparent', color: '#7de8ff', fontFamily: MONO, fontSize: 7, fontWeight: 700, letterSpacing: '.14em', cursor: applying ? 'wait' : 'pointer', textShadow: '0 0 8px rgba(0,187,221,.5)' }}>
                  {applying ? 'APPLYING…' : 'APPLY TO PORTFOLIO STATE'}
                </button>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  )
}

function ManualBuyPanel({ recommendations, briefId, initialAsset }) {
  const [selectedAsset, setSelectedAsset] = useState(initialAsset || recommendations[0]?.asset || '')
  const [form, setForm] = useState({})
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [saved, setSaved] = useState(null)
  const [transactions, setTransactions] = useState([])

  async function refreshLedger() {
    try {
      const ledger = await getFinanceLedger()
      setTransactions(Array.isArray(ledger.transactions) ? ledger.transactions.slice(0, 5) : [])
    } catch { setTransactions([]) }
  }

  useEffect(() => { refreshLedger() }, [])
  useEffect(() => { if (initialAsset) setSelectedAsset(initialAsset) }, [initialAsset])

  useEffect(() => {
    const recommendation = recommendations.find((item) => item.asset === selectedAsset) || recommendations[0]
    if (!recommendation) return
    if (recommendation.asset !== selectedAsset) setSelectedAsset(recommendation.asset)
    const instrument = recommendation.instrument || {}
    const resolved = instrument.resolved_candidate || {}
    setForm({
      asset: recommendation.asset,
      symbol: resolved.symbol || instrument.ticker || '',
      platform: instrument.platform || recommendation.route || '',
      suggested_amount_eur: recommendation.amount ?? '',
      amount_eur: '', units: '', price: '', currency: '', fee_eur: 0, executed_at: '', notes: '',
    })
    setError(''); setSaved(null)
  }, [selectedAsset, recommendations])

  function update(field, value) { setForm((current) => ({ ...current, [field]: value })) }

  const savedTransaction = saved ? transactions.find((t) => t.id === saved.transaction_id) : null

  async function submit(event) {
    event.preventDefault(); setSaving(true); setError(''); setSaved(null)
    try {
      const result = await postManualFinanceTransaction({
        brief_id: briefId, asset: form.asset, symbol: form.symbol || null,
        platform: form.platform, side: 'buy', amount_eur: Number(form.amount_eur),
        units: Number(form.units), price: Number(form.price), currency: form.currency,
        fee_eur: Number(form.fee_eur || 0), executed_at: new Date(form.executed_at).toISOString(),
        notes: form.notes || null,
      })
      setSaved(result); setForm((current) => ({ ...current, units: '' }))
      await refreshLedger()
    } catch (requestError) {
      setError(requestError?.message || 'Unable to save manual transaction.')
    } finally { setSaving(false) }
  }

  return (
    <CornerCard>
      <form onSubmit={submit} style={{ padding: '13px 14px' }}>
        <div style={{ fontSize: 12, lineHeight: 1.5, color: 'rgba(199,236,244,.72)', marginBottom: 11 }}>
          Record a trade you already completed manually in your broker.
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
          <FormField label="RECOMMENDATION">
            <select value={selectedAsset} onChange={(e) => setSelectedAsset(e.target.value)} style={inputStyle}>
              {recommendations.map((item) => <option key={item.asset} value={item.asset}>{item.asset}</option>)}
            </select>
          </FormField>
          <FormField label="SIDE"><input value="BUY" readOnly style={{ ...inputStyle, color: '#4dffb4' }} /></FormField>
          <FormField label="SYMBOL"><input value={form.symbol || ''} onChange={(e) => update('symbol', e.target.value)} style={inputStyle} /></FormField>
          <FormField label="PLATFORM"><input required value={form.platform || ''} onChange={(e) => update('platform', e.target.value)} style={inputStyle} /></FormField>
          <FormField label={`ACTUAL AMOUNT EUR · SUGGESTED ${formatEur(form.suggested_amount_eur)}`}><input required min="0.01" step="any" type="number" value={form.amount_eur ?? ''} onChange={(e) => update('amount_eur', e.target.value)} style={inputStyle} /></FormField>
          <FormField label="UNITS RECEIVED"><input required min="0.00000001" step="any" type="number" value={form.units ?? ''} onChange={(e) => update('units', e.target.value)} style={inputStyle} /></FormField>
          <FormField label="ACTUAL PRICE"><input required min="0.00000001" step="any" type="number" value={form.price ?? ''} onChange={(e) => update('price', e.target.value)} style={inputStyle} /></FormField>
          <FormField label="CURRENCY"><input required value={form.currency || ''} onChange={(e) => update('currency', e.target.value)} style={inputStyle} placeholder="e.g. EUR" /></FormField>
          <FormField label="FEE EUR"><input required min="0" step="any" type="number" value={form.fee_eur ?? 0} onChange={(e) => update('fee_eur', e.target.value)} style={inputStyle} /></FormField>
          <FormField label="EXECUTED AT"><input required type="datetime-local" value={form.executed_at || ''} onChange={(e) => update('executed_at', e.target.value)} style={inputStyle} /></FormField>
        </div>
        <FormField label="NOTES">
          <input value={form.notes || ''} onChange={(e) => update('notes', e.target.value)} style={{ ...inputStyle, marginTop: 8 }} placeholder="Optional manual record note" />
        </FormField>
        {error && <div style={{ color: '#ff5c7a', fontFamily: MONO, fontSize: 8, marginTop: 9 }}>{error}</div>}
        {saved && (
          <div style={{ marginTop: 10, padding: '10px 11px', border: '1px solid rgba(77,255,180,.3)', background: 'rgba(77,255,180,.035)', color: '#4dffb4' }}>
            <div style={{ fontFamily: MONO, fontSize: 8, letterSpacing: '.12em' }}>TRANSACTION #{saved.transaction_id} RECORDED</div>
            <div style={{ fontSize: 11, lineHeight: 1.45, marginTop: 4 }}>{saved.message}</div>
            {savedTransaction && <LedgerApplyRow transaction={savedTransaction} onApplied={refreshLedger} />}
          </div>
        )}
        <button disabled={saving} type="submit" style={{ marginTop: 11, width: '100%', padding: '11px 0', border: `1px solid ${ACCENT}`, background: 'transparent', color: '#7de8ff', fontFamily: MONO, fontSize: 9, fontWeight: 700, letterSpacing: '.16em', cursor: saving ? 'wait' : 'pointer', textShadow: '0 0 10px rgba(0,187,221,.6)' }}>
          {saving ? 'SAVING MANUAL RECORD…' : 'RECORD MANUAL BUY'}
        </button>
      </form>
      {transactions.length > 0 && (
        <div style={{ padding: '0 14px 13px' }}>
          <div style={{ fontFamily: MONO, fontSize: 7, letterSpacing: '.16em', color: muted, marginBottom: 7 }}>RECENT MANUAL LEDGER</div>
          {transactions.filter((t) => t.id !== saved?.transaction_id).map((t) => <LedgerApplyRow key={t.id} transaction={t} onApplied={refreshLedger} />)}
        </div>
      )}
    </CornerCard>
  )
}

export default function WeeklyBrief({ onBack }) {
  const [rec, setRec] = useState(null)
  const [manualChecklist, setManualChecklist] = useState(null)
  const [manualChecklistError, setManualChecklistError] = useState('')
  const [recordAsset, setRecordAsset] = useState(null)
  const [error, setError] = useState('')
  const [actionError, setActionError] = useState('')
  const [acting, setActing] = useState(false)
  const [autopilotRunning, setAutopilotRunning] = useState(false)
  const [autopilotResult, setAutopilotResult] = useState(null)

  useEffect(() => {
    if (!document.getElementById('ph-fonts')) {
      const link = document.createElement('link')
      link.id = 'ph-fonts'; link.rel = 'stylesheet'; link.href = FONTS_URL
      document.head.appendChild(link)
    }
    if (!document.getElementById('ph-keyframes')) {
      const style = document.createElement('style')
      style.id = 'ph-keyframes'; style.textContent = KEYFRAMES
      document.head.appendChild(style)
    }
  }, [])

  useEffect(() => {
    let active = true
    getFinanceRecommendation().then((r) => { if (active) setRec(r) }).catch((e) => { if (active) setError(e?.message || 'Unable to load the weekly brief.') })
    return () => { active = false }
  }, [])

  useEffect(() => {
    let active = true
    getFinanceManualBuyChecklist().then((r) => { if (active) setManualChecklist(r) }).catch((e) => { if (active) setManualChecklistError(e?.message || 'Unable to load the manual checklist.') })
    return () => { active = false }
  }, [])

  async function handleFinanceAutopilot() {
    setAutopilotRunning(true); setAutopilotResult(null)
    try { const result = await postFinanceResearchAutopilotRun(); setAutopilotResult(result) }
    catch { setAutopilotResult({ error: true }) }
    finally { setAutopilotRunning(false) }
  }

  async function handleAction(actionName) {
    if (!rec?.brief_id) return
    setActing(true); setActionError('')
    try {
      await postBriefAction(rec.brief_id, actionName)
      setRec((current) => ({ ...current, brief_status: actionName === 'approve' ? 'approved' : actionName === 'reject' ? 'rejected' : 'deferred', brief_user_action: actionName }))
    } catch (e) { setActionError(e?.message || 'Unable to log this action.') }
    finally { setActing(false) }
  }

  const recommendations = Array.isArray(rec?.recommendations) ? rec.recommendations : []
  const researchContext = Array.isArray(rec?.research_context) ? rec.research_context : []
  const researchGateSummary = rec?.research_gate_summary || null
  const warnings = Array.isArray(rec?.warnings) ? rec.warnings : []
  const newsThesis = typeof rec?.news_thesis === 'string' ? rec.news_thesis.trim() : ''
  const canLogApproval = Boolean(rec?.brief_id)
  const briefStatus = rec?.brief_status || null
  const isApproved = briefStatus === 'approved'
  const etfVerdict = rec?.etf_scoring_verdict && typeof rec.etf_scoring_verdict === 'object' ? rec.etf_scoring_verdict : {}
  const etfCandidates = Array.isArray(etfVerdict.sleeves) ? etfVerdict.sleeves : []
  const laneMandate = rec?.weekly_dual_lane_mandate && typeof rec.weekly_dual_lane_mandate === 'object' ? rec.weekly_dual_lane_mandate : {}
  const portfolioModeDetails = rec?.portfolio_mode_details && typeof rec.portfolio_mode_details === 'object' ? rec.portfolio_mode_details : {}
  const approvalSummary = rec?.approval_ticket_summary && typeof rec.approval_ticket_summary === 'object' ? rec.approval_ticket_summary : {}

  const approvalBtnBase = { fontFamily: MONO, letterSpacing: '.18em', padding: '13px 0', cursor: acting ? 'wait' : 'pointer', border: 'none', background: 'transparent' }

  return (
    <div style={{ height: '100%', overflowY: 'auto', paddingBottom: 88, background: BG, color: 'rgba(199,236,244,.92)', fontFamily: BODY }}>

      {/* Top bar */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '13px 18px 11px', borderBottom: border, position: 'sticky', top: 0, background: `${CARD}f5`, backdropFilter: 'blur(12px)', zIndex: 5, overflow: 'hidden' }}>
        <div style={{ position: 'absolute', top: 0, left: 0, right: 0, height: 1, background: `linear-gradient(90deg,transparent,${ACCENT},transparent)`, animation: 'phScan 4s linear infinite' }} />
        <div style={{ display: 'flex', alignItems: 'center' }}>
          <span onClick={onBack} style={{ color: ACCENT, fontSize: 16, cursor: 'pointer', marginRight: 10 }}>←</span>
          <span style={{ fontFamily: DISPLAY, fontSize: 16, fontWeight: 700, letterSpacing: '.28em', color: ACCENT, textShadow: '0 0 20px rgba(0,187,221,.4)' }}>WEEKLY BRIEF</span>
        </div>
        <span style={{ fontFamily: MONO, fontSize: 8, color: muted, letterSpacing: '.14em' }}>{rec?.week_label || 'SYNCING'}</span>
      </div>

      {!rec && !error && <div style={{ padding: '48px 18px', textAlign: 'center', fontFamily: MONO, fontSize: 9, letterSpacing: '.18em', color: muted }}>LOADING WEEKLY RECOMMENDATION…</div>}

      {error && (
        <div style={{ margin: 18, padding: 14, border: '1px solid rgba(255,92,122,.35)', background: 'rgba(255,92,122,.06)', color: '#ff5c7a', fontFamily: MONO, fontSize: 9, lineHeight: 1.6 }}>
          WEEKLY BRIEF UNAVAILABLE<br />{error}
        </div>
      )}

      {rec && (
        <>
          {/* ── LAYER 1: ACTION ─────────────────────────────── */}

          {/* Warnings float to the top if present */}
          {warnings.length > 0 && (
            <Section title="WARNINGS">
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                {warnings.map((warning, index) => (
                  <div key={index} style={{ display: 'flex', alignItems: 'flex-start', gap: 10, padding: '10px 12px', border: '1px solid rgba(255,213,107,.35)', background: 'rgba(255,213,107,.04)' }}>
                    <span style={{ color: '#ffd56b', flexShrink: 0 }}>⚠</span>
                    <span style={{ fontSize: 13, fontWeight: 300, lineHeight: 1.5, color: 'rgba(255,213,107,.88)', fontFamily: BODY }}>{String(warning)}</span>
                  </div>
                ))}
              </div>
            </Section>
          )}

          {/* Brief status — compact header card */}
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

          {/* Rationale */}
          <Section title="RATIONALE">
            <div style={{ background: 'rgba(6,12,18,.9)', border, borderLeft: `3px solid rgba(0,187,221,.6)`, padding: '14px 15px', fontSize: 14, fontWeight: 300, lineHeight: 1.7, color: 'rgba(199,236,244,.88)', fontFamily: BODY }}>
              {rec.rationale || 'No rationale returned for this brief.'}
            </div>
          </Section>

          {/* Recommendations */}
          <Section title="RECOMMENDATIONS">
            {recommendations.length > 0
              ? <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>{recommendations.map((r, i) => <RecommendationCard key={`${r.asset}-${i}`} recommendation={r} />)}</div>
              : <div style={{ fontFamily: MONO, fontSize: 9, color: muted, letterSpacing: '.12em' }}>NO BUYS RECOMMENDED THIS WEEK</div>}
          </Section>

          {/* Manual buy checklist */}
          <ManualBuyChecklistSection checklist={manualChecklist} error={manualChecklistError} onRecordTransaction={setRecordAsset} />

          {/* Record transaction — only active after approval */}
          <Section title="RECORD MANUAL TRANSACTION">
            {!recordAsset ? (
              <div style={{ padding: '13px 14px', border, background: 'rgba(0,187,221,.02)', fontFamily: MONO, fontSize: 8, lineHeight: 1.6, color: muted, letterSpacing: '.08em' }}>
                SELECT "RECORD TRANSACTION" ON A CHECKLIST ITEM AFTER COMPLETING THE BUY MANUALLY IN YOUR BROKER.
              </div>
            ) : isApproved ? (
              <ManualBuyPanel recommendations={recommendations} briefId={rec.brief_id} initialAsset={recordAsset} />
            ) : (
              <div style={{ padding: '13px 14px', border, background: 'rgba(0,187,221,.02)', fontFamily: MONO, fontSize: 8, lineHeight: 1.6, color: muted, letterSpacing: '.08em' }}>
                APPROVE THIS BRIEF BEFORE RECORDING A MANUAL BUY.
                <div style={{ color: 'rgba(199,236,244,.55)', letterSpacing: '.04em', fontSize: 10, fontFamily: BODY, fontWeight: 300, marginTop: 4 }}>
                  Recording is only for trades already completed manually in your broker.
                </div>
              </div>
            )}
          </Section>

          {/* Brief decision — appears after action */}
          {briefStatus && (
            <Section title="BRIEF DECISION">
              <div style={{ padding: '12px 14px', border: `1px solid ${isApproved ? 'rgba(77,255,180,.35)' : briefStatus === 'rejected' ? 'rgba(255,92,122,.3)' : 'rgba(255,170,0,.22)'}`, background: isApproved ? 'rgba(77,255,180,.04)' : briefStatus === 'rejected' ? 'rgba(255,92,122,.04)' : 'rgba(255,170,0,.03)' }}>
                <div style={{ fontFamily: MONO, fontSize: 8, letterSpacing: '.16em', color: isApproved ? '#4dffb4' : briefStatus === 'rejected' ? '#ff5c7a' : '#ffcc44' }}>
                  BRIEF {briefStatus.toUpperCase()}
                </div>
                <div style={{ fontSize: 12, lineHeight: 1.55, color: 'rgba(199,236,244,.82)', marginTop: 6, fontFamily: BODY }}>
                  {isApproved ? 'Approved. Complete the buy manually in your broker, then record the execution above.'
                    : briefStatus === 'rejected' ? 'Brief rejected. No trade executed.'
                    : 'Brief deferred. No trade executed.'}
                </div>
              </div>
            </Section>
          )}

          {/* Approval buttons */}
          {canLogApproval && (
            <div style={{ borderTop: border, padding: '18px 18px 32px' }}>
              <div style={{ maxWidth: 430, margin: '0 auto' }}>
                {actionError && <div style={{ color: '#ff5c7a', fontFamily: MONO, fontSize: 8, textAlign: 'center', marginBottom: 8 }}>{actionError}</div>}
                {isApproved && <div style={{ fontFamily: MONO, fontSize: 7, letterSpacing: '.14em', color: '#4dffb4', textAlign: 'center', marginBottom: 8 }}>APPROVED · NO TRADE EXECUTED</div>}
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1.6fr', gap: 10 }}>
                  <button onClick={() => handleAction('defer')} disabled={acting} style={{ ...approvalBtnBase, fontSize: 9, border: '1px solid rgba(180,200,210,.35)', color: '#b4c8d2' }}>DEFER</button>
                  <button onClick={() => handleAction('reject')} disabled={acting} style={{ ...approvalBtnBase, fontSize: 9, border: '1px solid rgba(255,92,122,.6)', color: '#ff8fa0', textShadow: '0 0 8px rgba(255,92,122,.5)' }}>REJECT</button>
                  <button onClick={() => handleAction('approve')} disabled={acting || isApproved} style={{ ...approvalBtnBase, fontSize: 10, fontWeight: 700, letterSpacing: '.18em', border: `1px solid rgba(0,187,221,${isApproved ? '.3' : '.8'})`, color: isApproved ? 'rgba(0,187,221,.5)' : '#ffffff', textShadow: isApproved ? 'none' : '0 0 16px rgba(0,187,221,1), 0 0 32px rgba(0,187,221,.6)', animation: isApproved ? 'none' : 'phApproveGlow 2s ease-in-out infinite', cursor: (acting || isApproved) ? 'default' : 'pointer' }}>
                    {isApproved ? '✓ APPROVED' : '▶ APPROVE'}
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* ── LAYER 2: AUDIT (collapsed by default) ───────── */}
          <div style={{ borderTop: `1px solid rgba(0,187,221,.08)`, marginTop: 8 }}>
            <div style={{ padding: '10px 18px 4px', fontFamily: MONO, fontSize: 7, letterSpacing: '.22em', color: 'rgba(0,187,221,.2)' }}>AUDIT LOG</div>

            <AuditSection title="NEWS THESIS">
              <div style={{ background: 'rgba(6,12,18,.9)', border, borderLeft: `3px solid rgba(0,187,221,.6)`, padding: '14px 15px', fontSize: 14, fontWeight: 300, lineHeight: 1.7, color: newsThesis ? 'rgba(199,236,244,.88)' : 'rgba(125,188,200,.65)', fontFamily: BODY }}>
                {newsThesis || 'No live news thesis returned for this brief.'}
              </div>
            </AuditSection>

            <AuditSection title="RESEARCH CONTEXT · ADVISORY ONLY">
              {(() => {
                const legs = Array.isArray(researchContext) ? researchContext : []
                if (legs.length === 0) return <div style={{ fontFamily: MONO, fontSize: 8, color: muted, letterSpacing: '.12em' }}>NO RESEARCH CONTEXT RETURNED</div>
                const hasBlocker = legs.some((leg) => leg.evidence_status === 'BLOCKED_BY_FAIL')
                return (
                  <>
                    {hasBlocker && (
                      <div style={{ marginBottom: 10, padding: '10px 12px', border: '1px solid rgba(255,92,122,.35)', background: 'rgba(255,92,122,.04)', color: '#ff5c7a' }}>
                        <div style={{ fontFamily: MONO, fontSize: 8, letterSpacing: '.12em' }}>RESEARCH BLOCKER FOUND</div>
                        <div style={{ fontSize: 12, lineHeight: 1.5, marginTop: 4 }}>Manual review required.</div>
                      </div>
                    )}
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                      {legs.map((leg, index) => <ResearchLegRow key={`${leg.asset}-${index}`} leg={leg} />)}
                    </div>
                    {researchGateSummary && (
                      <div style={{ marginTop: 9, padding: '8px 10px', border, fontFamily: MONO, fontSize: 7, color: muted, display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 5 }}>
                        <span>WITH RESEARCH · {researchGateSummary.legs_with_research ?? 0}/{researchGateSummary.total_recommendation_legs ?? 0}</span>
                        <span>BLOCKED · {researchGateSummary.legs_blocked_by_failed_research ?? 0}</span>
                        <span style={{ gridColumn: '1/-1', marginTop: 2, color: 'rgba(0,187,221,.4)' }}>ADVISORY ONLY · ALLOCATIONS UNCHANGED</span>
                      </div>
                    )}
                    {(researchContext.length > 0 || rec?.autopilot_available) && (
                      <div style={{ marginTop: 12, padding: '9px 11px', border: '1px solid rgba(77,255,180,.18)', background: 'rgba(77,255,180,.012)' }}>
                        <div style={{ fontFamily: MONO, fontSize: 7, color: 'rgba(77,255,180,.6)', letterSpacing: '.12em', marginBottom: 7 }}>
                          PHOENIX runs research autonomously. This does not approve or execute a trade.
                        </div>
                        <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
                          <button type="button" onClick={handleFinanceAutopilot} disabled={autopilotRunning} style={{ padding: '7px 12px', border: '1px solid rgba(77,255,180,.3)', background: 'transparent', color: '#4dffb4', fontFamily: MONO, fontSize: 7, letterSpacing: '.12em', cursor: autopilotRunning ? 'wait' : 'pointer' }}>
                            {autopilotRunning ? 'RUNNING AUTOPILOT…' : 'RUN FINANCE AUTOPILOT'}
                          </button>
                          {autopilotResult && !autopilotResult.error && <span style={{ fontFamily: MONO, fontSize: 7, color: '#4dffb4' }}>{autopilotResult.total_legs} LEG(S) PROCESSED · RESEARCH ONLY</span>}
                          {autopilotResult?.error && <span style={{ fontFamily: MONO, fontSize: 7, color: '#ff5c7a' }}>AUTOPILOT ERROR</span>}
                        </div>
                      </div>
                    )}
                  </>
                )
              })()}
            </AuditSection>

            <AuditSection title="RECOMMENDATION AUDIT">
              <div style={{ border, background: 'rgba(0,187,221,.025)', padding: '11px 13px', marginBottom: 10 }}>
                <div style={{ fontFamily: MONO, fontSize: 7, letterSpacing: '.16em', color: muted }}>SELECTED ETF SLEEVE</div>
                <div style={{ fontFamily: DISPLAY, fontSize: 18, fontWeight: 700, color: '#4dffb4', marginTop: 4, overflowWrap: 'anywhere' }}>{etfVerdict.selected_ideal_etf || 'NONE SELECTED'}</div>
              </div>
              {etfCandidates.length > 0
                ? <div style={{ display: 'flex', flexDirection: 'column', gap: 9 }}>{etfCandidates.map((c, i) => <EtfCandidateCard key={`${c.sleeve || 'candidate'}-${i}`} candidate={c} />)}</div>
                : <div style={{ fontFamily: MONO, fontSize: 8, color: muted, letterSpacing: '.12em' }}>NO ETF SCORING VERDICT RETURNED</div>}
            </AuditSection>

            <AuditSection title="LANE LOGIC">
              <div style={{ display: 'flex', flexDirection: 'column', gap: 9 }}>
                <LaneCard title="CRYPTO LANE" lane={laneMandate.crypto_lane} />
                <LaneCard title="STOCK / FUND / ETF LANE" lane={laneMandate.stock_fund_etf_lane} />
              </div>
            </AuditSection>

            <AuditSection title="RISK CONTROLS">
              <RiskControls controls={laneMandate.risk_controls} />
              <div style={{ marginTop: 12, border, background: 'rgba(0,187,221,.02)', padding: '11px 12px' }}>
                <div style={{ fontFamily: MONO, fontSize: 7, letterSpacing: '.16em', color: muted, marginBottom: 7 }}>MANUAL APPROVAL SAFETY CHECKS</div>
                <TextList items={approvalSummary.safety_checks} emptyText="NO SAFETY CHECKS RETURNED" />
              </div>
              {['blocked_actions', 'fallback_actions', 'reserve_actions'].map((key) => {
                const actions = Array.isArray(approvalSummary[key]) ? approvalSummary[key] : []
                return actions.length > 0 ? (
                  <div key={key} style={{ marginTop: 8, border: '1px solid rgba(255,213,107,.18)', background: 'rgba(255,213,107,.025)', padding: '10px 12px' }}>
                    <div style={{ fontFamily: MONO, fontSize: 7, letterSpacing: '.14em', color: '#ffd56b', marginBottom: 6 }}>{humanize(key)}</div>
                    <TextList items={actions} color="rgba(255,213,107,.82)" />
                  </div>
                ) : null
              })}
            </AuditSection>

            <AuditSection title="PORTFOLIO MODE">
              <CornerCard>
                <div style={{ padding: '13px 14px' }}>
                  <div style={{ fontFamily: DISPLAY, fontSize: 18, fontWeight: 700, color: ACCENT, overflowWrap: 'anywhere' }}>{portfolioModeDetails.mode || '—'}</div>
                  <div style={{ fontFamily: MONO, fontSize: 7, letterSpacing: '.16em', color: muted, marginTop: 12, marginBottom: 7 }}>REASONS</div>
                  <TextList items={portfolioModeDetails.reasons} emptyText="NO MODE REASONS RETURNED" />
                  <div style={{ fontFamily: MONO, fontSize: 7, letterSpacing: '.16em', color: muted, marginTop: 12, marginBottom: 7 }}>GUIDANCE</div>
                  <div style={{ fontSize: 12, lineHeight: 1.55, color: 'rgba(199,236,244,.78)', fontFamily: BODY }}>{portfolioModeDetails.guidance || 'No portfolio mode guidance returned.'}</div>
                </div>
              </CornerCard>
            </AuditSection>

            <AuditSection title="ASSET TARGETS">
              <div style={{ fontFamily: MONO, fontSize: 7, letterSpacing: '.16em', color: muted, marginBottom: 8 }}>DYNAMIC</div>
              <AllocationGrid allocations={rec.dynamic_targets} />
              <div style={{ fontFamily: MONO, fontSize: 7, letterSpacing: '.16em', color: muted, marginTop: 14, marginBottom: 8 }}>SLEEVE</div>
              <AllocationGrid allocations={rec.sleeve_targets} />
            </AuditSection>

          </div>

          {!canLogApproval && (
            <div style={{ margin: '0 18px 18px', padding: 12, border, color: muted, fontFamily: MONO, fontSize: 8, letterSpacing: '.1em', textAlign: 'center' }}>APPROVAL LOGGING UNAVAILABLE FOR THIS BRIEF.</div>
          )}
        </>
      )}
    </div>
  )
}
