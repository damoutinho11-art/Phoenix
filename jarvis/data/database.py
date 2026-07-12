"""SQLite persistence helpers for meals, weight, and barcode products.

Domain engines do not import this module. Database access is confined to API
startup and routers so the domain layer remains deterministic and pure.
"""

from __future__ import annotations

import json
import math
import os
import sqlite3
from datetime import date, datetime, timedelta, timezone
from pathlib import Path
from typing import Any

from jarvis.core import clock

_DEFAULT_DB_PATH = Path(__file__).resolve().parent / "jarvis.db"
_ENV_DB_PATH = os.environ.get("JARVIS_DB_PATH")
DB_PATH: Path = Path(_ENV_DB_PATH) if _ENV_DB_PATH else _DEFAULT_DB_PATH
_DB_PATH_SOURCE: str = f"env:JARVIS_DB_PATH" if _ENV_DB_PATH else "default"
_DEFAULT_PORTFOLIO_STATE_JSON_PATH = (
    Path(__file__).resolve().parent.parent / "domains" / "finance" / "portfolio_state.json"
)
PORTFOLIO_STATE_JSON_PATH = Path(
    os.environ.get("PHOENIX_PORTFOLIO_STATE_PATH", _DEFAULT_PORTFOLIO_STATE_JSON_PATH)
)

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

CREATE TABLE IF NOT EXISTS nutrition_memory (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    kind TEXT NOT NULL CHECK (kind IN ('favorite', 'dislike', 'pantry', 'preferred')),
    item_id TEXT NOT NULL DEFAULT '',
    item_type TEXT NOT NULL DEFAULT 'general',
    name TEXT NOT NULL,
    note TEXT,
    payload_json TEXT NOT NULL DEFAULT '{}',
    source TEXT NOT NULL DEFAULT 'user',
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_nutrition_memory_unique
ON nutrition_memory(kind, item_type, item_id, name);

CREATE INDEX IF NOT EXISTS idx_nutrition_memory_kind
ON nutrition_memory(kind);

CREATE TABLE IF NOT EXISTS calendar_snapshot_imports (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    imported_at TEXT NOT NULL,
    label TEXT NOT NULL DEFAULT 'manual import',
    source TEXT NOT NULL DEFAULT 'manual_paste',
    as_of TEXT NOT NULL,
    event_count INTEGER NOT NULL DEFAULT 0,
    warning_count INTEGER NOT NULL DEFAULT 0,
    snapshot_json TEXT NOT NULL,
    validation_json TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_calendar_snapshot_imports_imported_at
ON calendar_snapshot_imports(imported_at);

CREATE TABLE IF NOT EXISTS google_oauth_tokens (
    id INTEGER PRIMARY KEY,
    provider TEXT NOT NULL DEFAULT 'google',
    access_token_encrypted TEXT NOT NULL,
    refresh_token_encrypted TEXT NOT NULL,
    token_expiry TEXT NOT NULL,
    scopes TEXT NOT NULL,
    connected_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
);

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

CREATE TABLE IF NOT EXISTS training_readiness_scans (
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

CREATE INDEX IF NOT EXISTS idx_training_readiness_scans_date
ON training_readiness_scans(scan_date, id);

CREATE TABLE IF NOT EXISTS training_capacity_logs (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    log_date TEXT NOT NULL,
    created_at TEXT NOT NULL,
    block_key TEXT NOT NULL,
    completion_json TEXT NOT NULL,
    notes TEXT
);

CREATE INDEX IF NOT EXISTS idx_training_capacity_logs_date
ON training_capacity_logs(log_date, id);

CREATE TABLE IF NOT EXISTS training_jump_balance_logs (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    log_date TEXT NOT NULL,
    created_at TEXT NOT NULL,
    plant_pattern TEXT NOT NULL,
    rep_count INTEGER NOT NULL,
    jump_variant TEXT NOT NULL,
    height_cm REAL,
    video_note TEXT,
    quality_json TEXT NOT NULL,
    notes TEXT
);

CREATE INDEX IF NOT EXISTS idx_training_jump_balance_logs_date
ON training_jump_balance_logs(log_date, id);

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

CREATE TABLE IF NOT EXISTS finance_transaction_ledger (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    created_at TEXT NOT NULL,
    executed_at TEXT NOT NULL,
    brief_id INTEGER,
    asset TEXT NOT NULL,
    symbol TEXT,
    platform TEXT NOT NULL,
    side TEXT NOT NULL,
    amount_eur REAL NOT NULL,
    units REAL NOT NULL,
    price REAL NOT NULL,
    currency TEXT NOT NULL,
    fee_eur REAL NOT NULL DEFAULT 0,
    notes TEXT,
    manual_record_only INTEGER NOT NULL DEFAULT 1,
    trades_executed INTEGER NOT NULL DEFAULT 0,
    broker_connection INTEGER NOT NULL DEFAULT 0
);

CREATE INDEX IF NOT EXISTS idx_finance_transaction_ledger_created
ON finance_transaction_ledger(created_at);

CREATE INDEX IF NOT EXISTS idx_finance_transaction_ledger_brief
ON finance_transaction_ledger(brief_id);

CREATE TABLE IF NOT EXISTS finance_portfolio_snapshots (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    created_at TEXT NOT NULL,
    source TEXT NOT NULL,
    trigger TEXT NOT NULL,
    transaction_id INTEGER,
    total_value_eur REAL,
    cash_eur REAL,
    invested_value_eur REAL,
    holdings_json TEXT NOT NULL,
    allocation_json TEXT NOT NULL,
    notes TEXT
);

CREATE INDEX IF NOT EXISTS idx_finance_portfolio_snapshots_created
ON finance_portfolio_snapshots(created_at);

CREATE UNIQUE INDEX IF NOT EXISTS idx_finance_portfolio_snapshots_transaction
ON finance_portfolio_snapshots(transaction_id)
WHERE transaction_id IS NOT NULL;

CREATE TABLE IF NOT EXISTS research_memos (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    asset TEXT,
    sleeve TEXT,
    title TEXT NOT NULL,
    thesis TEXT NOT NULL,
    risks TEXT NOT NULL,
    data_confidence TEXT NOT NULL,
    verdict TEXT NOT NULL CHECK (
        verdict IN ('BUY_CANDIDATE', 'WATCH', 'REJECT', 'INSUFFICIENT_DATA')
    ),
    sources_json TEXT NOT NULL,
    validation_json TEXT NOT NULL,
    status TEXT NOT NULL CHECK (status IN ('draft', 'active', 'archived')),
    notes TEXT
);

CREATE INDEX IF NOT EXISTS idx_research_memos_created
ON research_memos(created_at);

CREATE INDEX IF NOT EXISTS idx_research_memos_status
ON research_memos(status);

CREATE TABLE IF NOT EXISTS research_validation_records (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    created_at TEXT NOT NULL,
    memo_id INTEGER,
    asset TEXT,
    check_type TEXT NOT NULL CHECK (
        check_type IN (
            'MARKET_CAP', 'VALUATION', 'CROSS_SOURCE',
            'SOURCE_CONFIDENCE', 'MANUAL_REVIEW'
        )
    ),
    field_name TEXT NOT NULL,
    source_primary TEXT,
    source_secondary TEXT,
    primary_value TEXT,
    secondary_value TEXT,
    consensus_value TEXT,
    tolerance_pct REAL,
    deviation_pct REAL,
    status TEXT NOT NULL CHECK (status IN ('PASS', 'WARNING', 'FAIL', 'UNVERIFIED')),
    confidence TEXT NOT NULL CHECK (confidence IN ('high', 'medium', 'low')),
    notes TEXT,
    raw_json TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_research_validation_records_created
ON research_validation_records(created_at);

CREATE INDEX IF NOT EXISTS idx_research_validation_records_memo
ON research_validation_records(memo_id);

CREATE TABLE IF NOT EXISTS persistence_markers (
    key TEXT PRIMARY KEY,
    value TEXT NOT NULL,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS budget_transactions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    date TEXT NOT NULL,
    merchant TEXT NOT NULL,
    amount_eur REAL NOT NULL,
    category TEXT NOT NULL,
    description TEXT,
    source TEXT DEFAULT 'text',
    month TEXT NOT NULL,
    is_income INTEGER DEFAULT 0,
    created_at TEXT NOT NULL
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_budget_unique
ON budget_transactions(date, merchant, amount_eur);

CREATE TABLE IF NOT EXISTS budget_memory (
    key TEXT PRIMARY KEY,
    value_json TEXT NOT NULL,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS sleep_log (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    event_type TEXT NOT NULL CHECK (event_type IN ('bedtime', 'wakeup')),
    logged_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_sleep_log_logged_at ON sleep_log(logged_at);

CREATE TABLE IF NOT EXISTS soreness_log (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    score INTEGER NOT NULL CHECK (score BETWEEN 0 AND 5),
    logged_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_soreness_log_logged_at ON soreness_log(logged_at);

CREATE TABLE IF NOT EXISTS portfolio_state_store (
    id INTEGER PRIMARY KEY DEFAULT 1,
    state_json TEXT NOT NULL,
    updated_at TEXT NOT NULL
);
"""


def _utc_now() -> str:
    return clock.utc_now_iso()


def _date_value(value: date | str) -> str:
    if isinstance(value, date):
        return value.isoformat()
    return date.fromisoformat(str(value)).isoformat()


def _row_to_dict(row: sqlite3.Row | None) -> dict[str, Any] | None:
    return dict(row) if row is not None else None


def get_db() -> sqlite3.Connection:
    """Return a configured connection to the local PHOENIX database."""
    DB_PATH.parent.mkdir(parents=True, exist_ok=True)
    connection = sqlite3.connect(DB_PATH, timeout=5.0)
    connection.row_factory = sqlite3.Row
    return connection


def _migrate_finance_transaction_ledger(connection: sqlite3.Connection) -> None:
    """Add apply-gate columns to finance_transaction_ledger if not present."""
    existing = {
        row[1]
        for row in connection.execute(
            "PRAGMA table_info(finance_transaction_ledger)"
        ).fetchall()
    }
    new_cols = [
        ("applied_at", "TEXT"),
        ("portfolio_state_updated", "INTEGER NOT NULL DEFAULT 0"),
        ("apply_snapshot_json", "TEXT"),
    ]
    for col_name, col_def in new_cols:
        if col_name not in existing:
            connection.execute(
                f"ALTER TABLE finance_transaction_ledger ADD COLUMN {col_name} {col_def}"
            )
    connection.commit()


def _migrate_research_memos_quality_columns(connection: sqlite3.Connection) -> None:
    """Add research quality gate columns to research_memos if not present."""
    existing = {
        row[1]
        for row in connection.execute(
            "PRAGMA table_info(research_memos)"
        ).fetchall()
    }
    new_cols = [
        ("research_quality_status", "TEXT NOT NULL DEFAULT 'UNREVIEWED'"),
        ("research_quality_reason", "TEXT"),
        ("research_quality_checked_at", "TEXT"),
        ("research_quality_summary_json", "TEXT"),
    ]
    for col_name, col_def in new_cols:
        if col_name not in existing:
            connection.execute(
                f"ALTER TABLE research_memos ADD COLUMN {col_name} {col_def}"
            )
    connection.commit()


def _migrate_finance_transaction_void_columns(connection: sqlite3.Connection) -> None:
    """Add void columns to finance_transaction_ledger if not present."""
    existing = {
        row[1]
        for row in connection.execute(
            "PRAGMA table_info(finance_transaction_ledger)"
        ).fetchall()
    }
    new_cols = [
        ("voided", "INTEGER NOT NULL DEFAULT 0"),
        ("voided_at", "TEXT"),
        ("void_reason", "TEXT"),
        ("void_snapshot_json", "TEXT"),
    ]
    for col_name, col_def in new_cols:
        if col_name not in existing:
            connection.execute(
                f"ALTER TABLE finance_transaction_ledger ADD COLUMN {col_name} {col_def}"
            )
    connection.commit()


def _migrate_portfolio_state_store(connection: sqlite3.Connection) -> None:
    """Seed portfolio_state_store from the JSON file if the table is empty."""
    row = connection.execute("SELECT COUNT(*) FROM portfolio_state_store").fetchone()
    if row[0] == 0:
        if PORTFOLIO_STATE_JSON_PATH.exists():
            state_json = PORTFOLIO_STATE_JSON_PATH.read_text(encoding="utf-8")
            connection.execute(
                "INSERT INTO portfolio_state_store (id, state_json, updated_at) VALUES (1, ?, ?)",
                (state_json, clock.utc_now_iso()),
            )
            connection.commit()


def init_db() -> None:
    """Create all persistence tables and indexes when absent."""
    connection = get_db()
    try:
        connection.executescript(_SCHEMA)
        connection.commit()
        _migrate_finance_transaction_ledger(connection)
        _migrate_finance_transaction_void_columns(connection)
        _migrate_research_memos_quality_columns(connection)
        _migrate_portfolio_state_store(connection)
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


def get_recent_meals(limit: int = 20) -> list[dict[str, Any]]:
    """Return recent meal log rows for quick repeat/reuse workflows."""
    if limit < 1:
        return []
    connection = get_db()
    try:
        rows = connection.execute(
            """
            SELECT * FROM meal_log
            ORDER BY logged_at DESC, id DESC
            LIMIT ?
            """,
            (limit,),
        ).fetchall()
        return [dict(row) for row in rows]
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


_ALLOWED_NUTRITION_MEMORY_KINDS = {"favorite", "dislike", "pantry", "preferred"}


def _normalize_memory_kind(kind: str) -> str:
    normalized = str(kind or "").strip().lower()
    aliases = {
        "avoid": "dislike",
        "avoided": "dislike",
        "disliked": "dislike",
        "at_home": "pantry",
        "have": "pantry",
        "preferred_staple": "preferred",
        "preference": "preferred",
    }
    normalized = aliases.get(normalized, normalized)
    if normalized not in _ALLOWED_NUTRITION_MEMORY_KINDS:
        raise ValueError(f"Unsupported nutrition memory kind: {kind}")
    return normalized


def save_nutrition_memory(
    kind: str,
    name: str,
    item_id: str = "",
    item_type: str = "general",
    note: str | None = None,
    payload: dict[str, Any] | None = None,
    source: str = "user",
) -> dict[str, Any]:
    """Create or refresh a local, user-controlled nutrition memory entry."""
    normalized_kind = _normalize_memory_kind(kind)
    clean_name = str(name or "").strip()
    if not clean_name:
        raise ValueError("Nutrition memory name is required")
    clean_item_id = str(item_id or "").strip()
    clean_item_type = str(item_type or "general").strip().lower() or "general"
    now = _utc_now()
    payload_json = json.dumps(payload or {}, sort_keys=True)
    connection = get_db()
    try:
        connection.execute(
            """
            INSERT INTO nutrition_memory (
                kind, item_id, item_type, name, note, payload_json, source,
                created_at, updated_at
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
            ON CONFLICT(kind, item_type, item_id, name) DO UPDATE SET
                note = excluded.note,
                payload_json = excluded.payload_json,
                source = excluded.source,
                updated_at = excluded.updated_at
            """,
            (
                normalized_kind,
                clean_item_id,
                clean_item_type,
                clean_name,
                note,
                payload_json,
                source or "user",
                now,
                now,
            ),
        )
        row = connection.execute(
            """
            SELECT * FROM nutrition_memory
            WHERE kind = ? AND item_type = ? AND item_id = ? AND name = ?
            """,
            (normalized_kind, clean_item_type, clean_item_id, clean_name),
        ).fetchone()
        connection.commit()
        result = dict(row)
        result["payload"] = json.loads(result.pop("payload_json") or "{}")
        return result
    finally:
        connection.close()


def get_nutrition_memory(kind: str | None = None) -> list[dict[str, Any]]:
    connection = get_db()
    try:
        if kind:
            rows = connection.execute(
                "SELECT * FROM nutrition_memory WHERE kind = ? ORDER BY updated_at DESC, id DESC",
                (_normalize_memory_kind(kind),),
            ).fetchall()
        else:
            rows = connection.execute(
                "SELECT * FROM nutrition_memory ORDER BY kind, updated_at DESC, id DESC"
            ).fetchall()
        results = []
        for row in rows:
            item = dict(row)
            item["payload"] = json.loads(item.pop("payload_json") or "{}")
            results.append(item)
        return results
    finally:
        connection.close()


def delete_nutrition_memory(memory_id: int) -> bool:
    connection = get_db()
    try:
        cursor = connection.execute("DELETE FROM nutrition_memory WHERE id = ?", (memory_id,))
        connection.commit()
        return cursor.rowcount > 0
    finally:
        connection.close()


def save_calendar_snapshot_import(
    snapshot: dict[str, Any],
    *,
    label: str = "manual import",
    source: str = "manual_paste",
    validation: dict[str, Any] | None = None,
) -> dict[str, Any]:
    """Persist a sanitized read-only calendar snapshot import."""
    clean_label = str(label or "manual import").strip()[:160] or "manual import"
    clean_source = str(source or "manual_paste").strip()[:80] or "manual_paste"
    as_of = str(snapshot.get("as_of", ""))
    events = snapshot.get("events", []) if isinstance(snapshot.get("events", []), list) else []
    warnings = snapshot.get("fetch_warnings", []) if isinstance(snapshot.get("fetch_warnings", []), list) else []
    validation_payload = validation or {}
    connection = get_db()
    try:
        cursor = connection.execute(
            """
            INSERT INTO calendar_snapshot_imports (
                imported_at, label, source, as_of, event_count, warning_count,
                snapshot_json, validation_json
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
            """,
            (
                _utc_now(),
                clean_label,
                clean_source,
                as_of,
                len(events),
                len(warnings),
                json.dumps(snapshot, sort_keys=True),
                json.dumps(validation_payload, sort_keys=True),
            ),
        )
        connection.commit()
        return get_calendar_snapshot_import(int(cursor.lastrowid)) or {}
    finally:
        connection.close()


def _calendar_import_row_to_dict(row: sqlite3.Row | None) -> dict[str, Any] | None:
    if row is None:
        return None
    item = dict(row)
    item["snapshot"] = json.loads(item.pop("snapshot_json") or "{}")
    item["validation"] = json.loads(item.pop("validation_json") or "{}")
    return item


def get_calendar_snapshot_import(import_id: int) -> dict[str, Any] | None:
    connection = get_db()
    try:
        row = connection.execute(
            "SELECT * FROM calendar_snapshot_imports WHERE id = ?",
            (int(import_id),),
        ).fetchone()
        return _calendar_import_row_to_dict(row)
    finally:
        connection.close()


def get_latest_calendar_snapshot_import() -> dict[str, Any] | None:
    connection = get_db()
    try:
        row = connection.execute(
            """
            SELECT * FROM calendar_snapshot_imports
            ORDER BY imported_at DESC, id DESC
            LIMIT 1
            """
        ).fetchone()
        return _calendar_import_row_to_dict(row)
    finally:
        connection.close()


def list_calendar_snapshot_imports(limit: int = 10) -> list[dict[str, Any]]:
    safe_limit = max(1, min(int(limit or 10), 50))
    connection = get_db()
    try:
        rows = connection.execute(
            """
            SELECT * FROM calendar_snapshot_imports
            ORDER BY imported_at DESC, id DESC
            LIMIT ?
            """,
            (safe_limit,),
        ).fetchall()
        return [_calendar_import_row_to_dict(row) for row in rows]
    finally:
        connection.close()


def delete_calendar_snapshot_import(import_id: int) -> bool:
    connection = get_db()
    try:
        cursor = connection.execute(
            "DELETE FROM calendar_snapshot_imports WHERE id = ?",
            (int(import_id),),
        )
        connection.commit()
        return cursor.rowcount > 0
    finally:
        connection.close()


def save_google_oauth_tokens(
    *,
    access_token_encrypted: str,
    refresh_token_encrypted: str,
    token_expiry: str,
    scopes: list[str] | str,
    provider: str = "google",
) -> dict[str, Any]:
    """Persist encrypted OAuth tokens. Replaces any existing row for the provider.

    Only encrypted ciphertext ever reaches this function/table — see
    jarvis/domains/calendar/google_oauth.py for encryption.
    """
    scopes_str = " ".join(scopes) if isinstance(scopes, list) else str(scopes)
    now = _utc_now()
    connection = get_db()
    try:
        existing = connection.execute(
            "SELECT id, connected_at FROM google_oauth_tokens WHERE provider = ?",
            (provider,),
        ).fetchone()
        connected_at = existing["connected_at"] if existing else now
        connection.execute(
            "DELETE FROM google_oauth_tokens WHERE provider = ?",
            (provider,),
        )
        connection.execute(
            """
            INSERT INTO google_oauth_tokens (
                provider, access_token_encrypted, refresh_token_encrypted,
                token_expiry, scopes, connected_at, updated_at
            ) VALUES (?, ?, ?, ?, ?, ?, ?)
            """,
            (
                provider,
                access_token_encrypted,
                refresh_token_encrypted,
                token_expiry,
                scopes_str,
                connected_at,
                now,
            ),
        )
        connection.commit()
        return get_google_oauth_tokens(provider=provider) or {}
    finally:
        connection.close()


def get_google_oauth_tokens(provider: str = "google") -> dict[str, Any] | None:
    connection = get_db()
    try:
        row = connection.execute(
            "SELECT * FROM google_oauth_tokens WHERE provider = ? ORDER BY id DESC LIMIT 1",
            (provider,),
        ).fetchone()
        return _row_to_dict(row)
    finally:
        connection.close()


def delete_google_oauth_tokens(provider: str = "google") -> bool:
    connection = get_db()
    try:
        cursor = connection.execute(
            "DELETE FROM google_oauth_tokens WHERE provider = ?",
            (provider,),
        )
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
    cutoff = (clock.today() - timedelta(days=days - 1)).isoformat()
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


def save_training_readiness_scan(payload: dict[str, Any]) -> int:
    connection = get_db()
    try:
        cursor = connection.execute(
            """
            INSERT INTO training_readiness_scans (
                scan_date, created_at, knee, ankle, hip, hamstring,
                calf_achilles, lower_back_pelvic, note, sharp_pain,
                limping, next_day_worsening, readiness_status
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            """,
            (
                payload["scan_date"],
                _utc_now(),
                payload["knee"],
                payload["ankle"],
                payload["hip"],
                payload["hamstring"],
                payload["calf_achilles"],
                payload["lower_back_pelvic"],
                payload.get("note"),
                int(bool(payload.get("sharp_pain"))),
                int(bool(payload.get("limping"))),
                int(bool(payload.get("next_day_worsening"))),
                payload["readiness_status"],
            ),
        )
        connection.commit()
        return int(cursor.lastrowid)
    finally:
        connection.close()


def _readiness_row(row: sqlite3.Row) -> dict[str, Any]:
    result = dict(row)
    for key in ("sharp_pain", "limping", "next_day_worsening"):
        result[key] = bool(result[key])
    return result


def get_latest_training_readiness_scan(on_date: str | None = None) -> dict[str, Any] | None:
    connection = get_db()
    try:
        if on_date is None:
            row = connection.execute(
                "SELECT * FROM training_readiness_scans ORDER BY scan_date DESC, id DESC LIMIT 1"
            ).fetchone()
        else:
            row = connection.execute(
                "SELECT * FROM training_readiness_scans WHERE scan_date = ? ORDER BY id DESC LIMIT 1",
                (on_date,),
            ).fetchone()
        return _readiness_row(row) if row else None
    finally:
        connection.close()


def list_training_readiness_scans(limit: int = 50) -> list[dict[str, Any]]:
    if limit < 1:
        return []
    connection = get_db()
    try:
        rows = connection.execute(
            "SELECT * FROM training_readiness_scans ORDER BY scan_date DESC, id DESC LIMIT ?",
            (limit,),
        ).fetchall()
        return [_readiness_row(row) for row in rows]
    finally:
        connection.close()


def save_training_capacity_log(payload: dict[str, Any]) -> int:
    connection = get_db()
    try:
        cursor = connection.execute(
            """
            INSERT INTO training_capacity_logs
                (log_date, created_at, block_key, completion_json, notes)
            VALUES (?, ?, ?, ?, ?)
            """,
            (
                payload["log_date"],
                _utc_now(),
                payload["block_key"],
                json.dumps(payload.get("completion", {}), separators=(",", ":")),
                payload.get("notes"),
            ),
        )
        connection.commit()
        return int(cursor.lastrowid)
    finally:
        connection.close()


def list_training_capacity_logs(limit: int = 50) -> list[dict[str, Any]]:
    if limit < 1:
        return []
    connection = get_db()
    try:
        rows = connection.execute(
            "SELECT * FROM training_capacity_logs ORDER BY log_date DESC, id DESC LIMIT ?",
            (limit,),
        ).fetchall()
        result = []
        for row in rows:
            item = dict(row)
            item["completion"] = json.loads(item.pop("completion_json"))
            result.append(item)
        return result
    finally:
        connection.close()


def save_training_jump_balance_log(payload: dict[str, Any]) -> int:
    connection = get_db()
    try:
        cursor = connection.execute(
            """
            INSERT INTO training_jump_balance_logs (
                log_date, created_at, plant_pattern, rep_count, jump_variant,
                height_cm, video_note, quality_json, notes
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
            """,
            (
                payload["log_date"],
                _utc_now(),
                payload["plant_pattern"],
                payload["rep_count"],
                payload["jump_variant"],
                payload.get("height_cm"),
                payload.get("video_note"),
                json.dumps(payload.get("quality", {}), separators=(",", ":")),
                payload.get("notes"),
            ),
        )
        connection.commit()
        return int(cursor.lastrowid)
    finally:
        connection.close()


def list_training_jump_balance_logs(limit: int = 50) -> list[dict[str, Any]]:
    if limit < 1:
        return []
    connection = get_db()
    try:
        rows = connection.execute(
            "SELECT * FROM training_jump_balance_logs ORDER BY log_date DESC, id DESC LIMIT ?",
            (limit,),
        ).fetchall()
        result = []
        for row in rows:
            item = dict(row)
            item["quality"] = json.loads(item.pop("quality_json"))
            result.append(item)
        return result
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


def get_latest_brief_for_week(
    week_label: str, domain: str = "finance"
) -> dict[str, Any] | None:
    """Return the newest brief for one week and domain, regardless of status."""
    connection = get_db()
    try:
        row = connection.execute(
            """
            SELECT * FROM brief_history
            WHERE week_label = ? AND domain = ?
            ORDER BY created_at DESC, id DESC
            LIMIT 1
            """,
            (week_label, domain),
        ).fetchone()
        return _row_to_dict(row)
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


def delete_brief(brief_id: int) -> bool:
    """Delete a brief by id. Returns True if a row was deleted."""
    connection = get_db()
    try:
        cursor = connection.execute("DELETE FROM brief_history WHERE id = ?", (brief_id,))
        connection.commit()
        return cursor.rowcount > 0
    finally:
        connection.close()


def get_pnl_cost_basis() -> dict[str, dict]:
    """Return cost basis aggregated by asset from applied, non-voided buy transactions."""
    connection = get_db()
    try:
        rows = connection.execute(
            """
            SELECT
                asset,
                SUM(amount_eur) AS cost_basis_eur,
                SUM(units)      AS total_units_bought
            FROM finance_transaction_ledger
            WHERE portfolio_state_updated = 1
              AND (voided IS NULL OR voided = 0)
              AND side = 'buy'
            GROUP BY asset
            """
        ).fetchall()
        return {
            row["asset"]: {
                "cost_basis_eur": row["cost_basis_eur"],
                "total_units_bought": row["total_units_bought"],
            }
            for row in rows
        }
    finally:
        connection.close()


def save_finance_transaction(payload: dict) -> int:
    """Persist a user-reported manual buy; this function never executes a trade."""
    connection = get_db()
    try:
        cursor = connection.execute(
            """
            INSERT INTO finance_transaction_ledger (
                created_at, executed_at, brief_id, asset, symbol, platform,
                side, amount_eur, units, price, currency, fee_eur, notes,
                manual_record_only, trades_executed, broker_connection
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1, 0, 0)
            """,
            (
                _utc_now(),
                payload["executed_at"],
                payload.get("brief_id"),
                payload["asset"],
                payload.get("symbol"),
                payload["platform"],
                payload["side"],
                payload["amount_eur"],
                payload["units"],
                payload["price"],
                payload["currency"],
                payload.get("fee_eur", 0),
                payload.get("notes"),
            ),
        )
        connection.commit()
        return int(cursor.lastrowid)
    finally:
        connection.close()


def get_finance_transactions(limit: int = 50) -> list[dict[str, Any]]:
    """Return recent manual finance records, newest first."""
    if limit < 1:
        return []
    connection = get_db()
    try:
        rows = connection.execute(
            """
            SELECT * FROM finance_transaction_ledger
            ORDER BY created_at DESC, id DESC
            LIMIT ?
            """,
            (limit,),
        ).fetchall()
        return [dict(row) for row in rows]
    finally:
        connection.close()


def get_finance_transaction(transaction_id: int) -> dict[str, Any] | None:
    """Return one manual finance record by id."""
    connection = get_db()
    try:
        row = connection.execute(
            "SELECT * FROM finance_transaction_ledger WHERE id = ?",
            (transaction_id,),
        ).fetchone()
        return _row_to_dict(row)
    finally:
        connection.close()


def get_applied_transactions_for_iso_week(week_label: str) -> list[dict[str, Any]]:
    """Return applied transactions whose executed_at date falls within the ISO week.

    week_label format: 'W27 2026'
    Uses executed_at (broker trade date) to determine the week, not applied_at.
    """
    try:
        parts = week_label.split()
        iso_week = int(parts[0].lstrip("W"))
        iso_year = int(parts[1])
    except (IndexError, ValueError):
        return []

    # Compute Monday of that ISO week
    from datetime import date, timedelta
    jan4 = date(iso_year, 1, 4)  # Jan 4 is always in ISO week 1
    week1_monday = jan4 - timedelta(days=jan4.isocalendar()[2] - 1)
    week_monday = week1_monday + timedelta(weeks=iso_week - 1)
    week_sunday = week_monday + timedelta(days=6)

    connection = get_db()
    try:
        rows = connection.execute(
            """
            SELECT * FROM finance_transaction_ledger
            WHERE portfolio_state_updated = 1
              AND (voided IS NULL OR voided = 0)
              AND substr(executed_at, 1, 10) >= ?
              AND substr(executed_at, 1, 10) <= ?
            ORDER BY executed_at DESC
            """,
            (week_monday.isoformat(), week_sunday.isoformat()),
        ).fetchall()
        return [dict(row) for row in rows]
    finally:
        connection.close()


def finance_transaction_is_applied(transaction_id: int) -> bool:
    """Return True if this transaction has already been applied to portfolio_state."""
    connection = get_db()
    try:
        row = connection.execute(
            "SELECT portfolio_state_updated FROM finance_transaction_ledger WHERE id = ?",
            (transaction_id,),
        ).fetchone()
        return bool(row and row["portfolio_state_updated"])
    finally:
        connection.close()


def mark_finance_transaction_applied(
    transaction_id: int, apply_snapshot_json: str
) -> bool:
    """Mark transaction applied; returns True if the row existed and was updated."""
    connection = get_db()
    try:
        cursor = connection.execute(
            """
            UPDATE finance_transaction_ledger
            SET applied_at = ?,
                portfolio_state_updated = 1,
                apply_snapshot_json = ?
            WHERE id = ?
            """,
            (_utc_now(), apply_snapshot_json, transaction_id),
        )
        connection.commit()
        return cursor.rowcount > 0
    finally:
        connection.close()


def void_finance_transaction(
    transaction_id: int, void_reason: str, void_snapshot_json: str
) -> bool:
    """Mark a transaction as voided; returns True if the row existed and was updated."""
    connection = get_db()
    try:
        cursor = connection.execute(
            """
            UPDATE finance_transaction_ledger
            SET voided = 1,
                voided_at = ?,
                void_reason = ?,
                void_snapshot_json = ?
            WHERE id = ?
            """,
            (_utc_now(), void_reason, void_snapshot_json, transaction_id),
        )
        connection.commit()
        return cursor.rowcount > 0
    finally:
        connection.close()


def load_portfolio_state() -> dict[str, Any]:
    """Load portfolio state from SQLite (preferred) or fall back to JSON file."""
    connection = get_db()
    try:
        row = connection.execute("SELECT state_json FROM portfolio_state_store WHERE id = 1").fetchone()
        if row:
            return json.loads(row["state_json"])
    finally:
        connection.close()
    if PORTFOLIO_STATE_JSON_PATH.exists():
        return json.loads(PORTFOLIO_STATE_JSON_PATH.read_text(encoding="utf-8"))
    return {}


def save_portfolio_state(state: dict[str, Any]) -> None:
    """Save portfolio state to SQLite and also write the JSON file as backup."""
    state_json = json.dumps(state, indent=2, ensure_ascii=False)
    connection = get_db()
    try:
        connection.execute(
            "INSERT INTO portfolio_state_store (id, state_json, updated_at) VALUES (1, ?, ?) "
            "ON CONFLICT(id) DO UPDATE SET state_json = excluded.state_json, updated_at = excluded.updated_at",
            (state_json, clock.utc_now_iso()),
        )
        connection.commit()
    finally:
        connection.close()
    try:
        PORTFOLIO_STATE_JSON_PATH.write_text(state_json, encoding="utf-8")
    except OSError:
        pass


_CASH_HOLDING_KEYS = {
    "tactical_reserve",
    "lhv_growth_cash_pending_settlement",
}


def _snapshot_values(portfolio_state: dict) -> tuple[float | None, float | None, float | None, dict]:
    """Return conservative total, cash, invested and allocation values."""
    holdings = portfolio_state.get("holdings")
    legacy_holdings = portfolio_state.get("legacy_holdings", {})
    if not isinstance(holdings, dict) or not isinstance(legacy_holdings, dict):
        return None, None, None, {}

    combined = {**holdings, **legacy_holdings}
    numeric_values: dict[str, float] = {}
    for key, value in combined.items():
        if isinstance(value, bool) or not isinstance(value, (int, float)):
            return None, None, None, {}
        numeric = float(value)
        if not math.isfinite(numeric):
            return None, None, None, {}
        numeric_values[key] = numeric

    total = round(sum(numeric_values.values()), 2)
    invested = round(
        sum(value for key, value in numeric_values.items() if key not in _CASH_HOLDING_KEYS),
        2,
    )
    cash_values = [
        value for key, value in numeric_values.items() if key in _CASH_HOLDING_KEYS
    ]
    cash = round(sum(cash_values), 2) if cash_values else None
    allocation = (
        {key: round(value / total * 100, 6) for key, value in numeric_values.items()}
        if total > 0
        else {}
    )
    return total, cash, invested, allocation


def _decode_finance_snapshot(row: sqlite3.Row | None) -> dict[str, Any] | None:
    if row is None:
        return None
    snapshot = dict(row)
    snapshot["holdings"] = json.loads(snapshot.pop("holdings_json"))
    snapshot["allocation"] = json.loads(snapshot.pop("allocation_json"))
    return snapshot


def create_finance_portfolio_snapshot(
    trigger: str, transaction_id: int | None = None, notes: str | None = None
) -> dict[str, Any]:
    """Snapshot the current canonical portfolio state without fabricating values."""
    connection = get_db()
    try:
        if transaction_id is not None:
            existing = connection.execute(
                "SELECT * FROM finance_portfolio_snapshots WHERE transaction_id = ?",
                (transaction_id,),
            ).fetchone()
            decoded = _decode_finance_snapshot(existing)
            if decoded is not None:
                return decoded

        portfolio_state = load_portfolio_state()
        total, cash, invested, allocation = _snapshot_values(portfolio_state)
        holdings = {
            "holdings": portfolio_state.get("holdings", {}),
            "legacy_holdings": portfolio_state.get("legacy_holdings", {}),
        }
        try:
            cursor = connection.execute(
                """
                INSERT INTO finance_portfolio_snapshots (
                    created_at, source, trigger, transaction_id, total_value_eur,
                    cash_eur, invested_value_eur, holdings_json, allocation_json, notes
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                """,
                (
                    _utc_now(),
                    "real_portfolio_state",
                    trigger,
                    transaction_id,
                    total,
                    cash,
                    invested,
                    json.dumps(holdings),
                    json.dumps(allocation),
                    notes,
                ),
            )
            connection.commit()
            snapshot_id = int(cursor.lastrowid)
        except sqlite3.IntegrityError:
            if transaction_id is None:
                raise
            connection.rollback()
            existing = connection.execute(
                "SELECT * FROM finance_portfolio_snapshots WHERE transaction_id = ?",
                (transaction_id,),
            ).fetchone()
            decoded = _decode_finance_snapshot(existing)
            if decoded is None:
                raise
            return decoded

        row = connection.execute(
            "SELECT * FROM finance_portfolio_snapshots WHERE id = ?", (snapshot_id,)
        ).fetchone()
        result = _decode_finance_snapshot(row)
        if result is None:
            raise RuntimeError("Finance portfolio snapshot was not persisted")
        return result
    finally:
        connection.close()


def list_finance_portfolio_snapshots(limit: int = 100) -> list[dict[str, Any]]:
    """Return real portfolio snapshots newest first."""
    if limit < 1:
        return []
    connection = get_db()
    try:
        rows = connection.execute(
            """
            SELECT * FROM finance_portfolio_snapshots
            ORDER BY created_at DESC, id DESC
            LIMIT ?
            """,
            (limit,),
        ).fetchall()
        return [snapshot for row in rows if (snapshot := _decode_finance_snapshot(row))]
    finally:
        connection.close()


def delete_finance_portfolio_snapshot(snapshot_id: int) -> bool:
    """Delete a performance snapshot by id. Does NOT affect portfolio state."""
    connection = get_db()
    try:
        cursor = connection.execute(
            "DELETE FROM finance_portfolio_snapshots WHERE id = ?", (snapshot_id,)
        )
        connection.commit()
        return cursor.rowcount > 0
    finally:
        connection.close()


_RESEARCH_MEMO_VERDICTS = {
    "BUY_CANDIDATE",
    "WATCH",
    "REJECT",
    "INSUFFICIENT_DATA",
}
_RESEARCH_MEMO_STATUSES = {"draft", "active", "archived"}


def _decode_research_memo(row: sqlite3.Row | None) -> dict[str, Any] | None:
    if row is None:
        return None
    memo = dict(row)
    memo["risks"] = json.loads(memo["risks"])
    memo["sources"] = json.loads(memo.pop("sources_json"))
    memo["validation"] = json.loads(memo.pop("validation_json"))
    raw_quality = memo.pop("research_quality_summary_json", None)
    memo["research_quality_summary"] = json.loads(raw_quality) if raw_quality else None
    return memo


def create_research_memo(payload: dict) -> int:
    """Persist a research-only memo; this function has no execution side effects."""
    verdict = payload["verdict"]
    status = payload["status"]
    if verdict not in _RESEARCH_MEMO_VERDICTS:
        raise ValueError(f"Invalid research memo verdict: {verdict}")
    if status not in _RESEARCH_MEMO_STATUSES:
        raise ValueError(f"Invalid research memo status: {status}")

    now = _utc_now()
    connection = get_db()
    try:
        cursor = connection.execute(
            """
            INSERT INTO research_memos (
                created_at, updated_at, asset, sleeve, title, thesis, risks,
                data_confidence, verdict, sources_json, validation_json, status, notes
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            """,
            (
                now,
                now,
                payload.get("asset"),
                payload.get("sleeve"),
                payload["title"],
                payload["thesis"],
                json.dumps(payload["risks"]),
                payload["data_confidence"],
                verdict,
                json.dumps(payload["sources"]),
                json.dumps(payload["validation"]),
                status,
                payload.get("notes"),
            ),
        )
        connection.commit()
        return int(cursor.lastrowid)
    finally:
        connection.close()


def list_research_memos(limit: int = 50) -> list[dict[str, Any]]:
    """Return research memos newest first."""
    if limit < 1:
        return []
    connection = get_db()
    try:
        rows = connection.execute(
            """
            SELECT * FROM research_memos
            ORDER BY created_at DESC, id DESC
            LIMIT ?
            """,
            (limit,),
        ).fetchall()
        return [memo for row in rows if (memo := _decode_research_memo(row))]
    finally:
        connection.close()


def get_research_memo(memo_id: int) -> dict[str, Any] | None:
    """Return one research memo by id."""
    connection = get_db()
    try:
        row = connection.execute(
            "SELECT * FROM research_memos WHERE id = ?", (memo_id,)
        ).fetchone()
        return _decode_research_memo(row)
    finally:
        connection.close()


def delete_research_memo(memo_id: int) -> bool:
    """Delete a research memo and its linked validation records by id."""
    connection = get_db()
    try:
        connection.execute(
            "DELETE FROM research_validation_records WHERE memo_id = ?", (memo_id,)
        )
        cursor = connection.execute(
            "DELETE FROM research_memos WHERE id = ?", (memo_id,)
        )
        connection.commit()
        return cursor.rowcount > 0
    finally:
        connection.close()


_RESEARCH_VALIDATION_CHECK_TYPES = {
    "MARKET_CAP",
    "VALUATION",
    "CROSS_SOURCE",
    "SOURCE_CONFIDENCE",
    "MANUAL_REVIEW",
}
_RESEARCH_VALIDATION_STATUSES = {"PASS", "WARNING", "FAIL", "UNVERIFIED"}
_RESEARCH_VALIDATION_CONFIDENCES = {"high", "medium", "low"}


def _decode_research_validation_record(
    row: sqlite3.Row | None,
) -> dict[str, Any] | None:
    if row is None:
        return None
    record = dict(row)
    record["raw_json"] = json.loads(record["raw_json"])
    return record


def create_research_validation_record(payload: dict) -> int:
    """Persist an evidence/audit record with no finance execution side effects."""
    check_type = payload["check_type"]
    status = payload["status"]
    confidence = payload["confidence"]
    if check_type not in _RESEARCH_VALIDATION_CHECK_TYPES:
        raise ValueError(f"Invalid research validation check type: {check_type}")
    if status not in _RESEARCH_VALIDATION_STATUSES:
        raise ValueError(f"Invalid research validation status: {status}")
    if confidence not in _RESEARCH_VALIDATION_CONFIDENCES:
        raise ValueError(f"Invalid research validation confidence: {confidence}")

    connection = get_db()
    try:
        cursor = connection.execute(
            """
            INSERT INTO research_validation_records (
                created_at, memo_id, asset, check_type, field_name,
                source_primary, source_secondary, primary_value, secondary_value,
                consensus_value, tolerance_pct, deviation_pct, status, confidence,
                notes, raw_json
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            """,
            (
                _utc_now(),
                payload.get("memo_id"),
                payload.get("asset"),
                check_type,
                payload["field_name"],
                payload.get("source_primary"),
                payload.get("source_secondary"),
                payload.get("primary_value"),
                payload.get("secondary_value"),
                payload.get("consensus_value"),
                payload.get("tolerance_pct"),
                payload.get("deviation_pct"),
                status,
                confidence,
                payload.get("notes"),
                json.dumps(payload.get("raw_json") or {}),
            ),
        )
        connection.commit()
        return int(cursor.lastrowid)
    finally:
        connection.close()


def research_validation_record_exists(
    memo_id: int, check_type: str, field_name: str
) -> bool:
    """Return True if a record with memo_id + check_type + field_name already exists."""
    connection = get_db()
    try:
        row = connection.execute(
            """
            SELECT 1 FROM research_validation_records
            WHERE memo_id = ? AND check_type = ? AND field_name = ?
            LIMIT 1
            """,
            (memo_id, check_type, field_name),
        ).fetchone()
        return row is not None
    finally:
        connection.close()


def get_research_validation_record_by_memo_check_field(
    memo_id: int, check_type: str, field_name: str
) -> dict[str, Any] | None:
    """Return the existing validation record for memo/check/field, or None."""
    connection = get_db()
    try:
        row = connection.execute(
            """
            SELECT * FROM research_validation_records
            WHERE memo_id = ? AND check_type = ? AND field_name = ?
            ORDER BY created_at ASC, id ASC
            LIMIT 1
            """,
            (memo_id, check_type, field_name),
        ).fetchone()
        return _decode_research_validation_record(row)
    finally:
        connection.close()


def update_research_validation_record(record_id: int, payload: dict) -> None:
    """Update mutable fields of a PHOENIX-generated validation record.

    Only touches content fields — does not change id, created_at, memo_id, check_type, or field_name.
    Validates status and confidence the same way create does.
    """
    status = payload["status"]
    confidence = payload["confidence"]
    if status not in _RESEARCH_VALIDATION_STATUSES:
        raise ValueError(f"Invalid research validation status: {status}")
    if confidence not in _RESEARCH_VALIDATION_CONFIDENCES:
        raise ValueError(f"Invalid research validation confidence: {confidence}")

    connection = get_db()
    try:
        connection.execute(
            """
            UPDATE research_validation_records
            SET asset = ?,
                source_primary = ?,
                source_secondary = ?,
                primary_value = ?,
                secondary_value = ?,
                consensus_value = ?,
                tolerance_pct = ?,
                deviation_pct = ?,
                status = ?,
                confidence = ?,
                notes = ?,
                raw_json = ?
            WHERE id = ?
            """,
            (
                payload.get("asset"),
                payload.get("source_primary"),
                payload.get("source_secondary"),
                payload.get("primary_value"),
                payload.get("secondary_value"),
                payload.get("consensus_value"),
                payload.get("tolerance_pct"),
                payload.get("deviation_pct"),
                status,
                confidence,
                payload.get("notes"),
                json.dumps(payload.get("raw_json") or {}),
                record_id,
            ),
        )
        connection.commit()
    finally:
        connection.close()


def list_research_validation_records(limit: int = 100) -> list[dict[str, Any]]:
    """Return research validation records newest first."""
    if limit < 1:
        return []
    connection = get_db()
    try:
        rows = connection.execute(
            """
            SELECT * FROM research_validation_records
            ORDER BY created_at DESC, id DESC
            LIMIT ?
            """,
            (limit,),
        ).fetchall()
        return [
            record
            for row in rows
            if (record := _decode_research_validation_record(row))
        ]
    finally:
        connection.close()


def get_research_validation_record(record_id: int) -> dict[str, Any] | None:
    """Return one research validation record by id."""
    connection = get_db()
    try:
        row = connection.execute(
            "SELECT * FROM research_validation_records WHERE id = ?", (record_id,)
        ).fetchone()
        return _decode_research_validation_record(row)
    finally:
        connection.close()


def list_research_validation_records_by_memo_id(
    memo_id: int, limit: int = 100
) -> list[dict[str, Any]]:
    """Return validation records linked to one memo, newest first."""
    if limit < 1:
        return []
    connection = get_db()
    try:
        rows = connection.execute(
            """
            SELECT * FROM research_validation_records
            WHERE memo_id = ?
            ORDER BY created_at DESC, id DESC
            LIMIT ?
            """,
            (memo_id, limit),
        ).fetchall()
        return [
            record
            for row in rows
            if (record := _decode_research_validation_record(row))
        ]
    finally:
        connection.close()


def get_research_memo_evidence_summary(memo_id: int) -> dict[str, Any]:
    """Compute a research-only evidence summary for one memo."""
    connection = get_db()
    try:
        rows = connection.execute(
            """
            SELECT status, COUNT(*) AS count
            FROM research_validation_records
            WHERE memo_id = ?
            GROUP BY status
            """,
            (memo_id,),
        ).fetchall()
    finally:
        connection.close()

    counts = {row["status"]: int(row["count"]) for row in rows}
    pass_count = counts.get("PASS", 0)
    warning_count = counts.get("WARNING", 0)
    fail_count = counts.get("FAIL", 0)
    unverified_count = counts.get("UNVERIFIED", 0)
    total_records = pass_count + warning_count + fail_count + unverified_count

    if total_records == 0:
        evidence_status = "NO_EVIDENCE"
    elif fail_count > 0:
        evidence_status = "BLOCKED_BY_FAIL"
    elif warning_count > 0 or unverified_count > 0:
        evidence_status = "NEEDS_RESEARCH"
    else:
        evidence_status = "EVIDENCE_STRONG"

    return {
        "pass_count": pass_count,
        "warning_count": warning_count,
        "fail_count": fail_count,
        "unverified_count": unverified_count,
        "total_records": total_records,
        "evidence_status": evidence_status,
    }


def find_active_research_memo_for_leg(
    asset: str | None, sleeve: str | None
) -> dict[str, Any] | None:
    """Return the latest VALIDATED active memo for a recommendation leg.

    A memo attaches only when status = 'active' AND research_quality_status = 'VALIDATED'.
    Priority: exact asset match > sleeve match > None.
    Never mutates portfolio state or executes trades.
    """
    connection = get_db()
    try:
        if asset:
            row = connection.execute(
                """
                SELECT * FROM research_memos
                WHERE status = 'active'
                  AND research_quality_status = 'VALIDATED'
                  AND asset = ?
                ORDER BY created_at DESC, id DESC
                LIMIT 1
                """,
                (asset,),
            ).fetchone()
            if row is not None:
                return _decode_research_memo(row)

        if sleeve:
            row = connection.execute(
                """
                SELECT * FROM research_memos
                WHERE status = 'active'
                  AND research_quality_status = 'VALIDATED'
                  AND sleeve = ?
                ORDER BY created_at DESC, id DESC
                LIMIT 1
                """,
                (sleeve,),
            ).fetchone()
            if row is not None:
                return _decode_research_memo(row)

        return None
    finally:
        connection.close()


def find_active_or_latest_research_memo_for_asset(asset: str) -> dict[str, Any] | None:
    """Return the most recent non-archived memo for an asset, regardless of quality status.

    Used by the finance autopilot to find existing work before creating a new draft.
    Priority: any non-archived memo with the given asset key.
    Never returns archived memos; never mutates state.
    """
    connection = get_db()
    try:
        row = connection.execute(
            """
            SELECT * FROM research_memos
            WHERE asset = ? AND status != 'archived'
            ORDER BY created_at DESC, id DESC
            LIMIT 1
            """,
            (asset,),
        ).fetchone()
        return _decode_research_memo(row)
    finally:
        connection.close()


_QUALITY_GATE_STATUSES = {"UNREVIEWED", "NEEDS_MORE_EVIDENCE", "VALIDATED", "REJECTED"}


def update_research_memo_quality(
    memo_id: int,
    quality_status: str,
    quality_reason: str,
    quality_summary: dict,
    new_status: str | None = None,
) -> bool:
    """Write quality gate result to a memo. Returns True if the row was found.

    If new_status is provided (e.g. 'active' for VALIDATED), the lifecycle status
    column is also updated. Never mutates portfolio_state or executes trades.
    """
    now = _utc_now()
    connection = get_db()
    try:
        if new_status is not None:
            cursor = connection.execute(
                """
                UPDATE research_memos
                SET research_quality_status = ?,
                    research_quality_reason = ?,
                    research_quality_checked_at = ?,
                    research_quality_summary_json = ?,
                    status = ?,
                    updated_at = ?
                WHERE id = ?
                """,
                (
                    quality_status,
                    quality_reason,
                    now,
                    json.dumps(quality_summary),
                    new_status,
                    now,
                    memo_id,
                ),
            )
        else:
            cursor = connection.execute(
                """
                UPDATE research_memos
                SET research_quality_status = ?,
                    research_quality_reason = ?,
                    research_quality_checked_at = ?,
                    research_quality_summary_json = ?,
                    updated_at = ?
                WHERE id = ?
                """,
                (
                    quality_status,
                    quality_reason,
                    now,
                    json.dumps(quality_summary),
                    now,
                    memo_id,
                ),
            )
        connection.commit()
        return cursor.rowcount > 0
    finally:
        connection.close()


def update_research_memo_content(
    memo_id: int,
    thesis: str,
    risks: list,
    verdict: str,
    data_confidence: str,
    notes: str | None,
) -> bool:
    """Update only content fields on a research memo.

    Validates verdict. Never touches lifecycle status, quality gate fields, or
    portfolio_state. Returns True if the row was found and updated.
    """
    if verdict not in _RESEARCH_MEMO_VERDICTS:
        raise ValueError(f"Invalid research memo verdict: {verdict}")
    connection = get_db()
    try:
        cursor = connection.execute(
            """
            UPDATE research_memos
            SET thesis = ?,
                risks = ?,
                verdict = ?,
                data_confidence = ?,
                notes = ?,
                updated_at = ?
            WHERE id = ?
            """,
            (thesis, json.dumps(risks), verdict, data_confidence, notes, _utc_now(), memo_id),
        )
        connection.commit()
        return cursor.rowcount > 0
    finally:
        connection.close()


def evaluate_research_memo_quality(memo_id: int) -> dict[str, Any]:
    """Apply the research quality gate to one memo and persist the result.

    Gate rules (applied in order):
      1. Archived → skip (no change).
      2. No validation records → NEEDS_MORE_EVIDENCE.
      3. Any FAIL record → REJECTED; status stays draft.
      4. Fewer than 2 records → NEEDS_MORE_EVIDENCE.
      5. verdict == INSUFFICIENT_DATA → NEEDS_MORE_EVIDENCE.
      6. data_confidence == LOW → NEEDS_MORE_EVIDENCE.
      7. Thesis or risks missing → NEEDS_MORE_EVIDENCE.
      8. Any WARNING or UNVERIFIED record → NEEDS_MORE_EVIDENCE.
      9. At least 2 PASS records, all hard gates pass → VALIDATED; status = active.

    Never mutates portfolio_state.json or executes trades.
    """
    memo = get_research_memo(memo_id)
    if memo is None:
        raise ValueError(f"Research memo {memo_id} not found")

    def _result(quality_status: str, reason: str, summary: dict, applied: bool) -> dict[str, Any]:
        updated = get_research_memo(memo_id)
        return {
            "memo_id": memo_id,
            "quality_status": quality_status,
            "quality_reason": reason,
            "gate_applied": applied,
            "quality_summary": summary,
            "memo": updated,
        }

    # Rule 1: archived memos are not touched by the gate
    if memo["status"] == "archived":
        existing_status = memo.get("research_quality_status", "UNREVIEWED")
        return _result(existing_status, "Archived memo: quality gate not applied.", {}, False)

    records = list_research_validation_records_by_memo_id(memo_id)
    pass_count = sum(1 for r in records if r["status"] == "PASS")
    fail_count = sum(1 for r in records if r["status"] == "FAIL")
    warning_count = sum(1 for r in records if r["status"] == "WARNING")
    unverified_count = sum(1 for r in records if r["status"] == "UNVERIFIED")
    total = len(records)

    summary = {
        "total_records": total,
        "pass_count": pass_count,
        "fail_count": fail_count,
        "warning_count": warning_count,
        "unverified_count": unverified_count,
    }

    def _needs(reason: str) -> dict[str, Any]:
        update_research_memo_quality(memo_id, "NEEDS_MORE_EVIDENCE", reason, summary)
        return _result("NEEDS_MORE_EVIDENCE", reason, summary, True)

    def _reject(reason: str) -> dict[str, Any]:
        update_research_memo_quality(memo_id, "REJECTED", reason, summary)
        return _result("REJECTED", reason, summary, True)

    def _validated() -> dict[str, Any]:
        reason = (
            "All quality gates passed: ≥2 PASS records, no FAIL/WARNING/UNVERIFIED, "
            "valid verdict and confidence, thesis and risks present."
        )
        update_research_memo_quality(memo_id, "VALIDATED", reason, summary, new_status="active")
        return _result("VALIDATED", reason, summary, True)

    # Rule 2
    if total == 0:
        return _needs("No validation records attached.")

    # Rule 3
    if fail_count > 0:
        return _reject(f"{fail_count} validation record(s) with status FAIL.")

    # Rule 4
    if total < 2:
        return _needs(f"Only {total} validation record(s). At least 2 required.")

    # Rule 5
    if memo.get("verdict") == "INSUFFICIENT_DATA":
        return _needs("Memo verdict is INSUFFICIENT_DATA.")

    # Rule 6
    if (memo.get("data_confidence") or "").upper() == "LOW":
        return _needs("Data confidence is LOW.")

    # Rule 7
    if not (memo.get("thesis") or "").strip():
        return _needs("Thesis is missing or empty.")
    if not (memo.get("risks") or []):
        return _needs("Risks list is missing or empty.")

    # Rule 8
    if warning_count > 0:
        return _needs(f"{warning_count} validation record(s) with WARNING status.")
    if unverified_count > 0:
        return _needs(f"{unverified_count} validation record(s) with UNVERIFIED status.")

    # Rule 9 (redundant guard — all records are PASS by this point)
    if pass_count < 2:
        return _needs(f"Only {pass_count} PASS record(s). At least 2 required.")

    return _validated()


def run_quality_gate_for_all() -> list[dict[str, Any]]:
    """Evaluate the quality gate for all non-archived memos.

    Never mutates portfolio_state.json or executes trades.
    """
    connection = get_db()
    try:
        rows = connection.execute(
            "SELECT id FROM research_memos WHERE status != 'archived' ORDER BY id ASC"
        ).fetchall()
        memo_ids = [row["id"] for row in rows]
    finally:
        connection.close()

    return [evaluate_research_memo_quality(mid) for mid in memo_ids]


def brief_exists_by_id(brief_id: int) -> bool:
    """Return whether a brief id exists, regardless of status or domain."""
    connection = get_db()
    try:
        row = connection.execute(
            "SELECT 1 FROM brief_history WHERE id = ? LIMIT 1",
            (brief_id,),
        ).fetchone()
        return row is not None
    finally:
        connection.close()


MAX_SANE_BUDGET_AMOUNT_EUR = 100_000.0  # a personal bank transaction above this is a parse error, not real money


def save_budget_transactions(transactions: list[dict]) -> int:
    """Insert transactions; skip duplicates by (date, merchant, amount_eur).

    Also silently skips any transaction whose amount is not a sane personal
    bank figure (e.g. a mis-parsed statement row producing a garbage huge
    number) — this guards against corrupted budget totals like the April/May
    2026 multi-trillion-euro "income" bug caused by a bad PDF/AI parse.
    """
    connection = get_db()
    now = clock.utc_now_iso()
    count = 0
    try:
        for t in transactions:
            try:
                amount = float(t["amount_eur"])
                if not (amount == amount) or amount < 0 or amount > MAX_SANE_BUDGET_AMOUNT_EUR:  # NaN or out of range
                    continue
                connection.execute(
                    """INSERT OR IGNORE INTO budget_transactions
                       (date, merchant, amount_eur, category, description, source, month, is_income, created_at)
                       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)""",
                    (t["date"], t["merchant"], t["amount_eur"], t["category"],
                     t.get("description", ""), t.get("source", "text"),
                     t["month"], int(t.get("is_income", 0)), now),
                )
                count += connection.execute("SELECT changes()").fetchone()[0]
            except Exception:
                pass
        connection.commit()
    finally:
        connection.close()
    return count


def get_budget_transactions(month: str) -> list[dict[str, Any]]:
    connection = get_db()
    try:
        rows = connection.execute(
            "SELECT * FROM budget_transactions WHERE month=? ORDER BY date DESC",
            (month,)
        ).fetchall()
        return [dict(r) for r in rows]
    finally:
        connection.close()


def get_budget_summary(month: str) -> dict[str, Any]:
    connection = get_db()
    try:
        rows = connection.execute(
            """SELECT category, is_income, SUM(amount_eur) as total, COUNT(*) as count
               FROM budget_transactions WHERE month=? GROUP BY category, is_income""",
            (month,)
        ).fetchall()
    finally:
        connection.close()

    non_spending_categories = {"Income", "Investment", "Emergency Fund", "Transfers"}
    by_category: dict[str, dict[str, Any]] = {}
    income = 0.0
    expenses = 0.0
    invested = 0.0
    emergency_fund = 0.0
    transfers = 0.0

    for row in rows:
        category = row["category"] or "Other"
        total = abs(float(row["total"] or 0))
        count = int(row["count"] or 0)
        existing = by_category.setdefault(category, {"total": 0.0, "count": 0})
        existing["total"] = round(float(existing["total"]) + total, 2)
        existing["count"] = int(existing["count"]) + count

        if category == "Income" and int(row["is_income"] or 0) == 1:
            income += total
        elif category == "Investment":
            invested += total
        elif category == "Emergency Fund":
            emergency_fund += total
        elif category == "Transfers":
            transfers += total
        elif category not in non_spending_categories and int(row["is_income"] or 0) == 0:
            expenses += total

    savings_total = invested + emergency_fund
    savings_rate = round(savings_total / income * 100, 1) if income > 0 else 0
    cashflow_rate = round((income - expenses) / income * 100, 1) if income > 0 else 0
    return {
        "month": month,
        "by_category": by_category,
        "income_total": round(income, 2),
        "expenses_total": round(expenses, 2),
        "invested_total": round(invested, 2),
        "emergency_fund_total": round(emergency_fund, 2),
        "transfers_total": round(transfers, 2),
        "savings_total": round(savings_total, 2),
        "savings_rate": savings_rate,
        "cashflow_rate": cashflow_rate,
    }


def get_budget_months() -> list[str]:
    connection = get_db()
    try:
        rows = connection.execute(
            "SELECT DISTINCT month FROM budget_transactions ORDER BY month DESC"
        ).fetchall()
        return [r["month"] for r in rows]
    finally:
        connection.close()


def get_budget_memory_profile() -> dict[str, Any] | None:
    """Return the stored personal budget memory profile, if one exists."""
    connection = get_db()
    try:
        row = connection.execute(
            "SELECT value_json FROM budget_memory WHERE key = ?",
            ("profile",),
        ).fetchone()
        if row is None:
            return None
        return json.loads(row["value_json"] or "{}")
    except sqlite3.OperationalError:
        # Older local databases may not have the table until init_db runs.
        return None
    finally:
        connection.close()


def save_budget_memory_profile(profile: dict[str, Any]) -> dict[str, Any]:
    """Persist the personal budget memory profile used for classification."""
    now = _utc_now()
    value_json = json.dumps(profile or {}, ensure_ascii=False, sort_keys=True)
    connection = get_db()
    try:
        connection.execute(
            """
            INSERT INTO budget_memory (key, value_json, created_at, updated_at)
            VALUES (?, ?, ?, ?)
            ON CONFLICT(key) DO UPDATE SET
                value_json = excluded.value_json,
                updated_at = excluded.updated_at
            """,
            ("profile", value_json, now, now),
        )
        connection.commit()
        return json.loads(value_json)
    finally:
        connection.close()


def set_persistence_marker(key: str, value: str) -> dict[str, Any]:
    """Upsert a key/value persistence marker; returns the stored row."""
    now = _utc_now()
    connection = get_db()
    try:
        connection.execute(
            """
            INSERT INTO persistence_markers (key, value, created_at, updated_at)
            VALUES (?, ?, ?, ?)
            ON CONFLICT(key) DO UPDATE SET
                value = excluded.value,
                updated_at = excluded.updated_at
            """,
            (key, value, now, now),
        )
        connection.commit()
        row = connection.execute(
            "SELECT * FROM persistence_markers WHERE key = ?", (key,)
        ).fetchone()
        return dict(row)
    finally:
        connection.close()


def get_persistence_marker(key: str) -> dict[str, Any] | None:
    connection = get_db()
    try:
        row = connection.execute(
            "SELECT * FROM persistence_markers WHERE key = ?", (key,)
        ).fetchone()
        return _row_to_dict(row)
    finally:
        connection.close()


def get_database_diagnostics() -> dict[str, Any]:
    """Return safe read-only diagnostics about the local SQLite database."""
    db_exists = DB_PATH.exists()
    db_size = DB_PATH.stat().st_size if db_exists else 0

    connection = get_db()
    try:
        def _count(table: str) -> int:
            try:
                return connection.execute(f"SELECT COUNT(*) FROM {table}").fetchone()[0]
            except Exception:
                return -1

        table_counts = {
            "brief_history": _count("brief_history"),
            "finance_transaction_ledger": _count("finance_transaction_ledger"),
            "persistence_markers": _count("persistence_markers"),
            "budget_transactions": _count("budget_transactions"),
            "meal_log": _count("meal_log"),
            "weight_log": _count("weight_log"),
        }

        try:
            cols = [
                row[1]
                for row in connection.execute(
                    "PRAGMA table_info(finance_transaction_ledger)"
                ).fetchall()
            ]
        except Exception:
            cols = []

        marker = _row_to_dict(
            connection.execute(
                "SELECT * FROM persistence_markers WHERE key = ?",
                ("production_persistence_probe",),
            ).fetchone()
        )
    finally:
        connection.close()

    return {
        "db_path": str(DB_PATH),
        "db_parent": str(DB_PATH.parent),
        "db_parent_exists": DB_PATH.parent.exists(),
        "db_path_source": _DB_PATH_SOURCE,
        "db_exists": db_exists,
        "db_size_bytes": db_size,
        "table_counts": table_counts,
        "finance_transaction_ledger_columns": cols,
        "persistence_marker": marker,
    }


def get_meal_history(days: int = 14, target_calories: float = 2200.0) -> list[dict[str, Any]]:
    """Return one row per day for the last `days` days with daily totals and target_met flag."""
    if days < 1:
        return []
    cutoff = (clock.today() - timedelta(days=days - 1)).isoformat()
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
        d = (clock.today() - timedelta(days=days - 1 - i)).isoformat()
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


def get_latest_weight_kg() -> float | None:
    """Return the most recently logged bodyweight, or None."""
    with get_db() as conn:
        row = conn.execute(
            "SELECT weight_kg FROM weight_log ORDER BY log_date DESC LIMIT 1"
        ).fetchone()
        return float(row["weight_kg"]) if row else None


def log_soreness(score: int) -> int:
    """Log a soreness score (0=fresh, 5=destroyed). Returns row id."""
    with get_db() as conn:
        cur = conn.execute(
            "INSERT INTO soreness_log (score, logged_at) VALUES (?, ?)",
            (score, _utc_now()),
        )
        conn.commit()
        return cur.lastrowid


def get_last_soreness() -> dict[str, Any] | None:
    """Return the most recent soreness entry within the last 24 hours, or None."""
    with get_db() as conn:
        row = conn.execute(
            "SELECT score, logged_at FROM soreness_log ORDER BY logged_at DESC LIMIT 1"
        ).fetchone()
        if not row:
            return None
        logged_at = datetime.fromisoformat(row["logged_at"])
        age_h = (clock.utc_now() - logged_at.replace(tzinfo=timezone.utc)).total_seconds() / 3600
        if age_h > 24:
            return None
        score = int(row["score"])
        pct = int((5 - score) / 5 * 100)
        labels = ["FRESH", "SLIGHT", "MODERATE", "HIGH", "VERY HIGH", "MAX"]
        return {"score": score, "pct": pct, "label": labels[score], "logged_at": row["logged_at"]}


def log_sleep_event(event_type: str) -> int:
    """Log a bedtime or wakeup event. Returns the new row id."""
    with get_db() as conn:
        cur = conn.execute(
            "INSERT INTO sleep_log (event_type, logged_at) VALUES (?, ?)",
            (event_type, _utc_now()),
        )
        conn.commit()
        return cur.lastrowid


def log_sleep_duration(minutes: int) -> dict[str, str]:
    """Log a completed sleep of `minutes` as a backdated bedtime→wakeup pair.

    Lets duration-based clients (the holo sleep dial) reuse the existing
    event-pair schema, so get_last_sleep() and recovery pick it up unchanged.
    """
    wakeup_at = datetime.fromisoformat(_utc_now())
    bedtime_at = wakeup_at - timedelta(minutes=minutes)
    with get_db() as conn:
        conn.execute(
            "INSERT INTO sleep_log (event_type, logged_at) VALUES (?, ?)",
            ("bedtime", bedtime_at.isoformat()),
        )
        conn.execute(
            "INSERT INTO sleep_log (event_type, logged_at) VALUES (?, ?)",
            ("wakeup", wakeup_at.isoformat()),
        )
        conn.commit()
    return {"bedtime": bedtime_at.isoformat(), "wakeup": wakeup_at.isoformat()}


def get_last_sleep() -> dict[str, Any] | None:
    """Return duration info for the most recent completed sleep period (bedtime → wakeup)."""
    with get_db() as conn:
        wakeup_row = conn.execute(
            "SELECT logged_at FROM sleep_log WHERE event_type='wakeup' ORDER BY logged_at DESC LIMIT 1"
        ).fetchone()
        if not wakeup_row:
            return None
        wakeup_at = datetime.fromisoformat(wakeup_row["logged_at"])

        bedtime_row = conn.execute(
            "SELECT logged_at FROM sleep_log WHERE event_type='bedtime' AND logged_at < ? ORDER BY logged_at DESC LIMIT 1",
            (wakeup_row["logged_at"],),
        ).fetchone()
        if not bedtime_row:
            return None
        bedtime_at = datetime.fromisoformat(bedtime_row["logged_at"])

        duration_h = (wakeup_at - bedtime_at).total_seconds() / 3600
        if duration_h <= 0 or duration_h > 16:
            return None

        score = min(100, max(0, int((duration_h / 8.0) * 100)))
        return {
            "bedtime": bedtime_at.isoformat(),
            "wakeup": wakeup_at.isoformat(),
            "duration_hours": round(duration_h, 2),
            "score": score,
        }
