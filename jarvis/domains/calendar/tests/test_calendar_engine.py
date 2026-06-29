"""Tests for the calendar domain engine.

All tests use mocked/recorded Plaan response fixtures — no live browser
session or network access. When real Plaan HTML is available from Cowork,
add a new fixture to fixtures.py and extend these tests (or add a new
test file for the real-data tests).

Read-only invariant: no test should ever write to, click on, or mutate
anything on Plaan. If a test requires checking that the engine refuses a
mutating action, write it as a constitution validation test.
"""

import copy
import unittest
from datetime import datetime, timezone

from jarvis.domains.calendar import engine
from jarvis.domains.calendar.data_contracts import EventType
from jarvis.domains.calendar.tests.fixtures import (
    EMPTY_SNAPSHOT_RAW,
    LATE_REHEARSAL,
    PARTIAL_SNAPSHOT_RAW,
    PERFORMANCE_EVENING,
    REHEARSAL_MORNING,
    STALE_SNAPSHOT_RAW,
    TYPICAL_WEEK_SNAPSHOT_RAW,
    make_snapshot_raw,
    make_event,
)


class ConstitutionValidationTests(unittest.TestCase):
    def setUp(self) -> None:
        self.constitution = engine.load_constitution()

    def test_constitution_loads_and_is_valid(self) -> None:
        engine.validate_constitution(self.constitution)

    def test_access_mode_is_read_only(self) -> None:
        self.assertEqual(self.constitution["access_mode"], "read_only")

    def test_no_mutations_flag_is_true(self) -> None:
        self.assertTrue(self.constitution["no_mutations"])

    def test_no_form_submissions_flag_is_true(self) -> None:
        self.assertTrue(self.constitution["no_form_submissions"])

    def test_tampered_constitution_raises(self) -> None:
        tampered = copy.deepcopy(self.constitution)
        tampered["no_mutations"] = False
        with self.assertRaises(ValueError):
            engine.validate_constitution(tampered)

    def test_wrong_access_mode_raises(self) -> None:
        tampered = copy.deepcopy(self.constitution)
        tampered["access_mode"] = "read_write"
        with self.assertRaises(ValueError):
            engine.validate_constitution(tampered)


class SnapshotParsingTests(unittest.TestCase):
    def test_parses_typical_week_snapshot(self) -> None:
        snapshot = engine.parse_snapshot(TYPICAL_WEEK_SNAPSHOT_RAW)
        self.assertEqual(len(snapshot.events), 5)

    def test_performance_event_parsed_correctly(self) -> None:
        snapshot = engine.parse_snapshot(TYPICAL_WEEK_SNAPSHOT_RAW)
        perfs = snapshot.performances()
        self.assertEqual(len(perfs), 1)
        perf = perfs[0]
        self.assertEqual(perf.event_type, EventType.PERFORMANCE)
        self.assertEqual(perf.title, "La Traviata")
        self.assertEqual(str(perf.date), "2026-06-25")
        self.assertEqual(perf.time_start.hour, 19)
        self.assertEqual(perf.time_end.hour, 22)

    def test_rehearsal_event_parsed_correctly(self) -> None:
        snapshot = engine.parse_snapshot(TYPICAL_WEEK_SNAPSHOT_RAW)
        rehearsals = snapshot.rehearsals()
        self.assertGreaterEqual(len(rehearsals), 1)
        reh = next(r for r in rehearsals if r.event_id == "reh-001")
        self.assertEqual(reh.event_type, EventType.REHEARSAL)
        self.assertEqual(reh.time_start.hour, 10)

    def test_unknown_event_type_becomes_unknown(self) -> None:
        snapshot = engine.parse_snapshot(TYPICAL_WEEK_SNAPSHOT_RAW)
        unknown_events = [e for e in snapshot.events if e.event_type == EventType.UNKNOWN]
        self.assertEqual(len(unknown_events), 1)
        self.assertEqual(unknown_events[0].title, "Guest Masterclass")

    def test_events_on_filters_by_date(self) -> None:
        from datetime import date
        snapshot = engine.parse_snapshot(TYPICAL_WEEK_SNAPSHOT_RAW)
        on_25 = snapshot.events_on(date(2026, 6, 25))
        self.assertEqual(len(on_25), 1)
        self.assertEqual(on_25[0].event_id, "perf-001")

    def test_empty_snapshot_parses_cleanly(self) -> None:
        snapshot = engine.parse_snapshot(EMPTY_SNAPSHOT_RAW)
        self.assertEqual(len(snapshot.events), 0)

    def test_fetch_warnings_are_preserved(self) -> None:
        snapshot = engine.parse_snapshot(PARTIAL_SNAPSHOT_RAW)
        self.assertEqual(len(snapshot.fetch_warnings), 1)
        self.assertIn("incomplete", snapshot.fetch_warnings[0].lower())

    def test_null_time_fields_parse_to_none(self) -> None:
        raw = make_snapshot_raw(events=[
            make_event("x1", "rehearsal", "No-time rehearsal", "2026-06-28",
                       time_start=None, time_end=None)
        ])
        snapshot = engine.parse_snapshot(raw)
        self.assertIsNone(snapshot.events[0].time_start)
        self.assertIsNone(snapshot.events[0].time_end)


class StalenessTests(unittest.TestCase):
    def setUp(self) -> None:
        self.constitution = engine.load_constitution()

    def test_fresh_snapshot_produces_no_warning(self) -> None:
        snapshot = engine.parse_snapshot(TYPICAL_WEEK_SNAPSHOT_RAW)
        now = datetime(2026, 6, 22, 10, 0, 0)
        warning = engine.snapshot_staleness_warning(snapshot, self.constitution, now=now)
        self.assertIsNone(warning)

    def test_snapshot_past_warn_threshold_produces_advisory(self) -> None:
        snapshot = engine.parse_snapshot(TYPICAL_WEEK_SNAPSHOT_RAW)
        now = datetime(2026, 6, 22, 22, 0, 0)
        warning = engine.snapshot_staleness_warning(snapshot, self.constitution, now=now)
        self.assertIsNotNone(warning)
        self.assertIn("13.0h", warning)

    def test_snapshot_past_max_threshold_is_hard_warning(self) -> None:
        snapshot = engine.parse_snapshot(STALE_SNAPSHOT_RAW)
        now = datetime(2026, 6, 22, 9, 0, 0)
        warning = engine.snapshot_staleness_warning(snapshot, self.constitution, now=now)
        self.assertIsNotNone(warning)
        self.assertIn("Fetch a fresh snapshot", warning)


class ConflictDetectionTests(unittest.TestCase):
    def setUp(self) -> None:
        self.constitution = engine.load_constitution()
        self.snapshot = engine.parse_snapshot(TYPICAL_WEEK_SNAPSHOT_RAW)

    def test_heavy_training_on_performance_day_is_hard_block(self) -> None:
        activities = [
            {
                "date": "2026-06-25",
                "activity_type": "heavy_training",
                "description": "Leg day squats",
                "time_start": "10:00",
            }
        ]
        conflicts = engine.detect_conflicts(self.snapshot, self.constitution, activities)
        hard = [c for c in conflicts if c.is_hard_block]
        self.assertGreater(len(hard), 0)
        self.assertEqual(hard[0].conflict_type, "heavy_training_on_performance_day")
        self.assertEqual(hard[0].opera_event.event_id, "perf-001")

    def test_practice_on_performance_day_is_not_blocked(self) -> None:
        activities = [
            {
                "date": "2026-06-25",
                "activity_type": "practice",
                "description": "Bassoon practice",
                "time_start": "10:00",
            }
        ]
        conflicts = engine.detect_conflicts(self.snapshot, self.constitution, activities)
        hard = [c for c in conflicts if c.is_hard_block]
        self.assertEqual(len(hard), 0)

    def test_heavy_training_day_before_performance_is_hard_block(self) -> None:
        # Performance at 2026-06-25. Training on 2026-06-24 (the calendar day before)
        # is a hard block regardless of exact training time, because "don't train
        # hard legs the day before a concert" is a day-level, not hour-level, rule.
        activities = [
            {
                "date": "2026-06-24",
                "activity_type": "heavy_training",
                "description": "Lower body plyometrics",
                "time_start": "08:00",
            }
        ]
        conflicts = engine.detect_conflicts(self.snapshot, self.constitution, activities)
        hard = [c for c in conflicts if c.is_hard_block]
        self.assertGreater(len(hard), 0)
        self.assertEqual(hard[0].conflict_type, "heavy_training_too_close_to_performance")

    def test_heavy_training_outside_buffer_is_not_blocked(self) -> None:
        # Performance at 2026-06-25 19:00. Training on 2026-06-22 is >18h away.
        activities = [
            {
                "date": "2026-06-22",
                "activity_type": "heavy_training",
                "description": "Leg day squats",
                "time_start": "10:00",
            }
        ]
        conflicts = engine.detect_conflicts(self.snapshot, self.constitution, activities)
        hard = [c for c in conflicts if c.is_hard_block]
        # 2026-06-22 23:59 to 2026-06-25 19:00 = ~67h > 18h buffer → no block
        self.assertEqual(len(hard), 0)

    def test_late_activity_during_late_rehearsal_is_advisory(self) -> None:
        # LATE_REHEARSAL ends at 22:30 on 2026-06-23.
        activities = [
            {
                "date": "2026-06-23",
                "activity_type": "other",
                "description": "Late basketball pickup game",
                "time_start": "21:30",
            }
        ]
        conflicts = engine.detect_conflicts(self.snapshot, self.constitution, activities)
        advisories = [c for c in conflicts if c.is_advisory]
        self.assertGreater(len(advisories), 0)
        self.assertEqual(advisories[0].conflict_type, "late_activity_during_late_rehearsal")

    def test_no_activities_produces_no_conflicts(self) -> None:
        conflicts = engine.detect_conflicts(self.snapshot, self.constitution, [])
        self.assertEqual(len(conflicts), 0)

    def test_empty_snapshot_produces_no_conflicts(self) -> None:
        empty_snapshot = engine.parse_snapshot(EMPTY_SNAPSHOT_RAW)
        activities = [
            {
                "date": "2026-06-25",
                "activity_type": "heavy_training",
                "description": "Leg day",
                "time_start": "10:00",
            }
        ]
        conflicts = engine.detect_conflicts(empty_snapshot, self.constitution, activities)
        self.assertEqual(len(conflicts), 0)


class FullCheckScheduleTests(unittest.TestCase):
    def setUp(self) -> None:
        self.constitution = engine.load_constitution()
        self.snapshot = engine.parse_snapshot(TYPICAL_WEEK_SNAPSHOT_RAW)
        self.now = datetime(2026, 6, 22, 10, 0, 0)

    def test_check_with_no_conflicts_returns_clean_result(self) -> None:
        result = engine.check_schedule(
            self.snapshot,
            self.constitution,
            proposed_activities=[],
            now=self.now,
        )
        self.assertFalse(result.has_conflicts)
        self.assertFalse(result.has_hard_blocks)
        self.assertIsNone(result.staleness_warning)

    def test_check_with_hard_conflict_returns_has_hard_blocks(self) -> None:
        result = engine.check_schedule(
            self.snapshot,
            self.constitution,
            proposed_activities=[
                {
                    "date": "2026-06-25",
                    "activity_type": "heavy_training",
                    "description": "Leg day",
                    "time_start": "10:00",
                }
            ],
            now=self.now,
        )
        self.assertTrue(result.has_conflicts)
        self.assertTrue(result.has_hard_blocks)

    def test_check_propagates_fetch_warnings(self) -> None:
        partial_snapshot = engine.parse_snapshot(PARTIAL_SNAPSHOT_RAW)
        result = engine.check_schedule(
            partial_snapshot,
            self.constitution,
            now=self.now,
        )
        self.assertEqual(len(result.fetch_warnings), 1)

    def test_check_result_includes_snapshot_age(self) -> None:
        result = engine.check_schedule(
            self.snapshot,
            self.constitution,
            now=self.now,
        )
        self.assertAlmostEqual(result.snapshot_age_hours, 1.0, delta=0.1)

    def test_tampered_constitution_raises_before_any_checks(self) -> None:
        tampered = copy.deepcopy(self.constitution)
        tampered["no_mutations"] = False
        with self.assertRaises(ValueError):
            engine.check_schedule(self.snapshot, tampered, now=self.now)


if __name__ == "__main__":
    unittest.main()

class IcsFeedPublisherTests(unittest.TestCase):
    def test_build_ics_feed_contains_calendar_and_event(self) -> None:
        from jarvis.domains.calendar import ics_feed
        raw = make_snapshot_raw([
            make_event("ics-1", "performance", "Othello", "2026-08-20", "19:00", "22:00")
        ], as_of="2026-08-20T09:00:00")
        snapshot = engine.parse_snapshot(raw)
        feed = ics_feed.build_ics_feed(snapshot)
        self.assertIn("BEGIN:VCALENDAR", feed)
        self.assertIn("BEGIN:VEVENT", feed)
        self.assertIn("SUMMARY:🎼 Othello", feed)
        self.assertIn("DTSTART;TZID=Europe/Tallinn:20260820T190000", feed)
        self.assertIn("X-PHOENIX-READ-ONLY:TRUE", feed)

    def test_build_ics_feed_all_day_for_no_time_event(self) -> None:
        from jarvis.domains.calendar import ics_feed
        raw = make_snapshot_raw([
            make_event("ics-all-day", "unknown", "No Time Call", "2026-08-21", None, None)
        ], as_of="2026-08-20T09:00:00")
        snapshot = engine.parse_snapshot(raw)
        feed = ics_feed.build_ics_feed(snapshot)
        self.assertIn("DTSTART;VALUE=DATE:20260821", feed)
        self.assertIn("DTEND;VALUE=DATE:20260822", feed)

    def test_feed_status_requires_private_token(self) -> None:
        from jarvis.domains.calendar import ics_feed
        raw = make_snapshot_raw([], as_of="2026-08-20T09:00:00")
        snapshot = engine.parse_snapshot(raw)
        status = ics_feed.feed_status(snapshot, {"active_source": "fixture", "read_only": True})
        self.assertTrue(status["token_required"])
        self.assertIn("feed_path_template", status)
        self.assertTrue(status["safety"]["plaan_read_only"])
        self.assertFalse(status["safety"]["google_write"])
