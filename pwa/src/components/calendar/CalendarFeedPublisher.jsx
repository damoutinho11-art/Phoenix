import { useEffect, useMemo, useState } from 'react'
import { getCalendarFeedStatus, getGoogleCalendarStatus } from '../../api/client'

const VIOLET_BR = '#d8ccff'
const MUTED = 'color-mix(in srgb, var(--phx-calendar) 66%, white 8%)'
const TEXT = 'var(--phx-text)'
const DIM = 'var(--phx-body)'
const LIME = 'var(--phx-positive)'

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
    return (
      <div className="phx-scope-calendar" style={{ height: '100%', background: 'var(--phx-bg)', display: 'grid', placeItems: 'center' }}>
        <div className="phx-state phx-state-error">
          <span className="code">FEED-ERR</span>
          <strong>Feed unavailable</strong>
          <p>{error}</p>
        </div>
      </div>
    )
  }
  if (!status) {
    return (
      <div className="phx-scope-calendar" style={{ height: '100%', background: 'var(--phx-bg)', display: 'grid', placeItems: 'center' }}>
        <div className="phx-state phx-state-loading">
          <span className="code">SYNC</span>
          <strong>Calendar feed</strong>
          <p>Reading feed status…</p>
        </div>
      </div>
    )
  }

  return (
    <div className="phx-scope-calendar" style={{ height: '100%', display: 'flex', flexDirection: 'column', background: 'radial-gradient(circle at 78% 4%, color-mix(in srgb, var(--phx-calendar) 8%, transparent), transparent 34rem), linear-gradient(180deg, #071019 0%, var(--phx-bg) 42%, #04090e 100%)', color: TEXT, fontFamily: 'var(--phx-font-body)' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10, padding: '13px 18px 11px', borderBottom: '1px solid var(--phx-edge)', background: 'rgba(6,12,18,.92)', backdropFilter: 'blur(14px)', flexShrink: 0 }}>
        <div className="phx-tap" onClick={onBack} style={{ display: 'flex', alignItems: 'center', padding: '4px 0' }}>
          <span style={{ color: VIOLET_BR, marginRight: 10 }}>←</span>
          <span style={{ fontFamily: 'var(--phx-font-display)', fontSize: 15, fontWeight: 700, letterSpacing: '.22em', color: VIOLET_BR, textTransform: 'uppercase' }}>PHOENIX CALENDAR FEED</span>
        </div>
        <Pill tone={status.enabled ? 'good' : 'warn'}>{status.enabled ? 'READY' : 'TOKEN NEEDED'}</Pill>
      </div>

      <div style={{ flex: 1, overflowY: 'auto', paddingBottom: 96 }}>
        <div style={{ padding: '20px 18px', borderBottom: '1px solid var(--phx-edge)', background: 'linear-gradient(180deg,rgba(159,125,255,.06),transparent)' }}>
          <div style={{ fontFamily: 'var(--phx-font-mono)', fontSize: 10, letterSpacing: '.22em', color: MUTED, marginBottom: 8, textTransform: 'uppercase' }}>[ ICS SUBSCRIPTION FEED ]</div>
          <div style={{ fontFamily: 'var(--phx-font-display)', fontSize: 28, fontWeight: 700, color: TEXT, lineHeight: 1.05, textTransform: 'uppercase', letterSpacing: '.02em' }}>Phoenix publishes your clean opera calendar.</div>
          <div style={{ fontFamily: 'var(--phx-font-body)', fontSize: 13, lineHeight: 1.55, color: DIM, marginTop: 10, maxWidth: '52rem' }}>Any calendar app (including Google Calendar) can subscribe to this private feed URL. Plaan stays read-only, Phoenix remains the main calendar, and any subscriber becomes only a mirror. For a native OAuth connection instead of a URL subscription, use Connectors.</div>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, padding: '14px 18px', borderBottom: '1px solid var(--phx-edge)' }}>
          <InfoRow label="EVENTS" value={status.event_count ?? 0} />
          <InfoRow label="SOURCE" value={(status.calendar_source?.active_source || 'fixture').replaceAll('_', ' ').toUpperCase()} />
          <InfoRow label="TOKEN" value={status.token_configured ? 'CONFIGURED' : 'MISSING'} />
          <InfoRow label="GOOGLE OAUTH" value={googleOAuthLabel} />
        </div>

        <div style={{ padding: '16px 18px', borderBottom: '1px solid var(--phx-edge)' }}>
          <div style={{ fontFamily: 'var(--phx-font-mono)', fontSize: 10, letterSpacing: '.22em', color: MUTED, marginBottom: 10, textTransform: 'uppercase' }}>[ PRIVATE FEED URL ]</div>
          {!status.token_configured && <div style={{ padding: '11px 12px', border: '1px solid color-mix(in srgb, var(--phx-caution) 25%, transparent)', borderLeft: '3px solid var(--phx-caution)', background: 'color-mix(in srgb, var(--phx-caution) 5%, transparent)', color: 'var(--phx-caution)', fontSize: 12.5, lineHeight: 1.5, marginBottom: 10 }}>Set <b>PHOENIX_CALENDAR_FEED_TOKEN</b> on Railway before Google Calendar can subscribe.</div>}
          {!status.public_base_url_configured && <div style={{ padding: '11px 12px', border: '1px solid color-mix(in srgb, var(--phx-calendar) 25%, transparent)', borderLeft: '3px solid var(--phx-calendar)', background: 'color-mix(in srgb, var(--phx-calendar) 5%, transparent)', color: 'color-mix(in srgb, var(--phx-calendar) 80%, white 12%)', fontSize: 12.5, lineHeight: 1.5, marginBottom: 10 }}>Set <b>PHOENIX_PUBLIC_BASE_URL</b> to your deployed backend URL for a full Google-ready link. Localhost links will not work from Google Calendar.</div>}
          <input
            value={token}
            onChange={e => setToken(e.target.value)}
            placeholder="Paste your private feed token locally to build the subscription URL"
            className="phx-input"
            style={{ width: '100%', boxSizing: 'border-box', padding: '10px 11px', fontSize: 13, marginBottom: 8 }}
          />
          <div style={{ padding: 10, border: '1px solid var(--phx-edge)', background: 'rgba(0,0,0,.25)', fontFamily: 'var(--phx-font-mono)', fontSize: 11, lineHeight: 1.55, color: token ? LIME : DIM, wordBreak: 'break-all' }}>{feedUrl}</div>
          <button onClick={copyFeedUrl} disabled={!token.trim()} className={`phx-btn${token.trim() ? ' phx-btn-good' : ''}`} style={{ width: '100%', marginTop: 8 }}>{copied ? '✓ COPIED' : 'COPY SUBSCRIPTION URL'}</button>
        </div>

        <div style={{ padding: '16px 18px', borderBottom: '1px solid var(--phx-edge)' }}>
          <div style={{ fontFamily: 'var(--phx-font-mono)', fontSize: 10, letterSpacing: '.22em', color: MUTED, marginBottom: 10, textTransform: 'uppercase' }}>[ SAFETY CONTRACT ]</div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 7 }}>
            {Object.entries(status.safety || {}).map(([key, value]) => (
              <div key={key} style={{ padding: '9px 10px', border: '1px solid color-mix(in srgb, var(--phx-positive) 18%, transparent)', background: 'color-mix(in srgb, var(--phx-positive) 3%, transparent)', fontFamily: 'var(--phx-font-mono)', fontSize: 9.5, letterSpacing: '.09em', color: LIME }}>◆ {key.replaceAll('_', ' ').toUpperCase()}: {String(value).toUpperCase()}</div>
            ))}
          </div>
        </div>

        <div style={{ padding: '16px 18px' }}>
          <div style={{ fontFamily: 'var(--phx-font-mono)', fontSize: 10, letterSpacing: '.22em', color: MUTED, marginBottom: 10, textTransform: 'uppercase' }}>[ GOOGLE CALENDAR STEPS ]</div>
          {(status.setup_steps || []).map((step, idx) => (
            <div key={step} style={{ display: 'grid', gridTemplateColumns: '24px 1fr', gap: 9, marginBottom: 9, alignItems: 'start' }}>
              <div style={{ fontFamily: 'var(--phx-font-display)', fontSize: 17, fontWeight: 700, color: VIOLET_BR }}>{idx + 1}</div>
              <div style={{ fontFamily: 'var(--phx-font-body)', fontSize: 13, color: DIM, lineHeight: 1.5 }}>{step}</div>
            </div>
          ))}
          <div style={{ marginTop: 12, padding: '11px 12px', border: '1px solid color-mix(in srgb, var(--phx-calendar) 18%, transparent)', borderLeft: '3px solid var(--phx-calendar)', background: 'color-mix(in srgb, var(--phx-calendar) 3%, transparent)', color: DIM, fontFamily: 'var(--phx-font-body)', fontSize: 12.5, lineHeight: 1.5 }}>{status.google_refresh_notice}</div>
        </div>
      </div>
    </div>
  )
}