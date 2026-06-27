"""J.A.R.V.I.S. FastAPI application entry point."""

import asyncio
import os
from contextlib import asynccontextmanager

from dotenv import load_dotenv

load_dotenv()  # loads .env from project root if present; no-op otherwise

import httpx
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from jarvis.api.routers import barcode, budget, calendar, chat, crossdomain, finance, health, nutrition, training
from jarvis.data.database import init_db


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


@asynccontextmanager
async def lifespan(_app: FastAPI):
    init_db()
    task = asyncio.create_task(_keep_alive())
    yield
    task.cancel()


# Initialize at import time for direct TestClient usage that does not enter the
# lifespan context; the lifespan call remains the production startup contract.
init_db()
app = FastAPI(title="J.A.R.V.I.S.", version="0", lifespan=lifespan)

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

app.add_middleware(
    CORSMiddleware,
    allow_origins=_LOCAL_ALLOWED_ORIGINS + _DEPLOY_ALLOWED_ORIGINS,
    allow_origin_regex=(
        r"^http://(localhost|127\.0\.0\.1|100\.64\.150\.26|192\.168\.0\.25):\d+$"
        r"|^https://[a-z0-9-]+\.vercel\.app$"
    ),
    allow_credentials=True,
    allow_methods=["GET", "POST", "DELETE", "OPTIONS"],
    allow_headers=["*"],
)

app.include_router(finance.router, prefix="/finance", tags=["finance"])
app.include_router(budget.router, prefix="/budget", tags=["budget"])
app.include_router(calendar.router, prefix="/calendar", tags=["calendar"])
app.include_router(training.router, prefix="/training", tags=["training"])
app.include_router(nutrition.router, prefix="/nutrition", tags=["nutrition"])
app.include_router(crossdomain.router, prefix="/cross-domain", tags=["cross-domain"])
app.include_router(barcode.router, prefix="/barcode", tags=["barcode"])
app.include_router(chat.router, prefix="/jarvis", tags=["jarvis"])
app.include_router(health.router, prefix="/health", tags=["health"])


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
        ],
    }
