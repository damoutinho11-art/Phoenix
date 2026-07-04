import { useState } from 'react'
import { importPlaanExcel } from '../../api/client'

const VIOLET = '#9f7dff'
const BORDER = 'rgba(32,216,236,.18)'
const MUTED = 'rgba(32,216,236,.38)'
const TEXT = 'rgba(226,222,255,.92)'
const DIM = 'rgba(181,178,216,.58)'
const LIME = '#9dff6f'
const RED = '#ff5c7a'

function Pill({ children, tone = 'violet' }) {
  const color = tone === 'good' ? LIME : tone === 'warn' ? '#ffd56b' : tone === 'bad' ? RED : VIOLET
  return <span style={{ fontFamily: 'var(--mono)', fontSize: 7, letterSpacing: '.14em', color, border: `1px solid ${color}55`, padding: '3px 7px', background: `${color}12` }}>{children}</span>
}

function InfoRow({ label, value }) {
  return (
    <div style={{ border: `1px solid ${BORDER}`, background: 'rgba(0,0,0,.2)', padding: 11 }}>
      <div style={{ fontFamily: 'var(--mono)', fontSize: 7, letterSpacing: '.16em', color: MUTED }}>{label}</div>
      <div style={{ fontFamily: 'var(--display)', fontSize: 18, fontWeight: 700, color: TEXT, marginTop: 4 }}>{value}</div>
    </div>
  )
}

export default function PlaanExcelImport({ onImported } = {}) {
  const [file, setFile] = useState(null)
  const [label, setLabel] = useState('')
  const [uploading, setUploading] = useState(false)
  const [result, setResult] = useState(null)
  const [error, setError] = useState('')

  async function handleUpload() {
    if (!file) return
    setUploading(true)
    setError('')
    setResult(null)
    try {
      const response = await importPlaanExcel(file, label.trim() || 'manual Plaan Excel import')
      setResult(response)
      onImported && onImported()
    } catch (err) {
      setError(err?.message || 'Excel import failed.')
    } finally {
      setUploading(false)
    }
  }

  return (
    <div style={{ border: `1px solid ${BORDER}`, background: 'rgba(0,0,0,.22)', padding: 14 }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
        <div style={{ fontFamily: 'var(--display)', fontSize: 14, fontWeight: 700, color: TEXT }}>Plaan Excel Import</div>
        <Pill tone={result ? 'good' : 'violet'}>MANUAL UPLOAD ONLY</Pill>
      </div>

      <div style={{ fontSize: 11.5, color: DIM, lineHeight: 1.45, marginBottom: 10 }}>
        Download &quot;Excel - Kava&quot; from Plaan → upload it here. Do this weekly, since your schedule is only published 1-2 weeks ahead.
      </div>

      <input
        type="file"
        accept=".xlsx"
        onChange={e => setFile(e.target.files?.[0] || null)}
        style={{ width: '100%', boxSizing: 'border-box', border: `1px solid ${BORDER}`, background: 'rgba(0,0,0,.55)', color: TEXT, padding: '9px 10px', fontFamily: 'var(--mono)', fontSize: 9, outline: 'none', marginBottom: 8 }}
      />
      <input
        value={label}
        onChange={e => setLabel(e.target.value)}
        placeholder="Optional label (e.g. July Kava export)"
        style={{ width: '100%', boxSizing: 'border-box', border: `1px solid ${BORDER}`, background: 'rgba(0,0,0,.55)', color: TEXT, padding: '9px 10px', fontFamily: 'var(--mono)', fontSize: 9, outline: 'none', marginBottom: 8 }}
      />
      <button
        type="button"
        onClick={handleUpload}
        disabled={!file || uploading}
        style={{ width: '100%', padding: '9px', border: `1px solid ${file && !uploading ? 'rgba(157,255,111,.35)' : BORDER}`, background: file && !uploading ? 'rgba(157,255,111,.08)' : 'rgba(32,216,236,.025)', color: file && !uploading ? LIME : MUTED, fontFamily: 'var(--mono)', fontSize: 8, letterSpacing: '.16em', cursor: file && !uploading ? 'pointer' : 'not-allowed' }}
      >
        {uploading ? 'UPLOADING…' : 'UPLOAD KAVA EXPORT'}
      </button>

      {error && (
        <div style={{ marginTop: 10, padding: 11, border: `1px solid rgba(255,92,122,.25)`, background: 'rgba(255,92,122,.05)', color: RED, fontSize: 12, lineHeight: 1.45 }}>{error}</div>
      )}

      {result && (
        <div style={{ marginTop: 10 }}>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginBottom: 8 }}>
            <InfoRow label="EVENTS" value={result.event_count ?? 0} />
            <InfoRow label="AS OF" value={(result.as_of || '').slice(0, 10) || '—'} />
          </div>
          <div style={{ padding: 10, border: `1px solid rgba(157,255,111,.18)`, background: 'rgba(157,255,111,.03)', color: LIME, fontSize: 11.5, lineHeight: 1.45 }}>
            Imported as &quot;{result.label}&quot;. This snapshot is now Phoenix's active Plaan source until you import again.
          </div>
        </div>
      )}
    </div>
  )
}
