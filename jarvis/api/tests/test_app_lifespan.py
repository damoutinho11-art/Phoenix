from unittest.mock import patch

from fastapi.testclient import TestClient

from jarvis.api import main


def test_background_jobs_disabled_from_test_environment() -> None:
    assert main.background_jobs_enabled() is False


def test_lifespan_does_not_schedule_jobs_when_disabled() -> None:
    with patch("jarvis.api.main.asyncio.create_task") as create_task:
        with TestClient(main.app):
            pass
    create_task.assert_not_called()


def test_activity_reports_only_enabled_background_jobs() -> None:
    with TestClient(main.app) as client:
        data = client.get("/jarvis/activity").json()
    assert data["background_jobs"] == []
