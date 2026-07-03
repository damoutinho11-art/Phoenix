import { useState, useEffect } from 'react'
import { getCalendarSnapshot, postJarvisChat } from '../../api/client'
import { CockpitShell, DataPanel, EmptyState, SourceStamp, StatusChip } from '../cockpit/CockpitPrimitives'

const VIOLET = '#9f7dff'
const GOLD = '#ffd56b'
const POS = '#4dffb4'
const FOOD = '#9dff6f'

function eventAccent(type) {
  if (type === 'rehearsal') return GOLD
  if (type === 'training') return POS
  if (type === 'food') return FOOD
  return VIOLET
}

function localDateKey(date) {
  const yyyy = date.getFullYear()
  const mm = String(date.getMonth() + 1).padStart(2, '0')
  const dd = String(date.getDate()).padStart(2, '0')
  return `${yyyy}-${mm}-${dd}`
}

function buildWeekDays(now = new Date()) {
  const dow = now.getDay()
  const monday = new Date(now)
  monday.setDate(now.getDate() - ((dow + 6) % 7))

  return ['MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT', 'SUN'].map((label, i) => {
    const d = new Date(monday)
    d.setDate(monday.getDate() + i)
    return {
      dow: label,
      num: d.getDate(),
      key: localDateKey(d),
      active: localDateKey(d) === localDateKey(now),
    }
  })
}

function sourceLabel(source) {
  if (!source) return 'snapshot source unknown'
  if (typeof source === 'string') return source
  return source.active_source || source.source || source.label || 'snapshot source'
}

function sourceDetail(source) {
  if (!source || typeof source === 'string') return null
  return source.imported_at || source.as_of || source.label || null
}

function timeToMinutes(value) {
  if (!value || typeof value !== 'string') return null
  const match = value.match(/(\d{1,2}):(\d{2})/)
  if (!match) return null
  const hours = Number(match[1])
  const minutes = Number(match[2])
  if (!Number.isFinite(hours) || !Number.isFinite(minutes)) return null
  return (hours * 60) + minutes
}

function eventDurationHours(event) {
  const start = timeToMinutes(event.time_start)
  const end = timeToMinutes(event.time_end)
  if (start === null || end === null || end <= start) return 0.5
  return Math.max(0.25, (end - start) / 60)
}

function formatHours(value) {
  const rounded = Math.round(value * 10) / 10
  return Number.isInteger(rounded) ? String(rounded) : rounded.toFixed(1)
}

function buildBufferSignals(events) {
  const sorted = [...events]
    .filter(ev => timeToMinutes(ev.time_start) !== null)
    .sort((a, b) => timeToMinutes(a.time_start) - timeToMinutes(b.time_start))

  const signals = []
  for (let i = 0; i < sorted.length - 1; i += 1) {
    const currentEnd = timeToMinutes(sorted[i].time_end) ?? timeToMinutes(sorted[i].time_start)
    const nextStart = timeToMinutes(sorted[i + 1].time_start)
    if (currentEnd === null || nextStart === null) continue
    const gap = nextStart - currentEnd
    if (gap >= 0 && gap < 45) {
      signals.push({
        id: `${sorted[i].event_id || sorted[i].title}-${sorted[i + 1].event_id || sorted[i + 1].title}`,
        text: `${gap}m buffer before ${sorted[i + 1].title}`,
      })
    }
  }
  return signals
}

function compactBrief(text) {
  if (!text) return null
  if (/unable to reach|api_key|provider/i.test(text)) {
    return 'Optional brief is offline. Calendar remains usable from the read-only schedule snapshot.'
  }
  return text
}

function AgendaRow({ event, onEvent }) {
  const accent = eventAccent(event.event_type)
  return (
    <button type="button" onClick={() => onEvent && onEvent(event)} className="phx-calendar-row" style={{ '--event-accent': accent }}>
      <span className="phx-calendar-time">{event.time_start || '--:--'}</span>
      <span>
        <strong>{event.title}</strong>
        <em>{[event.event_type?.toUpperCase(), event.location, event.role].filter(Boolean).join(' - ')}</em>
      </span>
      <span className="phx-calendar-end">{event.time_end || event.event_type?.toUpperCase() || ''}</span>
    </button>
  )
}

function CommandButton({ label, action, active = false }) {
  return (
    <button type="button" onClick={action} className={`phx-command-button ${active ? 'active' : ''}`}>
      {label}
    </button>
  )
}

function ViewModeTabs({ activeMode, setActiveMode, onRoute }) {
  return (
    <div className="phx-calendar-mode-grid" aria-label="Calendar view mode">
      {[
        ['today', 'TODAY'],
        ['week', 'WEEK'],
        ['performances', 'PERFORMANCES'],
      ].map(([mode, label]) => (
        <CommandButton
          key={mode}
          label={label}
          active={activeMode === mode}
          action={() => {
            setActiveMode(mode)
            onRoute && onRoute(mode)
          }}
        />
      ))}
    </div>
  )
}

function WeekStrip({ weekDays, className = '' }) {
  return (
    <div className={`phx-calendar-week-strip ${className}`}>
      {weekDays.map(day => (
        <div key={day.key} className={day.active ? 'active' : ''}>
          <span>{day.dow}</span>
          <strong>{day.num}</strong>
        </div>
      ))}
    </div>
  )
}

function CalendarCore({ displayEvents, weekDays, monthLabel, dayLabel, dayNum, source, sourceAsOf, bufferSignals, onEvent }) {
  const nextEvent = displayEvents[0] || null
  const active = displayEvents.length > 0
  const visibleLabel = `${displayEvents.length} EVENT${displayEvents.length === 1 ? '' : 'S'}`

  return (
    <aside className="phx-calendar-core phx-calendar-core-v19">
      <div className="phx-calendar-core-head">
        <span>CC-001</span>
        <strong>CALENDAR CORE</strong>
        <em>{monthLabel} - {dayLabel} - {dayNum}</em>
      </div>

      <div className="phx-calendar-core-reactor-shell" aria-label="Calendar core orbital status">
        <span className="phx-calendar-core-scan" aria-hidden="true" />
        <div className="phx-calendar-core-reactor" aria-hidden="true">
          <span className="phx-calendar-core-ring primary" />
          <span className="phx-calendar-core-ring secondary" />
          <span className="phx-calendar-core-ring tertiary" />
          <div className="phx-calendar-core-reactor-center">
            <strong>{active ? 'ACTIVE DAY' : 'OPEN SLATE'}</strong>
            <span>{active ? visibleLabel : 'NO PERSONAL ROWS'}</span>
          </div>
        </div>
      </div>

      <div className="phx-calendar-core-metrics">
        <div><small>NEXT</small><b>{nextEvent ? `${nextEvent.time_start || '--:--'} ${nextEvent.title}` : 'NOT PUBLISHED'}</b></div>
        <div><small>BUFFER</small><b>{bufferSignals.length ? `${bufferSignals.length} TIGHT` : 'CLEAR'}</b></div>
        <div><small>MODE</small><b>READ ONLY</b></div>
      </div>

      <WeekStrip weekDays={weekDays} className="compact" />

      <div className="phx-calendar-core-summary">
        {displayEvents.length === 0 ? (
          <>
            <strong>NO PERSONAL ROWS</strong>
            <span>Plaan returned no personal assigned rows for this view. Source details stay inside Feeds.</span>
          </>
        ) : (
          displayEvents.slice(0, 2).map(ev => <AgendaRow key={`core-${ev.event_id || ev.title}`} event={ev} onEvent={onEvent} />)
        )}
      </div>

      <SourceStamp source={source} asOf={sourceAsOf} />
    </aside>
  )
}
function TodaySnapshot({ displayEvents, visibleLoadHours, nextEvent, bufferSignals }) {
  return (
    <div className="phx-calendar-card">
      <strong>{displayEvents.length ? 'ACTIVE DAY' : 'OPEN SLATE'}</strong>
      <span>{formatHours(visibleLoadHours)}h visible - {displayEvents.length} event{displayEvents.length === 1 ? '' : 's'}</span>
      <p>{nextEvent ? `Next verified: ${nextEvent.time_start || '--:--'} ${nextEvent.title}` : 'No personal assigned rows are visible for the selected view.'}</p>
      <em>{bufferSignals.length ? bufferSignals[0].text : 'Buffer state clear.'}</em>
    </div>
  )
}

function TodayCommandRail({ displayEvents, visibleLoadHours, nextEvent, bufferSignals, source, sourceAsOf, onEvent }) {
  const hours = ['08', '10', '12', '14', '16', '18', '20', '22']
  const hasEvents = displayEvents.length > 0
  const sourceCopy = [sourceLabel(source), sourceAsOf].filter(Boolean).join(' - ') || 'Plaan snapshot visible / no writes'

  return (
    <div className="phx-calendar-today-rail">
      <div className="phx-calendar-today-rail-head">
        <strong>[ TODAY RAIL ]</strong>
        <span>READ ONLY</span>
      </div>

      <div className="phx-calendar-timeline">
        <div className="phx-calendar-timeline-hours" aria-hidden="true">
          {hours.map(hour => <span key={hour}>{hour}</span>)}
        </div>

        <div className="phx-calendar-timeline-body">
          <span className="phx-calendar-lane-mark top">+</span>
          <span className="phx-calendar-lane-mark bottom">+</span>

          {hasEvents ? (
            <div className="phx-calendar-timeline-events">
              {displayEvents.slice(0, 4).map(ev => (
                <AgendaRow key={`today-rail-${ev.event_id || ev.title}`} event={ev} onEvent={onEvent} />
              ))}
            </div>
          ) : (
            <div className="phx-calendar-timeline-empty">
              <strong>OPEN SLATE</strong>
              <span>No personal rows visible for the selected day.</span>
              <em>Read-only schedule awaiting verified assignments.</em>
            </div>
          )}
        </div>
      </div>

      <div className="phx-calendar-today-rail-meta">
        <div>
          <small>NEXT VISIBLE</small>
          <strong>{nextEvent ? `${nextEvent.time_start || '--:--'} ${nextEvent.title}` : 'NONE'}</strong>
        </div>
        <div>
          <small>SOURCE STAMP</small>
          <strong>{sourceCopy}</strong>
        </div>
        <div>
          <small>VISIBLE LOAD</small>
          <strong>{formatHours(visibleLoadHours)} HOURS - {displayEvents.length} EVENTS</strong>
        </div>
        <div>
          <small>BUFFER STATE</small>
          <strong>{bufferSignals.length ? `${bufferSignals.length} TIGHT BUFFER${bufferSignals.length === 1 ? '' : 'S'}` : 'CLEAR'}</strong>
        </div>
      </div>

      <div className="phx-calendar-today-safe-note">
        <span aria-hidden="true">[RO]</span>
        <strong>No Plaan mutations. No Google writes.</strong>
      </div>
    </div>
  )
}
function WeekPreview({ weekDays, allEvents, performanceEvents, rehearsalEvents }) {
  return (
    <div className="phx-calendar-card">
      <strong>{allEvents.length} VISIBLE BLOCK{allEvents.length === 1 ? '' : 'S'}</strong>
      <WeekStrip weekDays={weekDays} className="card" />
      <p>Normalized weekly rhythm, visible assignments, and performance/rehearsal balance.</p>
      <em>{performanceEvents.length} performance - {rehearsalEvents.length} rehearsal</em>
    </div>
  )
}

function WeekCommandMap({ weekDays, allEvents, performanceEvents, rehearsalEvents, source, sourceAsOf, setActiveMode }) {
  const weekKeys = new Set(weekDays.map(day => day.key))
  const weekEvents = allEvents.filter(event => weekKeys.has(event.date))
  const totalWeekHours = weekEvents.reduce((sum, event) => sum + eventDurationHours(event), 0)
  const weekBufferSignals = buildBufferSignals(weekEvents)
  const dayStats = weekDays.map(day => {
    const dayEvents = weekEvents.filter(event => event.date === day.key)
    const dayHours = dayEvents.reduce((sum, event) => sum + eventDurationHours(event), 0)
    const performances = dayEvents.filter(event => ['performance', 'concert', 'show'].includes(event.event_type)).length
    const rehearsals = dayEvents.filter(event => event.event_type === 'rehearsal').length

    return {
      ...day,
      events: dayEvents.length,
      hours: dayHours,
      performances,
      rehearsals,
    }
  })
  const busiestDay = [...dayStats].sort((a, b) => b.hours - a.hours || b.events - a.events)[0]
  const hasWeekEvents = weekEvents.length > 0
  const performanceLoad = weekEvents.length ? Math.round((performanceEvents.filter(event => weekKeys.has(event.date)).length / weekEvents.length) * 100) : 0
  const sourceCopy = [sourceLabel(source), sourceAsOf].filter(Boolean).join(' - ') || 'Read-only weekly snapshot'

  return (
    <div className="phx-calendar-week-command-map">
      <div className="phx-calendar-week-map-kicker">
        <span>Weekly preview of visible plan load and event rhythm.</span>
        <em>READ ONLY WEEKLY SNAPSHOT</em>
      </div>

      <div className="phx-calendar-week-map-metrics">
        <div>
          <small>TOTAL VISIBLE</small>
          <strong>{formatHours(totalWeekHours)} HOURS</strong>
        </div>
        <div>
          <small>VISIBLE EVENTS</small>
          <strong>{weekEvents.length} EVENTS</strong>
        </div>
        <div>
          <small>BUSIEST DAY</small>
          <strong>{busiestDay && busiestDay.events ? `${busiestDay.dow} - ${formatHours(busiestDay.hours)}H` : 'NONE'}</strong>
        </div>
        <div>
          <small>SOURCE</small>
          <strong>{sourceCopy}</strong>
        </div>
      </div>

      <div className="phx-calendar-week-day-strip">
        {dayStats.map(day => (
          <button
            type="button"
            key={`week-map-${day.key}`}
            className={day.active ? 'active' : ''}
            onClick={() => setActiveMode && setActiveMode('week')}
          >
            <span>{day.dow}</span>
            <strong>{day.num}</strong>
            <em>{day.events ? `${formatHours(day.hours)}H - ${day.events}` : 'OPEN'}</em>
          </button>
        ))}
      </div>

      <div className="phx-calendar-week-rhythm-grid">
        <div className="phx-calendar-week-lanes">
          <span>PERFORMANCE</span>
          <span>REHEARSAL</span>
          <span>TRAVEL / ADMIN</span>
          <span>RECOVERY</span>
          <span>BUFFER</span>
        </div>
        <div className="phx-calendar-week-hours" aria-hidden="true">
          {['00', '04', '08', '12', '16', '20', '24'].map(hour => <span key={hour}>{hour}</span>)}
        </div>
        <div className="phx-calendar-week-grid-body">
          {hasWeekEvents ? (
            <div className="phx-calendar-week-event-stack">
              {weekEvents.slice(0, 5).map(event => (
                <AgendaRow key={`week-map-event-${event.event_id || event.title}`} event={event} />
              ))}
            </div>
          ) : (
            <div className="phx-calendar-week-empty">
              <strong>OPEN SLATE</strong>
              <span>No personal rows visible for this week.</span>
              <em>Read-only calendar preview.</em>
            </div>
          )}
        </div>
        <div className="phx-calendar-week-legend">
          <span className="performance">PERFORMANCE</span>
          <span className="rehearsal">REHEARSAL</span>
          <span className="travel">TRAVEL / ADMIN</span>
          <span className="recovery">RECOVERY</span>
          <span className="buffer">BUFFER</span>
        </div>
      </div>

      <div className="phx-calendar-week-summary-cards">
        <div>
          <small>WEEK SNAPSHOT</small>
          <strong>{formatHours(totalWeekHours)} HOURS - {weekEvents.length} EVENTS</strong>
          <span>{hasWeekEvents ? 'Visible assignments loaded from the read-only snapshot.' : 'No assignments visible. Read-only snapshot.'}</span>
          <em>READ ONLY</em>
        </div>
        <div>
          <small>PERFORMANCE LOAD</small>
          <strong>{performanceLoad}%</strong>
          <span>{performanceEvents.filter(event => weekKeys.has(event.date)).length ? 'Performance items visible this week.' : 'No performance items scheduled.'}</span>
          <em>READ ONLY</em>
        </div>
        <div>
          <small>NEXT MOVE</small>
          <strong>{hasWeekEvents ? 'REVIEW WEEK' : 'STAY READY'}</strong>
          <span>{hasWeekEvents ? 'Open Today for details, buffers, and source labels.' : 'Add or sync assignments in the source system to populate.'}</span>
          <em>READ ONLY</em>
        </div>
      </div>

      <div className="phx-calendar-week-safe-note">
        <span aria-hidden="true">[RO]</span>
        <strong>No Plaan mutations. No Google writes.</strong>
        <em>{weekBufferSignals.length ? `${weekBufferSignals.length} tight buffer signal${weekBufferSignals.length === 1 ? '' : 's'}` : 'Buffer pressure clear.'}</em>
      </div>
    </div>
  )
}
function FeedHealthCard({ title, status, copy, meta, tone = 'neutral' }) {
  return (
    <div className={`phx-calendar-feed-card ${tone}`}>
      <div>
        <small>{title}</small>
        <strong>{status}</strong>
      </div>
      <p>{copy}</p>
      <em>{meta}</em>
    </div>
  )
}

function CalendarFeedsCommand({ snapshot, allEvents, sourceAsOf }) {
  const source = snapshot?.source
  const sourceName = sourceLabel(source)
  const sourceStamp = sourceAsOf || sourceDetail(source) || snapshot?.as_of || 'Not published'
  const hasSnapshot = Boolean(snapshot)
  const visibleEvents = allEvents.length

  const feedRows = [
    {
      title: 'Plaan Snapshot',
      status: hasSnapshot ? 'VISIBLE' : 'WAITING',
      copy: hasSnapshot
        ? 'Normalized schedule snapshot is loaded for read-only display.'
        : 'Waiting for the normalized schedule snapshot to load.',
      meta: sourceName,
      tone: hasSnapshot ? 'ready' : 'waiting',
    },
    {
      title: 'ICS Feed',
      status: 'READ ONLY',
      copy: 'Subscription/export state belongs here. This screen does not publish or mutate feed data.',
      meta: 'Diagnostics only',
      tone: 'neutral',
    },
    {
      title: 'Google Calendar',
      status: 'NO WRITES',
      copy: 'Readiness and source labels can be surfaced here later. Create/update/delete actions stay absent.',
      meta: 'No Google write client',
      tone: 'locked',
    },
    {
      title: 'Brief Source',
      status: 'OPTIONAL',
      copy: 'Brief generation can use the current read-only schedule state, with honest offline fallback.',
      meta: 'No send actions',
      tone: 'neutral',
    },
  ]

  return (
    <div className="phx-calendar-feeds-command">
      <div className="phx-calendar-feeds-head">
        <div>
          <small>CONNECTOR TRUTH</small>
          <strong>SOURCE READINESS</strong>
          <span>Plaan, ICS, Google Calendar, and brief-source health live here - not in the hero.</span>
        </div>
        <em>READ ONLY</em>
      </div>

      <div className="phx-calendar-feeds-metrics">
        <div>
          <small>SOURCE</small>
          <strong>{sourceName}</strong>
        </div>
        <div>
          <small>AS OF</small>
          <strong>{sourceStamp}</strong>
        </div>
        <div>
          <small>VISIBLE ROWS</small>
          <strong>{visibleEvents} EVENTS</strong>
        </div>
        <div>
          <small>WRITE STATE</small>
          <strong>LOCKED</strong>
        </div>
      </div>

      <div className="phx-calendar-feed-grid">
        {feedRows.map(row => (
          <FeedHealthCard
            key={row.title}
            title={row.title}
            status={row.status}
            copy={row.copy}
            meta={row.meta}
            tone={row.tone}
          />
        ))}
      </div>

      <div className="phx-calendar-feeds-diagnostics">
        <div>
          <small>DIAGNOSTICS</small>
          <strong>{hasSnapshot ? 'SNAPSHOT AVAILABLE' : 'SNAPSHOT WAITING'}</strong>
          <span>{hasSnapshot ? 'Calendar can render from the normalized read-only snapshot.' : 'Calendar remains safe while waiting for source data.'}</span>
        </div>
        <div>
          <small>SAFETY CONTRACT</small>
          <strong>NO MUTATIONS</strong>
          <span>No Plaan mutations. No Google writes. No Gmail sends. No OAuth/write controls.</span>
        </div>
      </div>

      <div className="phx-calendar-feeds-safe-note">
        <span aria-hidden="true">[RO]</span>
        <strong>Connector truth only. This screen reports readiness; it does not execute actions.</strong>
      </div>
    </div>
  )
}

function CalendarActiveSubsection({
  activeMode,
  weekDays,
  displayEvents,
  visibleLoadHours,
  nextEvent,
  bufferSignals,
  allEvents,
  performanceEvents,
  rehearsalEvents,
  snapshot,
  sourceAsOf,
  setActiveMode,
  onEvent,
  resultCopy,
  jarvisText,
}) {
  if (activeMode === 'week') {
    return (
      <DataPanel eyebrow="[ WEEK ]" title="Weekly Rhythm" meta={`${allEvents.length} VISIBLE`}>
        <WeekCommandMap
          weekDays={weekDays}
          allEvents={allEvents}
          performanceEvents={performanceEvents}
          rehearsalEvents={rehearsalEvents}
          source={snapshot?.source}
          sourceAsOf={sourceAsOf}
          setActiveMode={setActiveMode}
        />
      </DataPanel>
    )
  }

  if (activeMode === 'feeds') {
    return (
      <DataPanel eyebrow="[ FEEDS ]" title="Feed Readiness" meta="READ ONLY">
        <CalendarFeedsCommand
          snapshot={snapshot}
          allEvents={allEvents}
          sourceAsOf={sourceAsOf}
        />
      </DataPanel>
    )
  }

  if (activeMode === 'brief') {
    return (
      <DataPanel eyebrow="[ BRIEF ]" title="Calendar Brief" meta="READ ONLY">
        <BriefPreview resultCopy={resultCopy} jarvisText={jarvisText} />
      </DataPanel>
    )
  }

  if (activeMode === 'performances') {
    return (
      <DataPanel eyebrow="[ PERFORMANCES ]" title="Performance Command Rail" meta="READ ONLY">
        <div className="phx-calendar-subsection-placeholder">
          <strong>PERFORMANCE VIEW READY</strong>
          <span>Performance and rehearsal filtering stays read-only. No assigned performance rows are visible unless Plaan/source data provides them.</span>
          <em>No Plaan mutations. No Google writes.</em>
        </div>
      </DataPanel>
    )
  }

  return (
    <DataPanel eyebrow="[ TODAY ]" title="Operational Rail" meta="READ ONLY">
      <TodayCommandRail
        displayEvents={displayEvents}
        visibleLoadHours={visibleLoadHours}
        nextEvent={nextEvent}
        bufferSignals={bufferSignals}
        source={snapshot?.source}
        sourceAsOf={sourceAsOf}
        onEvent={onEvent}
      />
    </DataPanel>
  )
}

function BriefPreview({ resultCopy, jarvisText }) {
  const brief = compactBrief(jarvisText) || resultCopy
  return (
    <div className="phx-calendar-card">
      <strong>{brief.includes('offline') ? 'BRIEF OFFLINE' : 'BRIEF READY'}</strong>
      <span>Read-only command brief</span>
      <p>{brief}</p>
      <em>No Plaan mutations. No Google writes.</em>
    </div>
  )
}

function RouteCard({ title, copy, action }) {
  return (
    <button type="button" className="phx-calendar-route-card" onClick={action}>
      <strong>{title}</strong>
      <span>{copy}</span>
    </button>
  )
}

export default function CalendarDashboard({ onEvent, onWeekView, onFeed, onQuickAsk }) {
  const [snapshot, setSnapshot] = useState(null)
  const [events, setEvents] = useState(null)
  const [jarvisText, setJarvisText] = useState('')
  const [activeMode, setActiveMode] = useState('today')
  const [calendarSection, setCalendarSection] = useState('command')

  useEffect(() => {
    getCalendarSnapshot()
      .then(r => { setSnapshot(r); setEvents(r.events || []) })
      .catch(() => setEvents([]))

    postJarvisChat({ domain: 'calendar', message: 'What should I know about my schedule this week?' })
      .then(r => setJarvisText(r.response || ''))
      .catch(() => setJarvisText('Optional brief is offline. Calendar remains usable from the read-only schedule snapshot.'))
  }, [])

  const now = new Date()
  const dayNum = now.getDate()
  const monthNames = ['JAN','FEB','MAR','APR','MAY','JUN','JUL','AUG','SEP','OCT','NOV','DEC']
  const dowNames = ['SUN','MON','TUE','WED','THU','FRI','SAT']
  const dayLabel = dowNames[now.getDay()]
  const monthLabel = monthNames[now.getMonth()]
  const weekDays = buildWeekDays(now)
  const today = localDateKey(now)
  const allEvents = events || []
  const todayEvents = allEvents.filter(e => e.date === today)
  const rehearsalEvents = allEvents.filter(e => e.event_type === 'rehearsal')
  const performanceEvents = allEvents.filter(e => ['performance', 'concert', 'show'].includes(e.event_type))
  const activeEvents = activeMode === 'performances'
    ? (performanceEvents.length ? performanceEvents : rehearsalEvents)
    : activeMode === 'week'
      ? allEvents.slice(0, 8)
      : todayEvents
  const displayEvents = activeEvents.length > 0 ? activeEvents.slice(0, 5) : []
  const visibleLoadHours = displayEvents.reduce((sum, event) => sum + eventDurationHours(event), 0)
  const nextEvent = displayEvents[0] || null
  const bufferSignals = buildBufferSignals(displayEvents)
  const source = sourceLabel(snapshot?.source)
  const sourceAsOf = snapshot?.as_of || sourceDetail(snapshot?.source)
  const resultCopy = activeMode === 'performances'
    ? `${displayEvents.length} performance/rehearsal block${displayEvents.length === 1 ? '' : 's'} visible. Phoenix highlights prep windows and source labels only.`
    : activeMode === 'week'
      ? `${displayEvents.length} upcoming block${displayEvents.length === 1 ? '' : 's'} visible. Weekly load is read-only and source-labeled.`
      : bufferSignals.length
        ? `Today result: schedule is workable, but ${bufferSignals[0].text.toLowerCase()}. Phoenix surfaces the risk; it does not mutate Plaan or Google Calendar.`
        : displayEvents.length
          ? 'Today result: visible schedule rail is clear enough. Phoenix remains read-only.'
          : 'Today result: open slate. No personal assigned rows are visible for this view; source details stay inside Feeds.'

  if (events === null) return (
    <CockpitShell accent={VIOLET} className="phx-calendar-cockpit" aria-label="Calendar Command Center">
      <EmptyState status="LOADING" title="Calendar loading" message="Reading the normalized read-only schedule snapshot." />
    </CockpitShell>
  )

  const sectionLabel = calendarSection === 'today'
    ? 'TODAY COMMAND RAIL'
    : calendarSection === 'week'
      ? 'WEEK COMMAND MAP'
      : calendarSection === 'feeds'
        ? 'CALENDAR FEEDS'
        : calendarSection === 'brief'
          ? 'CALENDAR BRIEF'
          : 'PERFORMANCE COMMAND RAIL'
  const sectionCopy = calendarSection === 'today'
    ? 'Focused day rail, event details, source labels, and buffer state.'
    : calendarSection === 'week'
      ? 'Weekly rhythm map, visible load, and performance/rehearsal balance.'
      : calendarSection === 'feeds'
        ? 'Source readiness, connector health, and diagnostics stay read-only.'
        : calendarSection === 'brief'
          ? 'Read-only schedule summary with honest offline fallback.'
          : 'Read-only performance and rehearsal preparation surface.'
  const routedMode = calendarSection === 'command' ? activeMode : calendarSection

  if (events !== null && calendarSection !== 'command') {
    return (
      <CockpitShell accent={VIOLET} className="phx-calendar-cockpit phx-calendar-v18 phx-calendar-v19 phx-calendar-section-screen" aria-label={`Calendar ${sectionLabel}`}>
        <div className="phx-domain-frame">
          <header className="phx-calendar-section-header">
            <button
              type="button"
              className="phx-calendar-section-back"
              onClick={() => setCalendarSection('command')}
            >
              BACK TO COMMAND CENTER
            </button>
            <div>
              <small>PHOENIX - CALENDAR SUBSECTION</small>
              <strong>{sectionLabel}</strong>
              <span>{sectionCopy}</span>
            </div>
            <StatusChip tone="verified">READ ONLY</StatusChip>
          </header>

          <CalendarActiveSubsection
            activeMode={routedMode}
            weekDays={weekDays}
            displayEvents={displayEvents}
            visibleLoadHours={visibleLoadHours}
            nextEvent={nextEvent}
            bufferSignals={bufferSignals}
            allEvents={allEvents}
            performanceEvents={performanceEvents}
            rehearsalEvents={rehearsalEvents}
            snapshot={snapshot}
            sourceAsOf={sourceAsOf}
            setActiveMode={setActiveMode}
            onEvent={onEvent}
            resultCopy={resultCopy}
            jarvisText={jarvisText}
          />

          <DataPanel eyebrow="[ ROUTES ]" title="Section Routes" meta="READ ONLY">
            <div className="phx-panel-body">
              <div className="phx-calendar-route-grid">
                <RouteCard title="Command" copy="Back to the command overview." action={() => setCalendarSection('command')} />
                <RouteCard title="Today" copy="Open day rail." action={() => { setActiveMode('today'); setCalendarSection('today') }} />
                <RouteCard title="Week" copy="Open rhythm map." action={() => { setActiveMode('week'); setCalendarSection('week') }} />
                <RouteCard title="Feeds" copy="Open source state." action={() => setCalendarSection('feeds')} />
                <RouteCard title="Brief" copy="Open brief." action={() => setCalendarSection('brief')} />
              </div>
            </div>
          </DataPanel>
        </div>
      </CockpitShell>
    )
  }

  return (
    <CockpitShell accent={VIOLET} className="phx-calendar-cockpit phx-calendar-v18 phx-calendar-v19" aria-label="Calendar Command Center">
      <div className="phx-domain-frame">
        <header className="phx-command-hero phx-calendar-command-hero">
          <div className="phx-command-topbar">
            <span>PHOENIX - PERSONAL HEURISTIC OPERATING ENGINE</span>
            <span className="phx-command-online"><i />READ ONLY - NORMALIZED SNAPSHOT</span>
          </div>

          <div className="phx-command-hero-grid">
            <div>
              <div className="phx-command-kicker">PHOENIX</div>
              <h1 className="phx-command-title-xl">
                <span>CALENDAR</span>
                <span className="accent">COMMAND CENTER</span>
              </h1>

              <div className="phx-command-label-line">TODAY LOAD</div>
              <div className="phx-command-value-row">
                <strong className="phx-command-value">{formatHours(visibleLoadHours)}</strong>
                <span className="phx-command-denominator">HOURS - {displayEvents.length} EVENT{displayEvents.length === 1 ? '' : 'S'}</span>
              </div>

              <div className="phx-command-chip-row">
                <StatusChip tone={nextEvent ? 'verified' : 'caution'}>NEXT: {nextEvent?.time_start || 'NONE'}</StatusChip>
                <StatusChip tone={bufferSignals.length ? 'caution' : 'ready'}>{bufferSignals.length ? `${bufferSignals.length} BUFFER WARNING` : 'BUFFERS CLEAR'}</StatusChip>
                <StatusChip tone="verified">READ ONLY</StatusChip>
              </div>

              <ViewModeTabs activeMode={activeMode} setActiveMode={setActiveMode} onRoute={mode => setCalendarSection(mode)} />

              <div className="phx-command-brief phx-calendar-hero-brief">
                <strong>{activeMode.toUpperCase()} COMMAND RESULT</strong><br />
                {resultCopy}
              </div>
            </div>

            <CalendarCore
              displayEvents={displayEvents}
              weekDays={weekDays}
              monthLabel={monthLabel}
              dayLabel={dayLabel}
              dayNum={dayNum}
              source={source}
              sourceAsOf={sourceAsOf}
              bufferSignals={bufferSignals}
              onEvent={onEvent}
            />
          </div>
        </header>

        <section className="phx-calendar-command-modules" aria-label="Calendar command center modules">
          <DataPanel eyebrow="[ TODAY ]" title="Today Snapshot" meta={displayEvents.length ? 'ACTIVE' : 'OPEN SLATE'}>
            <div className="phx-panel-body">
              <TodaySnapshot displayEvents={displayEvents} visibleLoadHours={visibleLoadHours} nextEvent={nextEvent} bufferSignals={bufferSignals} />
            </div>
          </DataPanel>

          <DataPanel eyebrow="[ WEEK ]" title="Week Preview" meta={`${allEvents.length} VISIBLE`}>
            <div className="phx-panel-body">
              <WeekPreview weekDays={weekDays} allEvents={allEvents} performanceEvents={performanceEvents} rehearsalEvents={rehearsalEvents} />
            </div>
          </DataPanel>

          <DataPanel eyebrow="[ BRIEF ]" title="Next Move" meta="READ ONLY">
            <div className="phx-panel-body">
              <BriefPreview resultCopy={resultCopy} jarvisText={jarvisText} />
            </div>
          </DataPanel>
        </section>
        <DataPanel eyebrow="[ DETAIL ROUTES ]" title="Calendar Routes" meta="READ ONLY">
          <div className="phx-panel-body">
            <div className="phx-calendar-route-grid">
              <RouteCard title="Today" copy="Full day rail, event details, source labels, and buffers." action={() => { setActiveMode('today'); setCalendarSection('today') }} />
              <RouteCard title="Week" copy="Weekly load, performance blocks, and rhythm review." action={() => { setActiveMode('week'); setCalendarSection('week') }} />
              <RouteCard title="Feeds" copy="Plaan, ICS, Google, source health, and diagnostics." action={() => setCalendarSection('feeds')} />
              <RouteCard title="Brief" copy="Read-only day brief and next-event summary." action={() => setCalendarSection('brief')} />
            </div>
          </div>
        </DataPanel>
      </div>
    </CockpitShell>
  )
}









