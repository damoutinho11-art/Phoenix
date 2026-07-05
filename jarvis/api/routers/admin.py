"""One-off administrative operations. Not linked from the app UI.

Guarded by the ADMIN_RESET_TOKEN environment variable — if that variable
is not set on the deployment, every endpoint here refuses to run.
"""

from __future__ import annotations

import os

from fastapi import APIRouter, Header, HTTPException

from jarvis.data.database import DB_PATH
import sqlite3

router = APIRouter()

_RESET_TABLES = [
    "meal_log",
    "weight_log",
    "session_log",
    "jump_log",
    "training_readiness_scans",
    "training_capacity_logs",
    "training_jump_balance_logs",
    "sleep_log",
    "soreness_log",
]


def _check_token(x_admin_token: str | None) -> None:
    expected = os.getenv("ADMIN_RESET_TOKEN")
    if not expected:
        raise HTTPException(status_code=503, detail="ADMIN_RESET_TOKEN not configured on this deployment")
    if not x_admin_token or x_admin_token != expected:
        raise HTTPException(status_code=401, detail="Invalid or missing X-Admin-Token header")


@router.post("/reset-training-nutrition")
def reset_training_nutrition(x_admin_token: str | None = Header(default=None)) -> dict:
    """Clear logged Training and Nutrition activity only.

    Leaves untouched: recipes, nutrition preferences/pantry (nutrition_memory),
    training plan/targets, Finance, Budget, Calendar.
    """
    _check_token(x_admin_token)

    conn = sqlite3.connect(DB_PATH)
    cur = conn.cursor()

    before = {}
    for table in _RESET_TABLES:
        cur.execute(f"SELECT COUNT(*) FROM {table}")
        before[table] = cur.fetchone()[0]

    for table in _RESET_TABLES:
        cur.execute(f"DELETE FROM {table}")
    conn.commit()

    after = {}
    for table in _RESET_TABLES:
        cur.execute(f"SELECT COUNT(*) FROM {table}")
        after[table] = cur.fetchone()[0]

    conn.close()

    return {"status": "reset", "rows_deleted": before, "rows_remaining": after}
