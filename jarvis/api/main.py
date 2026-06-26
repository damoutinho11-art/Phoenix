"""J.A.R.V.I.S. FastAPI application entry point."""

from contextlib import asynccontextmanager

from dotenv import load_dotenv

load_dotenv()  # loads .env from project root if present; no-op otherwise

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from jarvis.api.routers import barcode, budget, calendar, chat, crossdomain, finance, nutrition, training
from jarvis.data.database import init_db


@asynccontextmanager
async def lifespan(_app: FastAPI):
    init_db()
    yield


# Initialize at import time for direct TestClient usage that does not enter the
# lifespan context; the lifespan call remains the production startup contract.
init_db()
app = FastAPI(title="J.A.R.V.I.S.", version="0", lifespan=lifespan)

app.add_middleware(
    CORSMiddleware,
    allow_origins=[
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
    ],
    allow_origin_regex=r"^http://(localhost|127\.0\.0\.1|100\.64\.150\.26|192\.168\.0\.25):\d+$",
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