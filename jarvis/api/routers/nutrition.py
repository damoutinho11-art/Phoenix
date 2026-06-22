"""Nutrition API routes."""

import anthropic
from datetime import date
from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel, Field

from jarvis.api.dependencies import get_nutrition_constitution
from jarvis.data import database
from jarvis.domains.nutrition import engine
from jarvis.domains.nutrition.data_contracts import NutritionStatus, Recipe, LidlStaple

router = APIRouter()


class LogMealRequest(BaseModel):
    log_date: date | None = None
    item_id: str = Field(min_length=1)
    item_type: str = Field(min_length=1)
    name: str = Field(min_length=1)
    servings: float = Field(default=1.0, gt=0)
    calories: float = Field(ge=0)
    protein_g: float = Field(ge=0)
    fat_g: float = Field(ge=0)
    carbs_g: float = Field(ge=0)
    source: str = Field(default="manual", min_length=1)


class LogWeightRequest(BaseModel):
    log_date: date | None = None
    weight_kg: float = Field(gt=0, le=500)

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
                    "fat_g": round(item.fat_g, 1),
                    "carbs_g": round(item.carbs_g, 1),
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


def _meal_to_engine_item(meal: dict) -> dict:
    return {
        "item_id": meal["item_id"],
        "item_type": meal["item_type"],
        "name": meal["name"],
        "servings": meal["servings"],
        "calories": meal["calories"],
        "protein_g": meal["protein_g"],
        "fat_g": meal["fat_g"],
        "carbs_g": meal["carbs_g"],
    }


def _status_for_date(constitution: dict, target_date: date) -> tuple[NutritionStatus, list[dict]]:
    meals = database.get_meals_for_date(target_date)
    status = engine.check_nutrition(
        constitution,
        daily_log_items=[_meal_to_engine_item(meal) for meal in meals],
        today=target_date,
    )
    return status, meals


@router.get("/status")
def nutrition_status(
    constitution: dict = Depends(get_nutrition_constitution),
) -> dict:
    status, meals = _status_for_date(constitution, date.today())
    response = _serialize_status(status)
    response["meal_log"] = meals
    return response


@router.post("/log/meal")
def create_meal_log(request: LogMealRequest) -> dict:
    log_date = request.log_date or date.today()
    meal_id = database.log_meal(
        log_date=log_date,
        item_id=request.item_id,
        item_type=request.item_type,
        name=request.name,
        servings=request.servings,
        calories=request.calories,
        protein_g=request.protein_g,
        fat_g=request.fat_g,
        carbs_g=request.carbs_g,
        source=request.source,
    )
    return {"status": "logged", "meal_id": meal_id, "log_date": log_date.isoformat()}


@router.delete("/log/meal/{meal_id}")
def remove_meal_log(meal_id: int) -> dict:
    if not database.delete_meal(meal_id):
        raise HTTPException(status_code=404, detail="Meal log entry not found")
    return {"status": "deleted", "meal_id": meal_id}


@router.post("/log/weight")
def create_weight_log(request: LogWeightRequest) -> dict:
    log_date = request.log_date or date.today()
    weight_id = database.log_weight(log_date, request.weight_kg)
    return {
        "status": "logged",
        "weight_id": weight_id,
        "log_date": log_date.isoformat(),
        "weight_kg": request.weight_kg,
    }


@router.get("/log/weight/history")
def weight_history(days: int = Query(30, ge=1, le=3650)) -> dict:
    weights = database.get_weight_history(days)
    return {"days": days, "count": len(weights), "weights": weights}


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
    status, _ = _status_for_date(constitution, date.today())
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
