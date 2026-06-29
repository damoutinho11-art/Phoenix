"""Tests for nutrition API routes. Mocks Anthropic API call."""

import unittest
from unittest.mock import MagicMock, patch
from fastapi.testclient import TestClient
from jarvis.api.main import app

client = TestClient(app)

_MOCK_BRIEF = (
    "Today is a cut training day targeting 2400 kcal and 165g protein. "
    "Nothing logged yet — full 2400 kcal and 165g protein remaining. "
    "Egg White Bites are a strong first meal at 410 kcal and 72g protein. "
    "Remaining protein target: 165g."
)

_MOCK_RESPONSE = MagicMock()
_MOCK_RESPONSE.content = [MagicMock(text=_MOCK_BRIEF)]


def _make_mock_claude():
    mock = MagicMock()
    mock.messages.create.return_value = _MOCK_RESPONSE
    return mock


class NutritionStatusRouteTests(unittest.TestCase):
    def test_status_returns_200(self):
        assert client.get("/nutrition/status").status_code == 200

    def test_status_has_phase(self):
        data = client.get("/nutrition/status").json()
        assert "phase" in data
        assert data["phase"] in ("cut", "peak")

    def test_status_has_target(self):
        data = client.get("/nutrition/status").json()
        assert "target" in data
        t = data["target"]
        assert "calories" in t
        assert "protein_g" in t

    def test_status_has_logged(self):
        data = client.get("/nutrition/status").json()
        assert "logged" in data
        assert "total_calories" in data["logged"]

    def test_status_has_remaining(self):
        data = client.get("/nutrition/status").json()
        assert "remaining_calories" in data
        assert "remaining_protein_g" in data

    def test_status_has_suggested_recipes(self):
        data = client.get("/nutrition/status").json()
        assert "suggested_recipes" in data
        assert isinstance(data["suggested_recipes"], list)

    def test_is_training_day_is_bool(self):
        data = client.get("/nutrition/status").json()
        assert isinstance(data["is_training_day"], bool)


class RecipesRouteTests(unittest.TestCase):
    def test_recipes_returns_200(self):
        assert client.get("/nutrition/recipes").status_code == 200

    def test_recipes_has_count(self):
        data = client.get("/nutrition/recipes").json()
        assert "count" in data
        assert data["count"] == 156

    def test_filter_by_category(self):
        data = client.get("/nutrition/recipes?category=Breakfast").json()
        assert all(r["category"] == "Breakfast" for r in data["recipes"])

    def test_filter_by_max_calories(self):
        data = client.get("/nutrition/recipes?max_calories=300").json()
        assert all(r["calories"] <= 300 for r in data["recipes"])

    def test_filter_by_min_protein(self):
        data = client.get("/nutrition/recipes?min_protein=70").json()
        assert all(r["protein_g"] >= 70 for r in data["recipes"])

    def test_recipe_has_required_fields(self):
        data = client.get("/nutrition/recipes").json()
        r = data["recipes"][0]
        for field in ["id", "name", "category", "calories", "protein_g"]:
            assert field in r

    def test_recipes_expose_serving_intelligence_fields(self):
        data = client.get("/nutrition/recipes").json()
        r = data["recipes"][0]
        for field in [
            "serving_count", "serving_basis", "portion_unit", "serving_note",
            "tags", "is_batch_recipe", "full_calories", "full_protein_g", "source_serving",
        ]:
            assert field in r

    def test_large_batch_recipe_is_not_one_logged_meal(self):
        data = client.get("/nutrition/recipes").json()
        apple_bake = next(r for r in data["recipes"] if r["id"] == "recipe_001")
        assert apple_bake["is_batch_recipe"] is True
        assert apple_bake["serving_count"] > 1
        assert apple_bake["calories"] < apple_bake["full_calories"]


class StaplesRouteTests(unittest.TestCase):
    def test_staples_returns_200(self):
        assert client.get("/nutrition/staples").status_code == 200

    def test_staples_count(self):
        data = client.get("/nutrition/staples").json()
        assert data["count"] == 60

    def test_staple_has_price(self):
        data = client.get("/nutrition/staples").json()
        assert all(s["price_eur"] > 0 for s in data["staples"])

    def test_staple_has_macros(self):
        data = client.get("/nutrition/staples").json()
        s = data["staples"][0]
        for field in ["calories", "protein_g", "fat_g", "carbs_g"]:
            assert field in s

    def test_staples_expose_food_brain_fields(self):
        data = client.get("/nutrition/staples").json()
        s = data["staples"][0]
        assert "category" in s
        assert "tags" in s

    def test_food_brain_summary_route(self):
        data = client.get("/nutrition/food-brain").json()
        assert data["recipes_count"] == 156
        assert data["staples_count"] == 60
        assert data["tagged_staple_count"] > 0
        assert "protein" in data["staple_categories"]


class NutritionBriefRouteTests(unittest.TestCase):
    def test_brief_returns_200(self):
        with patch("jarvis.api.routers.nutrition.anthropic.Anthropic",
                   return_value=_make_mock_claude()):
            assert client.get("/nutrition/brief").status_code == 200

    def test_brief_has_brief_field(self):
        with patch("jarvis.api.routers.nutrition.anthropic.Anthropic",
                   return_value=_make_mock_claude()):
            data = client.get("/nutrition/brief").json()
        assert "brief" in data
        assert isinstance(data["brief"], str)

    def test_requires_approval_always_true(self):
        with patch("jarvis.api.routers.nutrition.anthropic.Anthropic",
                   return_value=_make_mock_claude()):
            data = client.get("/nutrition/brief").json()
        assert data["requires_approval"] is True

    def test_claude_failure_returns_fallback(self):
        mock = MagicMock()
        mock.messages.create.side_effect = Exception("timeout")
        with patch("jarvis.api.routers.nutrition.anthropic.Anthropic",
                   return_value=mock):
            data = client.get("/nutrition/brief").json()
        assert "Unable to generate brief" in data["brief"]
        assert data["requires_approval"] is True

    def test_correct_model_used(self):
        mock = _make_mock_claude()
        with patch("jarvis.api.routers.nutrition.anthropic.Anthropic",
                   return_value=mock):
            client.get("/nutrition/brief")
        kwargs = mock.messages.create.call_args.kwargs
        assert kwargs["model"] == "claude-sonnet-4-6"


class NutritionRecoveryContractTests(unittest.TestCase):
    def test_status_exposes_truthful_adherence_fields(self):
        data = client.get("/nutrition/status").json()
        assert data["adherence_status"] in ("empty", "good", "warn", "miss")
        assert data["calorie_status"] in ("not_logged", "on_band", "too_low", "too_high")
        assert data["protein_status"] in ("not_logged", "on_track", "behind", "low")

    def test_status_exposes_recovery_protocol_without_medical_claim(self):
        data = client.get("/nutrition/status").json()
        protocol = data["recovery_protocol"]
        assert protocol["title"]
        assert protocol["medical_claim"] is False
        assert isinstance(protocol["checks"], list)

    def test_meal_history_has_date_specific_targets_and_adherence_status(self):
        data = client.get("/nutrition/log/meals/history?days=3").json()
        assert data["history"]
        row = data["history"][0]
        assert "target_calories" in row
        assert "target_protein_g" in row
        assert row["adherence_status"] in ("empty", "good", "warn", "miss")

class MealLoggingWorkflowTests(unittest.TestCase):
    def test_custom_manual_meal_can_be_logged_and_deleted(self):
        payload = {
            "item_id": "test-custom-meal",
            "item_type": "custom",
            "name": "Test Custom Meal",
            "servings": 1,
            "calories": 512,
            "protein_g": 42,
            "fat_g": 12,
            "carbs_g": 48,
            "source": "test",
        }
        created = client.post("/nutrition/log/meal", json=payload).json()
        assert created["status"] == "logged"
        meal_id = created["meal_id"]
        try:
            recent = client.get("/nutrition/log/meals/recent?limit=5").json()
            assert recent["count"] >= 1
            assert any(m["id"] == meal_id and m["name"] == "Test Custom Meal" for m in recent["meals"])
        finally:
            deleted = client.delete(f"/nutrition/log/meal/{meal_id}").json()
            assert deleted["status"] == "deleted"

    def test_recent_meals_route_respects_limit(self):
        data = client.get("/nutrition/log/meals/recent?limit=3").json()
        assert "meals" in data
        assert data["count"] <= 3


class AutonomousMealBuilderRouteTests(unittest.TestCase):
    def test_meal_builder_returns_suggestions(self):
        data = client.get("/nutrition/meal-builder").json()
        assert data["requires_approval"] is True
        assert "suggestions" in data
        assert isinstance(data["suggestions"], list)

    def test_meal_builder_suggestions_are_loggable_and_sourced(self):
        data = client.get("/nutrition/meal-builder").json()
        if data["suggestions"]:
            suggestion = data["suggestions"][0]
            assert suggestion["loggable"] is True
            assert suggestion["items"]
            assert suggestion["total"]["calories"] > 0
            assert suggestion["requires_approval"] is True

    def test_built_meal_can_be_logged_and_deleted(self):
        data = client.get("/nutrition/meal-builder").json()
        if not data["suggestions"]:
            self.skipTest("No proposal because day is near closed")
        suggestion = data["suggestions"][0]
        created = client.post(
            "/nutrition/log/built-meal",
            json={"suggestion_id": suggestion["id"]},
        ).json()
        assert created["status"] == "logged"
        assert created["requires_approval"] is True
        meal_id = created["meal_id"]
        try:
            assert created["total"]["calories"] == suggestion["total"]["calories"]
        finally:
            deleted = client.delete(f"/nutrition/log/meal/{meal_id}").json()
            assert deleted["status"] == "deleted"

    def test_built_meal_can_be_edited_with_slot_before_logging(self):
        data = client.get("/nutrition/meal-builder").json()
        if not data["suggestions"]:
            self.skipTest("No proposal because day is near closed")
        suggestion = data["suggestions"][0]
        item = dict(suggestion["items"][0])
        original_calories = item["calories"]
        item["servings"] = round(item["servings"] + 0.5, 2)
        item["calories"] = round(original_calories + 55, 1)
        item["protein_g"] = round(item["protein_g"] + 10, 1)
        item["fat_g"] = round(item["fat_g"] + 1, 1)
        item["carbs_g"] = round(item["carbs_g"] + 2, 1)
        item["price_eur"] = round(item.get("price_eur", 0) + 0.25, 2)
        created = client.post(
            "/nutrition/log/built-meal",
            json={
                "suggestion_id": suggestion["id"],
                "title": "Edited test meal",
                "meal_slot": "dinner",
                "items": [item],
            },
        ).json()
        assert created["status"] == "logged"
        assert created["edited"] is True
        assert created["meal_slot"] == "dinner"
        assert created["total"]["calories"] == item["calories"]
        assert "Dinner" in created["name"]
        meal_id = created["meal_id"]
        try:
            status = client.get("/nutrition/status").json()
            meal = next(m for m in status["meal_log"] if m["id"] == meal_id)
            assert meal["source"] == "phoenix_autonomous_builder:dinner:edited"
        finally:
            deleted = client.delete(f"/nutrition/log/meal/{meal_id}").json()
            assert deleted["status"] == "deleted"

    def test_built_meal_rejects_empty_edited_items(self):
        data = client.get("/nutrition/meal-builder").json()
        if not data["suggestions"]:
            self.skipTest("No proposal because day is near closed")
        suggestion = data["suggestions"][0]
        response = client.post(
            "/nutrition/log/built-meal",
            json={"suggestion_id": suggestion["id"], "items": []},
        )
        assert response.status_code == 400


class FullDayPlannerRouteTests(unittest.TestCase):
    def test_day_plan_returns_approval_first_plan(self):
        data = client.get("/nutrition/day-plan").json()
        assert data["requires_approval"] is True
        assert "meals" in data
        assert "planned_total" in data
        assert "remaining_target" in data

    def test_day_plan_meals_are_loggable_when_present(self):
        data = client.get("/nutrition/day-plan").json()
        if data["meals"]:
            meal = data["meals"][0]
            assert meal["loggable"] is True
            assert meal["items"]
            assert meal["total"]["calories"] > 0

    def test_day_plan_can_be_logged_and_deleted(self):
        data = client.get("/nutrition/day-plan").json()
        if not data["meals"]:
            self.skipTest("No plan because day is near closed")
        created = client.post("/nutrition/log/day-plan", json={"plan_id": data["plan_id"]}).json()
        assert created["status"] == "logged"
        assert created["requires_approval"] is True
        assert created["meal_count"] == len(data["meals"])
        assert created["total"]["calories"] > 0
        try:
            for meal in created["meals"]:
                status = client.get("/nutrition/status").json()
                logged = next(m for m in status["meal_log"] if m["id"] == meal["meal_id"])
                assert logged["source"].startswith("phoenix_full_day_planner:")
        finally:
            for meal in created["meals"]:
                deleted = client.delete(f"/nutrition/log/meal/{meal['meal_id']}").json()
                assert deleted["status"] == "deleted"

    def test_day_plan_rejects_empty_edited_meals(self):
        data = client.get("/nutrition/day-plan").json()
        if not data["meals"]:
            self.skipTest("No plan because day is near closed")
        response = client.post(
            "/nutrition/log/day-plan",
            json={
                "plan_id": data["plan_id"],
                "meals": [{"meal_id": "bad", "slot": "lunch", "title": "Bad", "items": []}],
            },
        )
        assert response.status_code in (400, 422)


class NutritionMemoryRouteTests(unittest.TestCase):
    def test_memory_can_be_saved_listed_and_deleted(self):
        payload = {
            "kind": "preferred",
            "item_id": "test-memory-skyr",
            "item_type": "staple",
            "name": "Test Memory Skyr",
            "note": "route test",
            "payload": {"protein_g": 20},
        }
        created = client.post("/nutrition/memory", json=payload).json()
        assert created["status"] == "saved"
        entry = created["entry"]
        try:
            listed = client.get("/nutrition/memory").json()
            assert listed["summary"]["preferred_count"] >= 1
            assert any(e["id"] == entry["id"] for e in listed["entries"])
        finally:
            deleted = client.delete(f"/nutrition/memory/{entry['id']}").json()
            assert deleted["status"] == "deleted"

    def test_memory_rejects_unknown_kind(self):
        response = client.post("/nutrition/memory", json={"kind": "unknown", "name": "Bad"})
        assert response.status_code == 400

    def test_meal_builder_exposes_memory_summary(self):
        created = client.post(
            "/nutrition/memory",
            json={"kind": "dislike", "item_id": "test-avoid", "item_type": "staple", "name": "Test Avoid"},
        ).json()
        entry_id = created["entry"]["id"]
        try:
            data = client.get("/nutrition/meal-builder").json()
            assert "memory" in data
            assert data["memory"]["avoid_count"] >= 1
        finally:
            client.delete(f"/nutrition/memory/{entry_id}")

    def test_repeat_yesterday_preview_route_shape(self):
        data = client.get("/nutrition/repeat/yesterday").json()
        assert "source_date" in data
        assert "target_date" in data
        assert "requires_approval" in data
        assert "meals" in data

    def test_repeat_yesterday_can_log_when_yesterday_has_meals(self):
        from datetime import date, timedelta
        yesterday = (date.today() - timedelta(days=1)).isoformat()
        created_source = client.post(
            "/nutrition/log/meal",
            json={
                "log_date": yesterday,
                "item_id": "test-yesterday-meal",
                "item_type": "custom",
                "name": "Test Yesterday Meal",
                "servings": 1,
                "calories": 222,
                "protein_g": 22,
                "fat_g": 4,
                "carbs_g": 20,
                "source": "test",
            },
        ).json()
        logged_ids = []
        try:
            repeated = client.post("/nutrition/log/repeat-yesterday").json()
            assert repeated["status"] == "logged"
            assert repeated["meal_count"] >= 1
            logged_ids = [meal["meal_id"] for meal in repeated["meals"]]
        finally:
            client.delete(f"/nutrition/log/meal/{created_source['meal_id']}")
            for meal_id in logged_ids:
                client.delete(f"/nutrition/log/meal/{meal_id}")


class NutritionShoppingListRouteTests(unittest.TestCase):
    def test_day_plan_shopping_list_route(self):
        data = client.get("/nutrition/shopping-list").json()
        assert data["source"] == "day_plan"
        assert data["requires_approval"] is True
        assert "need_to_buy" in data
        assert "already_have" in data
        assert "estimated_missing_cost_eur" in data

    def test_meal_builder_shopping_list_route(self):
        builder = client.get("/nutrition/meal-builder").json()
        if not builder["suggestions"]:
            self.skipTest("No proposal because day is near closed")
        suggestion_id = builder["suggestions"][0]["id"]
        data = client.get(f"/nutrition/shopping-list?source=meal_builder&suggestion_id={suggestion_id}").json()
        assert data["source"] == "meal_builder"
        assert data["source_title"] == builder["suggestions"][0]["title"]
        assert data["count"] >= 1

    def test_shopping_list_uses_pantry_memory(self):
        created = client.post(
            "/nutrition/memory",
            json={"kind": "pantry", "item_id": "lidl_001", "item_type": "staple", "name": "Chicken Breast"},
        ).json()
        entry_id = created["entry"]["id"]
        try:
            data = client.get("/nutrition/shopping-list?source=day_plan").json()
            assert data["memory"]["pantry_count"] >= 1
            assert any(item["item_id"] == "lidl_001" for item in data["already_have"] + data["items"])
        finally:
            client.delete(f"/nutrition/memory/{entry_id}")


class WeeklyMealPrepRouteTests(unittest.TestCase):
    def test_weekly_plan_route_returns_approval_first_plan(self):
        data = client.get("/nutrition/weekly-plan?days=5").json()
        assert data["mode"] == "weekly_meal_prep"
        assert data["requires_approval"] is True
        assert data["day_count"] == 5
        assert len(data["days"]) == 5
        assert "shopping_list" in data
        assert "batch_prep" in data

    def test_weekly_plan_route_enforces_day_bounds(self):
        assert client.get("/nutrition/weekly-plan?days=2").status_code == 422
        assert client.get("/nutrition/weekly-plan?days=8").status_code == 422

    def test_weekly_plan_can_log_and_delete(self):
        data = client.get("/nutrition/weekly-plan?days=3").json()
        if not data["days"]:
            self.skipTest("No weekly plan returned")
        payload_days = []
        for day in data["days"][:1]:
            if day["meals"]:
                payload_days.append({
                    "date": day["date"],
                    "meals": [day["meals"][0]],
                })
        if not payload_days:
            self.skipTest("No weekly meals to log")
        created = client.post(
            "/nutrition/log/weekly-plan",
            json={"plan_id": data["plan_id"], "days": payload_days},
        ).json()
        assert created["status"] == "logged"
        assert created["requires_approval"] is True
        assert created["day_count"] == 1
        assert created["meal_count"] == 1
        meal_id = created["days"][0]["meals"][0]["meal_id"]
        try:
            deleted = client.delete(f"/nutrition/log/meal/{meal_id}").json()
            assert deleted["status"] == "deleted"
        finally:
            pass


class NutritionAcceptanceGateRouteTests(unittest.TestCase):
    def test_acceptance_gate_returns_pass_verdict(self):
        data = client.get("/nutrition/acceptance-gate").json()
        assert data["mode"] == "nutrition_acceptance_gate"
        assert data["version"] == "v2.0"
        assert data["verdict"] == "PASS"
        assert data["ready_for_calendar_aware_nutrition"] is True

    def test_acceptance_gate_contracts_are_local_and_approval_first(self):
        data = client.get("/nutrition/acceptance-gate").json()
        contracts = data["contracts"]
        assert contracts["local_first"] is True
        assert contracts["approval_first"] is True
        assert contracts["ai_provider_required"] is False
        assert contracts["no_auto_logging"] is True
        assert contracts["no_auto_purchasing"] is True

    def test_acceptance_gate_inventory_counts(self):
        data = client.get("/nutrition/acceptance-gate").json()
        assert data["inventory"]["recipes"] == 156
        assert data["inventory"]["staples"] == 60
        assert data["inventory"]["batch_or_unit_recipes"] >= 120

    def test_acceptance_gate_checks_required_regressions(self):
        data = client.get("/nutrition/acceptance-gate").json()
        keys = {check["key"] for check in data["checks"]}
        required = {
            "food_brain_inventory",
            "recipe_serving_safety",
            "truthful_empty_day_contract",
            "autonomous_meal_builder",
            "full_day_planner",
            "shopping_list_contract",
            "weekly_meal_prep_contract",
            "no_fake_nutrition_data_regression",
        }
        assert required.issubset(keys)

    def test_acceptance_gate_report_has_no_blockers(self):
        data = client.get("/nutrition/acceptance-gate").json()
        assert data["blockers"] == []
        assert data["checks_passed"] == data["checks_total"]

    def test_acceptance_gate_exposes_api_contract(self):
        data = client.get("/nutrition/acceptance-gate").json()
        api_contract = data["api_contract"]
        for name in ["status", "meal_builder", "day_plan", "shopping_list", "weekly_plan", "acceptance_gate"]:
            assert name in api_contract
            assert api_contract[name].startswith("/nutrition/")

    def test_acceptance_gate_does_not_log_food(self):
        before = client.get("/nutrition/status").json()["meal_log"]
        client.get("/nutrition/acceptance-gate")
        after = client.get("/nutrition/status").json()["meal_log"]
        assert len(after) == len(before)

    def test_acceptance_gate_ready_for_calendar_next(self):
        data = client.get("/nutrition/acceptance-gate").json()
        assert data["ready_for_calendar_aware_nutrition"] is True
        assert data["contracts"]["home_and_finance_untouched"] is True

class NutritionCalendarBridgeRouteTests(unittest.TestCase):
    def test_calendar_bridge_returns_200(self):
        assert client.get("/nutrition/calendar-bridge").status_code == 200

    def test_calendar_bridge_is_safe_and_read_only(self):
        data = client.get("/nutrition/calendar-bridge?days=3").json()
        assert data["mode"] == "calendar_aware_nutrition_bridge"
        assert data["live_plaan_fetch_enabled"] is False
        assert data["ai_provider_required"] is False
        assert data["requires_approval"] is True
        assert data["safety"]["no_plaan_mutations"] is True
        assert data["safety"]["no_raw_page_sent_to_ai"] is True
        assert len(data["days"]) == 3

    def test_calendar_bridge_uses_existing_live_snapshot_contract(self):
        data = client.get("/nutrition/calendar-bridge?days=7").json()
        assert data["source"] == "calendar_snapshot_contract"
        assert "fetch_warnings" in data
        assert "counts" in data

class NutritionCalendarLiveBridgeTests(unittest.TestCase):
    def test_calendar_bridge_exposes_plaan_source_boundary(self):
        data = client.get("/nutrition/calendar-bridge").json()
        assert "calendar_source" in data
        assert data["calendar_source"]["read_only"] is True
        assert data["calendar_source"]["mutations_allowed"] is False
        assert data["calendar_source"]["raw_page_sent_to_ai"] is False
        assert data["plaan_live_fetcher"]["stage"] == "v2.3_manual_snapshot_import"
