import { useState } from 'react'
import { importPlaanExcel } from '../../api/client'

const TEXT = 'var(--phx-text)'
const DIM = 'var(--phx-body)'

function Pill({ children, tone = 'violet' }) {
  const toneClass = tone === 'good' ? ' phx-pill-good' : tone === 'warn' ? ' phx-pill-warn' : tone === 'bad' ? ' phx-pill-bad' : ''
  return <span className={`phx-pill${toneClass}`}>{children}</span>
}

function InfoRow({ label, value }) {
  return (
    <div className="phx-info-row">
      <div className="label">{label}</div>
      <div className="value">{value}</div>
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
    <div className="phx-card">
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10, marginBottom: 8 }}>
        <div style={{ fontFamily: 'var(--phx-font-display)', fontSize: 16, fontWeight: 700, letterSpacing: '.03em', color: TEXT, textTransform: 'uppercase' }}>Plaan Excel Import</div>
        <Pill tone={result ? 'good' : 'violet'}>MANUAL UPLOAD ONLY</Pill>
      </div>

      <div style={{ fontFamily: 'var(--phx-font-body)', fontSize: 12.5, color: DIM, lineHeight: 1.5, marginBottom: 12 }}>
        Download &quot;Excel - Kava&quot; from Plaan → upload it here. Do this weekly, since your schedule is only published 1-2 weeks ahead.
      </div>

      <label className={`phx-file-drop${file ? ' has-file' : ''}`} style={{ marginBottom: 8 }}>
        <input
          type="file"
          accept=".xlsx"
          hidden
          onChange={e => setFile(e.target.files?.[0] || null)}
        />
        <span className="drop-label">{file ? `✓ ${file.name}` : '⇪ SELECT KAVA EXPORT'}</span>
        <span className="drop-hint">{file ? 'Tap to choose a different file' : '.xlsx from Plaan → "Excel - Kava"'}</span>
      </label>
      <input
        value={label}
        onChange={e => setLabel(e.target.value)}
        placeholder="Optional label (e.g. July Kava export)"
        className="phx-input"
        style={{ width: '100%', boxSizing: 'border-box', padding: '10px 11px', fontSize: 13, marginBottom: 8 }}
      />
      <button
        type="button"
        onClick={handleUpload}
        disabled={!file || uploading}
        className={`phx-btn${file && !uploading ? ' phx-btn-good' : ''}`}
        style={{ width: '100%' }}
      >
        {uploading ? 'UPLOADING…' : 'UPLOAD KAVA EXPORT'}
      </button>

      {error && (
        <div className="phx-error-banner" style={{ marginTop: 10 }}>{error}</div>
      )}

      {result && (
        <div style={{ marginTop: 10 }}>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginBottom: 8 }}>
            <InfoRow label="EVENTS" value={result.event_count ?? 0} />
            <InfoRow label="AS OF" value={(result.as_of || '').slice(0, 10) || '—'} />
          </div>
          <div style={{ padding: '10px 12px', border: '1px solid color-mix(in srgb, var(--phx-positive) 25%, transparent)', borderLeft: '3px solid var(--phx-positive)', background: 'color-mix(in srgb, var(--phx-positive) 5%, transparent)', color: 'var(--phx-positive)', fontFamily: 'var(--phx-font-body)', fontSize: 12.5, lineHeight: 1.5 }}>
            Imported as &quot;{result.label}&quot;. This snapshot is now Phoenix's active Plaan source until you import again.
          </div>
        </div>
      )}
    </div>
  )
}
