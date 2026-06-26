import { useEffect, useRef, useState } from 'react'
import Message from './Message'
import StatusBar from './StatusBar'
import BarcodeScanner from './BarcodeScanner'
import { useJarvis } from '../hooks/useJarvis'
import { stopSpeaking } from '../services/tts'

export default function Chat({ prefill, onPrefillConsumed }) {
  const { messages, apiStatus, loading, greet, send, lookupBarcodeItem } = useJarvis()
  const [input, setInput] = useState('')
  const [scannerOpen, setScannerOpen] = useState(false)
  const bottomRef = useRef(null)
  const greeted = useRef(false)

  useEffect(() => {
    if (!greeted.current) {
      greeted.current = true
      greet()
    }
  }, [greet])

  useEffect(() => {
    if (prefill && !loading) {
      onPrefillConsumed?.()
      send(prefill)
    }
  }, [prefill]) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  function handleSubmit(e) {
    e.preventDefault()
    const text = input.trim()
    if (!text || loading) return
    setInput('')
    send(text)
  }

  function handleKeyDown(e) {
    if (e.key === 'Enter' && !e.shiftKey) {
      handleSubmit(e)
    }
  }

  const canSend = !!input.trim() && !loading

  return (
    <div style={{
      display: 'flex', flexDirection: 'column', height: '100%',
      background: 'transparent', maxWidth: 680, margin: '0 auto', width: '100%',
    }}>
      <StatusBar apiStatus={apiStatus} loading={loading} />

      <div style={{ flex: 1, overflowY: 'auto', padding: 16, display: 'flex', flexDirection: 'column' }}>
        {messages.map(msg => (
          <Message key={msg.id} role={msg.role} text={msg.text} />
        ))}
        {loading && messages.length > 0 && (
          <div style={{ display: 'flex', justifyContent: 'flex-start', marginBottom: 12 }}>
            <div className="glass" style={{ padding: '10px 14px', maxWidth: '85%' }}>
              <span style={{ fontFamily: 'var(--mono)', fontSize: 9, letterSpacing: '.12em', color: 'var(--cyan)', display: 'block', marginBottom: 4 }}>
                JARVIS
              </span>
              <span style={{ color: 'var(--muted)', fontFamily: 'var(--mono)' }}>…</span>
            </div>
          </div>
        )}
        <div ref={bottomRef} />
      </div>

      {scannerOpen && (
        <BarcodeScanner
          onDetected={barcode => {
            setScannerOpen(false)
            lookupBarcodeItem(barcode)
          }}
          onClose={() => setScannerOpen(false)}
        />
      )}

      <form
        onSubmit={handleSubmit}
        style={{
          display: 'flex', gap: 8, padding: '12px 16px',
          borderTop: '1px solid var(--line)',
          background: 'rgba(1,6,8,.9)',
          paddingBottom: 'max(12px, env(safe-area-inset-bottom))',
        }}
      >
        <button
          type="button"
          aria-label="Stop audio"
          onClick={() => stopSpeaking()}
          className="action ghost"
          style={{ padding: '10px 12px', flexShrink: 0 }}
        >
          ⬛
        </button>
        <button
          type="button"
          aria-label="Scan barcode"
          onClick={() => setScannerOpen(open => !open)}
          disabled={loading}
          className={`action${scannerOpen ? '' : ' ghost'}`}
          style={scannerOpen ? { borderColor: 'var(--cyan)', color: 'var(--cyan)', padding: '10px 12px' } : { padding: '10px 12px' }}
        >
          ▣
        </button>
        <input
          value={input}
          onChange={e => setInput(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="portfolio · meals · weight · status"
          disabled={loading}
          style={{
            flex: 1,
            background: 'rgba(1,10,13,.7)',
            border: '1px solid var(--line)',
            padding: '10px 14px',
            color: 'var(--text)', fontSize: 14,
            fontFamily: 'var(--body)', outline: 'none',
            caretColor: 'var(--cyan)',
          }}
        />
        <button
          type="submit"
          disabled={!canSend}
          style={{
            background: canSend ? 'var(--cyan)' : 'rgba(1,10,13,.7)',
            border: `1px solid ${canSend ? 'var(--cyan)' : 'var(--line)'}`,
            padding: '10px 18px',
            color: canSend ? '#010608' : 'var(--dim)',
            fontSize: 12, fontFamily: 'var(--display)',
            letterSpacing: '.08em', cursor: canSend ? 'pointer' : 'default',
            transition: 'background .15s, color .15s',
          }}
        >
          SEND
        </button>
      </form>
    </div>
  )
}
