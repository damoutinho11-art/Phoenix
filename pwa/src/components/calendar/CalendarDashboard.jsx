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

function ViewModeTabs({ activeMode, setActiveMode }) {
  return (
    <div className="phx-calendar-mode-grid" aria-label="Calendar view mode">
      {[
        ['today', 'TODAY'],
        ['week', 'WEEK'],
        ['performances', 'PERFORMANCES'],
      ].map(([mode, label]) => (
        <CommandButton key={mode} label={label} active={activeMode === mode} action={() => setActiveMode(mode)} />
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

  return (
    <aside className="phx-calendar-core">
      <div className="phx-calendar-core-head">
        <span>CC-001</span>
        <strong>CALENDAR CORE</strong>
        <em>{monthLabel} - {dayLabel} - {dayNum}</em>
      </div>

      <div className="phx-calendar-core-body">
        <div className="phx-calendar-core-date">
          <span>{dayLabel}</span>
          <strong>{dayNum}</strong>
          <em>{active ? 'ACTIVE' : 'OPEN'}</em>
        </div>

        <div className="phx-calendar-core-state">
          <strong>{active ? 'ACTIVE DAY' : 'OPEN SLATE'}</strong>
          <span>{active ? `${displayEvents.length} visible assignment${displayEvents.length === 1 ? '' : 's'}` : 'No personal rows visible'}</span>
          <div><small>NEXT</small><b>{nextEvent ? `${nextEvent.time_start || '--:--'} ${nextEvent.title}` : 'NOT PUBLISHED'}</b></div>
          <div><small>BUFFER</small><b>{bufferSignals.length ? `${bufferSignals.length} TIGHT` : 'CLEAR'}</b></div>
          <div><small>MODE</small><b>READ ONLY</b></div>
        </div>
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

  return (
    <CockpitShell accent={VIOLET} className="phx-calendar-cockpit phx-calendar-v18" aria-label="Calendar Command Center">
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

              <ViewModeTabs activeMode={activeMode} setActiveMode={setActiveMode} />

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
              <RouteCard title="Today" copy="Full day rail, event details, source labels, and buffers." action={() => setActiveMode('today')} />
              <RouteCard title="Week" copy="Weekly load, performance blocks, and rhythm review." action={() => { setActiveMode('week'); onWeekView && onWeekView() }} />
              <RouteCard title="Feeds" copy="Plaan, ICS, Google, source health, and diagnostics." action={onFeed} />
              <RouteCard title="Brief" copy="Read-only day brief and next-event summary." action={() => onQuickAsk && onQuickAsk('Give me a read-only calendar brief for today.')} />
            </div>
          </div>
        </DataPanel>
      </div>
    </CockpitShell>
  )
}


