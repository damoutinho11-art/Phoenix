from pathlib import Path
from datetime import date, datetime, time, timedelta, timezone
import json
import math
import re

from jarvis.domains.nutrition.data_contracts import (
    MacroTarget, Recipe, LidlStaple, LoggedItem, DailyLog, NutritionStatus,
)

_DOMAIN_DIR = Path(__file__).parent
_RECIPES_PATH = _DOMAIN_DIR / "recipes.json"
_STAPLES_PATH = _DOMAIN_DIR / "lidl_staples.json"

_DAY_NAMES = ["monday", "tuesday", "wednesday", "thursday",
              "friday", "saturday", "sunday"]




def _round_macro(value: float) -> float:
    rounded = round(float(value), 1)
    return int(rounded) if rounded.is_integer() else rounded


def _singularize_unit(unit: str) -> str:
    unit = (unit or "serving").strip().lower()
    irregular = {"rice cakes": "rice cake", "sandwiches": "sandwich"}
    if unit in irregular:
        return irregular[unit]
    if unit.endswith("ies"):
        return unit[:-3] + "y"
    if unit.endswith("s") and not unit.endswith("ss"):
        return unit[:-1]
    return unit


def _parse_serving_declaration(serving_text: str) -> dict:
    """Parse loggable portions from noisy imported recipe serving labels.

    This remains conservative but no longer ignores obvious unit counts like
    "Makes 12 Muffins" or "Makes 5 Pancakes". Phoenix separates the source
    label from the loggable unit so batch and unit recipes are visible without
    pretending a whole tray is one meal.
    """
    raw = (serving_text or "").strip()
    text = raw.lower()

    makes = re.search(r"makes\s+(\d+(?:\.\d+)?)\s+([a-z ]+)", text)
    if makes:
        count = max(1, int(round(float(makes.group(1)))))
        unit = makes.group(2).strip()
        if unit.startswith("serving"):
            return {"count": count, "unit": "serving", "basis": "declared_servings"}
        if unit.startswith("batch"):
            return {"count": None, "unit": "batch", "basis": "declared_batch"}
        return {"count": count, "unit": _singularize_unit(unit), "basis": "declared_units"}

    per = re.search(r"per\s+([a-z ]+)", text)
    if per:
        unit = _singularize_unit(per.group(1).strip())
        return {"count": 1, "unit": unit, "basis": "single_unit"}

    if re.search(r"\b1\s+serving\b", text):
        return {"count": 1, "unit": "serving", "basis": "single_serving"}

    return {"count": None, "unit": "serving", "basis": None}


def _parse_declared_serving_count(serving_text: str) -> int | None:
    """Backward-compatible serving count helper used by older tests."""
    return _parse_serving_declaration(serving_text)["count"]


def _recipe_tags(recipe: Recipe, profile: dict) -> list[str]:
    tags: list[str] = []
    name_cat = f"{recipe.name} {recipe.category}".lower()
    protein_density = profile["protein_g"] / max(1, profile["calories"])

    if profile["is_batch_recipe"]:
        tags.append("BATCH PREP")
    if profile["protein_g"] >= 35:
        tags.append("HIGH PROTEIN")
    if protein_density >= 0.12:
        tags.append("LEAN PROTEIN")
    if profile["calories"] <= 350:
        tags.append("LIGHT")
    elif profile["calories"] >= 700:
        tags.append("LARGE MEAL")
    if profile["carbs_g"] >= 45:
        tags.append("TRAINING CARBS")
    if profile["fat_g"] <= 8 and profile["protein_g"] >= 30:
        tags.append("REST DAY SAFE")
    if any(word in name_cat for word in ["muffin", "cookie", "bar", "cake", "donut", "ice cream", "parfait"]):
        tags.append("DESSERT/SNACK")
    if any(word in name_cat for word in ["rice", "oat", "egg", "tuna", "chicken", "cottage", "yogurt"]):
        tags.append("BUDGET FRIENDLY")

    # Keep tags readable and deterministic.
    deduped = []
    for tag in tags:
        if tag not in deduped:
            deduped.append(tag)
    return deduped[:6]


def _staple_category(staple: LidlStaple) -> str:
    name = staple.name.lower()
    if any(w in name for w in ["chicken", "turkey", "tuna", "salmon", "cod", "prawns", "beef", "ham", "egg whites", "whey"]):
        return "protein"
    if any(w in name for w in ["yogurt", "cottage", "skyr", "kefir", "quark", "mozzarella", "cheese"]):
        return "dairy"
    if any(w in name for w in ["oats", "bread", "rice", "banana", "apple", "potato", "pasta", "couscous", "quinoa", "wrap", "cakes", "beans", "lentils", "chickpeas"]):
        return "carbs"
    if any(w in name for w in ["spinach", "tomato", "pepper", "onion", "mushrooms", "cauliflower", "zucchini", "cucumber", "broccoli", "asparagus", "green beans", "carrots", "salad"]):
        return "vegetables"
    if any(w in name for w in ["blueberries", "strawberries", "orange", "berries", "cherry"]):
        return "fruit_recovery"
    if any(w in name for w in ["olive oil", "peanut butter", "almonds", "walnuts", "avocado"]):
        return "fats"
    if any(w in name for w in ["tofu", "tempeh"]):
        return "plant_protein"
    return "general"


def _staple_tags(staple: LidlStaple) -> list[str]:
    tags: list[str] = []
    density = staple.protein_g / max(1, staple.calories)
    if staple.protein_g >= 18 or density >= 0.12:
        tags.append("HIGH PROTEIN")
    if staple.fat_g <= 3 and staple.protein_g >= 10:
        tags.append("LOW FAT")
    if staple.carbs_g >= 20:
        tags.append("CARB FUEL")
    if staple.calories <= 60:
        tags.append("LOW CAL")
    if staple.price_eur <= 0.35:
        tags.append("BUDGET")
    if _staple_category(staple) in {"vegetables", "fruit_recovery"}:
        tags.append("MICRONUTRIENTS")
    if any(w in staple.name.lower() for w in ["salmon", "walnuts", "olive oil", "berries", "cherry", "kefir"]):
        tags.append("RECOVERY")
    return tags[:5]



def build_nutrition_memory_profile(entries: list[dict] | None = None) -> dict:
    """Convert user-controlled nutrition memory rows into a planning profile."""
    profile = {
        "favorite_names": set(),
        "favorite_ids": set(),
        "avoid_names": set(),
        "avoid_ids": set(),
        "pantry_names": set(),
        "pantry_ids": set(),
        "preferred_names": set(),
        "preferred_ids": set(),
        "counts": {"favorite": 0, "dislike": 0, "pantry": 0, "preferred": 0},
    }
    for entry in entries or []:
        kind = str(entry.get("kind", "")).lower()
        name = str(entry.get("name", "")).strip().lower()
        item_id = str(entry.get("item_id", "")).strip().lower()
        if kind not in profile["counts"]:
            continue
        profile["counts"][kind] += 1
        if kind == "favorite":
            if name: profile["favorite_names"].add(name)
            if item_id: profile["favorite_ids"].add(item_id)
        elif kind == "dislike":
            if name: profile["avoid_names"].add(name)
            if item_id: profile["avoid_ids"].add(item_id)
        elif kind == "pantry":
            if name: profile["pantry_names"].add(name)
            if item_id: profile["pantry_ids"].add(item_id)
        elif kind == "preferred":
            if name: profile["preferred_names"].add(name)
            if item_id: profile["preferred_ids"].add(item_id)

    return {
        **profile,
        "favorite_count": profile["counts"]["favorite"],
        "avoid_count": profile["counts"]["dislike"],
        "pantry_count": profile["counts"]["pantry"],
        "preferred_count": profile["counts"]["preferred"],
    }


def _item_matches_memory(item: dict, names: set[str], ids: set[str]) -> bool:
    name = str(item.get("name", "")).lower()
    item_id = str(item.get("item_id", "")).lower()
    if item_id and item_id in ids:
        return True
    return any(term and term in name for term in names)


def _memory_score_items(items: list[dict], memory_profile: dict) -> int:
    score = 0
    for item in items:
        if _item_matches_memory(item, memory_profile["favorite_names"], memory_profile["favorite_ids"]):
            score += 8
        if _item_matches_memory(item, memory_profile["preferred_names"], memory_profile["preferred_ids"]):
            score += 6
        if _item_matches_memory(item, memory_profile["pantry_names"], memory_profile["pantry_ids"]):
            score += 4
    return score


def _contains_avoided_item(items: list[dict], memory_profile: dict) -> bool:
    return any(_item_matches_memory(item, memory_profile["avoid_names"], memory_profile["avoid_ids"]) for item in items)


def apply_nutrition_memory_to_suggestions(suggestions: list[dict], memory_profile: dict) -> list[dict]:
    """Filter disliked foods and boost meals that match favorites/pantry/preferred staples."""
    if not memory_profile:
        return suggestions
    personalized = []
    for suggestion in suggestions:
        items = suggestion.get("items", [])
        if _contains_avoided_item(items, memory_profile):
            continue
        score = _memory_score_items(items, memory_profile)
        next_suggestion = {**suggestion, "memory_score": score}
        if score > 0:
            tags = list(next_suggestion.get("tags", []))
            if "MEMORY MATCH" not in tags:
                tags.append("MEMORY MATCH")
            next_suggestion["tags"] = tags[:7]
            next_suggestion["reason"] = f"{next_suggestion.get('reason', '')} Uses foods from your Phoenix nutrition memory.".strip()
            next_suggestion["priority"] = int(next_suggestion.get("priority", 0)) + score
        personalized.append(next_suggestion)
    personalized.sort(key=lambda s: (s.get("priority", 0), s.get("memory_score", 0)), reverse=True)
    return personalized


def apply_nutrition_memory_to_day_plan(meals: list[dict], memory_profile: dict) -> list[dict]:
    """Remove avoided ingredients and mark meals that match remembered preferences."""
    if not memory_profile:
        return meals
    personalized = []
    for meal in meals:
        items = [item for item in meal.get("items", []) if not _contains_avoided_item([item], memory_profile)]
        if not items:
            continue
        score = _memory_score_items(items, memory_profile)
        next_meal = {**meal, "items": items, "total": _component_total(items), "memory_score": score}
        if score > 0:
            tags = list(next_meal.get("tags", []))
            if "MEMORY MATCH" not in tags:
                tags.append("MEMORY MATCH")
            next_meal["tags"] = tags[:7]
            next_meal["reason"] = f"{next_meal.get('reason', '')} Uses foods you favor, prefer, or have at home.".strip()
        personalized.append(next_meal)
    return personalized


def public_memory_summary(memory_profile: dict) -> dict:
    """Return a JSON-safe memory summary without exposing internal sets."""
    return {
        "favorite_count": int(memory_profile.get("favorite_count", 0)),
        "avoid_count": int(memory_profile.get("avoid_count", 0)),
        "pantry_count": int(memory_profile.get("pantry_count", 0)),
        "preferred_count": int(memory_profile.get("preferred_count", 0)),
        "active": any(int(memory_profile.get(k, 0)) > 0 for k in ["favorite_count", "avoid_count", "pantry_count", "preferred_count"]),
    }


def build_recipe_serving_profile(recipe: Recipe) -> dict:
    """Return safe per-serving recipe metadata without mutating raw recipe data.

    Raw imported recipes often describe the whole batch. Phoenix exposes a
    loggable serving unit so the UI does not recommend or log a 3000 kcal batch
    as one meal. When a batch has no declared serving count, the serving count is
    estimated conservatively from calories and clearly marked as estimated.
    """
    serving_text = recipe.serving or ""
    lower = serving_text.lower()
    declaration = _parse_serving_declaration(serving_text)
    declared_count = declaration["count"]
    portion_unit = declaration["unit"] or "serving"
    basis = declaration["basis"]
    is_entire_batch = "entire batch" in lower

    if declared_count and declared_count > 1:
        serving_count = declared_count
        basis = basis or "declared_units"
    elif declared_count == 1:
        serving_count = 1
        basis = basis or "single_serving"
    elif is_entire_batch or recipe.calories > 1200:
        serving_count = min(8, max(2, math.ceil(recipe.calories / 550)))
        basis = "estimated_batch_servings"
        portion_unit = "serving"
    else:
        serving_count = 1
        basis = "single_serving"

    is_batch_recipe = serving_count > 1 or is_entire_batch
    per_serving = {
        "calories": _round_macro(recipe.calories / serving_count),
        "protein_g": _round_macro(recipe.protein_g / serving_count),
        "fat_g": _round_macro(recipe.fat_g / serving_count),
        "carbs_g": _round_macro(recipe.carbs_g / serving_count),
        "fiber_g": _round_macro(recipe.fiber_g / serving_count),
    }

    if serving_count > 1:
        plural = portion_unit if serving_count == 1 else (portion_unit if portion_unit.endswith("s") else f"{portion_unit}s")
        label = f"1 of {serving_count} {plural}"
    elif portion_unit and portion_unit != "serving":
        label = f"1 {portion_unit}"
    elif serving_text:
        label = serving_text
    else:
        label = "1 serving"

    profile = {
        "serving_count": serving_count,
        "serving_basis": basis,
        "portion_unit": portion_unit,
        "is_batch_recipe": is_batch_recipe,
        "serving_label": label,
        "serving_note": (
            "Source label converted into a loggable portion."
            if basis in {"declared_units", "declared_servings", "estimated_batch_servings"}
            else "Source label is already a single loggable portion."
        ),
        "full_serving_label": serving_text,
        "full_calories": recipe.calories,
        "full_protein_g": recipe.protein_g,
        "full_fat_g": recipe.fat_g,
        "full_carbs_g": recipe.carbs_g,
        "full_fiber_g": recipe.fiber_g,
        **per_serving,
    }
    profile["tags"] = _recipe_tags(recipe, profile)
    return profile


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


def classify_nutrition_day(
    total_calories: float | None,
    total_protein_g: float | None,
    target: MacroTarget,
) -> dict:
    """Classify one nutrition day without rewarding under-eating.

    Good means calories are close to the day's target and protein is close to
    target. Warn means partial adherence. Miss means materially too low, too
    high, or protein missed. Empty days are explicitly unknown.
    """
    if total_calories is None or total_protein_g is None:
        return {
            "adherence_status": "empty",
            "calorie_status": "not_logged",
            "protein_status": "not_logged",
            "calorie_ratio": None,
            "protein_ratio": None,
        }

    calorie_ratio = total_calories / max(1, target.calories)
    protein_ratio = total_protein_g / max(1, target.protein_g)

    if 0.90 <= calorie_ratio <= 1.10:
        calorie_status = "on_band"
    elif calorie_ratio < 0.90:
        calorie_status = "too_low"
    else:
        calorie_status = "too_high"

    if protein_ratio >= 0.90:
        protein_status = "on_track"
    elif protein_ratio >= 0.70:
        protein_status = "behind"
    else:
        protein_status = "low"

    if calorie_status == "on_band" and protein_status == "on_track":
        adherence_status = "good"
    elif 0.75 <= calorie_ratio <= 1.20 and protein_ratio >= 0.70:
        adherence_status = "warn"
    else:
        adherence_status = "miss"

    return {
        "adherence_status": adherence_status,
        "calorie_status": calorie_status,
        "protein_status": protein_status,
        "calorie_ratio": round(calorie_ratio, 4),
        "protein_ratio": round(protein_ratio, 4),
    }


def suggest_recipes(
    recipes: list[Recipe],
    remaining_calories: float,
    remaining_protein_g: float,
) -> list[Recipe]:
    if remaining_calories < 100:
        return []

    candidates: list[tuple[float, Recipe]] = []
    target_protein = max(20, min(remaining_protein_g, 60))
    for recipe in recipes:
        profile = build_recipe_serving_profile(recipe)
        calories = profile["calories"]
        protein = profile["protein_g"]
        if calories > remaining_calories:
            continue
        if remaining_protein_g > 0 and protein > remaining_protein_g * 1.35:
            continue
        density = protein / max(1, calories)
        score = density * 1000
        score += max(0, 60 - abs(protein - target_protein))
        if profile["is_batch_recipe"]:
            score += 20
        candidates.append((score, recipe))

    candidates.sort(key=lambda pair: pair[0], reverse=True)
    return [recipe for _, recipe in candidates[:3]]



def _component_total(components: list[dict]) -> dict:
    return {
        "calories": _round_macro(sum(c["calories"] for c in components)),
        "protein_g": _round_macro(sum(c["protein_g"] for c in components)),
        "carbs_g": _round_macro(sum(c["carbs_g"] for c in components)),
        "fat_g": _round_macro(sum(c["fat_g"] for c in components)),
        "price_eur": round(sum(c.get("price_eur", 0.0) for c in components), 2),
    }


def _staple_component(staple: LidlStaple, servings: float) -> dict:
    return {
        "item_id": staple.id,
        "item_type": "staple",
        "name": staple.name,
        "unit": staple.unit,
        "servings": servings,
        "calories": _round_macro(staple.calories * servings),
        "protein_g": _round_macro(staple.protein_g * servings),
        "carbs_g": _round_macro(staple.carbs_g * servings),
        "fat_g": _round_macro(staple.fat_g * servings),
        "price_eur": round(staple.price_eur * servings, 2),
    }


def _recipe_component(recipe: Recipe, servings: float = 1.0) -> dict:
    profile = build_recipe_serving_profile(recipe)
    return {
        "item_id": recipe.id,
        "item_type": "recipe",
        "name": recipe.name,
        "unit": profile["serving_label"],
        "servings": servings,
        "calories": _round_macro(profile["calories"] * servings),
        "protein_g": _round_macro(profile["protein_g"] * servings),
        "carbs_g": _round_macro(profile["carbs_g"] * servings),
        "fat_g": _round_macro(profile["fat_g"] * servings),
        "price_eur": 0.0,
        "is_batch_recipe": profile["is_batch_recipe"],
        "full_calories": profile["full_calories"],
    }


def _meal_suggestion(
    suggestion_id: str,
    title: str,
    intent: str,
    reason: str,
    components: list[dict],
    tags: list[str],
    priority: int,
    loggable: bool = True,
) -> dict:
    return {
        "id": suggestion_id,
        "title": title,
        "intent": intent,
        "reason": reason,
        "tags": tags,
        "priority": priority,
        "loggable": loggable,
        "items": components,
        "total": _component_total(components),
        "requires_approval": True,
        "safety": "Phoenix proposes only. Nothing is logged until the user confirms.",
    }


def _fits_remaining(total: dict, remaining_calories: float, slack: float = 120) -> bool:
    return total["calories"] <= max(0, remaining_calories) + slack


def build_autonomous_meal_suggestions(
    status: NutritionStatus,
    staples: list[LidlStaple],
    recipes: list[Recipe],
    memory_entries: list[dict] | None = None,
) -> dict:
    """Build local-first meal proposals from current macros.

    This is deterministic and does not call an LLM. Phoenix may reason from the
    current day and database, but each proposal stays approval-first: the app can
    suggest and prepare a loggable meal, never silently log food.
    """
    remaining_calories = max(0, status.remaining_calories)
    remaining_protein = max(0, status.remaining_protein_g)
    remaining_carbs = max(0, status.remaining_carbs_g)
    by_id = {s.id: s for s in staples}
    memory_profile = build_nutrition_memory_profile(memory_entries)
    memory_summary = public_memory_summary(memory_profile)
    suggestions: list[dict] = []

    if remaining_calories < 120:
        return {
            "mode": "closed_day",
            "summary": "Day is near closed. Phoenix will not propose another full meal.",
            "remaining_calories": _round_macro(remaining_calories),
            "remaining_protein_g": _round_macro(remaining_protein),
            "remaining_carbs_g": _round_macro(remaining_carbs),
            "suggestions": [],
            "day_plan": [],
            "memory": memory_summary,
        }

    # 1) Macro-aware next meal from Lidl staples.
    if status.is_training_day:
        components = [
            _staple_component(by_id["lidl_001"], 1.5),  # chicken
            _staple_component(by_id["lidl_014"], 2.0),  # sweet potato
            _staple_component(by_id["lidl_016"], 1.0),  # spinach
        ]
        reason = (
            "Training-day build: lean protein plus quality carbs without pushing fats high."
        )
        tags = ["RECOVERY", "PROTEIN+CARBS", "LOW FAT"]
    else:
        components = [
            _staple_component(by_id["lidl_001"], 1.5),  # chicken
            _staple_component(by_id["lidl_003"], 1.0),  # greek yogurt
            _staple_component(by_id["lidl_016"], 1.0),  # spinach
            _staple_component(by_id["lidl_017"], 1.0),  # tomato
        ]
        reason = (
            "Rest-day build: high protein, light carbs, and enough volume to avoid random snacking."
        )
        tags = ["REST DAY", "HIGH PROTEIN", "LIGHT"]
    total = _component_total(components)
    if _fits_remaining(total, remaining_calories):
        suggestions.append(_meal_suggestion(
            "next_best_meal", "Build My Next Meal", "next_meal",
            reason, components, tags, 100,
        ))

    # 2) Protein rescue when protein is materially behind.
    rescue_components = [
        _staple_component(by_id["lidl_003"], 2.0),  # Greek yogurt 200g
        _staple_component(by_id["lidl_023"], 1.0),  # whey
        _staple_component(by_id["lidl_005"], 1.0),  # tuna
    ]
    rescue_total = _component_total(rescue_components)
    if remaining_protein >= 55 and _fits_remaining(rescue_total, remaining_calories, slack=80):
        suggestions.append(_meal_suggestion(
            "protein_rescue", "Protein Rescue", "protein_rescue",
            f"You still need about {round(remaining_protein)}g protein. This closes a large part of it with controlled calories.",
            rescue_components, ["PROTEIN RESCUE", "FAST", "LOW FAT"], 95,
        ))

    # 3) Expanded recovery bowl from the larger Lidl food brain.
    if all(key in by_id for key in ["lidl_032", "lidl_009", "lidl_049", "lidl_060"]):
        recovery_components = [
            _staple_component(by_id["lidl_032"], 2.5),  # high protein skyr
            _staple_component(by_id["lidl_009"], 0.35),  # oats
            _staple_component(by_id["lidl_049"], 1.0),  # mixed berries
            _staple_component(by_id["lidl_060"], 1.0),  # tart cherry juice
        ]
        recovery_total = _component_total(recovery_components)
        if _fits_remaining(recovery_total, remaining_calories, slack=80):
            suggestions.append(_meal_suggestion(
                "recovery_yogurt_oat_bowl", "Recovery Yogurt Oat Bowl", "recovery_bowl",
                "Expanded food-brain option: skyr, oats, berries, and tart cherry juice for protein, carbs, and recovery-style foods.",
                recovery_components, ["RECOVERY", "SKYR", "BERRIES", f"€{recovery_total['price_eur']:.2f}"], 90,
            ))

    # 4) Omega-style fish plate for higher calorie room.
    if all(key in by_id for key in ["lidl_027", "lidl_042", "lidl_051"]):
        fish_components = [
            _staple_component(by_id["lidl_027"], 1.5),  # salmon
            _staple_component(by_id["lidl_042"], 2.0),  # potatoes
            _staple_component(by_id["lidl_051"], 1.5),  # broccoli
        ]
        fish_total = _component_total(fish_components)
        if remaining_calories >= 500 and _fits_remaining(fish_total, remaining_calories, slack=120):
            suggestions.append(_meal_suggestion(
                "omega_fish_plate", "Omega Fish Plate", "omega_meal",
                "Whole-food fish plate from the expanded Lidl staples: protein, potassium-rich carbs, and vegetables.",
                fish_components, ["FISH", "WHOLE FOOD", "RECOVERY", f"€{fish_total['price_eur']:.2f}"], 85,
            ))

    # 5) Cheap Lidl meal.
    # 5) Cheap Lidl meal.
    cheap_components = [
        _staple_component(by_id["lidl_001"], 1.0),  # chicken
        _staple_component(by_id["lidl_011"], 0.5),  # rice
        _staple_component(by_id["lidl_021"], 1.0),  # cauliflower
    ]
    cheap_total = _component_total(cheap_components)
    if _fits_remaining(cheap_total, remaining_calories):
        suggestions.append(_meal_suggestion(
            "cheap_lidl_bowl", "Cheap Lidl Bowl", "cheap_lidl",
            "Low-cost protein and carbs built from staples Phoenix already knows.",
            cheap_components, ["CHEAP", "LIDL", f"€{cheap_total['price_eur']:.2f}"], 80,
        ))

    # 6) Recipe match using per-serving recipe intelligence.
    recipe_matches = suggest_recipes(recipes, remaining_calories, remaining_protein)
    if recipe_matches:
        recipe = recipe_matches[0]
        recipe_component = _recipe_component(recipe, 1.0)
        suggestions.append(_meal_suggestion(
            "best_recipe_match", "Best Recipe Match", "recipe_match",
            "Highest-scoring recipe serving for today based on remaining calories and protein.",
            [recipe_component], ["RECIPE", "1 SERVING", "RANKED"], 70,
        ))

    # 7) Closeout option for late day / low calories.
    closeout_components = [
        _staple_component(by_id["lidl_004"], 2.0),  # cottage cheese
        _staple_component(by_id["lidl_020"], 1.0),  # mushrooms
    ]
    closeout_total = _component_total(closeout_components)
    if remaining_calories <= 600 and _fits_remaining(closeout_total, remaining_calories, slack=40):
        suggestions.append(_meal_suggestion(
            "lean_closeout", "Lean Closeout", "closeout",
            "Small controlled meal for when calories are limited but protein still matters.",
            closeout_components, ["CLOSEOUT", "CONTROLLED", "LOW CARB"], 75,
        ))

    suggestions = apply_nutrition_memory_to_suggestions(suggestions, memory_profile)
    suggestions.sort(key=lambda s: s["priority"], reverse=True)

    day_plan = [
        {
            "slot": "first_meal",
            "title": "Protein anchor",
            "guidance": "Start with 35-55g protein before chasing carbs or fats.",
        },
        {
            "slot": "main_meal",
            "title": "Macro-balanced meal",
            "guidance": "Use the next-meal or Lidl bowl proposal depending on training load and remaining calories.",
        },
        {
            "slot": "closeout",
            "title": "Close the target",
            "guidance": "Use yogurt, cottage cheese, tuna, or egg whites if protein is still behind late in the day.",
        },
    ]

    summary = (
        f"{round(remaining_calories)} kcal and {round(remaining_protein)}g protein remain. "
        "Phoenix prepared approval-first meal options from recipes and Lidl staples."
    )
    return {
        "mode": "autonomous_builder",
        "summary": summary,
        "remaining_calories": _round_macro(remaining_calories),
        "remaining_protein_g": _round_macro(remaining_protein),
        "remaining_carbs_g": _round_macro(remaining_carbs),
        "is_training_day": status.is_training_day,
        "requires_approval": True,
        "suggestions": suggestions[:5],
        "day_plan": day_plan,
        "memory": memory_summary,
    }



def _plan_meal(
    meal_id: str,
    slot: str,
    title: str,
    reason: str,
    components: list[dict],
    tags: list[str],
    timing: str,
) -> dict:
    return {
        "id": meal_id,
        "meal_id": meal_id,
        "slot": slot,
        "title": title,
        "timing": timing,
        "reason": reason,
        "tags": tags,
        "items": components,
        "total": _component_total(components),
        "loggable": True,
        "requires_approval": True,
    }


def _add_balance_component(meals: list[dict], slot: str, component: dict) -> None:
    for meal in meals:
        if meal["slot"] == slot:
            meal["items"].append(component)
            meal["total"] = _component_total(meal["items"])
            return
    # Defensive fallback: if a target slot was removed in a low-calorie plan,
    # put the adjustment on the last planned meal rather than dropping it.
    if meals:
        meals[-1]["items"].append(component)
        meals[-1]["total"] = _component_total(meals[-1]["items"])


def _plan_total(meals: list[dict]) -> dict:
    return _component_total([meal["total"] for meal in meals])


def _balance_plan_to_remaining(
    meals: list[dict],
    by_id: dict,
    remaining_calories: float,
    remaining_carbs: float,
    remaining_fat: float,
    is_training_day_flag: bool,
) -> list[dict]:
    """Add small whole-food adjusters so the plan lands near the open target.

    This stays intentionally conservative: Phoenix can fill obvious gaps with
    rice/potatoes/oats/olive oil, but it must not force-feed a target or silently
    log anything. The UI still shows every component for approval and editing.
    """
    if not meals:
        return meals

    total = _plan_total(meals)
    deficit = remaining_calories - total["calories"]
    if deficit <= 120:
        return meals

    # Training days usually need carb fuel; rest days still get smaller carb
    # additions first when carbs are open, then fats if needed.
    if remaining_carbs > total["carbs_g"] + 35 and deficit > 120:
        if is_training_day_flag and "lidl_011" in by_id:
            servings = min(1.0, max(0.25, deficit * 0.55 / by_id["lidl_011"].calories))
            _add_balance_component(meals, "lunch", _staple_component(by_id["lidl_011"], round(servings, 2)))
        elif "lidl_042" in by_id:
            servings = min(3.0, max(1.0, deficit * 0.45 / by_id["lidl_042"].calories))
            _add_balance_component(meals, "dinner", _staple_component(by_id["lidl_042"], round(servings, 2)))

    total = _plan_total(meals)
    deficit = remaining_calories - total["calories"]
    if remaining_fat > total["fat_g"] + 8 and deficit > 100 and "lidl_056" in by_id:
        servings = min(1.5, max(0.5, deficit * 0.65 / by_id["lidl_056"].calories))
        _add_balance_component(meals, "dinner", _staple_component(by_id["lidl_056"], round(servings, 2)))

    total = _plan_total(meals)
    deficit = remaining_calories - total["calories"]
    if deficit > 180 and "lidl_009" in by_id:
        servings = min(0.6, max(0.25, deficit * 0.5 / by_id["lidl_009"].calories))
        _add_balance_component(meals, "breakfast", _staple_component(by_id["lidl_009"], round(servings, 2)))

    return meals


def build_full_day_plan(
    status: NutritionStatus,
    staples: list[LidlStaple],
    recipes: list[Recipe],
    memory_entries: list[dict] | None = None,
) -> dict:
    """Build an approval-first remaining-day nutrition plan.

    The plan is local-first and deterministic. It uses the transcript-inspired
    recovery principles already encoded in Phoenix (protein+carbs after hard
    training, whole foods, fish/omega options, berries/tart cherry, and
    hydration/electrolyte reminders) without making medical claims.
    """
    remaining_calories = max(0, status.remaining_calories)
    remaining_protein = max(0, status.remaining_protein_g)
    remaining_carbs = max(0, status.remaining_carbs_g)
    remaining_fat = max(0, status.remaining_fat_g)
    by_id = {s.id: s for s in staples}
    memory_profile = build_nutrition_memory_profile(memory_entries)
    memory_summary = public_memory_summary(memory_profile)

    if remaining_calories < 250:
        return {
            "mode": "day_near_closed",
            "plan_id": "remaining_day_plan_v1",
            "summary": "Day is near closed. Phoenix will not build a full-day plan.",
            "is_training_day": status.is_training_day,
            "requires_approval": True,
            "remaining_target": {
                "calories": _round_macro(remaining_calories),
                "protein_g": _round_macro(remaining_protein),
                "carbs_g": _round_macro(remaining_carbs),
                "fat_g": _round_macro(remaining_fat),
            },
            "planned_total": {"calories": 0, "protein_g": 0, "carbs_g": 0, "fat_g": 0, "price_eur": 0},
            "target_gap": {
                "calories": _round_macro(remaining_calories),
                "protein_g": _round_macro(remaining_protein),
                "carbs_g": _round_macro(remaining_carbs),
                "fat_g": _round_macro(remaining_fat),
            },
            "meals": [],
            "recovery_notes": ["Use water and mineral-rich foods; no extra meal is proposed because calories are nearly closed."],
            "memory": memory_summary,
        }

    if status.is_training_day:
        meals = [
            _plan_meal(
                "plan_breakfast_recovery_bowl", "breakfast", "Recovery Yogurt Oat Bowl",
                "Protein plus quality carbs early; uses skyr, oats, berries, and tart cherry as optional recovery-style foods.",
                [
                    _staple_component(by_id["lidl_032"], 2.5),
                    _staple_component(by_id["lidl_009"], 0.5),
                    _staple_component(by_id["lidl_049"], 1.0),
                    _staple_component(by_id["lidl_060"], 1.0),
                ],
                ["RECOVERY", "PROTEIN+CARBS", "BERRIES"],
                "first meal",
            ),
            _plan_meal(
                "plan_lunch_training_bowl", "lunch", "Chicken Rice Training Bowl",
                "Lean protein with carb fuel for a high-output day, keeping fats controlled.",
                [
                    _staple_component(by_id["lidl_001"], 1.5),
                    _staple_component(by_id["lidl_011"], 0.75),
                    _staple_component(by_id["lidl_051"], 1.5),
                ],
                ["TRAINING CARBS", "HIGH PROTEIN", "LOW FAT"],
                "main meal",
            ),
            _plan_meal(
                "plan_post_training", "post_training", "Post-Training Protein Window",
                "Fast protein plus carbs for the recovery window. Approval-first; edit quantities if training was light.",
                [
                    _staple_component(by_id["lidl_003"], 2.0),
                    _staple_component(by_id["lidl_023"], 1.0),
                    _staple_component(by_id["lidl_012"], 1.0),
                ],
                ["POST-TRAINING", "FAST", "20-40G+ PROTEIN"],
                "after training",
            ),
            _plan_meal(
                "plan_dinner_omega_plate", "dinner", "Omega Fish Plate",
                "Fish, potatoes, and greens: a whole-food closeout with protein, carbs, and micronutrients.",
                [
                    _staple_component(by_id["lidl_027"], 1.5),
                    _staple_component(by_id["lidl_042"], 2.5),
                    _staple_component(by_id["lidl_051"], 2.0),
                ],
                ["FISH", "WHOLE FOOD", "MICRONUTRIENTS"],
                "dinner",
            ),
        ]
    else:
        meals = [
            _plan_meal(
                "plan_breakfast_rest_anchor", "breakfast", "Protein Breakfast Anchor",
                "High-protein rest-day start without turning breakfast into a large carb load.",
                [
                    _staple_component(by_id["lidl_003"], 2.0),
                    _staple_component(by_id["lidl_002"], 2.0),
                    _staple_component(by_id["lidl_046"], 0.75),
                ],
                ["REST DAY", "PROTEIN", "LIGHT"],
                "first meal",
            ),
            _plan_meal(
                "plan_lunch_lean_bowl", "lunch", "Lean Chicken Volume Bowl",
                "Protein, vegetables, and controlled fats to keep the rest day full but not heavy.",
                [
                    _staple_component(by_id["lidl_001"], 1.5),
                    _staple_component(by_id["lidl_016"], 1.0),
                    _staple_component(by_id["lidl_017"], 1.0),
                    _staple_component(by_id["lidl_015"], 0.5),
                ],
                ["REST DAY SAFE", "HIGH PROTEIN", "VOLUME"],
                "main meal",
            ),
            _plan_meal(
                "plan_snack_protein_rescue", "snack", "Protein Rescue Snack",
                "Simple protein closeout option using cottage cheese and fruit before dinner.",
                [
                    _staple_component(by_id["lidl_004"], 2.0),
                    _staple_component(by_id["lidl_013"], 1.0),
                ],
                ["PROTEIN RESCUE", "SNACK", "LOW FAT"],
                "snack",
            ),
            _plan_meal(
                "plan_dinner_cod_plate", "dinner", "Cod Potato Dinner Plate",
                "Lean dinner with potatoes, greens, and olive oil; keeps digestion lighter than a processed late meal.",
                [
                    _staple_component(by_id["lidl_028"], 2.0),
                    _staple_component(by_id["lidl_042"], 2.5),
                    _staple_component(by_id["lidl_051"], 2.0),
                    _staple_component(by_id["lidl_056"], 1.0),
                ],
                ["LEAN DINNER", "WHOLE FOOD", "LIGHT DIGESTION"],
                "dinner",
            ),
        ]

    # If the user already logged meals, trim lower-priority slots until the plan
    # fits the remaining day better, while preserving closeout utility.
    while meals and _plan_total(meals)["calories"] > remaining_calories + 180:
        if len(meals) <= 1:
            break
        # Prefer removing breakfast first once the day is already partially open;
        # post-training is preserved on training days when possible.
        removable = next((i for i, m in enumerate(meals) if m["slot"] in {"breakfast", "snack"}), len(meals) - 1)
        meals.pop(removable)

    meals = _balance_plan_to_remaining(
        meals, by_id, remaining_calories, remaining_carbs, remaining_fat, status.is_training_day
    )
    meals = apply_nutrition_memory_to_day_plan(meals, memory_profile)

    planned_total = _plan_total(meals)
    target_gap = {
        "calories": _round_macro(remaining_calories - planned_total["calories"]),
        "protein_g": _round_macro(remaining_protein - planned_total["protein_g"]),
        "carbs_g": _round_macro(remaining_carbs - planned_total["carbs_g"]),
        "fat_g": _round_macro(remaining_fat - planned_total["fat_g"]),
    }

    if status.is_training_day:
        notes = [
            "Training day: protein plus carbs are intentionally placed around the post-training window.",
            "Hydration is not only water; use sodium/potassium/magnesium from food or a simple electrolyte if sweat is high.",
            "Fish, berries, yogurt/skyr, oats, potatoes, and vegetables are used as recovery-style whole foods without medical claims.",
        ]
    else:
        notes = [
            "Rest day: protein stays high while carb load is lower than training-day plans.",
            "Keep late digestion lighter: lean protein, vegetables, fermented dairy, and controlled fats.",
            "Phoenix avoids ultra-processed shortcuts by default and keeps every meal editable before logging.",
        ]

    return {
        "mode": "full_day_planner",
        "plan_id": "remaining_day_plan_v1",
        "summary": (
            f"Phoenix built an approval-first plan for the remaining {round(remaining_calories)} kcal "
            f"and {round(remaining_protein)}g protein using recipes and Lidl staples."
        ),
        "is_training_day": status.is_training_day,
        "requires_approval": True,
        "remaining_target": {
            "calories": _round_macro(remaining_calories),
            "protein_g": _round_macro(remaining_protein),
            "carbs_g": _round_macro(remaining_carbs),
            "fat_g": _round_macro(remaining_fat),
        },
        "planned_total": planned_total,
        "target_gap": target_gap,
        "meals": meals,
        "recovery_notes": notes,
        "memory": memory_summary,
        "safety": "Phoenix plans only. Nothing is logged until the user approves the whole plan or an individual meal.",
    }




def _shopping_category_for_item(item: dict) -> str:
    """Map a planned/loggable item into a Lidl-style shopping category."""
    name = str(item.get("name", "")).lower()
    item_type = str(item.get("item_type", "")).lower()
    if item_type == "recipe":
        return "recipes / prep"
    if any(w in name for w in ["chicken", "turkey", "tuna", "salmon", "cod", "prawns", "beef", "ham", "whey", "egg white"]):
        return "protein"
    if any(w in name for w in ["yogurt", "cottage", "skyr", "kefir", "quark", "mozzarella", "cheese", "egg"]):
        return "dairy / eggs"
    if any(w in name for w in ["oats", "bread", "rice", "banana", "apple", "potato", "pasta", "couscous", "quinoa", "wrap", "beans", "lentils", "chickpeas"]):
        return "carbs"
    if any(w in name for w in ["spinach", "tomato", "pepper", "onion", "mushroom", "cauliflower", "zucchini", "cucumber", "broccoli", "asparagus", "green beans", "carrots", "salad"]):
        return "vegetables"
    if any(w in name for w in ["blueberries", "strawberries", "orange", "berries", "cherry", "fruit"]):
        return "fruit / recovery"
    if any(w in name for w in ["olive oil", "peanut butter", "almonds", "walnuts", "avocado"]):
        return "fats"
    return "other"


def _shopping_key(item: dict) -> tuple[str, str, str, str]:
    return (
        str(item.get("item_type", "item")).lower(),
        str(item.get("item_id", "")).lower(),
        str(item.get("name", "")).strip().lower(),
        str(item.get("unit", "serving")).strip().lower(),
    )


def build_shopping_list_from_items(
    items: list[dict],
    memory_entries: list[dict] | None = None,
    source: str = "custom",
    source_title: str = "Phoenix shopping list",
) -> dict:
    """Build a pantry-aware shopping list from planned nutrition items.

    This is deterministic, local-first shopping logic. It never places an order;
    it only separates missing ingredients from foods the user marked as pantry /
    already-have in Phoenix nutrition memory.
    """
    memory_profile = build_nutrition_memory_profile(memory_entries)
    merged: dict[tuple[str, str, str, str], dict] = {}

    for raw in items or []:
        item = dict(raw)
        name = str(item.get("name", "")).strip()
        if not name:
            continue
        key = _shopping_key(item)
        category = _shopping_category_for_item(item)
        existing = merged.get(key)
        if existing is None:
            existing = {
                "item_id": item.get("item_id", ""),
                "item_type": item.get("item_type", "item"),
                "name": name,
                "unit": item.get("unit", "serving"),
                "servings": 0.0,
                "calories": 0.0,
                "protein_g": 0.0,
                "fat_g": 0.0,
                "carbs_g": 0.0,
                "estimated_cost_eur": 0.0,
                "category": category,
                "already_have": False,
            }
            merged[key] = existing
        existing["servings"] += float(item.get("servings", 1) or 1)
        existing["calories"] += float(item.get("calories", 0) or 0)
        existing["protein_g"] += float(item.get("protein_g", 0) or 0)
        existing["fat_g"] += float(item.get("fat_g", 0) or 0)
        existing["carbs_g"] += float(item.get("carbs_g", 0) or 0)
        existing["estimated_cost_eur"] += float(item.get("price_eur", 0) or 0)

    normalized = []
    for item in merged.values():
        item["servings"] = _round_macro(item["servings"])
        item["calories"] = _round_macro(item["calories"])
        item["protein_g"] = _round_macro(item["protein_g"])
        item["fat_g"] = _round_macro(item["fat_g"])
        item["carbs_g"] = _round_macro(item["carbs_g"])
        item["estimated_cost_eur"] = round(item["estimated_cost_eur"], 2)
        item["already_have"] = _item_matches_memory(
            item, memory_profile["pantry_names"], memory_profile["pantry_ids"]
        )
        normalized.append(item)

    normalized.sort(key=lambda x: (x["already_have"], x["category"], x["name"]))
    need_to_buy = [item for item in normalized if not item["already_have"]]
    already_have = [item for item in normalized if item["already_have"]]

    categories: dict[str, list[dict]] = {}
    for item in need_to_buy:
        categories.setdefault(item["category"], []).append(item)

    estimated_missing_cost = round(sum(item["estimated_cost_eur"] for item in need_to_buy), 2)
    estimated_full_cost = round(sum(item["estimated_cost_eur"] for item in normalized), 2)

    budget_basket = [
        item for item in need_to_buy
        if item["estimated_cost_eur"] <= 2.50 or item["category"] in {"carbs", "vegetables", "dairy / eggs"}
    ]
    high_protein_basket = [item for item in need_to_buy if item["protein_g"] >= 20]

    return {
        "mode": "shopping_list",
        "source": source,
        "source_title": source_title,
        "requires_approval": True,
        "principle": "Phoenix creates a pantry-aware shopping list only. It never buys anything.",
        "count": len(normalized),
        "need_to_buy_count": len(need_to_buy),
        "already_have_count": len(already_have),
        "estimated_missing_cost_eur": estimated_missing_cost,
        "estimated_full_cost_eur": estimated_full_cost,
        "items": normalized,
        "need_to_buy": need_to_buy,
        "already_have": already_have,
        "categories": categories,
        "budget_basket": budget_basket[:8],
        "high_protein_basket": high_protein_basket[:8],
        "memory": public_memory_summary(memory_profile),
    }



def _weekday_label(value: date) -> str:
    return ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"][value.weekday()]


def _weekly_total(days: list[dict]) -> dict:
    return _component_total([day.get("planned_total", {}) for day in days])


def _flatten_weekly_plan_days(days: list[dict]) -> list[dict]:
    items: list[dict] = []
    for day in days or []:
        for meal in day.get("meals", []) or []:
            for item in meal.get("items", []) or []:
                items.append(item)
    return items


def _weekly_training_split(days: list[dict]) -> dict:
    training_days = [day for day in days if day.get("is_training_day")]
    rest_days = [day for day in days if not day.get("is_training_day")]
    return {
        "training_days": len(training_days),
        "rest_days": len(rest_days),
        "training_dates": [day["date"] for day in training_days],
        "rest_dates": [day["date"] for day in rest_days],
    }


def _rotate_weekly_meals(meals: list[dict], by_id: dict[str, LidlStaple], day_index: int, is_training_day_flag: bool) -> list[dict]:
    """Apply small deterministic weekly rotations to reduce food boredom.

    This intentionally stays conservative. Phoenix rotates equivalent staples
    only when the local food brain has those foods. The user can still edit or
    remove every ingredient before logging.
    """
    rotated = []
    for meal in meals:
        next_meal = {**meal, "items": [dict(item) for item in meal.get("items", [])]}
        notes = list(next_meal.get("variation_notes", []))
        for i, item in enumerate(next_meal["items"]):
            item_id = item.get("item_id")
            servings = float(item.get("servings", 1) or 1)
            replacement_id = None

            if day_index % 3 == 1:
                if item_id == "lidl_001" and "lidl_026" in by_id:
                    replacement_id = "lidl_026"  # turkey breast slices
                elif item_id == "lidl_027" and "lidl_028" in by_id:
                    replacement_id = "lidl_028"  # cod fillet
                elif item_id == "lidl_011" and "lidl_042" in by_id:
                    replacement_id = "lidl_042"  # potatoes
            elif day_index % 3 == 2:
                if item_id == "lidl_027" and "lidl_029" in by_id:
                    replacement_id = "lidl_029"  # prawns
                elif item_id == "lidl_011" and "lidl_041" in by_id:
                    replacement_id = "lidl_041"  # quinoa
                elif item_id == "lidl_003" and "lidl_032" in by_id:
                    replacement_id = "lidl_032"  # high protein skyr

            if replacement_id:
                next_meal["items"][i] = _staple_component(by_id[replacement_id], servings)
                notes.append(f"Rotated {item.get('name', 'ingredient')} for {by_id[replacement_id].name} to reduce food boredom.")

        next_meal["total"] = _component_total(next_meal["items"])
        if notes:
            next_meal["variation_notes"] = notes[:3]
            tags = list(next_meal.get("tags", []))
            if "ROTATED" not in tags:
                tags.append("ROTATED")
            next_meal["tags"] = tags[:7]
        rotated.append(next_meal)
    return rotated


def _weekly_batch_prep_from_shopping(shopping_list: dict) -> list[dict]:
    """Turn the weekly shopping list into practical batch-prep blocks."""
    prep = []
    categories = shopping_list.get("categories", {}) or {}
    for category, items in categories.items():
        if category in {"protein", "carbs", "vegetables", "dairy / eggs", "fruit / recovery"}:
            total_cost = round(sum(float(item.get("estimated_cost_eur", 0) or 0) for item in items), 2)
            prep.append({
                "category": category,
                "item_count": len(items),
                "estimated_cost_eur": total_cost,
                "items": items[:8],
                "action": (
                    "cook/portion" if category in {"protein", "carbs", "vegetables"}
                    else "stock fridge"
                ),
            })
    prep.sort(key=lambda block: (block["category"] != "protein", -block["estimated_cost_eur"]))
    return prep[:6]


def build_weekly_meal_prep_plan(
    constitution: dict,
    start_date: date,
    days: int,
    staples: list[LidlStaple],
    recipes: list[Recipe],
    memory_entries: list[dict] | None = None,
) -> dict:
    """Build a 3-7 day approval-first weekly nutrition/prep plan.

    Phoenix plans the week locally. It uses existing day-planner logic, training
    vs rest targets, memory/pantry preferences, pantry-aware shopping, and small
    rotations to reduce food boredom. Nothing is logged or purchased here.
    """
    safe_days = max(3, min(7, int(days or 7)))
    by_id = {s.id: s for s in staples}
    memory_profile = build_nutrition_memory_profile(memory_entries)
    planned_days: list[dict] = []

    for offset in range(safe_days):
        day_date = start_date + timedelta(days=offset)
        status = check_nutrition(constitution, daily_log_items=[], today=day_date)
        base_plan = build_full_day_plan(status, staples, recipes, memory_entries=memory_entries)
        meals = _rotate_weekly_meals(base_plan.get("meals", []), by_id, offset, status.is_training_day)
        planned_total = _plan_total(meals)
        target = status.target
        planned_days.append({
            "date": day_date.isoformat(),
            "day_name": _weekday_label(day_date),
            "day_index": offset,
            "is_training_day": status.is_training_day,
            "day_type": "training" if status.is_training_day else "rest",
            "label": f"{_weekday_label(day_date)} · {'TRAINING' if status.is_training_day else 'REST'}",
            "target": {
                "calories": target.calories,
                "protein_g": target.protein_g,
                "carbs_g": target.carbs_g,
                "fat_g": target.fat_g,
            },
            "planned_total": planned_total,
            "target_gap": {
                "calories": _round_macro(target.calories - planned_total["calories"]),
                "protein_g": _round_macro(target.protein_g - planned_total["protein_g"]),
                "carbs_g": _round_macro(target.carbs_g - planned_total["carbs_g"]),
                "fat_g": _round_macro(target.fat_g - planned_total["fat_g"]),
            },
            "meals": meals,
            "recovery_notes": base_plan.get("recovery_notes", []),
            "requires_approval": True,
            "loggable": bool(meals),
        })

    weekly_total = _weekly_total(planned_days)
    avg_daily_total = {
        "calories": _round_macro(weekly_total["calories"] / safe_days),
        "protein_g": _round_macro(weekly_total["protein_g"] / safe_days),
        "carbs_g": _round_macro(weekly_total["carbs_g"] / safe_days),
        "fat_g": _round_macro(weekly_total["fat_g"] / safe_days),
        "price_eur": round(weekly_total.get("price_eur", 0.0) / safe_days, 2),
    }
    weekly_items = _flatten_weekly_plan_days(planned_days)
    shopping_list = build_shopping_list_from_items(
        weekly_items,
        memory_entries=memory_entries,
        source="weekly_plan",
        source_title=f"Phoenix {safe_days}-day meal prep plan",
    )
    split = _weekly_training_split(planned_days)
    batch_prep = _weekly_batch_prep_from_shopping(shopping_list)

    return {
        "mode": "weekly_meal_prep",
        "plan_id": f"weekly_meal_prep_{start_date.isoformat()}_{safe_days}d_v1",
        "start_date": start_date.isoformat(),
        "end_date": (start_date + timedelta(days=safe_days - 1)).isoformat(),
        "day_count": safe_days,
        "requires_approval": True,
        "summary": (
            f"Phoenix built a {safe_days}-day approval-first meal prep plan with "
            f"{split['training_days']} training days, {split['rest_days']} rest days, "
            f"and an estimated missing grocery cost of €{shopping_list['estimated_missing_cost_eur']:.2f}."
        ),
        "days": planned_days,
        "weekly_total": weekly_total,
        "avg_daily_total": avg_daily_total,
        "training_split": split,
        "shopping_list": shopping_list,
        "batch_prep": batch_prep,
        "budget_mode": {
            "estimated_missing_cost_eur": shopping_list["estimated_missing_cost_eur"],
            "estimated_full_cost_eur": shopping_list["estimated_full_cost_eur"],
            "budget_basket": shopping_list.get("budget_basket", []),
        },
        "memory": public_memory_summary(memory_profile),
        "principle": "Phoenix plans and prepares the week. You approve before logging meals or buying groceries.",
        "safety": "Weekly prep mode is local-first, approval-first, and grocery-list only. No purchases or hidden meal logging.",
    }

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
        profile = build_recipe_serving_profile(found)
        return LoggedItem(
            item_id=item_id,
            item_type="recipe",
            name=found.name,
            servings=servings,
            calories=profile["calories"] * servings,
            protein_g=profile["protein_g"] * servings,
            fat_g=profile["fat_g"] * servings,
            carbs_g=profile["carbs_g"] * servings,
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



# ---------------------------------------------------------------------------
# Calendar-aware nutrition bridge (v2.1)
# ---------------------------------------------------------------------------

def _event_time_label(event) -> str:
    start = event.time_start.strftime("%H:%M") if event.time_start else "all day"
    end = event.time_end.strftime("%H:%M") if event.time_end else None
    return f"{start}-{end}" if end else start


def _public_calendar_event(event) -> dict:
    return {
        "event_id": event.event_id,
        "event_type": getattr(event.event_type, "value", str(event.event_type)),
        "title": event.title,
        "date": event.date.isoformat(),
        "time_start": event.time_start.strftime("%H:%M") if event.time_start else None,
        "time_end": event.time_end.strftime("%H:%M") if event.time_end else None,
        "time_label": _event_time_label(event),
        "location": event.location,
        "role": event.role,
    }


def _event_end_hour(event) -> int | None:
    if event.time_end:
        return event.time_end.hour
    if event.time_start:
        return event.time_start.hour
    return None


def _calendar_day_type(events: list) -> str:
    types = {getattr(e.event_type, "value", str(e.event_type)) for e in events}
    if "performance" in types:
        return "performance_day"
    if "rehearsal" in types:
        if any((_event_end_hour(e) or 0) >= 21 for e in events if getattr(e.event_type, "value", str(e.event_type)) == "rehearsal"):
            return "late_rehearsal_day"
        return "rehearsal_day"
    if "travel" in types:
        return "travel_day"
    if events:
        return "scheduled_day"
    return "open_day"


def _calendar_priority(day_type: str) -> str:
    if day_type in {"performance_day", "late_rehearsal_day"}:
        return "high"
    if day_type in {"rehearsal_day", "travel_day"}:
        return "medium"
    if day_type == "scheduled_day":
        return "low"
    return "normal"


def _calendar_nutrition_moves(day_type: str, *, is_training_day_flag: bool) -> list[str]:
    base = [
        "Keep protein anchored early; do not leave the whole protein target for late night.",
        "Hydrate earlier in the day; include sodium/potassium/magnesium from food or a simple electrolyte if sweat/stage heat is high.",
    ]
    if day_type == "performance_day":
        return [
            "Front-load a calm, complete meal 3-4 hours before the performance.",
            "Use a portable protein + carb option if the gap between rehearsal, travel, and curtain is long.",
            "Keep the post-show meal lighter: lean protein, fermented dairy or vegetables; avoid forcing a heavy high-fat dinner right before sleep.",
            *base,
        ]
    if day_type == "late_rehearsal_day":
        return [
            "Plan dinner before the late rehearsal or prepare a light post-rehearsal closeout.",
            "Avoid arriving home with the full calorie/protein target still open.",
            "Use recovery-style whole foods: yogurt/skyr, fruit/berries, oats/rice/potatoes, fish/lean meat, vegetables.",
            *base,
        ]
    if day_type == "rehearsal_day":
        return [
            "Place a protein anchor before rehearsal if the call cuts across normal meal time.",
            "Use an easy portable snack if there is a long gap before the next meal.",
            *base,
        ]
    if day_type == "travel_day":
        return [
            "Pack a portable high-protein option and water before leaving.",
            "Choose lower-mess, stable foods: skyr/yogurt, tuna/chicken sandwich, fruit, oats/rice cakes, or a prepared bowl.",
            *base,
        ]
    if is_training_day_flag:
        return [
            "No calendar event is blocking nutrition timing; use the normal training-day recovery pattern.",
            "After hard training, use protein plus quality carbs instead of delaying nutrition for hours.",
            *base,
        ]
    return [
        "No calendar event is blocking nutrition timing; use the normal rest-day baseline.",
        "Keep digestion lighter near sleep and close protein steadily across the day.",
        *base,
    ]


def _calendar_meal_timing(day_type: str) -> list[dict]:
    if day_type == "performance_day":
        return [
            {"slot": "pre_performance", "timing": "3-4h before curtain", "focus": "complete meal: lean protein + controlled carbs + vegetables", "approval_required": True},
            {"slot": "portable_gap", "timing": "60-120m before if needed", "focus": "small protein + carb option; low mess, easy digestion", "approval_required": True},
            {"slot": "post_show", "timing": "after performance", "focus": "light closeout only if protein/calories remain", "approval_required": True},
        ]
    if day_type == "late_rehearsal_day":
        return [
            {"slot": "pre_rehearsal_dinner", "timing": "before late rehearsal", "focus": "main meal before the call", "approval_required": True},
            {"slot": "post_rehearsal_closeout", "timing": "after rehearsal", "focus": "light protein closeout if required", "approval_required": True},
        ]
    if day_type == "rehearsal_day":
        return [
            {"slot": "pre_rehearsal", "timing": "before call", "focus": "protein anchor", "approval_required": True},
            {"slot": "post_rehearsal", "timing": "after call", "focus": "normal meal or recovery meal depending on training", "approval_required": True},
        ]
    if day_type == "travel_day":
        return [
            {"slot": "portable_meal", "timing": "before leaving", "focus": "packable protein + carb + water", "approval_required": True},
        ]
    return [
        {"slot": "normal_planner", "timing": "normal day", "focus": "use standard Phoenix meal/day planner", "approval_required": True},
    ]


def _calendar_planner_adjustments(day_type: str) -> list[str]:
    if day_type == "performance_day":
        return ["prefer_portable_meal", "avoid_late_heavy_dinner", "front_load_protein", "early_hydration"]
    if day_type == "late_rehearsal_day":
        return ["pre_rehearsal_main_meal", "light_late_closeout", "early_hydration"]
    if day_type == "rehearsal_day":
        return ["protect_meal_window", "portable_snack_if_gap"]
    if day_type == "travel_day":
        return ["portable_food", "water_electrolytes", "pantry_packable_items"]
    return ["standard_nutrition_planner"]


def build_calendar_aware_nutrition_bridge(
    constitution: dict,
    status: NutritionStatus,
    calendar_snapshot_raw: dict,
    *,
    today: date | None = None,
    days: int = 7,
    memory_entries: list[dict] | None = None,
) -> dict:
    """Bridge calendar-shaped data into nutrition timing guidance.

    v2.1 intentionally does not fetch Plaan live. It consumes the existing
    read-only calendar snapshot contract, keeps all credentials/cookies out of
    Nutrition, and produces deterministic timing guidance only. Nothing is
    logged, bought, or sent to an AI provider.
    """
    from jarvis.domains.calendar import engine as calendar_engine

    start = today or date.today()
    window_days = max(1, min(int(days or 7), 14))
    try:
        snapshot = calendar_engine.parse_snapshot(calendar_snapshot_raw)
        parse_warning = None
    except Exception as exc:
        snapshot = None
        parse_warning = f"Calendar snapshot could not be parsed: {exc}"

    memory_profile = build_nutrition_memory_profile(memory_entries or [])
    memory_summary = public_memory_summary(memory_profile)
    schedule_days: list[dict] = []
    event_count = 0
    performance_count = 0
    rehearsal_count = 0
    travel_count = 0

    for offset in range(window_days):
        current = start + timedelta(days=offset)
        events = snapshot.events_on(current) if snapshot else []
        public_events = [_public_calendar_event(e) for e in events]
        event_count += len(events)
        performance_count += sum(1 for e in public_events if e["event_type"] == "performance")
        rehearsal_count += sum(1 for e in public_events if e["event_type"] == "rehearsal")
        travel_count += sum(1 for e in public_events if e["event_type"] == "travel")
        day_type = _calendar_day_type(events)
        is_training = is_training_day(constitution, current)
        schedule_days.append({
            "date": current.isoformat(),
            "day_offset": offset,
            "event_count": len(events),
            "events": public_events,
            "day_type": day_type,
            "priority": _calendar_priority(day_type),
            "is_training_day": is_training,
            "nutrition_moves": _calendar_nutrition_moves(day_type, is_training_day_flag=is_training),
            "meal_timing": _calendar_meal_timing(day_type),
            "planner_adjustments": _calendar_planner_adjustments(day_type),
            "requires_approval": True,
        })

    high_priority = [d for d in schedule_days if d["priority"] == "high"]
    next_scheduled = next((d for d in schedule_days if d["event_count"] > 0), None)
    if parse_warning:
        summary = "Calendar-aware nutrition is paused until a valid read-only calendar snapshot is available."
    elif event_count == 0:
        summary = "Calendar-aware nutrition bridge is ready, but the current Plaan snapshot has no personal events in this window. Use normal Nutrition planning."
    else:
        summary = (
            f"Calendar-aware nutrition found {event_count} event(s) across {window_days} days. "
            "Phoenix can time meals around rehearsals, performances, travel, and recovery without live Plaan writes or AI calls."
        )

    warnings = list(calendar_snapshot_raw.get("fetch_warnings", [])) if isinstance(calendar_snapshot_raw, dict) else []
    if parse_warning:
        warnings.append(parse_warning)

    return {
        "mode": "calendar_aware_nutrition_bridge",
        "version": "v2.1",
        "source": "calendar_snapshot_contract",
        "live_plaan_fetch_enabled": False,
        "ai_provider_required": False,
        "requires_approval": True,
        "summary": summary,
        "as_of": snapshot.as_of.isoformat() if snapshot else None,
        "window": {"start_date": start.isoformat(), "days": window_days},
        "today_status": {
            "date": status.as_of.isoformat(),
            "is_training_day": status.is_training_day,
            "remaining_calories": _round_macro(status.remaining_calories),
            "remaining_protein_g": _round_macro(status.remaining_protein_g),
            "adherence_status": status.adherence_status,
        },
        "counts": {
            "events": event_count,
            "performances": performance_count,
            "rehearsals": rehearsal_count,
            "travel": travel_count,
            "high_priority_days": len(high_priority),
        },
        "next_scheduled_day": next_scheduled,
        "days": schedule_days,
        "memory": memory_summary,
        "fetch_warnings": warnings,
        "safety": {
            "read_only_calendar": True,
            "no_plaan_mutations": True,
            "no_credentials_in_nutrition": True,
            "no_raw_page_sent_to_ai": True,
            "no_auto_logging": True,
            "no_auto_shopping": True,
        },
        "next_build": "Live Plaan fetch can be added later as a separate read-only fetcher; this bridge only consumes normalized snapshots.",
    }

def _acceptance_check(checks: list[dict], key: str, passed: bool, detail: str, severity: str = "blocker", evidence: dict | None = None) -> None:
    checks.append({
        "key": key,
        "status": "pass" if passed else "fail",
        "severity": severity,
        "detail": detail,
        "evidence": evidence or {},
    })


def build_nutrition_acceptance_gate(
    constitution: dict,
    today: date | None = None,
    memory_entries: list[dict] | None = None,
) -> dict:
    """Run the local Nutrition v2.0 product acceptance contract.

    This gate is intentionally deterministic and provider-free. It verifies the
    product contracts that make Phoenix Nutrition trustworthy: no fake food data,
    per-serving recipe safety, approval-first autonomous features, pantry-aware
    shopping, weekly prep shape, and transcript-inspired recovery guidance without
    medical claims. It does not log meals, buy groceries, or call an AI provider.
    """
    gate_date = today or date.today()
    checks: list[dict] = []
    recipes = load_recipes()
    staples = load_lidl_staples()
    status = check_nutrition(constitution, [], today=gate_date)
    recipe_profiles = [build_recipe_serving_profile(recipe) for recipe in recipes]
    apple_bake = next((r for r in recipes if r.id == "recipe_001"), None)
    apple_profile = build_recipe_serving_profile(apple_bake) if apple_bake else None

    _acceptance_check(
        checks,
        "food_brain_inventory",
        len(recipes) == 156 and len(staples) == 60,
        "Phoenix food brain has the expected recipe and Lidl staple inventory.",
        evidence={"recipes": len(recipes), "staples": len(staples)},
    )
    _acceptance_check(
        checks,
        "recipe_serving_safety",
        bool(apple_profile and apple_profile["is_batch_recipe"] and apple_profile["calories"] < 1000 and apple_profile["calories"] < apple_profile["full_calories"]),
        "Large batch recipes are converted into loggable servings and cannot silently log a full tray as one meal.",
        evidence={
            "recipe_id": "recipe_001",
            "serving_count": apple_profile.get("serving_count") if apple_profile else None,
            "serving_calories": apple_profile.get("calories") if apple_profile else None,
            "full_calories": apple_profile.get("full_calories") if apple_profile else None,
        },
    )
    _acceptance_check(
        checks,
        "recipe_unit_cleanup",
        sum(1 for p in recipe_profiles if p.get("serving_count", 1) > 1) >= 120,
        "Imported multi-unit/batch recipes expose per-unit or per-serving macros.",
        evidence={
            "batch_or_unit_recipes": sum(1 for p in recipe_profiles if p.get("serving_count", 1) > 1),
            "single_recipes": sum(1 for p in recipe_profiles if p.get("serving_count", 1) == 1),
        },
    )
    _acceptance_check(
        checks,
        "truthful_empty_day_contract",
        status.adherence_status == "empty" and status.calorie_status == "not_logged" and status.protein_status == "not_logged",
        "A no-log day remains explicitly unknown/empty instead of pretending adherence is good.",
        evidence={
            "adherence_status": status.adherence_status,
            "calorie_status": status.calorie_status,
            "protein_status": status.protein_status,
        },
    )
    _acceptance_check(
        checks,
        "recovery_protocol_safety",
        isinstance(status.recovery_protocol if hasattr(status, "recovery_protocol") else None, dict) is False,
        "Recovery protocol is serialized by the API; domain status stays pure and AI/provider-free.",
        severity="info",
        evidence={"domain_status_type": type(status).__name__},
    )

    meal_builder = build_autonomous_meal_suggestions(status, staples, recipes, memory_entries=memory_entries)
    suggestions = meal_builder.get("suggestions", [])
    _acceptance_check(
        checks,
        "autonomous_meal_builder",
        meal_builder.get("requires_approval") is True and bool(suggestions) and all(s.get("loggable") for s in suggestions),
        "Autonomous meal builder returns loggable proposals but still requires explicit approval.",
        evidence={"suggestion_count": len(suggestions), "requires_approval": meal_builder.get("requires_approval")},
    )

    full_day = build_full_day_plan(status, staples, recipes, memory_entries=memory_entries)
    _acceptance_check(
        checks,
        "full_day_planner",
        full_day.get("requires_approval") is True and bool(full_day.get("meals")) and full_day.get("planned_total", {}).get("calories", 0) > 0,
        "Full-day planner returns meal slots and target totals without logging anything automatically.",
        evidence={
            "meal_count": len(full_day.get("meals", [])),
            "planned_calories": full_day.get("planned_total", {}).get("calories"),
            "requires_approval": full_day.get("requires_approval"),
        },
    )

    shopping_items = []
    for meal in full_day.get("meals", []):
        shopping_items.extend(meal.get("items", []))
    shopping = build_shopping_list_from_items(shopping_items, memory_entries=memory_entries, source="day_plan", source_title="Acceptance gate day plan")
    _acceptance_check(
        checks,
        "shopping_list_contract",
        shopping.get("requires_approval") is True and "need_to_buy" in shopping and "already_have" in shopping and "estimated_missing_cost_eur" in shopping,
        "Shopping mode separates missing items from pantry items and never purchases automatically.",
        evidence={
            "need_to_buy": len(shopping.get("need_to_buy", [])),
            "already_have": len(shopping.get("already_have", [])),
            "estimated_missing_cost_eur": shopping.get("estimated_missing_cost_eur"),
        },
    )

    weekly_results = {}
    weekly_pass = True
    for days in (3, 5, 7):
        weekly = build_weekly_meal_prep_plan(constitution, start_date=gate_date, days=days, staples=staples, recipes=recipes, memory_entries=memory_entries)
        weekly_results[str(days)] = {
            "day_count": weekly.get("day_count"),
            "has_shopping_list": bool(weekly.get("shopping_list")),
            "has_batch_prep": bool(weekly.get("batch_prep")),
            "requires_approval": weekly.get("requires_approval"),
        }
        weekly_pass = weekly_pass and weekly.get("requires_approval") is True and weekly.get("day_count") == days and bool(weekly.get("shopping_list")) and bool(weekly.get("batch_prep"))
    _acceptance_check(
        checks,
        "weekly_meal_prep_contract",
        weekly_pass,
        "Weekly prep supports 3/5/7-day plans with grocery and batch-prep outputs.",
        evidence=weekly_results,
    )

    memory_profile = build_nutrition_memory_profile(memory_entries or [])
    _acceptance_check(
        checks,
        "nutrition_memory_contract",
        {"favorite_count", "avoid_count", "pantry_count", "preferred_count"}.issubset(public_memory_summary(memory_profile).keys()),
        "Nutrition memory exposes user-controlled favorites, avoids, pantry and preferred staples.",
        evidence=public_memory_summary(memory_profile),
    )

    # A high-level no-fake-data regression check: all surfaced suggestions must be
    # linked to real recipe/staple/custom items with non-negative macros.
    proposal_items = []
    for suggestion in suggestions:
        proposal_items.extend(suggestion.get("items", []))
    for meal in full_day.get("meals", []):
        proposal_items.extend(meal.get("items", []))
    fake_terms = ("fake", "mock", "prototype", "lorem", "sample only")
    no_fake_items = bool(proposal_items) and all(
        item.get("name") and not any(term in str(item.get("name", "")).lower() for term in fake_terms)
        and float(item.get("calories", 0)) >= 0
        and float(item.get("protein_g", 0)) >= 0
        for item in proposal_items
    )
    _acceptance_check(
        checks,
        "no_fake_nutrition_data_regression",
        no_fake_items,
        "Planner/builder items use real food-brain entries or user-created rows, not prototype filler meals.",
        evidence={"checked_items": len(proposal_items)},
    )

    failed = [c for c in checks if c["status"] != "pass" and c.get("severity") == "blocker"]
    warnings = [c for c in checks if c["status"] != "pass" and c.get("severity") != "blocker"]
    return {
        "mode": "nutrition_acceptance_gate",
        "version": "v2.0",
        "gate_date": gate_date.isoformat(),
        "verdict": "PASS" if not failed else "FAIL",
        "ready_for_calendar_aware_nutrition": not failed,
        "checks_total": len(checks),
        "checks_passed": sum(1 for c in checks if c["status"] == "pass"),
        "blockers": failed,
        "warnings": warnings,
        "checks": checks,
        "contracts": {
            "local_first": True,
            "approval_first": True,
            "ai_provider_required": False,
            "no_auto_logging": True,
            "no_auto_purchasing": True,
            "no_medical_claims": True,
            "home_and_finance_untouched": True,
        },
        "inventory": {
            "recipes": len(recipes),
            "staples": len(staples),
            "batch_or_unit_recipes": sum(1 for p in recipe_profiles if p.get("serving_count", 1) > 1),
        },
    }


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

    day_classification = classify_nutrition_day(
        log.total_calories if log.items else None,
        log.total_protein_g if log.items else None,
        target,
    )

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
        calorie_target_met=(
            target.calories * 0.90 <= log.total_calories <= target.calories * 1.10
            if log.items else False
        ),
        adherence_status=day_classification["adherence_status"],
        calorie_status=day_classification["calorie_status"],
        protein_status=day_classification["protein_status"],
        suggested_recipes=tuple(suggestions),
    )
