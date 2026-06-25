"""SQLite persistence helpers for meals, weight, and barcode products.

Domain engines do not import this module. Database access is confined to API
startup and routers so the domain layer remains deterministic and pure.
"""

from __future__ import annotations

import json
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

CREATE TABLE IF NOT EXISTS session_log (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    date TEXT NOT NULL,
    session_type TEXT NOT NULL,
    week_number INTEGER,
    exercises TEXT NOT NULL,
    notes TEXT,
    created_at TEXT DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_session_log_date ON session_log(date);

CREATE TABLE IF NOT EXISTS jump_log (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    date TEXT NOT NULL,
    jump_type TEXT NOT NULL,
    height_cm REAL NOT NULL,
    notes TEXT,
    created_at TEXT DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_jump_log_date ON jump_log(date);

CREATE TABLE IF NOT EXISTS brief_history (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    created_at TEXT NOT NULL,
    week_label TEXT NOT NULL,
    domain TEXT NOT NULL DEFAULT 'finance',
    action TEXT NOT NULL,
    asset TEXT,
    amount_eur REAL,
    route TEXT,
    thesis TEXT,
    status TEXT NOT NULL DEFAULT 'pending',
    user_action TEXT,
    user_action_at TEXT,
    outcome_pct REAL,
    outcome_note TEXT,
    full_brief_json TEXT
);

CREATE INDEX IF NOT EXISTS idx_brief_history_week ON brief_history(week_label);
CREATE INDEX IF NOT EXISTS idx_brief_history_status ON brief_history(status);
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


def log_session(
    session_date: date | str,
    session_type: str,
    week_number: int | None,
    exercises: list[dict[str, Any]],
    notes: str | None = None,
) -> int:
    """Persist one workout session, keeping exercises as a JSON blob."""
    connection = get_db()
    try:
        cursor = connection.execute(
            """
            INSERT INTO session_log (date, session_type, week_number, exercises, notes)
            VALUES (?, ?, ?, ?, ?)
            """,
            (
                _date_value(session_date),
                session_type,
                week_number,
                json.dumps(exercises, separators=(",", ":")),
                notes,
            ),
        )
        connection.commit()
        return int(cursor.lastrowid)
    finally:
        connection.close()


def get_sessions(limit: int | None = None) -> list[dict[str, Any]]:
    connection = get_db()
    try:
        sql = "SELECT * FROM session_log ORDER BY date DESC, id DESC"
        parameters: tuple[Any, ...] = ()
        if limit is not None:
            if limit < 1:
                return []
            sql += " LIMIT ?"
            parameters = (limit,)
        rows = connection.execute(sql, parameters).fetchall()
        sessions = []
        for row in rows:
            session = dict(row)
            session["exercises"] = json.loads(session["exercises"])
            sessions.append(session)
        return sessions
    finally:
        connection.close()


def delete_session(session_id: int) -> bool:
    connection = get_db()
    try:
        cursor = connection.execute("DELETE FROM session_log WHERE id = ?", (session_id,))
        connection.commit()
        return cursor.rowcount > 0
    finally:
        connection.close()


def log_jump(
    jump_date: date | str,
    jump_type: str,
    height_cm: float,
    notes: str | None = None,
) -> int:
    connection = get_db()
    try:
        cursor = connection.execute(
            """
            INSERT INTO jump_log (date, jump_type, height_cm, notes)
            VALUES (?, ?, ?, ?)
            """,
            (_date_value(jump_date), jump_type, height_cm, notes),
        )
        connection.commit()
        return int(cursor.lastrowid)
    finally:
        connection.close()


def get_jumps(limit: int | None = None) -> list[dict[str, Any]]:
    connection = get_db()
    try:
        sql = "SELECT * FROM jump_log ORDER BY date ASC, id ASC"
        parameters: tuple[Any, ...] = ()
        if limit is not None:
            if limit < 1:
                return []
            sql += " LIMIT ?"
            parameters = (limit,)
        rows = connection.execute(sql, parameters).fetchall()
        return [dict(row) for row in rows]
    finally:
        connection.close()


def delete_jump(jump_id: int) -> bool:
    connection = get_db()
    try:
        cursor = connection.execute("DELETE FROM jump_log WHERE id = ?", (jump_id,))
        connection.commit()
        return cursor.rowcount > 0
    finally:
        connection.close()


def save_brief(
    week_label: str,
    domain: str,
    action: str,
    asset: str | None,
    amount_eur: float | None,
    route: str | None,
    thesis: str | None,
    full_brief_json: str | None,
) -> int:
    """Persist a new brief entry; returns the new row id."""
    connection = get_db()
    try:
        cursor = connection.execute(
            """
            INSERT INTO brief_history (
                created_at, week_label, domain, action, asset,
                amount_eur, route, thesis, status, full_brief_json
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'pending', ?)
            """,
            (_utc_now(), week_label, domain, action, asset, amount_eur, route, thesis, full_brief_json),
        )
        connection.commit()
        return int(cursor.lastrowid)
    finally:
        connection.close()


def brief_exists_for_week(week_label: str, domain: str = "finance") -> bool:
    """Return True if a brief for this week + domain has already been saved."""
    connection = get_db()
    try:
        row = connection.execute(
            "SELECT 1 FROM brief_history WHERE week_label = ? AND domain = ? LIMIT 1",
            (week_label, domain),
        ).fetchone()
        return row is not None
    finally:
        connection.close()


def update_brief_status(brief_id: int, status: str, user_action: str) -> bool:
    """Update a brief's status (approved / deferred / rejected). Returns True if found."""
    connection = get_db()
    try:
        cursor = connection.execute(
            """
            UPDATE brief_history
            SET status = ?, user_action = ?, user_action_at = ?
            WHERE id = ?
            """,
            (status, user_action, _utc_now(), brief_id),
        )
        connection.commit()
        return cursor.rowcount > 0
    finally:
        connection.close()


def get_brief_history(limit: int = 50) -> list[dict[str, Any]]:
    """Return up to `limit` briefs, newest first."""
    if limit < 1:
        return []
    connection = get_db()
    try:
        rows = connection.execute(
            "SELECT * FROM brief_history ORDER BY created_at DESC LIMIT ?",
            (limit,),
        ).fetchall()
        return [dict(row) for row in rows]
    finally:
        connection.close()


def get_pending_briefs() -> list[dict[str, Any]]:
    """Return all briefs with status = 'pending', newest first."""
    connection = get_db()
    try:
        rows = connection.execute(
            "SELECT * FROM brief_history WHERE status = 'pending' ORDER BY created_at DESC",
        ).fetchall()
        return [dict(row) for row in rows]
    finally:
        connection.close()


def get_meal_history(days: int = 14, target_calories: float = 2200.0) -> list[dict[str, Any]]:
    """Return one row per day for the last `days` days with daily totals and target_met flag."""
    if days < 1:
        return []
    cutoff = (date.today() - timedelta(days=days - 1)).isoformat()
    connection = get_db()
    try:
        rows = connection.execute(
            """
            SELECT
                log_date,
                ROUND(SUM(calories), 1) AS total_calories,
                ROUND(SUM(protein_g), 1) AS total_protein_g
            FROM meal_log
            WHERE log_date >= ?
            GROUP BY log_date
            ORDER BY log_date ASC
            """,
            (cutoff,),
        ).fetchall()
    finally:
        connection.close()

    by_date = {row["log_date"]: dict(row) for row in rows}
    result = []
    for i in range(days):
        d = (date.today() - timedelta(days=days - 1 - i)).isoformat()
        entry = by_date.get(d)
        if entry:
            cal = entry["total_calories"]
            result.append({
                "date": d,
                "total_calories": cal,
                "total_protein_g": entry["total_protein_g"],
                "target_calories": target_calories,
                "target_met": cal <= target_calories,
                "has_data": True,
            })
        else:
            result.append({
                "date": d,
                "total_calories": None,
                "total_protein_g": None,
                "target_calories": target_calories,
                "target_met": None,
                "has_data": False,
            })
    return result
