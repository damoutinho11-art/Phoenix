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


class StaplesLoadTests(unittest.TestCase):
    def test_load_staples_returns_list(self):
        staples = engine.load_lidl_staples()
        assert isinstance(staples, list)

    def test_load_staples_count(self):
        staples = engine.load_lidl_staples()
        assert len(staples) == 25

    def test_staple_has_price(self):
        staples = engine.load_lidl_staples()
        assert all(s.price_eur > 0 for s in staples)

    def test_chicken_breast_protein(self):
        staples = engine.load_lidl_staples()
        chicken = next(s for s in staples if s.id == "lidl_001")
        assert chicken.protein_g == 31.0


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

    def test_filters_by_calories(self):
        result = engine.suggest_recipes(self.recipes, 300, 200)
        assert all(r.calories <= 300 for r in result)

    def test_sorted_by_protein_descending(self):
        result = engine.suggest_recipes(self.recipes, 2000, 200)
        if len(result) > 1:
            assert result[0].protein_g >= result[1].protein_g


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
