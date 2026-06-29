"""Read-only news routes for Phoenix."""

from fastapi import APIRouter, Query

from jarvis.domains.news import engine as news_engine

router = APIRouter()


@router.get("/status")
def news_status() -> dict:
    return news_engine.status()


@router.get("/headlines")
def news_headlines(
    topic: str = Query("home"),
    limit: int = Query(5, ge=1, le=10),
    query: str | None = Query(None),
) -> dict:
    return news_engine.fetch_headlines(topic=topic, limit=limit, query=query)
