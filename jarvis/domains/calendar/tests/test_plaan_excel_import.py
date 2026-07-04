"""Tests for the Plaan Excel ("Excel - Kava" export) import converter."""

import io
import unittest
import zipfile

from openpyxl import Workbook

from jarvis.domains.calendar import plaan_excel_import


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


def _build_xlsm(rows: list[tuple]) -> bytes:
    """Build a fake macro-enabled workbook: a valid xlsx zip plus a vbaProject.bin part."""
    base = _build_xlsx(rows)
    buffer = io.BytesIO()
    with zipfile.ZipFile(io.BytesIO(base)) as source, zipfile.ZipFile(buffer, "w") as dest:
        for item in source.infolist():
            dest.writestr(item, source.read(item.filename))
        dest.writestr("xl/vbaProject.bin", b"fake-macro-bytes")
    return buffer.getvalue()


class ParsePlaanExcelHappyPathTests(unittest.TestCase):
    def setUp(self) -> None:
        self.file_bytes = _build_xlsx([
            ("03.07.2026 18:00 - 19:00", "Pressikonverents", "", "Läbi maja"),
            ("05.07.2026 10:00 - 13:00", "Proov: Sõduri lugu", "Kaspar Mänd", "Suur saal"),
        ])
        self.result = plaan_excel_import.parse_plaan_excel(self.file_bytes)

    def test_returns_expected_shape(self) -> None:
        self.assertIn("as_of", self.result)
        self.assertIn("events", self.result)
        self.assertIn("fetch_warnings", self.result)

    def test_event_count(self) -> None:
        self.assertEqual(len(self.result["events"]), 2)

    def test_source_fetch_warning_present(self) -> None:
        joined = " ".join(self.result["fetch_warnings"])
        self.assertIn("manual Excel import", joined)

    def test_first_event_date_and_time_split(self) -> None:
        event = self.result["events"][0]
        self.assertEqual(event["date"], "2026-07-03")
        self.assertEqual(event["time_start"], "18:00")
        self.assertEqual(event["time_end"], "19:00")
        self.assertEqual(event["title"], "Pressikonverents")
        self.assertEqual(event["location"], "Läbi maja")
        self.assertIsNone(event["role"])
        self.assertEqual(event["event_type"], "press_conference")

    def test_second_event_rehearsal_inference(self) -> None:
        event = self.result["events"][1]
        self.assertEqual(event["date"], "2026-07-05")
        self.assertEqual(event["time_start"], "10:00")
        self.assertEqual(event["time_end"], "13:00")
        self.assertEqual(event["event_type"], "rehearsal")
        self.assertEqual(event["location"], "Suur saal")
        self.assertEqual(event["role"], "Kaspar Mänd")

    def test_event_ids_are_deterministic_and_unique(self) -> None:
        ids = [e["event_id"] for e in self.result["events"]]
        self.assertEqual(len(ids), len(set(ids)))
        again = plaan_excel_import.parse_plaan_excel(self.file_bytes)
        self.assertEqual(ids, [e["event_id"] for e in again["events"]])


class MalformedTimeRangeTests(unittest.TestCase):
    def test_date_only_row_still_produces_event_with_warning(self) -> None:
        file_bytes = _build_xlsx([
            ("12.07.2026", "Gala kontsert", "", "Suur saal"),
        ])
        result = plaan_excel_import.parse_plaan_excel(file_bytes)
        self.assertEqual(len(result["events"]), 1)
        event = result["events"][0]
        self.assertEqual(event["date"], "2026-07-12")
        self.assertIsNone(event["time_start"])
        self.assertIsNone(event["time_end"])
        self.assertEqual(event["event_type"], "gala")
        joined = " ".join(result["fetch_warnings"])
        self.assertIn("12.07.2026", joined)

    def test_completely_unparseable_date_is_warned_not_crashed(self) -> None:
        file_bytes = _build_xlsx([
            ("not a date at all", "Mystery event", "", ""),
        ])
        result = plaan_excel_import.parse_plaan_excel(file_bytes)
        self.assertEqual(result["events"], [])
        joined = " ".join(result["fetch_warnings"])
        self.assertIn("not a date at all", joined)


class HeaderValidationTests(unittest.TestCase):
    def test_missing_kuupaev_header_raises_clear_error(self) -> None:
        file_bytes = _build_xlsx(
            [("Pressikonverents", "", "Läbi maja")],
            header=["Pealkiri", "Näitlejad", "Ruum"],
        )
        with self.assertRaises(ValueError) as ctx:
            plaan_excel_import.parse_plaan_excel(file_bytes)
        self.assertIn("Kuupäev", str(ctx.exception))

    def test_missing_pealkiri_header_raises_clear_error(self) -> None:
        file_bytes = _build_xlsx(
            [("03.07.2026 18:00 - 19:00", "", "Läbi maja")],
            header=["Kuupäev", "Näitlejad", "Ruum"],
        )
        with self.assertRaises(ValueError) as ctx:
            plaan_excel_import.parse_plaan_excel(file_bytes)
        self.assertIn("Pealkiri", str(ctx.exception))


class SizeAndRowLimitTests(unittest.TestCase):
    def test_oversized_file_is_rejected(self) -> None:
        with self.assertRaises(ValueError) as ctx:
            plaan_excel_import.parse_plaan_excel(b"0" * (plaan_excel_import._MAX_FILE_SIZE_BYTES + 1))
        self.assertIn("too large", str(ctx.exception).lower())

    def test_too_many_rows_is_rejected(self) -> None:
        rows = [("03.07.2026 18:00 - 19:00", f"Event {i}", "", "Suur saal") for i in range(plaan_excel_import._MAX_ROWS + 5)]
        file_bytes = _build_xlsx(rows)
        with self.assertRaises(ValueError):
            plaan_excel_import.parse_plaan_excel(file_bytes)


class MacroRejectionTests(unittest.TestCase):
    def test_macro_enabled_workbook_is_rejected(self) -> None:
        file_bytes = _build_xlsm([
            ("03.07.2026 18:00 - 19:00", "Pressikonverents", "", "Läbi maja"),
        ])
        with self.assertRaises(ValueError) as ctx:
            plaan_excel_import.parse_plaan_excel(file_bytes)
        self.assertIn("Macro", str(ctx.exception))


class BlankRowSkippingTests(unittest.TestCase):
    def test_fully_blank_rows_are_skipped_without_warnings(self) -> None:
        file_bytes = _build_xlsx([
            ("03.07.2026 18:00 - 19:00", "Pressikonverents", "", "Läbi maja"),
            (None, None, None, None),
            ("", "", "", ""),
        ])
        result = plaan_excel_import.parse_plaan_excel(file_bytes)
        self.assertEqual(len(result["events"]), 1)
        # Only the SOURCE warning should be present; blank rows add no warnings.
        self.assertEqual(len(result["fetch_warnings"]), 1)


if __name__ == "__main__":
    unittest.main()
