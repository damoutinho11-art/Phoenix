"""Tests for POST /calendar/plaan-live/import/excel."""

import io
import unittest

from fastapi.testclient import TestClient
from openpyxl import Workbook

from jarvis.api.main import app
from jarvis.data import database

client = TestClient(app)


def _build_xlsx(rows: list[tuple], header: list[str] | None = None) -> bytes:
    header = header or ["Kuupäev", "Pealkiri", "Näitlejad", "Ruum"]
    workbook = Workbook()
    sheet = workbook.active
    sheet.append(header)
    for row in rows:
        sheet.append(list(row))
    buffer = io.BytesIO()
    workbook.save(buffer)
    return buffer.getvalue()


_VALID_XLSX = _build_xlsx([
    ("03.07.2026 18:00 - 19:00", "Pressikonverents", "", "Läbi maja"),
    ("05.07.2026 10:00 - 13:00", "Proov: Sõduri lugu", "Kaspar Mänd", "Suur saal"),
])


class PlaanExcelImportRouteTests(unittest.TestCase):
    def tearDown(self) -> None:
        for item in database.list_calendar_snapshot_imports(limit=50):
            database.delete_calendar_snapshot_import(item["id"])

    def test_valid_excel_upload_succeeds(self) -> None:
        response = client.post(
            "/calendar/plaan-live/import/excel",
            files={"file": ("kava.xlsx", _VALID_XLSX, "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet")},
            data={"label": "July Kava export"},
        )
        self.assertEqual(response.status_code, 200)
        data = response.json()
        self.assertTrue(data["saved"])
        self.assertEqual(data["event_count"], 2)
        self.assertEqual(data["label"], "July Kava export")
        self.assertTrue(data["safety"]["read_only"])
        self.assertFalse(data["safety"]["credentials_stored"])

    def test_valid_upload_shows_up_in_latest_import(self) -> None:
        client.post(
            "/calendar/plaan-live/import/excel",
            files={"file": ("kava.xlsx", _VALID_XLSX, "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet")},
        )
        latest = client.get("/calendar/plaan-live/imports/latest").json()
        self.assertTrue(latest["configured"])
        self.assertEqual(latest["active_source"], "manual_import")
        self.assertEqual(latest["event_count"], 2)

    def test_invalid_file_returns_400_not_500(self) -> None:
        response = client.post(
            "/calendar/plaan-live/import/excel",
            files={"file": ("kava.xlsx", b"not a real xlsx file", "application/octet-stream")},
        )
        self.assertEqual(response.status_code, 400)
        self.assertIn("detail", response.json())

    def test_missing_header_returns_400(self) -> None:
        bad_bytes = _build_xlsx(
            [("Pressikonverents", "", "Läbi maja")],
            header=["Pealkiri", "Näitlejad", "Ruum"],
        )
        response = client.post(
            "/calendar/plaan-live/import/excel",
            files={"file": ("kava.xlsx", bad_bytes, "application/octet-stream")},
        )
        self.assertEqual(response.status_code, 400)
        self.assertIn("Kuupäev", response.json()["detail"])

    def test_xlsm_extension_rejected_at_router_level(self) -> None:
        response = client.post(
            "/calendar/plaan-live/import/excel",
            files={"file": ("kava.xlsm", _VALID_XLSX, "application/vnd.ms-excel.sheet.macroEnabled.12")},
        )
        self.assertEqual(response.status_code, 400)
        self.assertIn("Macro", response.json()["detail"])

    def test_no_raw_file_bytes_stored_in_database(self) -> None:
        client.post(
            "/calendar/plaan-live/import/excel",
            files={"file": ("kava.xlsx", _VALID_XLSX, "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet")},
        )
        imports = database.list_calendar_snapshot_imports(limit=50)
        self.assertEqual(len(imports), 1)
        stored = imports[0]

        # The only persisted payload is the normalized JSON snapshot + validation.
        self.assertIn("snapshot", stored)
        self.assertIn("validation", stored)
        serialized = str(stored)
        self.assertNotIn("PK\x03\x04", serialized)  # zip/xlsx file magic bytes
        self.assertNotIn("xl/worksheets", serialized)
        self.assertNotIn("[Content_Types].xml", serialized)


if __name__ == "__main__":
    unittest.main()
