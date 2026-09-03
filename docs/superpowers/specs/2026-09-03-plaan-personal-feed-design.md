# Plaan Personal Calendar Feed

## Scope

Connect the user's verified personal Plaan iCalendar subscription to the existing
Phoenix Calendar, Training and Nutrition snapshot boundary. Preserve the original
Home screen. Do not merge the Daily Command preview or redesign navigation.
Plaan access is GET-only; no passwords, browser sessions or calendar writes.

## Verified Evidence

The user supplied a personal webcal subscription. Its HTTPS equivalent returned
HTTP 200 and text/calendar without browser authentication. All six events in
31 August through 6 September 2026 matched the user's filtered workspace, including
start and end times after conversion from UTC to Europe/Tallinn. The subscription
tooltip states that events update once per day. The private address must not be
included in source code, client bundles, fixtures, logs or this document.

## Architecture

- Store the address in the server-only PHOENIX_PLAAN_ICAL_URL setting.
- Enable fetching explicitly with PHOENIX_PLAAN_LIVE_ENABLED.
- Add a dedicated iCalendar adapter using a maintained parser, not ad hoc line parsing.
- Integrate through jarvis/domains/calendar/plaan_live.py so all three domains
  consume the same verified snapshot. When explicitly enabled, the personal feed
  takes precedence over historical manual imports and fixture data.
- Persist the last successful normalized snapshot and refresh metadata in the
  existing database. Do not persist raw iCalendar content or the feed address there.
- Refresh on startup and hourly while the backend is running, with a bounded
  timeout and single-flight protection. Reading status must not trigger a fetch.
- Preserve last_checked_at, last_success_at, last_error and source cadence as
  separate fields. Successful retrieval is not evidence of real-time publication.

## Parsing and Reconciliation

Convert all event times to Europe/Tallinn using timezone rules, including DST.
Use UID and recurrence identity for stable IDs; reconcile revision sequences and
cancellations. Expand recurrence over a rolling window from 7 days before today
through 90 days ahead, honoring exclusions and overrides. Replace the fetched
window atomically, so events removed from the feed disappear from that window.
Support folded lines, escaped text, all-day events and overnight intervals.
Split overnight intervals into day-local blocks if required by the existing
date/time-only snapshot contract, retaining stable segment IDs.
Reject invalid calendar documents rather than treating them as an empty schedule.
An explicitly valid empty calendar is a valid replacement snapshot.

## Safety and Freshness

Allow only HTTPS on plaan.opera.ee, port 443, without embedded credentials.
Normalize webcal to HTTPS. Reject redirects and limit downloads to 5 MiB and
10 seconds. Return sanitized errors without the address or response body.
Keep a last-good snapshot on failure but label it degraded. After 26 hours without
a successful fetch, mark it stale. Training and Nutrition must not treat missing,
degraded or stale evidence as confirmation that there are no work commitments.
For this configured source, never fall back to fixture events after failure.
The public status response reveals whether a feed is configured, not its address.

## Interface

Use the existing Calendar source panel, preserving violet styling. Show Personal
Plaan feed, last checked, last successful refresh, the once-daily source limitation,
and explicit unavailable/degraded/stale states. No change to original Home.
Training and Nutrition retain their current designs and consume shared evidence;
no automatic workout or meal logging is introduced.

## Acceptance and Deployment

Tests cover timezone conversion including DST, all-day/overnight events, duplicate
UIDs, revised and removed events, recurrence overrides and cancellations, malformed
responses, size limits, redirects, timeout, cache refresh, concurrent refreshes,
restart persistence and secret redaction. Integration tests cover all three
consumers and prove fixture events cannot masquerade as personal evidence.
Run existing calendar, training and nutrition regression suites and frontend
tests/build. Inspect the Calendar panel at mobile and desktop sizes.
Configure the private Railway variable only through authenticated deployment
tooling, deploy the reviewed branch, and compare production output with the six
verified events. If deployment access is unavailable, report that blocker instead
of claiming completion. Do not modify the user's finance state or attachments.

## Review Checklist

- Scope excludes Daily Command and unrelated design changes.
- Feed retrieval cadence and source publication cadence are distinct.
- Failure states are explicit and do not imply free time.
- Private feed address is absent from tracked artifacts.
- Production completion requires observed production evidence.
