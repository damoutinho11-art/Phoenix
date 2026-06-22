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


# ---------------------------------------------------------------------------
# LIVE SNAPSHOT — real Plaan scrape, read-only, never mutate
# ---------------------------------------------------------------------------
# Scraped via Cowork browser session against plaan.opera.ee on 2026-06-22.
# person_id=646, occupation_id=881, unit=Fagott (unit_id=75).
# Zero events: season ended before this window; August schedule not yet published.
# Re-run this scrape once August individual assignments go live (~Aug 12 2026).

LIVE_SNAPSHOT_RAW = {
    "as_of": "2026-06-22T17:30:00",
    "events": [],
    "fetch_warnings": [
        "WINDOW COVERAGE: Scraped the requested 4-week window (2026-06-22 to 2026-07-20). Zero events found for Diogo (person_id=646, occupation_id=881, unit=Fagott/unit_id=75) in this range.",
        "SEASON GAP: The 2025-26 season ended before June 22. Diogo's last personally-assigned events in Plaan (visible on the rs-occupations-881 resource row) were in the first 11 days of June: Luikede Järv performances, Madama Butterfly, season-end ceremony (~Jun 1-11). No orchestra assignments appear June 22-30.",
        "BUILDING CLOSURES: The opera house was closed June 23-24 (Estonian Midsummer/Jaanipäev national holiday) and June 27-28 (weekend). The only building-wide event in June 22-30 visible to all staff was a RAM rental (Rendiüritus, id=14129, Kammersaal, 2026-06-26 09:30-13:00) — this is a room rental by an external party, not an orchestra call.",
        "JULY = VACATION: July 2026 confirmed by user as full vacation. Verified in Plaan: zero ORK/Fagott events in the general calendar July 1-31. Only building/admin events (RAM rentals, excursions, technical work) appear in July.",
        "AUGUST SCHEDULE NOT YET PUBLISHED: Season 2026-27 restarts August 12 ('Solistid, KOOR, ORK tööle', event_id=13535, 2026-08-12 11:00). ORK rehearsal placeholders exist in the general calendar (ORK: Othello/A. Volmer on 2026-08-12 and 2026-08-13, 11:00-15:00; ORK: Kapten Morten/L. Sirp on 2026-08-14, 11:00-15:00, type=Proov) but have NOT yet been individually assigned to Diogo's occupation row. The persons calendar (rs-occupations-881) shows zero events for August. User confirmed schedule is not done yet.",
        "API METHOD: Events extracted via authenticated fetch to /v2/_api/event and cross-referenced against FullCalendar DOM resource row rs-occupations-881 (occupation_id=881 = Diogo, unit=Fagott). Unit-constraint endpoint (/v2/_api/event-unit-constraint) returned only 3 records for the 4-week window, none for unit_id=75 (Fagott), confirming no scheduled calls in the window.",
        "SCOPE NOTE: This snapshot covers Diogo's personal assignment rows only. The general organisation calendar contains ~23 events in Jun 22-Jul 20 and ~87 events in Jul-Aug 14 (ballet rehearsals, excursions, admin), none assigned to Diogo.",
    ],
}