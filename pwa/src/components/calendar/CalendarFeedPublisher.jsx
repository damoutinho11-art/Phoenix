import { useEffect, useMemo, useState } from 'react'
import { getCalendarFeedStatus, getGoogleCalendarStatus } from '../../api/client'

const VIOLET = '#9f7dff'
const VIOLET_BR = '#d8ccff'
const BORDER = 'rgba(32,216,236,.18)'
const MUTED = 'rgba(32,216,236,.38)'
const TEXT = 'rgba(226,222,255,.92)'
const DIM = 'rgba(181,178,216,.58)'
const CYAN = '#20d8ec'
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

export default function CalendarFeedPublisher({ onBack }) {
  const [status, setStatus] = useState(null)
  const [googleOAuthStatus, setGoogleOAuthStatus] = useState(null)
  const [error, setError] = useState('')
  const [token, setToken] = useState('')
  const [copied, setCopied] = useState(false)

  useEffect(() => {
    getCalendarFeedStatus()
      .then(setStatus)
      .catch(() => setError('Phoenix calendar feed status unavailable.'))
    getGoogleCalendarStatus()
      .then(setGoogleOAuthStatus)
      .catch(() => {})
  }, [])

  const googleOAuthLabel = !googleOAuthStatus
    ? 'CHECKING'
    : googleOAuthStatus.connected
      ? 'CONNECTED'
      : googleOAuthStatus.configured
        ? 'NOT CONNECTED'
        : 'NOT CONFIGURED'

  const feedUrl = useMemo(() => {
    if (!status) return ''
    const template = status.feed_url_template || '/calendar/feed.ics?token=<PHOENIX_CALENDAR_FEED_TOKEN>'
    return token.trim() ? template.replace('<PHOENIX_CALENDAR_FEED_TOKEN>', encodeURIComponent(token.trim())) : template
  }, [status, token])

  async function copyFeedUrl() {
    if (!feedUrl || feedUrl.includes('<PHOENIX_CALENDAR_FEED_TOKEN>')) return
    try {
      await navigator.clipboard.writeText(feedUrl)
      setCopied(true)
      setTimeout(() => setCopied(false), 1500)
    } catch (_) {}
  }

  if (error) {
    return <div style={{ height: '100%', background: '#000', color: RED, padding: 24 }}>{error}</div>
  }
  if (!status) {
    return <div style={{ height: '100%', background: '#000', color: MUTED, padding: 24, fontFamily: 'var(--mono)' }}>Loading Phoenix calendar feed…</div>
  }

  return (
    <div style={{ height: '100%', display: 'flex', flexDirection: 'column', background: '#000', color: TEXT, fontFamily: "'Saira Condensed',sans-serif" }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '13px 18px 11px', borderBottom: `1px solid ${BORDER}`, background: 'rgba(0,0,0,.96)', flexShrink: 0 }}>
        <div onClick={onBack} style={{ cursor: 'pointer' }}>
          <span style={{ color: VIOLET_BR, marginRight: 10 }}>←</span>
          <span style={{ fontFamily: 'var(--display)', fontSize: 13, fontWeight: 700, letterSpacing: '.24em', color: VIOLET_BR }}>PHOENIX CALENDAR FEED</span>
        </div>
        <Pill tone={status.enabled ? 'good' : 'warn'}>{status.enabled ? 'READY' : 'TOKEN NEEDED'}</Pill>
      </div>

      <div style={{ flex: 1, overflowY: 'auto', paddingBottom: 96 }}>
        <div style={{ padding: '20px 18px', borderBottom: `1px solid ${BORDER}`, background: 'linear-gradient(180deg,rgba(159,125,255,.05),transparent)' }}>
          <div style={{ fontFamily: 'var(--mono)', fontSize: 8, letterSpacing: '.22em', color: MUTED, marginBottom: 8 }}>ICS SUBSCRIPTION FEED</div>
          <div style={{ fontFamily: 'var(--display)', fontSize: 27, fontWeight: 700, color: '#fff', lineHeight: 1.1 }}>Phoenix publishes your clean opera calendar.</div>
          <div style={{ fontSize: 12.5, lineHeight: 1.5, color: DIM, marginTop: 10 }}>Any calendar app (including Google Calendar) can subscribe to this private feed URL. Plaan stays read-only, Phoenix remains the main calendar, and any subscriber becomes only a mirror. For a native OAuth connection instead of a URL subscription, use Connectors.</div>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, padding: '14px 18px', borderBottom: `1px solid ${BORDER}` }}>
          <InfoRow label="EVENTS" value={status.event_count ?? 0} />
          <InfoRow label="SOURCE" value={(status.calendar_source?.active_source || 'fixture').replaceAll('_', ' ').toUpperCase()} />
          <InfoRow label="TOKEN" value={status.token_configured ? 'CONFIGURED' : 'MISSING'} />
          <InfoRow label="GOOGLE OAUTH" value={googleOAuthLabel} />
        </div>

        <div style={{ padding: '16px 18px', borderBottom: `1px solid ${BORDER}` }}>
          <div style={{ fontFamily: 'var(--mono)', fontSize: 8, letterSpacing: '.22em', color: MUTED, marginBottom: 10 }}>PRIVATE FEED URL</div>
          {!status.token_configured && <div style={{ padding: '11px 12px', border: `1px solid rgba(255,213,107,.2)`, background: 'rgba(255,213,107,.035)', color: '#ffd56b', fontSize: 12, lineHeight: 1.45, marginBottom: 10 }}>Set <b>PHOENIX_CALENDAR_FEED_TOKEN</b> on Railway before Google Calendar can subscribe.</div>}
          {!status.public_base_url_configured && <div style={{ padding: '11px 12px', border: `1px solid rgba(32,216,236,.18)`, background: 'rgba(32,216,236,.025)', color: CYAN, fontSize: 12, lineHeight: 1.45, marginBottom: 10 }}>Set <b>PHOENIX_PUBLIC_BASE_URL</b> to your deployed backend URL for a full Google-ready link. Localhost links will not work from Google Calendar.</div>}
          <input
            value={token}
            onChange={e => setToken(e.target.value)}
            placeholder="Paste your private feed token locally to build the subscription URL"
            style={{ width: '100%', boxSizing: 'border-box', border: `1px solid ${BORDER}`, background: 'rgba(0,0,0,.55)', color: TEXT, padding: '10px 11px', fontFamily: 'var(--mono)', fontSize: 9, outline: 'none', marginBottom: 8 }}
          />
          <div style={{ padding: 10, border: `1px solid ${BORDER}`, background: 'rgba(0,0,0,.22)', fontFamily: 'var(--mono)', fontSize: 8, lineHeight: 1.55, color: token ? LIME : DIM, wordBreak: 'break-all' }}>{feedUrl}</div>
          <button onClick={copyFeedUrl} disabled={!token.trim()} style={{ width: '100%', marginTop: 8, padding: '10px', border: `1px solid ${token.trim() ? 'rgba(157,255,111,.35)' : BORDER}`, background: token.trim() ? 'rgba(157,255,111,.08)' : 'rgba(32,216,236,.025)', color: token.trim() ? LIME : MUTED, fontFamily: 'var(--mono)', fontSize: 8, letterSpacing: '.16em' }}>{copied ? 'COPIED' : 'COPY SUBSCRIPTION URL'}</button>
        </div>

        <div style={{ padding: '16px 18px', borderBottom: `1px solid ${BORDER}` }}>
          <div style={{ fontFamily: 'var(--mono)', fontSize: 8, letterSpacing: '.22em', color: MUTED, marginBottom: 10 }}>SAFETY CONTRACT</div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 7 }}>
            {Object.entries(status.safety || {}).map(([key, value]) => (
              <div key={key} style={{ padding: '9px 10px', border: `1px solid ${value || key === 'google_write' || key === 'oauth_required' || key === 'credentials_stored' ? 'rgba(157,255,111,.16)' : 'rgba(255,92,122,.16)'}`, background: 'rgba(157,255,111,.025)', fontFamily: 'var(--mono)', fontSize: 7.2, letterSpacing: '.09em', color: LIME }}>◆ {key.replaceAll('_', ' ').toUpperCase()}: {String(value).toUpperCase()}</div>
            ))}
          </div>
        </div>

        <div style={{ padding: '16px 18px' }}>
          <div style={{ fontFamily: 'var(--mono)', fontSize: 8, letterSpacing: '.22em', color: MUTED, marginBottom: 10 }}>GOOGLE CALENDAR STEPS</div>
          {(status.setup_steps || []).map((step, idx) => (
            <div key={step} style={{ display: 'grid', gridTemplateColumns: '24px 1fr', gap: 9, marginBottom: 9, alignItems: 'start' }}>
              <div style={{ fontFamily: 'var(--display)', fontSize: 16, fontWeight: 700, color: VIOLET_BR }}>{idx + 1}</div>
              <div style={{ fontSize: 12.5, color: 'rgba(226,222,255,.78)', lineHeight: 1.45 }}>{step}</div>
            </div>
          ))}
          <div style={{ marginTop: 12, padding: 11, border: `1px solid rgba(159,125,255,.18)`, background: 'rgba(159,125,255,.025)', color: DIM, fontSize: 12, lineHeight: 1.5 }}>{status.google_refresh_notice}</div>
        </div>
      </div>
    </div>
  )
}