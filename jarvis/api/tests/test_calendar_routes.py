"""Tests for /calendar routes.

All tests use the LIVE_SNAPSHOT_RAW fixture (real Plaan scrape from 2026-06-22).
No live browser session or network access.
"""

import unittest

from fastapi import HTTPException
from fastapi.testclient import TestClient

from jarvis.api import dependencies
from jarvis.data import database
from jarvis.api.main import app
from jarvis.domains.calendar.tests.fixtures import LIVE_SNAPSHOT_RAW, make_event, make_snapshot_raw

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

class PlaanLiveStatusRouteTests(unittest.TestCase):
    def test_plaan_live_status_is_read_only_and_default_disabled(self) -> None:
        response = client.get("/calendar/plaan-live/status")
        self.assertEqual(response.status_code, 200)
        data = response.json()
        self.assertEqual(data["mode"], "plaan_read_only_fetcher_shell")
        self.assertTrue(data["read_only"])
        self.assertFalse(data["mutations_allowed"])
        self.assertFalse(data["credentials_stored"])
        self.assertFalse(data["cookies_stored"])
        self.assertFalse(data["raw_page_sent_to_ai"])
        self.assertEqual(data["allowed_methods"], ["GET"])

    def test_plaan_live_preview_returns_snapshot_shape(self) -> None:
        response = client.get("/calendar/plaan-live/preview")
        self.assertEqual(response.status_code, 200)
        data = response.json()
        self.assertIn("as_of", data)
        self.assertIn("events", data)
        self.assertIn("source", data)
        self.assertIn("read_only_notice", data)
        self.assertTrue(data["source"]["read_only"])

    def test_calendar_snapshot_exposes_source_info(self) -> None:
        data = client.get("/calendar/snapshot").json()
        self.assertIn("source", data)
        self.assertTrue(data["source"]["read_only"])
        self.assertFalse(data["source"]["mutations_allowed"])


class PlaanManualImportRouteTests(unittest.TestCase):
    def tearDown(self) -> None:
        for item in database.list_calendar_snapshot_imports(limit=50):
            database.delete_calendar_snapshot_import(item["id"])

    def test_manual_import_rejects_raw_page_like_payload(self) -> None:
        payload = {
            "snapshot": {
                "as_of": "2026-08-20T09:00:00",
                "events": [],
                "cookies": "session=secret",
            },
            "label": "unsafe",
        }
        response = client.post("/calendar/plaan-live/import", json=payload)
        self.assertEqual(response.status_code, 400)
        self.assertIn("credential", response.json()["detail"])

    def test_manual_import_becomes_calendar_snapshot_source(self) -> None:
        raw = make_snapshot_raw([
            make_event("manual-route-1", "performance", "Manual Route Performance", "2026-08-20", "19:00", "22:00")
        ], as_of="2026-08-20T09:00:00")
        response = client.post("/calendar/plaan-live/import", json={"snapshot": raw, "label": "test import"})
        self.assertEqual(response.status_code, 200)
        data = response.json()
        self.assertTrue(data["saved"])
        self.assertEqual(data["event_count"], 1)
        snapshot = client.get("/calendar/snapshot").json()
        self.assertEqual(snapshot["source"]["active_source"], "manual_import")
        self.assertEqual(snapshot["events"][0]["title"], "Manual Route Performance")
        latest = client.get("/calendar/plaan-live/imports/latest").json()
        self.assertTrue(latest["configured"])
        self.assertEqual(latest["event_count"], 1)

    def test_manual_import_flows_into_nutrition_calendar_bridge(self) -> None:
        raw = make_snapshot_raw([
            make_event("manual-nutrition-1", "rehearsal", "Nutrition Bridge Rehearsal", "2026-08-20", "10:00", "13:00")
        ], as_of="2026-08-20T09:00:00")
        response = client.post("/calendar/plaan-live/import", json={"snapshot": raw, "label": "nutrition bridge import"})
        self.assertEqual(response.status_code, 200)
        bridge = client.get("/nutrition/calendar-bridge?days=3&start_date=2026-08-20").json()
        self.assertEqual(bridge["calendar_source"]["active_source"], "manual_import")
        self.assertEqual(bridge["counts"]["events"], 1)
        self.assertIn("Nutrition Bridge Rehearsal", str(bridge["days"][0]["events"]))

class CalendarIcsFeedRouteTests(unittest.TestCase):
    def tearDown(self) -> None:
        for item in database.list_calendar_snapshot_imports(limit=50):
            database.delete_calendar_snapshot_import(item["id"])

    def test_feed_status_is_safe_and_does_not_expose_token(self) -> None:
        response = client.get("/calendar/feed/status")
        self.assertEqual(response.status_code, 200)
        data = response.json()
        self.assertEqual(data["mode"], "phoenix_ics_feed_publisher")
        self.assertTrue(data["token_required"])
        self.assertNotIn("token", data)
        self.assertFalse(data["safety"]["google_write"])
        self.assertTrue(data["safety"]["plaan_read_only"])

    def test_feed_ics_disabled_without_token_config(self) -> None:
        response = client.get("/calendar/feed.ics?token=anything")
        self.assertEqual(response.status_code, 403)

    def test_feed_ics_requires_matching_token_and_exports_imported_snapshot(self) -> None:
        import os
        raw = make_snapshot_raw([
            make_event("ics-route-1", "performance", "ICS Route Performance", "2026-08-20", "19:00", "22:00")
        ], as_of="2026-08-20T09:00:00")
        client.post("/calendar/plaan-live/import", json={"snapshot": raw, "label": "ics route import"})
        old = os.environ.get("PHOENIX_CALENDAR_FEED_TOKEN")
        os.environ["PHOENIX_CALENDAR_FEED_TOKEN"] = "test-feed-token"
        try:
            denied = client.get("/calendar/feed.ics?token=wrong")
            self.assertEqual(denied.status_code, 403)
            response = client.get("/calendar/feed.ics?token=test-feed-token")
            self.assertEqual(response.status_code, 200)
            self.assertIn("text/calendar", response.headers.get("content-type", ""))
            self.assertIn("BEGIN:VCALENDAR", response.text)
            self.assertIn("ICS Route Performance", response.text)
            self.assertIn("X-PHOENIX-READ-ONLY:TRUE", response.text)
        finally:
            if old is None:
                os.environ.pop("PHOENIX_CALENDAR_FEED_TOKEN", None)
            else:
                os.environ["PHOENIX_CALENDAR_FEED_TOKEN"] = old
