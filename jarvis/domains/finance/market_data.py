"""Live market price fetcher for J.A.R.V.I.S. portfolio.

Architecture: only this module makes yfinance network calls.
The allocation engine (engine.py) stays pure / offline. Only the router
calls this module.
"""
from __future__ import annotations

import logging
from copy import deepcopy
from datetime import date
from typing import Any

log = logging.getLogger(__name__)

# Maps portfolio_state keys → Yahoo Finance ticker symbols.
# Active ETF sleeves that are currently zero-balance are included so prices
# are always available when the user starts buying.
TICKER_MAP: dict[str, str] = {
    # Crypto
    "btc":  "BTC-EUR",
    "hype": "HYPE-EUR",
    "tao":  "TAO-EUR",
    # Active ETF sleeves (Lightyear — not yet funded)
    "global_core_etf":   "VWCE.DE",
    "growth_nasdaq_etf": "CNDX.L",
    "quality_etf":       "IWQU.L",
    # Legacy LHV Growth holdings
    "lhv_growth_sxr8":           "SXR8.DE",
    "lhv_growth_iemm":           "IEEM.L",   # IEMM.L is delisted; IEEM.L is live
    "lhv_growth_xcha":           "XCHA.L",
    "lhv_growth_world_equities": "SWRD.L",
    "lhv_growth_euro_bond":      "IEAG.L",
}

# Keys that have no meaningful market price (cash / reserved slots)
_SKIP_KEYS = frozenset(
    {"tactical_reserve", "discovery", "lhv_growth_cash_pending_settlement"}
)


def _convert_to_eur(price: float, currency: str, fx: dict[str, float]) -> float | None:
    """Convert a raw yfinance price to EUR.

    Handles EUR (no-op), GBp/GBX (London pence → GBP → EUR),
    GBP (→ EUR) and USD (→ EUR).  Returns None for unknown currencies.
    """
    c = (currency or "").strip()
    if c == "EUR":
        return price
    if c in ("GBp", "GBX"):          # pence — divide by 100 first
        return (price / 100.0) * fx.get("GBPEUR", 1.0)
    if c == "GBP":
        return price * fx.get("GBPEUR", 1.0)
    if c == "USD":
        return price * fx.get("USDEUR", 1.0)
    log.warning("Unknown currency %r — cannot convert to EUR", c)
    return None


def _fetch_fx_rates() -> dict[str, float]:
    """Fetch GBP→EUR and USD→EUR FX rates from Yahoo Finance.

    Returns an empty dict on total failure so callers can gracefully degrade.
    """
    try:
        import yfinance as yf
    except ImportError:
        log.error("yfinance not installed")
        return {}

    rates: dict[str, float] = {}
    for pair, key in [("GBPEUR=X", "GBPEUR"), ("USDEUR=X", "USDEUR")]:
        try:
            rates[key] = float(yf.Ticker(pair).fast_info.last_price)
        except Exception as exc:
            log.warning("FX rate fetch failed for %s: %s", pair, exc)
    return rates


def fetch_current_prices(keys: list[str]) -> tuple[dict[str, float], list[str]]:
    """Fetch live EUR prices per unit for the given portfolio_state keys.

    Returns
    -------
    prices_eur : {key: EUR_per_unit} for every key that succeeded
    failed     : list of keys that failed (caller keeps existing EUR value)
    """
    try:
        import yfinance as yf
    except ImportError:
        log.error("yfinance is not installed — run: pip install yfinance")
        return {}, list(keys)

    fx = _fetch_fx_rates()
    prices_eur: dict[str, float] = {}
    failed: list[str] = []

    for key in keys:
        if key in _SKIP_KEYS:
            continue

        symbol = TICKER_MAP.get(key)
        if not symbol:
            log.debug("No ticker mapping for %r — skipping", key)
            continue

        try:
            info = yf.Ticker(symbol).fast_info
            raw_price = float(info.last_price)
            currency = str(getattr(info, "currency", "") or "")

            eur_price = _convert_to_eur(raw_price, currency, fx)
            if eur_price is None:
                failed.append(key)
                continue

            prices_eur[key] = round(eur_price, 6)
            log.info(
                "%-32s %-12s %10.4f %-5s → EUR %10.4f",
                key, symbol, raw_price, currency, eur_price,
            )

        except Exception as exc:
            log.warning("Price fetch failed for %r (%s): %s", key, symbol, exc)
            failed.append(key)

    return prices_eur, failed


def detect_market_regime(portfolio_state: dict[str, Any] | None = None) -> str:  # noqa: ARG001
    """Detect market regime using live VIX from yfinance.

    Returns 'risk_on' (VIX < 20), 'risk_off' (VIX 20-30), or 'drawdown' (VIX > 30).
    Falls back to 'risk_on' on any network or data error so the engine always runs.
    """
    try:
        import yfinance as yf
        vix = float(yf.Ticker("^VIX").fast_info.last_price)
        log.info("VIX fetched: %.2f", vix)
    except Exception as exc:
        log.warning("VIX fetch failed (%s) — defaulting to risk_on", exc)
        return "risk_on"

    if vix > 30:
        return "drawdown"
    if vix >= 20:
        return "risk_off"
    return "risk_on"


def update_portfolio_state_prices(
    portfolio_state: dict[str, Any],
    constitution: dict[str, Any],  # noqa: ARG001 — reserved for future constitution rules
) -> tuple[dict[str, Any], dict[str, Any]]:
    """Fetch live prices and update EUR holdings values in portfolio_state.

    Holdings are updated only when a ``units`` entry exists in portfolio_state
    for that key (units = number of coins / shares held). Keys without units
    are reported in ``needs_units`` but are not modified — their existing EUR
    value is preserved.

    Returns
    -------
    updated_state : refreshed deepcopy of portfolio_state
    metadata      : {prices_fetched, holdings_updated, needs_units, failed}
    """
    updated = deepcopy(portfolio_state)
    units: dict[str, Any] = portfolio_state.get("units", {})

    all_keys = (
        list(portfolio_state.get("holdings", {}).keys())
        + list(portfolio_state.get("legacy_holdings", {}).keys())
    )

    prices_eur, failed = fetch_current_prices(all_keys)

    holdings_updated: list[str] = []
    needs_units: list[str] = []

    for key, eur_price in prices_eur.items():
        unit_count = units.get(key)
        if unit_count is None:
            needs_units.append(key)
            continue

        new_value = round(float(unit_count) * eur_price, 2)

        if key in updated.get("holdings", {}):
            updated["holdings"][key] = new_value
            holdings_updated.append(key)
        elif key in updated.get("legacy_holdings", {}):
            updated["legacy_holdings"][key] = new_value
            holdings_updated.append(key)

    updated["as_of"] = date.today().isoformat()

    return updated, {
        "prices_fetched": {k: round(v, 4) for k, v in prices_eur.items()},
        "holdings_updated": holdings_updated,
        "needs_units": needs_units,
        "failed": failed,
    }
