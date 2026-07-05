import { useEffect, useMemo, useRef, useState } from 'react'
import { CockpitShell, DataPanel, SourceStamp } from '../cockpit/CockpitPrimitives'
import { MetricLineChart } from '../cockpit/MetricLineChart'
import {
  getFinanceDataCoverage,
  getFinanceManualBuyChecklist,
  getFinancePnl,
  getFinancePerformanceHistory,
  getFinancePortfolioState,
  getFinanceRecommendation,
  getFinanceResearchMemos,
  getFinanceResearchValidationRecords,
  getFinanceSummary,
  postFinancePatchUnits,
} from '../../api/client'
import {
  buildFinanceDashboardModel,
  listFailedFinanceSources,
} from './financeDashboardModel'


const SLEEVE_META = {
  global_core_etf:   { label: 'Global Core',     description: 'Diversified world equity',       color: '#00bbdd' },
  growth_nasdaq_etf: { label: 'Growth Nasdaq',    description: 'Nasdaq growth sleeve',           color: '#4488ff' },
  quality_etf:       { label: 'Quality Factor',   description: 'Developed-market quality',       color: '#8866ff' },
  btc:               { label: 'Bitcoin',          description: 'Core crypto sleeve',             color: '#ff7722' },
  hype:              { label: 'Hyperliquid',      description: 'Phase-gated crypto sleeve',      color: '#ff4488' },
  tao:               { label: 'Bittensor',        description: 'Phase-gated crypto sleeve',      color: '#44ffaa' },
  discovery:         { label: 'Discovery',        description: 'Legacy discovery holdings',      color: '#ffaa00' },
  tactical_reserve:  { label: 'Cash Reserve',     description: 'Tactical liquidity buffer',      color: '#556677' },
}

// ─── Formatters ───────────────────────────────────────────────────────────────
function money(value) {
  const n = Number(value)
  if (!Number.isFinite(n)) return '—'
  return `€${n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
}
function percent(value) {
  const n = Number(value)
  return Number.isFinite(n) ? `${(n * 100).toFixed(1)}%` : '—'
}
function humanize(value) {
  return String(value || '').replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase())
}
// ─── Shared tokens ────────────────────────────────────────────────────────────
const T = {
  bg:      '#060c12',
  card:    '#070e15',
  accent:  '#00bbdd',
  white:   '#eef6f9',
  muted:   '#3a5a6a',
  border:  '1px solid rgba(0,187,221,0.17)',
  borderHover: '1px solid rgba(0,187,221,0.35)',
  fontMono:    "'Share Tech Mono', monospace",
  fontDisplay: "'Rajdhani', sans-serif",
  fontBody:    "'Space Grotesk', sans-serif",
}

// ─── Inline styles ────────────────────────────────────────────────────────────
const s = {
  wrap: {
    color: T.white,
    fontFamily: T.fontMono,
  },
  shell: {
    maxWidth: 1120,
    margin: '0 auto',
    padding: '0 0 80px',
  },
  sectionTag: {
    fontFamily: T.fontMono,
    fontSize: 10,
    letterSpacing: '0.3em',
    color: 'rgba(0,187,221,0.53)',
    marginBottom: 4,
  },
  sectionTitle: {
    fontFamily: T.fontDisplay,
    fontSize: 'var(--phx-type-section)',
    fontWeight: 700,
    color: T.white,
    letterSpacing: '0.035em',
    lineHeight: 1,
    margin: 0,
  },
  card: {
    background: T.card,
    border: T.border,
    borderRadius: 4,
    position: 'relative',
    overflow: 'hidden',
  },
  cardTopLine: {
    position: 'absolute',
    top: 0, left: 0, right: 0,
    height: 1,
    background: 'linear-gradient(90deg, rgba(0,187,221,0.4), rgba(0,187,221,0.1), transparent)',
    pointerEvents: 'none',
  },
}

// ─── Corner brackets ──────────────────────────────────────────────────────────
function Corners({ size = 8, color = 'rgba(0,187,221,0.35)' }) {
  const c = { position: 'absolute', width: size, height: size, borderColor: color, borderStyle: 'solid' }
  return (
    <>
      <div style={{ ...c, top: 8, left: 8, borderWidth: '1px 0 0 1px' }} />
      <div style={{ ...c, top: 8, right: 8, borderWidth: '1px 1px 0 0' }} />
      <div style={{ ...c, bottom: 8, left: 8, borderWidth: '0 0 1px 1px' }} />
      <div style={{ ...c, bottom: 8, right: 8, borderWidth: '0 1px 1px 0' }} />
    </>
  )
}

// ─── Scan line ────────────────────────────────────────────────────────────────
function ScanLine() {
  return (
    <div style={{
      position: 'absolute', top: 0, left: 0, right: 0, height: 1,
      background: 'linear-gradient(90deg, transparent, rgba(0,187,221,0.4), transparent)',
      animation: 'phScan 5s linear infinite',
      pointerEvents: 'none',
    }} />
  )
}

// ─── Header ───────────────────────────────────────────────────────────────────
function Header({ summary, checklist, recommendation, actionCopy, loading, pnlTotals, driftCount }) {
  const weekLabel = checklist?.week_label || recommendation?.week_label || '—'
  return (
    <header className="finance-hero-panel finance-hero-content phx-enter" style={{
      ...s.card,
      padding: '2rem 2.5rem 2.5rem',
      marginBottom: 0,
      borderRadius: 0,
      borderLeft: 'none',
      borderRight: 'none',
      borderTop: 'none',
    }}>
      <div className="finance-header-topbar" style={{
        position: 'absolute', inset: 0,
        backgroundImage: 'radial-gradient(circle, rgba(0,187,221,0.06) 1px, transparent 1px)',
        backgroundSize: '28px 28px',
        pointerEvents: 'none',
      }} />
      <div style={{
        position: 'absolute', top: -60, left: -40,
        width: 320, height: 220,
        background: 'radial-gradient(ellipse, rgba(0,187,221,0.05) 0%, transparent 70%)',
        pointerEvents: 'none',
      }} />
      <ScanLine />

      {/* Top bar */}
      <div style={{
        display: 'flex', justifyContent: 'space-between', alignItems: 'center',
        marginBottom: '2rem', paddingBottom: '0.75rem',
        borderBottom: '1px solid rgba(0,187,221,0.08)',
        position: 'relative',
      }}>
        <span style={{ fontFamily: T.fontMono, fontSize: 8, letterSpacing: '0.3em', color: 'rgba(0,187,221,0.4)' }}>
          PHOENIX · PERSONAL HEURISTIC OPERATING ENGINE
        </span>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <span style={{ fontFamily: T.fontMono, fontSize: 8, letterSpacing: '0.2em', color: 'rgba(0,187,221,0.27)' }}>
            {summary?.prices_refreshed_at
              ? (() => {
                  const d = new Date(summary.prices_refreshed_at)
                  const now = new Date()
                  const diffMin = Math.round((now - d) / 60000)
                  const timeStr = d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
                  const age = diffMin < 1 ? 'LIVE' : diffMin < 60 ? `${diffMin}m` : `${Math.round(diffMin / 60)}h`
                  return `PRICES ${timeStr} · ${age}`
                })()
              : summary?.as_of
                ? `W${getWeekNumber(summary.as_of)} · ${summary.as_of}`
                : weekLabel}
          </span>
          <div style={{ width: 5, height: 5, borderRadius: '50%', background: '#00cc77', boxShadow: '0 0 6px #00cc77' }} />
          <span style={{ fontFamily: T.fontMono, fontSize: 8, letterSpacing: '0.2em', color: 'rgba(0,204,119,0.53)' }}>ONLINE</span>
        </div>
      </div>

      <div style={{ position: 'relative' }}>
        <div style={s.sectionTag}>PHOENIX</div>
        <h1 className="finance-command-title" style={{ fontFamily: T.fontDisplay, fontSize: 'var(--phx-type-title)', fontWeight: 700, letterSpacing: '0.04em', lineHeight: 1, margin: '0 0 2rem' }}>
          <span style={{ display: 'block', color: '#dff0f5' }}>FINANCE</span>
          <span style={{ display: 'block', color: T.accent, textShadow: '0 0 30px rgba(0,187,221,0.27)' }}>COMMAND CENTER</span>
        </h1>

        <div style={{
          fontSize: 8, letterSpacing: '0.35em', color: 'rgba(0,187,221,0.4)',
          marginBottom: 10, display: 'flex', alignItems: 'center', gap: 8,
        }}>
          TOTAL PORTFOLIO VALUE
          <span style={{ flex: 1, height: 1, background: 'linear-gradient(90deg, rgba(0,187,221,0.13), transparent)' }} />
        </div>

        <div style={{ display: 'flex', alignItems: 'baseline', gap: 4, marginBottom: 8 }}>
          <span style={{ fontFamily: T.fontBody, fontSize: 28, fontWeight: 300, color: 'rgba(0,187,221,0.53)', lineHeight: 1 }}>€</span>
          <span className="finance-total-value" style={{
            fontFamily: T.fontBody, fontSize: 68, fontWeight: 700, color: T.accent,
            letterSpacing: '-0.04em', lineHeight: 1,
            textShadow: '0 0 40px rgba(0,187,221,0.27), 0 0 80px rgba(0,187,221,0.11)',
          }}>
            {summary?.total_invested != null
              ? Number(summary.total_invested).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
              : '—'}
          </span>
        </div>

        {pnlTotals?.has_cost_data && (() => {
          const gain = Number(pnlTotals.totals?.gain_eur)
          const gainPct = Number(pnlTotals.totals?.gain_pct)
          const isPos = gain >= 0
          const gainColor = isPos ? '#4dffb4' : '#ff5c7a'
          const gainEurStr = `${isPos ? '+' : '−'}€${Math.abs(gain).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
          const gainPctStr = `${isPos ? '+' : ''}${gainPct.toFixed(2)}%`
          return (
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 8 }}>
              <span style={{ fontFamily: T.fontMono, fontSize: 7, letterSpacing: '0.22em', color: 'rgba(0,187,221,0.3)' }}>TOTAL RETURN</span>
              <span style={{ fontFamily: T.fontMono, fontSize: 13, letterSpacing: '0.06em', color: gainColor, textShadow: isPos ? '0 0 12px rgba(77,255,180,0.35)' : '0 0 12px rgba(255,92,122,0.35)' }}>
                {gainEurStr}
              </span>
              <span style={{ fontFamily: T.fontMono, fontSize: 10, letterSpacing: '0.06em', color: isPos ? 'rgba(77,255,180,0.6)' : 'rgba(255,92,122,0.6)' }}>
                ({gainPctStr})
              </span>
            </div>
          )
        })()}

        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: '1.8rem', flexWrap: 'wrap' }}>
          <div style={{
            display: 'inline-flex', alignItems: 'center', gap: 6,
            background: 'rgba(0,187,221,0.05)', border: '1px solid rgba(0,187,221,0.13)',
            borderRadius: 2, padding: '3px 10px',
            fontFamily: T.fontMono, fontSize: 8, letterSpacing: '0.2em', color: 'rgba(0,187,221,0.4)',
          }}>
            PHASE 1 · ACCUMULATION
          </div>
          {driftCount > 0 && (
            <div style={{
              display: 'inline-flex', alignItems: 'center', gap: 5,
              background: 'rgba(255,170,0,0.08)', border: '1px solid rgba(255,170,0,0.4)',
              borderRadius: 2, padding: '3px 10px',
              fontFamily: T.fontMono, fontSize: 8, letterSpacing: '0.2em', color: 'rgba(255,170,0,0.93)',
              animation: 'phBlink 2s ease-in-out infinite',
            }}>
              {driftCount} DRIFT {driftCount === 1 ? 'ALERT' : 'ALERTS'}
            </div>
          )}
        </div>

        <div style={{ position: 'relative', paddingLeft: 14 }}>
          <div style={{
            position: 'absolute', left: 0, top: 4, bottom: 4, width: 2,
            background: 'linear-gradient(180deg, rgba(0,187,221,0.7), rgba(0,187,221,0))',
            borderRadius: 2,
          }} />
          <p style={{ fontFamily: T.fontBody, fontSize: 14, color: 'rgba(154,184,200,0.87)', lineHeight: 1.65, margin: '0 0 8px' }}>
            {loading ? 'Synchronising verified finance surfaces…' : actionCopy.replace(/^PHOENIX recommends /, 'PHOENIX recommends ')}
          </p>
          <div style={{ fontFamily: T.fontMono, fontSize: 8, letterSpacing: '0.2em', color: 'rgba(0,187,221,0.27)' }}>
            MANUAL ONLY · NOTHING HAS BEEN ORDERED OR EXECUTED
          </div>
        </div>
      </div>
    </header>
  )
}

function getWeekNumber(dateStr) {
  const d = new Date(dateStr)
  const start = new Date(d.getFullYear(), 0, 1)
  return Math.ceil(((d - start) / 86400000 + start.getDay() + 1) / 7)
}

// ─── Authorization Core ───────────────────────────────────────────────────────
function AuthorizationCore({ checklist, recommendation }) {
  const weekBudget = checklist?.week_budget ?? recommendation?.week_budget
  const weekLabel = checklist?.week_label ?? recommendation?.week_label
  const checklistItems = Array.isArray(checklist?.checklist_items) ? checklist.checklist_items : []
  const deploymentSymbols = checklistItems.map(i => i?.symbol || i?.ticker).filter(Boolean).join(' + ')
  const manualBuyCount = checklistItems.length
  const briefStatus = checklist?.brief_status ?? recommendation?.brief_status
  const weekDone = recommendation?.week_done === true
  const isPending = !weekDone && checklist?.requires_approval !== false && briefStatus !== 'approved' && briefStatus !== 'rejected'

  const C = 2 * Math.PI * 65
  const arcStyle = {
    fill: 'none', strokeWidth: 18, strokeLinecap: 'butt',
    strokeDasharray: `${C * 0.72} ${C}`,
    stroke: T.accent,
    filter: 'drop-shadow(0 0 4px rgba(0,187,221,0.8))',
    transformOrigin: '90px 90px',
    animation: 'phArcSpin 6s linear infinite',
  }
  const outerArcStyle = {
    fill: 'none', strokeWidth: 1, strokeLinecap: 'butt',
    strokeDasharray: '2 8',
    stroke: 'rgba(0,187,221,0.13)',
    transformOrigin: '90px 90px',
    animation: 'phArcSpin 20s linear infinite reverse',
  }

  return (
    <div style={{ ...s.card, padding: '2.5rem 2rem 2rem' }}>
      <div style={s.cardTopLine} />
      <Corners />
      <span style={{ position: 'absolute', top: 14, right: 16, fontFamily: T.fontMono, fontSize: 7, color: 'rgba(0,187,221,0.2)', letterSpacing: '0.1em' }}>AC-001</span>

      <div style={{ fontFamily: T.fontMono, fontSize: 'var(--phx-type-card-header)', fontWeight: 700, letterSpacing: '0.22em', color: 'rgba(0,187,221,0.87)', textAlign: 'center', marginBottom: 4 }}>AUTHORIZATION CORE</div>
      <div style={{ fontFamily: T.fontMono, fontSize: 8, letterSpacing: '0.2em', color: 'rgba(0,187,221,0.53)', textAlign: 'center', marginBottom: '1.2rem' }}>WEEKLY DEPLOYMENT</div>

      <div style={{ position: 'relative', width: 200, height: 200, margin: '0 auto 1rem' }}>
        <svg width="200" height="200" viewBox="0 0 180 180" style={{ position: 'absolute', top: 0, left: 0, width: '100%', height: '100%' }}>
          <circle cx="90" cy="90" r="65" fill="none" stroke="rgba(0,187,221,0.07)" strokeWidth="18" />
          <circle cx="90" cy="90" r="65" fill="none" stroke="rgba(0,187,221,0.13)" strokeWidth="1" strokeDasharray="4 26" />
          <circle cx="90" cy="90" r="94" style={outerArcStyle} />
          <circle cx="90" cy="90" r="65" style={arcStyle} strokeDashoffset={C * 0.25} />
          <circle cx="90" cy="90" r="74" fill="none" stroke="rgba(0,187,221,0.07)" strokeWidth="2" />
        </svg>
        <div style={{ position: 'absolute', top: '50%', left: '50%', transform: 'translate(-50%, -50%)', textAlign: 'center', width: 140 }}>
          {weekDone ? (
            <>
              <div style={{ fontFamily: T.fontBody, fontSize: 28, fontWeight: 700, color: '#00dc78', letterSpacing: '-0.02em', lineHeight: 1, textShadow: '0 0 20px rgba(0,220,120,0.4)' }}>
                {money(recommendation?.total_deployed_eur ?? weekBudget)}
              </div>
              <div style={{ fontFamily: T.fontMono, fontSize: 9, color: 'rgba(0,220,120,0.67)', letterSpacing: '0.15em', marginTop: 6 }}>
                DEPLOYED
              </div>
            </>
          ) : (
            <>
              <div style={{ fontFamily: T.fontBody, fontSize: 36, fontWeight: 700, color: T.accent, letterSpacing: '-0.02em', lineHeight: 1, textShadow: '0 0 20px rgba(0,187,221,0.4)' }}>
                {money(weekBudget)}
              </div>
              <div style={{ fontFamily: T.fontMono, fontSize: 9, color: 'rgba(0,187,221,0.67)', letterSpacing: '0.15em', marginTop: 6 }}>
                {manualBuyCount} MANUAL {manualBuyCount === 1 ? 'BUY' : 'BUYS'}
              </div>
            </>
          )}
        </div>
      </div>

      {weekDone ? (
        <div style={{
          display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
          background: 'rgba(0,220,120,0.07)', border: '1px solid rgba(0,220,120,0.35)',
          borderRadius: 2, padding: '6px 14px', margin: '0 auto 1.2rem', width: 'fit-content',
        }}>
          <div style={{ width: 5, height: 5, borderRadius: '50%', background: '#00dc78', boxShadow: '0 0 6px #00dc78' }} />
          <span style={{ fontFamily: T.fontMono, fontSize: 10, letterSpacing: '0.2em', color: 'rgba(0,220,120,0.93)' }}>{weekLabel} DEPLOYED</span>
        </div>
      ) : briefStatus === 'approved' ? (
        <div style={{
          display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
          background: 'rgba(0,220,120,0.07)', border: '1px solid rgba(0,220,120,0.35)',
          borderRadius: 2, padding: '6px 14px', margin: '0 auto 1.2rem', width: 'fit-content',
        }}>
          <div style={{ width: 5, height: 5, borderRadius: '50%', background: '#00dc78', boxShadow: '0 0 6px #00dc78' }} />
          <span style={{ fontFamily: T.fontMono, fontSize: 10, letterSpacing: '0.2em', color: 'rgba(0,220,120,0.93)' }}>{weekLabel} APPROVED</span>
        </div>
      ) : briefStatus === 'rejected' ? (
        <div style={{
          display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
          background: 'rgba(0,187,221,0.04)', border: '1px solid rgba(0,187,221,0.15)',
          borderRadius: 2, padding: '6px 14px', margin: '0 auto 1.2rem', width: 'fit-content',
        }}>
          <div style={{ width: 5, height: 5, borderRadius: '50%', background: 'rgba(0,187,221,0.4)' }} />
          <span style={{ fontFamily: T.fontMono, fontSize: 10, letterSpacing: '0.2em', color: 'rgba(0,187,221,0.4)' }}>{weekLabel} REVIEWED</span>
        </div>
      ) : isPending ? (
        <div style={{
          display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
          background: 'rgba(255,170,0,0.07)', border: '1px solid rgba(255,170,0,0.4)',
          borderRadius: 2, padding: '6px 14px', margin: '0 auto 1.2rem', width: 'fit-content',
        }}>
          <div style={{ width: 5, height: 5, borderRadius: '50%', background: '#ffaa00', boxShadow: '0 0 6px #ffaa00', animation: 'phBlink 1.2s ease-in-out infinite' }} />
          <span style={{ fontFamily: T.fontMono, fontSize: 10, letterSpacing: '0.2em', color: 'rgba(255,170,0,0.93)' }}>PENDING APPROVAL</span>
        </div>
      ) : null}

      <div style={{ borderTop: '1px solid rgba(0,187,221,0.1)', paddingTop: '1rem', display: 'flex', flexDirection: 'column', gap: 8 }}>
        {checklistItems.map((item, i) => (
          <div key={i} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <div>
              <div style={{ fontFamily: T.fontMono, fontSize: 10, letterSpacing: '0.15em', color: 'rgba(0,187,221,0.8)' }}>
                {item?.symbol || item?.ticker || humanize(item?.asset)}
              </div>
              <div style={{ fontFamily: T.fontMono, fontSize: 8, color: 'rgba(0,187,221,0.33)', letterSpacing: '0.1em', marginTop: 2 }}>
                {item?.route?.toUpperCase() || ''} · {item?.platform || ''}
              </div>
            </div>
            <div style={{ fontFamily: T.fontBody, fontSize: 15, fontWeight: 600, color: T.accent, textShadow: '0 0 12px rgba(0,187,221,0.4)' }}>
              {money(item?.amount)}
            </div>
          </div>
        ))}
      </div>

      <div style={{ fontFamily: T.fontMono, fontSize: 7, letterSpacing: '0.15em', color: 'rgba(0,187,221,0.2)', textAlign: 'center', marginTop: '1rem' }}>
        {briefStatus === 'approved'
          ? `${weekLabel || 'THIS WEEK'} APPROVED · NEXT RECOMMENDATION ${recommendation?.next_window || 'NEXT WEEK'}`
          : 'MANUAL ONLY · NO TRADES EXECUTED · APPROVAL REQUIRED'}
      </div>
    </div>
  )
}

// ─── Manual Action Card ───────────────────────────────────────────────────────
function ManualActionCard({ item, index, onOpenBrief }) {
  const verified = item?.resolved_candidate?.broker_availability_status === 'public_verified'
  const symbol = item?.symbol || item?.ticker

  return (
    <article style={{ ...s.card, display: 'flex', flexDirection: 'column' }}>
      <div style={s.cardTopLine} />
      <div style={{ position: 'absolute', width: 10, height: 10, bottom: 8, right: 8, borderRight: '1px solid rgba(0,187,221,0.33)', borderBottom: '1px solid rgba(0,187,221,0.33)' }} />

      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '10px 14px 8px', borderBottom: '1px solid rgba(0,187,221,0.07)' }}>
        <div style={{ display: 'flex', gap: 6 }}>
          <span style={{ fontFamily: T.fontMono, fontSize: 7, letterSpacing: '0.2em', color: 'rgba(0,187,221,0.67)', background: 'rgba(0,187,221,0.08)', border: '1px solid rgba(0,187,221,0.2)', borderRadius: 2, padding: '2px 7px' }}>
            {humanize(item?.route || item?.asset).toUpperCase()} LANE
          </span>
          {verified
            ? <span style={{ fontFamily: T.fontMono, fontSize: 7, letterSpacing: '0.15em', color: 'rgba(0,204,119,0.67)', background: 'rgba(0,204,119,0.08)', border: '1px solid rgba(0,204,119,0.2)', borderRadius: 2, padding: '2px 7px' }}>✓ PUBLIC VERIFIED</span>
            : <span style={{ fontFamily: T.fontMono, fontSize: 7, letterSpacing: '0.2em', color: 'rgba(0,187,221,0.67)', background: 'rgba(0,187,221,0.08)', border: '1px solid rgba(0,187,221,0.2)', borderRadius: 2, padding: '2px 7px' }}>MANUAL ROUTE</span>}
        </div>
        <span style={{ fontFamily: T.fontMono, fontSize: 8, letterSpacing: '0.2em', color: 'rgba(0,187,221,0.33)' }}>STEP {index + 1}</span>
      </div>

      {/* Body */}
      <div style={{ padding: '16px 14px 14px', flex: 1 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 14 }}>
          <div>
            <div style={{ fontFamily: T.fontDisplay, fontSize: 28, fontWeight: 700, color: '#dff0f5', letterSpacing: '0.02em', lineHeight: 1 }}>
              {symbol ? `BUY ${symbol}` : 'INSTRUMENT UNAVAILABLE'}
            </div>
            <div style={{ fontFamily: T.fontMono, fontSize: 8, letterSpacing: '0.1em', color: 'rgba(0,187,221,0.4)', marginTop: 4 }}>
              {(item?.instrument_display_name || humanize(item?.asset) || '').toUpperCase()}
            </div>
          </div>
          <div style={{ textAlign: 'right' }}>
            <div style={{ fontFamily: T.fontBody, fontSize: 28, fontWeight: 700, color: T.accent, letterSpacing: '-0.02em', lineHeight: 1, textShadow: '0 0 20px rgba(0,187,221,0.33)' }}>
              {money(item?.amount)}
            </div>
            <div style={{ fontFamily: T.fontMono, fontSize: 7, letterSpacing: '0.2em', color: 'rgba(0,187,221,0.4)', marginTop: 3 }}>MANUAL BUY</div>
          </div>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginBottom: 14 }}>
          {[['PLATFORM', item?.platform || '—'], ['TICKER', symbol || '—']].map(([label, value]) => (
            <div key={label} style={{ background: 'rgba(10,24,37,1)', border: '1px solid rgba(0,187,221,0.1)', borderRadius: 3, padding: '8px 10px' }}>
              <div style={{ fontFamily: T.fontMono, fontSize: 7, letterSpacing: '0.2em', color: 'rgba(0,187,221,0.4)', marginBottom: 4 }}>{label}</div>
              <div style={{ fontFamily: T.fontBody, fontSize: 13, fontWeight: 500, color: '#c8e4ee' }}>{value}</div>
            </div>
          ))}
        </div>

        <div style={{ borderLeft: '2px solid rgba(0,187,221,0.33)', paddingLeft: 10 }}>
          <p style={{ fontFamily: T.fontBody, fontSize: 12, color: 'rgba(143,184,200,0.87)', lineHeight: 1.6, margin: 0 }}>
            {item?.broker_instruction || 'No manual broker instruction was returned. Do not place an order.'}
          </p>
        </div>
      </div>

      {/* Footer */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '10px 14px', borderTop: '1px solid rgba(0,187,221,0.07)' }}>
        <button
          type="button"
          onClick={onOpenBrief}
          style={{ fontFamily: T.fontMono, fontSize: 8, letterSpacing: '0.25em', color: 'rgba(0,187,221,0.67)', background: 'none', border: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 8, padding: 0 }}
        >
          OPEN MANUAL WORKFLOW
          <span style={{ display: 'inline-block', width: 20, height: 1, background: 'rgba(0,187,221,0.4)', position: 'relative', top: -1 }} />
          →
        </button>
      </div>
    </article>
  )
}

// ─── Instrument Resolution ────────────────────────────────────────────────────
function InstrumentResolution({ researchWinner, checklistCandidate, researchSymbol, checklistSymbol, qualityCoverage }) {
  if (!researchWinner || !checklistCandidate) return null
  return (
    <section style={{ padding: '2rem 2rem 0' }}>
      <div style={s.sectionTag}>[ PHASE 1 · VERIFIED ROUTING ]</div>
      <div style={{ ...s.sectionTitle, marginBottom: '1.2rem' }}>INSTRUMENT RESOLUTION</div>
      <div style={{ ...s.card }}>
        <div style={s.cardTopLine} />
        <div className="finance-resolution-grid" style={{ display: 'grid', gridTemplateColumns: '1fr auto 1fr' }}>
          {/* Left */}
          <div style={{ padding: '1.5rem', borderRight: '1px solid rgba(0,187,221,0.07)' }}>
            <div style={{ fontFamily: T.fontMono, fontSize: 8, letterSpacing: '0.25em', color: 'rgba(0,187,221,0.33)', marginBottom: 10 }}>RESEARCH WINNER</div>
            <div style={{ fontFamily: T.fontDisplay, fontSize: 38, fontWeight: 700, letterSpacing: '0.02em', color: 'rgba(138,184,200,0.87)', lineHeight: 1, marginBottom: 6 }}>{researchSymbol || '—'}</div>
            <div style={{ fontFamily: T.fontBody, fontSize: 11, color: 'rgba(74,106,122,0.87)', lineHeight: 1.5, marginBottom: 14 }}>{researchWinner.label || '—'}</div>
            <div style={{ display: 'inline-flex', alignItems: 'center', gap: 6, borderRadius: 2, padding: '4px 10px', fontSize: 8, letterSpacing: '0.2em', border: '1px solid rgba(255,255,255,0.07)', color: 'rgba(74,106,122,0.87)', fontFamily: T.fontMono }}>
              <div style={{ width: 4, height: 4, borderRadius: '50%', background: 'rgba(74,106,122,0.87)' }} /> {humanize(researchWinner.broker_availability_status || 'verification unknown').toUpperCase()}
            </div>
          </div>

          {/* Bridge */}
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '1rem 1.5rem', gap: 10, minWidth: 90 }}>
            <div style={{ display: 'flex', alignItems: 'center' }}>
              <div style={{ width: 28, height: 1, background: 'linear-gradient(90deg, rgba(0,187,221,0.27), rgba(0,187,221,0.53))' }} />
              <div style={{ width: 0, height: 0, borderTop: '4px solid transparent', borderBottom: '4px solid transparent', borderLeft: '6px solid rgba(0,187,221,0.53)' }} />
            </div>
            <div style={{ fontFamily: T.fontMono, fontSize: 7, letterSpacing: '0.18em', color: 'rgba(0,187,221,0.33)', textAlign: 'center', lineHeight: 1.6 }}>RESOLVED<br />TO VERIFIED</div>
          </div>

          {/* Right */}
          <div style={{ padding: '1.5rem' }}>
            <div style={{ fontFamily: T.fontMono, fontSize: 8, letterSpacing: '0.25em', color: 'rgba(0,187,221,0.33)', marginBottom: 10 }}>CHECKLIST CANDIDATE</div>
            <div style={{ fontFamily: T.fontDisplay, fontSize: 38, fontWeight: 700, letterSpacing: '0.02em', color: T.accent, lineHeight: 1, marginBottom: 6, textShadow: '0 0 24px rgba(0,187,221,0.27)' }}>{checklistSymbol || '—'}</div>
            <div style={{ fontFamily: T.fontBody, fontSize: 11, color: 'rgba(74,106,122,0.87)', lineHeight: 1.5, marginBottom: 14 }}>{checklistCandidate.label || '—'}</div>
            <div style={{ display: 'inline-flex', alignItems: 'center', gap: 6, borderRadius: 2, padding: '4px 10px', fontSize: 8, letterSpacing: '0.2em', border: '1px solid rgba(0,204,119,0.2)', color: 'rgba(0,204,119,0.67)', fontFamily: T.fontMono, background: 'rgba(0,204,119,0.05)' }}>
              <div style={{ width: 4, height: 4, borderRadius: '50%', background: '#00cc77', boxShadow: '0 0 5px #00cc77' }} /> {humanize(checklistCandidate.broker_availability_status || 'verification unknown').toUpperCase()}
            </div>
          </div>
        </div>

        {/* Footer */}
        <div style={{ borderTop: '1px solid rgba(0,187,221,0.06)', padding: '10px 1.5rem', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div style={{ fontFamily: T.fontMono, fontSize: 7, letterSpacing: '0.18em', color: 'rgba(0,187,221,0.2)' }}>
            PHASE 1 · <strong style={{ color: 'rgba(0,187,221,0.33)' }}>LIGHTYEAR PUBLIC-VERIFIED INSTRUMENTS ONLY</strong>
          </div>
          <div style={{ fontFamily: T.fontMono, fontSize: 7, letterSpacing: '0.18em', color: 'rgba(0,187,221,0.2)' }}>
            BACKEND DECISION · NOT RECOMPUTED BY PHOENIX
          </div>
        </div>
        {qualityCoverage.selection_gap_reason && (
          <div style={{ borderTop: '1px solid rgba(0,187,221,0.06)', padding: '12px 1.5rem', fontFamily: T.fontBody, fontSize: 12, lineHeight: 1.55, color: 'rgba(154,184,200,0.87)' }}>
            {qualityCoverage.selection_gap_reason}
          </div>
        )}
      </div>
    </section>
  )
}

// ─── Unit Correction Panel ────────────────────────────────────────────────────
function UnitCorrectionPanel({ portfolioState, onFixed }) {
  const [open, setOpen]       = useState(false)
  const [editAsset, setEditAsset] = useState(null)
  const [editUnits, setEditUnits] = useState('')
  const [editHoldings, setEditHoldings] = useState('')
  const [busy, setBusy]       = useState(false)
  const [msg, setMsg]         = useState(null)

  const units   = portfolioState?.units || {}
  const holdings = portfolioState?.holdings || {}

  const rows = Object.entries(units).filter(([k, v]) => v != null && v > 0 && k !== '_note')

  if (!rows.length) return null

  function startEdit(asset) {
    setEditAsset(asset)
    setEditUnits(String(units[asset] ?? ''))
    setEditHoldings(String(holdings[asset] ?? ''))
    setMsg(null)
  }

  async function applyCorrection() {
    if (!editAsset) return
    const u = parseFloat(editUnits)
    const h = editHoldings !== '' ? parseFloat(editHoldings) : undefined
    if (!Number.isFinite(u) || u < 0) { setMsg({ err: true, text: 'Invalid units value.' }); return }
    setBusy(true)
    try {
      const res = await postFinancePatchUnits(editAsset, u, h, 'Manual unit correction via dashboard')
      setMsg({ err: false, text: res.message || 'Correction applied.' })
      setEditAsset(null)
      onFixed()
    } catch (e) {
      setMsg({ err: true, text: e.message || 'Correction failed.' })
    } finally {
      setBusy(false)
    }
  }

  return (
    <section style={{ padding: '1rem 2rem 0' }}>
      <div
        onClick={() => setOpen(o => !o)}
        style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', cursor: 'pointer', padding: '10px 14px', border: '1px solid rgba(0,187,221,0.1)', background: 'rgba(0,187,221,0.03)' }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <span style={{ fontFamily: T.fontMono, fontSize: 7, letterSpacing: '0.25em', color: 'rgba(0,187,221,0.4)' }}>[ DATA CORRECTION ]</span>
          <span style={{ fontFamily: T.fontDisplay, fontSize: 13, fontWeight: 600, color: 'rgba(184,216,232,0.6)', letterSpacing: '0.06em' }}>UNIT COUNTS · {rows.length} TRACKED</span>
        </div>
        <span style={{ fontFamily: T.fontMono, fontSize: 9, color: 'rgba(0,187,221,0.3)', transform: open ? 'rotate(180deg)' : 'none', transition: 'transform 0.2s' }}>▼</span>
      </div>

      {open && (
        <div style={{ border: '1px solid rgba(0,187,221,0.1)', borderTop: 'none', background: 'rgba(0,0,0,0.2)' }}>
          {rows.map(([asset, unitCount]) => {
            const hval = holdings[asset]
            const isEditing = editAsset === asset
            const impliedPrice = unitCount > 0 && hval > 0 ? hval / unitCount : null
            return (
              <div key={asset} style={{ padding: '10px 14px', borderBottom: '1px solid rgba(0,187,221,0.05)' }}>
                {!isEditing ? (
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <div>
                      <span style={{ fontFamily: T.fontMono, fontSize: 9, letterSpacing: '0.1em', color: 'rgba(0,187,221,0.67)' }}>{asset}</span>
                      <span style={{ fontFamily: T.fontMono, fontSize: 8, color: 'rgba(90,128,144,0.67)', marginLeft: 10 }}>
                        {unitCount} units · {money(hval)}
                        {impliedPrice ? ` · ~${money(impliedPrice)}/unit` : ''}
                      </span>
                    </div>
                    <div
                      onClick={() => startEdit(asset)}
                      style={{ fontFamily: T.fontMono, fontSize: 7, letterSpacing: '0.18em', color: 'rgba(0,187,221,0.5)', border: '1px solid rgba(0,187,221,0.2)', padding: '3px 8px', cursor: 'pointer', userSelect: 'none' }}
                    >
                      EDIT
                    </div>
                  </div>
                ) : (
                  <div>
                    <div style={{ fontFamily: T.fontMono, fontSize: 9, letterSpacing: '0.1em', color: '#00bbdd', marginBottom: 8 }}>{asset}</div>
                    <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'flex-end' }}>
                      <div>
                        <div style={{ fontFamily: T.fontMono, fontSize: 7, color: 'rgba(0,187,221,0.4)', marginBottom: 3 }}>UNITS</div>
                        <input
                          value={editUnits}
                          onChange={e => setEditUnits(e.target.value)}
                          style={{ fontFamily: T.fontMono, fontSize: 10, color: '#eef6f9', background: 'rgba(0,0,0,0.5)', border: '1px solid rgba(0,187,221,0.3)', padding: '5px 8px', width: 140, outline: 'none' }}
                        />
                      </div>
                      <div>
                        <div style={{ fontFamily: T.fontMono, fontSize: 7, color: 'rgba(0,187,221,0.4)', marginBottom: 3 }}>HOLDINGS EUR (optional)</div>
                        <input
                          value={editHoldings}
                          onChange={e => setEditHoldings(e.target.value)}
                          placeholder="leave blank to keep"
                          style={{ fontFamily: T.fontMono, fontSize: 10, color: '#eef6f9', background: 'rgba(0,0,0,0.5)', border: '1px solid rgba(0,187,221,0.2)', padding: '5px 8px', width: 180, outline: 'none' }}
                        />
                      </div>
                      <div style={{ display: 'flex', gap: 6 }}>
                        <div
                          onClick={busy ? null : applyCorrection}
                          style={{ fontFamily: T.fontMono, fontSize: 7, letterSpacing: '0.18em', color: busy ? 'rgba(0,187,221,0.3)' : '#4dffb4', border: `1px solid ${busy ? 'rgba(0,187,221,0.15)' : 'rgba(77,255,180,0.3)'}`, padding: '6px 12px', cursor: busy ? 'default' : 'pointer', userSelect: 'none' }}
                        >
                          {busy ? 'SAVING…' : 'APPLY'}
                        </div>
                        <div
                          onClick={() => { setEditAsset(null); setMsg(null) }}
                          style={{ fontFamily: T.fontMono, fontSize: 7, letterSpacing: '0.18em', color: 'rgba(0,187,221,0.4)', border: '1px solid rgba(0,187,221,0.15)', padding: '6px 12px', cursor: 'pointer', userSelect: 'none' }}
                        >
                          CANCEL
                        </div>
                      </div>
                    </div>
                    {msg && (
                      <div style={{ fontFamily: T.fontMono, fontSize: 8, marginTop: 6, color: msg.err ? '#ff5c7a' : '#4dffb4' }}>{msg.text}</div>
                    )}
                  </div>
                )}
              </div>
            )
          })}
          <div style={{ padding: '8px 14px', fontFamily: T.fontMono, fontSize: 7, letterSpacing: '0.15em', color: 'rgba(0,187,221,0.2)' }}>
            AFTER CORRECTION · RUN REFRESH PRICES TO UPDATE EUR VALUES
          </div>
        </div>
      )}
    </section>
  )
}

// ─── Portfolio Snapshot ───────────────────────────────────────────────────────
function PortfolioSnapshot({ sleeves, total, asOf }) {
  const svgRef = useRef(null)
  const animatedRef = useRef(false)

  const donutSegments = useMemo(() => {
    const C = 2 * Math.PI * 65
    const active = sleeves.filter(s => Number(s.current_weight) > 0)
    let cumulative = 0
    return active.map(sleeve => {
      const pct = Number(sleeve.current_weight) * 100
      const len = (pct / 100) * C
      const endOffset = C / 4 - cumulative
      const startOffset = endOffset + len
      const meta = SLEEVE_META[sleeve.name] || { color: '#445566' }
      cumulative += len
      return { len, C, endOffset, startOffset, color: meta.color, name: sleeve.name }
    })
  }, [sleeves])

  useEffect(() => {
    if (animatedRef.current || !svgRef.current) return
    animatedRef.current = true
    const circles = svgRef.current.querySelectorAll('.ph-donut-seg')
    circles.forEach((circle, i) => {
      const seg = donutSegments[i]
      if (!seg) return
      circle.style.strokeDashoffset = seg.startOffset
      circle.style.strokeDasharray = `${seg.len} ${seg.C}`
      setTimeout(() => {
        circle.style.transition = `stroke-dashoffset 0.9s cubic-bezier(0.4,0,0.2,1) ${i * 0.08}s`
        circle.style.strokeDashoffset = seg.endOffset
      }, 100)
    })
  }, [donutSegments])

  const activeMeta = Object.entries(SLEEVE_META).filter(([key]) =>
    sleeves.some(s => s.name === key && Number(s.current_weight) > 0)
  )

  return (
    <section style={{ padding: '2rem 2rem 0' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: '1.5rem' }}>
        <div>
          <div style={s.sectionTag}>[ PORTFOLIO SNAPSHOT ]</div>
          <div style={s.sectionTitle}>CURRENT ALLOCATION</div>
        </div>
        <span style={{ fontFamily: T.fontMono, fontSize: 8, letterSpacing: '0.2em', color: 'rgba(0,187,221,0.27)' }}>
          CANONICAL STATE · {asOf || '—'}
        </span>
      </div>

      <div className="finance-portfolio-grid" style={{ ...s.card, display: 'grid', gridTemplateColumns: '210px 1fr' }}>
        <div style={s.cardTopLine} />

        {/* Chart side */}
        <div style={{ padding: '1.5rem', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', borderRight: '1px solid rgba(0,187,221,0.07)' }}>
          <div style={{ position: 'relative', width: 160, height: 160 }}>
            <svg ref={svgRef} width="160" height="160" viewBox="0 0 180 180" style={{ position: 'absolute', top: 0, left: 0, width: '100%', height: '100%' }}>
              <circle cx="90" cy="90" r="65" fill="none" stroke="rgba(0,187,221,0.05)" strokeWidth="18" />
              {donutSegments.map((seg, i) => (
                <circle
                  key={i}
                  className="ph-donut-seg"
                  cx="90" cy="90" r="65"
                  fill="none"
                  stroke={seg.color}
                  strokeWidth="18"
                  strokeLinecap="butt"
                  style={{ filter: `drop-shadow(0 0 5px ${seg.color}88)` }}
                />
              ))}
            </svg>
            <div style={{ position: 'absolute', top: '50%', left: '50%', transform: 'translate(-50%,-50%)', textAlign: 'center', pointerEvents: 'none' }}>
              <div style={{ fontFamily: T.fontMono, fontSize: 7, letterSpacing: '0.25em', color: 'rgba(0,187,221,0.33)', marginBottom: 4 }}>ALLOCATION</div>
              <div style={{ fontFamily: T.fontBody, fontSize: 20, fontWeight: 700, color: T.accent, letterSpacing: '-0.02em', textShadow: '0 0 16px rgba(0,187,221,0.27)' }}>
                {money(total)}
              </div>
              <div style={{ fontFamily: T.fontMono, fontSize: 7, letterSpacing: '0.15em', color: 'rgba(0,187,221,0.27)', marginTop: 2 }}>{sleeves.length} SLEEVES</div>
            </div>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginTop: '1.2rem', width: '100%' }}>
            {activeMeta.map(([key, meta]) => (
              <div key={key} style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                <div style={{ width: 6, height: 6, borderRadius: '50%', background: meta.color, boxShadow: `0 0 4px ${meta.color}`, flexShrink: 0 }} />
                <span style={{ fontFamily: T.fontMono, fontSize: 8, letterSpacing: '0.1em', color: 'rgba(106,138,154,0.87)' }}>{meta.label}</span>
              </div>
            ))}
          </div>
        </div>

        {/* Sleeve list */}
        <div>
          {sleeves.map(sleeve => {
            const meta = SLEEVE_META[sleeve.name] || { label: humanize(sleeve.name), description: 'Portfolio sleeve', color: '#445566' }
            const isActive = Number(sleeve.current_weight) > 0
            return (
              <div key={sleeve.name} style={{ display: 'grid', gridTemplateColumns: '1fr auto', alignItems: 'center', padding: '11px 16px', borderBottom: '1px solid rgba(0,187,221,0.04)', position: 'relative' }}>
                <div style={{ position: 'absolute', left: 0, top: 0, bottom: 0, width: 2, background: isActive ? meta.color : 'rgba(0,187,221,0.07)' }} />
                <div>
                  <div style={{ fontFamily: T.fontBody, fontSize: 13, fontWeight: 500, color: '#c8e4ee', marginBottom: 2 }}>{meta.label}</div>
                  <div style={{ fontFamily: T.fontMono, fontSize: 8, letterSpacing: '0.1em', color: 'rgba(58,90,106,0.87)', marginBottom: 2 }}>{meta.description}</div>
                  <div style={{ fontFamily: T.fontMono, fontSize: 7, letterSpacing: '0.15em', color: 'rgba(0,187,221,0.2)' }}>{sleeve.name}</div>
                </div>
                <div style={{ textAlign: 'right' }}>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: 6 }}>
                    {sleeve.band_status === 'above_max' && isActive && (
                      <span style={{ fontFamily: T.fontMono, fontSize: 6, letterSpacing: '0.12em', padding: '2px 5px', border: '1px solid rgba(255,92,122,.35)', color: '#ff5c7a', background: 'rgba(255,92,122,.07)' }}>OVER</span>
                    )}
                    {sleeve.band_status === 'below_min' && isActive && (
                      <span style={{ fontFamily: T.fontMono, fontSize: 6, letterSpacing: '0.12em', padding: '2px 5px', border: '1px solid rgba(255,213,107,.35)', color: '#ffd56b', background: 'rgba(255,213,107,.07)' }}>UNDER</span>
                    )}
                    <div style={{ fontFamily: T.fontBody, fontSize: 18, fontWeight: 700, letterSpacing: '-0.02em', lineHeight: 1, color: !isActive ? 'rgba(42,74,90,0.87)' : sleeve.band_status === 'above_max' ? '#ff5c7a' : sleeve.band_status === 'below_min' ? '#ffd56b' : '#4dffb4' }}>
                      {percent(sleeve.current_weight)}
                    </div>
                  </div>
                  <div style={{ fontFamily: T.fontBody, fontSize: 9, color: 'rgba(90,122,138,0.87)', marginTop: 2 }}>{money(sleeve.value)}</div>
                  <div style={{ fontFamily: T.fontMono, fontSize: 7, letterSpacing: '0.12em', color: 'rgba(0,187,221,0.2)', marginTop: 2 }}>TARGET {percent(sleeve.target_weight)}</div>
                </div>
              </div>
            )
          })}
        </div>
      </div>
    </section>
  )
}

// ─── Advanced Audit ───────────────────────────────────────────────────────────
function AdvancedAudit({ memos, records, qualityCoverage, etfAsset, researchSymbol, checklistSymbol, evidenceLabel, onNav }) {
  const [open, setOpen] = useState(false)
  const candidates = qualityCoverage?.candidates || []
  const passCount = records.filter(r => r.status === 'PASS').length

  return (
    <section style={{ padding: '2rem 2rem 0' }}>
      <div style={{ ...s.card }}>
        <div style={s.cardTopLine} />

        {/* Header row */}
        <button
          type="button"
          onClick={() => setOpen(o => !o)}
          aria-expanded={open}
          style={{ width: '100%', border: 0, background: 'transparent', textAlign: 'left', color: 'inherit', display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '14px 18px', cursor: 'pointer' }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <span style={{ fontFamily: T.fontMono, fontSize: 8, letterSpacing: '0.25em', color: 'rgba(0,187,221,0.67)' }}>[ ADVANCED AUDIT ]</span>
            <span style={{ fontFamily: T.fontDisplay, fontSize: 17, fontWeight: 600, color: 'rgba(184,216,232,0.87)', letterSpacing: '0.05em' }}>Research, validation and candidate comparison</span>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <span style={{ fontFamily: T.fontMono, fontSize: 8, letterSpacing: '0.2em', color: 'rgba(0,204,119,0.67)', background: 'rgba(0,204,119,0.05)', border: '1px solid rgba(0,204,119,0.2)', borderRadius: 2, padding: '3px 8px' }}>
              EVIDENCE {evidenceLabel}
            </span>
            <span style={{ color: 'rgba(0,187,221,0.4)', fontSize: 12, display: 'flex', transform: open ? 'rotate(180deg)' : 'none', transition: 'transform 0.3s' }}>
              ▼
            </span>
          </div>
        </button>

        {open && (
          <div style={{ borderTop: '1px solid rgba(0,187,221,0.07)' }}>
            <div className="finance-audit-grid" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr' }}>
              {/* Memos */}
              <div style={{ padding: '1.2rem 1.5rem', borderRight: '1px solid rgba(0,187,221,0.06)' }}>
                <div style={{ fontFamily: T.fontMono, fontSize: 8, letterSpacing: '0.25em', color: 'rgba(0,187,221,0.53)', marginBottom: 12 }}>RESEARCH MEMOS · ADVISORY ONLY</div>
                {memos.length ? memos.map(memo => (
                  <div key={memo.id} style={{ padding: '10px 0', borderBottom: '1px solid rgba(0,187,221,0.04)' }}>
                    <div style={{ fontFamily: T.fontBody, fontSize: 13, fontWeight: 600, color: '#dff0f5', marginBottom: 3 }}>{humanize(memo.asset)}</div>
                    <div style={{ fontFamily: T.fontMono, fontSize: 8, letterSpacing: '0.08em', color: 'rgba(90,128,144,0.87)', marginBottom: 6 }}>{memo.title}</div>
                    <span style={{ fontFamily: T.fontMono, fontSize: 7, letterSpacing: '0.18em', color: 'rgba(0,187,221,0.67)', background: 'rgba(0,187,221,0.07)', border: '1px solid rgba(0,187,221,0.2)', borderRadius: 2, padding: '2px 7px' }}>
                      {memo.evidence_summary?.evidence_status || memo.research_quality_status || 'UNVERIFIED'}
                    </span>
                  </div>
                )) : <div style={{ fontFamily: T.fontMono, fontSize: 8, color: 'rgba(0,187,221,0.27)' }}>No research memos returned.</div>}
              </div>

              {/* Validation */}
              <div style={{ padding: '1.2rem 1.5rem' }}>
                <div style={{ fontFamily: T.fontMono, fontSize: 8, letterSpacing: '0.25em', color: 'rgba(0,187,221,0.53)', marginBottom: 12 }}>VALIDATION RECORDS</div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10, background: 'rgba(0,204,119,0.05)', border: '1px solid rgba(0,204,119,0.17)', borderRadius: 3, padding: '10px 14px' }}>
                  <div style={{ width: 7, height: 7, borderRadius: '50%', background: '#00cc77', boxShadow: '0 0 6px #00cc77', flexShrink: 0 }} />
                  <div>
                    <div style={{ fontFamily: T.fontBody, fontSize: 13, fontWeight: 600, color: 'rgba(0,204,119,0.87)' }}>{passCount} / {records.length} CHECKS PASSED</div>
                    <div style={{ fontFamily: T.fontMono, fontSize: 7, letterSpacing: '0.15em', color: 'rgba(0,204,119,0.4)', marginTop: 2 }}>
                      PORTFOLIO CONTEXT · LEG MAPPING · BROKER SOURCE · MARKET DATA
                    </div>
                  </div>
                </div>
              </div>
            </div>

            {/* Candidates */}
            {candidates.length > 0 && (
              <>
                <div style={{ height: 1, background: 'linear-gradient(90deg, transparent, rgba(0,187,221,0.1), transparent)', margin: '0 1.5rem' }} />
                <div style={{ padding: '1.2rem 1.5rem' }}>
                  <div style={{ fontFamily: T.fontMono, fontSize: 8, letterSpacing: '0.25em', color: 'rgba(0,187,221,0.53)', marginBottom: 10 }}>{humanize(etfAsset || 'ETF')} CANDIDATES · BACKEND COMPARISON</div>
                  {candidates.map(candidate => {
                    const isWinner = candidate.symbol === researchSymbol
                    const isCandidate = candidate.symbol === checklistSymbol
                    const tickerColor = isWinner ? T.accent : isCandidate ? '#ffaa00' : 'rgba(138,184,200,0.53)'
                    const statusColor = isWinner ? { color: 'rgba(0,187,221,0.8)', bg: 'rgba(0,187,221,0.07)', border: 'rgba(0,187,221,0.2)' }
                      : isCandidate ? { color: 'rgba(255,170,0,0.8)', bg: 'rgba(255,170,0,0.07)', border: 'rgba(255,170,0,0.2)' }
                      : { color: 'rgba(0,204,119,0.53)', bg: 'rgba(0,204,119,0.05)', border: 'rgba(0,204,119,0.15)' }
                    return (
                      <div key={candidate.symbol} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '9px 0', borderBottom: '1px solid rgba(0,187,221,0.04)' }}>
                        <div>
                          <div style={{ fontFamily: T.fontDisplay, fontSize: 17, fontWeight: 700, letterSpacing: '0.05em', color: tickerColor, textShadow: isWinner || isCandidate ? `0 0 12px ${tickerColor}44` : 'none' }}>{candidate.symbol || '—'}</div>
                          <div style={{ fontFamily: T.fontMono, fontSize: 8, letterSpacing: '0.08em', color: 'rgba(74,106,122,0.87)', marginTop: 2 }}>{candidate.label || '—'}</div>
                        </div>
                        <span style={{ fontFamily: T.fontMono, fontSize: 7, letterSpacing: '0.18em', padding: '3px 8px', borderRadius: 2, border: `1px solid ${statusColor.border}`, color: statusColor.color, background: statusColor.bg }}>
                          {isWinner ? 'RESEARCH WINNER' : isCandidate ? 'CHECKLIST CANDIDATE' : humanize(candidate.broker_verification || 'VERIFIED').toUpperCase()}
                        </span>
                      </div>
                    )
                  })}
                </div>
              </>
            )}
          </div>
        )}
      </div>
    </section>
  )
}

// ─── Nav Cards ────────────────────────────────────────────────────────────────
function NavCards({ onNav, summary, dashboard }) {
  const month = new Date().toLocaleString('en-GB', { month: 'long', year: 'numeric' })
  const cards = [
    { key: 'brief',       label: 'WEEKLY BRIEF',  tag: dashboard?.hero?.weekClosed ? 'APPROVED THIS WEEK' : 'ACTIVE THIS WEEK', wide: true,  icon: <BriefIcon /> },
    { key: 'holdings',   label: 'HOLDINGS',       tag: `${(summary?.sleeve_summary || []).length || 8} SLEEVES`, icon: <HoldingsIcon /> },
    { key: 'performance',label: 'PERFORMANCE',    tag: 'REAL DATA ONLY',  icon: <PerfIcon /> },
    { key: 'history',    label: 'BRIEF HISTORY',  tag: 'AUDIT TRAIL',     icon: <HistoryIcon /> },
    { key: 'budget',     label: 'BUDGET',         tag: month.toUpperCase(), icon: <BudgetIcon /> },
  ]

  return (
    <section style={{ padding: '2rem 2rem 0' }}>
      <div style={s.sectionTag}>[ COMMAND MODULES ]</div>
      <div style={{ ...s.sectionTitle, marginBottom: '1.2rem' }}>NAVIGATE</div>
      <div className="finance-nav-grid" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 8 }}>
        {cards.map(card => (
          <button
            type="button"
            key={card.key}
            onClick={() => onNav(card.key)}
            style={{
              gridColumn: card.wide ? 'span 2' : undefined,
              background: T.card, border: T.border, borderRadius: 4,
              padding: '12px 12px 10px', position: 'relative', overflow: 'hidden',
              cursor: 'pointer', textAlign: 'left', userSelect: 'none', color: 'inherit',
            }}
          >
            <div style={{ position: 'absolute', top: 0, left: 0, right: 0, height: 1, background: 'linear-gradient(90deg, rgba(0,187,221,0.4), transparent)', opacity: 0 }} />
            <div style={{ position: 'absolute', bottom: 6, right: 6, width: 6, height: 6, borderRight: '1px solid rgba(0,187,221,0.2)', borderBottom: '1px solid rgba(0,187,221,0.2)' }} />
            <div style={{ width: 24, height: 24, display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: 8, opacity: 0.6 }}>
              {card.icon}
            </div>
            <div style={{ fontFamily: T.fontDisplay, fontSize: 14, fontWeight: 700, color: 'rgba(138,184,200,0.87)', letterSpacing: '0.06em', marginBottom: 3 }}>{card.label}</div>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 8 }}>
              <span style={{ fontFamily: T.fontMono, fontSize: 7, letterSpacing: '0.15em', color: 'rgba(0,187,221,0.2)' }}>{card.tag}</span>
              <span style={{ fontFamily: T.fontMono, fontSize: 9, color: 'rgba(0,187,221,0.2)' }}>→</span>
            </div>
          </button>
        ))}
      </div>
    </section>
  )
}

function BriefIcon() { return <svg width="14" height="14" viewBox="0 0 16 16" fill="none"><rect x="2" y="3" width="12" height="1.5" rx="0.5" fill="#00bbdd"/><rect x="2" y="7" width="8" height="1.5" rx="0.5" fill="#00bbdd"/><rect x="2" y="11" width="10" height="1.5" rx="0.5" fill="#00bbdd"/></svg> }
function HoldingsIcon() { return <svg width="14" height="14" viewBox="0 0 16 16" fill="none"><rect x="2" y="10" width="2.5" height="4" rx="0.5" fill="#00bbdd"/><rect x="6" y="6" width="2.5" height="8" rx="0.5" fill="#00bbdd" opacity="0.7"/><rect x="10" y="3" width="2.5" height="11" rx="0.5" fill="#00bbdd" opacity="0.4"/></svg> }
function PerfIcon() { return <svg width="14" height="14" viewBox="0 0 16 16" fill="none"><polyline points="2,11 6,7 9,9 14,4" stroke="#00bbdd" strokeWidth="1.2" fill="none" strokeLinecap="round" strokeLinejoin="round"/><circle cx="14" cy="4" r="1.2" fill="#00bbdd"/></svg> }
function HistoryIcon() { return <svg width="14" height="14" viewBox="0 0 16 16" fill="none"><circle cx="8" cy="8" r="5.5" stroke="#00bbdd" strokeWidth="1.2" fill="none"/><path d="M8 5v3.5l2 1.5" stroke="#00bbdd" strokeWidth="1.2" strokeLinecap="round"/></svg> }
function BudgetIcon() { return <svg width="14" height="14" viewBox="0 0 16 16" fill="none"><rect x="2" y="2" width="5.5" height="5.5" rx="0.5" stroke="#00bbdd" strokeWidth="1.2" fill="none"/><rect x="8.5" y="2" width="5.5" height="5.5" rx="0.5" stroke="#00bbdd" strokeWidth="1.2" fill="none" opacity="0.5"/><rect x="2" y="8.5" width="5.5" height="5.5" rx="0.5" stroke="#00bbdd" strokeWidth="1.2" fill="none" opacity="0.5"/><rect x="8.5" y="8.5" width="5.5" height="5.5" rx="0.5" stroke="#00bbdd" strokeWidth="1.2" fill="none" opacity="0.3"/></svg> }

// ─── Global keyframes injection ───────────────────────────────────────────────
const KEYFRAMES = `
  @keyframes phScan { 0% { transform: translateX(-100%) } 100% { transform: translateX(100%) } }
  @keyframes phArcSpin { from { transform: rotate(0deg) } to { transform: rotate(360deg) } }
  @keyframes phBlink { 0%, 100% { opacity: 1 } 50% { opacity: 0.2 } }
`

// ─── Main export ──────────────────────────────────────────────────────────────
export default function FinanceDashboard({ onNav }) {
  const mountedRef = useRef(false)
  const [summary, setSummary]           = useState(null)
  const [recommendation, setRecommendation] = useState(null)
  const [checklist, setChecklist]       = useState(null)
  const [coverage, setCoverage]         = useState(null)
  const [memos, setMemos]               = useState([])
  const [records, setRecords]           = useState([])
  const [portfolioState, setPortfolioState] = useState(null)
  const [pnlData, setPnlData]           = useState(null)
  const [performance, setPerformance]   = useState(null)
  const [loading, setLoading]           = useState(true)
  const [error, setError]               = useState('')

  function loadAll() {
    Promise.allSettled([
      getFinanceSummary(),
      getFinanceRecommendation(),
      getFinanceManualBuyChecklist(),
      getFinanceDataCoverage(),
      getFinanceResearchMemos(),
      getFinanceResearchValidationRecords(),
      getFinancePortfolioState(),
      getFinancePnl(),
      getFinancePerformanceHistory(),
    ]).then((results) => {
      if (!mountedRef.current) return
      const [summaryR, recR, checkR, covR, memosR, recsR, psR, pnlR, performanceR] = results
      if (summaryR.status === 'fulfilled') setSummary(summaryR.value)
      if (recR.status    === 'fulfilled') setRecommendation(recR.value)
      if (checkR.status  === 'fulfilled') setChecklist(checkR.value)
      if (covR.status    === 'fulfilled') setCoverage(covR.value)
      if (memosR.status  === 'fulfilled') setMemos(memosR.value?.memos || [])
      if (recsR.status   === 'fulfilled') setRecords(recsR.value?.records || [])
      if (psR.status     === 'fulfilled') setPortfolioState(psR.value)
      if (pnlR.status    === 'fulfilled') setPnlData(pnlR.value)
      if (performanceR.status === 'fulfilled') setPerformance(performanceR.value)
      const failedSources = listFailedFinanceSources(results, [
        'summary',
        'recommendation',
        'manual checklist',
        'data coverage',
        'research memos',
        'validation records',
        'portfolio state',
        'P&L',
        'performance history',
      ])
      setError(failedSources.length
        ? `Unavailable finance sources: ${failedSources.join(', ')}.`
        : '')
      setLoading(false)
    })
  }

  useEffect(() => {
    // Inject fonts
    // Inject keyframes
    if (!document.getElementById('ph-keyframes')) {
      const style = document.createElement('style')
      style.id = 'ph-keyframes'
      style.textContent = KEYFRAMES
      document.head.appendChild(style)
    }

    mountedRef.current = true
    loadAll()
    return () => { mountedRef.current = false }
  }, [])

  // ── Derived values ──────────────────────────────────────────────────────────
  const dashboard = useMemo(() => buildFinanceDashboardModel({
    summary,
    recommendation,
    checklist,
    coverage,
    memos,
    records,
    portfolioState,
    pnl: pnlData,
    performance,
  }), [summary, recommendation, checklist, coverage, memos, records, portfolioState, pnlData, performance])
  const sleeves          = dashboard.portfolio.sleeves
  const driftCount       = sleeves.filter(s => s.band_status === 'above_max' || s.band_status === 'below_min').length
  const checklistItems   = dashboard.actions
  const qualityCoverage  = {
    ...dashboard.selection,
    selection_gap_reason: dashboard.selection.gapReason,
  }
  const researchWinner   = dashboard.selection.researchWinner
  const checklistCandidate = dashboard.selection.checklistCandidate
  const researchSymbol   = dashboard.selection.researchSymbol
  const checklistSymbol  = dashboard.selection.checklistSymbol
  const evidenceLabel    = dashboard.meta.evidenceLabel
  const actionCopy       = dashboard.hero.actionCopy

  return (
    <CockpitShell style={s.wrap} aria-label="Finance Command Center">
      <div style={s.shell}>

        {/* ── Header + Auth Core ── */}
        <div className="finance-hero-grid" style={{ display: 'grid', gridTemplateColumns: '1fr 320px', alignItems: 'stretch' }}>
          <Header
            summary={summary}
            checklist={checklist}
            recommendation={recommendation}
            actionCopy={actionCopy}
            loading={loading}
            pnlTotals={pnlData}
            driftCount={driftCount}
          />
          <div className="finance-authorization-wrap" style={{ padding: '2rem 2rem 2rem 0', display: 'flex', alignItems: 'center' }}>
            <AuthorizationCore checklist={checklist} recommendation={recommendation} />
          </div>
        </div>

        {error && (
          <div style={{ margin: '0 2rem', padding: '10px 14px', border: '1px solid rgba(255,92,122,0.2)', background: 'rgba(255,92,122,0.04)', color: 'rgba(255,92,122,0.8)', fontFamily: T.fontMono, fontSize: 8, letterSpacing: '0.1em' }}>
            {error}
          </div>
        )}

        {/* ── Manual Actions ── */}
        <section style={{ padding: '2rem 2rem 0' }}>
          <div style={s.sectionTag}>[ THIS WEEK ]</div>
          <div className="finance-section-heading" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: '1.5rem' }}>
            <div style={s.sectionTitle}>MANUAL ACTIONS</div>
            <span style={{ fontFamily: T.fontMono, fontSize: 8, letterSpacing: '0.15em', color: 'rgba(0,187,221,0.4)' }}>BROKER ACTIONS REMAIN OUTSIDE PHOENIX</span>
          </div>
          {checklistItems.length ? (
            <div className="finance-actions-grid" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
              {checklistItems.map((item, i) => (
                <ManualActionCard key={`${item.asset}-${i}`} item={item} index={i} onOpenBrief={() => onNav('brief')} />
              ))}
            </div>
          ) : (
            <div style={{ fontFamily: T.fontMono, fontSize: 9, color: 'rgba(0,187,221,0.27)', padding: '2rem', textAlign: 'center', border: T.border, borderRadius: 4 }}>
              {dashboard.hero.weekClosed
                ? `${dashboard.meta.weekLabel || 'THIS WEEK'} APPROVED · NO FURTHER RECOMMENDATION UNTIL ${dashboard.hero.nextWindow || 'NEXT WEEK'}`
                : 'NO MANUAL ACTIONS RETURNED · DO NOT INFER OR PLACE A TRADE'}
            </div>
          )}
        </section>

        {/* ── Instrument Resolution ── */}
        {!dashboard.hero.weekClosed && (
          <InstrumentResolution
            researchWinner={researchWinner}
            checklistCandidate={checklistCandidate}
            researchSymbol={researchSymbol}
            checklistSymbol={checklistSymbol}
            qualityCoverage={qualityCoverage}
          />
        )}

        {/* ── Portfolio Snapshot ── */}
        {sleeves.length > 0 && (
          <PortfolioSnapshot sleeves={sleeves} total={summary?.total_invested} asOf={summary?.as_of} />
        )}

        <section style={{ padding: '2rem 2rem 0' }}>
          <DataPanel
            eyebrow="[ REAL PERFORMANCE ]"
            title="PORTFOLIO VALUE HISTORY"
            meta={<SourceStamp source={dashboard.performance.source} asOf={dashboard.performance.points.at(-1)?.timestamp} />}
          >
            <MetricLineChart
              points={dashboard.performance.points}
              historyStatus={dashboard.performance.historyStatus}
              source={dashboard.performance.source}
              unit="EUR"
            />
          </DataPanel>
        </section>

        {/* ── Unit Correction (collapsed by default) ── */}
        <UnitCorrectionPanel
          portfolioState={portfolioState}
          onFixed={loadAll}
        />

        {/* ── Advanced Audit ── */}
        <AdvancedAudit
          memos={memos}
          records={records}
          qualityCoverage={qualityCoverage}
          etfAsset={dashboard.selection.asset}
          researchSymbol={researchSymbol}
          checklistSymbol={checklistSymbol}
          evidenceLabel={evidenceLabel}
          onNav={onNav}
        />

        {/* ── Nav Cards ── */}
        <NavCards onNav={onNav} summary={summary} dashboard={dashboard} />

      </div>
    </CockpitShell>
  )
}
