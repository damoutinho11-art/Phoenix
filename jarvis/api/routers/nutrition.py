"""Nutrition API routes."""

import anthropic
from datetime import date
from fastapi import APIRouter, Depends, Query

from jarvis.api.dependencies import get_nutrition_constitution
from jarvis.domains.nutrition import engine
from jarvis.domains.nutrition.data_contracts import NutritionStatus, Recipe, LidlStaple

router = APIRouter()

_NUTRITION_BRIEF_SYSTEM = (
    "You are J.A.R.V.I.S., a personal nutrition assistant tracking macros during a "
    "cut phase. Direct, data-driven, no fluff. Maximum 4 sentences. Always end with "
    "remaining protein target for today. Never invent data."
)


def _serialize_recipe(r: Recipe) -> dict:
    return {
        "id": r.id, "name": r.name, "category": r.category,
        "page": r.page, "serving": r.serving, "calories": r.calories,
        "protein_g": r.protein_g, "fat_g": r.fat_g,
        "carbs_g": r.carbs_g, "fiber_g": r.fiber_g,
    }


def _serialize_staple(s: LidlStaple) -> dict:
    return {
        "id": s.id, "name": s.name, "unit": s.unit,
        "price_eur": s.price_eur, "calories": s.calories,
        "protein_g": s.protein_g, "fat_g": s.fat_g, "carbs_g": s.carbs_g,
    }


def _serialize_status(status: NutritionStatus) -> dict:
    t = status.target
    log = status.logged
    return {
        "as_of": status.as_of.isoformat(),
        "phase": status.phase,
        "is_training_day": status.is_training_day,
        "target": {
            "calories": t.calories,
            "protein_g": t.protein_g,
            "carbs_g": t.carbs_g,
            "fat_g": t.fat_g,
        },
        "logged": {
            "total_calories": round(log.total_calories, 1),
            "total_protein_g": round(log.total_protein_g, 1),
            "total_fat_g": round(log.total_fat_g, 1),
            "total_carbs_g": round(log.total_carbs_g, 1),
            "items": [
                {
                    "item_id": item.item_id,
                    "item_type": item.item_type,
                    "name": item.name,
                    "servings": item.servings,
                    "calories": round(item.calories, 1),
                    "protein_g": round(item.protein_g, 1),
                }
                for item in log.items
            ],
        },
        "remaining_calories": round(status.remaining_calories, 1),
        "remaining_protein_g": round(status.remaining_protein_g, 1),
        "remaining_fat_g": round(status.remaining_fat_g, 1),
        "remaining_carbs_g": round(status.remaining_carbs_g, 1),
        "protein_target_met": status.protein_target_met,
        "calorie_target_met": status.calorie_target_met,
        "suggested_recipes": [_serialize_recipe(r) for r in status.suggested_recipes],
    }


@router.get("/status")
def nutrition_status(
    constitution: dict = Depends(get_nutrition_constitution),
) -> dict:
    status = engine.check_nutrition(
        constitution,
        daily_log_items=[],
        today=date.today(),
    )
    return _serialize_status(status)


@router.get("/recipes")
def list_recipes(
    category: str | None = Query(None),
    max_calories: int | None = Query(None),
    min_protein: int | None = Query(None),
) -> dict:
    recipes = engine.load_recipes()
    if category:
        recipes = [r for r in recipes if r.category.lower() == category.lower()]
    if max_calories is not None:
        recipes = [r for r in recipes if r.calories <= max_calories]
    if min_protein is not None:
        recipes = [r for r in recipes if r.protein_g >= min_protein]
    return {"count": len(recipes), "recipes": [_serialize_recipe(r) for r in recipes]}


@router.get("/staples")
def list_staples(
    constitution: dict = Depends(get_nutrition_constitution),
) -> dict:
    staples = engine.load_lidl_staples()
    return {"count": len(staples), "staples": [_serialize_staple(s) for s in staples]}


@router.get("/brief")
def nutrition_brief(
    constitution: dict = Depends(get_nutrition_constitution),
) -> dict:
    status = engine.check_nutrition(
        constitution,
        daily_log_items=[],
        today=date.today(),
    )
    s = _serialize_status(status)
    t = s["target"]

    user_message = (
        f"Nutrition status as of {s['as_of']}:\n"
        f"Phase: {s['phase'].upper()}, "
        f"{'Training day' if s['is_training_day'] else 'Rest day'}\n"
        f"Target: {t['calories']} kcal | {t['protein_g']}g protein | "
        f"{t['carbs_g']}g carbs | {t['fat_g']}g fat\n"
        f"Logged so far: {s['logged']['total_calories']} kcal | "
        f"{s['logged']['total_protein_g']}g protein\n"
        f"Remaining: {s['remaining_calories']} kcal | "
        f"{s['remaining_protein_g']}g protein | "
        f"{s['remaining_carbs_g']}g carbs\n"
        f"Protein target met: {s['protein_target_met']}\n"
    )

    if s["suggested_recipes"]:
        suggestions = ", ".join(
            f"{rec['name']} ({rec['calories']} kcal, {rec['protein_g']}g P)"
            for rec in s["suggested_recipes"]
        )
        user_message += f"Suggested next meal: {suggestions}\n"

    user_message += "\nProvide a brief, direct nutrition summary for today."

    try:
        client = anthropic.Anthropic()
        message = client.messages.create(
            model="claude-sonnet-4-6",
            max_tokens=256,
            system=_NUTRITION_BRIEF_SYSTEM,
            messages=[{"role": "user", "content": user_message}],
        )
        brief_text = message.content[0].text
    except Exception:
        brief_text = (
            "Unable to generate brief. "
            "Raw nutrition status available via /nutrition/status."
        )

    return {"brief": brief_text, "requires_approval": True}
