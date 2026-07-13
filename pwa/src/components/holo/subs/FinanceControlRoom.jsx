import { useState } from 'react'
import { ACC, W, INK, FM, FB, a, mix, deep } from '../holoTokens'
import { ApproveContent, HoldingsContent, BriefContent } from './FinanceSubs'
import { BudgetContent } from './BudgetContent'
import { PerformanceContent } from './PerformanceContent'
import { BriefHistoryContent } from './BriefHistoryContent'
import { ResearchContent } from './ResearchContent'
import { LedgerContent } from './LedgerContent'
import { FINANCE_READABILITY_CSS, financeButton, financeLabel, financeMicro } from './financeReadability'

// Four lanes. The weekly-cycle views (signal → approve → log) and the two
// portfolio views live under lightweight sub-tabs; the always-on rail carries
// the at-a-glance status that the old HISTORY/CASH lanes duplicated.
const TABS = ['BRIEF', 'PORTFOLIO', 'BUDGET', 'RESEARCH']

const TAB_META = {
  BRIEF: ['WEEKLY CYCLE', 'Signal · approve · log', ACC],
  PORTFOLIO: ['PORTFOLIO', 'Holdings · value curve', ACC],
  BUDGET: ['MONTHLY LEDGER', 'Income vs spending', ACC],
  RESEARCH: ['MEMO LIBRARY', 'Analysis · no trades', ACC],
}

const FINANCE_ROOM_MOTION_CSS = `
${FINANCE_READABILITY_CSS}
@keyframes holo-financeRoomScrim {
  from { opacity: 0; }
  to { opacity: 1; }
}
@keyframes holo-financeRoomPop {
  0% { opacity: 0; transform: translate(-50%,-50%) scale(.92); filter: blur(8px); }
  58% { opacity: 1; transform: translate(-50%,-50%) scale(1.018); filter: blur(0); }
  100% { opacity: 1; transform: translate(-50%,-50%) scale(1); filter: blur(0); }
}
@keyframes holo-financeRoomScan {
  0% { opacity: 0; transform: translateX(-115%); }
  20% { opacity: .82; }
  100% { opacity: 0; transform: translateX(118%); }
}
@keyframes holo-financeRoomCorner {
  0% { opacity: 0; transform: scaleX(.1); }
  100% { opacity: 1; transform: scaleX(1); }
}
@keyframes holo-financeRoomResolve {
  0% { opacity: 0; transform: translateY(8px); }
  100% { opacity: 1; transform: translateY(0); }
}
@keyframes holo-financeRoomDivider {
  from { transform: scaleX(0); opacity: .35; }
  to { transform: scaleX(1); opacity: 1; }
}
@keyframes holo-financeLaneIn {
  from { opacity: 0; transform: translateY(10px) scale(.98); }
  to { opacity: 1; transform: translateY(0) scale(1); }
}
@keyframes holo-financeInstrumentIn {
  from { opacity: 0; transform: translateY(12px); filter: blur(5px); }
  to { opacity: 1; transform: translateY(0); filter: blur(0); }
}
@media (prefers-reduced-motion: reduce) {
  .holo-finance-room-scrim,
  .holo-finance-room-shell,
  .holo-finance-room-scan,
  .holo-finance-room-divider,
  .holo-finance-room-lane,
  .holo-finance-room-instrument {
    animation-duration: .01ms !important;
    animation-iteration-count: 1 !important;
  }
}
`

export default function FinanceControlRoom({ onClose, checks = [], stamped, onToggle, onConfirm, holdings, finance }) {
  const [tab, setTab] = useState('BRIEF')
  const [briefSub, setBriefSub] = useState('SIGNAL')
  const [portSub, setPortSub] = useState('HOLDINGS')
  const [holdSel, setHoldSel] = useState(0)
  const activeMeta = TAB_META[tab]

  return (
    <>
      <FinanceRoomMotionStyles />
      <div
        className="holo-finance-room-scrim"
        onClick={onClose}
        style={{
          position: 'fixed',
          inset: 0,
          zIndex: 79,
          background: 'color-mix(in srgb, black 36%, transparent)',
          backdropFilter: 'blur(2px)',
          animation: 'holo-financeRoomScrim .34s ease both',
          cursor: 'pointer',
        }}
      />
      <div
        className="holo-finance-room-shell"
        style={{
          position: 'fixed',
          left: '50%',
          top: '47%',
          transform: 'translate(-50%,-50%)',
          width: 'min(920px, calc(100vw - 26px))',
          maxHeight: 'calc(100vh - 170px)',
          zIndex: 82,
          display: 'flex',
          flexDirection: 'column',
          border: `1px solid ${a(ACC, '50')}`,
          background: `radial-gradient(circle at 18% 0%, ${a(ACC, '18')}, transparent 36%), linear-gradient(180deg, ${a(ACC, '14')}, ${deep(94)})`,
          backdropFilter: 'blur(16px)',
          boxShadow: `0 0 96px ${a(ACC, '66')}, 0 0 20px ${a(ACC, '2a')}, inset 0 0 54px ${a(ACC, '0a')}`,
          clipPath: 'polygon(0 0, calc(100% - 20px) 0, 100% 20px, 100% 100%, 0 100%)',
          overflow: 'hidden',
          animation: 'holo-financeRoomPop .68s cubic-bezier(.18,.88,.24,1.08) both',
        }}
      >
        <div className="holo-finance-room-scan" style={{ position: 'absolute', inset: '-28% -30%', pointerEvents: 'none', background: `linear-gradient(112deg, transparent 0 42%, ${a(ACC, '08')} 47%, ${a(W, '1e')} 50%, ${a(ACC, '18')} 53%, transparent 59% 100%)`, mixBlendMode: 'screen', animation: 'holo-financeRoomScan 1.08s ease-out .16s both' }} />
        <div style={{ position: 'absolute', inset: 0, pointerEvents: 'none', opacity: .45, background: `repeating-linear-gradient(90deg, transparent 0 38px, ${a(ACC, '05')} 38px 39px), repeating-linear-gradient(0deg, transparent 0 30px, ${a(ACC, '04')} 30px 31px)` }} />
        <div style={{ position: 'absolute', top: 4, right: 4, width: 24, height: 1, background: ACC, transform: 'rotate(-45deg)', transformOrigin: '100% 0', pointerEvents: 'none', animation: 'holo-financeRoomCorner .42s ease-out .34s both' }} />
        <div style={{ position: 'absolute', bottom: -1, left: -1, width: 11, height: 11, borderBottom: `1px solid ${ACC}`, borderLeft: `1px solid ${ACC}`, pointerEvents: 'none' }} />
        <div style={{ position: 'absolute', bottom: -1, right: -1, width: 11, height: 11, borderBottom: `1px solid ${ACC}`, borderRight: `1px solid ${ACC}`, pointerEvents: 'none' }} />

        <header style={{ position: 'relative', display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 14, padding: '14px clamp(14px, 2.2vw, 20px) 10px', flexWrap: 'wrap', flexShrink: 0, animation: 'holo-financeRoomResolve .42s ease-out .18s both' }}>
          <div style={{ minWidth: 0, flex: '1 1 270px' }}>
            <div style={{ display: 'inline-flex', alignItems: 'center', gap: 8, ...financeLabel({ letterSpacing: '.16em', color: ACC, textShadow: `0 0 10px ${a(ACC, '66')}`, whiteSpace: 'nowrap' }) }}>
              <i style={{ width: 5, height: 5, background: 'currentColor', boxShadow: '0 0 7px currentColor' }} />
              SYS.FINANCE // CONTROL ROOM
            </div>
            <div style={{ marginTop: 6, fontFamily: FB, fontSize: 'clamp(22px, 3.8vw, 30px)', color: W, fontWeight: 400, lineHeight: 1.02 }}>PROJECTED FINANCE LAYER</div>
            <div style={{ marginTop: 6, ...financeMicro({ letterSpacing: '.12em', color: a(ACC, '99') }) }}>{activeMeta[0]} // {activeMeta[1]}</div>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', justifyContent: 'flex-end', flex: '1 1 300px' }}>
            {/* data source + week: the one at-a-glance status worth keeping */}
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: 7, minHeight: 32, padding: '0 10px', border: `1px solid ${a(ACC, '2a')}`, background: deep(58), ...financeMicro({ color: a(ACC, 'cc') }) }}>
              <i style={{ width: 6, height: 6, borderRadius: 99, background: ACC, boxShadow: `0 0 7px ${ACC}` }} />
              {finance ? 'LIVE' : 'FIXTURE'} · {finance?.week_label || 'W28'}
            </span>
            {/* single manual-only safety chip */}
            <span title="Phoenix never executes orders — you place every trade manually" style={{ minHeight: 32, display: 'grid', placeItems: 'center', padding: '0 10px', border: `1px solid ${a(ACC, '42')}`, background: a(ACC, '08'), ...financeMicro({ letterSpacing: '.14em', color: ACC }) }}>MANUAL ONLY</span>
            <span style={{ minHeight: 32, display: 'grid', placeItems: 'center', padding: '0 8px', ...financeMicro({ color: a(ACC, '99') }), border: `1px solid ${a(ACC, '30')}` }}>ESC</span>
            <button onClick={onClose} style={{ minHeight: 32, padding: '0 13px', ...financeButton({ fontWeight: 400, color: ACC, letterSpacing: '.14em' }), background: deep(60), border: `1px solid ${a(ACC, '44')}`, cursor: 'pointer', flexShrink: 0 }}>RETURN TO PROJECTION</button>
          </div>
        </header>
        <div className="holo-finance-room-divider" style={{ height: 1, margin: '0 clamp(14px, 2.2vw, 20px)', flexShrink: 0, background: `linear-gradient(90deg, ${a(ACC, '88')}, ${a(ACC, '24')} 54%, transparent)`, transformOrigin: 'left center', animation: 'holo-financeRoomDivider .52s ease-out .26s both' }} />

        <div className="holo-finance-room-body" style={{ position: 'relative', flex: '1 1 auto', minHeight: 0, padding: '13px clamp(12px, 2vw, 18px) 16px', overflowY: 'auto' }}>
          <main style={{ display: 'grid', gap: 12 }}>
            <nav style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(132px, 1fr))', gap: 7 }}>
              {TABS.map((label, i) => {
                const [lane, sub, color] = TAB_META[label]
                const on = tab === label
                return (
                  <button
                    className="holo-finance-room-lane"
                    key={label}
                    onClick={() => setTab(label)}
                    style={{
                      position: 'relative',
                      minHeight: 52,
                      padding: '9px 11px',
                      fontFamily: FM,
                      textAlign: 'left',
                      color: on ? INK : a(ACC, 'cc'),
                      background: on ? `linear-gradient(135deg, ${color}, ${a(color, 'c9')})` : `linear-gradient(180deg, ${a(ACC, '0b')}, ${deep(62)})`,
                      border: `1px solid ${on ? color : a(ACC, '30')}`,
                      cursor: 'pointer',
                      boxShadow: on ? `0 0 28px ${a(color, '42')}, inset 0 0 18px ${mix('white', 8)}` : `inset 0 0 18px ${a(ACC, '04')}`,
                      clipPath: 'polygon(0 0, calc(100% - 12px) 0, 100% 12px, 100% 100%, 0 100%)',
                      overflow: 'hidden',
                      animation: `holo-financeLaneIn .42s cubic-bezier(.2,.8,.2,1) ${0.34 + i * 0.06}s both`,
                    }}
                  >
                    <span style={{ position: 'absolute', inset: 0, pointerEvents: 'none', opacity: on ? .45 : .28, background: `linear-gradient(90deg, transparent, ${a(color, on ? '26' : '0d')}, transparent)` }} />
                    <span style={{ position: 'relative', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10 }}>
                      <span style={{ display: 'block', fontSize: 10, letterSpacing: '.15em' }}>{label}</span>
                      <i style={{ width: 20, height: 1, background: on ? INK : a(ACC, '66'), boxShadow: on ? `0 0 7px ${INK}` : 'none' }} />
                    </span>
                    <span style={{ position: 'relative', display: 'block', marginTop: 5, ...financeMicro({ letterSpacing: '.08em', color: on ? a(INK, 'aa') : a(ACC, '86') }) }}>{lane} // {sub}</span>
                  </button>
                )
              })}
            </nav>

            <section key={tab} className="holo-finance-room-instrument" style={{ position: 'relative', border: `1px solid ${a(activeMeta[2], '30')}`, background: `radial-gradient(circle at 50% 0%, ${a(activeMeta[2], '10')}, transparent 42%), linear-gradient(180deg, ${a(activeMeta[2], '07')}, ${a(ACC, '04')})`, boxShadow: `inset 0 0 54px ${a(activeMeta[2], '07')}`, padding: 'clamp(10px, 1.5vw, 16px)', overflow: 'hidden', animation: 'holo-financeInstrumentIn .48s cubic-bezier(.2,.8,.2,1) .54s both' }}>
              <div style={{ position: 'absolute', top: 0, left: 0, width: 58, height: 1, background: `linear-gradient(90deg, ${a(activeMeta[2], '88')}, transparent)`, pointerEvents: 'none' }} />
              <div style={{ position: 'absolute', top: 0, right: 0, width: 58, height: 1, background: `linear-gradient(270deg, ${a(activeMeta[2], '66')}, transparent)`, pointerEvents: 'none' }} />
              {tab === 'BRIEF' && (
                <>
                  <SubTabs options={['SIGNAL', 'APPROVE', 'LEDGER', 'DECISIONS']} value={briefSub} onChange={setBriefSub} color={ACC} />
                  {briefSub === 'SIGNAL' && (
                    <RoomStage label="INTEL TRANSMISSION" color={ACC} immersive>
                      <BriefContent />
                    </RoomStage>
                  )}
                  {briefSub === 'APPROVE' && (
                    <RoomStage label="ACTION SEQUENCE" color={ACC}>
                      <ApproveContent checks={checks} stamped={stamped} onToggle={onToggle} onConfirm={onConfirm} />
                    </RoomStage>
                  )}
                  {briefSub === 'LEDGER' && (
                    <RoomStage label="EXECUTION LEDGER" color={ACC}>
                      <LedgerContent assets={finance?.sleeve_summary?.map(s => s.name)} />
                    </RoomStage>
                  )}
                  {briefSub === 'DECISIONS' && (
                    <RoomStage label="DECISION LOG" color={ACC}>
                      <BriefHistoryContent />
                    </RoomStage>
                  )}
                </>
              )}
              {tab === 'PORTFOLIO' && (
                <>
                  <SubTabs options={['HOLDINGS', 'CURVE']} value={portSub} onChange={setPortSub} color={ACC} />
                  {portSub === 'HOLDINGS' && (
                    <RoomStage label={holdings?.meta || 'PORTFOLIO ORBIT'} color={ACC} immersive>
                      <HoldingsContent sel={holdSel} onSel={setHoldSel} live={holdings} />
                    </RoomStage>
                  )}
                  {portSub === 'CURVE' && (
                    <RoomStage label="VALUE CURVE" color={ACC}>
                      <PerformanceContent />
                    </RoomStage>
                  )}
                </>
              )}
              {tab === 'BUDGET' && (
                <RoomStage label="MONTHLY LEDGER" color={ACC}>
                  <BudgetContent />
                </RoomStage>
              )}
              {tab === 'RESEARCH' && (
                <RoomStage label="MEMO LIBRARY" color={ACC}>
                  <ResearchContent />
                </RoomStage>
              )}
            </section>
          </main>
        </div>
      </div>
    </>
  )
}

function FinanceRoomMotionStyles() {
  return <style>{FINANCE_ROOM_MOTION_CSS}</style>
}

// lightweight segmented control for grouping views inside one lane
function SubTabs({ options, value, onChange, color = ACC }) {
  return (
    <div style={{ display: 'inline-flex', flexWrap: 'wrap', maxWidth: '100%', gap: 3, marginBottom: 12, padding: 3, border: `1px solid ${a(ACC, '22')}`, background: deep(58), boxShadow: `inset 0 0 18px ${a(ACC, '05')}` }}>
      {options.map(key => {
        const on = value === key
        return (
          <button key={key} onClick={() => onChange(key)} style={{ minHeight: 30, padding: '0 13px', ...financeButton({ fontWeight: 400, color: on ? INK : a(ACC, 'cc') }), background: on ? color : 'transparent', border: `1px solid ${on ? color : 'transparent'}`, cursor: 'pointer', boxShadow: on ? `0 0 18px ${mix(color, 28)}` : 'none' }}>{key}</button>
        )
      })}
    </div>
  )
}

function RoomStage({ label, color = ACC, immersive = false, children }) {
  return (
    <div style={{ position: 'relative', minHeight: immersive ? 'min(560px, 62vh)' : 'auto' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}>
        <span style={{ width: 36, height: 1, background: `linear-gradient(90deg, transparent, ${a(color, '88')})` }} />
        <span style={financeLabel({ fontSize: 9, letterSpacing: '.18em', color: a(color, 'cc') })}>{label}</span>
        <span style={{ flex: 1, height: 1, background: `linear-gradient(90deg, ${a(color, '66')}, transparent)` }} />
      </div>
      <div style={{ position: 'relative', border: immersive ? 'none' : `1px solid ${a(color, '20')}`, background: immersive ? 'transparent' : `linear-gradient(180deg, ${a(color, '06')}, ${deep(76)})`, padding: immersive ? 0 : 12, boxShadow: immersive ? 'none' : `inset 0 0 34px ${a(color, '06')}` }}>
        {children}
      </div>
    </div>
  )
}

export { TABS as FINANCE_CONTROL_ROOM_TABS }
