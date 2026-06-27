import { useState, useEffect } from 'react'
import { getFinanceRecommendation, postBriefAction } from '../../api/client'

// ── Static prototype data ──────────────────────────────────────
const THESIS_TEXT = "NVDA has pulled back 9% from its recent high on no fundamental change — this is a technical reset, not a structural break. AI infrastructure spend is accelerating, CUDA moat remains intact, and the options market is pricing in a squeeze. Entry in the $118–$122 zone offers a clean risk/reward of 1.4:1 with a hard stop at $112."

const TRACK_RECORD = [
  { week: 'WK23', ticker: 'AAPL', snippet: 'Momentum long ahead of WWDC', ret: '+3.2%', won: true },
  { week: 'WK22', ticker: 'TSLA', snippet: 'Mean reversion from oversold',  ret: '−1.8%', won: false },
  { week: 'WK21', ticker: 'MSFT', snippet: 'Cloud beat catalyst play',      ret: '+5.1%', won: true },
  { week: 'WK20', ticker: 'AMZN', snippet: 'Prime Day volume run-up',        ret: '+2.4%', won: true },
]

// ── Typewriter ────────────────────────────────────────────────
function useTypewriter(text, speed = 18) {
  const [displayed, setDisplayed] = useState('')
  const [done, setDone] = useState(false)
  useEffect(() => {
    setDisplayed('')
    setDone(false)
    let i = 0
    const tick = setInterval(() => {
      if (i <= text.length) { setDisplayed(text.slice(0, i)); i++ }
      else { setDone(true); clearInterval(tick) }
    }, speed)
    return () => clearInterval(tick)
  }, [text, speed])
  return { displayed, done }
}

export default function WeeklyBrief({ onBack }) {
  const [rec, setRec] = useState(null)
  const [actionDone, setActionDone] = useState(null) // 'approve'|'defer'|'reject'
  const [acting, setActing] = useState(false)
  const { displayed: thesisText, done: thesisDone } = useTypewriter(THESIS_TEXT, 18)

  useEffect(() => {
    getFinanceRecommendation().then(setRec).catch(() => {})
  }, [])

  async function handleAction(actionName) {
    setActing(true)
    try {
      if (rec?.brief_id) await postBriefAction(rec.brief_id, actionName)
    } catch {}
    finally {
      setActing(false)
      setActionDone(actionName)
    }
  }

  return (
    <div style={{ height: '100%', overflowY: 'auto', background: '#000', color: 'rgba(199,236,244,.92)', fontFamily: "'Saira Condensed',sans-serif", paddingBottom: 100 }}>

      {/* TOP BAR */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '13px 18px 11px', borderBottom: '1px solid rgba(32,216,236,.18)', position: 'sticky', top: 0, background: 'rgba(0,0,0,.95)', backdropFilter: 'blur(12px)', zIndex: 5 }}>
        <div style={{ display: 'flex', alignItems: 'center' }}>
          <span onClick={onBack} style={{ color: '#20d8ec', fontSize: 16, cursor: 'pointer', marginRight: 10 }}>←</span>
          <span style={{ fontFamily: 'var(--display)', fontSize: 13, fontWeight: 700, letterSpacing: '.28em', color: '#7df0ff' }}>WEEKLY BRIEF</span>
        </div>
        <span style={{ fontFamily: 'var(--mono)', fontSize: 8, color: 'rgba(32,216,236,.38)', letterSpacing: '.14em' }}>WK 24 · JUN 2026</span>
      </div>

      {/* RECOMMENDATION */}
      <div style={{ padding: '16px 18px', borderBottom: '1px solid rgba(32,216,236,.18)' }}>
        <div style={{ fontFamily: 'var(--mono)', fontSize: 8, letterSpacing: '.22em', color: 'rgba(32,216,236,.38)', marginBottom: 12 }}>THIS WEEK'S RECOMMENDATION</div>
        <div style={{ background: 'rgba(0,0,0,.9)', border: '1px solid rgba(32,216,236,.18)', position: 'relative', overflow: 'hidden' }}>
          {/* scanline */}
          <div style={{ position: 'absolute', top: 0, left: 0, right: 0, height: 1, background: 'linear-gradient(90deg,transparent,#20d8ec,transparent)', opacity: .6 }} />
          {/* corner brackets */}
          <div style={{ position: 'absolute', top: 0, left: 0, width: 10, height: 10, borderTop: '1px solid rgba(32,216,236,.5)', borderLeft: '1px solid rgba(32,216,236,.5)' }} />
          <div style={{ position: 'absolute', top: 0, right: 0, width: 10, height: 10, borderTop: '1px solid rgba(32,216,236,.5)', borderRight: '1px solid rgba(32,216,236,.5)' }} />
          <div style={{ position: 'absolute', bottom: 0, left: 0, width: 10, height: 10, borderBottom: '1px solid rgba(32,216,236,.5)', borderLeft: '1px solid rgba(32,216,236,.5)' }} />
          <div style={{ position: 'absolute', bottom: 0, right: 0, width: 10, height: 10, borderBottom: '1px solid rgba(32,216,236,.5)', borderRight: '1px solid rgba(32,216,236,.5)' }} />

          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '14px 16px 10px' }}>
            <div style={{ fontFamily: 'var(--display)', fontSize: 18, fontWeight: 700, letterSpacing: '.2em', padding: '4px 14px', border: '2px solid #4dffb4', color: '#4dffb4', background: 'rgba(77,255,180,.08)', boxShadow: '0 0 14px rgba(77,255,180,.2)' }}>BUY</div>
            <div style={{ textAlign: 'right' }}>
              <div style={{ fontFamily: 'var(--display)', fontSize: 28, fontWeight: 700, letterSpacing: '.06em', color: '#fff', filter: 'drop-shadow(0 0 10px rgba(125,240,255,.5))', lineHeight: 1 }}>NVDA</div>
              <div style={{ fontFamily: "'Saira Condensed',sans-serif", fontSize: 11, fontWeight: 300, color: 'rgba(125,188,200,.55)' }}>NVIDIA Corporation</div>
            </div>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 1, background: 'rgba(32,216,236,.18)', borderTop: '1px solid rgba(32,216,236,.18)' }}>
            {[
              ['ENTRY ZONE', '$118 – $122'],
              ['POSITION SIZE', '8% portfolio'],
              ['HORIZON', '5–7 sessions'],
            ].map(([lbl, val]) => (
              <div key={lbl} style={{ background: '#000', padding: '10px 16px' }}>
                <div style={{ fontFamily: 'var(--mono)', fontSize: 7, letterSpacing: '.18em', color: 'rgba(32,216,236,.38)', marginBottom: 4 }}>{lbl}</div>
                <div style={{ fontFamily: 'var(--mono)', fontSize: 13, color: '#7df0ff', letterSpacing: '.05em' }}>{val}</div>
              </div>
            ))}
            <div style={{ background: '#000', padding: '10px 16px' }}>
              <div style={{ fontFamily: 'var(--mono)', fontSize: 7, letterSpacing: '.18em', color: 'rgba(32,216,236,.38)', marginBottom: 4 }}>RISK LEVEL</div>
              <div style={{ display: 'flex', gap: 4, alignItems: 'center', marginTop: 2 }}>
                {[true, true, true, false, false].map((on, i) => (
                  <div key={i} style={{ width: 8, height: 8, borderRadius: '50%', background: on ? '#ffd56b' : 'rgba(255,213,107,.18)', border: on ? 'none' : '1px solid rgba(255,213,107,.25)', boxShadow: on ? '0 0 5px rgba(255,213,107,.5)' : 'none' }} />
                ))}
                <span style={{ fontFamily: 'var(--mono)', fontSize: 8, color: '#ffd56b', marginLeft: 4, letterSpacing: '.1em' }}>MEDIUM</span>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* THESIS */}
      <div style={{ padding: '16px 18px', borderBottom: '1px solid rgba(32,216,236,.18)' }}>
        <div style={{ fontFamily: 'var(--mono)', fontSize: 8, letterSpacing: '.22em', color: 'rgba(32,216,236,.38)', marginBottom: 12 }}>JARVIS THESIS</div>
        <div style={{ background: 'rgba(0,0,0,.9)', border: '1px solid rgba(32,216,236,.18)', borderLeft: '3px solid #20d8ec', padding: '14px 15px' }}>
          <div style={{ fontFamily: "'Saira Condensed',sans-serif", fontSize: 14, fontWeight: 300, lineHeight: 1.75, color: 'rgba(199,236,244,.88)' }}>
            {thesisText}
            {!thesisDone && <span style={{ display: 'inline-block', width: 7, height: 14, background: '#20d8ec', marginLeft: 2, verticalAlign: 'middle', animation: 'blink 1s step-end infinite' }} />}
          </div>
        </div>
      </div>

      {/* KEY LEVELS */}
      <div style={{ padding: '16px 18px', borderBottom: '1px solid rgba(32,216,236,.18)' }}>
        <div style={{ fontFamily: 'var(--mono)', fontSize: 8, letterSpacing: '.22em', color: 'rgba(32,216,236,.38)', marginBottom: 12 }}>KEY LEVELS</div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 8 }}>
          {[
            { type: 'TARGET', val: '$134', sub: '+10.2% upside', cls: 'target', valColor: '#4dffb4', accent: '#4dffb4' },
            { type: 'STOP LOSS', val: '$112', sub: '−7.4% risk', cls: 'stop', valColor: '#ff5c7a', accent: '#ff5c7a' },
            { type: 'SUPPORT', val: '$115', sub: '20-day SMA', cls: 'support', valColor: '#7df0ff', accent: '#20d8ec' },
          ].map(l => (
            <div key={l.type} style={{ background: 'rgba(0,0,0,.9)', border: '1px solid rgba(32,216,236,.18)', padding: '10px 12px', position: 'relative', textAlign: 'center' }}>
              <div style={{ position: 'absolute', top: 0, left: 0, width: 3, height: '100%', background: l.accent }} />
              <div style={{ fontFamily: 'var(--mono)', fontSize: 7, letterSpacing: '.16em', color: 'rgba(32,216,236,.38)', marginBottom: 5 }}>{l.type}</div>
              <div style={{ fontFamily: 'var(--display)', fontSize: 17, fontWeight: 600, letterSpacing: '.04em', color: l.valColor }}>{l.val}</div>
              <div style={{ fontFamily: 'var(--mono)', fontSize: 7, color: 'rgba(125,188,200,.55)', marginTop: 3, letterSpacing: '.08em' }}>{l.sub}</div>
            </div>
          ))}
        </div>
      </div>

      {/* RISK FLAGS */}
      <div style={{ padding: '16px 18px', borderBottom: '1px solid rgba(32,216,236,.18)' }}>
        <div style={{ fontFamily: 'var(--mono)', fontSize: 8, letterSpacing: '.22em', color: 'rgba(32,216,236,.38)', marginBottom: 12 }}>RISK FLAGS</div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {[
            'Earnings report due in 11 days — position may face volatility around the print. Consider trimming 30% before the announcement.',
            'Sector rotation risk — institutional flows showing early signs of rotation out of semiconductors into industrials this week.',
          ].map((flag, i) => (
            <div key={i} style={{ display: 'flex', alignItems: 'flex-start', gap: 10, padding: '10px 12px', border: '1px solid rgba(255,213,107,.18)', background: 'rgba(255,213,107,.03)' }}>
              <span style={{ fontSize: 12, flexShrink: 0, marginTop: 1 }}>⚠</span>
              <span style={{ fontFamily: "'Saira Condensed',sans-serif", fontSize: 13, fontWeight: 300, lineHeight: 1.5, color: 'rgba(255,213,107,.82)' }}>{flag}</span>
            </div>
          ))}
        </div>
      </div>

      {/* TRACK RECORD */}
      <div style={{ padding: '16px 18px' }}>
        <div style={{ fontFamily: 'var(--mono)', fontSize: 8, letterSpacing: '.22em', color: 'rgba(32,216,236,.38)', marginBottom: 12 }}>JARVIS TRACK RECORD · LAST 4 WEEKS</div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          {TRACK_RECORD.map(r => (
            <div key={r.week} style={{ display: 'flex', alignItems: 'center', padding: '8px 12px', border: '1px solid rgba(32,216,236,.18)', background: 'rgba(0,0,0,.9)' }}>
              <span style={{ fontFamily: 'var(--mono)', fontSize: 8, color: 'rgba(32,216,236,.38)', letterSpacing: '.12em', width: 36, flexShrink: 0 }}>{r.week}</span>
              <span style={{ fontFamily: 'var(--display)', fontSize: 14, fontWeight: 600, letterSpacing: '.06em', color: '#7df0ff', width: 52 }}>{r.ticker}</span>
              <span style={{ fontFamily: "'Saira Condensed',sans-serif", fontSize: 11, fontWeight: 300, color: 'rgba(125,188,200,.55)', flex: 1, letterSpacing: '.02em' }}>{r.snippet}</span>
              <span style={{ fontFamily: 'var(--mono)', fontSize: 11, letterSpacing: '.06em', marginLeft: 8, flexShrink: 0, color: r.won ? '#4dffb4' : '#ff5c7a' }}>{r.ret}</span>
              <span style={{ width: 16, textAlign: 'center', fontSize: 10, flexShrink: 0, marginLeft: 6, color: r.won ? undefined : '#ff5c7a' }}>{r.won ? '✓' : '✗'}</span>
            </div>
          ))}
        </div>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginTop: 10, padding: '8px 12px', border: '1px solid rgba(32,216,236,.18)', background: 'rgba(32,216,236,.04)' }}>
          <span style={{ fontFamily: 'var(--mono)', fontSize: 8, letterSpacing: '.16em', color: 'rgba(32,216,236,.38)' }}>3W WIN RATE · AVG RETURN</span>
          <span style={{ fontFamily: 'var(--display)', fontSize: 15, fontWeight: 600, color: '#4dffb4' }}>75% · +2.4%<span style={{ fontSize: 11, color: 'rgba(32,216,236,.5)' }}> /wk</span></span>
        </div>
      </div>

      {/* ACTION BAR */}
      <div style={{ position: 'fixed', bottom: 0, left: 0, right: 0, background: 'rgba(0,0,0,.97)', borderTop: '1px solid rgba(32,216,236,.18)', padding: '14px 18px 24px', backdropFilter: 'blur(12px)', zIndex: 10 }}>
        {actionDone ? (
          <div style={{ textAlign: 'center', fontFamily: 'var(--mono)', fontSize: 10, letterSpacing: '.22em', padding: '4px 0', color: actionDone === 'approve' ? '#4dffb4' : actionDone === 'reject' ? '#ff5c7a' : 'rgba(32,216,236,.38)' }}>
            {actionDone === 'approve' ? 'APPROVED — POSITION QUEUED' : actionDone === 'defer' ? 'DEFERRED TO NEXT WEEK' : 'BRIEF REJECTED'}
          </div>
        ) : (
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1.6fr', gap: 10, maxWidth: 430, margin: '0 auto' }}>
            <button onClick={() => handleAction('defer')} disabled={acting} style={{ fontFamily: 'var(--mono)', fontSize: 9, letterSpacing: '.22em', padding: '13px 0', textAlign: 'center', cursor: 'pointer', border: '1px solid rgba(32,216,236,.18)', color: 'rgba(32,216,236,.38)', background: 'transparent' }}>DEFER</button>
            <button onClick={() => handleAction('reject')} disabled={acting} style={{ fontFamily: 'var(--mono)', fontSize: 9, letterSpacing: '.22em', padding: '13px 0', textAlign: 'center', cursor: 'pointer', border: '1px solid rgba(255,92,122,.35)', color: '#ff5c7a', background: 'rgba(255,92,122,.04)' }}>REJECT</button>
            <button onClick={() => handleAction('approve')} disabled={acting} style={{ fontFamily: 'var(--mono)', fontSize: 10, fontWeight: 700, letterSpacing: '.22em', padding: '13px 0', textAlign: 'center', cursor: 'pointer', border: '1px solid #20d8ec', color: '#000', background: '#20d8ec', boxShadow: '0 0 16px rgba(32,216,236,.45)' }}>▶ APPROVE</button>
          </div>
        )}
      </div>
    </div>
  )
}
