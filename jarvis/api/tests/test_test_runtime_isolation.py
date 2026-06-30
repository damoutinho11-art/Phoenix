import os
from pathlib import Path

from jarvis.data import database


REPO_ROOT = Path(__file__).resolve().parents[3]


def test_pytest_database_is_outside_repository() -> None:
    assert REPO_ROOT not in database.DB_PATH.resolve().parents
    assert database.DB_PATH.name == "jarvis-test.db"


def test_pytest_portfolio_state_is_outside_repository() -> None:
    configured = Path(os.environ["PHOENIX_PORTFOLIO_STATE_PATH"]).resolve()
    assert REPO_ROOT not in configured.parents
    assert configured.exists()


def test_background_jobs_are_disabled_for_tests() -> None:
    assert os.environ["PHOENIX_BACKGROUND_JOBS_ENABLED"] == "false"
