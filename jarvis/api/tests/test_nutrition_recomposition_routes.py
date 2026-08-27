"""Contract tests for approval-first recomposition protocol routes."""

from datetime import timedelta

import pytest
from fastapi.testclient import TestClient

from jarvis.api.main import app
from jarvis.core import clock
from jarvis.data import database


client = TestClient(app)


def _manual_meal_payload() -> dict:
    return {
        "item_id": "stale-write-meal",
        "item_type": "manual",
        "name": "Stale Write Meal",
        "servings": 1,
        "calories": 100,
        "protein_g": 10,
        "fat_g": 2,
        "carbs_g": 10,
    }


@pytest.fixture(autouse=True)
def clean_today_meals():
    today = clock.today().isoformat()
    with database.get_db() as connection:
        connection.execute("DELETE FROM meal_log WHERE log_date = ?", (today,))
    yield
    with database.get_db() as connection:
        connection.execute("DELETE FROM meal_log WHERE log_date = ?", (today,))


def _today_protocol() -> dict:
    response = client.get("/nutrition/today-protocol")
    assert response.status_code == 200
    return response.json()


def test_today_protocol_is_read_only_and_exact():
    before = client.get("/nutrition/status").json()["meal_log"]

    protocol = _today_protocol()

    after = client.get("/nutrition/status").json()["meal_log"]
    assert before == after
    assert protocol["requires_approval"] is True
    assert all(
        "quantity_g" in item
        for meal in protocol["meals"]
        for item in meal["items"]
    )


def test_logging_one_protocol_meal_never_logs_the_full_day():
    protocol = _today_protocol()
    selected_meal = protocol["meals"][0]

    response = client.post(
        "/nutrition/today-protocol/log-meal",
        json={
            "protocol_id": protocol["protocol_id"],
            "meal_id": selected_meal["meal_id"],
        },
    )

    assert response.status_code == 200
    logged = client.get("/nutrition/status").json()["meal_log"]
    assert len(logged) == len(selected_meal["items"])
    assert {
        meal["source"] for meal in logged
    } == {f"today_protocol:{protocol['protocol_id']}:{selected_meal['meal_id']}"}


def test_stale_logging_is_rejected_without_additional_writes():
    protocol = _today_protocol()
    assert client.post("/nutrition/log/meal", json=_manual_meal_payload()).status_code == 200
    before = client.get("/nutrition/status").json()["meal_log"]

    response = client.post(
        "/nutrition/today-protocol/log-meal",
        json={
            "protocol_id": protocol["protocol_id"],
            "meal_id": protocol["meals"][0]["meal_id"],
        },
    )

    assert response.status_code == 409
    assert response.json()["detail"] == "Today protocol is stale; refresh before logging"
    assert client.get("/nutrition/status").json()["meal_log"] == before


def test_stale_replan_is_rejected_without_writes():
    protocol = _today_protocol()
    assert client.post("/nutrition/log/meal", json=_manual_meal_payload()).status_code == 200
    before = client.get("/nutrition/status").json()["meal_log"]

    response = client.post(
        "/nutrition/today-protocol/replan",
        json={
            "protocol_id": protocol["protocol_id"],
            "action": "skip",
            "meal_id": protocol["meals"][0]["meal_id"],
        },
    )

    assert response.status_code == 409
    assert response.json()["detail"] == "Today protocol is stale; refresh before replanning"
    assert client.get("/nutrition/status").json()["meal_log"] == before


def test_logging_unknown_protocol_meal_returns_not_found():
    protocol = _today_protocol()

    response = client.post(
        "/nutrition/today-protocol/log-meal",
        json={"protocol_id": protocol["protocol_id"], "meal_id": "missing-meal"},
    )

    assert response.status_code == 404
    assert response.json()["detail"] == "Protocol meal not found"


def test_protocol_component_logging_rolls_back_when_any_component_is_invalid():
    source = "today_protocol:atomic-test:meal-1"
    with pytest.raises(KeyError):
        database.log_meal_components_atomically(
            clock.today(),
            [
                {
                    "item_id": "valid-component",
                    "name": "Valid Component",
                    "quantity_g": 100,
                    "calories": 100,
                    "protein_g": 10,
                    "fat_g": 1,
                    "carbs_g": 10,
                },
                {"item_id": "invalid-component"},
            ],
            source=source,
        )

    assert not [
        meal
        for meal in database.get_meals_for_date(clock.today())
        if meal["source"] == source
    ]


def test_evidence_queries_return_empty_collections_without_evidence():
    assert database.get_recomposition_daily_evidence(28) == []
    assert database.get_body_measurements("waist", 60) == []
    assert database.get_training_performance_guardrails(28) == []
    assert database.get_nutrition_hunger_guardrails(28) == []


def test_recomposition_review_locks_before_fourteen_complete_days():
    review = client.get("/nutrition/recomposition-review").json()

    assert review["status"] == "insufficient_evidence"
    assert review["eligible"] is False
    assert review["requires_approval"] is False
