"""Starts uvicorn with dotenv loaded before the app module is imported."""
from pathlib import Path
from dotenv import load_dotenv

load_dotenv(dotenv_path=Path(__file__).parent / ".env")

import uvicorn
uvicorn.run("jarvis.api.main:app", port=8000, log_level="warning")
