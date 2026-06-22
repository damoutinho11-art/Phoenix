"""Mocked Plaan response fixtures for calendar domain tests.

These are the stand-ins for real Plaan scrape output. When you have a live
Cowork browser session against plaan.opera.ee, replace or extend these with
real recorded payloads. The engine tests are written against these shapes, so
as long as real Plaan output is parsed into the same dict structure, the tests
will exercise the real data too.

Fixture format mirrors what the Cowork browser session is expected to hand over:
  {
    "as_of": "<ISO datetime>",
    "events": [ { event dict }, ... ],
    "fetch_warnings": [ "<string>", ... ]
  }
"""

from datetime import datetime

# ---- helpers ---------------------------------------------------------------

def make_snapshot_raw(
    events: list[dict],
    as_of: str = "2026-06-22T09:00:00",
    fetch_warnings: list[str] | None = None,
) -> dict:
    return {
        "as_of": as_of,
        "events": events,
        "fetch_warnings": fetch_warnings or [],
    }


def make_event(
    event_id: str,
    event_type: str,
    title: str,
    date: str,
    time_start: str | None = None,
    time_end: str | None = None,
    location: str | None = "Opera House",
    role: str | None = "Solo Bassoon",
) -> dict:
    return {
        "event_id": event_id,
        "event_type": event_type,
        "title": title,
        "date": date,
        "time_start": time_start,
        "time_end": time_end,
        "location": location,
        "role": role,
    }


# ---- concrete fixtures -----------------------------------------------------

PERFORMANCE_EVENING = make_event(
    event_id="perf-001",
    event_type="performance",
    title="La Traviata",
    date="2026-06-25",
    time_start="19:00",
    time_end="22:00",
)

REHEARSAL_MORNING = make_event(
    event_id="reh-001",
    event_type="rehearsal",
    title="La Traviata Rehearsal",
    date="2026-06-24",
    time_start="10:00",
    time_end="13:00",
)

LATE_REHEARSAL = make_event(
    event_id="reh-002",
    event_type="rehearsal",
    title="Dress Rehearsal",
    date="2026-06-23",
    time_start="18:00",
    time_end="22:30",
)

TRAVEL_BLOCK = make_event(
    event_id="travel-001",
    event_type="travel",
    title="Travel to Tallinn",
    date="2026-06-26",
    time_start="08:00",
    time_end="12:00",
    location=None,
    role=None,
)

UNKNOWN_EVENT_TYPE = make_event(
    event_id="unk-001",
    event_type="masterclass",
    title="Guest Masterclass",
    date="2026-06-27",
    time_start="14:00",
    time_end="17:00",
)

# A snapshot with a mix of events covering several test scenarios
TYPICAL_WEEK_SNAPSHOT_RAW = make_snapshot_raw(
    events=[
        PERFORMANCE_EVENING,
        REHEARSAL_MORNING,
        LATE_REHEARSAL,
        TRAVEL_BLOCK,
        UNKNOWN_EVENT_TYPE,
    ],
    as_of="2026-06-22T09:00:00",
)

# A snapshot that is stale (> 24h old relative to a test's "now")
STALE_SNAPSHOT_RAW = make_snapshot_raw(
    events=[PERFORMANCE_EVENING],
    as_of="2026-06-20T08:00:00",
)

# An empty snapshot (no events) — simulates Plaan returning nothing
EMPTY_SNAPSHOT_RAW = make_snapshot_raw(events=[])

# A snapshot with a fetch warning (e.g. Plaan returned partial data)
PARTIAL_SNAPSHOT_RAW = make_snapshot_raw(
    events=[PERFORMANCE_EVENING],
    fetch_warnings=["Plaan returned only 1 week of data; multi-week view may be incomplete."],
)
