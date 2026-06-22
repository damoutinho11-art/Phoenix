import { useEffect, useRef, useState } from 'react'

export default function BarcodeScanner({ onDetected, onClose }) {
  const videoRef = useRef(null)
  const controlsRef = useRef(null)
  const detectedRef = useRef(false)
  const [error, setError] = useState('')

  useEffect(() => {
    let active = true

    async function start() {
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
        if (active) setError(scanError?.message || 'Camera unavailable.')
      }
    }

    start()
    return () => {
      active = false
      controlsRef.current?.stop()
    }
  }, [onDetected])

  return (
    <div style={{
      margin: '0 16px 12px',
      padding: '12px',
      border: '1px solid #2d2818',
      borderRadius: '10px',
      background: '#111',
    }}>
      <video
        ref={videoRef}
        muted
        playsInline
        style={{ width: '100%', maxHeight: '260px', borderRadius: '8px', background: '#000' }}
      />
      {error && <div style={{ color: '#d98b8b', fontSize: '13px', marginTop: '8px' }}>{error}</div>}
      <button
        type="button"
        onClick={onClose}
        style={{
          marginTop: '8px',
          width: '100%',
          padding: '8px',
          border: '1px solid #333',
          borderRadius: '7px',
          color: '#bbb',
          background: '#181818',
        }}
      >
        Close scanner
      </button>
    </div>
  )
}
