import { useMemo, useState } from 'react'
import { ACC, G, Y, R, W, BODY, INK, FM, FD, FB, a, mix, deep } from '../holoTokens'
import { APPROVE_CHECKS, HOLDINGS } from '../holoDomains'
import { ApproveContent, HoldingsContent, BriefContent } from './FinanceSubs'
import { BudgetContent } from './BudgetContent'
import { PerformanceContent } from './PerformanceContent'
import { BriefHistoryContent } from './BriefHistoryContent'
import { ResearchContent } from './ResearchContent'

const TABS = ['ACTION', 'PORTFOLIO', 'PERFORMANCE', 'INTEL', 'RESEARCH', 'BUDGET', 'BRIEFS', 'HISTORY', 'CASH']

const TAB_META = {
  ACTION: ['APPROVAL VECTOR', 'Manual order gate', G],
  PORTFOLIO: ['ORBITAL MAP', 'Sleeve allocation', ACC],
  PERFORMANCE: ['VALUE CURVE', 'Portfolio over time', ACC],
  INTEL: ['WEEKLY SIGNAL', 'Brief transmission', Y],
  RESEARCH: ['MEMO LIBRARY', 'Analysis · no trades', ACC],
  BUDGET: ['MONTHLY LEDGER', 'Income vs spending', ACC],
  BRIEFS: ['DECISION LOG', 'Past briefs + outcomes', G],
  HISTORY: ['AUDIT STREAM', 'Source trail', W],
  CASH: ['RUNWAY', 'Portfolio cash sleeve', G],
}

const money = value => Number.isFinite(value)
  ? 'EUR ' + value.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
  : 'EUR 85.00'

const upper = value => String(value || '').replace(/_/g, ' ').toUpperCase()
const sleeveColor = sleeve => (sleeve?.dir === 'TRIM' ? R : sleeve?.dir === 'FEED' ? Y : G)

export default function FinanceControlRoom({ onClose, checks = [], stamped, onToggle, onConfirm, holdings, finance }) {
  const [tab, setTab] = useState('ACTION')
  const [holdSel, setHoldSel] = useState(0)
  const sleeves = holdings?.list?.length ? holdings.list : HOLDINGS
  const verified = stamped ? APPROVE_CHECKS.length : checks.filter(Boolean).length
  const activeMeta = TAB_META[tab]
  const alerts = finance?.sleeve_summary?.filter(s => s.band_status !== 'within_band') || []

  const contextRows = useMemo(() => [
    ['ACTIVE LANE', activeMeta[0], activeMeta[2]],
    ['SOURCE', finance ? 'LIVE FINANCE' : 'FIXTURE FALLBACK', finance ? G : Y],
    ['WEEK', finance?.week_label || 'W28', W],
    ['MANUAL SAFETY', 'PHOENIX NEVER EXECUTES ORDERS', G],
    ['MODE', 'MANUAL ONLY', G],
  ], [activeMeta, finance])

  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 82, background: 'color-mix(in srgb, black 72%, transparent)', backdropFilter: 'blur(8px)', animation: 'holo-fadeIn .25s ease both' }}>
      <div style={{ position: 'absolute', inset: '16px 16px calc(66px + env(safe-area-inset-bottom))', border: `1px solid ${a(ACC, '55')}`, background: `radial-gradient(circle at 20% 0%, ${a(ACC, '16')}, transparent 34%), linear-gradient(180deg, ${a(ACC, '10')}, ${deep(94)})`, boxShadow: `0 0 120px ${a(ACC, '52')}, inset 0 0 74px ${a(ACC, '08')}`, clipPath: 'polygon(0 0, calc(100% - 24px) 0, 100% 24px, 100% 100%, 0 100%)', overflow: 'hidden' }}>
        <div style={{ position: 'absolute', inset: 0, pointerEvents: 'none', opacity: .55, background: `repeating-linear-gradient(90deg, transparent 0 38px, ${a(ACC, '06')} 38px 39px), repeating-linear-gradient(0deg, transparent 0 28px, ${a(ACC, '05')} 28px 29px)` }} />
        <header style={{ position: 'relative', display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 14, padding: '14px 16px 11px', borderBottom: `1px solid ${a(ACC, '28')}`, flexWrap: 'wrap' }}>
          <div style={{ minWidth: 0 }}>
            <div style={{ fontFamily: FM, fontSize: 10, letterSpacing: '.28em', color: ACC, textShadow: `0 0 10px ${a(ACC, '66')}` }}>SYS.FINANCE // CONTROL ROOM</div>
            <div style={{ marginTop: 5, fontFamily: FB, fontSize: 26, color: W, fontWeight: 400, lineHeight: 1.05 }}>Capital operations deck</div>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 9, flexWrap: 'wrap', justifyContent: 'flex-end' }}>
            <div style={{ minHeight: 36, display: 'grid', placeItems: 'center', padding: '0 12px', border: `1px solid ${a(activeMeta[2], '40')}`, background: a(activeMeta[2], '10'), fontFamily: FM, fontSize: 8, letterSpacing: '.18em', color: activeMeta[2] }}>{activeMeta[0]}</div>
            <button onClick={onClose} style={{ minHeight: 36, padding: '0 14px', fontFamily: FM, fontSize: 8, letterSpacing: '.18em', color: ACC, background: deep(60), border: `1px solid ${a(ACC, '44')}`, cursor: 'pointer', flexShrink: 0 }}>RETURN TO PROJECTION</button>
          </div>
        </header>

        <div style={{ position: 'relative', display: 'flex', gap: 14, height: 'calc(100% - 78px)', padding: 14, overflow: 'auto', alignItems: 'stretch', flexWrap: 'wrap' }}>
          <main style={{ flex: '1 1 690px', minWidth: 'min(100%, 300px)', display: 'flex', flexDirection: 'column', gap: 12 }}>
            <nav style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(112px, 1fr))', gap: 7, flexShrink: 0 }}>
              {TABS.map(label => {
                const [lane, sub, color] = TAB_META[label]
                const on = tab === label
                return (
                  <button key={label} onClick={() => setTab(label)} style={{ position: 'relative', minHeight: 46, padding: '8px 10px', fontFamily: FM, textAlign: 'left', color: on ? INK : a(ACC, 'cc'), background: on ? `linear-gradient(135deg, ${color}, ${a(color, 'bb')})` : `linear-gradient(180deg, ${a(ACC, '0d')}, ${deep(58)})`, border: `1px solid ${on ? color : a(ACC, '35')}`, cursor: 'pointer', boxShadow: on ? `0 0 24px ${a(color, '45')}` : 'none', overflow: 'hidden' }}>
                    <span style={{ display: 'block', fontSize: 9, letterSpacing: '.19em' }}>{label}</span>
                    <span style={{ display: 'block', marginTop: 3, fontSize: 7, letterSpacing: '.09em', color: on ? a(INK, 'aa') : a(ACC, '86') }}>{lane} // {sub}</span>
                  </button>
                )
              })}
            </nav>

            <section style={{ minHeight: 0, flex: 1, border: `1px solid ${a(activeMeta[2], '2f')}`, background: `linear-gradient(180deg, ${a(activeMeta[2], '08')}, ${a(ACC, '05')})`, boxShadow: `inset 0 0 54px ${a(activeMeta[2], '07')}`, padding: 'clamp(10px, 1.4vw, 16px)', overflow: 'auto' }}>
              {tab === 'ACTION' && (
                <RoomStage label="ACTION SEQUENCE" color={G}>
                  <ApproveContent checks={checks} stamped={stamped} onToggle={onToggle} onConfirm={onConfirm} />
                </RoomStage>
              )}
              {tab === 'PORTFOLIO' && (
                <RoomStage label={holdings?.meta || 'PORTFOLIO ORBIT'} color={ACC} immersive>
                  <HoldingsContent sel={holdSel} onSel={setHoldSel} live={holdings} />
                </RoomStage>
              )}
              {tab === 'PERFORMANCE' && (
                <RoomStage label="VALUE CURVE" color={ACC}>
                  <PerformanceContent />
                </RoomStage>
              )}
              {tab === 'INTEL' && (
                <RoomStage label="INTEL TRANSMISSION" color={Y} immersive>
                  <BriefContent />
                </RoomStage>
              )}
              {tab === 'RESEARCH' && (
                <RoomStage label="MEMO LIBRARY" color={ACC}>
                  <ResearchContent />
                </RoomStage>
              )}
              {tab === 'BUDGET' && (
                <RoomStage label="MONTHLY LEDGER" color={ACC}>
                  <BudgetContent />
                </RoomStage>
              )}
              {tab === 'BRIEFS' && (
                <RoomStage label="DECISION LOG" color={G}>
                  <BriefHistoryContent />
                </RoomStage>
              )}
              {tab === 'HISTORY' && <AuditPanel finance={finance} alerts={alerts} />}
              {tab === 'CASH' && <BudgetPanel finance={finance} sleeves={sleeves} />}
            </section>
          </main>

          <aside style={{ flex: '0 1 286px', minWidth: 'min(100%, 236px)', display: 'flex', flexDirection: 'column', gap: 10 }}>
            <ContextRail rows={contextRows} verified={verified} stamped={stamped} alerts={alerts.length} />
          </aside>
        </div>
      </div>
    </div>
  )
}

function RoomStage({ label, color = ACC, immersive = false, children }) {
  return (
    <div style={{ position: 'relative', minHeight: immersive ? 'min(560px, 62vh)' : 'auto' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}>
        <span style={{ width: 36, height: 1, background: `linear-gradient(90deg, transparent, ${a(color, '88')})` }} />
        <span style={{ fontFamily: FM, fontSize: 8, letterSpacing: '.24em', color: a(color, 'cc') }}>{label}</span>
        <span style={{ flex: 1, height: 1, background: `linear-gradient(90deg, ${a(color, '66')}, transparent)` }} />
      </div>
      <div style={{ position: 'relative', border: immersive ? 'none' : `1px solid ${a(color, '20')}`, background: immersive ? 'transparent' : `linear-gradient(180deg, ${a(color, '06')}, ${deep(76)})`, padding: immersive ? 0 : 12, boxShadow: immersive ? 'none' : `inset 0 0 34px ${a(color, '06')}` }}>
        {children}
      </div>
    </div>
  )
}

function Field({ label, value, color = W }) {
  return (
    <div style={{ minWidth: 0, padding: '9px 0', borderTop: `1px solid ${a(ACC, '16')}` }}>
      <div style={{ fontFamily: FM, fontSize: 7, letterSpacing: '.18em', color: a(ACC, '88') }}>{label}</div>
      <div style={{ marginTop: 4, fontFamily: FD, fontSize: 17, fontWeight: 700, color, overflowWrap: 'anywhere' }}>{value}</div>
    </div>
  )
}

function RoomCard({ label, title, children, style }) {
  return (
    <section style={{ minWidth: 0, border: `1px solid ${a(ACC, '26')}`, background: `linear-gradient(180deg, ${a(ACC, '0d')}, ${deep(76)})`, boxShadow: `inset 0 0 38px ${a(ACC, '07')}`, padding: 14, clipPath: 'polygon(0 0, calc(100% - 14px) 0, 100% 14px, 100% 100%, 0 100%)', ...style }}>
      <div style={{ fontFamily: FM, fontSize: 7, letterSpacing: '.24em', color: a(ACC, '95'), marginBottom: 5 }}>{label}</div>
      {title && <div style={{ fontFamily: FB, fontSize: 21, fontWeight: 400, color: W, lineHeight: 1.15, marginBottom: 11 }}>{title}</div>}
      {children}
    </section>
  )
}

function AuditPanel({ finance, alerts }) {
  const rows = [
    ['WEEK WINDOW', finance?.week_done ? 'RECORDED' : 'OPEN', finance?.week_done ? G : Y],
    ['BROKER PATH', 'USER PLACED', W],
    ['ORDER STATE', 'NO BROKER BRIDGE', G],
    ['DRIFT SCAN', `${alerts.length || 1} ALERT${(alerts.length || 1) === 1 ? '' : 'S'}`, alerts.length ? Y : G],
    ['CONSTITUTION', finance?.constitution_valid === false ? 'INVALID' : 'VALID', finance?.constitution_valid === false ? R : G],
  ]
  return (
    <RoomCard label="HISTORY STREAM" title="Capital trail">
      <div style={{ display: 'grid', gap: 8 }}>
        {rows.map(([label, value, color], i) => (
          <div key={label} style={{ display: 'grid', gridTemplateColumns: '34px minmax(110px, 150px) 1fr auto', gap: 10, alignItems: 'center', minHeight: 44, padding: '0 10px', background: i === 0 ? a(color, '10') : deep(58), border: `1px solid ${i === 0 ? a(color, '36') : a(ACC, '20')}` }}>
            <span style={{ fontFamily: FD, fontSize: 17, fontWeight: 700, color: a(color, 'cc') }}>{String(i + 1).padStart(2, '0')}</span>
            <span style={{ fontFamily: FM, fontSize: 7, letterSpacing: '.17em', color: a(ACC, '88') }}>{label}</span>
            <span style={{ fontFamily: FB, fontSize: 15, color: mix(BODY, 92), overflowWrap: 'anywhere' }}>{value}</span>
            <span style={{ width: 7, height: 7, borderRadius: 99, background: color, boxShadow: `0 0 9px ${color}` }} />
          </div>
        ))}
      </div>
    </RoomCard>
  )
}

function BudgetPanel({ finance, sleeves }) {
  const cash = sleeves.find(s => /cash|reserve/i.test(`${s.name} ${s.tk}`))
  const total = Number.isFinite(finance?.total_invested) ? finance.total_invested : null
  const cashWeight = Number(cash?.w || 0)
  const impliedCash = total == null ? null : total * cashWeight / 100
  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 12 }}>
      <RoomCard label="DEPLOYMENT" title="This week">
        <Field label="WEEKLY DEPLOY" value={money(finance?.week_budget)} color={ACC} />
        <Field label="WINDOW" value={finance?.week_done ? 'CLOSED' : 'OPEN'} color={finance?.week_done ? G : Y} />
        <Field label="ACTION" value={finance?.week_done ? 'RECORDED' : 'APPROVAL NEEDED'} color={finance?.week_done ? G : Y} />
      </RoomCard>
      <RoomCard label="RUNWAY" title="Cash posture">
        <Field label="CASH SLEEVE" value={cash?.v || money(impliedCash)} color={W} />
        <Field label="CASH WEIGHT" value={`${cashWeight.toFixed(1)}%`} color={cash?.dir === 'FEED' ? Y : G} />
        <Field label="DIRECTIVE" value={cash?.dir || 'HOLD'} color={sleeveColor(cash)} />
      </RoomCard>
      <RoomCard label="BOUNDARY" title="Manual lane">
        <p style={{ margin: 0, fontFamily: FB, fontSize: 15, lineHeight: 1.55, color: mix(BODY, 88) }}>
          Cash view shows runway and deployment pressure only. No cash movement, no broker bridge, no placed trade.
        </p>
      </RoomCard>
    </div>
  )
}

function ContextRail({ rows, verified, stamped, alerts }) {
  return (
    <>
      <RoomCard label="ROOM STATUS" title="Control rail">
        {rows.map(([label, value, color]) => <Field key={label} label={label} value={value} color={color} />)}
      </RoomCard>
      <RoomCard label="APPROVAL" title={stamped ? 'Stamped' : 'Pending'}>
        <div style={{ position: 'relative', height: 12, background: a(ACC, '12'), border: `1px solid ${a(ACC, '22')}`, overflow: 'hidden', marginBottom: 9 }}>
          <div style={{ height: '100%', width: `${(verified / APPROVE_CHECKS.length) * 100}%`, background: stamped ? G : ACC, boxShadow: `0 0 12px ${stamped ? G : ACC}`, transition: 'width .35s ease' }} />
        </div>
        <div style={{ fontFamily: FD, fontSize: 34, fontWeight: 700, color: W }}>{verified}/{APPROVE_CHECKS.length}</div>
        <div style={{ marginTop: 6, fontFamily: FM, fontSize: 8, letterSpacing: '.16em', color: stamped ? G : Y }}>{stamped ? 'WEEK APPROVED' : 'CHECKS REQUIRED'}</div>
      </RoomCard>
      <RoomCard label="DRIFT" title={`${alerts || 1} alert${(alerts || 1) === 1 ? '' : 's'}`}>
        <Field label="WATCH" value={(alerts || 1) > 1 ? 'MULTI SLEEVE' : 'BITCOIN / CASH'} color={alerts ? Y : G} />
      </RoomCard>
    </>
  )
}

export { TABS as FINANCE_CONTROL_ROOM_TABS }
