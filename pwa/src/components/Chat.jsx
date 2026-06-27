import { useEffect, useRef, useState } from 'react'
import './Chat.css'
import BarcodeScanner from './BarcodeScanner'
import { useJarvis } from '../hooks/useJarvis'
import { stopSpeaking } from '../services/tts'

function renderMarkdown(text) {
  return text.split(/\*\*/).map((part, i) =>
    i % 2 === 1 ? <strong key={i}>{part}</strong> : part
  )
}

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

  const statusClass = apiStatus === 'ok' ? 'ok' : apiStatus === 'error' ? 'err' : 'idle'
  const statusLabel = loading ? 'thinking…' : apiStatus === 'ok' ? 'online' : apiStatus === 'error' ? 'unreachable' : 'connecting'

  return (
    <div className="chat-screen" aria-live="polite">

      {/* ── Head (global-chat-head) ── */}
      <div className="chat-screen-head">
        <div>
          <div className="chat-screen-title">PHOENIX</div>
          <div className="chat-screen-context">jarvis · {statusLabel}</div>
        </div>
        <div className="chat-status-indicator">
          <span className={`chat-status-dot ${statusClass}`} />
          <span>J.A.R.V.I.S.</span>
        </div>
      </div>

      {/* ── Stream (global-chat-stream) ── */}
      <div className="chat-screen-stream">
        {messages.map(msg => {
          const isPhoenix = msg.role === 'jarvis'
          return (
            <div key={msg.id} className={`chat-msg ${isPhoenix ? 'phoenix' : 'user'}`}>
              <div className="chat-bubble">
                <span className="chat-label">{isPhoenix ? 'PHOENIX' : 'YOU'}</span>
                {renderMarkdown(msg.text)}
              </div>
            </div>
          )
        })}
        {loading && messages.length > 0 && (
          <div className="chat-msg phoenix">
            <div className="chat-bubble">
              <span className="chat-label">PHOENIX</span>
              <span className="chat-bubble-loading">…</span>
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

      {/* ── Input row (global-chat-input-row) ── */}
      <form className="chat-input-row" onSubmit={handleSubmit}>
        <button
          type="button"
          aria-label="Stop audio"
          className="chat-action-btn"
          onClick={() => stopSpeaking()}
        >
          ⬛
        </button>
        <button
          type="button"
          aria-label="Scan barcode"
          className={`chat-action-btn${scannerOpen ? ' active' : ''}`}
          onClick={() => setScannerOpen(open => !open)}
          disabled={loading}
        >
          ▣
        </button>
        <input
          className="chat-input"
          value={input}
          onChange={e => setInput(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="ASK ABOUT THIS SCREEN..."
          autoComplete="off"
          disabled={loading}
        />
        <button
          type="submit"
          className="chat-send"
          disabled={!canSend}
        >
          Send
        </button>
      </form>
    </div>
  )
}
