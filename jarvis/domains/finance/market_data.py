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

# Candidate instruments are evaluated separately from TICKER_MAP so existing
# portfolio refresh behavior remains backward-compatible.
ETF_CANDIDATE_TICKERS: dict[str, list[dict[str, Any]]] = {
    "global_core_etf": [
        {"sleeve": "global_core_etf", "symbol": "VWCE.DE", "label": "Vanguard FTSE All-World UCITS ETF", "keywords": ["VWCE", "FTSE All-World"], "provider": "Vanguard", "benchmark": "FTSE All-World", "income_treatment": "accumulating", "listing_hint": "Xetra / EUR", "region_exposure": "global developed and emerging markets"},
        {"sleeve": "global_core_etf", "symbol": "SPYI.DE", "label": "State Street SPDR MSCI ACWI IMI UCITS ETF", "keywords": ["SPYI", "ACWI IMI"], "provider": "State Street", "benchmark": "MSCI ACWI IMI", "income_treatment": "accumulating", "listing_hint": "Xetra / EUR", "region_exposure": "global developed and emerging markets"},
        {"sleeve": "global_core_etf", "symbol": "IWDA.L", "label": "iShares Core MSCI World UCITS ETF", "keywords": ["IWDA", "MSCI World"], "provider": "iShares", "benchmark": "MSCI World", "income_treatment": "accumulating", "listing_hint": "London Stock Exchange", "region_exposure": "developed markets"},
        {"sleeve": "global_core_etf", "symbol": "SWRD.L", "label": "State Street SPDR MSCI World UCITS ETF", "keywords": ["SWRD", "MSCI World"], "provider": "State Street", "benchmark": "MSCI World", "income_treatment": "accumulating", "listing_hint": "London Stock Exchange", "region_exposure": "developed markets"},
        {"sleeve": "global_core_etf", "symbol": "VWRL.L", "label": "Vanguard FTSE All-World UCITS ETF", "keywords": ["VWRL", "FTSE All-World"], "provider": "Vanguard", "benchmark": "FTSE All-World", "income_treatment": "distributing", "listing_hint": "London Stock Exchange / GBP", "region_exposure": "global developed and emerging markets"},
        {"sleeve": "global_core_etf", "symbol": "IUSQ.DE", "label": "iShares MSCI ACWI UCITS ETF", "keywords": ["IUSQ", "MSCI ACWI"], "provider": "iShares", "benchmark": "MSCI ACWI", "income_treatment": "accumulating", "listing_hint": "Xetra / EUR", "region_exposure": "global developed and emerging markets"},
        {"sleeve": "global_core_etf", "symbol": "IMID.L", "label": "State Street SPDR MSCI ACWI IMI UCITS ETF", "keywords": ["IMID", "ACWI IMI"], "provider": "State Street", "benchmark": "MSCI ACWI IMI", "income_treatment": "accumulating", "listing_hint": "London Stock Exchange / USD", "region_exposure": "global developed and emerging markets"},
        {"sleeve": "global_core_etf", "symbol": "SSAC.L", "label": "iShares MSCI ACWI UCITS ETF", "keywords": ["SSAC", "MSCI ACWI"], "provider": "iShares", "benchmark": "MSCI ACWI", "income_treatment": "accumulating", "listing_hint": "London Stock Exchange", "region_exposure": "global developed and emerging markets"},
    ],
    "growth_nasdaq_etf": [
        {"sleeve": "growth_nasdaq_etf", "symbol": "CNDX.L", "label": "iShares Nasdaq 100 UCITS ETF", "keywords": ["CNDX", "Nasdaq 100", "Nasdaq-100"], "provider": "iShares", "benchmark": "NASDAQ-100", "income_treatment": "accumulating", "listing_hint": "London Stock Exchange", "region_exposure": "Nasdaq-listed large-cap non-financial companies"},
        {"sleeve": "growth_nasdaq_etf", "symbol": "EQQQ.L", "label": "Invesco EQQQ Nasdaq-100 UCITS ETF", "keywords": ["EQQQ", "Nasdaq 100", "Nasdaq-100"], "provider": "Invesco", "benchmark": "NASDAQ-100", "income_treatment": "distributing", "listing_hint": "London Stock Exchange", "region_exposure": "Nasdaq-listed large-cap non-financial companies"},
        {"sleeve": "growth_nasdaq_etf", "symbol": "SXRV.DE", "label": "iShares Nasdaq 100 UCITS ETF", "keywords": ["SXRV", "Nasdaq 100", "Nasdaq-100"], "provider": "iShares", "benchmark": "NASDAQ-100", "income_treatment": "accumulating", "listing_hint": "Xetra / EUR", "region_exposure": "Nasdaq-listed large-cap non-financial companies"},
        {"sleeve": "growth_nasdaq_etf", "symbol": "EQAC.MI", "label": "Invesco EQQQ Nasdaq-100 UCITS ETF Acc", "keywords": ["EQAC", "EQQQ", "Nasdaq-100"], "provider": "Invesco", "benchmark": "NASDAQ-100", "income_treatment": "accumulating", "listing_hint": "Borsa Italiana / EUR", "region_exposure": "Nasdaq-listed large-cap non-financial companies"},
        {"sleeve": "growth_nasdaq_etf", "symbol": "XNAS.DE", "label": "Xtrackers Nasdaq 100 UCITS ETF", "keywords": ["XNAS", "Nasdaq 100", "Nasdaq-100"], "provider": "Xtrackers", "benchmark": "NASDAQ-100", "income_treatment": "accumulating", "listing_hint": "Xetra / EUR", "region_exposure": "Nasdaq-listed large-cap non-financial companies"},
    ],
    "quality_etf": [
        {"sleeve": "quality_etf", "symbol": "IWQU.L", "label": "iShares Edge MSCI World Quality Factor UCITS ETF", "keywords": ["IWQU", "MSCI World Quality", "Quality Factor"], "provider": "iShares", "benchmark": "MSCI World quality factor", "income_treatment": "accumulating", "listing_hint": "London Stock Exchange / USD", "region_exposure": "developed-market quality equities"},
        {"sleeve": "quality_etf", "symbol": "XDEQ.DE", "label": "Xtrackers MSCI World Quality UCITS ETF", "keywords": ["XDEQ", "MSCI World Quality", "Quality"], "provider": "Xtrackers", "benchmark": "MSCI World quality factor", "income_treatment": "accumulating", "listing_hint": "Xetra / EUR", "region_exposure": "developed-market quality equities"},
        {"sleeve": "quality_etf", "symbol": "IWFQ.L", "label": "iShares Edge MSCI World Quality Factor UCITS ETF", "keywords": ["IWFQ", "MSCI World Quality", "Quality Factor"], "provider": "iShares", "benchmark": "MSCI World quality factor", "income_treatment": "accumulating", "listing_hint": "London Stock Exchange / GBP", "region_exposure": "developed-market quality equities"},
        {"sleeve": "quality_etf", "symbol": "IS3Q.DE", "label": "iShares Edge MSCI World Quality Factor UCITS ETF", "keywords": ["IS3Q", "MSCI World Quality", "Quality Factor"], "provider": "iShares", "benchmark": "MSCI World quality factor", "income_treatment": "accumulating", "listing_hint": "Xetra / EUR", "region_exposure": "developed-market quality equities"},
        {"sleeve": "quality_etf", "symbol": "IWQE.AS", "label": "iShares MSCI World Quality Factor Advanced UCITS ETF", "keywords": ["IWQE", "MSCI World Quality Advanced", "Quality Factor"], "provider": "iShares", "benchmark": "MSCI World Quality Advanced Select", "income_treatment": "accumulating", "listing_hint": "Euronext Amsterdam / USD", "region_exposure": "developed-market quality equities"},
    ],
}

# Optional research universe only. The allocation engine does not consume this
# mapping, so adding a company here cannot create or alter a recommendation.
STOCK_RESEARCH_CANDIDATES: dict[str, dict[str, str]] = {
    "msft": {"symbol": "MSFT", "label": "Microsoft"},
    "nvda": {"symbol": "NVDA", "label": "NVIDIA"},
    "goog": {"symbol": "GOOGL", "label": "Alphabet Class A"},
    "amzn": {"symbol": "AMZN", "label": "Amazon"},
    "meta": {"symbol": "META", "label": "Meta Platforms"},
    "novo_b": {"symbol": "NOVO-B.CO", "label": "Novo Nordisk Class B"},
    "asml": {"symbol": "ASML.AS", "label": "ASML Holding"},
    "lly": {"symbol": "LLY", "label": "Eli Lilly"},
    "brk_b": {"symbol": "BRK-B", "label": "Berkshire Hathaway Class B"},
    "tsm": {"symbol": "TSM", "label": "Taiwan Semiconductor Manufacturing ADR"},
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


def fetch_etf_candidate_quotes(sleeve_key: str) -> dict[str, Any]:
    """Fetch every configured ETF candidate without failing the whole sleeve."""
    configured = ETF_CANDIDATE_TICKERS.get(sleeve_key, [])
    try:
        import yfinance as yf
    except ImportError as exc:
        return {
            "sleeve_key": sleeve_key,
            "source": "yfinance",
            "candidates": [
                {
                    **candidate,
                    "raw_price": None,
                    "currency": None,
                    "eur_price": None,
                    "market_data_source": "yfinance",
                    "fetch_status": "failed",
                    "error": str(exc),
                }
                for candidate in configured
            ],
        }

    fx = _fetch_fx_rates()
    candidates: list[dict[str, Any]] = []
    for candidate in configured:
        quote = {
            **candidate,
            "raw_price": None,
            "currency": None,
            "eur_price": None,
            "market_data_source": "yfinance",
            "fetch_status": "failed",
        }
        try:
            info = yf.Ticker(candidate["symbol"]).fast_info
            raw_value = getattr(info, "last_price", None)
            if raw_value is None and hasattr(info, "get"):
                raw_value = info.get("last_price")
            currency_value = getattr(info, "currency", None)
            if currency_value is None and hasattr(info, "get"):
                currency_value = info.get("currency")
            raw_price = float(raw_value)
            if raw_price <= 0:
                raise ValueError("non-positive market price")
            currency = str(currency_value or "")
            eur_price = _convert_to_eur(raw_price, currency, fx)
            quote.update(
                raw_price=round(raw_price, 6),
                currency=currency or None,
                eur_price=round(eur_price, 6) if eur_price is not None else None,
                fetch_status="ok",
            )
        except Exception as exc:
            quote["error"] = str(exc)
            log.warning("ETF candidate fetch failed for %s: %s", candidate["symbol"], exc)
        candidates.append(quote)

    return {"sleeve_key": sleeve_key, "source": "yfinance", "candidates": candidates}


def _score_candidate(candidate: dict[str, Any], index: int) -> dict[str, Any]:
    fetched_price = candidate.get("fetch_status") == "ok" and candidate.get("raw_price") is not None
    eur_currency = candidate.get("currency") == "EUR"
    has_eur_price = candidate.get("eur_price") is not None
    components = {
        "fetched_price": 100 if fetched_price else 0,
        "eur_currency": 20 if eur_currency else 0,
        "eur_price": 10 if has_eur_price else 0,
        "configured_order": index,
    }
    components["total_score"] = components["fetched_price"] + components["eur_currency"] + components["eur_price"]
    return components


def resolve_best_yfinance_candidate(sleeve_key: str) -> dict[str, Any]:
    """Select a market-data candidate deterministically; broker remains unverified."""
    result = fetch_etf_candidate_quotes(sleeve_key)
    candidates = []
    for index, candidate in enumerate(result.get("candidates", [])):
        components = _score_candidate(candidate, index)
        candidates.append({**candidate, "score_components": components, "selected": False})

    eligible = [candidate for candidate in candidates if candidate["score_components"]["fetched_price"] > 0]
    selected = min(
        eligible,
        key=lambda candidate: (
            -candidate["score_components"]["total_score"],
            candidate["score_components"]["configured_order"],
        ),
        default=None,
    )
    if selected:
        selected["selected"] = True
        if selected.get("currency") == "EUR" and selected.get("eur_price") is not None:
            confidence = "high"
        elif selected.get("eur_price") is not None:
            confidence = "medium"
        else:
            confidence = "low"
        reason = (
            f"Selected {selected['symbol']} from available yfinance quotes using "
            "EUR currency, EUR-convertible price, and configured order."
        )
    else:
        confidence = "unresolved"
        reason = "No ETF candidate returned a usable yfinance price."

    return {
        "sleeve_key": sleeve_key,
        "selected_symbol": selected.get("symbol") if selected else None,
        "selected_label": selected.get("label") if selected else None,
        "candidates": candidates,
        "confidence": confidence,
        "source": "yfinance",
        "broker_verification": "not_verified",
        "confirmation_required": True,
        "reason": reason,
    }


def resolve_best_etf_candidate_with_broker_check(sleeve_key: str) -> dict[str, Any]:
    """Combine yfinance quotes with fail-soft public Lightyear verification."""
    from .lightyear_catalog import verify_lightyear_candidates

    market = resolve_best_yfinance_candidate(sleeve_key)
    broker = verify_lightyear_candidates(market.get("candidates", []))
    broker_by_symbol = {
        candidate.get("symbol"): candidate
        for candidate in broker.get("candidates", [])
        if candidate.get("symbol")
    }
    combined = []
    for candidate in market.get("candidates", []):
        broker_data = broker_by_symbol.get(candidate.get("symbol"), {})
        combined.append({**candidate, **broker_data, "selected": False})

    eligible = [candidate for candidate in combined if candidate.get("fetch_status") == "ok"]
    selected = min(
        eligible,
        key=lambda candidate: (
            -int(candidate.get("lightyear_available") is True and candidate.get("lightyear_confidence") == "high"),
            -candidate.get("score_components", {}).get("total_score", 0),
            candidate.get("score_components", {}).get("configured_order", 999),
        ),
        default=None,
    )
    if selected:
        selected["selected"] = True
    verified = bool(
        selected
        and selected.get("lightyear_available") is True
        and selected.get("lightyear_confidence") == "high"
    )
    reason = (
        f"Selected {selected['symbol']} with yfinance market data and high-confidence Lightyear catalogue verification."
        if verified
        else (
            f"Selected {selected['symbol']} from yfinance; Lightyear availability is not verified."
            if selected
            else "No ETF candidate returned a usable yfinance price."
        )
    )
    for candidate in combined:
        if candidate.get("fetch_status") != "ok":
            candidate["reason"] = f"Market data fetch failed: {candidate.get('error', 'unknown error')}"
        elif candidate is selected:
            candidate["reason"] = reason
        elif verified and not (
            candidate.get("lightyear_available") is True
            and candidate.get("lightyear_confidence") == "high"
        ):
            candidate["reason"] = "Not selected: another candidate has high-confidence Lightyear verification."
        else:
            candidate["reason"] = "Not selected: lower deterministic market-data score or configured-order tie-break."
    return {
        **market,
        "selected_symbol": selected.get("symbol") if selected else None,
        "selected_label": selected.get("label") if selected else None,
        "selected_candidate": dict(selected) if selected else None,
        "candidates": combined,
        "confidence": (
            "high"
            if verified
            else market.get("confidence", "unresolved")
        ),
        "broker_source": "lightyear_public_fund_screener",
        "broker_verification": "verified" if verified else "not_verified",
        "confirmation_required": True,
        "lightyear_available": True if verified else "unknown",
        "reason": reason,
    }


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
