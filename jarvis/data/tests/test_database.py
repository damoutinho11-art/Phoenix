import sqlite3
import tempfile
import unittest
from datetime import date, timedelta
import json
from pathlib import Path
from unittest.mock import patch

from jarvis.data import database


class DatabaseTests(unittest.TestCase):
    def setUp(self):
        self.temp_dir = tempfile.TemporaryDirectory()
        self.db_path = Path(self.temp_dir.name) / "test.db"
        self.db_patch = patch.object(database, "DB_PATH", self.db_path)
        self.db_patch.start()
        database.init_db()

    def tearDown(self):
        self.db_patch.stop()
        self.temp_dir.cleanup()

    def _log_meal(self, **overrides):
        values = {
            "log_date": date.today(),
            "item_id": "recipe_012",
            "item_type": "recipe",
            "name": "Egg White Bites",
            "servings": 1.0,
            "calories": 410,
            "protein_g": 72,
            "fat_g": 1,
            "carbs_g": 23,
            "source": "manual",
        }
        values.update(overrides)
        return database.log_meal(**values)

    def _training_plan_receipt(self, **overrides):
        receipt = {
            "plan_id": "plan-1",
            "parent_plan_id": None,
            "constitution_version": "1",
            "planner_version": "adaptive-v1",
            "cycle_id": "2026-W30",
            "days": [
                {
                    "date": "2026-07-20",
                    "session_type": "high_intensity",
                    "objective": "jump_strength",
                    "exercises": [],
                    "estimated_minutes": 60,
                    "change_reason": None,
                }
            ],
            "constraints": [],
            "validations": [
                {
                    "rule": "seven_unique_dates",
                    "passed": True,
                    "severity": "hard",
                    "detail": "Within policy",
                }
            ],
            "created_at": "2026-07-20T06:00:00Z",
            "status": "proposed",
            "input_hash": "input-hash-1",
            "receipt_hash": "receipt-hash-1",
        }
        receipt.update(overrides)
        return receipt

    def test_training_plan_receipt_round_trips_immutable_payload(self):
        receipt = self._training_plan_receipt(plan_id="plan-1", status="proposed")

        database.save_training_plan_receipt(receipt)

        stored = database.get_training_plan_receipt("plan-1")

        assert stored["payload"] == receipt
        assert stored["status"] == "proposed"
        connection = sqlite3.connect(self.db_path)
        try:
            row = connection.execute(
                "SELECT payload_json, receipt_hash FROM training_plan_receipts WHERE plan_id = ?",
                ("plan-1",),
            ).fetchone()
        finally:
            connection.close()
        assert row == (
            json.dumps(receipt, ensure_ascii=True, sort_keys=True, separators=(",", ":"), allow_nan=False),
            receipt["receipt_hash"],
        )

    def test_training_plan_apply_atomically_supersedes_parent_and_is_idempotent(self):
        database.save_training_plan_receipt(
            self._training_plan_receipt(plan_id="plan-1", status="active")
        )
        database.save_training_plan_receipt(
            self._training_plan_receipt(
                plan_id="plan-2", parent_plan_id="plan-1", status="proposed"
            )
        )

        first = database.apply_training_plan_proposal("plan-2")
        second = database.apply_training_plan_proposal("plan-2")

        assert first["status"] == second["status"] == "active"
        assert database.get_training_plan_receipt("plan-1")["status"] == "superseded"
        assert database.get_active_training_plan("2026-W30")["plan_id"] == "plan-2"
        connection = sqlite3.connect(self.db_path)
        try:
            event_count = connection.execute(
                "SELECT COUNT(*) FROM training_plan_lifecycle_events"
            ).fetchone()[0]
        finally:
            connection.close()
        assert event_count == 4

    def test_training_plan_apply_rejects_parentless_proposal_when_active_plan_exists(self):
        database.save_training_plan_receipt(
            self._training_plan_receipt(plan_id="plan-1", status="active")
        )
        database.save_training_plan_receipt(
            self._training_plan_receipt(plan_id="plan-2", status="proposed")
        )

        with self.assertRaisesRegex(ValueError, "active plan as its parent"):
            database.apply_training_plan_proposal("plan-2")

        assert database.get_active_training_plan("2026-W30")["plan_id"] == "plan-1"
        assert database.get_training_plan_receipt("plan-2")["status"] == "proposed"

    def test_training_plan_apply_rejects_orphan_parent_atomically(self):
        database.save_training_plan_receipt(
            self._training_plan_receipt(
                plan_id="plan-2", parent_plan_id="missing-plan", status="proposed"
            )
        )

        with self.assertRaisesRegex(ValueError, "declared parent"):
            database.apply_training_plan_proposal("plan-2")

        assert database.get_active_training_plan("2026-W30") is None
        assert database.get_training_plan_receipt("plan-2")["status"] == "proposed"
        connection = sqlite3.connect(self.db_path)
        try:
            event_count = connection.execute(
                "SELECT COUNT(*) FROM training_plan_lifecycle_events"
            ).fetchone()[0]
        finally:
            connection.close()
        assert event_count == 1

    def test_training_plan_apply_rejects_cross_cycle_parent_atomically(self):
        database.save_training_plan_receipt(
            self._training_plan_receipt(
                plan_id="plan-1", cycle_id="2026-W31", status="active"
            )
        )
        database.save_training_plan_receipt(
            self._training_plan_receipt(
                plan_id="plan-2", parent_plan_id="plan-1", status="proposed"
            )
        )

        with self.assertRaisesRegex(ValueError, "same cycle"):
            database.apply_training_plan_proposal("plan-2")

        assert database.get_active_training_plan("2026-W30") is None
        assert database.get_active_training_plan("2026-W31")["plan_id"] == "plan-1"
        assert database.get_training_plan_receipt("plan-2")["status"] == "proposed"

    def test_training_plan_apply_rejects_stale_parent_atomically(self):
        database.save_training_plan_receipt(
            self._training_plan_receipt(plan_id="plan-1", status="active")
        )
        database.save_training_plan_receipt(
            self._training_plan_receipt(
                plan_id="plan-2", parent_plan_id="plan-1", status="proposed"
            )
        )
        database.apply_training_plan_proposal("plan-2")
        database.save_training_plan_receipt(
            self._training_plan_receipt(
                plan_id="plan-3", parent_plan_id="plan-1", status="proposed"
            )
        )

        with self.assertRaisesRegex(ValueError, "current active plan"):
            database.apply_training_plan_proposal("plan-3")

        assert database.get_active_training_plan("2026-W30")["plan_id"] == "plan-2"
        assert database.get_training_plan_receipt("plan-1")["status"] == "superseded"
        assert database.get_training_plan_receipt("plan-3")["status"] == "proposed"
        connection = sqlite3.connect(self.db_path)
        try:
            event_count = connection.execute(
                "SELECT COUNT(*) FROM training_plan_lifecycle_events"
            ).fetchone()[0]
        finally:
            connection.close()
        assert event_count == 5

    def test_training_plan_apply_rolls_back_parent_supersession_when_activation_fails(self):
        database.save_training_plan_receipt(
            self._training_plan_receipt(plan_id="plan-1", status="active")
        )
        database.save_training_plan_receipt(
            self._training_plan_receipt(
                plan_id="plan-2", parent_plan_id="plan-1", status="proposed"
            )
        )
        connection = sqlite3.connect(self.db_path)
        try:
            connection.execute(
                """
                CREATE TRIGGER fail_training_plan_activation
                BEFORE INSERT ON training_plan_lifecycle_events
                WHEN NEW.plan_id = 'plan-2' AND NEW.status = 'active'
                BEGIN
                    SELECT RAISE(ABORT, 'forced activation failure');
                END;
                """
            )
            connection.commit()
        finally:
            connection.close()

        with self.assertRaisesRegex(sqlite3.IntegrityError, "forced activation failure"):
            database.apply_training_plan_proposal("plan-2")

        assert database.get_active_training_plan("2026-W30")["plan_id"] == "plan-1"
        assert database.get_training_plan_receipt("plan-1")["status"] == "active"
        assert database.get_training_plan_receipt("plan-2")["status"] == "proposed"
        connection = sqlite3.connect(self.db_path)
        try:
            events = connection.execute(
                "SELECT plan_id, status FROM training_plan_lifecycle_events ORDER BY id"
            ).fetchall()
        finally:
            connection.close()
        assert events == [("plan-1", "active"), ("plan-2", "proposed")]

    def test_training_plan_rejection_preserves_active_parent(self):
        database.save_training_plan_receipt(
            self._training_plan_receipt(plan_id="plan-1", status="active")
        )
        database.save_training_plan_receipt(
            self._training_plan_receipt(
                plan_id="plan-2", parent_plan_id="plan-1", status="proposed"
            )
        )

        first = database.reject_training_plan_proposal("plan-2")
        second = database.reject_training_plan_proposal("plan-2")

        assert first["status"] == second["status"] == "rejected"
        assert database.get_active_training_plan("2026-W30")["plan_id"] == "plan-1"
        assert database.get_training_plan_receipt("plan-2")["status"] == "rejected"

    def test_training_plan_receipt_history_reports_current_lifecycle_statuses(self):
        database.save_training_plan_receipt(
            self._training_plan_receipt(plan_id="plan-1", status="active")
        )
        database.save_training_plan_receipt(
            self._training_plan_receipt(
                plan_id="plan-2", parent_plan_id="plan-1", status="proposed"
            )
        )

        rows = database.list_training_plan_receipts()

        assert [(row["plan_id"], row["status"]) for row in rows] == [
            ("plan-2", "proposed"),
            ("plan-1", "active"),
        ]
        assert database.list_training_plan_receipts(limit=0) == []

    def test_training_plan_receipt_rows_are_append_only(self):
        receipt = self._training_plan_receipt()
        database.save_training_plan_receipt(receipt)

        connection = sqlite3.connect(self.db_path)
        try:
            with self.assertRaisesRegex(sqlite3.IntegrityError, "immutable"):
                connection.execute(
                    "UPDATE training_plan_receipts SET receipt_hash = ? WHERE plan_id = ?",
                    ("changed", receipt["plan_id"]),
                )
            connection.rollback()
            with self.assertRaisesRegex(sqlite3.IntegrityError, "immutable"):
                connection.execute(
                    "DELETE FROM training_plan_receipts WHERE plan_id = ?",
                    (receipt["plan_id"],),
                )
        finally:
            connection.close()

        assert database.get_training_plan_receipt(receipt["plan_id"])["payload"] == receipt

    def test_training_plan_lifecycle_events_are_append_only(self):
        receipt = self._training_plan_receipt()
        database.save_training_plan_receipt(receipt)

        connection = sqlite3.connect(self.db_path)
        try:
            with self.assertRaisesRegex(sqlite3.IntegrityError, "append-only"):
                connection.execute(
                    "UPDATE training_plan_lifecycle_events SET reason = 'changed' WHERE plan_id = ?",
                    (receipt["plan_id"],),
                )
            connection.rollback()
            with self.assertRaisesRegex(sqlite3.IntegrityError, "append-only"):
                connection.execute(
                    "DELETE FROM training_plan_lifecycle_events WHERE plan_id = ?",
                    (receipt["plan_id"],),
                )
        finally:
            connection.close()

        assert database.get_training_plan_receipt(receipt["plan_id"])["status"] == "proposed"

    def test_training_plan_rejects_second_active_receipt_for_cycle(self):
        database.save_training_plan_receipt(
            self._training_plan_receipt(plan_id="plan-1", status="active")
        )

        with self.assertRaisesRegex(ValueError, "one active training plan"):
            database.save_training_plan_receipt(
                self._training_plan_receipt(plan_id="plan-2", status="active")
            )

        assert database.get_active_training_plan("2026-W30")["plan_id"] == "plan-1"

    def test_init_db_creates_all_tables(self):
        connection = sqlite3.connect(self.db_path)
        try:
            names = {
                row[0]
                for row in connection.execute(
                    "SELECT name FROM sqlite_master WHERE type = 'table'"
                ).fetchall()
            }
        finally:
            connection.close()
        assert {
            "meal_log",
            "weight_log",
            "barcode_cache",
            "finance_transaction_ledger",
            "finance_portfolio_snapshots",
            "research_memos",
            "research_validation_records",
            "training_readiness_scans",
            "training_capacity_logs",
            "training_jump_balance_logs",
        } <= names

    def test_init_db_migrates_populated_existing_schema_without_data_loss(self):
        legacy_db_path = Path(self.temp_dir.name) / "legacy.db"
        connection = sqlite3.connect(legacy_db_path)
        try:
            connection.executescript(
                """
                CREATE TABLE meal_log (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    log_date TEXT NOT NULL,
                    logged_at TEXT NOT NULL,
                    item_id TEXT NOT NULL,
                    item_type TEXT NOT NULL,
                    name TEXT NOT NULL,
                    servings REAL NOT NULL,
                    calories REAL NOT NULL,
                    protein_g REAL NOT NULL,
                    fat_g REAL NOT NULL,
                    carbs_g REAL NOT NULL,
                    source TEXT NOT NULL
                );

                CREATE TABLE training_readiness_scans (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    scan_date TEXT NOT NULL,
                    created_at TEXT NOT NULL,
                    knee INTEGER NOT NULL,
                    ankle INTEGER NOT NULL,
                    hip INTEGER NOT NULL,
                    hamstring INTEGER NOT NULL,
                    calf_achilles INTEGER NOT NULL,
                    lower_back_pelvic INTEGER NOT NULL,
                    note TEXT,
                    sharp_pain INTEGER NOT NULL DEFAULT 0,
                    limping INTEGER NOT NULL DEFAULT 0,
                    next_day_worsening INTEGER NOT NULL DEFAULT 0,
                    readiness_status TEXT NOT NULL
                );
                """
            )
            connection.execute(
                """
                INSERT INTO meal_log (
                    log_date, logged_at, item_id, item_type, name, servings,
                    calories, protein_g, fat_g, carbs_g, source
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                """,
                (
                    "2026-07-20",
                    "2026-07-20T06:00:00Z",
                    "legacy-meal",
                    "recipe",
                    "Legacy Meal",
                    1.0,
                    500.0,
                    30.0,
                    20.0,
                    40.0,
                    "manual",
                ),
            )
            connection.execute(
                """
                INSERT INTO training_readiness_scans (
                    scan_date, created_at, knee, ankle, hip, hamstring,
                    calf_achilles, lower_back_pelvic, readiness_status
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
                """,
                ("2026-07-20", "2026-07-20T06:00:00Z", 1, 1, 1, 1, 1, 1, "clear"),
            )
            connection.commit()
        finally:
            connection.close()

        with patch.object(database, "DB_PATH", legacy_db_path):
            database.init_db()

        connection = sqlite3.connect(legacy_db_path)
        try:
            tables = {
                row[0]
                for row in connection.execute(
                    "SELECT name FROM sqlite_master WHERE type = 'table'"
                ).fetchall()
            }
            triggers = {
                row[0]
                for row in connection.execute(
                    "SELECT name FROM sqlite_master WHERE type = 'trigger'"
                ).fetchall()
            }
            meal = connection.execute(
                "SELECT name, calories FROM meal_log WHERE item_id = 'legacy-meal'"
            ).fetchone()
            scan = connection.execute(
                "SELECT readiness_status FROM training_readiness_scans WHERE scan_date = '2026-07-20'"
            ).fetchone()
        finally:
            connection.close()

        assert {"training_plan_receipts", "training_plan_lifecycle_events"} <= tables
        assert {
            "trg_training_plan_receipts_no_update",
            "trg_training_plan_receipts_no_delete",
            "trg_training_plan_lifecycle_events_no_update",
            "trg_training_plan_lifecycle_events_no_delete",
        } <= triggers
        assert meal == ("Legacy Meal", 500.0)
        assert scan == ("clear",)

    def test_training_readiness_scan_round_trip_is_newest_first(self):
        first = database.save_training_readiness_scan(
            {
                "scan_date": "2026-07-01",
                "knee": 1,
                "ankle": 2,
                "hip": 0,
                "hamstring": 0,
                "calf_achilles": 1,
                "lower_back_pelvic": 0,
                "note": "First",
                "sharp_pain": False,
                "limping": False,
                "next_day_worsening": False,
                "readiness_status": "clear",
            }
        )
        second = database.save_training_readiness_scan(
            {
                "scan_date": "2026-07-01",
                "knee": 4,
                "ankle": 0,
                "hip": 0,
                "hamstring": 0,
                "calf_achilles": 0,
                "lower_back_pelvic": 0,
                "note": "Second",
                "sharp_pain": False,
                "limping": False,
                "next_day_worsening": False,
                "readiness_status": "caution",
            }
        )

        rows = database.list_training_readiness_scans()
        latest = database.get_latest_training_readiness_scan("2026-07-01")

        assert [row["id"] for row in rows] == [second, first]
        assert latest["id"] == second
        assert latest["readiness_status"] == "caution"

    def test_training_capacity_and_jump_balance_logs_round_trip(self):
        capacity_id = database.save_training_capacity_log(
            {
                "log_date": "2026-07-01",
                "block_key": "sled_balance",
                "completion": {"completed": True, "minutes": 8},
                "notes": "Controlled",
            }
        )
        jump_id = database.save_training_jump_balance_log(
            {
                "log_date": "2026-07-01",
                "plant_pattern": "one_foot_left",
                "rep_count": 1,
                "jump_variant": "arms_free",
                "height_cm": None,
                "video_note": None,
                "quality": {"ground_contact_feel": "controlled"},
                "notes": None,
            }
        )

        capacity = database.list_training_capacity_logs()
        jumps = database.list_training_jump_balance_logs()

        assert capacity[0]["id"] == capacity_id
        assert capacity[0]["completion"]["minutes"] == 8
        assert jumps[0]["id"] == jump_id
        assert jumps[0]["quality"]["ground_contact_feel"] == "controlled"

    def test_init_db_is_idempotent(self):
        database.init_db()
        database.init_db()
        assert self.db_path.exists()

    def test_get_db_uses_row_factory(self):
        connection = database.get_db()
        try:
            row = connection.execute("SELECT 1 AS value").fetchone()
            assert row["value"] == 1
        finally:
            connection.close()

    def test_get_latest_brief_for_week_returns_newest_status_and_action(self):
        first_id = database.save_brief(
            "W26 2026", "finance", "BUY", "btc", 46.15, "lhv_crypto", "first", None
        )
        second_id = database.save_brief(
            "W26 2026", "finance", "BUY", "quality_etf", 69.23, "lightyear", "second", None
        )
        database.update_brief_status(second_id, "approved", "approved")

        latest = database.get_latest_brief_for_week("W26 2026")

        assert latest is not None
        assert latest["id"] == second_id
        assert latest["id"] != first_id
        assert latest["status"] == "approved"
        assert latest["user_action"] == "approved"

    def test_get_latest_brief_for_week_returns_none_when_missing(self):
        assert database.get_latest_brief_for_week("W99 2099") is None

    def test_save_and_get_finance_transaction(self):
        brief_id = database.save_brief(
            "W26 2026", "finance", "BUY", "quality_etf", 69.23, "lightyear", "test", None
        )
        transaction_id = database.save_finance_transaction(
            {
                "executed_at": "2026-06-27T12:00:00Z",
                "brief_id": brief_id,
                "asset": "quality_etf",
                "symbol": "IWQU.L",
                "platform": "Lightyear",
                "side": "buy",
                "amount_eur": 69.23,
                "units": 0.91,
                "price": 75.64,
                "currency": "EUR",
                "fee_eur": 0,
                "notes": "Manual Lightyear buy",
            }
        )

        saved = database.get_finance_transaction(transaction_id)

        assert saved is not None
        assert saved["brief_id"] == brief_id
        assert saved["asset"] == "quality_etf"
        assert saved["manual_record_only"] == 1
        assert saved["trades_executed"] == 0
        assert saved["broker_connection"] == 0

    def test_get_finance_transactions_and_brief_exists_by_id(self):
        brief_id = database.save_brief(
            "W26 2026", "finance", "BUY", "btc", 46.15, "lhv_crypto", "test", None
        )
        payload = {
            "executed_at": "2026-06-27T12:00:00Z",
            "brief_id": brief_id,
            "asset": "btc",
            "symbol": "BTC",
            "platform": "LHV Crypto",
            "side": "buy",
            "amount_eur": 46.15,
            "units": 0.0004,
            "price": 115375,
            "currency": "EUR",
            "fee_eur": 0,
            "notes": None,
        }
        first_id = database.save_finance_transaction(payload)
        second_id = database.save_finance_transaction({**payload, "amount_eur": 20})

        rows = database.get_finance_transactions(limit=1)

        assert database.brief_exists_by_id(brief_id) is True
        assert database.brief_exists_by_id(999999) is False
        assert len(rows) == 1
        assert rows[0]["id"] == second_id
        assert rows[0]["id"] != first_id

    def _research_memo_payload(self, **overrides):
        payload = {
            "asset": "quality_etf",
            "sleeve": None,
            "title": "Quality ETF research memo",
            "thesis": "Evidence-backed research thesis.",
            "risks": ["Factor underperformance"],
            "data_confidence": "MEDIUM",
            "verdict": "WATCH",
            "sources": [{"label": "Issuer factsheet", "url": "https://example.com/factsheet"}],
            "validation": {"status": "PARTIAL", "notes": ["Identifier confirmation pending"]},
            "status": "draft",
            "notes": "Research only.",
        }
        payload.update(overrides)
        return payload

    def test_create_list_and_get_research_memo(self):
        first_id = database.create_research_memo(self._research_memo_payload())
        second_id = database.create_research_memo(
            self._research_memo_payload(asset="btc", title="Bitcoin memo", verdict="BUY_CANDIDATE")
        )

        rows = database.list_research_memos()
        first = database.get_research_memo(first_id)

        assert [row["id"] for row in rows] == [second_id, first_id]
        assert first is not None
        assert first["asset"] == "quality_etf"
        assert first["risks"] == ["Factor underperformance"]
        assert first["sources"][0]["label"] == "Issuer factsheet"
        assert first["validation"]["status"] == "PARTIAL"

    def test_get_research_memo_returns_none_for_missing_id(self):
        assert database.get_research_memo(999999) is None

    def test_create_research_memo_rejects_invalid_verdict(self):
        with self.assertRaises(ValueError):
            database.create_research_memo(self._research_memo_payload(verdict="BUY"))

    def test_create_research_memo_rejects_invalid_status(self):
        with self.assertRaises(ValueError):
            database.create_research_memo(self._research_memo_payload(status="published"))

    def _research_validation_payload(self, **overrides):
        payload = {
            "memo_id": None,
            "asset": "quality_etf",
            "check_type": "CROSS_SOURCE",
            "field_name": "expense_ratio",
            "source_primary": "Issuer factsheet",
            "source_secondary": "Exchange listing",
            "primary_value": "0.30%",
            "secondary_value": "0.30%",
            "consensus_value": "0.30%",
            "tolerance_pct": 1.0,
            "deviation_pct": 0.0,
            "status": "PASS",
            "confidence": "high",
            "notes": "Values agree.",
            "raw_json": {"period": "current"},
        }
        payload.update(overrides)
        return payload

    def test_create_list_and_get_research_validation_record(self):
        first_id = database.create_research_validation_record(
            self._research_validation_payload()
        )
        second_id = database.create_research_validation_record(
            self._research_validation_payload(
                asset="btc", field_name="market_cap", check_type="MARKET_CAP"
            )
        )

        rows = database.list_research_validation_records()
        first = database.get_research_validation_record(first_id)

        assert [row["id"] for row in rows] == [second_id, first_id]
        assert first is not None
        assert first["field_name"] == "expense_ratio"
        assert first["raw_json"] == {"period": "current"}

    def test_get_research_validation_record_returns_none_for_missing_id(self):
        assert database.get_research_validation_record(999999) is None

    def test_create_research_validation_record_rejects_invalid_check_type(self):
        with self.assertRaises(ValueError):
            database.create_research_validation_record(
                self._research_validation_payload(check_type="PRICE_TARGET")
            )

    def test_create_research_validation_record_rejects_invalid_status(self):
        with self.assertRaises(ValueError):
            database.create_research_validation_record(
                self._research_validation_payload(status="APPROVED")
            )

    def test_create_research_validation_record_rejects_invalid_confidence(self):
        with self.assertRaises(ValueError):
            database.create_research_validation_record(
                self._research_validation_payload(confidence="certain")
            )

    def test_list_research_validation_records_by_memo_id(self):
        memo_id = database.create_research_memo(self._research_memo_payload())
        linked_id = database.create_research_validation_record(
            self._research_validation_payload(memo_id=memo_id)
        )
        database.create_research_validation_record(
            self._research_validation_payload(memo_id=None, field_name="unlinked")
        )

        rows = database.list_research_validation_records_by_memo_id(memo_id)

        assert [row["id"] for row in rows] == [linked_id]

    def test_research_memo_evidence_summary_with_no_records(self):
        memo_id = database.create_research_memo(self._research_memo_payload())

        summary = database.get_research_memo_evidence_summary(memo_id)

        assert summary == {
            "pass_count": 0,
            "warning_count": 0,
            "fail_count": 0,
            "unverified_count": 0,
            "total_records": 0,
            "evidence_status": "NO_EVIDENCE",
        }

    def test_research_memo_evidence_summary_all_pass_is_strong(self):
        memo_id = database.create_research_memo(self._research_memo_payload())
        database.create_research_validation_record(
            self._research_validation_payload(memo_id=memo_id, status="PASS")
        )
        database.create_research_validation_record(
            self._research_validation_payload(
                memo_id=memo_id, status="PASS", field_name="holdings"
            )
        )

        summary = database.get_research_memo_evidence_summary(memo_id)

        assert summary["pass_count"] == 2
        assert summary["total_records"] == 2
        assert summary["evidence_status"] == "EVIDENCE_STRONG"

    def test_research_memo_evidence_summary_warning_or_unverified_needs_research(self):
        memo_id = database.create_research_memo(self._research_memo_payload())
        database.create_research_validation_record(
            self._research_validation_payload(memo_id=memo_id, status="WARNING")
        )
        database.create_research_validation_record(
            self._research_validation_payload(
                memo_id=memo_id, status="UNVERIFIED", field_name="holdings"
            )
        )

        summary = database.get_research_memo_evidence_summary(memo_id)

        assert summary["warning_count"] == 1
        assert summary["unverified_count"] == 1
        assert summary["evidence_status"] == "NEEDS_RESEARCH"

    def test_research_memo_evidence_summary_any_fail_is_blocked(self):
        memo_id = database.create_research_memo(self._research_memo_payload())
        database.create_research_validation_record(
            self._research_validation_payload(memo_id=memo_id, status="PASS")
        )
        database.create_research_validation_record(
            self._research_validation_payload(
                memo_id=memo_id, status="FAIL", field_name="holdings"
            )
        )

        summary = database.get_research_memo_evidence_summary(memo_id)

        assert summary["pass_count"] == 1
        assert summary["fail_count"] == 1
        assert summary["evidence_status"] == "BLOCKED_BY_FAIL"

    def test_empty_date_returns_empty_list(self):
        assert database.get_meals_for_date(date.today()) == []

    def test_log_meal_returns_integer_id(self):
        assert isinstance(self._log_meal(), int)

    def test_log_and_get_meal(self):
        meal_id = self._log_meal()
        meals = database.get_meals_for_date(date.today())
        assert len(meals) == 1
        assert meals[0]["id"] == meal_id
        assert meals[0]["name"] == "Egg White Bites"
        assert meals[0]["protein_g"] == 72

    def test_multiple_meals_same_day(self):
        self._log_meal()
        self._log_meal(item_id="manual_2", name="Chicken", calories=300)
        assert len(database.get_meals_for_date(date.today())) == 2

    def test_meals_are_isolated_by_date(self):
        self._log_meal(log_date=date.today() - timedelta(days=1))
        assert database.get_meals_for_date(date.today()) == []

    def test_delete_meal_returns_true(self):
        meal_id = self._log_meal()
        assert database.delete_meal(meal_id) is True
        assert database.get_meals_for_date(date.today()) == []

    def test_delete_unknown_meal_returns_false(self):
        assert database.delete_meal(999999) is False

    def test_log_weight_returns_integer_id(self):
        assert isinstance(database.log_weight(date.today(), 73.2), int)

    def test_log_weight_persists_value(self):
        database.log_weight(date.today(), 73.2)
        history = database.get_weight_history()
        assert len(history) == 1
        assert history[0]["weight_kg"] == 73.2

    def test_log_weight_upserts_same_date(self):
        first_id = database.log_weight(date.today(), 73.2)
        second_id = database.log_weight(date.today(), 72.9)
        history = database.get_weight_history()
        assert first_id == second_id
        assert len(history) == 1
        assert history[0]["weight_kg"] == 72.9

    def test_weight_history_filters_old_entries(self):
        database.log_weight(date.today() - timedelta(days=31), 74.0)
        database.log_weight(date.today(), 73.2)
        history = database.get_weight_history(days=30)
        assert [row["weight_kg"] for row in history] == [73.2]

    def test_weight_history_is_chronological(self):
        database.log_weight(date.today(), 73.2)
        database.log_weight(date.today() - timedelta(days=1), 73.4)
        history = database.get_weight_history(days=30)
        assert [row["weight_kg"] for row in history] == [73.4, 73.2]

    def test_weight_history_zero_days_is_empty(self):
        database.log_weight(date.today(), 73.2)
        assert database.get_weight_history(days=0) == []

    def test_barcode_cache_miss(self):
        assert database.get_barcode_cache("5449000000996") is None

    def test_barcode_cache_hit(self):
        database.cache_barcode(
            "5449000000996", "Coca-Cola", 42, 0, 0, 10.6, 330
        )
        cached = database.get_barcode_cache("5449000000996")
        assert cached["name"] == "Coca-Cola"
        assert cached["serving_size_g"] == 330

    def test_barcode_cache_upserts(self):
        database.cache_barcode("123", "Old", 10, 1, 1, 1, 100)
        database.cache_barcode("123", "New", 20, 2, 2, 2, 200)
        cached = database.get_barcode_cache("123")
        assert cached["name"] == "New"
        assert cached["calories"] == 20

    def test_barcode_cache_preserves_zero_macros(self):
        database.cache_barcode("zero", "Water", 0, 0, 0, 0, 500)
        cached = database.get_barcode_cache("zero")
        assert cached["calories"] == 0
        assert cached["protein_g"] == 0

    def test_invalid_date_is_rejected(self):
        with self.assertRaises(ValueError):
            database.get_meals_for_date("not-a-date")
