"""SQLite persistence helpers for meals, weight, and barcode products.

Domain engines do not import this module. Database access is confined to API
startup and routers so the domain layer remains deterministic and pure.
"""

from __future__ import annotations

import sqlite3
from datetime import date, datetime, timedelta, timezone
from pathlib import Path
from typing import Any

DB_PATH = Path(__file__).resolve().parent / "jarvis.db"

_SCHEMA = """
CREATE TABLE IF NOT EXISTS meal_log (
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

CREATE INDEX IF NOT EXISTS idx_meal_log_date ON meal_log(log_date);

CREATE TABLE IF NOT EXISTS weight_log (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    log_date TEXT NOT NULL UNIQUE,
    weight_kg REAL NOT NULL,
    logged_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS barcode_cache (
    barcode TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    calories REAL NOT NULL,
    protein_g REAL NOT NULL,
    fat_g REAL NOT NULL,
    carbs_g REAL NOT NULL,
    serving_size_g REAL,
    fetched_at TEXT NOT NULL
);
"""


def _utc_now() -> str:
    return datetime.now(timezone.utc).isoformat()


def _date_value(value: date | str) -> str:
    if isinstance(value, date):
        return value.isoformat()
    return date.fromisoformat(str(value)).isoformat()


def _row_to_dict(row: sqlite3.Row | None) -> dict[str, Any] | None:
    return dict(row) if row is not None else None


def get_db() -> sqlite3.Connection:
    """Return a configured connection to the local J.A.R.V.I.S. database."""
    DB_PATH.parent.mkdir(parents=True, exist_ok=True)
    connection = sqlite3.connect(DB_PATH, timeout=5.0)
    connection.row_factory = sqlite3.Row
    return connection


def init_db() -> None:
    """Create all persistence tables and indexes when absent."""
    connection = get_db()
    try:
        connection.executescript(_SCHEMA)
        connection.commit()
    finally:
        connection.close()


def get_meals_for_date(log_date: date | str) -> list[dict[str, Any]]:
    connection = get_db()
    try:
        rows = connection.execute(
            "SELECT * FROM meal_log WHERE log_date = ? ORDER BY logged_at, id",
            (_date_value(log_date),),
        ).fetchall()
        return [dict(row) for row in rows]
    finally:
        connection.close()


def log_meal(
    log_date: date | str,
    item_id: str,
    item_type: str,
    name: str,
    servings: float,
    calories: float,
    protein_g: float,
    fat_g: float,
    carbs_g: float,
    source: str = "manual",
) -> int:
    connection = get_db()
    try:
        cursor = connection.execute(
            """
            INSERT INTO meal_log (
                log_date, logged_at, item_id, item_type, name, servings,
                calories, protein_g, fat_g, carbs_g, source
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            """,
            (
                _date_value(log_date),
                _utc_now(),
                item_id,
                item_type,
                name,
                servings,
                calories,
                protein_g,
                fat_g,
                carbs_g,
                source,
            ),
        )
        connection.commit()
        return int(cursor.lastrowid)
    finally:
        connection.close()


def delete_meal(meal_id: int) -> bool:
    connection = get_db()
    try:
        cursor = connection.execute("DELETE FROM meal_log WHERE id = ?", (meal_id,))
        connection.commit()
        return cursor.rowcount > 0
    finally:
        connection.close()


def log_weight(log_date: date | str, weight_kg: float) -> int:
    """Insert or replace the weight for one date and return its stable row id."""
    normalized_date = _date_value(log_date)
    connection = get_db()
    try:
        connection.execute(
            """
            INSERT INTO weight_log (log_date, weight_kg, logged_at)
            VALUES (?, ?, ?)
            ON CONFLICT(log_date) DO UPDATE SET
                weight_kg = excluded.weight_kg,
                logged_at = excluded.logged_at
            """,
            (normalized_date, weight_kg, _utc_now()),
        )
        row = connection.execute(
            "SELECT id FROM weight_log WHERE log_date = ?",
            (normalized_date,),
        ).fetchone()
        connection.commit()
        return int(row["id"])
    finally:
        connection.close()


def get_weight_history(days: int = 30) -> list[dict[str, Any]]:
    if days < 1:
        return []
    cutoff = (date.today() - timedelta(days=days - 1)).isoformat()
    connection = get_db()
    try:
        rows = connection.execute(
            """
            SELECT * FROM weight_log
            WHERE log_date >= ?
            ORDER BY log_date ASC, id ASC
            """,
            (cutoff,),
        ).fetchall()
        return [dict(row) for row in rows]
    finally:
        connection.close()


def get_barcode_cache(barcode: str) -> dict[str, Any] | None:
    connection = get_db()
    try:
        row = connection.execute(
            "SELECT * FROM barcode_cache WHERE barcode = ?",
            (str(barcode),),
        ).fetchone()
        return _row_to_dict(row)
    finally:
        connection.close()


def cache_barcode(
    barcode: str,
    name: str,
    calories: float,
    protein_g: float,
    fat_g: float,
    carbs_g: float,
    serving_size_g: float | None,
) -> dict[str, Any]:
    connection = get_db()
    try:
        connection.execute(
            """
            INSERT INTO barcode_cache (
                barcode, name, calories, protein_g, fat_g, carbs_g,
                serving_size_g, fetched_at
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
            ON CONFLICT(barcode) DO UPDATE SET
                name = excluded.name,
                calories = excluded.calories,
                protein_g = excluded.protein_g,
                fat_g = excluded.fat_g,
                carbs_g = excluded.carbs_g,
                serving_size_g = excluded.serving_size_g,
                fetched_at = excluded.fetched_at
            """,
            (
                str(barcode),
                name,
                calories,
                protein_g,
                fat_g,
                carbs_g,
                serving_size_g,
                _utc_now(),
            ),
        )
        connection.commit()
    finally:
        connection.close()

    cached = get_barcode_cache(str(barcode))
    if cached is None:  # pragma: no cover - defensive guard after committed insert
        raise RuntimeError("Barcode cache write failed")
    return cached
