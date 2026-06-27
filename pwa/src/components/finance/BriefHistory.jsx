import { useState, useEffect } from 'react'
import { getFinanceBriefHistory } from '../../api/client'

// ── Static prototype data ─────────────────────────────────────
const MOCK_BRIEFS = [
  {
    id: 1, week: 'WK24', date: 'Jun 17, 2026', ticker: 'NVDA', company: 'NVIDIA Corp.',
    action: 'BUY', status: 'pending', result: null,
    snippet: 'AI infrastructure pullback creating a clean technical entry. CUDA moat intact, earnings pressure is noise.',
    thesis: 'NVDA has pulled back 9% from its recent high on no fundamental change — this is a technical reset, not a structural break. AI infrastructure spend is accelerating and the options market is pricing a squeeze. Entry in the $118–$122 zone offers a clean 1.4:1 risk/reward.',
    entry: '$118–$122', target: '$134', stop: '$112', yourAction: 'PENDING APPROVAL',
    outcome: 'Brief awaiting your approval. Position not yet entered.', outcomeClass: 'muted',
  },
  {
    id: 2, week: 'WK23', date: 'Jun 10, 2026', ticker: 'AAPL', company: 'Apple Inc.',
    action: 'BUY', status: 'won', result: '+3.2%',
    snippet: 'Momentum long ahead of WWDC developer conference. Options flow bullish, catalyst clearly defined.',
    thesis: 'AAPL showing clean momentum into WWDC with unusual call buying at the $195 and $200 strikes. Developer sentiment improving ahead of likely AI feature announcements. Entry on any dip to $188–$192 gives exposure to a catalyst with defined risk.',
    entry: '$188–$192', target: '$205', stop: '$183', yourAction: 'APPROVED ✓',
    outcome: 'Position entered at $190.40. Target hit at $196.60 within 4 sessions. Closed for +3.2%. Stop was never threatened.', outcomeClass: 'pos',
  },
  {
    id: 3, week: 'WK22', date: 'Jun 3, 2026', ticker: 'TSLA', company: 'Tesla Inc.',
    action: 'BUY', status: 'lost', result: '−1.8%',
    snippet: 'Mean reversion from deeply oversold. RSI at 28, institutional support level holding.',
    thesis: 'TSLA has fallen 24% from recent highs and is sitting on a major institutional support zone with RSI at 28 — historically a high-probability bounce level. Risk defined by the support at $168. Expected 8–12% bounce over 5–7 sessions.',
    entry: '$172–$176', target: '$192', stop: '$168', yourAction: 'APPROVED ✓',
    outcome: 'Position entered at $174.20. Support at $168 failed on day 3. Stop triggered at $168.00. Loss of −1.8%. Macro EV sentiment deteriorated unexpectedly.', outcomeClass: 'neg',
  },
  {
    id: 4, week: 'WK21', date: 'May 27, 2026', ticker: 'MSFT', company: 'Microsoft Corp.',
    action: 'BUY', status: 'won', result: '+5.1%',
    snippet: 'Cloud beat incoming — Azure acceleration visible in channel checks ahead of earnings.',
    thesis: 'Azure growth reaccelerating based on partner channel checks showing 31% YoY. Market expecting 28%. A beat of this magnitude on cloud would trigger institutional rerating. Entry before earnings with a tight stop below $428.',
    entry: '$428–$434', target: '$468', stop: '$420', yourAction: 'APPROVED ✓',
    outcome: 'Position entered at $431.50. MSFT reported Azure +33% YoY. Gap-up open at $454. Return of +5.1% in 48 hours.', outcomeClass: 'pos',
  },
  {
    id: 5, week: 'WK20', date: 'May 20, 2026', ticker: 'AMZN', company: 'Amazon.com Inc.',
    action: 'BUY', status: 'won', result: '+2.4%',
    snippet: 'Prime Day volume run-up play. Historical pattern shows 3–5% pre-event drift over the prior 2 weeks.',
    thesis: 'Prime Day is 14 days away. Historical analysis of 8 prior Prime Day cycles shows AMZN averages +3.8% in the 2 weeks prior to the event as logistics and ad spend optimism builds.',
    entry: '$221–$225', target: '$240', stop: '$216', yourAction: 'APPROVED ✓',
    outcome: 'Position entered at $222.80. Prime Day catalyst played out. Closed at $228.20. Return of +2.4%.', outcomeClass: 'pos',
  },
  {
    id: 6, week: 'WK19', date: 'May 13, 2026', ticker: 'META', company: 'Meta Platforms',
    action: 'HOLD', status: 'deferred', result: null,
    snippet: 'Reels ad load approaching ceiling. Suggested reducing position size by 20% as a risk management measure.',
    thesis: 'META Reels ad load is approaching its historical ceiling. This is not a sell signal but a risk management inflection — reducing position by 20% locks in gains and reduces downside ahead of the next guidance cycle.',
    entry: 'N/A', target: 'N/A', stop: 'N/A', yourAction: 'DEFERRED',
    outcome: 'Brief deferred. Position maintained at full size. META subsequently rose 8% — deferral was the right call in hindsight.', outcomeClass: 'muted',
  },
  {
    id: 7, week: 'WK18', date: 'May 6, 2026', ticker: 'LLY', company: 'Eli Lilly & Co.',
    action: 'BUY', status: 'won', result: '+8.3%',
    snippet: 'GLP-1 supply constraint easing catalyst. New manufacturing capacity coming online.',
    thesis: 'LLY has been supply-constrained for 3 quarters. Q2 manufacturing data suggests new Indianapolis facility reaches full capacity this month — a demand/supply inflection that the market has not priced.',
    entry: '$810–$820', target: '$900', stop: '$788', yourAction: 'APPROVED ✓',
    outcome: 'Entered at $814.00. Manufacturing capacity news confirmed in FDA filing 9 days later. Stock ran to $882. Closed for +8.3%. Highest single-trade return this year.', outcomeClass: 'pos',
  },
  {
    id: 8, week: 'WK17', date: 'Apr 29, 2026', ticker: 'COIN', company: 'Coinbase Global',
    action: 'BUY', status: 'rejected', result: '+11.2%',
    snippet: 'Crypto regulatory clarity incoming — SEC settlement expected within 2 weeks. Asymmetric upside.',
    thesis: 'A DOJ source suggests SEC vs Coinbase reaches settlement within 2 weeks. If confirmed, COIN could re-rate 15–25% as regulatory overhang clears. Risk is defined — if no settlement, stock holds range support at $210.',
    entry: '$212–$218', target: '$260', stop: '$204', yourAction: 'REJECTED ✗',
    outcome: 'You rejected this brief. COIN subsequently rose +11.2% as the SEC settlement was announced 11 days later. Largest missed gain of the year.', outcomeClass: 'neg',
  },
]

const STATUS_COLOR = { won: '#4dffb4', lost: '#ff5c7a', pending: '#20d8ec', deferred: 'rgba(32,216,236,.22)', rejected: 'rgba(255,92,122,.3)' }
const STATUS_LABEL = { won: 'WON', lost: 'LOST', pending: 'PENDING', deferred: 'DEFERRED', rejected: 'REJECTED' }
const FILTER_KEYS = ['all', 'won', 'lost', 'pending', 'rejected']

// ── Drawer ────────────────────────────────────────────────────
function Drawer({ brief, onClose }) {
  const isPos = brief.result && brief.result.startsWith('+')
  const cls = brief.result ? (isPos ? 'pos' : 'neg') : 'muted'

  const resultLabel = brief.status === 'pending' ? 'AWAITING ACTION' : brief.status === 'deferred' ? 'DEFERRED' : brief.status === 'rejected' ? 'REJECTED — MISSED' : 'ACTUAL RETURN'
  const resultSub = brief.status === 'won' ? 'Trade closed profitably' : brief.status === 'lost' ? 'Stop loss triggered' : brief.status === 'rejected' ? 'Would have returned ' + brief.result : brief.date
  const yourActionText = { won: 'APPROVED ✓', lost: 'APPROVED ✓', deferred: 'DEFERRED →', rejected: 'REJECTED ✗', pending: 'PENDING…' }[brief.status]

  const outcomeStyle = {
    pos: { border: '1px solid rgba(77,255,180,.25)', background: 'rgba(77,255,180,.04)' },
    neg: { border: '1px solid rgba(255,92,122,.2)', background: 'rgba(255,92,122,.04)' },
    muted: { border: '1px solid rgba(32,216,236,.18)', background: 'rgba(32,216,236,.02)' },
  }[brief.outcomeClass]

  return (
    <>
      <div onClick={onClose} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,.65)', zIndex: 15 }} />
      <div style={{ position: 'fixed', bottom: 0, left: 0, right: 0, maxWidth: 430, margin: '0 auto', background: '#000', borderTop: '1px solid rgba(32,216,236,.18)', zIndex: 20, maxHeight: '78vh', overflowY: 'auto' }}>
        <div style={{ width: 36, height: 3, background: 'rgba(32,216,236,.18)', borderRadius: 2, margin: '10px auto 0' }} />
        <div style={{ padding: '16px 18px 36px' }}>

          <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 14 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 9 }}>
                  <span style={{ fontFamily: 'var(--display)', fontSize: 28, fontWeight: 700, color: '#fff', lineHeight: 1 }}>{brief.ticker}</span>
                  <span style={{ fontFamily: 'var(--display)', fontSize: 10, fontWeight: 700, letterSpacing: '.16em', padding: '2px 7px', border: '1px solid', color: brief.action === 'BUY' ? '#4dffb4' : brief.action === 'SELL' ? '#ff5c7a' : '#7df0ff', borderColor: brief.action === 'BUY' ? 'rgba(77,255,180,.35)' : brief.action === 'SELL' ? 'rgba(255,92,122,.3)' : 'rgba(125,240,255,.3)', background: brief.action === 'BUY' ? 'rgba(77,255,180,.07)' : brief.action === 'SELL' ? 'rgba(255,92,122,.05)' : 'rgba(125,240,255,.05)' }}>{brief.action}</span>
                </div>
                <div style={{ fontFamily: "'Saira Condensed',sans-serif", fontSize: 11, fontWeight: 300, color: 'rgba(125,188,200,.55)', marginTop: 2 }}>{brief.company}</div>
              </div>
            </div>
            <span onClick={onClose} style={{ fontFamily: 'var(--mono)', fontSize: 9, color: 'rgba(32,216,236,.38)', cursor: 'pointer', padding: 4 }}>✕ CLOSE</span>
          </div>

          {/* Result hero */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '12px 14px', border: '1px solid rgba(32,216,236,.18)', background: 'rgba(32,216,236,.025)', marginBottom: 12 }}>
            <div style={{ fontFamily: 'var(--display)', fontSize: 32, fontWeight: 700, lineHeight: 1, color: cls === 'pos' ? '#4dffb4' : cls === 'neg' ? '#ff5c7a' : 'rgba(32,216,236,.38)', filter: cls === 'pos' ? 'drop-shadow(0 0 8px rgba(77,255,180,.4))' : cls === 'neg' ? 'drop-shadow(0 0 8px rgba(255,92,122,.3))' : 'none' }}>{brief.result || '—'}</div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
              <div style={{ fontFamily: 'var(--mono)', fontSize: 8, letterSpacing: '.16em', color: 'rgba(32,216,236,.38)' }}>{resultLabel}</div>
              <div style={{ fontFamily: 'var(--mono)', fontSize: 10, letterSpacing: '.08em', color: 'rgba(125,188,200,.55)' }}>{resultSub}</div>
              <div style={{ fontFamily: 'var(--mono)', fontSize: 10, letterSpacing: '.08em', color: 'rgba(32,216,236,.38)' }}>{brief.week} · {brief.date}</div>
            </div>
          </div>

          {/* Key stats */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 6, marginBottom: 12 }}>
            {[['ENTRY ZONE', brief.entry], ['TARGET', brief.target], ['STOP LOSS', brief.stop], ['YOUR ACTION', yourActionText]].map(([lbl, val]) => (
              <div key={lbl} style={{ background: 'rgba(32,216,236,.025)', border: '1px solid rgba(32,216,236,.18)', padding: '9px 11px' }}>
                <div style={{ fontFamily: 'var(--mono)', fontSize: 7, letterSpacing: '.16em', color: 'rgba(32,216,236,.38)', marginBottom: 3 }}>{lbl}</div>
                <div style={{ fontFamily: 'var(--mono)', fontSize: 12, letterSpacing: '.04em', color: '#7df0ff' }}>{val}</div>
              </div>
            ))}
          </div>

          {/* Thesis */}
          <div style={{ border: '1px solid rgba(32,216,236,.18)', borderLeft: '3px solid #20d8ec', padding: '12px 13px', marginBottom: 12 }}>
            <div style={{ fontFamily: 'var(--mono)', fontSize: 7, letterSpacing: '.2em', color: 'rgba(32,216,236,.38)', marginBottom: 7 }}>JARVIS THESIS</div>
            <div style={{ fontFamily: "'Saira Condensed',sans-serif", fontSize: 13, fontWeight: 300, lineHeight: 1.7, color: 'rgba(199,236,244,.85)' }}>{brief.thesis}</div>
          </div>

          {/* Outcome */}
          <div style={{ padding: '10px 13px', ...outcomeStyle }}>
            <div style={{ fontFamily: 'var(--mono)', fontSize: 7, letterSpacing: '.2em', color: 'rgba(32,216,236,.38)', marginBottom: 5 }}>OUTCOME</div>
            <div style={{ fontFamily: "'Saira Condensed',sans-serif", fontSize: 12, fontWeight: 300, lineHeight: 1.6, color: 'rgba(199,236,244,.75)' }}>{brief.outcome}</div>
          </div>
        </div>
      </div>
    </>
  )
}

export default function BriefHistory({ onBack }) {
  const [filterKey, setFilterKey] = useState('all')
  const [selected, setSelected] = useState(null)
  // Attempt API load — fall back to mock data
  const [apiData, setApiData] = useState(null)

  useEffect(() => {
    getFinanceBriefHistory().then(r => setApiData(r)).catch(() => {})
  }, [])

  const briefs = MOCK_BRIEFS
  const filtered = filterKey === 'all' ? briefs : briefs.filter(b => b.status === filterKey)
  const selectedBrief = selected !== null ? briefs.find(b => b.id === selected) : null

  // Summary stats
  const won = briefs.filter(b => b.status === 'won').length
  const total = briefs.filter(b => ['won', 'lost'].includes(b.status)).length
  const winRate = total > 0 ? Math.round(won / total * 100) + '%' : '—'
  const rejected = briefs.filter(b => b.status === 'rejected').length

  return (
    <div style={{ height: '100%', overflowY: 'auto', background: '#000', color: 'rgba(199,236,244,.92)', fontFamily: "'Saira Condensed',sans-serif" }}>

      {/* TOP BAR */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '13px 18px 11px', borderBottom: '1px solid rgba(32,216,236,.18)', position: 'sticky', top: 0, background: 'rgba(0,0,0,.96)', backdropFilter: 'blur(12px)', zIndex: 5 }}>
        <div style={{ display: 'flex', alignItems: 'center' }}>
          <span onClick={onBack} style={{ color: '#20d8ec', fontSize: 16, marginRight: 10, cursor: 'pointer' }}>←</span>
          <span style={{ fontFamily: 'var(--display)', fontSize: 13, fontWeight: 700, letterSpacing: '.28em', color: '#7df0ff' }}>BRIEF HISTORY</span>
        </div>
        <span style={{ fontFamily: 'var(--mono)', fontSize: 8, color: 'rgba(32,216,236,.38)', letterSpacing: '.14em' }}>{briefs.length} BRIEFS</span>
      </div>

      {/* STATS STRIP */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', borderBottom: '1px solid rgba(32,216,236,.18)', background: 'rgba(32,216,236,.02)' }}>
        {[
          ['WIN RATE', winRate, '#4dffb4'],
          ['AVG RETURN', '+2.4%', '#4dffb4'],
          ['ALPHA GEN', '+$8.2K', '#7df0ff'],
          ['REJECTED ✗', String(rejected), '#ffd56b'],
        ].map(([lbl, val, c]) => (
          <div key={lbl} style={{ padding: '12px 10px', borderRight: lbl !== 'REJECTED ✗' ? '1px solid rgba(32,216,236,.18)' : 'none', textAlign: 'center' }}>
            <div style={{ fontFamily: 'var(--mono)', fontSize: 7, letterSpacing: '.14em', color: 'rgba(32,216,236,.38)', marginBottom: 4 }}>{lbl}</div>
            <div style={{ fontFamily: 'var(--display)', fontSize: 17, fontWeight: 700, letterSpacing: '.03em', color: c }}>{val}</div>
          </div>
        ))}
      </div>

      {/* FILTER TABS */}
      <div style={{ display: 'flex', padding: '0 18px', borderBottom: '1px solid rgba(32,216,236,.18)' }}>
        {FILTER_KEYS.map(key => (
          <div key={key} onClick={() => setFilterKey(key)} style={{ fontFamily: 'var(--mono)', fontSize: 8, letterSpacing: '.18em', padding: '9px 12px 8px', cursor: 'pointer', color: filterKey === key ? '#7df0ff' : 'rgba(32,216,236,.38)', borderBottom: `2px solid ${filterKey === key ? '#7df0ff' : 'transparent'}`, marginBottom: -1, transition: 'color .15s' }}>
            {key.toUpperCase()}
          </div>
        ))}
      </div>

      {/* BRIEF LIST */}
      <div style={{ display: 'flex', flexDirection: 'column' }}>
        {filtered.length === 0 && (
          <div style={{ padding: '40px 20px', textAlign: 'center', fontFamily: 'var(--mono)', fontSize: 9, letterSpacing: '.2em', color: 'rgba(32,216,236,.38)' }}>NO BRIEFS IN THIS CATEGORY</div>
        )}
        {filtered.map((b, i) => {
          const isPos = b.result && b.result.startsWith('+')
          const acColor = b.action === 'BUY' ? '#4dffb4' : b.action === 'SELL' ? '#ff5c7a' : '#7df0ff'
          const acBorder = b.action === 'BUY' ? 'rgba(77,255,180,.35)' : b.action === 'SELL' ? 'rgba(255,92,122,.3)' : 'rgba(125,240,255,.3)'
          const acBg = b.action === 'BUY' ? 'rgba(77,255,180,.07)' : b.action === 'SELL' ? 'rgba(255,92,122,.05)' : 'rgba(125,240,255,.05)'
          const statusBadgeStyle = {
            won:      { color: '#4dffb4', border: '1px solid rgba(77,255,180,.3)',    background: 'rgba(77,255,180,.07)' },
            lost:     { color: '#ff5c7a', border: '1px solid rgba(255,92,122,.25)',  background: 'rgba(255,92,122,.05)' },
            deferred: { color: 'rgba(32,216,236,.38)', border: '1px solid rgba(32,216,236,.18)', background: 'transparent' },
            rejected: { color: 'rgba(255,92,122,.6)', border: '1px solid rgba(255,92,122,.2)', background: 'transparent' },
            pending:  { color: '#20d8ec', border: '1px solid rgba(32,216,236,.35)',  background: 'rgba(32,216,236,.07)' },
          }[b.status] || {}
          const actionNoteColor = { won: 'rgba(77,255,180,.5)', lost: 'rgba(77,255,180,.5)', deferred: 'rgba(32,216,236,.35)', rejected: 'rgba(255,92,122,.45)', pending: 'rgba(32,216,236,.5)' }[b.status]
          const actionNoteText = { won: 'APPROVED', lost: 'APPROVED', deferred: 'DEFERRED', rejected: 'REJECTED', pending: 'PENDING' }[b.status]

          return (
            <div
              key={b.id}
              onClick={() => setSelected(b.id)}
              style={{ padding: '13px 15px', borderBottom: '1px solid rgba(32,216,236,.08)', cursor: 'pointer', position: 'relative', borderLeft: `3px solid ${STATUS_COLOR[b.status] || 'transparent'}`, transition: 'background .15s' }}
            >
              <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 6 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <span style={{ fontFamily: 'var(--mono)', fontSize: 8, letterSpacing: '.14em', color: 'rgba(32,216,236,.38)' }}>{b.week}</span>
                  <span style={{ fontFamily: 'var(--display)', fontSize: 10, fontWeight: 700, letterSpacing: '.16em', padding: '2px 7px', border: `1px solid ${acBorder}`, color: acColor, background: acBg }}>{b.action}</span>
                  <span style={{ fontFamily: 'var(--display)', fontSize: 18, fontWeight: 700, letterSpacing: '.05em', color: '#fff', lineHeight: 1 }}>{b.ticker}</span>
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 4 }}>
                  {b.result && <span style={{ fontFamily: 'var(--mono)', fontSize: 13, letterSpacing: '.06em', fontWeight: 600, color: isPos ? '#4dffb4' : '#ff5c7a' }}>{b.result}</span>}
                  {!b.result && <span style={{ fontFamily: 'var(--mono)', fontSize: 13, color: 'rgba(32,216,236,.38)' }}>—</span>}
                  <span style={{ fontFamily: 'var(--mono)', fontSize: 7, letterSpacing: '.14em', padding: '2px 6px', ...statusBadgeStyle }}>{STATUS_LABEL[b.status]}</span>
                </div>
              </div>
              <div style={{ fontFamily: "'Saira Condensed',sans-serif", fontSize: 12, fontWeight: 300, color: 'rgba(125,188,200,.55)', lineHeight: 1.5, display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>{b.snippet}</div>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginTop: 7 }}>
                <span style={{ fontFamily: 'var(--mono)', fontSize: 7, color: 'rgba(32,216,236,.3)', letterSpacing: '.1em' }}>{b.date}</span>
                <span style={{ fontFamily: 'var(--mono)', fontSize: 7, letterSpacing: '.1em', color: actionNoteColor }}>YOU: {actionNoteText}</span>
              </div>
            </div>
          )
        })}
      </div>

      {selectedBrief && <Drawer brief={selectedBrief} onClose={() => setSelected(null)} />}
    </div>
  )
}
