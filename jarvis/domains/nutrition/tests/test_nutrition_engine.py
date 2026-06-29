import json
import unittest
from datetime import date
from pathlib import Path

from jarvis.domains.nutrition import engine
from jarvis.domains.nutrition.data_contracts import MacroTarget, NutritionStatus
from jarvis.domains.nutrition.tests.fixtures import (
    CUT_TRAINING_DATE, CUT_REST_DATE, PEAK_DATE,
    SAMPLE_LOG_ITEMS, EMPTY_LOG_ITEMS,
)

_CONST_PATH = Path(__file__).parent.parent / "constitution.json"
with open(_CONST_PATH) as f:
    CONSTITUTION = json.load(f)


class PhaseTests(unittest.TestCase):
    def test_get_current_phase_cut(self):
        assert engine.get_current_phase(CONSTITUTION, CUT_TRAINING_DATE) == "cut"

    def test_get_current_phase_peak(self):
        assert engine.get_current_phase(CONSTITUTION, PEAK_DATE) == "peak"

    def test_cut_ends_aug_17(self):
        assert engine.get_current_phase(CONSTITUTION, date(2026, 8, 17)) == "cut"

    def test_peak_starts_aug_18(self):
        assert engine.get_current_phase(CONSTITUTION, date(2026, 8, 18)) == "peak"


class TrainingDayTests(unittest.TestCase):
    def test_monday_is_training(self):
        assert engine.is_training_day(CONSTITUTION, CUT_TRAINING_DATE) is True

    def test_wednesday_is_training(self):
        assert engine.is_training_day(CONSTITUTION, date(2026, 6, 24)) is True

    def test_saturday_is_training(self):
        assert engine.is_training_day(CONSTITUTION, date(2026, 6, 27)) is True

    def test_friday_is_not_training(self):
        assert engine.is_training_day(CONSTITUTION, CUT_REST_DATE) is False

    def test_tuesday_is_not_training(self):
        assert engine.is_training_day(CONSTITUTION, date(2026, 6, 23)) is False


class MacroTargetTests(unittest.TestCase):
    def test_cut_training_day_calories(self):
        target = engine.get_macro_target(CONSTITUTION, CUT_TRAINING_DATE)
        assert target.calories == 2400

    def test_cut_rest_day_calories(self):
        target = engine.get_macro_target(CONSTITUTION, CUT_REST_DATE)
        assert target.calories == 2000

    def test_cut_training_day_protein(self):
        target = engine.get_macro_target(CONSTITUTION, CUT_TRAINING_DATE)
        assert target.protein_g == 165

    def test_cut_rest_day_protein(self):
        target = engine.get_macro_target(CONSTITUTION, CUT_REST_DATE)
        assert target.protein_g == 165

    def test_peak_calories_same_both_days(self):
        monday = engine.get_macro_target(CONSTITUTION, date(2026, 8, 24))
        friday = engine.get_macro_target(CONSTITUTION, date(2026, 8, 21))
        assert monday.calories == friday.calories == 2700

    def test_returns_macro_target_type(self):
        target = engine.get_macro_target(CONSTITUTION, CUT_TRAINING_DATE)
        assert isinstance(target, MacroTarget)


class RecipeLoadTests(unittest.TestCase):
    def test_load_recipes_returns_list(self):
        recipes = engine.load_recipes()
        assert isinstance(recipes, list)

    def test_load_recipes_count(self):
        recipes = engine.load_recipes()
        assert len(recipes) == 156

    def test_first_recipe_has_correct_fields(self):
        recipes = engine.load_recipes()
        r = recipes[0]
        assert hasattr(r, 'id')
        assert hasattr(r, 'name')
        assert hasattr(r, 'calories')
        assert hasattr(r, 'protein_g')

    def test_recipe_egg_white_bites_macros(self):
        recipes = engine.load_recipes()
        ewb = next(r for r in recipes if r.id == "recipe_012")
        assert ewb.calories == 410
        assert ewb.protein_g == 72


class RecipeServingProfileTests(unittest.TestCase):
    def setUp(self):
        self.recipes = engine.load_recipes()

    def test_entire_batch_recipe_gets_loggable_servings(self):
        apple_bake = next(r for r in self.recipes if r.id == "recipe_001")
        profile = engine.build_recipe_serving_profile(apple_bake)
        assert profile["is_batch_recipe"] is True
        assert profile["serving_count"] > 1
        assert profile["calories"] < profile["full_calories"]

    def test_single_serving_recipe_stays_single(self):
        french_toast = next(r for r in self.recipes if r.id == "recipe_002")
        profile = engine.build_recipe_serving_profile(french_toast)
        assert profile["serving_count"] == 1
        assert profile["calories"] == 400

    def test_muffin_recipe_gets_unit_servings(self):
        muffins = next(r for r in self.recipes if r.id == "recipe_031")
        profile = engine.build_recipe_serving_profile(muffins)
        assert profile["serving_count"] == 12
        assert profile["portion_unit"] == "muffin"
        assert profile["calories"] == 50
        assert profile["serving_basis"] == "declared_units"

    def test_recipe_profile_exposes_food_brain_tags(self):
        apple_bake = next(r for r in self.recipes if r.id == "recipe_001")
        profile = engine.build_recipe_serving_profile(apple_bake)
        assert "BATCH PREP" in profile["tags"]
        assert profile["serving_note"]


class StaplesLoadTests(unittest.TestCase):
    def test_load_staples_returns_list(self):
        staples = engine.load_lidl_staples()
        assert isinstance(staples, list)

    def test_load_staples_count(self):
        staples = engine.load_lidl_staples()
        assert len(staples) == 60

    def test_staple_has_price(self):
        staples = engine.load_lidl_staples()
        assert all(s.price_eur > 0 for s in staples)

    def test_chicken_breast_protein(self):
        staples = engine.load_lidl_staples()
        chicken = next(s for s in staples if s.id == "lidl_001")
        assert chicken.protein_g == 31.0

    def test_expanded_staples_include_recovery_foods(self):
        staples = engine.load_lidl_staples()
        names = {s.name for s in staples}
        assert "High Protein Skyr" in names
        assert "Salmon Fillet" in names
        assert "Tart Cherry Juice" in names

    def test_staple_food_brain_tags(self):
        staples = engine.load_lidl_staples()
        salmon = next(s for s in staples if s.id == "lidl_027")
        assert engine._staple_category(salmon) == "protein"
        assert "RECOVERY" in engine._staple_tags(salmon)


class DailyLogTests(unittest.TestCase):
    def test_empty_log_zeros(self):
        log = engine.build_daily_log(EMPTY_LOG_ITEMS, CUT_TRAINING_DATE)
        assert log.total_calories == 0
        assert log.total_protein_g == 0

    def test_log_sums_macros_correctly(self):
        log = engine.build_daily_log(SAMPLE_LOG_ITEMS, CUT_TRAINING_DATE)
        assert log.total_calories == 410
        assert log.total_protein_g == 72

    def test_log_date_correct(self):
        log = engine.build_daily_log(EMPTY_LOG_ITEMS, CUT_TRAINING_DATE)
        assert log.date == CUT_TRAINING_DATE

    def test_log_item_count(self):
        log = engine.build_daily_log(SAMPLE_LOG_ITEMS, CUT_TRAINING_DATE)
        assert len(log.items) == 1


class SuggestRecipesTests(unittest.TestCase):
    def setUp(self):
        self.recipes = engine.load_recipes()

    def test_returns_max_3(self):
        result = engine.suggest_recipes(self.recipes, 1000, 100)
        assert len(result) <= 3

    def test_empty_when_calories_too_low(self):
        result = engine.suggest_recipes(self.recipes, 50, 100)
        assert result == []

    def test_filters_by_loggable_serving_calories(self):
        result = engine.suggest_recipes(self.recipes, 300, 200)
        assert all(engine.build_recipe_serving_profile(r)["calories"] <= 300 for r in result)

    def test_sorted_by_serving_score_not_raw_batch_size(self):
        result = engine.suggest_recipes(self.recipes, 2000, 200)
        if len(result) > 1:
            first = engine.build_recipe_serving_profile(result[0])
            second = engine.build_recipe_serving_profile(result[1])
            assert first["protein_g"] / max(1, first["calories"]) >= second["protein_g"] / max(1, second["calories"])


class LogItemTests(unittest.TestCase):
    def setUp(self):
        self.recipes = engine.load_recipes()
        self.staples = engine.load_lidl_staples()

    def test_log_recipe_scales_macros(self):
        item = engine.log_item("recipe_012", "recipe", 0.5,
                               self.recipes, self.staples)
        assert item.calories == 205.0
        assert item.protein_g == 36.0

    def test_log_staple_scales_macros(self):
        item = engine.log_item("lidl_001", "staple", 2.0,
                               self.recipes, self.staples)
        assert item.calories == 330.0
        assert item.protein_g == 62.0

    def test_log_batch_recipe_uses_loggable_serving_not_full_batch(self):
        item = engine.log_item("recipe_001", "recipe", 1.0,
                               self.recipes, self.staples)
        assert item.calories < 1000
        assert item.protein_g < 100

    def test_log_item_raises_on_unknown_recipe(self):
        with self.assertRaises(ValueError):
            engine.log_item("recipe_999", "recipe", 1.0,
                            self.recipes, self.staples)

    def test_log_item_raises_on_unknown_staple(self):
        with self.assertRaises(ValueError):
            engine.log_item("lidl_999", "staple", 1.0,
                            self.recipes, self.staples)

    def test_log_item_raises_on_bad_type(self):
        with self.assertRaises(ValueError):
            engine.log_item("recipe_012", "unknown", 1.0,
                            self.recipes, self.staples)


class CheckNutritionTests(unittest.TestCase):
    def test_returns_nutrition_status(self):
        status = engine.check_nutrition(CONSTITUTION, EMPTY_LOG_ITEMS,
                                        today=CUT_TRAINING_DATE)
        assert isinstance(status, NutritionStatus)

    def test_correct_phase(self):
        status = engine.check_nutrition(CONSTITUTION, EMPTY_LOG_ITEMS,
                                        today=CUT_TRAINING_DATE)
        assert status.phase == "cut"

    def test_correct_training_day_flag(self):
        status = engine.check_nutrition(CONSTITUTION, EMPTY_LOG_ITEMS,
                                        today=CUT_TRAINING_DATE)
        assert status.is_training_day is True

    def test_remaining_calories_correct_empty_log(self):
        status = engine.check_nutrition(CONSTITUTION, EMPTY_LOG_ITEMS,
                                        today=CUT_TRAINING_DATE)
        assert status.remaining_calories == 2400

    def test_remaining_protein_reduces_after_logging(self):
        status = engine.check_nutrition(CONSTITUTION, SAMPLE_LOG_ITEMS,
                                        today=CUT_TRAINING_DATE)
        assert status.remaining_protein_g == 165 - 72

    def test_protein_target_not_met_empty_log(self):
        status = engine.check_nutrition(CONSTITUTION, EMPTY_LOG_ITEMS,
                                        today=CUT_TRAINING_DATE)
        assert status.protein_target_met is False

    def test_suggested_recipes_present(self):
        status = engine.check_nutrition(CONSTITUTION, EMPTY_LOG_ITEMS,
                                        today=CUT_TRAINING_DATE)
        assert isinstance(status.suggested_recipes, tuple)


class NutritionAdherenceClassificationTests(unittest.TestCase):
    def test_empty_day_is_not_marked_good(self):
        target = MacroTarget(calories=2000, protein_g=165, carbs_g=160, fat_g=60)
        result = engine.classify_nutrition_day(None, None, target)
        assert result["adherence_status"] == "empty"
        assert result["calorie_status"] == "not_logged"

    def test_under_eating_does_not_count_as_target_met(self):
        target = MacroTarget(calories=2000, protein_g=165, carbs_g=160, fat_g=60)
        result = engine.classify_nutrition_day(1200, 130, target)
        assert result["adherence_status"] == "miss"
        assert result["calorie_status"] == "too_low"

    def test_good_requires_calorie_band_and_protein(self):
        target = MacroTarget(calories=2000, protein_g=165, carbs_g=160, fat_g=60)
        result = engine.classify_nutrition_day(1980, 155, target)
        assert result["adherence_status"] == "good"
        assert result["protein_status"] == "on_track"


class AutonomousMealBuilderTests(unittest.TestCase):
    def setUp(self):
        self.recipes = engine.load_recipes()
        self.staples = engine.load_lidl_staples()

    def test_builder_returns_approval_first_suggestions(self):
        status = engine.check_nutrition(CONSTITUTION, EMPTY_LOG_ITEMS,
                                        today=CUT_REST_DATE)
        result = engine.build_autonomous_meal_suggestions(
            status, self.staples, self.recipes
        )
        assert result["requires_approval"] is True
        assert result["suggestions"]
        assert all(s["requires_approval"] is True for s in result["suggestions"])

    def test_builder_suggestions_have_macro_totals_and_items(self):
        status = engine.check_nutrition(CONSTITUTION, EMPTY_LOG_ITEMS,
                                        today=CUT_REST_DATE)
        result = engine.build_autonomous_meal_suggestions(
            status, self.staples, self.recipes
        )
        suggestion = result["suggestions"][0]
        assert suggestion["items"]
        assert suggestion["total"]["calories"] > 0
        assert suggestion["total"]["protein_g"] > 0
        assert suggestion["loggable"] is True

    def test_builder_does_not_propose_full_meal_when_day_closed(self):
        target = engine.get_macro_target(CONSTITUTION, CUT_REST_DATE)
        nearly_closed = [{
            "item_id": "manual-close",
            "item_type": "custom",
            "name": "Nearly Closed Day",
            "servings": 1,
            "calories": target.calories - 50,
            "protein_g": target.protein_g,
            "fat_g": target.fat_g,
            "carbs_g": target.carbs_g,
        }]
        status = engine.check_nutrition(CONSTITUTION, nearly_closed,
                                        today=CUT_REST_DATE)
        result = engine.build_autonomous_meal_suggestions(
            status, self.staples, self.recipes
        )
        assert result["suggestions"] == []
        assert result["mode"] == "closed_day"


class FullDayPlannerTests(unittest.TestCase):
    def setUp(self):
        self.recipes = engine.load_recipes()
        self.staples = engine.load_lidl_staples()

    def test_full_day_plan_returns_approval_first_meals(self):
        status = engine.check_nutrition(CONSTITUTION, EMPTY_LOG_ITEMS, today=CUT_REST_DATE)
        plan = engine.build_full_day_plan(status, self.staples, self.recipes)
        assert plan["requires_approval"] is True
        assert plan["mode"] == "full_day_planner"
        assert plan["meals"]
        assert all(meal["requires_approval"] is True for meal in plan["meals"])
        assert plan["planned_total"]["calories"] > 0

    def test_training_day_plan_includes_post_training_logic(self):
        status = engine.check_nutrition(CONSTITUTION, EMPTY_LOG_ITEMS, today=CUT_TRAINING_DATE)
        plan = engine.build_full_day_plan(status, self.staples, self.recipes)
        slots = {meal["slot"] for meal in plan["meals"]}
        assert "post_training" in slots
        assert any("POST-TRAINING" in meal["tags"] for meal in plan["meals"])

    def test_full_day_plan_uses_expanded_food_brain(self):
        status = engine.check_nutrition(CONSTITUTION, EMPTY_LOG_ITEMS, today=CUT_TRAINING_DATE)
        plan = engine.build_full_day_plan(status, self.staples, self.recipes)
        item_names = {item["name"] for meal in plan["meals"] for item in meal["items"]}
        assert "High Protein Skyr" in item_names
        assert "Tart Cherry Juice" in item_names
        assert any(name in item_names for name in ["Salmon Fillet", "Cod Fillet"])

    def test_full_day_plan_closes_when_no_macro_room(self):
        target = engine.get_macro_target(CONSTITUTION, CUT_REST_DATE)
        full_log = [{
            "item_id": "closed", "item_type": "custom", "name": "Closed day",
            "servings": 1, "calories": target.calories - 50,
            "protein_g": target.protein_g, "fat_g": target.fat_g, "carbs_g": target.carbs_g,
        }]
        status = engine.check_nutrition(CONSTITUTION, full_log, today=CUT_REST_DATE)
        plan = engine.build_full_day_plan(status, self.staples, self.recipes)
        assert plan["mode"] == "day_near_closed"
        assert plan["meals"] == []


class NutritionMemoryEngineTests(unittest.TestCase):
    def setUp(self):
        self.recipes = engine.load_recipes()
        self.staples = engine.load_lidl_staples()

    def test_memory_profile_counts_user_preferences(self):
        profile = engine.build_nutrition_memory_profile([
            {"kind": "favorite", "name": "High Protein Skyr", "item_id": "lidl_032"},
            {"kind": "dislike", "name": "Mushrooms", "item_id": "lidl_020"},
            {"kind": "pantry", "name": "Chicken Breast", "item_id": "lidl_001"},
        ])
        summary = engine.public_memory_summary(profile)
        assert summary["favorite_count"] == 1
        assert summary["avoid_count"] == 1
        assert summary["pantry_count"] == 1
        assert summary["active"] is True

    def test_builder_filters_avoided_foods(self):
        status = engine.check_nutrition(CONSTITUTION, EMPTY_LOG_ITEMS, today=CUT_REST_DATE)
        result = engine.build_autonomous_meal_suggestions(
            status,
            self.staples,
            self.recipes,
            memory_entries=[{"kind": "dislike", "name": "Chicken Breast", "item_id": "lidl_001"}],
        )
        for suggestion in result["suggestions"]:
            names = {item["name"] for item in suggestion["items"]}
            assert "Chicken Breast" not in names
        assert result["memory"]["avoid_count"] == 1

    def test_builder_boosts_memory_matches(self):
        status = engine.check_nutrition(CONSTITUTION, EMPTY_LOG_ITEMS, today=CUT_TRAINING_DATE)
        result = engine.build_autonomous_meal_suggestions(
            status,
            self.staples,
            self.recipes,
            memory_entries=[{"kind": "preferred", "name": "High Protein Skyr", "item_id": "lidl_032"}],
        )
        assert result["memory"]["preferred_count"] == 1
        assert any("MEMORY MATCH" in suggestion.get("tags", []) for suggestion in result["suggestions"])

    def test_day_plan_removes_avoided_ingredients(self):
        status = engine.check_nutrition(CONSTITUTION, EMPTY_LOG_ITEMS, today=CUT_TRAINING_DATE)
        plan = engine.build_full_day_plan(
            status,
            self.staples,
            self.recipes,
            memory_entries=[{"kind": "dislike", "name": "Tart Cherry Juice", "item_id": "lidl_060"}],
        )
        item_names = {item["name"] for meal in plan["meals"] for item in meal["items"]}
        assert "Tart Cherry Juice" not in item_names
        assert plan["memory"]["avoid_count"] == 1


class NutritionShoppingListTests(unittest.TestCase):
    def test_shopping_list_groups_items_and_marks_pantry(self):
        items = [
            {"item_id": "lidl_001", "item_type": "staple", "name": "Chicken Breast", "unit": "100g", "servings": 1, "calories": 165, "protein_g": 31, "fat_g": 3.6, "carbs_g": 0, "price_eur": 1.29},
            {"item_id": "lidl_001", "item_type": "staple", "name": "Chicken Breast", "unit": "100g", "servings": 1.5, "calories": 247.5, "protein_g": 46.5, "fat_g": 5.4, "carbs_g": 0, "price_eur": 1.94},
            {"item_id": "lidl_009", "item_type": "staple", "name": "Rolled Oats", "unit": "100g", "servings": 0.5, "calories": 190, "protein_g": 6, "fat_g": 3.5, "carbs_g": 33, "price_eur": 0.2},
        ]
        shopping = engine.build_shopping_list_from_items(
            items,
            memory_entries=[{"kind": "pantry", "name": "Rolled Oats", "item_id": "lidl_009"}],
            source="test",
            source_title="Test list",
        )
        assert shopping["requires_approval"] is True
        assert shopping["count"] == 2
        chicken = next(item for item in shopping["need_to_buy"] if item["name"] == "Chicken Breast")
        assert chicken["servings"] == 2.5
        assert chicken["estimated_cost_eur"] == 3.23
        assert any(item["name"] == "Rolled Oats" for item in shopping["already_have"])
        assert "protein" in shopping["categories"]

    def test_shopping_list_exposes_budget_and_high_protein_baskets(self):
        status = engine.check_nutrition(CONSTITUTION, EMPTY_LOG_ITEMS, today=CUT_TRAINING_DATE)
        staples = engine.load_lidl_staples()
        recipes = engine.load_recipes()
        plan = engine.build_full_day_plan(status, staples, recipes)
        items = [item for meal in plan["meals"] for item in meal["items"]]
        shopping = engine.build_shopping_list_from_items(items, source="day_plan")
        assert shopping["need_to_buy_count"] > 0
        assert "budget_basket" in shopping
        assert "high_protein_basket" in shopping
        assert shopping["estimated_missing_cost_eur"] >= 0


class WeeklyMealPrepTests(unittest.TestCase):
    def setUp(self):
        self.staples = engine.load_lidl_staples()
        self.recipes = engine.load_recipes()

    def test_weekly_meal_prep_builds_approval_first_week(self):
        plan = engine.build_weekly_meal_prep_plan(
            CONSTITUTION,
            start_date=CUT_TRAINING_DATE,
            days=7,
            staples=self.staples,
            recipes=self.recipes,
            memory_entries=[],
        )
        assert plan["mode"] == "weekly_meal_prep"
        assert plan["requires_approval"] is True
        assert plan["day_count"] == 7
        assert len(plan["days"]) == 7
        assert plan["weekly_total"]["calories"] > 0
        assert "shopping_list" in plan
        assert "batch_prep" in plan

    def test_weekly_meal_prep_respects_day_bounds(self):
        plan = engine.build_weekly_meal_prep_plan(
            CONSTITUTION,
            start_date=CUT_TRAINING_DATE,
            days=99,
            staples=self.staples,
            recipes=self.recipes,
            memory_entries=[],
        )
        assert plan["day_count"] == 7

    def test_weekly_meal_prep_contains_training_split(self):
        plan = engine.build_weekly_meal_prep_plan(
            CONSTITUTION,
            start_date=CUT_TRAINING_DATE,
            days=5,
            staples=self.staples,
            recipes=self.recipes,
            memory_entries=[],
        )
        assert plan["training_split"]["training_days"] >= 1
        assert plan["training_split"]["rest_days"] >= 1
