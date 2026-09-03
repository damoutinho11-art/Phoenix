from datetime import datetime, timezone

import pytest

from jarvis.domains.calendar.plaan_ical import parse_personal_calendar


NOW = datetime(2026, 9, 3, 12, tzinfo=timezone.utc)


def calendar(*events):
    return ("BEGIN:VCALENDAR\r\nVERSION:2.0\r\nPRODID:-//Test//EN\r\n" +
            "".join("BEGIN:VEVENT\r\n" + e.replace("\n", "\r\n") +
                    "\r\nEND:VEVENT\r\n" for e in events) +
            "END:VCALENDAR\r\n").encode()


def event(uid="one", start="20260903T100000Z", end="20260903T110000Z", extra=""):
    return f"UID:{uid}\nDTSTART:{start}\nDTEND:{end}\nSUMMARY:Meeting\n{extra}".strip()


def parse(*events, now=NOW):
    return parse_personal_calendar(calendar(*events), now=now)


def test_empty_and_as_of_are_normalized():
    assert parse() == {"as_of": "2026-09-03T12:00:00", "events": [], "fetch_warnings": []}
    assert parse(now=NOW.replace(tzinfo=None))["as_of"] == "2026-09-03T12:00:00"


def test_utc_text_and_contract():
    row = parse(event().replace("SUMMARY:Meeting", "SUMMARY:Some\\, folded\n text\\nNext") +
                "\nLOCATION:Room\\; A")["events"][0]
    assert row == {"event_id": row["event_id"], "event_type": "unknown",
                   "title": "Some, foldedtext\nNext", "date": "2026-09-03",
                   "time_start": "13:00", "time_end": "14:00",
                   "location": "Room; A", "role": None}


def test_explicit_category_only():
    assert parse(event(extra="CATEGORIES:REHEARSAL"))["events"][0]["event_type"] == "rehearsal"
    assert parse(event(extra="CATEGORIES:REHEARSAL,PERFORMANCE"))["events"][0]["event_type"] == "unknown"


@pytest.mark.parametrize("title", [
    "Evening (kontsert)", "Evening (KoNtSeRt)", "Opera (6. ooper)",
    "Opera (12. OOPER)", "Dance (2. ballett)", "Dance ( 3. BALLETT )  ",
])
def test_verified_performance_title_markers(title):
    row = parse(event().replace("SUMMARY:Meeting", f"SUMMARY:{title}"))["events"][0]
    assert row["event_type"] == "performance"
    assert row["title"] == title


@pytest.mark.parametrize("title", [
    "ORK: Programme", "ork:Programme", "  ORK: Programme",
    "L\u00c4B+ORK Programme", "Programme L\u00e4b+ork", "STZ/Programme", "PP/Programme",
    "Programme stz/ Section", "Programme pp/ Section",
])
def test_verified_rehearsal_title_tokens(title):
    assert parse(event().replace("SUMMARY:Meeting", f"SUMMARY:{title}"))["events"][0]["event_type"] == "rehearsal"


@pytest.mark.parametrize("title", [
    "OPERA", "KONTSERT", "BALLET REHEARSAL", "Evening kontsert", "Opera (ooper)",
    "Dance (ballett)", "Opera (6 ooper)", "Opera (6. ooper extra)",
    "Evening (kontsert rehearsal)", "Evening (kontsert) notes", "Dance (2. ballett extra)",
    "Programme ORK: Section", "WORK: Programme", "XSTZ/Programme", "APP/Programme",
    "XL\u00c4B+ORK", "L\u00c4B+ORKextra", "ORK", "STZ", "PP",
    "ORK: Programme (kontsert)",
])
def test_unverified_or_conflicting_title_signals_stay_unknown(title):
    assert parse(event().replace("SUMMARY:Meeting", f"SUMMARY:{title}"))["events"][0]["event_type"] == "unknown"


@pytest.mark.parametrize("category,title,expected", [
    ("REHEARSAL", "Evening (kontsert)", "rehearsal"),
    ("PERFORMANCE", "ORK: Programme", "performance"),
    ("CALL", "Evening (kontsert)", "call"),
    ("TRAVEL", "PP/Programme", "travel"),
    ("custom", "Evening (kontsert)", "performance"),
    ("REHEARSAL,PERFORMANCE", "Evening (kontsert)", "unknown"),
])
def test_categories_take_precedence_over_title_fallback(category, title, expected):
    raw = event(extra=f"CATEGORIES:{category}").replace("SUMMARY:Meeting", f"SUMMARY:{title}")
    assert parse(raw)["events"][0]["event_type"] == expected


def test_all_day_and_overnight_split():
    rows = parse("UID:day\nDTSTART;VALUE=DATE:20260903\nDTEND;VALUE=DATE:20260905",
                 event("night", "20260903T200000Z", "20260904T010000Z"))["events"]
    day = [r for r in rows if r["time_start"] is None]
    night = [r for r in rows if r["time_start"] is not None]
    assert [(r["date"], r["time_end"]) for r in day] == [("2026-09-03", None), ("2026-09-04", None)]
    assert [(r["date"], r["time_start"], r["time_end"]) for r in night] == [
        ("2026-09-03", "23:00", "23:59"), ("2026-09-04", "00:00", "04:00")]
    assert len({r["event_id"] for r in rows}) == 4


def test_midnight_has_no_extra_segment():
    rows = parse(event(end="20260903T210000Z"))["events"]
    assert len(rows) == 1
    assert rows[0]["time_end"] == "23:59"


def test_window_uses_tallinn_today_and_exclusive_end():
    rows = parse("UID:r\nDTSTART;VALUE=DATE:20260801\nRRULE:FREQ=DAILY",
                 now=datetime(2026, 9, 2, 22, tzinfo=timezone.utc))["events"]
    assert len(rows) == 98
    assert rows[0]["date"] == "2026-08-27"
    assert rows[-1]["date"] == "2026-12-02"


def test_dst_and_floating_use_tallinn():
    rows = parse("UID:r\nDTSTART;TZID=Europe/Tallinn:20261024T100000\n"
                 "DTEND;TZID=Europe/Tallinn:20261024T110000\nRRULE:FREQ=DAILY;COUNT=3",
                 event("utc", "20261025T080000Z", "20261025T090000Z"),
                 event("float", "20260903T100000", "20260903T110000"))["events"]
    assert all(r["time_start"] == "10:00" for r in rows)


def test_revisions_choose_sequence_then_timestamp_and_ids_stay_stable():
    old = event(extra="SEQUENCE:1\nDTSTAMP:20260903T120000Z")
    new = event(start="20260903T120000Z", end="20260903T130000Z",
                extra="SEQUENCE:2\nDTSTAMP:20260903T110000Z")
    for inputs in [(old, new), (new, old), (new, new)]:
        rows = parse(*inputs)["events"]
        assert len(rows) == 1
        assert rows[0]["time_start"] == "15:00"
        assert rows[0]["event_id"] == parse(old)["events"][0]["event_id"]
    newer = new.replace("DTSTAMP:20260903T110000Z", "DTSTAMP:20260903T140000Z").replace("SUMMARY:Meeting", "SUMMARY:Updated")
    assert parse(new, newer)["events"][0]["title"] == "Updated"


def test_exclusions_overrides_cancellation_and_identity():
    master = event(extra="RRULE:FREQ=DAILY;COUNT=5\nEXDATE:20260904T100000Z")
    override = event(start="20260905T140000Z", end="20260905T150000Z",
                     extra="RECURRENCE-ID:20260905T100000Z\nSEQUENCE:1")
    cancelled = "UID:one\nRECURRENCE-ID:20260906T100000Z\nSTATUS:CANCELLED\nSEQUENCE:2"
    rows = parse(master, override, cancelled)["events"]
    assert [(r["date"], r["time_start"]) for r in rows] == [
        ("2026-09-03", "13:00"), ("2026-09-05", "17:00"), ("2026-09-07", "13:00")]
    original = parse(master)["events"]
    assert rows[1]["event_id"] == next(r["event_id"] for r in original if r["date"] == "2026-09-05")
    assert parse(master, "UID:one\nSTATUS:CANCELLED\nSEQUENCE:3")["events"] == []


@pytest.mark.parametrize("payload", [b"", b"<html>secret</html>", b"BEGIN:VCALENDAR\r\n",
    calendar("UID:x\nDTSTART:bad"), calendar("DTSTART:20260903T100000Z"),
    calendar(event(end="20260903T090000Z")),
    calendar(event().replace("DTSTART:", "DTSTART;TZID=Not/AZone:")),
    calendar(event(extra="RRULE:FREQ=SECONDLY")), b"x" * (5 * 1024 * 1024 + 1)],
    ids=["empty", "html", "truncated", "bad-date", "no-uid", "negative-duration",
         "unknown-zone", "dense-recurrence", "oversize"])
def test_invalid_input_fails_closed_with_sanitized_error(payload):
    with pytest.raises(ValueError, match="^Invalid or unsupported personal calendar\\.$"):
        parse_personal_calendar(payload, now=NOW)


def test_malformed_event_does_not_return_partial_schedule():
    with pytest.raises(ValueError):
        parse(event(), "UID:broken\nDTSTART:bad")


def test_removed_events_are_not_retained():
    assert len(parse(event())["events"]) == 1
    assert parse()["events"] == []


def test_duration_and_rdate():
    rows = parse("UID:r\nDTSTART:20260903T100000Z\nDURATION:PT2H\nRDATE:20260905T100000Z")["events"]
    assert [(r["date"], r["time_end"]) for r in rows] == [("2026-09-03", "15:00"), ("2026-09-05", "15:00")]


def test_override_moved_to_another_day_retains_identity():
    master = event(extra="RRULE:FREQ=DAILY;COUNT=2")
    override = event(start="20260906T140000Z", end="20260906T150000Z",
                     extra="RECURRENCE-ID:20260904T100000Z")
    before = parse(master)["events"]
    after = parse(master, override)["events"]
    assert before[1]["event_id"] == after[1]["event_id"]
    assert after[1]["date"] == "2026-09-06"


def test_spring_dst_utc_conversion():
    rows = parse(event("a", "20260328T080000Z", "20260328T090000Z"),
                 event("b", "20260329T080000Z", "20260329T090000Z"),
                 now=datetime(2026, 3, 28))["events"]
    assert [r["time_start"] for r in rows] == ["10:00", "11:00"]


@pytest.mark.parametrize("extra", ["EXRULE:FREQ=DAILY", "RRULE:FREQ=NOPE",
    "RRULE:FREQ=DAILY;COUNT=0", "RRULE:FREQ=DAILY;INTERVAL=0",
    "DTSTART:20260904T100000Z", "DURATION:PT1H"])
def test_unsupported_or_ambiguous_event_rejected(extra):
    with pytest.raises(ValueError):
        parse(event(extra=extra))


def test_multiple_calendars_rejected():
    with pytest.raises(ValueError):
        parse_personal_calendar(calendar() + calendar(), now=NOW)


@pytest.mark.parametrize("limit", ["MAX_COMPONENTS", "MAX_EVENTS", "MAX_RECURRENCE_WORK"])
def test_resource_budgets_fail_closed(monkeypatch, limit):
    from jarvis.domains.calendar import plaan_ical
    monkeypatch.setattr(plaan_ical, limit, 1)
    with pytest.raises(ValueError):
        parse(event("a"), event("b"))


def test_recurrence_work_is_bounded_before_library_expansion(monkeypatch):
    from jarvis.domains.calendar import plaan_ical
    def forbidden(*args, **kwargs):
        pytest.fail("Over-budget calendar reached recurrence expansion")
    monkeypatch.setattr(plaan_ical.recurring_ical_events, "of", forbidden)
    with pytest.raises(ValueError):
        parse(event(extra="RRULE:FREQ=DAILY;BYHOUR=0,1,2,3,4,5,6,7,8,9;"
                          "BYMINUTE=0,1,2,3,4,5,6,7,8,9;BYSECOND=0,1,2,3,4,5,6,7,8,9"))


def test_very_old_series_and_excessive_duration_rejected():
    with pytest.raises(ValueError):
        parse("UID:r\nDTSTART:18000101T100000Z\nRRULE:FREQ=DAILY")
    with pytest.raises(ValueError):
        parse("UID:r\nDTSTART:20260903T100000Z\nDURATION:P1000D")


def test_cancel_this_and_future():
    rows = parse(event(extra="RRULE:FREQ=DAILY;COUNT=5"),
                 "UID:one\nRECURRENCE-ID;RANGE=THISANDFUTURE:20260905T100000Z\nSTATUS:CANCELLED")["events"]
    assert [r["date"] for r in rows] == ["2026-09-03", "2026-09-04"]


def test_override_displacement_budget():
    with pytest.raises(ValueError):
        parse(event(extra="RECURRENCE-ID:19000903T100000Z"))


def test_unknown_recurrence_range_rejected():
    with pytest.raises(ValueError):
        parse(event(extra="RECURRENCE-ID;RANGE=INVALID:20260903T100000Z"))
