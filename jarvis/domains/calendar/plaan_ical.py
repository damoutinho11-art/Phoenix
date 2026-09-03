"""Pure, fail-closed Plaan ICS normalization; floating times mean Tallinn.

Limits deliberately reject unusually dense/old recurrence rather than returning
a truncated schedule. No input data is included in public error messages.
"""

from datetime import date, datetime, time, timedelta, timezone
from hashlib import sha256
import re
from zoneinfo import ZoneInfo

from icalendar import Calendar
import recurring_ical_events

from .data_contracts import EventType


TALLINN = ZoneInfo("Europe/Tallinn")
MAX_PAYLOAD_BYTES = 5 * 1024 * 1024
MAX_COMPONENTS = 2000
MAX_EVENTS = 10000
MAX_RECURRENCE_WORK = 200000
_ERROR = "Invalid or unsupported personal calendar."
_SINGLE = {"UID", "DTSTART", "DTEND", "DURATION", "RECURRENCE-ID", "SEQUENCE",
           "DTSTAMP", "LAST-MODIFIED", "STATUS", "SUMMARY", "LOCATION", "RRULE"}
_PERFORMANCE_MARKER = re.compile(r"\(\s*(?:kontsert|[1-9][0-9]*\.\s*(?:ooper|ballett))\s*\)\s*\Z")
_REHEARSAL_TOKEN = re.compile(r"(?<!\w)(?:l\u00e4b\+ork(?!\w)|stz/|pp/)")


def _local(value):
    if isinstance(value, datetime):
        return value.replace(tzinfo=TALLINN) if value.tzinfo is None else value.astimezone(TALLINN)
    if isinstance(value, date):
        return datetime.combine(value, time.min, TALLINN)
    raise ValueError(_ERROR)


def _identity(value):
    if isinstance(value, datetime):
        return _local(value).astimezone(timezone.utc).isoformat()
    if isinstance(value, date):
        return value.isoformat()
    raise ValueError(_ERROR)


def _revision(component):
    def stamp(key):
        prop = component.get(key)
        return _local(prop.dt).timestamp() if prop is not None else float("-inf")
    return (int(component.get("SEQUENCE", 0)), stamp("LAST-MODIFIED"),
            stamp("DTSTAMP"), sha256(component.to_ical()).hexdigest())


def _validate(component, zones, stop):
    if component.errors:
        raise ValueError(_ERROR)
    for key in _SINGLE:
        if isinstance(component.get(key), list):
            raise ValueError(_ERROR)
    if not str(component.get("UID", "")).strip():
        raise ValueError(_ERROR)
    if int(component.get("SEQUENCE", 0)) < 0:
        raise ValueError(_ERROR)
    rid = component.get("RECURRENCE-ID")
    if rid is not None and rid.params.get("RANGE") not in (None, "THISANDFUTURE"):
        raise ValueError(_ERROR)
    for key in ("DTSTART", "DTEND", "RECURRENCE-ID", "DTSTAMP", "LAST-MODIFIED", "RDATE", "EXDATE"):
        props = component.get(key, [])
        for prop in props if isinstance(props, list) else [props]:
            tzid = prop.params.get("TZID")
            if tzid and tzid not in zones:
                ZoneInfo(str(tzid))
            values = prop.dts if hasattr(prop, "dts") else [prop]
            if len(values) > MAX_EVENTS:
                raise ValueError(_ERROR)
            for value in values:
                _local(value.dt)
                if tzid and isinstance(value.dt, datetime) and value.dt.tzinfo is None:
                    raise ValueError(_ERROR)
    if "DTSTART" not in component:
        if str(component.get("STATUS", "")).upper() == "CANCELLED":
            return 0
        raise ValueError(_ERROR)
    start = component.decoded("DTSTART")
    if rid is not None and abs(_local(start) - _local(rid.dt)) > timedelta(days=366):
        raise ValueError(_ERROR)
    if "DTEND" in component and "DURATION" in component:
        raise ValueError(_ERROR)
    end = component.decoded("DTEND", start)
    if isinstance(start, datetime) != isinstance(end, datetime):
        raise ValueError(_ERROR)
    duration = component.decoded("DURATION", _local(end) - _local(start))
    if not timedelta(0) <= duration <= timedelta(days=366):
        raise ValueError(_ERROR)
    if "EXRULE" in component:
        raise ValueError(_ERROR)
    rule = component.get("RRULE")
    if rule is None:
        return 1
    allowed = {"FREQ", "UNTIL", "COUNT", "INTERVAL", "BYSECOND", "BYMINUTE", "BYHOUR",
               "BYDAY", "BYMONTHDAY", "BYYEARDAY", "BYWEEKNO", "BYMONTH", "BYSETPOS", "WKST"}
    if set(rule) - allowed or rule.get("FREQ") not in (["DAILY"], ["WEEKLY"], ["MONTHLY"], ["YEARLY"]):
        raise ValueError(_ERROR)
    if int(rule.get("INTERVAL", [1])[0]) <= 0:
        raise ValueError(_ERROR)
    if "COUNT" in rule and (int(rule["COUNT"][0]) <= 0 or "UNTIL" in rule):
        raise ValueError(_ERROR)
    for values in rule.values():
        if len(values) > 366:
            raise ValueError(_ERROR)
    days = max(1, (stop - _local(start)).days + 367)
    if days > 36600:
        raise ValueError(_ERROR)
    # A conservative upper bound on dateutil's candidate generation, including
    # the historical prefix it may scan before reaching the requested window.
    work = days
    for key in ("BYHOUR", "BYMINUTE", "BYSECOND"):
        work *= max(1, len(rule.get(key, [])))
    return work


def _event_type(component):
    categories = component.get("CATEGORIES", [])
    types = set()
    for category in categories if isinstance(categories, list) else [categories]:
        types.update(str(v).lower() for v in category.cats)
    known = types & {v.value for v in EventType if v is not EventType.UNKNOWN}
    if known:
        return next(iter(known)) if len(known) == 1 else EventType.UNKNOWN.value
    # Only markers confirmed against Plaan workspace labels are inferred.
    title = str(component.get("SUMMARY", "")).strip().casefold()
    performance = bool(_PERFORMANCE_MARKER.search(title))
    rehearsal = title.startswith("ork:") or bool(_REHEARSAL_TOKEN.search(title))
    if performance and not rehearsal:
        return EventType.PERFORMANCE.value
    if rehearsal and not performance:
        return EventType.REHEARSAL.value
    return EventType.UNKNOWN.value


def _segments(component, identity, first, stop):
    raw_start = component.decoded("DTSTART")
    all_day = not isinstance(raw_start, datetime)
    start = _local(raw_start)
    end = _local(component.decoded("DTEND", raw_start))
    if "DTEND" not in component:
        end = start + component.decoded("DURATION", timedelta(days=1) if all_day else timedelta(0))
    if end < start:
        raise ValueError(_ERROR)
    event_type = _event_type(component)
    day = max(start.date(), first.date())
    while day < stop.date() and (day <= start.date() or _local(day) < end):
        midnight = _local(day)
        next_day = _local(day + timedelta(days=1))
        if start >= stop or end < first or (end == first and end != start):
            break
        segment_start, segment_end = max(start, midnight), min(end, next_day)
        # Non-recurring first segments retain their identity when rescheduled.
        suffix = "first" if day == start.date() else day.isoformat()
        seed = f"{identity}\0{suffix}"
        yield {"event_id": "plaan-" + sha256(seed.encode()).hexdigest(),
               "event_type": event_type, "title": str(component.get("SUMMARY", "")),
               "date": day.isoformat(),
               "time_start": None if all_day else segment_start.strftime("%H:%M"),
               "time_end": None if all_day else ("23:59" if segment_end == next_day else segment_end.strftime("%H:%M")),
               "location": str(component["LOCATION"]) if "LOCATION" in component else None,
               "role": None}
        day += timedelta(days=1)


def parse_personal_calendar(payload: bytes, *, now: datetime) -> dict:
    """Return a replacement snapshot for Tallinn today-7 through today+90.

    A naive ``now`` is interpreted as UTC. Invalid, unsupported, or over-budget
    input raises a sanitized ValueError, never a partial or empty-success result.
    """
    try:
        return _parse(payload, now)
    except Exception:
        raise ValueError(_ERROR) from None


def _parse(payload, now):
    if not isinstance(payload, bytes) or not 0 < len(payload) <= MAX_PAYLOAD_BYTES:
        raise ValueError(_ERROR)
    text = payload.decode("utf-8-sig").strip()
    if not text.startswith("BEGIN:VCALENDAR") or not text.endswith("END:VCALENDAR"):
        raise ValueError(_ERROR)
    calendars = Calendar.from_ical(text, multiple=True)
    if len(calendars) != 1:
        raise ValueError(_ERROR)
    cal = calendars[0]
    if cal.name != "VCALENDAR" or str(cal.get("VERSION")) != "2.0":
        raise ValueError(_ERROR)
    components = cal.walk()
    if len(components) > MAX_COMPONENTS or any(c.errors for c in components):
        raise ValueError(_ERROR)
    now = now.replace(tzinfo=timezone.utc) if now.tzinfo is None else now.astimezone(timezone.utc)
    today = now.astimezone(TALLINN).date()
    first, stop = _local(today - timedelta(days=7)), _local(today + timedelta(days=91))
    zones = {str(c.get("TZID")) for c in cal.subcomponents if c.name == "VTIMEZONE"}
    selected, work = {}, 0
    for component in cal.walk("VEVENT"):
        work += _validate(component, zones, stop)
        if work > MAX_RECURRENCE_WORK:
            raise ValueError(_ERROR)
        rid = component.get("RECURRENCE-ID")
        key = (str(component["UID"]), _identity(rid.dt) if rid is not None else "")
        if key not in selected or _revision(component) > _revision(selected[key]):
            selected[key] = component
    recurring = {uid for (uid, rid), c in selected.items() if rid or "RRULE" in c or "RDATE" in c}
    cancelled = {uid for (uid, rid), c in selected.items() if not rid and str(c.get("STATUS", "")).upper() == "CANCELLED"}
    exclusions = set()
    future_exclusions = {}
    clean = Calendar()
    clean.add("VERSION", "2.0")
    clean.add("X-WR-TIMEZONE", "Europe/Tallinn")
    for c in cal.subcomponents:
        if c.name == "VTIMEZONE":
            clean.add_component(c)
    for (uid, rid), component in selected.items():
        if uid in cancelled:
            continue
        if str(component.get("STATUS", "")).upper() == "CANCELLED":
            exclusions.add((uid, rid))
            if component["RECURRENCE-ID"].params.get("RANGE") == "THISANDFUTURE":
                future_exclusions[uid] = min(rid, future_exclusions.get(uid, rid))
            continue
        clean.add_component(component)
    rows = []
    for component in recurring_ical_events.of(clean, skip_bad_series=False).between(first, stop):
        uid = str(component["UID"])
        rid = component.get("RECURRENCE-ID", component["DTSTART"])
        recurrence_id = _identity(rid.dt)
        if ((uid, recurrence_id) in exclusions or
                (uid in future_exclusions and recurrence_id >= future_exclusions[uid])):
            continue
        identity = uid + "\0" + (recurrence_id if uid in recurring else "")
        rows.extend(_segments(component, identity, first, stop))
        if len(rows) > MAX_EVENTS:
            raise ValueError(_ERROR)
    rows.sort(key=lambda r: (r["date"], r["time_start"] or "", r["event_id"]))
    return {"as_of": now.replace(tzinfo=None).isoformat(), "events": rows, "fetch_warnings": []}
