import os
from pathlib import Path
from unittest.mock import patch

import conftest
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


def test_pytest_cleanup_cannot_be_redirected_outside_generated_runtime(
    monkeypatch,
) -> None:
    generated_runtime = conftest.TEST_RUNTIME
    monkeypatch.setattr(conftest, "TEST_RUNTIME", Path.home())

    with patch("conftest.shutil.rmtree") as remove_tree:
        conftest.pytest_unconfigure(None)

    remove_tree.assert_called_once_with(generated_runtime, ignore_errors=True)
