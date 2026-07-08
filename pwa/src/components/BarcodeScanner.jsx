import { useEffect, useRef, useState } from 'react'

const GOLD = '#ffd166'
const ORANGE = '#ff8f2e'
const MONO = "'Share Tech Mono', monospace"

export default function BarcodeScanner({ onDetected, onClose }) {
  const videoRef = useRef(null)
  const controlsRef = useRef(null)
  const detectedRef = useRef(false)
  const [error, setError] = useState('')
  const [manual, setManual] = useState('')

  useEffect(() => {
    let active = true

    async function start() {
      // Camera requires a secure context (HTTPS or localhost).
      if (!navigator.mediaDevices?.getUserMedia) {
        setError(
          window.isSecureContext === false
            ? 'Camera blocked: this page is not HTTPS. On your phone, open the app over HTTPS or type the barcode below.'
            : 'Camera unavailable in this browser. Check camera permissions (or Brave Shields), or type the barcode below.'
        )
        return
      }
      try {
        const { BrowserMultiFormatReader } = await import('@zxing/browser')
        const reader = new BrowserMultiFormatReader()
        controlsRef.current = await reader.decodeFromVideoDevice(
          undefined,
          videoRef.current,
          result => {
            if (!active || !result || detectedRef.current) return
            detectedRef.current = true
            controlsRef.current?.stop()
            onDetected(result.getText())
          },
        )
      } catch (scanError) {
        if (!active) return
        const msg = scanError?.name === 'NotAllowedError'
          ? 'Camera permission denied. Allow camera access for this site, or type the barcode below.'
          : scanError?.name === 'NotFoundError'
            ? 'No camera found. Type the barcode below.'
            : scanError?.message || 'Camera unavailable. Type the barcode below.'
        setError(msg)
      }
    }

    start()
    return () => {
      active = false
      controlsRef.current?.stop()
    }
  }, [onDetected])

  function submitManual() {
    const code = manual.trim()
    if (!/^\d{6,14}$/.test(code)) {
      setError('Barcode should be 6–14 digits.')
      return
    }
    detectedRef.current = true
    controlsRef.current?.stop()
    onDetected(code)
  }

  return (
    <div style={{
      margin: '0 16px 12px',
      padding: '12px',
      position: 'relative',
      border: '1px solid rgba(255,209,102,.25)',
      background: 'rgba(6,12,18,.95)',
    }}>
      {/* corner brackets */}
      <div style={{ position: 'absolute', top: -1, left: -1, width: 10, height: 10, borderTop: `1px solid ${GOLD}`, borderLeft: `1px solid ${GOLD}`, pointerEvents: 'none' }} />
      <div style={{ position: 'absolute', top: -1, right: -1, width: 10, height: 10, borderTop: `1px solid ${GOLD}`, borderRight: `1px solid ${GOLD}`, pointerEvents: 'none' }} />
      <div style={{ position: 'absolute', bottom: -1, left: -1, width: 10, height: 10, borderBottom: `1px solid ${GOLD}`, borderLeft: `1px solid ${GOLD}`, pointerEvents: 'none' }} />
      <div style={{ position: 'absolute', bottom: -1, right: -1, width: 10, height: 10, borderBottom: `1px solid ${GOLD}`, borderRight: `1px solid ${GOLD}`, pointerEvents: 'none' }} />

      <div style={{ fontFamily: MONO, fontSize: 8, letterSpacing: '.22em', color: 'rgba(255,209,102,.6)', marginBottom: 8 }}>
        BARCODE SCAN
      </div>

      <div style={{ position: 'relative' }}>
        <video
          ref={videoRef}
          muted
          playsInline
          style={{ width: '100%', maxHeight: '260px', background: '#000', display: 'block' }}
        />
        {/* targeting frame over the video */}
        <div style={{ position: 'absolute', inset: '18% 12%', border: '1px solid rgba(255,209,102,.45)', pointerEvents: 'none', boxShadow: '0 0 18px rgba(255,209,102,.15) inset' }} />
      </div>

      {error && (
        <div style={{ fontFamily: MONO, fontSize: 10, lineHeight: 1.6, color: '#ff8a9b', marginTop: 8 }}>{error}</div>
      )}

      {/* manual entry fallback */}
      <div style={{ display: 'flex', gap: 8, marginTop: 10 }}>
        <input
          value={manual}
          inputMode="numeric"
          placeholder="Type barcode…"
          onChange={e => setManual(e.target.value.replace(/\D/g, ''))}
          onKeyDown={e => e.key === 'Enter' && submitManual()}
          style={{ flex: 1, minWidth: 0, padding: '10px 11px', background: 'rgba(0,0,0,.35)', border: '1px solid rgba(255,209,102,.22)', color: 'rgba(255,244,230,.94)', fontFamily: MONO, fontSize: 13, letterSpacing: '.08em', outline: 'none' }}
        />
        <button
          type="button"
          onClick={submitManual}
          style={{ padding: '10px 16px', border: `1px solid ${ORANGE}`, background: 'rgba(255,143,46,.08)', color: ORANGE, fontFamily: MONO, fontSize: 9, letterSpacing: '.18em', cursor: 'pointer' }}
        >
          LOOK UP
        </button>
      </div>

      <button
        type="button"
        onClick={onClose}
        style={{ marginTop: 8, width: '100%', padding: '9px', border: '1px solid rgba(255,209,102,.2)', color: 'rgba(255,209,102,.55)', background: 'transparent', fontFamily: MONO, fontSize: 9, letterSpacing: '.2em', cursor: 'pointer' }}
      >
        CLOSE SCANNER
      </button>
    </div>
  )
}
