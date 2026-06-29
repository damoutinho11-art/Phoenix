import json
import os
import tempfile
import unittest

from jarvis.domains.calendar import engine, plaan_live
from jarvis.domains.calendar.tests.fixtures import EMPTY_SNAPSHOT_RAW, make_event, make_snapshot_raw


class PlaanLiveFetcherShellTests(unittest.TestCase):
    def tearDown(self) -> None:
        for key in [
            "PHOENIX_PLAAN_LIVE_ENABLED",
            "PHOENIX_PLAAN_SNAPSHOT_URL",
            "PHOENIX_PLAAN_SNAPSHOT_PATH",
            "PHOENIX_PLAAN_SNAPSHOT_JSON",
        ]:
            os.environ.pop(key, None)

    def test_default_status_is_fixture_read_only(self) -> None:
        status = plaan_live.get_plaan_live_status()
        self.assertEqual(status["active_source"], "fixture")
        self.assertTrue(status["read_only"])
        self.assertFalse(status["mutations_allowed"])
        self.assertFalse(status["credentials_stored"])
        self.assertEqual(status["allowed_methods"], ["GET"])

    def test_rejects_non_plaan_snapshot_url(self) -> None:
        os.environ["PHOENIX_PLAAN_LIVE_ENABLED"] = "true"
        os.environ["PHOENIX_PLAAN_SNAPSHOT_URL"] = "https://example.com/snapshot.json"
        status = plaan_live.get_plaan_live_status()
        self.assertTrue(status["blockers"])
        self.assertIn("plaan.opera.ee", status["blockers"][0])

    def test_env_json_snapshot_overrides_fixture(self) -> None:
        raw = make_snapshot_raw([
            make_event("env-1", "performance", "Env Performance", "2026-08-12", "19:00", "22:00")
        ], as_of="2026-08-12T09:00:00")
        os.environ["PHOENIX_PLAAN_SNAPSHOT_JSON"] = json.dumps(raw)
        snapshot_raw, source = plaan_live.resolve_snapshot_raw(EMPTY_SNAPSHOT_RAW)
        self.assertEqual(source["active_source"], "env_json")
        snapshot = engine.parse_snapshot(snapshot_raw)
        self.assertEqual(len(snapshot.events), 1)
        self.assertEqual(snapshot.events[0].title, "Env Performance")

    def test_local_file_snapshot_overrides_fixture(self) -> None:
        raw = make_snapshot_raw([
            make_event("file-1", "rehearsal", "File Rehearsal", "2026-08-13", "11:00", "15:00")
        ], as_of="2026-08-13T09:00:00")
        with tempfile.NamedTemporaryFile("w", suffix=".json", delete=False, encoding="utf-8") as f:
            json.dump(raw, f)
            path = f.name
        try:
            os.environ["PHOENIX_PLAAN_SNAPSHOT_PATH"] = path
            snapshot_raw, source = plaan_live.resolve_snapshot_raw(EMPTY_SNAPSHOT_RAW)
            self.assertEqual(source["active_source"], "local_file")
            snapshot = engine.parse_snapshot(snapshot_raw)
            self.assertEqual(len(snapshot.events), 1)
            self.assertEqual(snapshot.events[0].title, "File Rehearsal")
        finally:
            try:
                os.remove(path)
            except OSError:
                pass

    def test_invalid_optional_source_falls_back_to_fixture(self) -> None:
        os.environ["PHOENIX_PLAAN_SNAPSHOT_JSON"] = "not-json"
        snapshot_raw, source = plaan_live.resolve_snapshot_raw(EMPTY_SNAPSHOT_RAW)
        self.assertEqual(source["active_source"], "fixture_fallback")
        self.assertTrue(source["warnings"])
        self.assertEqual(snapshot_raw["events"], [])

class PlaanManualSnapshotImportTests(unittest.TestCase):
    def test_manual_import_sanitizes_to_calendar_contract(self) -> None:
        raw = make_snapshot_raw([
            {
                **make_event("manual-1", "performance", "Manual Performance", "2026-08-20", "19:00", "22:00"),
                "extra_dom_field": "ignored",
            }
        ], as_of="2026-08-20T09:00:00")
        clean, validation = plaan_live.validate_manual_snapshot_import(raw)
        self.assertTrue(validation["valid"])
        self.assertEqual(validation["event_count"], 1)
        self.assertNotIn("extra_dom_field", clean["events"][0])
        snapshot = engine.parse_snapshot(clean)
        self.assertEqual(snapshot.events[0].title, "Manual Performance")

    def test_manual_import_rejects_credentials_or_raw_page_keys(self) -> None:
        raw = make_snapshot_raw([], as_of="2026-08-20T09:00:00")
        raw["cookies"] = "session=secret"
        with self.assertRaises(ValueError):
            plaan_live.validate_manual_snapshot_import(raw)

    def test_manual_import_source_is_used_before_url_and_fixture(self) -> None:
        imported = make_snapshot_raw([
            make_event("manual-2", "rehearsal", "Manual Rehearsal", "2026-08-21", "10:00", "13:00")
        ], as_of="2026-08-21T08:00:00")
        os.environ["PHOENIX_PLAAN_LIVE_ENABLED"] = "true"
        os.environ["PHOENIX_PLAAN_SNAPSHOT_URL"] = "https://plaan.opera.ee/v2/workspace/snapshot.json"
        snapshot_raw, source = plaan_live.resolve_snapshot_raw(EMPTY_SNAPSHOT_RAW, imported_snapshot=imported)
        self.assertEqual(source["active_source"], "manual_import")
        snapshot = engine.parse_snapshot(snapshot_raw)
        self.assertEqual(snapshot.events[0].title, "Manual Rehearsal")
