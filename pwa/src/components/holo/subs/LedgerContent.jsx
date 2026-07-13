import { useEffect, useState } from 'react'
import { ACC, G, Y, R, W, BODY, INK, FM, FD, FB, a, mix, deep } from '../holoTokens'
import {
  getFinanceLedger,
  postManualFinanceTransaction,
  getFinanceTransactionApplyPreview,
  postFinanceTransactionApply,
  postFinanceTransactionVoid,
} from '../../../api/client'
import { financeBody, financeButton, financeLabel, financeMicro } from './financeReadability'

// portfolio_state holding keys — apply only works for assets already tracked
const FALLBACK_ASSETS = ['global_core_etf', 'growth_nasdaq_etf', 'quality_etf', 'btc', 'discovery', 'tactical_reserve', 'hype', 'tao']
const today = () => new Date().toISOString().slice(0, 10)
const eur = v => Number(v).toLocaleString('en-US', { style: 'currency', currency: 'EUR', minimumFractionDigits: 2 })
const isApplied = t => !!t.applied_at || t.portfolio_state_updated === 1 || t.portfolio_state_updated === true

const inputStyle = { width: '100%', boxSizing: 'border-box', padding: '9px 10px', fontFamily: FB, fontSize: 13 }
function Field({ label, children }) {
  return (
    <label style={{ display: 'block', minWidth: 0 }}>
      <div style={{ ...financeMicro({ color: a(ACC, '88') }), marginBottom: 5 }}>{label}</div>
      {children}
    </label>
  )
}

function RecordForm({ assets, onSaved }) {
  const [form, setForm] = useState({ asset: assets[0] || '', platform: '', amount_eur: '', units: '', price: '', currency: 'EUR', fee_eur: '0', executed_at: today(), notes: '' })
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const set = (k, v) => setForm(f => ({ ...f, [k]: v }))
  const num = v => Number(String(v).replace(',', '.'))
  const valid = form.asset && form.platform.trim() && num(form.amount_eur) > 0 && num(form.units) > 0 && num(form.price) > 0

  const submit = async () => {
    if (!valid || saving) return
    setSaving(true); setError('')
    try {
      await postManualFinanceTransaction({
        asset: form.asset,
        platform: form.platform.trim(),
        side: 'buy',
        amount_eur: num(form.amount_eur),
        units: num(form.units),
        price: num(form.price),
        currency: form.currency.trim() || 'EUR',
        fee_eur: num(form.fee_eur) || 0,
        executed_at: form.executed_at,
        notes: form.notes.trim() || null,
      })
      setForm({ asset: assets[0] || '', platform: '', amount_eur: '', units: '', price: '', currency: 'EUR', fee_eur: '0', executed_at: today(), notes: '' })
      onSaved()
    } catch (e) {
      setError(e?.message || 'Could not save the record.')
      setSaving(false)
    }
  }

  return (
    <div style={{ border: `1px solid ${a(ACC, '20')}`, background: deep(60), padding: 13, marginBottom: 14 }}>
      <div style={{ ...financeLabel({ fontSize: 9, letterSpacing: '.16em', color: a(ACC, 'cc') }), marginBottom: 11 }}>RECORD A BUY YOU PLACED</div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(120px, 1fr))', gap: 10 }}>
        <Field label="ASSET">
          <select className="phx-input" style={inputStyle} value={form.asset} onChange={e => set('asset', e.target.value)}>
            {assets.map(k => <option key={k} value={k}>{k.replace(/_/g, ' ').toUpperCase()}</option>)}
          </select>
        </Field>
        <Field label="PLATFORM"><input className="phx-input" style={inputStyle} value={form.platform} placeholder="Lightyear / LHV" onChange={e => set('platform', e.target.value)} /></Field>
        <Field label="AMOUNT €"><input className="phx-input" style={inputStyle} inputMode="decimal" value={form.amount_eur} placeholder="85.00" onChange={e => set('amount_eur', e.target.value)} /></Field>
        <Field label="UNITS"><input className="phx-input" style={inputStyle} inputMode="decimal" value={form.units} placeholder="0.0012" onChange={e => set('units', e.target.value)} /></Field>
        <Field label="PRICE"><input className="phx-input" style={inputStyle} inputMode="decimal" value={form.price} placeholder="38458" onChange={e => set('price', e.target.value)} /></Field>
        <Field label="FEE €"><input className="phx-input" style={inputStyle} inputMode="decimal" value={form.fee_eur} onChange={e => set('fee_eur', e.target.value)} /></Field>
        <Field label="EXECUTED"><input className="phx-input" style={inputStyle} type="date" value={form.executed_at} onChange={e => set('executed_at', e.target.value)} /></Field>
        <Field label="CURRENCY"><input className="phx-input" style={inputStyle} value={form.currency} onChange={e => set('currency', e.target.value)} /></Field>
      </div>
      <Field label="NOTE (OPTIONAL)"><input className="phx-input" style={{ ...inputStyle, marginTop: 10 }} value={form.notes} onChange={e => set('notes', e.target.value)} /></Field>
      {error && <div style={{ color: R, fontFamily: FM, fontSize: 9, marginTop: 9 }}>{error}</div>}
      <button onClick={submit} disabled={!valid || saving} style={{ width: '100%', minHeight: 42, marginTop: 12, ...financeButton({ color: valid ? INK : a(ACC, '77') }), background: valid ? `linear-gradient(135deg, ${ACC}, ${a(ACC, 'bb')})` : deep(50), border: `1px solid ${valid ? ACC : a(ACC, '30')}`, cursor: valid && !saving ? 'pointer' : 'not-allowed' }}>
        {saving ? 'SAVING RECORD…' : 'SAVE MANUAL RECORD'}
      </button>
    </div>
  )
}

function ApplyPreview({ txId, onApplied, onCancel }) {
  const [preview, setPreview] = useState(null)
  const [error, setError] = useState('')
  const [applying, setApplying] = useState(false)

  useEffect(() => {
    let alive = true
    getFinanceTransactionApplyPreview(txId)
      .then(p => { if (alive) setPreview(p) })
      .catch(e => { if (alive) setError(e?.message || 'Preview failed.') })
    return () => { alive = false }
  }, [txId])

  const apply = async () => {
    setApplying(true); setError('')
    try { await postFinanceTransactionApply(txId); onApplied() }
    catch (e) { setError(e?.message || 'Apply failed.'); setApplying(false) }
  }

  if (error) return <div style={{ marginTop: 8, fontFamily: FM, fontSize: 9, color: R }}>{error}</div>
  if (!preview) return <div style={{ marginTop: 8, fontFamily: FM, fontSize: 9, color: a(ACC, '99') }}>LOADING PREVIEW…</div>

  const asset = preview.asset
  const beforeH = preview.before?.holdings?.[asset]
  const afterH = preview.after?.holdings?.[asset]
  return (
    <div style={{ marginTop: 9, padding: '10px 12px', border: `1px solid ${a(ACC, '26')}`, background: deep(66) }}>
      <div style={{ ...financeLabel({ fontSize: 9, letterSpacing: '.16em', color: a(ACC, '99') }), marginBottom: 7 }}>APPLY TO PORTFOLIO STATE — PREVIEW</div>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, fontFamily: FD, fontSize: 18, fontWeight: 700, color: W }}>
        <span>{eur(beforeH ?? 0)}</span>
        <span style={{ color: ACC, fontSize: 14 }}>→</span>
        <span style={{ color: G }}>{eur(afterH ?? 0)}</span>
        <span style={{ fontFamily: FM, fontSize: 9, color: a(ACC, '99'), letterSpacing: '.1em' }}>+{preview.units_delta} UNITS</span>
      </div>
      <div style={{ marginTop: 7, ...financeBody({ fontSize: 13, lineHeight: 1.6, color: a(ACC, '88') }) }}>
        Updates your tracked portfolio state and records a performance snapshot. No broker action, no order placed.
      </div>
      <div style={{ display: 'flex', gap: 8, marginTop: 10 }}>
        <button onClick={onCancel} disabled={applying} style={{ flex: 1, minHeight: 38, ...financeButton({ fontWeight: 400, color: a(ACC, 'cc') }), background: deep(50), border: `1px solid ${a(ACC, '30')}`, cursor: 'pointer' }}>CANCEL</button>
        <button onClick={apply} disabled={applying} style={{ flex: 2, minHeight: 38, ...financeButton({ color: INK }), background: `linear-gradient(135deg, ${G}, ${mix(G, 73)})`, border: `1px solid ${G}`, cursor: applying ? 'wait' : 'pointer' }}>{applying ? 'APPLYING…' : 'CONFIRM APPLY'}</button>
      </div>
    </div>
  )
}

function TxRow({ tx, onChanged, onApplyOpen, applyOpen, onApplied }) {
  const [voiding, setVoiding] = useState(false)
  const applied = isApplied(tx)
  const voided = !!tx.voided_at
  const color = voided ? a(ACC, '55') : applied ? G : Y
  const label = voided ? 'VOIDED' : applied ? 'APPLIED' : 'PENDING'

  const voidTx = async () => {
    setVoiding(true)
    try { await postFinanceTransactionVoid(tx.id, 'Voided from ledger'); onChanged() }
    catch { setVoiding(false) }
  }

  return (
    <div style={{ border: `1px solid ${a(ACC, '18')}`, borderLeft: `3px solid ${color}`, background: deep(58) }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10, alignItems: 'flex-start', padding: '11px 13px' }}>
        <div style={{ minWidth: 0 }}>
          <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, flexWrap: 'wrap' }}>
            <span style={{ fontFamily: FD, fontSize: 17, fontWeight: 700, color: W }}>{String(tx.asset).replace(/_/g, ' ').toUpperCase()}</span>
            <span style={{ fontFamily: FM, fontSize: 9, color: ACC }}>{eur(tx.amount_eur)}</span>
            <span style={{ fontFamily: FM, fontSize: 9, color: a(ACC, '99') }}>{tx.units} U · {tx.platform}</span>
          </div>
          <div style={{ fontFamily: FM, fontSize: 9, color: a(ACC, '77'), letterSpacing: '.1em', marginTop: 4 }}>EXECUTED {String(tx.executed_at).slice(0, 10)}{tx.fee_eur ? ` · FEE ${eur(tx.fee_eur)}` : ''}</div>
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 6, flexShrink: 0 }}>
          <span style={{ fontFamily: FM, fontSize: 9, letterSpacing: '.14em', padding: '2px 7px', border: `1px solid ${mix(color, 40)}`, color }}>{label}</span>
          {!applied && !voided && (
            <span style={{ display: 'flex', gap: 6 }}>
              <button onClick={() => onApplyOpen(applyOpen ? null : tx.id)} style={{ minHeight: 28, padding: '0 10px', fontFamily: FM, fontSize: 9, letterSpacing: '.14em', color: G, background: mix(G, 8), border: `1px solid ${mix(G, 36)}`, cursor: 'pointer' }}>{applyOpen ? 'CLOSE' : 'APPLY'}</button>
              <button onClick={voidTx} disabled={voiding} title="Void record" style={{ minHeight: 28, padding: '0 8px', fontFamily: FM, fontSize: 9, color: mix(R, 55), background: 'none', border: `1px solid ${mix(R, 26)}`, cursor: 'pointer' }}>{voiding ? '…' : '✕'}</button>
            </span>
          )}
        </div>
      </div>
      {applyOpen && (
        <div style={{ padding: '0 13px 12px' }}>
          <ApplyPreview txId={tx.id} onApplied={onApplied} onCancel={() => onApplyOpen(null)} />
        </div>
      )}
    </div>
  )
}

// ── FINANCE // LEDGER — record the buys you placed, then apply to state ──
// This is the "after I buy" step: log the executed BTC/ETF orders, then
// apply each to portfolio state (which also records a performance snapshot).
export function LedgerContent({ assets }) {
  const assetOptions = assets?.length ? assets : FALLBACK_ASSETS
  const [ledger, setLedger] = useState(null)
  const [error, setError] = useState(false)
  const [applyId, setApplyId] = useState(null)

  const load = () => {
    getFinanceLedger()
      .then(r => setLedger(Array.isArray(r.transactions) ? r.transactions : []))
      .catch(() => setError(true))
  }
  useEffect(() => { load() }, [])

  if (error) return <div style={{ padding: '20px 0', ...financeLabel({ fontSize: 9, color: R }) }}>UNABLE TO LOAD LEDGER</div>
  if (ledger === null) return <div style={{ padding: '48px 0', textAlign: 'center', ...financeLabel({ fontSize: 9, letterSpacing: '.18em', color: a(ACC, '99') }) }}>LOADING LEDGER…</div>

  const pending = ledger.filter(t => !isApplied(t) && !t.voided_at).length

  return (
    <div>
      <div style={{ padding: '9px 11px', border: `1px solid ${mix(G, 22)}`, background: mix(G, 4), ...financeMicro({ color: G, lineHeight: 1.6 }), marginBottom: 12 }}>
        MANUAL RECORD ONLY · PHOENIX NEVER EXECUTES · YOU PLACE THE ORDER, THEN LOG IT HERE
      </div>

      <RecordForm assets={assetOptions} onSaved={load} />

      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
        <span style={{ fontFamily: FM, fontSize: 9, letterSpacing: '.16em', color: a(ACC, 'cc') }}>RECORDED BUYS</span>
        <span style={{ fontFamily: FM, fontSize: 9, color: pending ? Y : a(ACC, '99') }}>{ledger.length} · {pending} PENDING</span>
      </div>

      {ledger.length === 0 && (
        <div style={{ padding: '28px 16px', border: `1px solid ${a(ACC, '18')}`, background: deep(58), textAlign: 'center', fontFamily: FB, fontSize: 13, lineHeight: 1.7, color: mix(BODY, 65) }}>
          No buys recorded yet. After you place a buy in your broker, record it above and apply it to portfolio state.
        </div>
      )}

      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        {ledger.map(tx => (
          <TxRow
            key={tx.id}
            tx={tx}
            applyOpen={applyId === tx.id}
            onApplyOpen={setApplyId}
            onChanged={load}
            onApplied={() => { setApplyId(null); load() }}
          />
        ))}
      </div>
    </div>
  )
}
