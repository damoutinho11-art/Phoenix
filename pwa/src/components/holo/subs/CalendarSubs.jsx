import { ACC, G, Y, R, W, BODY, FM, FD, FB, a, mix, deep, pad2 } from '../holoTokens'
import { DAY_BLOCKS, DAY_STATS, WEEK_EVENTS, WEEK_TOTALS, FEED_LANES } from '../holoDomains'
import SubShell from './SubShell'

// ── CALENDAR // TODAY RAIL — vertical 07–22h schedule with NOW line ──
// `rail` (from holoLive.mapTodayRail) supplies real events; when live and
// empty, the fixture blocks/gap/pressure-card are suppressed honestly.
export function TodaySub({ onClose, clock, rail }) {
  const isLive = !!rail
  const blocks = rail ? rail.blocks : DAY_BLOCKS
  const stats = rail ? rail.stats : DAY_STATS
  const today = new Date()
  const meta = isLive ? today.toDateString().slice(0, 10).toUpperCase() + ' · READ ONLY' : undefined
  const ticks = []
  for (let h = 7; h <= 22; h++) {
    ticks.push({
      top: (((h - 7) / 15) * 100).toFixed(1) + '%',
      label: pad2(h) + ':00',
      bg: h % 3 === 1 ? a(ACC, '26') : a(ACC, '12'),
      c: h % 3 === 1 ? a(ACC, '99') : a(ACC, '44'),
    })
  }
  const now = new Date()
  const nh = now.getHours() + now.getMinutes() / 60
  const nowTop = Math.min(100, Math.max(0, ((nh - 7) / 15) * 100)).toFixed(1) + '%'
  const nowVisible = nh >= 7 && nh <= 22
  return (
    <SubShell subKey="today" onClose={onClose} meta={meta}>
      <div style={{ display: 'flex', gap: 22, flexWrap: 'wrap' }}>
        <div style={{ flex: 1.5, minWidth: 300, position: 'relative', height: 440 }}>
          {ticks.map((tk, i) => (
            <div key={i}>
              <div style={{ position: 'absolute', left: 44, right: 0, top: tk.top, height: 1, background: tk.bg }} />
              <div style={{ position: 'absolute', left: 0, top: tk.top, transform: 'translateY(-50%)', fontFamily: FM, fontSize: 7, letterSpacing: '.1em', color: tk.c }}>{tk.label}</div>
            </div>
          ))}
          {isLive && rail.empty && (
            <div style={{ position: 'absolute', left: 56, right: 8, top: '42%', border: `1px dashed ${a(ACC, '30')}`, padding: '14px 0', textAlign: 'center', fontFamily: FM, fontSize: 8, letterSpacing: '.22em', color: a(ACC, '99') }}>
              NO EVENTS TODAY — PLAAN WINDOW EMPTY
            </div>
          )}
          {blocks.map((bl, i) => (
            <div key={i} className="phx-tap" style={{ position: 'absolute', left: 56, right: 8, top: (((bl.s - 7) / 15) * 100).toFixed(1) + '%', height: (((bl.e - bl.s) / 15) * 100).toFixed(1) + '%', borderLeft: `2px solid ${bl.c}`, background: `linear-gradient(90deg, ${mix(bl.c, 11)}, ${mix(bl.c, 3)})`, padding: '7px 11px', overflow: 'hidden', boxShadow: `inset 0 0 24px ${mix(bl.c, 4)}` }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: 10 }}>
                <span style={{ fontFamily: FB, fontSize: '16.5px', fontWeight: 400, color: W, lineHeight: 1.15, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{bl.n}</span>
                <span style={{ fontFamily: FM, fontSize: 8, letterSpacing: '.1em', color: bl.c, whiteSpace: 'nowrap' }}>{bl.time}</span>
              </div>
              <div style={{ fontFamily: FM, fontSize: 7, letterSpacing: '.12em', color: a(ACC, '99'), marginTop: 2 }}>{bl.m}</div>
            </div>
          ))}
          {!isLive && (
            <div style={{ position: 'absolute', left: 56, right: 8, top: (((17 - 7) / 15) * 100).toFixed(1) + '%', height: (((18.5 - 17) / 15) * 100).toFixed(1) + '%', border: `1px dashed ${mix(Y, 33)}`, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <span style={{ fontFamily: FM, fontSize: 7, letterSpacing: '.16em', color: Y, background: deep(80), padding: '2px 8px' }}>TRANSIT 60M + WARM-UP — 30M SLACK · TIGHT</span>
            </div>
          )}
          {nowVisible && (
            <div style={{ position: 'absolute', left: 40, right: 0, top: nowTop, zIndex: 3 }}>
              <div style={{ height: 1, background: G, boxShadow: `0 0 10px ${G}` }} />
              <span style={{ position: 'absolute', right: 0, top: -16, fontFamily: FM, fontSize: '6.5px', letterSpacing: '.16em', color: G }}>NOW {clock}</span>
              <i style={{ position: 'absolute', left: -3, top: -2.5, width: 6, height: 6, borderRadius: '50%', background: G, boxShadow: `0 0 8px ${G}` }} />
            </div>
          )}
        </div>
        <div style={{ flex: 1, minWidth: 240 }}>
          {stats.map((ds, i) => (
            <div key={i} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', padding: '9px 0', borderBottom: `1px solid ${a(ACC, '14')}` }}>
              <span style={{ fontFamily: FM, fontSize: 8, letterSpacing: '.16em', color: a(ACC, '99') }}>{ds.k}</span>
              <span style={{ fontFamily: FD, fontSize: 20, fontWeight: 600, color: ds.c }}>{ds.v}</span>
            </div>
          ))}
          {!isLive && (
            <div style={{ marginTop: 14, border: `1px solid ${mix(R, 27)}`, background: mix(R, 5), padding: '12px 14px' }}>
              <div style={{ fontFamily: FM, fontSize: '8.5px', letterSpacing: '.22em', color: R, marginBottom: 6 }}>⚠ PRESSURE POINT</div>
              <div style={{ fontFamily: FB, fontSize: 15, fontWeight: 300, lineHeight: 1.5, color: mix(BODY, 84) }}>
                Training ends 17:00; evening rehearsal calls at 18:30 across town. After transit and warm-up you hold 30 minutes of slack — pack the concert bag before the gym.
              </div>
            </div>
          )}
          <div style={{ fontFamily: FM, fontSize: 7, letterSpacing: '.14em', color: a(ACC, '99'), marginTop: 12, lineHeight: 1.8 }}>
            READ ONLY — MIRRORS PLAAN SNAPSHOT{isLive ? '' : ' · JUL 10 08:12'}<br />PHOENIX NEVER EDITS YOUR CALENDARS
          </div>
        </div>
      </div>
    </SubShell>
  )
}

// ── CALENDAR // WEEK LOAD MAP — 7 × 14 heat grid ──
export function WeekMapSub({ onClose }) {
  const hours = Array.from({ length: 14 }, (_, i) => (i % 2 === 0 ? pad2(8 + i) : ''))
  const days = Object.keys(WEEK_EVENTS).map(day => {
    const cells = []
    for (let i = 0; i < 14; i++) {
      const h = 8 + i
      const ev = WEEK_EVENTS[day].find(e => h + 0.5 > e[0] && h + 0.5 < e[1])
      cells.push(ev
        ? { bg: mix(ev[2], 80), bd: mix(ev[2], 40), sh: `0 0 10px ${mix(ev[2], 33)}` }
        : { bg: a(ACC, '0a'), bd: a(ACC, '14'), sh: 'none' })
    }
    const peak = day === 'THU'
    const today = day === 'FRI'
    return { name: day, cells, total: WEEK_TOTALS[day], hColor: today ? G : peak ? Y : a(ACC, '88'), tColor: peak ? Y : W }
  })
  const legend = [
    ['REHEARSAL', mix(W, 80)],
    ['PERFORMANCE', mix(Y, 80)],
    ['TRAINING', mix(G, 80)],
  ]
  return (
    <SubShell subKey="weekmap" onClose={onClose}>
      <div style={{ display: 'flex', gap: 9 }}>
        <div style={{ width: 30, flexShrink: 0, paddingTop: 24 }}>
          {hours.map((label, i) => (
            <div key={i} style={{ height: 16, marginBottom: 3, fontFamily: FM, fontSize: '6.5px', letterSpacing: '.08em', color: a(ACC, '99'), display: 'flex', alignItems: 'center' }}>{label}</div>
          ))}
        </div>
        {days.map(dy => (
          <div key={dy.name} style={{ flex: 1, minWidth: 0 }}>
            <div style={{ textAlign: 'center', fontFamily: FM, fontSize: 8, letterSpacing: '.18em', color: dy.hColor, marginBottom: 8, height: 16 }}>{dy.name}</div>
            {dy.cells.map((cl, i) => (
              <div key={i} style={{ height: 16, marginBottom: 3, background: cl.bg, border: `1px solid ${cl.bd}`, boxShadow: cl.sh }} />
            ))}
            <div style={{ textAlign: 'center', fontFamily: FD, fontSize: 16, fontWeight: 600, color: dy.tColor, marginTop: 5 }}>{dy.total}</div>
          </div>
        ))}
      </div>
      <div style={{ display: 'flex', gap: 16, justifyContent: 'center', marginTop: 16, borderTop: `1px solid ${a(ACC, '1a')}`, paddingTop: 12, flexWrap: 'wrap' }}>
        {legend.map(([label, c]) => (
          <span key={label} style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontFamily: FM, fontSize: '7.5px', letterSpacing: '.16em', color: a(ACC, '99') }}>
            <i style={{ width: 10, height: 10, background: c, boxShadow: `0 0 8px ${c}` }} />
            {label}
          </span>
        ))}
        <span style={{ fontFamily: FM, fontSize: '7.5px', letterSpacing: '.16em', color: Y }}>THU = PEAK LOAD · PROTECT SLEEP WED NIGHT</span>
      </div>
    </SubShell>
  )
}

// ── CALENDAR // CONNECTOR MESH — hub + 3 packet lanes ──
// `lanes` (from holoLive.mapConnectorLanes) replaces the fixture connectors.
export function FeedsSub({ onClose, lanes }) {
  const LANES = lanes || FEED_LANES
  return (
    <SubShell subKey="feeds" onClose={onClose} meta={lanes ? `${lanes.length} SOURCES · READ ONLY` : undefined}>
      <div style={{ display: 'flex', gap: 18, alignItems: 'stretch', flexWrap: 'wrap' }}>
        <div style={{ width: 180, flexShrink: 0, alignSelf: 'center', border: `1px solid ${a(ACC, '55')}`, background: `linear-gradient(180deg, ${a(ACC, '16')}, ${deep(70)})`, padding: '16px 15px', textAlign: 'center', boxShadow: `0 0 34px ${a(ACC, '1f')}`, clipPath: 'polygon(0 0, calc(100% - 12px) 0, 100% 12px, 100% 100%, 0 100%)', margin: '0 auto' }}>
          <div style={{ width: 40, height: 40, margin: '0 auto 9px', borderRadius: '50%', border: `1px solid ${a(ACC, '66')}`, background: `radial-gradient(circle, ${a(ACC, '44')} 0%, transparent 70%)`, boxShadow: `0 0 22px ${a(ACC, '66')}`, animation: 'holo-corePulse 3.6s ease-in-out infinite' }} />
          <div style={{ fontFamily: FM, fontSize: 9, letterSpacing: '.22em', color: ACC, textShadow: `0 0 10px ${a(ACC, '66')}` }}>PHOENIX<br />CAL CORE</div>
          <div style={{ fontFamily: FM, fontSize: '6.5px', letterSpacing: '.14em', color: a(ACC, '99'), marginTop: 7 }}>NORMALIZER v2<br />11 BLOCKS HELD</div>
        </div>
        <div style={{ flex: 1, minWidth: 300, display: 'flex', flexDirection: 'column', justifyContent: 'space-between', gap: 12 }}>
          {LANES.map((ln, i) => {
            const bd = mix(ln.c, 27)
            return (
              <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                <div style={{ flex: 1, position: 'relative', height: 1, borderTop: `1px dashed ${mix(ln.c, 27)}`, minWidth: 60 }}>
                  <i style={{ position: 'absolute', top: -3, left: 0, width: 6, height: 6, borderRadius: '50%', background: ln.c, boxShadow: `0 0 8px ${ln.c}`, animation: `holo-packetX ${ln.dur} linear infinite`, animationDelay: ln.delay }} />
                </div>
                <div style={{ width: 230, flexShrink: 0, border: `1px solid ${bd}`, background: deep(60), padding: '11px 13px' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 7 }}>
                    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontFamily: FM, fontSize: '8.5px', letterSpacing: '.18em', color: ln.c }}>
                      <i style={{ width: 4, height: 4, background: 'currentColor', boxShadow: '0 0 6px currentColor' }} />
                      {ln.name}
                    </span>
                    <span style={{ fontFamily: FM, fontSize: 7, letterSpacing: '.16em', color: ln.c, border: `1px solid ${bd}`, padding: '2px 7px' }}>{ln.st}</span>
                  </div>
                  {[['LAST SYNC', ln.sync], ['SCOPE', ln.scope]].map(([k, v]) => (
                    <div key={k} style={{ display: 'flex', justifyContent: 'space-between', fontFamily: FM, fontSize: 7, letterSpacing: '.08em', color: a(ACC, '99'), padding: '3px 0', borderTop: `1px solid ${a(ACC, '12')}` }}>
                      <span>{k}</span><span style={{ color: W }}>{v}</span>
                    </div>
                  ))}
                </div>
              </div>
            )
          })}
        </div>
      </div>
      <div style={{ textAlign: 'center', fontFamily: FM, fontSize: '7.5px', letterSpacing: '.18em', color: a(ACC, '99'), marginTop: 16, borderTop: `1px solid ${a(ACC, '1a')}`, paddingTop: 12 }}>
        NO WRITE CLIENT SHIPPED — PHOENIX READS, NEVER EDITS YOUR CALENDARS
      </div>
    </SubShell>
  )
}
