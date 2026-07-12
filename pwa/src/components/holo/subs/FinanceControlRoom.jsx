import { useMemo, useState } from 'react'
import { ACC, G, Y, R, W, BODY, INK, FM, FD, FB, a, mix, deep } from '../holoTokens'
import { APPROVE_CHECKS, BRIEF_TEXT, HOLDINGS } from '../holoDomains'

const TABS = ['APPROVAL', 'HOLDINGS', 'BRIEF', 'AUDIT', 'BUDGET']

const money = value => Number.isFinite(value)
  ? 'EUR ' + value.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
  : 'EUR 85.00'

const upper = value => String(value || '').replace(/_/g, ' ').toUpperCase()
const sleeveColor = sleeve => (sleeve?.dir === 'TRIM' ? R : sleeve?.dir === 'FEED' ? Y : G)

export default function FinanceControlRoom({ onClose, checks, stamped, onToggle, onConfirm, holdings, finance }) {
  const [tab, setTab] = useState('APPROVAL')
  const sleeves = holdings?.list?.length ? holdings.list : HOLDINGS
  const verified = stamped ? APPROVE_CHECKS.length : checks.filter(Boolean).length
  const armed = verified === APPROVE_CHECKS.length

  const contextRows = useMemo(() => [
    ['SOURCE', finance ? 'LIVE FINANCE' : 'FIXTURE FALLBACK', finance ? G : Y],
    ['WEEK', finance?.week_label || 'W28', W],
    ['MANUAL SAFETY', 'PHOENIX NEVER EXECUTES ORDERS', G],
  ], [finance])

  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 82, background: 'color-mix(in srgb, black 70%, transparent)', backdropFilter: 'blur(7px)', animation: 'holo-fadeIn .25s ease both' }}>
      <div style={{ position: 'absolute', inset: '18px 18px calc(70px + env(safe-area-inset-bottom))', border: `1px solid ${a(ACC, '55')}`, background: `linear-gradient(180deg, ${a(ACC, '12')}, ${deep(94)})`, boxShadow: `0 0 110px ${a(ACC, '55')}, inset 0 0 70px ${a(ACC, '08')}`, clipPath: 'polygon(0 0, calc(100% - 24px) 0, 100% 24px, 100% 100%, 0 100%)', overflow: 'hidden' }}>
        <header style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 14, padding: '14px 16px 11px', borderBottom: `1px solid ${a(ACC, '28')}`, flexWrap: 'wrap' }}>
          <div style={{ minWidth: 0 }}>
            <div style={{ fontFamily: FM, fontSize: 10, letterSpacing: '.28em', color: ACC, textShadow: `0 0 10px ${a(ACC, '66')}` }}>SYS.FINANCE // CONTROL ROOM</div>
            <div style={{ marginTop: 5, fontFamily: FB, fontSize: 25, color: W, fontWeight: 400, lineHeight: 1.1 }}>Manual capital cockpit</div>
          </div>
          <button onClick={onClose} style={{ minHeight: 36, padding: '0 14px', fontFamily: FM, fontSize: 8, letterSpacing: '.18em', color: ACC, background: deep(60), border: `1px solid ${a(ACC, '44')}`, cursor: 'pointer', flexShrink: 0 }}>RETURN TO PROJECTION</button>
        </header>

        <div style={{ display: 'flex', gap: 14, height: 'calc(100% - 78px)', padding: 14, overflow: 'auto', alignItems: 'stretch', flexWrap: 'wrap' }}>
          <main style={{ flex: '1 1 620px', minWidth: 'min(100%, 300px)', display: 'flex', flexDirection: 'column', gap: 13 }}>
            <nav style={{ display: 'flex', gap: 7, flexWrap: 'wrap', flexShrink: 0 }}>
              {TABS.map(label => (
                <button key={label} onClick={() => setTab(label)} style={{ minHeight: 34, padding: '0 13px', fontFamily: FM, fontSize: 8, letterSpacing: '.2em', color: tab === label ? INK : a(ACC, 'cc'), background: tab === label ? `linear-gradient(135deg, ${ACC}, ${a(ACC, 'bb')})` : deep(58), border: `1px solid ${tab === label ? ACC : a(ACC, '35')}`, cursor: 'pointer' }}>{label}</button>
              ))}
            </nav>
            <div style={{ minHeight: 0 }}>
              {tab === 'APPROVAL' && <ApprovalPanel checks={checks} stamped={stamped} onToggle={onToggle} onConfirm={onConfirm} verified={verified} armed={armed} finance={finance} />}
              {tab === 'HOLDINGS' && <HoldingsPanel sleeves={sleeves} meta={holdings?.meta} />}
              {tab === 'BRIEF' && <BriefPanel finance={finance} />}
              {tab === 'AUDIT' && <AuditPanel finance={finance} />}
              {tab === 'BUDGET' && <BudgetPanel finance={finance} sleeves={sleeves} />}
            </div>
          </main>
          <aside style={{ flex: '0 1 280px', minWidth: 'min(100%, 230px)', display: 'flex', flexDirection: 'column', gap: 10 }}>
            <ContextRail rows={contextRows} verified={verified} stamped={stamped} />
          </aside>
        </div>
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

function ApprovalPanel({ checks, stamped, onToggle, onConfirm, verified, armed, finance }) {
  const weekLabel = finance?.week_label || 'W28'
  const weekDone = stamped || finance?.week_done === true
  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))', gap: 12, minHeight: 0 }}>
      <RoomCard label="APPROVAL VECTOR" title={weekDone ? `${upper(weekLabel)} approved` : 'Manual buy pre-flight'}>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, minmax(0, 1fr))', gap: 10, marginBottom: 12 }}>
          <Field label="WEEK" value={upper(weekLabel)} color={ACC} />
          <Field label="DEPLOY" value={money(finance?.week_budget)} color={W} />
          <Field label="STATUS" value={weekDone ? 'RECORDED' : 'PENDING'} color={weekDone ? G : Y} />
        </div>
        <p style={{ margin: '0 0 13px', fontFamily: FB, fontSize: 15, lineHeight: 1.5, color: mix(BODY, 86) }}>
          Review the checklist, then mark the week approved. PHOENIX NEVER EXECUTES ORDERS; this room is MANUAL ONLY.
        </p>
        <button onClick={onConfirm} disabled={!armed || weekDone} style={{ minHeight: 48, width: '100%', fontFamily: FM, fontSize: 10, letterSpacing: '.22em', color: weekDone || armed ? INK : a(ACC, '70'), background: weekDone ? `linear-gradient(135deg, ${G}, ${mix(G, 72)})` : armed ? `linear-gradient(135deg, ${ACC}, ${a(ACC, 'bb')})` : deep(55), border: `1px solid ${weekDone ? G : armed ? ACC : a(ACC, '30')}`, cursor: armed && !weekDone ? 'pointer' : 'not-allowed', boxShadow: armed ? `0 0 24px ${a(ACC, '4d')}` : 'none', clipPath: 'polygon(10px 0, calc(100% - 10px) 0, 100% 50%, calc(100% - 10px) 100%, 10px 100%, 0 50%)' }}>
          {weekDone ? 'WEEK APPROVED' : armed ? 'MARK WEEK APPROVED' : `AWAITING CHECKS ${verified}/${APPROVE_CHECKS.length}`}
        </button>
      </RoomCard>

      <RoomCard label="PRE-FLIGHT CHECKS" title={`${verified} / ${APPROVE_CHECKS.length} verified`}>
        {APPROVE_CHECKS.map((ck, i) => {
          const on = stamped || checks[i]
          return (
            <button key={ck.t} onClick={() => onToggle(i)} style={{ display: 'flex', gap: 11, alignItems: 'center', width: '100%', minHeight: 58, padding: '9px 10px', marginBottom: 8, background: deep(58), border: `1px solid ${on ? mix(G, 32) : a(ACC, '28')}`, cursor: stamped ? 'default' : 'pointer', textAlign: 'left' }}>
              <span style={{ flexShrink: 0, width: 18, height: 18, display: 'grid', placeItems: 'center', border: `1px solid ${on ? G : a(ACC, '66')}`, background: on ? G : 'transparent', color: INK, fontFamily: FM, fontSize: 10 }}>{on ? 'OK' : ''}</span>
              <span style={{ flex: 1, minWidth: 0 }}>
                <span style={{ display: 'block', fontFamily: FB, fontSize: 16, color: W, lineHeight: 1.15 }}>{ck.t}</span>
                <span style={{ display: 'block', marginTop: 2, fontFamily: FM, fontSize: 7, letterSpacing: '.09em', color: a(ACC, '91') }}>{ck.s}</span>
              </span>
              <span style={{ fontFamily: FM, fontSize: 7, letterSpacing: '.14em', color: on ? G : Y }}>{on ? 'VERIFIED' : 'PENDING'}</span>
            </button>
          )
        })}
      </RoomCard>
    </div>
  )
}

function HoldingsPanel({ sleeves, meta }) {
  const [sel, setSel] = useState(0)
  const active = sleeves[Math.min(sel, sleeves.length - 1)] || sleeves[0]
  const c = sleeveColor(active)
  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'minmax(260px, 1.2fr) minmax(230px, .8fr)', gap: 12 }}>
      <RoomCard label={meta || 'SLEEVE MAP'} title="Allocation orbit">
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(126px, 1fr))', gap: 9 }}>
          {sleeves.map((sleeve, i) => {
            const color = sleeveColor(sleeve)
            const on = i === sel
            return (
              <button key={`${sleeve.name}-${i}`} onClick={() => setSel(i)} style={{ minHeight: 82, padding: 10, textAlign: 'left', background: on ? a(color, '16') : deep(58), border: `1px solid ${on ? color : a(ACC, '26')}`, cursor: 'pointer', boxShadow: on ? `0 0 18px ${a(color, '2c')}` : 'none' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <span style={{ width: 10, height: 10, borderRadius: 99, background: color, boxShadow: `0 0 10px ${color}` }} />
                  <span style={{ fontFamily: FM, fontSize: 7, letterSpacing: '.15em', color }}>{sleeve.dir}</span>
                </div>
                <div style={{ marginTop: 9, fontFamily: FB, fontSize: 15, color: W, lineHeight: 1.15 }}>{sleeve.name}</div>
                <div style={{ marginTop: 4, fontFamily: FD, fontSize: 20, fontWeight: 700, color: W }}>{Number(sleeve.w || 0).toFixed(1)}%</div>
              </button>
            )
          })}
        </div>
      </RoomCard>
      <RoomCard label="SELECTED SLEEVE" title={active?.name || 'Sleeve'}>
        <Field label="VALUE" value={active?.v || 'EUR --'} />
        <Field label="CURRENT WEIGHT" value={`${Number(active?.w || 0).toFixed(1)}%`} color={W} />
        <Field label="TARGET BAND" value={active?.target != null ? `${active.target.toFixed(1)}% TARGET` : `${active?.lo || 0}-${active?.hi || 0}%`} color={ACC} />
        <Field label="DIRECTIVE" value={active?.dir || 'HOLD'} color={c} />
        <p style={{ margin: '10px 0 0', fontFamily: FB, fontSize: 14.5, lineHeight: 1.5, color: mix(BODY, 84) }}>{active?.note || 'No sleeve detail available.'}</p>
      </RoomCard>
    </div>
  )
}

function BriefPanel({ finance }) {
  return (
    <RoomCard label="WEEKLY BRIEF" title={finance?.week_label ? `${upper(finance.week_label)} transmission` : 'W28 transmission'} style={{ height: '100%', overflow: 'hidden' }}>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: 10, marginBottom: 12 }}>
        <Field label="SOURCE" value={finance ? 'LIVE SUMMARY' : 'FIXTURE BRIEF'} color={finance ? G : Y} />
        <Field label="DRIFT" value={finance?.sleeve_summary ? `${finance.sleeve_summary.filter(s => s.band_status !== 'within_band').length} ALERTS` : '1 ALERT'} color={Y} />
        <Field label="MODE" value="READ ONLY" color={G} />
      </div>
      <div style={{ maxHeight: 'min(48vh, 420px)', overflowY: 'auto', padding: '15px 16px', border: `1px solid ${a(ACC, '22')}`, background: deep(82), fontFamily: FM, fontSize: 12, lineHeight: 1.75, letterSpacing: '.04em', color: mix(BODY, 94), whiteSpace: 'pre-wrap' }}>
        {BRIEF_TEXT}
      </div>
    </RoomCard>
  )
}

function AuditPanel({ finance }) {
  const alerts = finance?.sleeve_summary?.filter(s => s.band_status !== 'within_band') || []
  const rows = [
    ['RECOMMENDATION', finance?.week_done ? 'WINDOW RECORDED' : 'PENDING APPROVAL', finance?.week_done ? G : Y],
    ['BROKER ACTION', 'MANUAL USER ACTION REQUIRED', W],
    ['ORDER STATE', 'NO BROKER CONNECTION', G],
    ['DRIFT SCAN', `${alerts.length || 1} ALERT${(alerts.length || 1) === 1 ? '' : 'S'}`, alerts.length ? Y : G],
    ['CONSTITUTION', finance?.constitution_valid === false ? 'INVALID' : 'VALID', finance?.constitution_valid === false ? R : G],
  ]
  return (
    <RoomCard label="AUDIT STREAM" title="What happened and what is pending">
      <div style={{ display: 'grid', gap: 8 }}>
        {rows.map(([label, value, color]) => (
          <div key={label} style={{ display: 'grid', gridTemplateColumns: '150px 1fr auto', gap: 10, alignItems: 'center', minHeight: 40, padding: '0 10px', background: deep(58), border: `1px solid ${a(ACC, '20')}` }}>
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
      <RoomCard label="SAFETY" title="Manual boundary">
        <p style={{ margin: 0, fontFamily: FB, fontSize: 15, lineHeight: 1.55, color: mix(BODY, 88) }}>
          Budget view explains runway and deployment pressure only. It does not move cash, connect to a broker, or place trades.
        </p>
      </RoomCard>
    </div>
  )
}

function ContextRail({ rows, verified, stamped }) {
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
    </>
  )
}

export { TABS as FINANCE_CONTROL_ROOM_TABS }
