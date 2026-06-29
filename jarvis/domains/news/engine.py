"""Read-only news helpers for PHOENIX.

News is optional context. Failures return warnings instead of breaking chat or
core app screens.
"""

from __future__ import annotations

import os
import time
import urllib.parse
import xml.etree.ElementTree as ET
from dataclasses import dataclass
from datetime import datetime, timezone
from email.utils import parsedate_to_datetime
from typing import Any

import httpx


@dataclass(frozen=True)
class Headline:
    title: str
    url: str | None = None
    source: str | None = None
    published_at: str | None = None

    def as_dict(self) -> dict[str, Any]:
        return {
            "title": self.title,
            "url": self.url,
            "source": self.source,
            "published_at": self.published_at,
        }


_CACHE: dict[tuple[str, int], tuple[float, dict[str, Any]]] = {}

_TOPIC_QUERY = {
    "finance": "BTC ETF market news OR inflation OR Federal Reserve",
    "markets": "global markets ETF Bitcoin macro news",
    "calendar": "Estonian National Opera news Tallinn opera",
    "opera": "Estonian National Opera Tallinn rehearsal performance news",
    "nutrition": "sports nutrition recovery protein carbohydrates hydration research",
    "training": "vertical jump training recovery sports science",
    "home": "markets opera Tallinn sports nutrition news",
}


def news_enabled() -> bool:
    return os.getenv("PHOENIX_NEWS_ENABLED", "true").strip().lower() not in {"0", "false", "off", "no"}


def status() -> dict[str, Any]:
    return {
        "enabled": news_enabled(),
        "source": "google_news_rss",
        "network_required": True,
        "core_requires_news": False,
        "cache_entries": len(_CACHE),
        "safe_note": "News is read-only optional context; Phoenix continues if news fetch fails.",
    }


def _parse_pub_date(value: str | None) -> str | None:
    if not value:
        return None
    try:
        dt = parsedate_to_datetime(value)
        if dt.tzinfo is None:
            dt = dt.replace(tzinfo=timezone.utc)
        return dt.astimezone(timezone.utc).isoformat()
    except Exception:
        return value


def _query_for_topic(topic: str, query: str | None = None) -> str:
    if query and query.strip():
        return query.strip()
    return _TOPIC_QUERY.get((topic or "home").lower(), _TOPIC_QUERY["home"])


def fetch_headlines(topic: str = "home", limit: int = 5, query: str | None = None) -> dict[str, Any]:
    limit = max(1, min(int(limit or 5), 10))
    resolved_query = _query_for_topic(topic, query)
    cache_key = (resolved_query, limit)
    ttl = int(os.getenv("PHOENIX_NEWS_CACHE_SECONDS", "900") or "900")
    now = time.time()
    cached = _CACHE.get(cache_key)
    if cached and now - cached[0] < ttl:
        result = dict(cached[1])
        result["cache"] = "hit"
        return result

    if not news_enabled():
        return {
            "enabled": False,
            "topic": topic,
            "query": resolved_query,
            "headlines": [],
            "warnings": ["PHOENIX_NEWS_ENABLED is off."],
            "fetched_at": datetime.now(timezone.utc).isoformat(),
            "cache": "disabled",
        }

    url = "https://news.google.com/rss/search?" + urllib.parse.urlencode({
        "q": resolved_query,
        "hl": "en-US",
        "gl": "US",
        "ceid": "US:en",
    })
    timeout = float(os.getenv("PHOENIX_NEWS_TIMEOUT_SECONDS", "8") or "8")
    try:
        with httpx.Client(timeout=timeout, follow_redirects=True) as client:
            response = client.get(url, headers={"User-Agent": "Phoenix/1.0 read-only news fetcher"})
            response.raise_for_status()
        root = ET.fromstring(response.text)
        items = []
        for item in root.findall(".//item")[:limit]:
            title = (item.findtext("title") or "").strip()
            if not title:
                continue
            source_node = item.find("source")
            items.append(Headline(
                title=title,
                url=(item.findtext("link") or "").strip() or None,
                source=(source_node.text.strip() if source_node is not None and source_node.text else None),
                published_at=_parse_pub_date(item.findtext("pubDate")),
            ).as_dict())
        result = {
            "enabled": True,
            "topic": topic,
            "query": resolved_query,
            "headlines": items,
            "warnings": [] if items else ["News fetch returned no parseable headlines."],
            "fetched_at": datetime.now(timezone.utc).isoformat(),
            "cache": "miss",
        }
    except Exception as exc:  # noqa: BLE001
        result = {
            "enabled": True,
            "topic": topic,
            "query": resolved_query,
            "headlines": [],
            "warnings": [f"News fetch unavailable: {exc.__class__.__name__}"],
            "fetched_at": datetime.now(timezone.utc).isoformat(),
            "cache": "error",
        }
    _CACHE[cache_key] = (now, result)
    return result


def should_fetch_for_message(domain: str, message: str) -> bool:
    text = (message or "").lower()
    if domain == "finance":
        return True
    return any(word in text for word in [
        "news", "headline", "headlines", "latest", "current", "market", "fetching", "what are you doing",
        "what is the app doing", "source", "sources",
    ])


def context_text(topic: str = "home", limit: int = 5, query: str | None = None) -> str:
    data = fetch_headlines(topic=topic, limit=limit, query=query)
    lines = [f"NEWS ({data.get('topic')}, {data.get('cache')}):"]
    headlines = data.get("headlines") or []
    if headlines:
        for h in headlines[:limit]:
            published = (h.get("published_at") or "")[:10]
            source = h.get("source") or "unknown source"
            lines.append(f"  {h.get('title')} — {source} {published}".strip())
    else:
        lines.append("  No live headlines available.")
    for warning in data.get("warnings") or []:
        lines.append(f"  Warning: {warning}")
    return "\n".join(lines)
