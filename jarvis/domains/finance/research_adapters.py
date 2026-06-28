"""Read-only source adapters for PHOENIX research evidence.

Adapters fetch externally-available data in read-only mode and create or update
validation records using the same repair-aware logic as generate-evidence.

Safety guarantees:
- No broker execution, no orders, no API keys required.
- No portfolio_state.json mutation.
- No recommendation amounts or routes changed.
- No investment approval, no BUY_CANDIDATE auto-assignment.
"""

from datetime import datetime, timezone
from typing import Any

from jarvis.data import database

try:
    import yfinance as yf

    _YFINANCE_AVAILABLE = True
except Exception:
    yf = None  # type: ignore[assignment]
    _YFINANCE_AVAILABLE = False

_PHOENIX_ADAPTER_MARKER = "PHOENIX_EVIDENCE_GENERATOR_V1"

_CRYPTO_SYMBOL_MAP: dict[str, str] = {
    "btc": "BTC-USD",
    "hype": "HYPE-USD",
    "tao": "TAO-USD",
}


def _utc_now_str() -> str:
    return datetime.now(timezone.utc).isoformat()


def _is_adapter_generated(record: dict) -> bool:
    raw = record.get("raw_json") or {}
    if raw.get("generated_by") == _PHOENIX_ADAPTER_MARKER:
        return True
    return (record.get("source_primary") or "").startswith("PHOENIX")


def _upsert_validation_record(check: dict) -> dict[str, Any]:
    """Create or update a PHOENIX-generated validation record.

    Manual records (no marker, no PHOENIX prefix in source_primary) are never
    overwritten. Returns the final record dict.
    """
    memo_id = check["memo_id"]
    check_type = check["check_type"]
    field_name = check["field_name"]

    existing = database.get_research_validation_record_by_memo_check_field(
        memo_id, check_type, field_name
    )
    if existing is None:
        record_id = database.create_research_validation_record(check)
        return database.get_research_validation_record(record_id) or {}
    elif _is_adapter_generated(existing):
        _compare = ("status", "confidence", "primary_value", "notes", "source_primary")
        changed = any(existing.get(f) != check.get(f) for f in _compare)
        if changed:
            database.update_research_validation_record(existing["id"], check)
            return database.get_research_validation_record(existing["id"]) or {}
        return existing
    else:
        # Manual/user record — never overwrite
        return existing


def run_crypto_price_adapter(memo_id: int, asset: str) -> dict[str, Any]:
    """Attempt a read-only price fetch for a crypto asset.

    If successful, updates the market_data_source evidence record to PASS.
    If unavailable or the fetch fails, keeps or creates an UNVERIFIED record.
    No broker connection, no API keys, no orders executed.
    """
    symbol = _CRYPTO_SYMBOL_MAP.get(asset.lower(), f"{asset.upper()}-USD")
    fetch_status = "unknown"
    price: float | None = None
    status = "UNVERIFIED"
    confidence = "medium"
    notes_detail = ""

    if not _YFINANCE_AVAILABLE or yf is None:
        fetch_status = "unavailable"
        notes_detail = "yfinance not available in this environment."
    else:
        try:
            ticker = yf.Ticker(symbol)
            hist = ticker.history(period="2d")
            if hist is not None and not hist.empty:
                price = float(hist["Close"].iloc[-1])
                fetch_status = "success"
                status = "PASS"
                confidence = "high"
                notes_detail = (
                    f"Read-only price fetch succeeded: {symbol} "
                    f"last close = {price:.4f} USD."
                )
            else:
                fetch_status = "no_data"
                notes_detail = f"yfinance returned no history for {symbol}."
        except Exception as exc:
            fetch_status = "error"
            notes_detail = f"Price fetch failed for {symbol}: {type(exc).__name__}."

    raw_json: dict = {
        "generated_by": _PHOENIX_ADAPTER_MARKER,
        "adapter": "crypto_price_adapter_v1",
        "asset": asset,
        "symbol": symbol,
        "source": "yfinance",
        "fetch_status": fetch_status,
        "timestamp": _utc_now_str(),
        "price_usd": price,
    }
    check: dict = {
        "memo_id": memo_id,
        "asset": asset,
        "check_type": "SOURCE_CONFIDENCE",
        "field_name": "market_data_source",
        "source_primary": "PHOENIX crypto price adapter / yfinance",
        "source_secondary": None,
        "primary_value": f"{symbol}={price:.4f}" if price is not None else None,
        "secondary_value": None,
        "consensus_value": f"{symbol}={price:.4f}" if price is not None else None,
        "tolerance_pct": None,
        "deviation_pct": None,
        "status": status,
        "confidence": confidence,
        "notes": (
            f"Crypto price adapter: {notes_detail} "
            "No broker connection. Read-only."
        ),
        "raw_json": raw_json,
    }
    record = _upsert_validation_record(check)
    return {
        "adapter": "crypto_price_adapter_v1",
        "asset": asset,
        "symbol": symbol,
        "fetch_status": fetch_status,
        "price_usd": price,
        "record_status": status,
        "validation_record": record,
    }


def run_etf_source_adapter(
    memo_id: int,
    asset: str,
    constitution: dict,
    etf_universe: dict | None = None,
    resolved_candidate: dict | None = None,
) -> list[dict[str, Any]]:
    """Bind ETF evidence to the current read-only resolved candidate.

    Creates or updates market_data_source and broker_source records.
    No broker API calls. Candidate quote/catalogue results are supplied by the
    existing fail-soft resolver.
    """
    asset_routes = constitution.get("asset_routes", {})
    route = asset_routes.get(asset)
    results: list[dict] = []

    # Resolve ETF ticker/name from universe if available
    ticker_symbol: str | None = None
    etf_name: str | None = None
    if resolved_candidate:
        ticker_symbol = resolved_candidate.get("symbol")
        etf_name = resolved_candidate.get("label")
    elif etf_universe:
        sleeve_data = etf_universe.get(asset)
        if isinstance(sleeve_data, dict):
            candidates = sleeve_data.get("candidates") or []
            if candidates and isinstance(candidates[0], dict):
                ticker_symbol = (
                    candidates[0].get("ticker") or candidates[0].get("symbol")
                )
                etf_name = candidates[0].get("name") or candidates[0].get("label")

    # Record A: market_data_source
    market_fetch_status = (
        resolved_candidate.get("fetch_status") if resolved_candidate else None
    )
    market_status = (
        "PASS" if ticker_symbol and market_fetch_status == "ok" else "UNVERIFIED"
    )
    raw_mds: dict = {
        "generated_by": _PHOENIX_ADAPTER_MARKER,
        "adapter": "etf_source_adapter_v1",
        "asset": asset,
        "source": "yfinance",
        "ticker": ticker_symbol,
        "etf_name": etf_name,
        "fetch_status": market_fetch_status or "no_current_candidate",
        "timestamp": _utc_now_str(),
    }
    check_mds: dict = {
        "memo_id": memo_id,
        "asset": asset,
        "check_type": "SOURCE_CONFIDENCE",
        "field_name": "market_data_source",
        "source_primary": "PHOENIX ETF source adapter / yfinance",
        "source_secondary": None,
        "primary_value": ticker_symbol or "yfinance",
        "secondary_value": etf_name,
        "consensus_value": "yfinance",
        "tolerance_pct": None,
        "deviation_pct": None,
        "status": market_status,
        "confidence": "high" if market_status == "PASS" else "low",
        "notes": (
            f"ETF source adapter: current resolved instrument for '{asset}'. "
            + (f"Resolved ticker: {ticker_symbol}. " if ticker_symbol else "No current ticker. ")
            + f"Quote fetch status: {market_fetch_status or 'unavailable'}. "
            + "No broker connection. Read-only."
        ),
        "raw_json": raw_mds,
    }
    record_mds = _upsert_validation_record(check_mds)
    results.append({
        "adapter": "etf_source_adapter_v1",
        "check": "market_data_source",
        "asset": asset,
        "status": market_status,
        "validation_record": record_mds,
    })

    # Record B: broker_source
    broker_verified = bool(
        resolved_candidate
        and resolved_candidate.get("lightyear_available") is True
        and resolved_candidate.get("lightyear_confidence") == "high"
    )
    broker_status = "PASS" if broker_verified else "UNVERIFIED"
    broker_confidence = "high" if broker_verified else "low"
    raw_bs: dict = {
        "generated_by": _PHOENIX_ADAPTER_MARKER,
        "adapter": "etf_source_adapter_v1",
        "asset": asset,
        "route": route,
        "ticker": ticker_symbol,
        "fetch_status": "verified" if broker_verified else "not_verified",
        "timestamp": _utc_now_str(),
    }
    check_bs: dict = {
        "memo_id": memo_id,
        "asset": asset,
        "check_type": "SOURCE_CONFIDENCE",
        "field_name": "broker_source",
        "source_primary": "PHOENIX ETF source adapter / Lightyear public catalogue",
        "source_secondary": None,
        "primary_value": route,
        "secondary_value": None,
        "consensus_value": route,
        "tolerance_pct": None,
        "deviation_pct": None,
        "status": broker_status,
        "confidence": broker_confidence,
        "notes": (
            f"ETF source adapter: {ticker_symbol} verified in the Lightyear public catalogue."
            if broker_verified
            else f"ETF source adapter: current instrument {ticker_symbol or 'unknown'} is not public-catalogue verified."
        )
        + " No broker API called. Read-only.",
        "raw_json": raw_bs,
    }
    record_bs = _upsert_validation_record(check_bs)
    results.append({
        "adapter": "etf_source_adapter_v1",
        "check": "broker_source",
        "asset": asset,
        "status": broker_status,
        "validation_record": record_bs,
    })

    return results
