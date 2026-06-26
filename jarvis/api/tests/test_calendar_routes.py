"""Tests for /calendar routes.

All tests use the LIVE_SNAPSHOT_RAW fixture (real Plaan scrape from 2026-06-22).
No live browser session or network access.
"""

import unittest

from fastapi import HTTPException
from fastapi.testclient import TestClient

from jarvis.api import dependencies
from jarvis.api.main import app
from jarvis.domains.calendar.tests.fixtures import LIVE_SNAPSHOT_RAW

client = TestClient(app)

_EXPECTED_WARNING_COUNT = len(LIVE_SNAPSHOT_RAW["fetch_warnings"])


class CalendarSnapshotRouteTests(unittest.TestCase):
    def test_snapshot_returns_200(self) -> None:
        response = client.get("/calendar/snapshot")
        self.assertEqual(response.status_code, 200)

    def test_snapshot_shape(self) -> None:
        data = client.get("/calendar/snapshot").json()
        self.assertIn("as_of", data)
        self.assertIn("events", data)
        self.assertIn("fetch_warnings", data)
        self.assertIn("staleness_warning", data)

    def test_snapshot_as_of_matches_live_fixture(self) -> None:
        data = client.get("/calendar/snapshot").json()
        self.assertEqual(data["as_of"], "2026-06-22T17:30:00")

    def test_snapshot_events_list_is_empty_during_season_gap(self) -> None:
        # LIVE_SNAPSHOT_RAW has zero events: season ended, Aug not yet assigned
        data = client.get("/calendar/snapshot").json()
        self.assertEqual(data["events"], [])

    def test_snapshot_fetch_warnings_are_all_present(self) -> None:
        data = client.get("/calendar/snapshot").json()
        self.assertEqual(len(data["fetch_warnings"]), _EXPECTED_WARNING_COUNT)

    def test_snapshot_fetch_warnings_contain_season_gap_note(self) -> None:
        data = client.get("/calendar/snapshot").json()
        joined = " ".join(data["fetch_warnings"])
        self.assertIn("SEASON GAP", joined)

    def test_snapshot_fetch_warnings_mention_august(self) -> None:
        data = client.get("/calendar/snapshot").json()
        joined = " ".join(data["fetch_warnings"])
        self.assertIn("AUGUST", joined)

    def test_snapshot_staleness_warning_is_string_or_none(self) -> None:
        # as_of is 2026-06-22T17:30:00; staleness depends on wall-clock time of test run
        data = client.get("/calendar/snapshot").json()
        warning = data["staleness_warning"]
        self.assertTrue(warning is None or isinstance(warning, str))

    def test_snapshot_invalid_calendar_constitution_returns_500(self) -> None:
        def _raise() -> dict:
            raise HTTPException(status_code=500, detail="Calendar constitution violation: test")

        app.dependency_overrides[dependencies.get_calendar_constitution] = _raise
        try:
            response = client.get("/calendar/snapshot")
            self.assertEqual(response.status_code, 500)
        finally:
            app.dependency_overrides.clear()


if __name__ == "__main__":
    unittest.main()
