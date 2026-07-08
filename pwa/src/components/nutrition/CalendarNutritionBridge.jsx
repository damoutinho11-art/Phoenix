import { useEffect, useState } from 'react'
import { getNutritionCalendarBridge, importCalendarPlaanSnapshot, getCalendarPlaanLatestImport } from '../../api/client'

const LIME = '#9dff6f'
const LIME_BR = '#d5ffc7'
const CYAN = '#ffd166'
const BORDER = 'rgba(255,209,102,.18)'
const MUTED = 'rgba(255,209,102,.42)'
const TEXT = 'rgba(220,248,236,.88)'
const DIM = 'rgba(158,204,190,.62)'

function Stat({ label, value }) {
  return (
    <div style={{ border: `1px solid ${BORDER}`, background: 'rgba(157,255,111,.025)', padding: '11px 10px' }}>
      <div style={{ fontFamily: 'var(--phx-font-mono)', fontSize: 7, letterSpacing: '.18em', color: MUTED }}>{label}</div>
      <div style={{ fontFamily: 'var(--phx-font-display)', fontSize: 24, lineHeight: 1, color: LIME_BR, fontWeight: 700, marginTop: 6 }}>{value}</div>
    </div>
  )
}

function PriorityPill({ priority }) {
  const color = priority === 'high' ? '#ff5c7a' : priority === 'medium' ? '#ffd56b' : LIME
  return <span style={{ border: `1px solid ${color}55`, color, padding: '2px 7px', fontFamily: 'var(--phx-font-mono)', fontSize: 7, letterSpacing: '.14em' }}>{String(priority || 'normal').toUpperCase()}</span>
}

export default function CalendarNutritionBridge({ onBack }) {
  const [data, setData] = useState(null)
  const [days, setDays] = useState(7)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [importText, setImportText] = useState('')
  const [importResult, setImportResult] = useState(null)
  const [importError, setImportError] = useState(null)
  const [latestImport, setLatestImport] = useState(null)

  async function load(nextDays = days) {
    setLoading(true)
    setError(null)
    try {
      setData(await getNutritionCalendarBridge(nextDays))
      try { setLatestImport(await getCalendarPlaanLatestImport()) } catch (_) { setLatestImport(null) }
    } catch (err) {
      setError('Calendar-aware nutrition bridge unavailable.')
    }
    setLoading(false)
  }

  async function handleImportSnapshot() {
    setImportError(null)
    setImportResult(null)
    try {
      const snapshot = JSON.parse(importText)
      const result = await importCalendarPlaanSnapshot({ snapshot, label: 'manual Plaan snapshot', source: 'manual_paste' })
      setImportResult(result)
      setImportText('')
      await load(days)
    } catch (err) {
      setImportError('Import failed. Paste normalized snapshot JSON only; no cookies, tokens, raw HTML, or credentials.')
    }
  }

  useEffect(() => { load(days) }, [])

  function setWindow(nextDays) {
    setDays(nextDays)
    load(nextDays)
  }

  if (loading) return <div className="phx-scope-nutrition phx-state phx-state-loading" style={{ height: '100%', background: 'var(--phx-bg)' }}><span className="code">SYNC</span><p>Loading calendar nutrition bridge…</p></div>
  if (error || !data) return <div style={{ height: '100%', background: 'var(--phx-bg)', color: TEXT, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24, textAlign: 'center' }}>{error || 'No calendar bridge data.'}</div>

  return (
    <div className="phx-scope-nutrition" style={{ height: '100%', display: 'flex', flexDirection: 'column', background: 'radial-gradient(circle at 78% 4%, color-mix(in srgb, var(--phx-nutrition) 7%, transparent), transparent 34rem), linear-gradient(180deg, #081208 0%, var(--phx-bg) 42%, #04090e 100%)', color: TEXT, fontFamily: 'var(--phx-font-body)' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '13px 18px 11px', borderBottom: `1px solid ${BORDER}`, position: 'sticky', top: 0, background: 'rgba(0,0,0,.96)', zIndex: 5 }}>
        <div style={{ display: 'flex', alignItems: 'center' }}>
          <span onClick={onBack} style={{ color: CYAN, fontSize: 16, marginRight: 10, cursor: 'pointer' }}>←</span>
          <span style={{ fontFamily: 'var(--phx-font-display)', fontSize: 13, fontWeight: 700, letterSpacing: '.24em', color: LIME_BR }}>CALENDAR NUTRITION</span>
        </div>
        <span style={{ fontFamily: 'var(--phx-font-mono)', fontSize: 8, letterSpacing: '.14em', color: LIME, border: `1px solid rgba(157,255,111,.32)`, padding: '2px 8px' }}>V2.3 · IMPORT</span>
      </div>

      <div style={{ flex: 1, overflowY: 'auto', paddingBottom: 92 }}>
        <div style={{ padding: '18px', borderBottom: `1px solid ${BORDER}`, background: 'linear-gradient(180deg,rgba(157,255,111,.045),transparent)' }}>
          <div style={{ fontFamily: 'var(--phx-font-mono)', fontSize: 8, letterSpacing: '.22em', color: MUTED, marginBottom: 8 }}>BRIDGE SUMMARY</div>
          <div style={{ fontFamily: 'var(--phx-font-display)', fontSize: 24, fontWeight: 700, color: '#fff', lineHeight: 1.15 }}>{data.summary}</div>
          <div style={{ fontFamily: 'var(--phx-font-mono)', fontSize: 8, letterSpacing: '.12em', color: DIM, marginTop: 10 }}>{(data.calendar_source?.active_source || 'fixture').toUpperCase().replaceAll('_', ' ')} · NO AI REQUIRED · NO AUTO LOGGING</div>
        </div>

        <div style={{ padding: '13px 18px', borderBottom: `1px solid ${BORDER}`, background: 'rgba(255,209,102,.018)' }}>
          <div style={{ fontFamily: 'var(--phx-font-mono)', fontSize: 8, letterSpacing: '.22em', color: MUTED, marginBottom: 7 }}>PLAAN SOURCE BOUNDARY</div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
            <div style={{ border: `1px solid ${BORDER}`, padding: '10px', background: 'rgba(0,0,0,.18)' }}>
              <div style={{ fontFamily: 'var(--phx-font-mono)', fontSize: 7, letterSpacing: '.16em', color: MUTED }}>SOURCE</div>
              <div style={{ fontFamily: 'var(--phx-font-display)', fontSize: 17, fontWeight: 700, color: LIME_BR, marginTop: 4 }}>{(data.calendar_source?.active_source || 'fixture').replaceAll('_', ' ').toUpperCase()}</div>
            </div>
            <div style={{ border: `1px solid ${BORDER}`, padding: '10px', background: 'rgba(0,0,0,.18)' }}>
              <div style={{ fontFamily: 'var(--phx-font-mono)', fontSize: 7, letterSpacing: '.16em', color: MUTED }}>LIVE FETCH</div>
              <div style={{ fontFamily: 'var(--phx-font-display)', fontSize: 17, fontWeight: 700, color: data.calendar_source?.live_enabled ? '#ffd56b' : CYAN, marginTop: 4 }}>{data.calendar_source?.live_enabled ? 'MANUAL ON' : 'OFF BY DEFAULT'}</div>
            </div>
          </div>
          <div style={{ fontSize: 11.5, lineHeight: 1.45, color: DIM, marginTop: 9 }}>Read-only Plaan fetcher shell: GET-only, no credentials stored, no cookies stored, no Plaan mutations, no raw page sent to AI.</div>
        </div>

        <div style={{ padding: '14px 18px', borderBottom: `1px solid ${BORDER}`, background: 'rgba(157,255,111,.018)' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10, marginBottom: 8 }}>
            <div>
              <div style={{ fontFamily: 'var(--phx-font-mono)', fontSize: 8, letterSpacing: '.22em', color: MUTED }}>MANUAL PLAAN SNAPSHOT IMPORT</div>
              <div style={{ fontSize: 11.5, color: DIM, marginTop: 5 }}>Paste normalized Phoenix snapshot JSON only. No cookies, tokens, raw HTML, credentials, or Plaan writes.</div>
            </div>
            <span style={{ fontFamily: 'var(--phx-font-mono)', fontSize: 7, letterSpacing: '.14em', color: LIME, border: `1px solid rgba(157,255,111,.22)`, padding: '3px 7px' }}>V2.3 · SAFE IMPORT</span>
          </div>
          {latestImport?.configured && <div style={{ border: `1px solid rgba(157,255,111,.14)`, background: 'rgba(157,255,111,.03)', padding: '8px 10px', marginBottom: 9, fontFamily: 'var(--phx-font-mono)', fontSize: 7.5, letterSpacing: '.09em', color: LIME_BR }}>
            ACTIVE IMPORT · {latestImport.event_count} EVENT(S) · AS OF {latestImport.as_of}
          </div>}
          <textarea
            value={importText}
            onChange={e => setImportText(e.target.value)}
            placeholder='{"as_of":"2026-08-20T09:00:00","events":[{"event_id":"reh-1","event_type":"rehearsal","title":"Othello rehearsal","date":"2026-08-20","time_start":"11:00","time_end":"15:00"}],"fetch_warnings":[]}'
            style={{ width: '100%', minHeight: 88, resize: 'vertical', boxSizing: 'border-box', border: `1px solid ${BORDER}`, background: 'rgba(0,0,0,.55)', color: TEXT, padding: 10, fontFamily: 'var(--phx-font-mono)', fontSize: 9, lineHeight: 1.45, outline: 'none' }}
          />
          <button onClick={handleImportSnapshot} disabled={!importText.trim()} style={{ marginTop: 8, width: '100%', padding: '10px 12px', border: `1px solid ${importText.trim() ? 'rgba(157,255,111,.36)' : BORDER}`, background: importText.trim() ? 'rgba(157,255,111,.08)' : 'rgba(255,209,102,.025)', color: importText.trim() ? LIME_BR : MUTED, fontFamily: 'var(--phx-font-mono)', fontSize: 8, letterSpacing: '.16em', cursor: importText.trim() ? 'pointer' : 'default' }}>IMPORT READ-ONLY SNAPSHOT</button>
          {importResult && <div style={{ marginTop: 8, fontSize: 11.5, color: LIME }}>Imported {importResult.event_count} event(s). Nutrition timing refreshed from manual snapshot.</div>}
          {importError && <div style={{ marginTop: 8, fontSize: 11.5, color: '#ff5c7a' }}>{importError}</div>}
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: 8, padding: '14px 18px', borderBottom: `1px solid ${BORDER}` }}>
          <Stat label="EVENTS" value={data.counts?.events ?? 0} />
          <Stat label="SHOWS" value={data.counts?.performances ?? 0} />
          <Stat label="REH" value={data.counts?.rehearsals ?? 0} />
          <Stat label="HIGH" value={data.counts?.high_priority_days ?? 0} />
        </div>

        <div style={{ display: 'flex', gap: 8, padding: '0 18px 14px', borderBottom: `1px solid ${BORDER}` }}>
          {[3, 7, 14].map(n => (
            <button key={n} onClick={() => setWindow(n)} style={{ flex: 1, padding: '10px 8px', border: `1px solid ${days === n ? 'rgba(157,255,111,.4)' : BORDER}`, background: days === n ? 'rgba(157,255,111,.08)' : 'rgba(255,209,102,.025)', color: days === n ? LIME_BR : MUTED, fontFamily: 'var(--phx-font-mono)', fontSize: 8, letterSpacing: '.14em' }}>{n} DAYS</button>
          ))}
        </div>

        <div style={{ padding: '16px 18px', borderBottom: `1px solid ${BORDER}` }}>
          <div style={{ fontFamily: 'var(--phx-font-mono)', fontSize: 8, letterSpacing: '.22em', color: MUTED, marginBottom: 10 }}>SAFETY CONTRACT</div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 7 }}>
            {['read_only_calendar', 'no_plaan_mutations', 'no_credentials_in_nutrition', 'no_raw_page_sent_to_ai', 'no_auto_logging', 'no_auto_shopping'].map(key => (
              <div key={key} style={{ padding: '9px 10px', border: `1px solid rgba(157,255,111,.14)`, background: 'rgba(157,255,111,.025)', fontFamily: 'var(--phx-font-mono)', fontSize: 7.5, letterSpacing: '.1em', color: data.safety?.[key] ? LIME : '#ff5c7a' }}>◆ {key.replaceAll('_', ' ').toUpperCase()}</div>
            ))}
          </div>
        </div>

        <div style={{ padding: '16px 18px' }}>
          <div style={{ fontFamily: 'var(--phx-font-mono)', fontSize: 8, letterSpacing: '.22em', color: MUTED, marginBottom: 10 }}>SCHEDULE-AWARE TIMING</div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {(data.days || []).map(day => (
              <div key={day.date} style={{ border: `1px solid ${BORDER}`, background: day.priority === 'high' ? 'rgba(255,92,122,.035)' : 'rgba(255,209,102,.02)', padding: '13px' }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
                  <div>
                    <div style={{ fontFamily: 'var(--phx-font-display)', fontSize: 18, fontWeight: 700, color: '#fff', letterSpacing: '.08em' }}>{day.date}</div>
                    <div style={{ fontFamily: 'var(--phx-font-mono)', fontSize: 7, letterSpacing: '.14em', color: DIM, marginTop: 2 }}>{day.day_type?.replaceAll('_', ' ').toUpperCase()} · {day.is_training_day ? 'TRAINING' : 'REST'}</div>
                  </div>
                  <PriorityPill priority={day.priority} />
                </div>

                {day.events?.length > 0 && <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginBottom: 9 }}>
                  {day.events.map(ev => <div key={ev.event_id} style={{ fontFamily: 'var(--phx-font-mono)', fontSize: 8, letterSpacing: '.08em', color: TEXT }}>● {ev.time_label} · {ev.event_type.toUpperCase()} · {ev.title}</div>)}
                </div>}

                <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
                  {(day.nutrition_moves || []).slice(0, 4).map(move => <div key={move} style={{ fontSize: 12, lineHeight: 1.45, color: 'rgba(220,248,236,.76)' }}>◆ {move}</div>)}
                </div>

                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginTop: 10 }}>
                  {(day.planner_adjustments || []).map(adj => <span key={adj} style={{ fontFamily: 'var(--phx-font-mono)', fontSize: 7, letterSpacing: '.11em', color: LIME, border: `1px solid rgba(157,255,111,.18)`, padding: '3px 6px' }}>{adj.replaceAll('_', ' ').toUpperCase()}</span>)}
                </div>
              </div>
            ))}
          </div>
        </div>

        {(data.fetch_warnings || []).length > 0 && <div style={{ margin: '0 18px 18px', padding: '12px', border: `1px solid rgba(255,213,107,.18)`, background: 'rgba(255,213,107,.035)' }}>
          <div style={{ fontFamily: 'var(--phx-font-mono)', fontSize: 8, letterSpacing: '.2em', color: '#ffd56b', marginBottom: 6 }}>CALENDAR SNAPSHOT WARNINGS</div>
          {(data.fetch_warnings || []).slice(0, 3).map(w => <div key={w} style={{ fontSize: 11.5, lineHeight: 1.45, color: 'rgba(220,248,236,.68)', marginBottom: 5 }}>◆ {w}</div>)}
        </div>}
      </div>
    </div>
  )
}
