import { useEffect, useState } from 'react'
import { getNutritionAcceptanceGate } from '../../api/client'

const LIME = '#9dff6f'
const LIME_BR = '#d5ffc7'
const CYAN = '#20d8ec'
const BORDER = 'rgba(32,216,236,.18)'
const MUTED = 'rgba(32,216,236,.38)'
const TEXT_DIM = 'rgba(158,204,190,.58)'
const RED = '#ff5c7a'
const AMBER = '#ffd56b'

function Pill({ children, tone = 'neutral' }) {
  const color = tone === 'pass' ? LIME : tone === 'fail' ? RED : tone === 'warn' ? AMBER : MUTED
  return (
    <span style={{
      fontFamily: 'var(--phx-font-mono)', fontSize: 8, letterSpacing: '.13em', color,
      border: `1px solid ${tone === 'pass' ? 'rgba(157,255,111,.3)' : tone === 'fail' ? 'rgba(255,92,122,.32)' : 'rgba(32,216,236,.18)'}`,
      background: tone === 'pass' ? 'rgba(157,255,111,.055)' : tone === 'fail' ? 'rgba(255,92,122,.06)' : 'rgba(32,216,236,.04)',
      padding: '3px 8px'
    }}>{children}</span>
  )
}

function fmt(value) {
  if (value === null || value === undefined) return '—'
  if (typeof value === 'number') return Number.isInteger(value) ? value.toFixed(0) : value.toFixed(1)
  return String(value)
}

export default function NutritionAcceptanceGate({ onBack }) {
  const [report, setReport] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)

  async function load() {
    setLoading(true)
    setError(null)
    try {
      const data = await getNutritionAcceptanceGate()
      setReport(data)
    } catch (err) {
      setError('Acceptance gate unavailable. Backend may be offline.')
    }
    setLoading(false)
  }

  useEffect(() => { load() }, [])

  if (loading) return <div className="phx-scope-nutrition phx-state phx-state-loading" style={{ height: '100%', background: 'var(--phx-bg)' }}><span className="code">SYNC</span><p>Running nutrition acceptance gate…</p></div>

  if (error || !report) return (
    <div style={{ height: '100%', background: 'var(--phx-bg)', color: 'rgba(220,248,236,.94)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24, textAlign: 'center' }}>
      <div>
        <div style={{ fontFamily: 'var(--phx-font-display)', fontSize: 24, color: RED, marginBottom: 8 }}>GATE OFFLINE</div>
        <div style={{ fontFamily: 'var(--phx-font-mono)', fontSize: 10, color: TEXT_DIM }}>{error || 'No report returned.'}</div>
        <button onClick={load} style={{ marginTop: 16, padding: '10px 14px', border: `1px solid rgba(157,255,111,.28)`, background: 'rgba(157,255,111,.055)', color: LIME, fontFamily: 'var(--phx-font-mono)', fontSize: 8, letterSpacing: '.16em' }}>RETRY</button>
      </div>
    </div>
  )

  const passed = report.verdict === 'PASS'
  const checks = report.checks || []
  const contracts = report.contracts || {}
  const inventory = report.inventory || {}

  return (
    <div className="phx-scope-nutrition" style={{ height: '100%', display: 'flex', flexDirection: 'column', background: 'radial-gradient(circle at 78% 4%, color-mix(in srgb, var(--phx-nutrition) 7%, transparent), transparent 34rem), linear-gradient(180deg, #081208 0%, var(--phx-bg) 42%, #04090e 100%)', color: 'rgba(220,248,236,.94)', fontFamily: 'var(--phx-font-body)' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '13px 18px 11px', borderBottom: `1px solid ${BORDER}`, position: 'sticky', top: 0, background: 'rgba(0,0,0,.96)', backdropFilter: 'blur(12px)', zIndex: 5, flexShrink: 0 }}>
        <div style={{ display: 'flex', alignItems: 'center' }}>
          <span onClick={onBack} style={{ color: CYAN, fontSize: 16, marginRight: 10, cursor: 'pointer' }}>←</span>
          <span style={{ fontFamily: 'var(--phx-font-display)', fontSize: 13, fontWeight: 700, letterSpacing: '.28em', color: LIME_BR }}>NUTRITION GATE</span>
        </div>
        <Pill tone={passed ? 'pass' : 'fail'}>{report.verdict}</Pill>
      </div>

      <div style={{ flex: 1, overflowY: 'auto', paddingBottom: 92 }}>
        <div style={{ padding: '20px 20px 18px', borderBottom: `1px solid ${BORDER}`, background: passed ? 'linear-gradient(180deg,rgba(157,255,111,.05),transparent)' : 'linear-gradient(180deg,rgba(255,92,122,.055),transparent)' }}>
          <div style={{ fontFamily: 'var(--phx-font-mono)', fontSize: 8, letterSpacing: '.22em', color: MUTED, marginBottom: 8 }}>PHOENIX NUTRITION V2.0</div>
          <div style={{ fontFamily: 'var(--phx-font-display)', fontSize: 42, fontWeight: 700, lineHeight: 1, color: passed ? LIME_BR : RED, filter: passed ? 'drop-shadow(0 0 18px rgba(157,255,111,.28))' : 'none' }}>{passed ? 'READY' : 'BLOCKED'}</div>
          <div style={{ fontFamily: 'var(--phx-font-mono)', fontSize: 8, letterSpacing: '.13em', color: TEXT_DIM, marginTop: 10 }}>
            {report.checks_passed} / {report.checks_total} CHECKS PASSED · CALENDAR-AWARE NUTRITION {report.ready_for_calendar_aware_nutrition ? 'READY' : 'NOT READY'}
          </div>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', borderBottom: `1px solid ${BORDER}` }}>
          {[
            { label: 'RECIPES', value: inventory.recipes },
            { label: 'STAPLES', value: inventory.staples },
            { label: 'BATCH SAFE', value: inventory.batch_or_unit_recipes },
          ].map((item, i) => (
            <div key={item.label} style={{ padding: '14px 10px', borderRight: i < 2 ? `1px solid ${BORDER}` : 'none', textAlign: 'center' }}>
              <div style={{ fontFamily: 'var(--phx-font-mono)', fontSize: 7, letterSpacing: '.16em', color: MUTED }}>{item.label}</div>
              <div style={{ fontFamily: 'var(--phx-font-display)', fontSize: 25, fontWeight: 700, color: LIME, marginTop: 4 }}>{fmt(item.value)}</div>
            </div>
          ))}
        </div>

        <div style={{ padding: '16px 18px', borderBottom: `1px solid ${BORDER}` }}>
          <div style={{ fontFamily: 'var(--phx-font-mono)', fontSize: 8, letterSpacing: '.22em', color: MUTED, marginBottom: 12 }}>SAFETY CONTRACTS</div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
            {Object.entries(contracts).map(([key, value]) => (
              <div key={key} style={{ padding: '10px 11px', border: `1px solid ${value ? 'rgba(157,255,111,.18)' : 'rgba(255,92,122,.18)'}`, background: value ? 'rgba(157,255,111,.025)' : 'rgba(255,92,122,.035)' }}>
                <div style={{ fontFamily: 'var(--phx-font-mono)', fontSize: 7, letterSpacing: '.12em', color: value ? LIME : RED }}>{value ? 'PASS' : 'FAIL'}</div>
                <div style={{ fontFamily: 'var(--phx-font-display)', fontSize: 14, color: '#fff', marginTop: 3 }}>{key.replaceAll('_', ' ').toUpperCase()}</div>
              </div>
            ))}
          </div>
        </div>

        <div style={{ padding: '16px 18px' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
            <span style={{ fontFamily: 'var(--phx-font-mono)', fontSize: 8, letterSpacing: '.22em', color: MUTED }}>CHECKLIST</span>
            <button onClick={load} style={{ padding: '7px 10px', border: `1px solid rgba(32,216,236,.18)`, background: 'rgba(32,216,236,.035)', color: CYAN, fontFamily: 'var(--phx-font-mono)', fontSize: 7, letterSpacing: '.14em' }}>RERUN</button>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {checks.map(check => (
              <div key={check.key} style={{ padding: '12px 12px', border: `1px solid ${check.status === 'pass' ? 'rgba(157,255,111,.15)' : 'rgba(255,92,122,.18)'}`, background: check.status === 'pass' ? 'rgba(157,255,111,.018)' : 'rgba(255,92,122,.035)' }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10 }}>
                  <div style={{ fontFamily: 'var(--phx-font-display)', fontSize: 15, fontWeight: 700, color: '#fff', letterSpacing: '.06em' }}>{check.key.replaceAll('_', ' ').toUpperCase()}</div>
                  <Pill tone={check.status === 'pass' ? 'pass' : 'fail'}>{check.status.toUpperCase()}</Pill>
                </div>
                <div style={{ fontSize: 12, lineHeight: 1.55, color: 'rgba(220,248,236,.72)', marginTop: 6 }}>{check.detail}</div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  )
}
