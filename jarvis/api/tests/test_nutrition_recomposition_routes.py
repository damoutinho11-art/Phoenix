"""Contract tests for approval-first recomposition protocol routes."""

from copy import deepcopy
from datetime import timedelta
from threading import Event, Thread
from time import sleep
from unittest.mock import patch

import pytest
from fastapi.testclient import TestClient

from jarvis.api.dependencies import get_nutrition_constitution
from jarvis.api.main import app
from jarvis.api.routers import nutrition as nutrition_router
from jarvis.core import clock
from jarvis.data import database
from jarvis.domains.nutrition import engine


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


def test_memory_change_rotates_protocol_identity_and_rejects_stale_logging():
    protocol = _today_protocol()
    saved = database.save_nutrition_memory(
        kind="dislike",
        item_id="identity-memory",
        item_type="staple",
        name="Identity Memory",
        source="test",
    )
    try:
        changed = _today_protocol()
        before = client.get("/nutrition/status").json()["meal_log"]
        response = client.post(
            "/nutrition/today-protocol/log-meal",
            json={
                "protocol_id": protocol["protocol_id"],
                "meal_id": protocol["meals"][0]["meal_id"],
            },
        )
        assert changed["protocol_id"] != protocol["protocol_id"]
        assert response.status_code == 409
        assert client.get("/nutrition/status").json()["meal_log"] == before
    finally:
        database.delete_nutrition_memory(saved["id"])


def test_calendar_change_rotates_protocol_identity():
    normal_calendar = {"days": [{"blocks": []}]}
    rehearsal_calendar = {
        "days": [{"blocks": [{"kind": "rehearsal", "start": "10:00", "end": "14:00", "breaks": ["12:00"]}]}]
    }
    with patch(
        "jarvis.api.routers.nutrition._calendar_bridge_context",
        return_value=normal_calendar,
    ):
        normal = _today_protocol()
    with patch(
        "jarvis.api.routers.nutrition._calendar_bridge_context",
        return_value=rehearsal_calendar,
    ):
        rehearsal = _today_protocol()

    assert rehearsal["protocol_id"] != normal["protocol_id"]


def test_constitution_and_inventory_changes_rotate_protocol_identity():
    constitution = get_nutrition_constitution()
    changed_constitution = deepcopy(constitution)
    changed_constitution["phases"][changed_constitution["active_phase"]]["measurement_rules"]["pasta"] = "cooked"
    baseline = nutrition_router._today_protocol_context(constitution)
    changed = nutrition_router._today_protocol_context(changed_constitution)
    canonical_foods = engine.load_exact_food_inventory()
    changed_foods = [dict(food) for food in canonical_foods]
    changed_foods[0]["calories"] += 1

    with patch(
        "jarvis.api.routers.nutrition.engine.load_exact_food_inventory",
        return_value=changed_foods,
    ):
        inventory_changed = nutrition_router._today_protocol_context(constitution)

    assert changed["protocol_id"] != baseline["protocol_id"]
    assert inventory_changed["protocol_id"] != baseline["protocol_id"]


def test_concurrent_intervening_log_rejects_protocol_write():
    protocol = _today_protocol()
    writer_ready = Event()
    release_writer = Event()
    request_started = Event()
    response_holder = {}

    def concurrent_writer():
        connection = database.get_db()
        try:
            connection.execute("BEGIN IMMEDIATE")
            connection.execute(
                """
                INSERT INTO meal_log (
                    log_date, logged_at, item_id, item_type, name, servings,
                    calories, protein_g, fat_g, carbs_g, source
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                """,
                (
                    clock.today().isoformat(), clock.utc_now_iso(), "intervening",
                    "manual", "Intervening Meal", 1, 100, 10, 2, 10, "manual",
                ),
            )
            writer_ready.set()
            assert release_writer.wait(timeout=3)
            connection.commit()
        finally:
            connection.close()

    def send_protocol_log():
        request_started.set()
        response_holder["response"] = client.post(
            "/nutrition/today-protocol/log-meal",
            json={
                "protocol_id": protocol["protocol_id"],
                "meal_id": protocol["meals"][0]["meal_id"],
            },
        )

    writer = Thread(target=concurrent_writer)
    requester = Thread(target=send_protocol_log)
    writer.start()
    assert writer_ready.wait(timeout=3)
    requester.start()
    assert request_started.wait(timeout=3)
    sleep(0.1)
    release_writer.set()
    writer.join(timeout=3)
    requester.join(timeout=3)

    response = response_holder["response"]
    logged = client.get("/nutrition/status").json()["meal_log"]
    assert response.status_code == 409
    assert [meal["item_id"] for meal in logged] == ["intervening"]


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


def test_training_evidence_query_tolerates_absent_table(tmp_path, monkeypatch):
    monkeypatch.setattr(database, "DB_PATH", tmp_path / "without-training-evidence.db")
    database.init_db()
    with database.get_db() as connection:
        connection.execute("DROP TABLE training_session_evidence")

    assert database.get_training_performance_guardrails(28) == []


def test_recomposition_evidence_requires_complete_historical_adherence():
    constitution = get_nutrition_constitution()
    today = clock.today()
    dates = [today - timedelta(days=offset) for offset in range(1, 14)]
    dates.extend([today, today + timedelta(days=1)])
    with database.get_db() as connection:
        placeholders = ", ".join("?" for _ in dates)
        values = tuple(day.isoformat() for day in dates)
        connection.execute(f"DELETE FROM meal_log WHERE log_date IN ({placeholders})", values)
        connection.execute(f"DELETE FROM weight_log WHERE log_date IN ({placeholders})", values)
    try:
        for day in dates[:13]:
            target = engine.get_macro_target(constitution, day)
            database.log_weight(day, 77.0)
            meal_count = constitution["phases"][constitution["active_phase"]]["meals_per_day"]
            for component in range(meal_count):
                database.log_meal(
                    day,
                    f"complete-{day.isoformat()}-{component}",
                    "manual",
                    "Complete Historical Meal",
                    1,
                    target.calories / meal_count,
                    target.protein_g / meal_count,
                    target.fat_g / meal_count,
                    target.carbs_g / meal_count,
                    "test",
                )
        database.log_weight(today, 77.0)
        database.log_meal(today, "today-partial", "manual", "Today Partial", 1, 100, 10, 2, 10, "test")
        database.log_weight(today + timedelta(days=1), 77.0)
        database.log_meal(today + timedelta(days=1), "future-partial", "manual", "Future Partial", 1, 100, 10, 2, 10, "test")

        evidence = database.get_recomposition_daily_evidence(28, constitution)
        review = client.get("/nutrition/recomposition-review").json()

        assert len(evidence) == 13
        assert all(row["date"] < today.isoformat() and row["complete"] for row in evidence)
        assert review["status"] == "insufficient_evidence"
        assert review["complete_days"] == 13
    finally:
        with database.get_db() as connection:
            placeholders = ", ".join("?" for _ in dates)
            values = tuple(day.isoformat() for day in dates)
            connection.execute(f"DELETE FROM meal_log WHERE log_date IN ({placeholders})", values)
            connection.execute(f"DELETE FROM weight_log WHERE log_date IN ({placeholders})", values)


def test_recomposition_evidence_counts_protocol_components_as_one_meal_event():
    constitution = get_nutrition_constitution()
    protocol_date = clock.today() - timedelta(days=1)
    manual_date = clock.today() - timedelta(days=2)
    target = engine.get_macro_target(constitution, protocol_date)
    source = "today_protocol:component-event-test:meal-1"
    with database.get_db() as connection:
        placeholders = ", ".join("?" for _ in (protocol_date, manual_date))
        values = (protocol_date.isoformat(), manual_date.isoformat())
        connection.execute(f"DELETE FROM meal_log WHERE log_date IN ({placeholders})", values)
        connection.execute(f"DELETE FROM weight_log WHERE log_date IN ({placeholders})", values)
    try:
        database.log_weight(protocol_date, 77.0)
        for component in range(4):
            database.log_meal(
                protocol_date,
                f"component-{component}",
                "exact_gram_protocol_component",
                "One Protocol Meal Component",
                1,
                target.calories / 4,
                target.protein_g / 4,
                target.fat_g / 4,
                target.carbs_g / 4,
                source,
            )

        manual_target = engine.get_macro_target(constitution, manual_date)
        database.log_weight(manual_date, 77.0)
        for meal in range(4):
            database.log_meal(
                manual_date,
                f"manual-event-{meal}",
                "manual",
                "Manual Meal Event",
                1,
                manual_target.calories / 4,
                manual_target.protein_g / 4,
                manual_target.fat_g / 4,
                manual_target.carbs_g / 4,
                "manual",
            )

        evidence = database.get_recomposition_daily_evidence(2, constitution)

        assert [row["date"] for row in evidence] == [manual_date.isoformat()]
    finally:
        with database.get_db() as connection:
            placeholders = ", ".join("?" for _ in (protocol_date, manual_date))
            values = (protocol_date.isoformat(), manual_date.isoformat())
            connection.execute(f"DELETE FROM meal_log WHERE log_date IN ({placeholders})", values)
            connection.execute(f"DELETE FROM weight_log WHERE log_date IN ({placeholders})", values)


def test_recomposition_evidence_includes_all_n_historical_calendar_days():
    constitution = get_nutrition_constitution()
    dates = [clock.today() - timedelta(days=2), clock.today() - timedelta(days=1)]
    with database.get_db() as connection:
        placeholders = ", ".join("?" for _ in dates)
        values = tuple(day.isoformat() for day in dates)
        connection.execute(f"DELETE FROM meal_log WHERE log_date IN ({placeholders})", values)
        connection.execute(f"DELETE FROM weight_log WHERE log_date IN ({placeholders})", values)
    try:
        for day in dates:
            target = engine.get_macro_target(constitution, day)
            database.log_weight(day, 77.0)
            for meal in range(4):
                database.log_meal(
                    day,
                    f"boundary-{day.isoformat()}-{meal}",
                    "manual",
                    "Boundary Meal",
                    1,
                    target.calories / 4,
                    target.protein_g / 4,
                    target.fat_g / 4,
                    target.carbs_g / 4,
                    "manual",
                )

        evidence = database.get_recomposition_daily_evidence(2, constitution)

        assert [row["date"] for row in evidence] == [day.isoformat() for day in dates]
    finally:
        with database.get_db() as connection:
            placeholders = ", ".join("?" for _ in dates)
            values = tuple(day.isoformat() for day in dates)
            connection.execute(f"DELETE FROM meal_log WHERE log_date IN ({placeholders})", values)
            connection.execute(f"DELETE FROM weight_log WHERE log_date IN ({placeholders})", values)


def test_recomposition_evidence_uses_moved_training_session_target(monkeypatch):
    constitution = deepcopy(get_nutrition_constitution())
    phase = constitution["phases"][constitution["active_phase"]]
    phase["training_day"] = {"calories": 2600, "protein_g": 175, "carbs_g": 315, "fat_g": 70}
    phase["rest_day"] = {"calories": 2000, "protein_g": 150, "carbs_g": 200, "fat_g": 60}
    target_date = next(
        clock.today() - timedelta(days=offset)
        for offset in range(1, 8)
        if (clock.today() - timedelta(days=offset)).strftime("%A").lower()
        not in constitution["training_days"]
    )
    active_plan = {
        "payload": {
            "plan_id": "moved-session-plan",
            "receipt_hash": "moved-session-receipt",
            "days": [
                {
                    "date": target_date.isoformat(),
                    "session_type": "high_intensity",
                    "objective": "moved_session",
                    "exercises": [],
                    "estimated_minutes": 45,
                }
            ],
        }
    }
    monkeypatch.setattr(database, "get_active_training_plan", lambda _cycle: active_plan)
    with database.get_db() as connection:
        connection.execute("DELETE FROM meal_log WHERE log_date = ?", (target_date.isoformat(),))
        connection.execute("DELETE FROM weight_log WHERE log_date = ?", (target_date.isoformat(),))
    try:
        database.log_weight(target_date, 77.0)
        for meal in range(4):
            database.log_meal(
                target_date,
                f"moved-session-{meal}",
                "manual",
                "Moved Session Meal",
                1,
                650,
                43.75,
                17.5,
                78.75,
                "manual",
            )

        evidence = database.get_recomposition_daily_evidence(7, constitution)

        assert [row["date"] for row in evidence] == [target_date.isoformat()]
    finally:
        with database.get_db() as connection:
            connection.execute("DELETE FROM meal_log WHERE log_date = ?", (target_date.isoformat(),))
            connection.execute("DELETE FROM weight_log WHERE log_date = ?", (target_date.isoformat(),))


def test_optional_evidence_queries_exclude_today_and_future_rows(tmp_path, monkeypatch):
    monkeypatch.setattr(database, "DB_PATH", tmp_path / "future-evidence.db")
    database.init_db()
    today = clock.today()
    historical = today - timedelta(days=1)
    future = today + timedelta(days=1)
    with database.get_db() as connection:
        connection.executescript(
            """
            CREATE TABLE body_measurements (
                log_date TEXT NOT NULL,
                measurement_type TEXT NOT NULL,
                value REAL NOT NULL
            );
            CREATE TABLE nutrition_hunger_log (
                log_date TEXT NOT NULL,
                level INTEGER NOT NULL
            );
            """
        )
        for logged_date in (historical, today, future):
            connection.execute(
                "INSERT INTO body_measurements (log_date, measurement_type, value) VALUES (?, 'waist', 80)",
                (logged_date.isoformat(),),
            )
            connection.execute(
                "INSERT INTO nutrition_hunger_log (log_date, level) VALUES (?, 4)",
                (logged_date.isoformat(),),
            )
            connection.execute(
                """
                INSERT INTO training_session_evidence (
                    session_id, plan_id, receipt_hash, plan_date, duration_seconds,
                    rpe, pain_confirmed, pain_body_areas_json, created_at
                ) VALUES (?, 'plan', 'receipt', ?, 3600, 7, 0, '[]', ?)
                """,
                (logged_date.toordinal(), logged_date.isoformat(), clock.utc_now_iso()),
            )

    assert [row["date"] for row in database.get_body_measurements("waist", 7)] == [historical.isoformat()]
    assert [row["date"] for row in database.get_training_performance_guardrails(7)] == [historical.isoformat()]
    assert [row["date"] for row in database.get_nutrition_hunger_guardrails(7)] == [historical.isoformat()]


def test_exact_inventory_is_loaded_from_canonical_staples():
    canonical = {staple.id: staple for staple in engine.load_lidl_staples()}
    inventory = engine.load_exact_food_inventory()
    inventory_by_id = {food["id"]: food for food in inventory}
    sample = canonical["lidl_001"]

    assert set(inventory_by_id) == set(canonical)
    assert inventory_by_id[sample.id]["name"] == sample.name
    assert inventory_by_id[sample.id]["calories"] == sample.calories
    assert inventory_by_id[sample.id]["protein_g"] == sample.protein_g
    assert inventory_by_id[sample.id]["label_source"] == f"lidl_staples:{sample.id}"


def test_recomposition_review_locks_before_fourteen_complete_days():
    review = client.get("/nutrition/recomposition-review").json()

    assert review["status"] == "insufficient_evidence"
    assert review["eligible"] is False
    assert review["requires_approval"] is False
