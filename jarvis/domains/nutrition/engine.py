from pathlib import Path
from datetime import date
import json

from jarvis.domains.nutrition.data_contracts import (
    MacroTarget, Recipe, LidlStaple, LoggedItem, DailyLog, NutritionStatus,
)

_DOMAIN_DIR = Path(__file__).parent
_RECIPES_PATH = _DOMAIN_DIR / "recipes.json"
_STAPLES_PATH = _DOMAIN_DIR / "lidl_staples.json"

_DAY_NAMES = ["monday", "tuesday", "wednesday", "thursday",
              "friday", "saturday", "sunday"]


def load_recipes(path: Path | None = None) -> list[Recipe]:
    p = path or _RECIPES_PATH
    with open(p) as f:
        data = json.load(f)
    return [Recipe(**r) for r in data]


def load_lidl_staples(path: Path | None = None) -> list[LidlStaple]:
    p = path or _STAPLES_PATH
    with open(p) as f:
        data = json.load(f)
    return [LidlStaple(**s) for s in data]


def get_current_phase(constitution: dict, today: date) -> str:
    phases = constitution["phases"]
    cut_end = date.fromisoformat(phases["cut"]["end_date"])
    if today <= cut_end:
        return "cut"
    return "peak"


def is_training_day(constitution: dict, today: date) -> bool:
    day_name = _DAY_NAMES[today.weekday()]
    return day_name in constitution["training_days"]


def get_macro_target(constitution: dict, today: date) -> MacroTarget:
    phase = get_current_phase(constitution, today)
    training = is_training_day(constitution, today)
    day_key = "training_day" if training else "rest_day"
    targets = constitution["phases"][phase][day_key]
    return MacroTarget(
        calories=targets["calories"],
        protein_g=targets["protein_g"],
        carbs_g=targets["carbs_g"],
        fat_g=targets["fat_g"],
    )


def build_daily_log(items: list[dict], log_date: date) -> DailyLog:
    logged_items = tuple(LoggedItem(**item) for item in items)
    total_cal = sum(i.calories for i in logged_items)
    total_prot = sum(i.protein_g for i in logged_items)
    total_fat = sum(i.fat_g for i in logged_items)
    total_carbs = sum(i.carbs_g for i in logged_items)
    return DailyLog(
        date=log_date,
        items=logged_items,
        total_calories=total_cal,
        total_protein_g=total_prot,
        total_fat_g=total_fat,
        total_carbs_g=total_carbs,
    )


def suggest_recipes(
    recipes: list[Recipe],
    remaining_calories: float,
    remaining_protein_g: float,
) -> list[Recipe]:
    if remaining_calories < 100:
        return []
    candidates = [
        r for r in recipes
        if r.calories <= remaining_calories
        and r.protein_g <= remaining_protein_g * 1.2
    ]
    candidates.sort(key=lambda r: r.protein_g, reverse=True)
    return candidates[:3]


def log_item(
    item_id: str,
    item_type: str,
    servings: float,
    recipes: list[Recipe],
    staples: list[LidlStaple],
) -> LoggedItem:
    if item_type == "recipe":
        found = next((r for r in recipes if r.id == item_id), None)
        if not found:
            raise ValueError(f"Recipe not found: {item_id}")
        return LoggedItem(
            item_id=item_id,
            item_type="recipe",
            name=found.name,
            servings=servings,
            calories=found.calories * servings,
            protein_g=found.protein_g * servings,
            fat_g=found.fat_g * servings,
            carbs_g=found.carbs_g * servings,
        )
    elif item_type == "staple":
        found = next((s for s in staples if s.id == item_id), None)
        if not found:
            raise ValueError(f"Staple not found: {item_id}")
        return LoggedItem(
            item_id=item_id,
            item_type="staple",
            name=found.name,
            servings=servings,
            calories=found.calories * servings,
            protein_g=found.protein_g * servings,
            fat_g=found.fat_g * servings,
            carbs_g=found.carbs_g * servings,
        )
    else:
        raise ValueError(f"item_type must be 'recipe' or 'staple', got: {item_type}")


def check_nutrition(
    constitution: dict,
    daily_log_items: list[dict],
    today: date | None = None,
) -> NutritionStatus:
    if today is None:
        today = date.today()

    target = get_macro_target(constitution, today)
    log = build_daily_log(daily_log_items, today)

    remaining_cal = target.calories - log.total_calories
    remaining_prot = target.protein_g - log.total_protein_g
    remaining_fat = target.fat_g - log.total_fat_g
    remaining_carbs = target.carbs_g - log.total_carbs_g

    recipes = load_recipes()
    suggestions = suggest_recipes(recipes, remaining_cal, remaining_prot)

    return NutritionStatus(
        as_of=today,
        phase=get_current_phase(constitution, today),
        is_training_day=is_training_day(constitution, today),
        target=target,
        logged=log,
        remaining_calories=remaining_cal,
        remaining_protein_g=remaining_prot,
        remaining_fat_g=remaining_fat,
        remaining_carbs_g=remaining_carbs,
        protein_target_met=log.total_protein_g >= target.protein_g,
        calorie_target_met=log.total_calories >= target.calories * 0.95,
        suggested_recipes=tuple(suggestions),
    )
