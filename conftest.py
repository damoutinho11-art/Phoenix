from __future__ import annotations

import hashlib
import os
import shutil
import tempfile
import warnings
from pathlib import Path


REPO_ROOT = Path(__file__).resolve().parent
TEST_RUNTIME = Path(tempfile.mkdtemp(prefix="phoenix-pytest-"))
TEST_DB = TEST_RUNTIME / "jarvis-test.db"
TEST_PORTFOLIO = TEST_RUNTIME / "portfolio_state.json"
PORTFOLIO_FIXTURE = REPO_ROOT / "jarvis" / "api" / "tests" / "fixtures" / "portfolio_state.json"
PROTECTED_FILES = (
    REPO_ROOT / "jarvis" / "data" / "jarvis.db",
    REPO_ROOT / "jarvis" / "domains" / "finance" / "portfolio_state.json",
    REPO_ROOT / "pwa" / "dev-dist" / "sw.js",
)


def _digest(path: Path) -> str | None:
    return hashlib.sha256(path.read_bytes()).hexdigest() if path.exists() else None


_START_DIGESTS = {path: _digest(path) for path in PROTECTED_FILES}
shutil.copyfile(PORTFOLIO_FIXTURE, TEST_PORTFOLIO)
os.environ["JARVIS_DB_PATH"] = str(TEST_DB)
os.environ["PHOENIX_PORTFOLIO_STATE_PATH"] = str(TEST_PORTFOLIO)
os.environ["PHOENIX_BACKGROUND_JOBS_ENABLED"] = "false"


def pytest_sessionfinish(session, exitstatus) -> None:
    changed = [path for path, digest in _START_DIGESTS.items() if _digest(path) != digest]
    if changed:
        warnings.warn(
            "Tests mutated protected repository files: " + ", ".join(map(str, changed)),
            RuntimeWarning,
        )
        session.exitstatus = 1


def pytest_unconfigure(config) -> None:
    shutil.rmtree(TEST_RUNTIME, ignore_errors=True)
