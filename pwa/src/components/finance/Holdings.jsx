import { useState, useEffect } from 'react'
import { getFinanceHoldings, postJarvisChat } from '../../api/client'

// ── Static prototype mock data ────────────────────────────────
const MOCK_HOLDINGS = [
  { t: 'AAPL', n: 'Apple Inc.',         shares: 142, price: 199.50, entry: 178.20, note: 'Momentum intact. Maintaining position ahead of WWDC catalyst. No action recommended.' },
  { t: 'NVDA', n: 'NVIDIA Corp.',       shares: 48,  price: 121.80, entry: 98.40,  note: 'Under earnings pressure. Brief recommends trimming 15% before the print next week.' },
  { t: 'MSFT', n: 'Microsoft Corp.',    shares: 58,  price: 442.30, entry: 398.70, note: 'Cloud segment beating estimates. Hold — no catalyst to sell. Long-term compounder.' },
  { t: 'AMZN', n: 'Amazon.com Inc.',    shares: 36,  price: 228.60, entry: 201.30, note: 'AWS re-acceleration in progress. Prime Day volume run-up still has legs this quarter.' },
  { t: 'GOOGL',n: 'Alphabet Inc.',      shares: 52,  price: 186.40, entry: 172.10, note: 'AI monetisation beginning to show in Search CPCs. Position well-sized, hold.' },
  { t: 'META', n: 'Meta Platforms',     shares: 28,  price: 582.10, entry: 510.40, note: 'Threads engagement growing. Reels ad load near peak — watch for margin guide.' },
  { t: 'BRK.B',n: 'Berkshire Hathaway',shares: 44,  price: 484.20, entry: 468.90, note: 'Defensive anchor. Cash allocation at record. Buffett accumulating — follow the lead.' },
  { t: 'LLY',  n: 'Eli Lilly & Co.',   shares: 18,  price: 876.40, entry: 724.50, note: 'GLP-1 demand still outpacing supply. Long runway. Highest conviction hold in portfolio.' },
]

const CASH = 11800
const TOTAL_VALUE = MOCK_HOLDINGS.reduce((s, h) => s + h.shares * h.price, 0) + CASH

function pnl(h) { return h.shares * (h.price - h.entry) }
function pct(h) { return (h.price / h.entry - 1) * 100 }
function val(h) { return h.shares * h.price }
function fmtK(n) { return '$' + (Math.abs(n) >= 1000 ? (Math.abs(n) / 1000).toFixed(1) + 'K' : Math.abs(n).toFixed(2)) }
function fmtPrice(n) { return '$' + n.toFixed(2) }
function fmtPct(n) { return (n >= 0 ? '+' : '') + n.toFixed(1) + '%' }

const SORT_FNS = {
  value: (a, b) => val(b) - val(a),
  pnl:   (a, b) => pnl(b) - pnl(a),
  pct:   (a, b) => pct(b) - pct(a),
  alpha: (a, b) => a.t.localeCompare(b.t),
}

// ── Detail Drawer ─────────────────────────────────────────────
function Drawer({ holding, onClose, onQuickAsk }) {
  const [note, setNote] = useState(holding.note)
  const [loadingNote, setLoadingNote] = useState(false)

  // optionally enhance with JARVIS — but use static note as default
  useEffect(() => {
    // Use the hardcoded note from prototype data
    setNote(holding.note)
  }, [holding])

  const p = pnl(holding), pc = pct(holding), v = val(holding), pos = p >= 0

  return (
    <>
      <div onClick={onClose} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,.6)', opacity: 1, zIndex: 15 }} />
      <div style={{ position: 'fixed', bottom: 0, left: 0, right: 0, maxWidth: 430, margin: '0 auto', background: '#000', borderTop: '1px solid rgba(32,216,236,.18)', zIndex: 20, maxHeight: '65vh', overflowY: 'auto' }}>
        <div style={{ width: 36, height: 3, background: 'rgba(32,216,236,.18)', borderRadius: 2, margin: '10px auto 14px' }} />
        <div style={{ padding: '0 18px 30px' }}>
          <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 16 }}>
            <div>
              <div style={{ fontFamily: 'var(--display)', fontSize: 28, fontWeight: 700, letterSpacing: '.06em', color: '#fff', lineHeight: 1 }}>{holding.t}</div>
              <div style={{ fontFamily: "'Saira Condensed',sans-serif", fontSize: 12, fontWeight: 300, color: 'rgba(125,188,200,.55)', marginTop: 2 }}>{holding.n}</div>
            </div>
            <span onClick={onClose} style={{ fontFamily: 'var(--mono)', fontSize: 10, color: 'rgba(32,216,236,.38)', cursor: 'pointer', padding: 4 }}>✕ CLOSE</span>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginBottom: 16 }}>
            {[
              ['CURRENT PRICE', fmtPrice(holding.price), 'neu'],
              ['ENTRY PRICE', fmtPrice(holding.entry), 'neu'],
              ['SHARES HELD', holding.shares + ' shares', 'neu'],
              ['MARKET VALUE', '$' + v.toLocaleString('en-US', { minimumFractionDigits: 2 }), 'neu'],
              ['UNREALISED P&L', (pos ? '+' : '−') + '$' + Math.abs(p).toFixed(2) + ' (' + fmtPct(pc) + ')', pos ? 'pos' : 'neg'],
              ['PORTFOLIO WEIGHT', (v / TOTAL_VALUE * 100).toFixed(1) + '%', 'neu'],
            ].map(([lbl, val, cls]) => (
              <div key={lbl} style={{ background: 'rgba(32,216,236,.03)', border: '1px solid rgba(32,216,236,.18)', padding: '10px 12px' }}>
                <div style={{ fontFamily: 'var(--mono)', fontSize: 7, letterSpacing: '.18em', color: 'rgba(32,216,236,.38)', marginBottom: 4 }}>{lbl}</div>
                <div style={{ fontFamily: 'var(--mono)', fontSize: 13, letterSpacing: '.04em', color: cls === 'pos' ? '#4dffb4' : cls === 'neg' ? '#ff5c7a' : '#7df0ff' }}>{val}</div>
              </div>
            ))}
          </div>

          <div style={{ background: 'rgba(32,216,236,.03)', border: '1px solid rgba(32,216,236,.18)', borderLeft: '3px solid #20d8ec', padding: '11px 13px' }}>
            <div style={{ fontFamily: 'var(--mono)', fontSize: 7, letterSpacing: '.2em', color: 'rgba(32,216,236,.38)', marginBottom: 6 }}>JARVIS NOTE</div>
            <div style={{ fontFamily: "'Saira Condensed',sans-serif", fontSize: 13, fontWeight: 300, lineHeight: 1.65, color: 'rgba(199,236,244,.82)' }}>{note}</div>
          </div>

          {onQuickAsk && (
            <button
              onClick={() => { onQuickAsk(`Tell me more about ${holding.t}`); onClose() }}
              style={{ marginTop: 14, width: '100%', fontFamily: 'var(--mono)', fontSize: 9, letterSpacing: '.18em', padding: '11px 0', border: '1px solid rgba(32,216,236,.28)', color: '#20d8ec', background: 'transparent', cursor: 'pointer' }}
            >ASK JARVIS MORE</button>
          )}
        </div>
      </div>
    </>
  )
}

export default function Holdings({ onBack, onQuickAsk }) {
  const [sortKey, setSortKey] = useState('value')
  const [selected, setSelected] = useState(null)
  // API data — loaded in background but prototype data shown
  const [_apiData, setApiData] = useState(null)

  useEffect(() => {
    getFinanceHoldings().then(setApiData).catch(() => {})
  }, [])

  const sorted = [...MOCK_HOLDINGS].sort(SORT_FNS[sortKey])
  const selectedHolding = selected ? MOCK_HOLDINGS.find(h => h.t === selected) : null

  const totalMV = MOCK_HOLDINGS.reduce((s, h) => s + val(h), 0)
  const totalPnl = MOCK_HOLDINGS.reduce((s, h) => s + pnl(h), 0)
  const totalRet = (totalMV / (totalMV - totalPnl) - 1) * 100

  return (
    <div style={{ height: '100%', overflowY: 'auto', background: '#000', color: 'rgba(199,236,244,.92)', fontFamily: "'Saira Condensed',sans-serif" }}>

      {/* TOP BAR */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '13px 18px 11px', borderBottom: '1px solid rgba(32,216,236,.18)', position: 'sticky', top: 0, background: 'rgba(0,0,0,.96)', backdropFilter: 'blur(12px)', zIndex: 5 }}>
        <div style={{ display: 'flex', alignItems: 'center' }}>
          <span onClick={onBack} style={{ color: '#20d8ec', fontSize: 16, marginRight: 10, cursor: 'pointer' }}>←</span>
          <span style={{ fontFamily: 'var(--display)', fontSize: 13, fontWeight: 700, letterSpacing: '.28em', color: '#7df0ff' }}>HOLDINGS</span>
        </div>
        <span style={{ fontFamily: 'var(--mono)', fontSize: 8, color: 'rgba(32,216,236,.38)', letterSpacing: '.14em' }}>{MOCK_HOLDINGS.length} POSITIONS</span>
      </div>

      {/* SUMMARY STRIP */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', borderBottom: '1px solid rgba(32,216,236,.18)', background: 'rgba(32,216,236,.025)' }}>
        {[
          ['MARKET VALUE', fmtK(totalMV), '#7df0ff'],
          ['TOTAL P&L', '+' + fmtK(totalPnl), '#4dffb4'],
          ['RETURN', '+' + totalRet.toFixed(1) + '%', '#4dffb4'],
        ].map(([lbl, v, c]) => (
          <div key={lbl} style={{ padding: '12px 14px', borderRight: lbl !== 'RETURN' ? '1px solid rgba(32,216,236,.18)' : 'none' }}>
            <div style={{ fontFamily: 'var(--mono)', fontSize: 7, letterSpacing: '.18em', color: 'rgba(32,216,236,.38)', marginBottom: 4 }}>{lbl}</div>
            <div style={{ fontFamily: 'var(--display)', fontSize: 16, fontWeight: 600, letterSpacing: '.03em', color: c }}>{v}</div>
          </div>
        ))}
      </div>

      {/* SORT TABS */}
      <div style={{ display: 'flex', alignItems: 'center', padding: '0 18px', borderBottom: '1px solid rgba(32,216,236,.18)', overflowX: 'auto' }}>
        {[['BY VALUE', 'value'], ['BY P&L', 'pnl'], ['BY RETURN', 'pct'], ['BY TICKER', 'alpha']].map(([lbl, key]) => (
          <div key={key} onClick={() => setSortKey(key)} style={{ fontFamily: 'var(--mono)', fontSize: 8, letterSpacing: '.18em', padding: '9px 14px 8px', cursor: 'pointer', color: sortKey === key ? '#7df0ff' : 'rgba(32,216,236,.38)', borderBottom: `2px solid ${sortKey === key ? '#7df0ff' : 'transparent'}`, marginBottom: -1, transition: 'color .15s', flexShrink: 0, whiteSpace: 'nowrap' }}>
            {lbl}
          </div>
        ))}
      </div>

      {/* COLUMN HEADERS */}
      <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr 1fr 1fr', padding: '7px 14px', borderBottom: '1px solid rgba(32,216,236,.1)', background: 'rgba(32,216,236,.02)' }}>
        {['POSITION', 'PRICE', 'VALUE', 'RETURN'].map((h, i) => (
          <div key={h} style={{ fontFamily: 'var(--mono)', fontSize: 7, letterSpacing: '.16em', color: 'rgba(32,216,236,.38)', textAlign: i > 0 ? 'right' : 'left' }}>{h}</div>
        ))}
      </div>

      {/* HOLDINGS LIST */}
      <div>
        {sorted.map((h, idx) => {
          const p = pnl(h), pc = pct(h), v = val(h), pos = p >= 0
          return (
            <div
              key={h.t}
              onClick={() => setSelected(h.t)}
              style={{ display: 'grid', gridTemplateColumns: '2fr 1fr 1fr 1fr', padding: '12px 14px', borderBottom: '1px solid rgba(32,216,236,.08)', cursor: 'pointer', position: 'relative', transition: 'background .15s' }}
            >
              <div style={{ display: 'flex', flexDirection: 'column', justifyContent: 'center', gap: 2 }}>
                <div style={{ fontFamily: 'var(--display)', fontSize: 16, fontWeight: 600, letterSpacing: '.05em', color: '#7df0ff', lineHeight: 1 }}>{h.t}</div>
                <div style={{ fontFamily: "'Saira Condensed',sans-serif", fontSize: 10, fontWeight: 300, color: 'rgba(125,188,200,.55)', letterSpacing: '.03em' }}>{h.n}</div>
                <div style={{ fontFamily: 'var(--mono)', fontSize: 8, color: 'rgba(32,216,236,.38)', letterSpacing: '.08em', marginTop: 2 }}>{h.shares} SHS</div>
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', justifyContent: 'center', alignItems: 'flex-end', gap: 3 }}>
                <div style={{ fontFamily: 'var(--mono)', fontSize: 12, letterSpacing: '.05em' }}>{fmtPrice(h.price)}</div>
                <div style={{ fontFamily: 'var(--mono)', fontSize: 8, color: 'rgba(125,188,200,.55)', letterSpacing: '.05em' }}>in {fmtPrice(h.entry)}</div>
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', justifyContent: 'center', alignItems: 'flex-end', gap: 3 }}>
                <div style={{ fontFamily: 'var(--mono)', fontSize: 12, letterSpacing: '.05em' }}>{fmtK(v)}</div>
                <div style={{ fontFamily: 'var(--mono)', fontSize: 8, color: 'rgba(125,188,200,.55)', letterSpacing: '.05em' }}>{(v / TOTAL_VALUE * 100).toFixed(1)}% wt</div>
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', justifyContent: 'center', alignItems: 'flex-end', gap: 3 }}>
                <div style={{ fontFamily: 'var(--mono)', fontSize: 12, letterSpacing: '.05em', color: pos ? '#4dffb4' : '#ff5c7a' }}>{fmtPct(pc)}</div>
                <div style={{ fontFamily: 'var(--mono)', fontSize: 7, padding: '1px 5px', borderRadius: 1, background: pos ? 'rgba(77,255,180,.12)' : 'rgba(255,92,122,.08)', border: `1px solid ${pos ? 'rgba(77,255,180,.25)' : 'rgba(255,92,122,.2)'}`, color: pos ? '#4dffb4' : '#ff5c7a' }}>
                  {pos ? '+' : ''}{fmtK(p)}
                </div>
              </div>
            </div>
          )
        })}

        {/* Cash row */}
        <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr 1fr 1fr', padding: '12px 14px', borderBottom: '1px solid rgba(32,216,236,.08)', background: 'rgba(32,216,236,.02)' }}>
          <div style={{ fontFamily: 'var(--display)', fontSize: 14, fontWeight: 600, letterSpacing: '.08em', color: 'rgba(32,216,236,.5)' }}>CASH</div>
          <div />
          <div style={{ fontFamily: 'var(--mono)', fontSize: 12, color: 'rgba(32,216,236,.5)', textAlign: 'right', display: 'flex', alignItems: 'center', justifyContent: 'flex-end' }}>$11.8K</div>
          <div style={{ fontFamily: 'var(--mono)', fontSize: 9, color: 'rgba(32,216,236,.38)', textAlign: 'right', display: 'flex', alignItems: 'center', justifyContent: 'flex-end' }}>8.2% wt</div>
        </div>
      </div>

      {/* Drawer */}
      {selectedHolding && (
        <Drawer
          holding={selectedHolding}
          onClose={() => setSelected(null)}
          onQuickAsk={onQuickAsk}
        />
      )}
    </div>
  )
}
