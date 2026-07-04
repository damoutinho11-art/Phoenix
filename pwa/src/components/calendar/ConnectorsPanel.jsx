import { useEffect, useState } from 'react'
import {
  getConnectorsStatus,
  getGoogleCalendarStatus,
  getGmailStatus,
  disconnectGoogle,
} from '../../api/client'
import PlaanExcelImport from './PlaanExcelImport'

const VIOLET = '#9f7dff'
const VIOLET_BR = '#d8ccff'
const BORDER = 'rgba(32,216,236,.18)'
const MUTED = 'rgba(32,216,236,.38)'
const TEXT = 'rgba(226,222,255,.92)'
const DIM = 'rgba(181,178,216,.58)'
const CYAN = '#20d8ec'
const LIME = '#9dff6f'
const RED = '#ff5c7a'

const BASE_URL = (import.meta.env.VITE_API_URL || 'http://localhost:8000').replace(/\/$/, '')

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
    <div style={{ border: `1px solid ${BORDER}`, background: 'rgba(0,0,0,.22)', padding: 14 }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
        <div style={{ fontFamily: 'var(--display)', fontSize: 14, fontWeight: 700, color: TEXT }}>{title}</div>
        <Pill tone={statusTone(status)}>{statusLabel(status)}</Pill>
      </div>
      {detail && <div style={{ fontSize: 11.5, color: DIM, lineHeight: 1.45, marginBottom: canConnect ? 10 : 0 }}>{detail}</div>}
      {canConnect && !connected && (
        <button
          type="button"
          onClick={onConnect}
          style={{ width: '100%', padding: '9px', border: `1px solid rgba(157,255,111,.35)`, background: 'rgba(157,255,111,.08)', color: LIME, fontFamily: 'var(--mono)', fontSize: 8, letterSpacing: '.16em', cursor: 'pointer' }}
        >
          CONNECT
        </button>
      )}
      {canConnect && connected && (
        <button
          type="button"
          onClick={onDisconnect}
          style={{ width: '100%', padding: '9px', border: `1px solid rgba(255,92,122,.35)`, background: 'rgba(255,92,122,.08)', color: RED, fontFamily: 'var(--mono)', fontSize: 8, letterSpacing: '.16em', cursor: 'pointer' }}
        >
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
    return <div style={{ height: '100%', background: '#000', color: RED, padding: 24 }}>{error}</div>
  }
  if (!connectors) {
    return <div style={{ height: '100%', background: '#000', color: MUTED, padding: 24, fontFamily: 'var(--mono)' }}>Loading Phoenix connectors…</div>
  }

  const googleConnected = Boolean(googleStatus?.connected)
  const gmailConnected = Boolean(gmailStatus?.connected)

  return (
    <div style={{ height: '100%', display: 'flex', flexDirection: 'column', background: '#000', color: TEXT, fontFamily: "'Saira Condensed',sans-serif" }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '13px 18px 11px', borderBottom: `1px solid ${BORDER}`, background: 'rgba(0,0,0,.96)', flexShrink: 0 }}>
        <div onClick={onBack} style={{ cursor: 'pointer' }}>
          <span style={{ color: VIOLET_BR, marginRight: 10 }}>←</span>
          <span style={{ fontFamily: 'var(--display)', fontSize: 13, fontWeight: 700, letterSpacing: '.24em', color: VIOLET_BR }}>PHOENIX CONNECTORS</span>
        </div>
        <Pill tone={connectors.writes_enabled ? 'bad' : 'good'}>{connectors.writes_enabled ? 'WRITES ENABLED' : 'READ ONLY'}</Pill>
      </div>

      <div style={{ flex: 1, overflowY: 'auto', paddingBottom: 96 }}>
        <div style={{ padding: '20px 18px', borderBottom: `1px solid ${BORDER}`, background: 'linear-gradient(180deg,rgba(159,125,255,.05),transparent)' }}>
          <div style={{ fontFamily: 'var(--mono)', fontSize: 8, letterSpacing: '.22em', color: MUTED, marginBottom: 8 }}>SOURCE HEALTH</div>
          <div style={{ fontFamily: 'var(--display)', fontSize: 27, fontWeight: 700, color: '#fff', lineHeight: 1.1 }}>Every source stays read-only.</div>
          <div style={{ fontSize: 12.5, lineHeight: 1.5, color: DIM, marginTop: 10 }}>Plaan, the ICS feed, Google Calendar, and Gmail are all read-only from Phoenix's side. Nothing here can send, write, or delete on your behalf.</div>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, padding: '14px 18px', borderBottom: `1px solid ${BORDER}` }}>
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
          <div style={{ padding: '0 18px', color: CYAN, fontFamily: 'var(--mono)', fontSize: 9 }}>Disconnecting…</div>
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
