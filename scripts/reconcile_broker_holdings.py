"""Reconcile production portfolio positions with owner-reviewed broker screenshots.

Run this yourself; it needs the owner key in the PHOENIX_OWNER_KEY environment
variable and never prints it. Without --apply it only reads production and shows
the diff between what PHOENIX holds and what the screenshots say.

    $env:PHOENIX_OWNER_KEY = "<paste>"          # PowerShell
    python scripts/reconcile_broker_holdings.py --observations docs/private/observations-2026-09-17.json
    python scripts/reconcile_broker_holdings.py --observations ... --apply [--statement path.pdf]

Observations file: a JSON list of
    {"asset": "btc", "broker_symbol": "BTC", "units": 0.00237082,
     "value_eur": 158.40, "screenshot": "C:/path/lhv.png"}
The screenshot is hashed (sha256) and sent as evidence; the image itself is never uploaded.
This corrects data only — it never records a transaction or places an order.
"""
from __future__ import annotations

import argparse
import hashlib
import json
import os
import sys
from pathlib import Path

import requests

DEFAULT_BASE_URL = "https://phoenix-production-1fb2.up.railway.app"


def sha256_of(path: str) -> str:
    return hashlib.sha256(Path(path).read_bytes()).hexdigest()


def load_observations(path: str) -> list[dict]:
    rows = json.loads(Path(path).read_text(encoding="utf-8"))
    required = {"asset", "broker_symbol", "units", "value_eur", "screenshot"}
    for row in rows:
        missing = required - set(row)
        if missing:
            raise SystemExit(f"observation {row.get('asset')!r} is missing {sorted(missing)}")
        if not Path(row["screenshot"]).is_file():
            raise SystemExit(f"screenshot not found for {row['asset']}: {row['screenshot']}")
    return rows


class Phoenix:
    def __init__(self, base_url: str, key: str) -> None:
        self.base_url = base_url.rstrip("/")
        self.session = requests.Session()
        self.session.headers["Authorization"] = f"Bearer {key}"

    def get(self, path: str) -> dict:
        response = self.session.get(f"{self.base_url}{path}", timeout=60)
        response.raise_for_status()
        return response.json()

    def post(self, path: str, payload: dict | None = None, **kwargs) -> dict:
        response = self.session.post(f"{self.base_url}{path}", json=payload, timeout=180, **kwargs)
        if response.status_code >= 400:
            raise SystemExit(f"{path} -> {response.status_code}: {response.text[:400]}")
        return response.json()


def current_units(state: dict, asset: str) -> tuple[float | None, float | None]:
    positions = state.get("positions", {}).get(asset) or {}
    if positions:
        units = sum(p.get("units", 0) for p in positions.values())
        value = sum(p.get("value_eur", 0) for p in positions.values())
        return units, value
    value = state.get("holdings", {}).get(asset)
    if value is None:
        value = state.get("legacy_holdings", {}).get(asset)
    return state.get("units", {}).get(asset), value


def show_diff(state: dict, observations: list[dict]) -> None:
    print(f"production as_of={state.get('as_of')} prices_refreshed_at={state.get('prices_refreshed_at')}")
    print(f"{'asset':28} {'prod units':>14} {'obs units':>14} {'prod EUR':>10} {'obs EUR':>10}")
    for row in observations:
        units, value = current_units(state, row["asset"])
        flag = "" if units is not None and abs(units - row["units"]) < 1e-9 else "  <- differs"
        print(f"{row['asset']:28} {units if units is not None else '-':>14} {row['units']:>14} "
              f"{value if value is not None else '-':>10} {row['value_eur']:>10}{flag}")


def apply(api: Phoenix, observations: list[dict]) -> None:
    for row in observations:
        result = api.post("/finance/portfolio-state/patch-units", {
            "asset": row["asset"],
            "units": row["units"],
            "holdings_eur": row["value_eur"],
            "broker_symbol": row["broker_symbol"],
            "evidence_sha256": sha256_of(row["screenshot"]),
            "reason": "Broker screenshot reconciliation",
        })
        print(f"patched {row['asset']}: units {result.get('units_before')} -> {result.get('units_after')}")
    refreshed = api.post("/finance/refresh-prices")
    print(f"refresh-prices: as_of={refreshed.get('as_of')} failed={refreshed.get('failed')} "
          f"needs_units={refreshed.get('needs_units')}")


def upload_statement(api: Phoenix, pdf_path: str) -> None:
    with open(pdf_path, "rb") as handle:
        parsed = api.post("/budget/parse-pdf", files={"file": (Path(pdf_path).name, handle, "application/pdf")})
    quality = parsed.get("quality", {})
    print(f"statement parser={parsed.get('parser')} rows={parsed.get('count')} status={quality.get('status')} "
          f"end={quality.get('statement_end_date')} warnings={quality.get('warnings')}")
    receipt = parsed.get("receipt_id")
    if not receipt:
        print("statement is not reconciled; not saved. Review it in the Budget page instead.")
        return
    saved = api.post("/budget/save", {"transactions": parsed["transactions"], "statement_receipt_id": receipt})
    print(f"statement saved: {saved}")


def summarize_recommendation(api: Phoenix) -> None:
    rec = api.get("/finance/recommendation")
    print(f"\n{rec.get('week_label')} mode={rec.get('portfolio_mode')} data_ready={rec.get('data_ready')}")
    for warning in rec.get("warnings") or []:
        print(f"  warning: {warning}")
    for leg in rec.get("recommendations") or []:
        symbol = ((leg.get("instrument") or {}).get("resolved_candidate") or {}).get("symbol")
        print(f"  {leg.get('asset')}: EUR {leg.get('amount')} {symbol or ''}")
    for lane, info in (rec.get("buy_selection") or {}).get("lanes", {}).items():
        print(f"  lane {lane}: {info.get('status')} {info.get('selected') or ''} {info.get('reason') or ''}")


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--observations", required=True)
    parser.add_argument("--base-url", default=DEFAULT_BASE_URL)
    parser.add_argument("--apply", action="store_true", help="write corrections to production")
    parser.add_argument("--statement", help="reconciled LHV statement PDF to import for cash-flow authority")
    args = parser.parse_args()

    key = os.environ.get("PHOENIX_OWNER_KEY", "").strip()
    if not key:
        print("PHOENIX_OWNER_KEY is not set.", file=sys.stderr)
        return 2
    observations = load_observations(args.observations)
    api = Phoenix(args.base_url, key)

    show_diff(api.get("/finance/portfolio-state"), observations)
    if not args.apply:
        print("\ndry run only; rerun with --apply to write these corrections.")
        return 0
    apply(api, observations)
    if args.statement:
        upload_statement(api, args.statement)
    show_diff(api.get("/finance/portfolio-state"), observations)
    summarize_recommendation(api)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
