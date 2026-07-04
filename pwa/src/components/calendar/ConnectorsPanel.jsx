import { useEffect, useState } from 'react'
import {
  getConnectorsStatus,
  getGoogleCalendarStatus,
  getGmailStatus,
  disconnectGoogle,
} from '../../api/client'
import PlaanExcelImport from './PlaanExcelImport'

const VIOLET_BR = '#d8ccff'
const TEXT = 'var(--phx-text)'
const DIM = 'var(--phx-body)'

const BASE_URL = (import.meta.env.VITE_API_URL || 'http://localhost:8000').replace(/\/$/, '')

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

function statusTone(status) {
  if (status === 'active' || status === 'connected') return 'good'
  if (status === 'fixture') return 'warn'
  if (status === 'not_configured' || status === 'not_connected') return 'warn'
  return 'bad'
}

function statusLabel(status) {
  if (!status) return 'UNKNOWN'
  return String(status).replaceAll('_', ' ').toUpperCase()
}

function ConnectorCard({ title, status, detail, canConnect, connected, onConnect, onDisconnect }) {
  return (
    <div className={`phx-card${connected ? ' phx-card-stripe' : ''}`}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10, marginBottom: 8 }}>
        <div style={{ fontFamily: 'var(--phx-font-display)', fontSize: 16, fontWeight: 700, letterSpacing: '.03em', color: TEXT, textTransform: 'uppercase' }}>{title}</div>
        <Pill tone={statusTone(status)}>{statusLabel(status)}</Pill>
      </div>
      {detail && <div style={{ fontFamily: 'var(--phx-font-body)', fontSize: 12.5, color: DIM, lineHeight: 1.5, marginBottom: canConnect ? 12 : 0 }}>{detail}</div>}
      {canConnect && !connected && (
        <button type="button" onClick={onConnect} className="phx-btn phx-btn-good" style={{ width: '100%' }}>
          CONNECT
        </button>
      )}
      {canConnect && connected && (
        <button type="button" onClick={onDisconnect} className="phx-btn phx-btn-bad" style={{ width: '100%' }}>
          DISCONNECT
        </button>
      )}
    </div>
  )
}

export default function ConnectorsPanel({ onBack }) {
  const [connectors, setConnectors] = useState(null)
  const [googleStatus, setGoogleStatus] = useState(null)
  const [gmailStatus, setGmailStatus] = useState(null)
  const [error, setError] = useState('')
  const [disconnecting, setDisconnecting] = useState(false)

  function refresh() {
    getConnectorsStatus().then(setConnectors).catch(() => setError('Phoenix connector status unavailable.'))
    getGoogleCalendarStatus().then(setGoogleStatus).catch(() => {})
    getGmailStatus().then(setGmailStatus).catch(() => {})
  }

  useEffect(() => {
    refresh()
  }, [])

  function connectGoogle() {
    window.location.href = `${BASE_URL}/auth/google/login`
  }

  async function handleDisconnect() {
    if (!window.confirm('Disconnect Google Calendar and Gmail from Phoenix? This only removes Phoenix\'s stored access; nothing in your Google account is changed.')) {
      return
    }
    setDisconnecting(true)
    try {
      await disconnectGoogle()
      refresh()
    } catch (_) {
      setError('Disconnect failed. Try again.')
    } finally {
      setDisconnecting(false)
    }
  }

  if (error) {
    return (
      <div className="phx-scope-calendar" style={{ height: '100%', background: 'var(--phx-bg)', display: 'grid', placeItems: 'center' }}>
        <div className="phx-state phx-state-error">
          <span className="code">CX-ERR</span>
          <strong>Connectors unavailable</strong>
          <p>{error}</p>
        </div>
      </div>
    )
  }
  if (!connectors) {
    return (
      <div className="phx-scope-calendar" style={{ height: '100%', background: 'var(--phx-bg)', display: 'grid', placeItems: 'center' }}>
        <div className="phx-state phx-state-loading">
          <span className="code">SYNC</span>
          <strong>Connectors</strong>
          <p>Reading source health…</p>
        </div>
      </div>
    )
  }

  const googleConnected = Boolean(googleStatus?.connected)
  const gmailConnected = Boolean(gmailStatus?.connected)

  return (
    <div className="phx-scope-calendar" style={{ height: '100%', display: 'flex', flexDirection: 'column', background: 'radial-gradient(circle at 78% 4%, color-mix(in srgb, var(--phx-calendar) 8%, transparent), transparent 34rem), linear-gradient(180deg, #071019 0%, var(--phx-bg) 42%, #04090e 100%)', color: TEXT, fontFamily: 'var(--phx-font-body)' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10, padding: '13px 18px 11px', borderBottom: '1px solid var(--phx-edge)', background: 'rgba(6,12,18,.92)', backdropFilter: 'blur(14px)', flexShrink: 0 }}>
        <div className="phx-tap" onClick={onBack} style={{ display: 'flex', alignItems: 'center', padding: '4px 0' }}>
          <span style={{ color: VIOLET_BR, marginRight: 10 }}>←</span>
          <span style={{ fontFamily: 'var(--phx-font-display)', fontSize: 15, fontWeight: 700, letterSpacing: '.22em', color: VIOLET_BR, textTransform: 'uppercase' }}>PHOENIX CONNECTORS</span>
        </div>
        <Pill tone={connectors.writes_enabled ? 'bad' : 'good'}>{connectors.writes_enabled ? 'WRITES ENABLED' : 'READ ONLY'}</Pill>
      </div>

      <div style={{ flex: 1, overflowY: 'auto', paddingBottom: 96 }}>
        <div style={{ padding: '20px 18px', borderBottom: '1px solid var(--phx-edge)', background: 'linear-gradient(180deg,rgba(159,125,255,.06),transparent)' }}>
          <div style={{ fontFamily: 'var(--phx-font-mono)', fontSize: 10, letterSpacing: '.22em', color: 'color-mix(in srgb, var(--phx-calendar) 76%, white 8%)', marginBottom: 8, textTransform: 'uppercase' }}>[ SOURCE HEALTH ]</div>
          <div style={{ fontFamily: 'var(--phx-font-display)', fontSize: 28, fontWeight: 700, color: TEXT, lineHeight: 1.05, textTransform: 'uppercase', letterSpacing: '.02em' }}>Every source stays read-only.</div>
          <div style={{ fontFamily: 'var(--phx-font-body)', fontSize: 13, lineHeight: 1.55, color: DIM, marginTop: 10, maxWidth: '52rem' }}>Plaan, the ICS feed, Google Calendar, and Gmail are all read-only from Phoenix's side. Nothing here can send, write, or delete on your behalf.</div>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, padding: '14px 18px', borderBottom: '1px solid var(--phx-edge)' }}>
          <InfoRow label="PLAAN" value={statusLabel(connectors.connectors.plaan.status)} />
          <InfoRow label="ICS FEED" value={statusLabel(connectors.connectors.ics_feed.status)} />
          <InfoRow label="GOOGLE CALENDAR" value={statusLabel(connectors.connectors.google_calendar.status)} />
          <InfoRow label="GMAIL" value={statusLabel(connectors.connectors.gmail.status)} />
        </div>

        <div style={{ display: 'grid', gap: 10, padding: '16px 18px' }}>
          <ConnectorCard
            title="Plaan"
            status={connectors.connectors.plaan.status}
            detail={`Active source: ${(connectors.connectors.plaan.detail || 'fixture').replaceAll('_', ' ')}`}
            canConnect={false}
          />
          <PlaanExcelImport onImported={refresh} />
          <ConnectorCard
            title="ICS Feed"
            status={connectors.connectors.ics_feed.status}
            detail="Google Calendar can subscribe to Phoenix's private feed URL. See Calendar Feed for the subscription link."
            canConnect={false}
          />
          <ConnectorCard
            title="Google Calendar"
            status={connectors.connectors.google_calendar.status}
            detail={googleStatus?.configured ? 'OAuth read-only connection to your Google Calendar.' : 'Not configured yet. Set PHOENIX_GOOGLE_CLIENT_ID/SECRET/REDIRECT_URI on the backend.'}
            canConnect={Boolean(googleStatus?.configured)}
            connected={googleConnected}
            onConnect={connectGoogle}
            onDisconnect={handleDisconnect}
          />
          <ConnectorCard
            title="Gmail"
            status={connectors.connectors.gmail.status}
            detail={gmailStatus?.configured ? 'Read-only search over schedule-relevant email. Shares the Google connection above.' : 'Not configured yet. Connect Google Calendar above to enable Gmail search too.'}
            canConnect={Boolean(gmailStatus?.configured)}
            connected={gmailConnected}
            onConnect={connectGoogle}
            onDisconnect={handleDisconnect}
          />
        </div>

        {disconnecting && (
          <div style={{ padding: '0 18px', color: 'var(--phx-caution)', fontFamily: 'var(--phx-font-mono)', fontSize: 10, letterSpacing: '.14em', textTransform: 'uppercase' }}>Disconnecting…</div>
        )}

        <div style={{ padding: '16px 18px' }}>
          <div style={{ padding: 11, border: `1px solid rgba(159,125,255,.18)`, background: 'rgba(159,125,255,.025)', color: DIM, fontSize: 12, lineHeight: 1.5 }}>
            Phoenix never sends email, never creates/edits/deletes calendar events, and never modifies anything in your Google account. Revoke access anytime at myaccount.google.com/permissions or with Disconnect above.
          </div>
        </div>
      </div>
    </div>
  )
}
