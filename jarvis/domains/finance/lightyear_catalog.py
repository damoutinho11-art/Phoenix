"""Fail-soft verification against Lightyear's public fund catalogue.

This module uses public, unauthenticated ETF pages only. It never logs in,
accepts credentials, or calls order/execution APIs.
"""

from __future__ import annotations

import html
import re
from concurrent.futures import ThreadPoolExecutor
from typing import Any
from urllib.error import HTTPError
from urllib.request import Request, urlopen

SOURCE = "lightyear_public_fund_screener"
REQUEST_TIMEOUT_SECONDS = 5
_VENUE_BY_YAHOO_SUFFIX = {"DE": "XETRA", "L": "LSE"}


def _public_candidate_url(symbol: str) -> str | None:
    parts = symbol.rsplit(".", 1)
    if len(parts) != 2:
        return None
    ticker, suffix = parts
    venue = _VENUE_BY_YAHOO_SUFFIX.get(suffix.upper())
    if not ticker or not venue:
        return None
    return f"https://lightyear.com/en/etf/{ticker.upper()}:{venue}"


def _visible_text(page: str) -> str:
    without_tags = re.sub(r"<[^>]+>", " ", html.unescape(page))
    return re.sub(r"\s+", " ", without_tags).strip().lower()


def _unknown(candidate: dict[str, Any], error: str) -> dict[str, Any]:
    return {
        "symbol": candidate.get("symbol"),
        "lightyear_available": "unknown",
        "lightyear_confidence": "unresolved",
        "lightyear_url": None,
        "lightyear_match_text": None,
        "broker_source": SOURCE,
        "error": error,
    }


def verify_lightyear_candidate(candidate: dict[str, Any]) -> dict[str, Any]:
    """Verify one candidate from a public Lightyear ETF detail page."""
    symbol = str(candidate.get("symbol") or "")
    url = _public_candidate_url(symbol)
    if not url:
        return _unknown(candidate, "unsupported or missing Yahoo Finance symbol suffix")

    request = Request(
        url,
        headers={
            "User-Agent": "Mozilla/5.0 (compatible; PHOENIX-Fund-Resolver/1.0)",
            "Accept": "text/html,application/xhtml+xml",
        },
    )
    try:
        with urlopen(request, timeout=REQUEST_TIMEOUT_SECONDS) as response:
            page = response.read().decode("utf-8", errors="replace")
            final_url = response.geturl()
    except HTTPError as exc:
        if exc.code == 404:
            return {
                "symbol": symbol,
                "lightyear_available": False,
                "lightyear_confidence": "medium",
                "lightyear_url": None,
                "lightyear_match_text": None,
                "broker_source": SOURCE,
                "error": "Public Lightyear candidate page returned HTTP 404.",
            }
        return _unknown(candidate, f"Lightyear HTTP error: {exc.code}")
    except Exception as exc:
        return _unknown(candidate, f"Lightyear verification failed: {exc}")

    text = _visible_text(page)
    ticker = symbol.rsplit(".", 1)[0].lower()
    symbol_found = bool(re.search(rf"(?<![a-z0-9]){re.escape(ticker)}(?![a-z0-9])", text))
    descriptions = [candidate.get("label"), *(candidate.get("keywords") or [])]
    matched_text = next(
        (str(value) for value in descriptions if value and str(value).lower() in text),
        None,
    )
    if symbol_found and matched_text:
        return {
            "symbol": symbol,
            "lightyear_available": True,
            "lightyear_confidence": "high",
            "lightyear_url": final_url,
            "lightyear_match_text": matched_text,
            "broker_source": SOURCE,
        }

    return _unknown(
        candidate,
        "Public page loaded but exact symbol and descriptive match could not both be confirmed.",
    )


def verify_lightyear_candidates(candidates: list[dict[str, Any]]) -> dict[str, Any]:
    """Verify candidates independently so one failure cannot abort the set."""
    if not candidates:
        return {"source": SOURCE, "candidates": []}
    with ThreadPoolExecutor(max_workers=min(4, len(candidates))) as executor:
        verified = list(executor.map(verify_lightyear_candidate, candidates))
    return {
        "source": SOURCE,
        "candidates": verified,
    }
