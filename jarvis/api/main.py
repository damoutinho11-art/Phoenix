"""PHOENIX FastAPI application entry point."""

import asyncio
import logging
import os
from contextlib import asynccontextmanager

from dotenv import load_dotenv

load_dotenv()  # loads .env from project root if present; no-op otherwise

import httpx
from fastapi import FastAPI, Request, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from jarvis.api.access_control import AccessControlMiddleware

from jarvis.api.routers import (
    admin,
    barcode,
    budget,
    calendar,
    chat,
    crossdomain,
    finance,
    gmail,
    google_auth,
    health,
    news,
    nutrition,
    training,
)
from jarvis.core import clock
from jarvis.data import database
from jarvis.data import plaan_feed
from jarvis.data.database import init_db
from jarvis.domains.finance import engine as finance_engine
from jarvis.domains.finance.market_data import update_portfolio_state_prices

_log = logging.getLogger(__name__)


def background_jobs_enabled() -> bool:
    return os.getenv("PHOENIX_BACKGROUND_JOBS_ENABLED", "true").strip().lower() not in {
        "0", "false", "off", "no"
    }


def background_job_descriptions() -> list[dict[str, str]]:
    if not background_jobs_enabled():
        return []
    jobs = [
        {"name": "keepalive", "cadence": "10 minutes", "effect": "pings /health"},
        {"name": "finance_price_refresh", "cadence": "4 hours", "effect": "refreshes stored market values"},
        {"name": "finance_research_autopilot", "cadence": "24 hours", "effect": "refreshes research evidence"},
    ]
    if plaan_feed.configured():
        jobs.append({"name": "plaan_personal_feed", "cadence": "1 hour", "effect": "reads personal opera calendar"})
    return jobs


async def _auto_refresh_plaan():
    while True:
        try:
            await asyncio.to_thread(plaan_feed.refresh)
        except Exception:
            _log.error("Personal calendar refresh unavailable; retrying in one hour")
        await asyncio.sleep(3600)


async def _keep_alive():
    """Ping /health every 10 minutes so Railway doesn't sleep the dyno."""
    await asyncio.sleep(60)  # wait for startup
    async with httpx.AsyncClient() as client:
        while True:
            try:
                await client.get("http://localhost:8000/health", timeout=10)
            except Exception:
                pass
            await asyncio.sleep(600)


async def _auto_refresh_prices():
    """Refresh portfolio prices from yfinance every 4 hours."""
    await asyncio.sleep(90)  # let server fully start first
    while True:
        try:
            state = database.load_portfolio_state()
            constitution = finance_engine.load_json(finance_engine.DEFAULT_CONSTITUTION_PATH)
            if state and constitution:
                updated, meta = update_portfolio_state_prices(state, constitution)
                if updated.get('price_refresh_complete', not meta.get('failed')):
                    updated["prices_refreshed_at"] = clock.utc_now_iso()
                database.save_portfolio_state(updated)
                _log.info("Auto price refresh: updated %s", meta.get("holdings_updated"))
        except Exception:
            _log.exception("Auto price refresh failed — will retry in 4 h")
        await asyncio.sleep(4 * 60 * 60)


async def _auto_research_autopilot():
    """Run research autopilot once per day to keep memos fresh for weekly recommendation."""
    await asyncio.sleep(300)  # wait 5 minutes after startup
    while True:
        try:
            from jarvis.api.routers.finance import _run_research_autopilot_internal  # noqa: PLC0415
            result = _run_research_autopilot_internal()
            _log.info("Auto research autopilot: %s leg(s) processed", result.get("total_legs", 0))
        except Exception:
            _log.exception("Auto research autopilot failed — will retry in 24 h")
        await asyncio.sleep(24 * 60 * 60)


@asynccontextmanager
async def lifespan(_app: FastAPI):
    init_db()
    tasks = []
    try:
        if background_jobs_enabled():
            tasks = [
                asyncio.create_task(_keep_alive()),
                asyncio.create_task(_auto_refresh_prices()),
                asyncio.create_task(_auto_research_autopilot()),
            ]
            if plaan_feed.configured():
                tasks.append(asyncio.create_task(_auto_refresh_plaan()))
        yield
    finally:
        for task in tasks:
            task.cancel()
        if tasks:
            await asyncio.gather(*tasks, return_exceptions=True)


# Initialize at import time for direct TestClient usage that does not enter the
# lifespan context; the lifespan call remains the production startup contract.
init_db()
app = FastAPI(title="PHOENIX", version="0", lifespan=lifespan)

_LOCAL_ALLOWED_ORIGINS = [
    "http://localhost:3000",
    "http://localhost:5173",
    "http://localhost:5174",
    "http://localhost:5180",
    "http://127.0.0.1:5173",
    "http://127.0.0.1:5174",
    "http://127.0.0.1:5180",
    "http://100.64.150.26",
    "http://100.64.150.26:5173",
    "http://100.64.150.26:5174",
    "http://100.64.150.26:5180",
    "http://192.168.0.25:5173",
    "http://192.168.0.25:5174",
    "http://192.168.0.25:5180",
]

_DEPLOY_ALLOWED_ORIGINS = [
    origin.strip()
    for origin in os.getenv("PHOENIX_ALLOWED_ORIGINS", "").split(",")
    if origin.strip()
]

app.add_middleware(AccessControlMiddleware, callback_authorized=google_auth.authorized_callback)

app.add_middleware(
    CORSMiddleware,
    allow_origins=_LOCAL_ALLOWED_ORIGINS + _DEPLOY_ALLOWED_ORIGINS,
    allow_credentials=False,
    allow_methods=["GET", "POST", "DELETE", "OPTIONS"],
    allow_headers=["*"],
)


@app.get('/access/check', include_in_schema=False)
def access_check() -> dict:
    return {'authenticated': True}


@app.post('/access/session', include_in_schema=False)
def create_device_session(request: Request) -> dict:
    if not getattr(request.state, 'owner_key_authenticated', False):
        raise HTTPException(status_code=403, detail='Owner key required to create a device session.')
    from jarvis.api.access_control import issue_device_session
    return issue_device_session()

app.include_router(finance.router, prefix="/finance", tags=["finance"])
app.include_router(budget.router, prefix="/budget", tags=["budget"])
app.include_router(calendar.router, prefix="/calendar", tags=["calendar"])
app.include_router(training.router, prefix="/training", tags=["training"])
app.include_router(nutrition.router, prefix="/nutrition", tags=["nutrition"])
app.include_router(crossdomain.router, prefix="/cross-domain", tags=["cross-domain"])
app.include_router(barcode.router, prefix="/barcode", tags=["barcode"])
app.include_router(chat.router, prefix="/jarvis", tags=["jarvis"])
app.include_router(news.router, prefix="/news", tags=["news"])
app.include_router(health.router, prefix="/health", tags=["health"])
app.include_router(google_auth.router, prefix="/auth/google", tags=["google-auth"])
app.include_router(gmail.router, prefix="/gmail", tags=["gmail"])
app.include_router(admin.router, prefix="/admin", tags=["admin"])


@app.get("/health", tags=["meta"])
def health() -> dict:
    return {
        "status": "ok",
        "domains": [
            "finance",
            "calendar",
            "training",
            "nutrition",
            "cross-domain",
            "barcode",
            "jarvis",
            "news",
        ],
    }
