# Personal Plaan Feed Operations

The subscription is a private read-only URL. Never put it in the frontend,
Git, screenshots, debug logs or public support messages.

## Configuration

Set PHOENIX_PLAAN_ICAL_URL on the Railway Phoenix service to the user's personal
HTTPS/webcal subscription and PHOENIX_PLAAN_LIVE_ENABLED=true. Background refresh
requires PHOENIX_BACKGROUND_JOBS_ENABLED not to be false. The existing persistent
JARVIS_DB_PATH stores normalized snapshots and refresh status.

The worker checks at startup and every hour. The source advertises daily updates;
frequent fetches do not guarantee publication of last-minute changes. The client
reads backend status each minute and on window focus.

## Verification

GET /calendar/plaan-live/status must show healthy with last_checked_at and
last_success_at and must not expose the subscription URL. GET /calendar/snapshot
must show active_source=personal_feed. Compare personal event dates and Tallinn
times to the user's filtered Plaan view. Verify /nutrition/calendar-bridge and
Training calendar evidence against those same events.

## Failure States

Unavailable means no usable snapshot. Degraded retains a previous snapshot after
a failed refresh. Stale means the last successful retrieval exceeds 26 hours.
These states must not be interpreted as free time. Runtime database failures also
mark the source unconfirmed. Investigate Railway logs without enabling private
transport tracing; inspect database volume health and source reachability.

To roll back a deployment, restore the previous reviewed deployment in Railway.
Do not delete the persistent volume or manual imports. Preserve the original
Home screen; this release does not contain Daily Command.
