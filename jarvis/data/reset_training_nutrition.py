"""One-off reset: clears logged Training and Nutrition activity only.

Leaves untouched: recipes, nutrition preferences/favorites/pantry
(nutrition_memory), training plan/targets, Finance, Calendar, Budget.

Run against the LIVE Railway database via the Railway CLI, from your
local machine (this injects the real DATABASE/JARVIS_DB_PATH env vars
for you — nothing here hardcodes a connection):

    railway run python jarvis/data/reset_training_nutrition.py

Add --dry-run to only print row counts without deleting anything.
"""

from __future__ import annotations

import sqlite3
import sys

from jarvis.data.database import DB_PATH, _DB_PATH_SOURCE

TABLES = [
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


def main() -> None:
    dry_run = "--dry-run" in sys.argv
    print(f"Using DB_PATH={DB_PATH} (source: {_DB_PATH_SOURCE})")

    conn = sqlite3.connect(DB_PATH)
    cur = conn.cursor()

    print("\nRow counts before:")
    for table in TABLES:
        cur.execute(f"SELECT COUNT(*) FROM {table}")
        print(f"  {table}: {cur.fetchone()[0]}")

    if dry_run:
        print("\n--dry-run set, no changes made.")
        conn.close()
        return

    confirm = input("\nType RESET to permanently clear the tables above: ")
    if confirm.strip() != "RESET":
        print("Aborted, nothing was deleted.")
        conn.close()
        return

    for table in TABLES:
        cur.execute(f"DELETE FROM {table}")
    conn.commit()

    print("\nRow counts after:")
    for table in TABLES:
        cur.execute(f"SELECT COUNT(*) FROM {table}")
        print(f"  {table}: {cur.fetchone()[0]}")

    conn.close()
    print("\nDone. Recipes, nutrition preferences, and training plan/targets were left untouched.")


if __name__ == "__main__":
    main()
