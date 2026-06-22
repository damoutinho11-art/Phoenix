"""J.A.R.V.I.S. FastAPI application entry point."""

from dotenv import load_dotenv

load_dotenv()  # loads .env from project root if present; no-op otherwise

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from jarvis.api.routers import calendar, finance, training

app = FastAPI(title="J.A.R.V.I.S.", version="0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://localhost:3000",
        "http://localhost:5173",
        "http://localhost:8080",
        "http://100.64.150.26",
        "http://100.64.150.26:5173",
        "http://100.64.150.26:8080",
    ],
    allow_credentials=True,
    allow_methods=["GET"],
    allow_headers=["*"],
)

app.include_router(finance.router, prefix="/finance", tags=["finance"])
app.include_router(calendar.router, prefix="/calendar", tags=["calendar"])
app.include_router(training.router, prefix="/training", tags=["training"])


@app.get("/health", tags=["meta"])
def health() -> dict:
    return {"status": "ok", "domains": ["finance", "calendar", "training"]}
