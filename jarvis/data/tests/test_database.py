import sqlite3
import tempfile
import unittest
from datetime import date, timedelta
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
        } <= names

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
