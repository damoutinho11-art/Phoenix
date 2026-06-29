"""Nutrition API routes."""

from collections import Counter
from datetime import date, timedelta
from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel, Field

from jarvis.api.dependencies import get_nutrition_constitution
from jarvis.api import ai_gateway
from jarvis.data import database
from jarvis.domains.nutrition import engine
from jarvis.domains.nutrition.data_contracts import NutritionStatus, Recipe, LidlStaple
from jarvis.domains.calendar import plaan_live
from jarvis.domains.calendar.tests.fixtures import LIVE_SNAPSHOT_RAW

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


class BuiltMealItemRequest(BaseModel):
    item_id: str = Field(min_length=1)
    item_type: str = Field(min_length=1)
    name: str = Field(min_length=1)
    unit: str = Field(default="serving", min_length=1)
    servings: float = Field(gt=0, le=20)
    calories: float = Field(ge=0, le=5000)
    protein_g: float = Field(ge=0, le=500)
    fat_g: float = Field(ge=0, le=500)
    carbs_g: float = Field(ge=0, le=1000)
    price_eur: float = Field(default=0.0, ge=0, le=500)


class LogBuiltMealRequest(BaseModel):
    suggestion_id: str = Field(min_length=1)
    log_date: date | None = None
    meal_slot: str = Field(default="next_meal", min_length=1, max_length=30)
    title: str | None = Field(default=None, max_length=120)
    items: list[BuiltMealItemRequest] | None = Field(default=None, max_length=12)


class DayPlanMealRequest(BaseModel):
    meal_id: str = Field(min_length=1)
    slot: str = Field(min_length=1, max_length=30)
    title: str = Field(min_length=1, max_length=120)
    items: list[BuiltMealItemRequest] = Field(min_length=1, max_length=12)


class LogDayPlanRequest(BaseModel):
    plan_id: str = Field(min_length=1)
    log_date: date | None = None
    meals: list[DayPlanMealRequest] | None = Field(default=None, max_length=8)


class WeeklyPlanDayRequest(BaseModel):
    date: date
    meals: list[DayPlanMealRequest] = Field(min_length=1, max_length=8)


class LogWeeklyPlanRequest(BaseModel):
    plan_id: str = Field(min_length=1)
    days: list[WeeklyPlanDayRequest] | None = Field(default=None, max_length=7)


class NutritionMemoryRequest(BaseModel):
    kind: str = Field(min_length=1, max_length=30)
    item_id: str | None = Field(default="", max_length=120)
    item_type: str | None = Field(default="general", max_length=60)
    name: str = Field(min_length=1, max_length=160)
    note: str | None = Field(default=None, max_length=500)
    payload: dict | None = None
    source: str = Field(default="user", min_length=1, max_length=60)

_NUTRITION_BRIEF_SYSTEM = (
    "You are J.A.R.V.I.S., a personal nutrition assistant tracking macros during a "
    "cut phase. Direct, data-driven, no fluff. Maximum 4 sentences. Always end with "
    "remaining protein target for today. Never invent data."
)


def _serialize_recipe(r: Recipe) -> dict:
    serving = engine.build_recipe_serving_profile(r)
    return {
        "id": r.id,
        "name": r.name,
        "category": r.category,
        "page": r.page,
        "serving": serving["serving_label"],
        "source_serving": r.serving,
        "serving_count": serving["serving_count"],
        "serving_basis": serving["serving_basis"],
        "portion_unit": serving["portion_unit"],
        "serving_note": serving["serving_note"],
        "tags": serving["tags"],
        "is_batch_recipe": serving["is_batch_recipe"],
        "calories": serving["calories"],
        "protein_g": serving["protein_g"],
        "fat_g": serving["fat_g"],
        "carbs_g": serving["carbs_g"],
        "fiber_g": serving["fiber_g"],
        "full_calories": serving["full_calories"],
        "full_protein_g": serving["full_protein_g"],
        "full_fat_g": serving["full_fat_g"],
        "full_carbs_g": serving["full_carbs_g"],
        "full_fiber_g": serving["full_fiber_g"],
    }



def _memory_summary(entries: list[dict]) -> dict:
    counts = Counter(entry["kind"] for entry in entries)
    return {
        "favorite_count": counts.get("favorite", 0),
        "avoid_count": counts.get("dislike", 0),
        "pantry_count": counts.get("pantry", 0),
        "preferred_count": counts.get("preferred", 0),
        "active": bool(entries),
    }

def _serialize_staple(s: LidlStaple) -> dict:
    return {
        "id": s.id, "name": s.name, "unit": s.unit,
        "price_eur": s.price_eur, "calories": s.calories,
        "protein_g": s.protein_g, "fat_g": s.fat_g, "carbs_g": s.carbs_g,
        "category": engine._staple_category(s),
        "tags": engine._staple_tags(s),
    }


def _recovery_protocol(status: NutritionStatus) -> dict:
    """Return conservative recovery nutrition guidance derived from current targets."""
    protein_left = max(0, round(status.remaining_protein_g))
    calorie_left = max(0, round(status.remaining_calories))
    carb_left = max(0, round(status.remaining_carbs_g))

    if status.is_training_day:
        title = "TRAINING DAY RECOVERY"
        primary = (
            "After hard training, prioritize 20-40g protein plus quality carbs. "
            f"Today leaves {protein_left}g protein, {carb_left}g carbs, and {calorie_left} kcal."
        )
        checks = [
            "Post-session: protein + carbs before ultra-processed snacks.",
            "Carbs are timed fuel today: oats, rice, potatoes, fruit, or quinoa.",
            "Hydration is water plus sodium/potassium/magnesium from food or a simple electrolyte.",
        ]
    else:
        title = "REST DAY BASELINE"
        primary = (
            "Keep protein steady, reduce carb load versus training days, and use whole foods "
            f"to close the remaining {protein_left}g protein without overshooting calories."
        )
        checks = [
            "Use vegetables, olive oil, berries, yogurt/kefir, fish, eggs, or lean meats as default anchors.",
            "Avoid turning rest day into random snacking; keep digestion light before sleep.",
            "Hydration still matters: water plus mineral-rich foods.",
        ]

    return {
        "title": title,
        "primary": primary,
        "checks": checks,
        "source": "recovery_nutrition_principles",
        "medical_claim": False,
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
        "adherence_status": status.adherence_status,
        "calorie_status": status.calorie_status,
        "protein_status": status.protein_status,
        "recovery_protocol": _recovery_protocol(status),
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
    entries = database.get_nutrition_memory()
    response["memory"] = _memory_summary(entries)
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



@router.get("/log/meals/recent")
def recent_meals(
    limit: int = Query(20, ge=1, le=100),
) -> dict:
    meals = database.get_recent_meals(limit=limit)
    return {"count": len(meals), "meals": meals}

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
def weight_history(
    days: int = Query(30, ge=1, le=3650),
    constitution: dict = Depends(get_nutrition_constitution),
) -> dict:
    weights = database.get_weight_history(days)
    profile = constitution.get("profile", {})
    baseline_weight_kg = profile.get("weight_kg")
    return {
        "days": days,
        "count": len(weights),
        "weights": weights,
        "baseline_weight_kg": baseline_weight_kg,
    }


@router.get("/log/meals/history")
def meal_history(
    days: int = Query(14, ge=1, le=90),
    constitution: dict = Depends(get_nutrition_constitution),
) -> dict:
    rows = database.get_meal_history(days=days)
    enriched_rows = []

    for row in rows:
        row_date = date.fromisoformat(row["date"])
        target = engine.get_macro_target(constitution, row_date)
        classification = engine.classify_nutrition_day(
            row["total_calories"] if row["has_data"] else None,
            row["total_protein_g"] if row["has_data"] else None,
            target,
        )
        enriched_rows.append({
            **row,
            "target_calories": target.calories,
            "target_protein_g": target.protein_g,
            "target_met": (
                classification["adherence_status"] == "good"
                if row["has_data"] else None
            ),
            **classification,
        })

    days_with_data = [r for r in enriched_rows if r["has_data"]]
    good_days = [r for r in days_with_data if r["adherence_status"] == "good"]
    warn_days = [r for r in days_with_data if r["adherence_status"] == "warn"]
    adherence_pct = round(len(good_days) / max(1, len(days_with_data)) * 100)
    avg_protein = (
        round(sum(r["total_protein_g"] for r in days_with_data) / len(days_with_data), 1)
        if days_with_data else None
    )
    today_target = engine.get_macro_target(constitution, date.today())

    return {
        "days": days,
        "history": enriched_rows,
        "adherence_pct": adherence_pct,
        "avg_protein_g": avg_protein,
        "good_days": len(good_days),
        "warn_days": len(warn_days),
        "logged_days": len(days_with_data),
        "target_calories": today_target.calories,
        "target_protein_g": today_target.protein_g,
    }






@router.get("/calendar-bridge")
def nutrition_calendar_bridge(
    days: int = Query(7, ge=1, le=14),
    start_date: date | None = Query(None),
    constitution: dict = Depends(get_nutrition_constitution),
) -> dict:
    """Return calendar-aware nutrition timing guidance.

    This v2.1 bridge consumes the existing read-only calendar snapshot contract.
    It does not fetch Plaan live, mutate Plaan, send raw calendar pages to AI, or
    log meals automatically.
    """
    bridge_date = start_date or date.today()
    status, _meals = _status_for_date(constitution, bridge_date)
    entries = database.get_nutrition_memory()
    latest_import = database.get_latest_calendar_snapshot_import()
    imported_snapshot = latest_import.get("snapshot") if latest_import else None
    calendar_snapshot_raw, source_info = plaan_live.resolve_snapshot_raw(LIVE_SNAPSHOT_RAW, imported_snapshot=imported_snapshot)
    result = engine.build_calendar_aware_nutrition_bridge(
        constitution=constitution,
        status=status,
        calendar_snapshot_raw=calendar_snapshot_raw,
        today=bridge_date,
        days=days,
        memory_entries=entries,
    )
    result["calendar_source"] = source_info
    result["plaan_live_fetcher"] = {
        "stage": "v2.3_manual_snapshot_import",
        "live_fetch_default": False,
        "credentials_sent_to_ai": False,
        "raw_page_sent_to_ai": False,
        "mutations_allowed": False,
    }
    return result


@router.get("/acceptance-gate")
def nutrition_acceptance_gate(
    constitution: dict = Depends(get_nutrition_constitution),
) -> dict:
    """Return the Nutrition v2.0 product acceptance gate report.

    The gate is read-only: it never logs food, buys groceries, or calls an AI
    provider. It protects the nutrition core before calendar-aware nutrition is
    added later.
    """
    memory_entries = database.get_nutrition_memory()
    report = engine.build_nutrition_acceptance_gate(
        constitution,
        today=date.today(),
        memory_entries=memory_entries,
    )
    report["api_contract"] = {
        "status": "/nutrition/status",
        "recipes": "/nutrition/recipes",
        "staples": "/nutrition/staples",
        "meal_builder": "/nutrition/meal-builder",
        "day_plan": "/nutrition/day-plan",
        "memory": "/nutrition/memory",
        "shopping_list": "/nutrition/shopping-list",
        "weekly_plan": "/nutrition/weekly-plan",
        "acceptance_gate": "/nutrition/acceptance-gate",
    }
    return report


@router.get("/memory")
def nutrition_memory(kind: str | None = Query(None)) -> dict:
    entries = database.get_nutrition_memory(kind=kind)
    return {
        "count": len(entries),
        "entries": entries,
        "summary": _memory_summary(entries),
        "principle": "User-controlled local nutrition memory: favorites, dislikes, pantry, and preferred staples.",
    }


@router.post("/memory")
def save_memory(request: NutritionMemoryRequest) -> dict:
    try:
        entry = database.save_nutrition_memory(
            kind=request.kind,
            item_id=request.item_id or "",
            item_type=request.item_type or "general",
            name=request.name,
            note=request.note,
            payload=request.payload or {},
            source=request.source,
        )
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc))
    entries = database.get_nutrition_memory()
    return {"status": "saved", "entry": entry, "summary": _memory_summary(entries)}


@router.delete("/memory/{memory_id}")
def delete_memory(memory_id: int) -> dict:
    if not database.delete_nutrition_memory(memory_id):
        raise HTTPException(status_code=404, detail="Nutrition memory entry not found")
    entries = database.get_nutrition_memory()
    return {"status": "deleted", "memory_id": memory_id, "summary": _memory_summary(entries)}


@router.get("/repeat/yesterday")
def repeat_yesterday_preview() -> dict:
    yesterday = date.today() - timedelta(days=1)
    meals = database.get_meals_for_date(yesterday)
    total = _total_plan_items(meals) if meals else {"calories": 0, "protein_g": 0, "fat_g": 0, "carbs_g": 0, "price_eur": 0}
    return {
        "source_date": yesterday.isoformat(),
        "target_date": date.today().isoformat(),
        "count": len(meals),
        "meals": meals,
        "total": total,
        "loggable": bool(meals),
        "requires_approval": True,
    }


@router.post("/log/repeat-yesterday")
def log_repeat_yesterday() -> dict:
    yesterday = date.today() - timedelta(days=1)
    source_meals = database.get_meals_for_date(yesterday)
    if not source_meals:
        raise HTTPException(status_code=404, detail="No meals logged yesterday")
    logged = []
    for meal in source_meals:
        meal_id = database.log_meal(
            log_date=date.today(),
            item_id=f"repeat-yesterday-{meal['item_id']}",
            item_type=meal["item_type"],
            name=f"Repeat Yesterday: {meal['name']}",
            servings=meal["servings"],
            calories=meal["calories"],
            protein_g=meal["protein_g"],
            fat_g=meal["fat_g"],
            carbs_g=meal["carbs_g"],
            source="phoenix_memory:repeat_yesterday",
        )
        logged.append({**meal, "meal_id": meal_id})
    return {
        "status": "logged",
        "source_date": yesterday.isoformat(),
        "target_date": date.today().isoformat(),
        "meal_count": len(logged),
        "meals": logged,
        "total": _total_plan_items(source_meals),
        "requires_approval": True,
    }

@router.get("/food-brain")
def nutrition_food_brain() -> dict:
    """Return inventory counts for Phoenix's local nutrition food brain."""
    recipes = engine.load_recipes()
    staples = engine.load_lidl_staples()
    serialized_recipes = [_serialize_recipe(r) for r in recipes]
    serialized_staples = [_serialize_staple(s) for s in staples]
    recipe_categories = Counter(r["category"] for r in serialized_recipes)
    staple_categories = Counter(s["category"] for s in serialized_staples)
    serving_bases = Counter(r["serving_basis"] for r in serialized_recipes)
    batch_count = sum(1 for r in serialized_recipes if r["is_batch_recipe"])
    tagged_recipe_count = sum(1 for r in serialized_recipes if r.get("tags"))
    tagged_staple_count = sum(1 for s in serialized_staples if s.get("tags"))
    return {
        "recipes_count": len(serialized_recipes),
        "staples_count": len(serialized_staples),
        "recipe_categories": dict(sorted(recipe_categories.items())),
        "staple_categories": dict(sorted(staple_categories.items())),
        "recipe_serving_bases": dict(sorted(serving_bases.items())),
        "batch_recipes_count": batch_count,
        "single_recipe_count": len(serialized_recipes) - batch_count,
        "tagged_recipe_count": tagged_recipe_count,
        "tagged_staple_count": tagged_staple_count,
        "principle": "Local food brain first. Exact product labels override defaults when available.",
    }


@router.get("/recipes")
def list_recipes(
    category: str | None = Query(None),
    max_calories: int | None = Query(None),
    min_protein: int | None = Query(None),
) -> dict:
    recipes = engine.load_recipes()
    if category:
        recipes = [r for r in recipes if r.category.lower() == category.lower()]

    serialized = [_serialize_recipe(r) for r in recipes]
    if max_calories is not None:
        serialized = [r for r in serialized if r["calories"] <= max_calories]
    if min_protein is not None:
        serialized = [r for r in serialized if r["protein_g"] >= min_protein]
    return {"count": len(serialized), "recipes": serialized}


@router.get("/staples")
def list_staples(
    constitution: dict = Depends(get_nutrition_constitution),
) -> dict:
    staples = engine.load_lidl_staples()
    return {"count": len(staples), "staples": [_serialize_staple(s) for s in staples]}



def _builder_context(constitution: dict) -> dict:
    status, _ = _status_for_date(constitution, date.today())
    staples = engine.load_lidl_staples()
    recipes = engine.load_recipes()
    memory_entries = database.get_nutrition_memory()
    return engine.build_autonomous_meal_suggestions(status, staples, recipes, memory_entries=memory_entries)


@router.get("/meal-builder")
def meal_builder(
    constitution: dict = Depends(get_nutrition_constitution),
) -> dict:
    """Return deterministic approval-first meal proposals.

    This is local nutrition logic, not an LLM call. Phoenix may propose the next
    meal, but every suggestion requires explicit user approval before logging.
    """
    return _builder_context(constitution)


def _day_plan_context(constitution: dict) -> dict:
    status, _ = _status_for_date(constitution, date.today())
    staples = engine.load_lidl_staples()
    recipes = engine.load_recipes()
    memory_entries = database.get_nutrition_memory()
    return engine.build_full_day_plan(status, staples, recipes, memory_entries=memory_entries)


@router.get("/day-plan")
def day_plan(
    constitution: dict = Depends(get_nutrition_constitution),
) -> dict:
    """Return an approval-first remaining-day nutrition plan.

    The plan is deterministic, local-first, and editable in the UI. It does not
    call an AI provider and does not log anything until explicit approval.
    """
    return _day_plan_context(constitution)


def _total_plan_items(raw_items: list[dict]) -> dict:
    return {
        "calories": round(sum(float(item["calories"]) for item in raw_items), 1),
        "protein_g": round(sum(float(item["protein_g"]) for item in raw_items), 1),
        "fat_g": round(sum(float(item["fat_g"]) for item in raw_items), 1),
        "carbs_g": round(sum(float(item["carbs_g"]) for item in raw_items), 1),
        "price_eur": round(sum(float(item.get("price_eur", 0.0)) for item in raw_items), 2),
    }



def _flatten_plan_meals(meals: list[dict]) -> list[dict]:
    items: list[dict] = []
    for meal in meals or []:
        items.extend(meal.get("items") or [])
    return items


@router.get("/shopping-list")
def nutrition_shopping_list(
    source: str = Query("day_plan", pattern="^(day_plan|meal_builder)$"),
    suggestion_id: str | None = Query(None),
    constitution: dict = Depends(get_nutrition_constitution),
) -> dict:
    """Return a pantry-aware shopping list from a Phoenix plan or meal suggestion.

    This route is local-first and approval-first: it never orders groceries or
    logs food. Pantry memory marks items as already owned.
    """
    memory_entries = database.get_nutrition_memory()
    if source == "meal_builder":
        context = _builder_context(constitution)
        suggestions = context.get("suggestions", [])
        if suggestion_id:
            suggestion = next((s for s in suggestions if s.get("id") == suggestion_id), None)
        else:
            suggestion = suggestions[0] if suggestions else None
        if suggestion is None:
            raise HTTPException(status_code=404, detail="Meal builder suggestion not found")
        return engine.build_shopping_list_from_items(
            suggestion.get("items", []),
            memory_entries=memory_entries,
            source="meal_builder",
            source_title=suggestion.get("title", "Phoenix meal builder"),
        )

    plan = _day_plan_context(constitution)
    return engine.build_shopping_list_from_items(
        _flatten_plan_meals(plan.get("meals", [])),
        memory_entries=memory_entries,
        source="day_plan",
        source_title="Phoenix full-day plan",
    )




def _weekly_plan_context(constitution: dict, start: date | None = None, days: int = 7) -> dict:
    start_date = start or date.today()
    staples = engine.load_lidl_staples()
    recipes = engine.load_recipes()
    memory_entries = database.get_nutrition_memory()
    return engine.build_weekly_meal_prep_plan(
        constitution,
        start_date=start_date,
        days=days,
        staples=staples,
        recipes=recipes,
        memory_entries=memory_entries,
    )


@router.get("/weekly-plan")
def weekly_plan(
    start_date: date | None = Query(None),
    days: int = Query(7, ge=3, le=7),
    constitution: dict = Depends(get_nutrition_constitution),
) -> dict:
    """Return an approval-first 3-7 day meal prep plan.

    This is local-first weekly planning: Phoenix plans meals, grocery needs,
    pantry-aware shopping, and batch prep blocks. It does not log food or buy
    groceries until the user explicitly approves a later action.
    """
    return _weekly_plan_context(constitution, start=start_date, days=days)


@router.post("/log/weekly-plan")
def log_weekly_plan(
    request: LogWeeklyPlanRequest,
    constitution: dict = Depends(get_nutrition_constitution),
) -> dict:
    request_day_count = len(request.days) if request.days is not None else 7
    request_start = request.days[0].date if request.days else None
    context = _weekly_plan_context(constitution, start=request_start, days=request_day_count)
    if request.plan_id != context.get("plan_id"):
        raise HTTPException(status_code=404, detail="Weekly meal prep plan not found")

    raw_days = [day.model_dump() for day in request.days] if request.days is not None else context.get("days", [])
    if not raw_days:
        raise HTTPException(status_code=400, detail="Weekly plan must contain at least one day")

    logged_days = []
    for day in raw_days:
        day_date = day.get("date")
        if isinstance(day_date, str):
            log_date = date.fromisoformat(day_date)
        else:
            log_date = day_date
        raw_meals = day.get("meals") or []
        if not raw_meals:
            continue
        logged_meals = []
        for meal in raw_meals:
            raw_items = meal.get("items") or []
            if not raw_items:
                raise HTTPException(status_code=400, detail="Each weekly-plan meal must contain at least one item")
            total = _total_plan_items(raw_items)
            if total["calories"] <= 0:
                raise HTTPException(status_code=400, detail="Each weekly-plan meal must have calories greater than zero")
            slot = str(meal.get("slot", "next_meal")).strip().lower().replace(" ", "_")[:30] or "next_meal"
            title = str(meal.get("title", "Phoenix weekly meal")).strip()[:120] or "Phoenix weekly meal"
            meal_id = database.log_meal(
                log_date=log_date,
                item_id=f"weekly-plan-{log_date.isoformat()}-{meal.get('meal_id', slot)}",
                item_type="weekly_planned_meal",
                name=f"Phoenix Weekly {slot.replace('_', ' ').title()}: {title}",
                servings=1,
                calories=total["calories"],
                protein_g=total["protein_g"],
                fat_g=total["fat_g"],
                carbs_g=total["carbs_g"],
                source=f"phoenix_weekly_meal_prep:{slot}",
            )
            logged_meals.append({
                "meal_id": meal_id,
                "slot": slot,
                "title": title,
                "items": raw_items,
                "total": total,
            })
        logged_days.append({
            "date": log_date.isoformat(),
            "meal_count": len(logged_meals),
            "meals": logged_meals,
            "total": {
                "calories": round(sum(meal["total"]["calories"] for meal in logged_meals), 1),
                "protein_g": round(sum(meal["total"]["protein_g"] for meal in logged_meals), 1),
                "fat_g": round(sum(meal["total"]["fat_g"] for meal in logged_meals), 1),
                "carbs_g": round(sum(meal["total"]["carbs_g"] for meal in logged_meals), 1),
                "price_eur": round(sum(meal["total"].get("price_eur", 0.0) for meal in logged_meals), 2),
            },
        })

    logged_meals_flat = [meal for day in logged_days for meal in day["meals"]]
    return {
        "status": "logged",
        "plan_id": request.plan_id,
        "day_count": len(logged_days),
        "meal_count": len(logged_meals_flat),
        "days": logged_days,
        "total": {
            "calories": round(sum(meal["total"]["calories"] for meal in logged_meals_flat), 1),
            "protein_g": round(sum(meal["total"]["protein_g"] for meal in logged_meals_flat), 1),
            "fat_g": round(sum(meal["total"]["fat_g"] for meal in logged_meals_flat), 1),
            "carbs_g": round(sum(meal["total"]["carbs_g"] for meal in logged_meals_flat), 1),
            "price_eur": round(sum(meal["total"].get("price_eur", 0.0) for meal in logged_meals_flat), 2),
        },
        "requires_approval": True,
    }


@router.post("/log/day-plan")
def log_day_plan(
    request: LogDayPlanRequest,
    constitution: dict = Depends(get_nutrition_constitution),
) -> dict:
    context = _day_plan_context(constitution)
    if request.plan_id != context.get("plan_id"):
        raise HTTPException(status_code=404, detail="Day plan not found")

    context_meals = context.get("meals", [])
    raw_meals = [meal.model_dump() for meal in request.meals] if request.meals is not None else context_meals
    if not raw_meals:
        raise HTTPException(status_code=400, detail="Day plan must contain at least one meal")

    log_date = request.log_date or date.today()
    logged_meals = []
    for meal in raw_meals:
        raw_items = meal.get("items") or []
        if not raw_items:
            raise HTTPException(status_code=400, detail="Each day-plan meal must contain at least one item")
        total = _total_plan_items(raw_items)
        if total["calories"] <= 0:
            raise HTTPException(status_code=400, detail="Each day-plan meal must have calories greater than zero")
        slot = str(meal.get("slot", "next_meal")).strip().lower().replace(" ", "_")[:30] or "next_meal"
        title = str(meal.get("title", "Phoenix planned meal")).strip()[:120] or "Phoenix planned meal"
        meal_id = database.log_meal(
            log_date=log_date,
            item_id=f"day-plan-{meal.get('meal_id', slot)}",
            item_type="planned_meal",
            name=f"Phoenix Plan {slot.replace('_', ' ').title()}: {title}",
            servings=1,
            calories=total["calories"],
            protein_g=total["protein_g"],
            fat_g=total["fat_g"],
            carbs_g=total["carbs_g"],
            source=f"phoenix_full_day_planner:{slot}",
        )
        logged_meals.append({
            "meal_id": meal_id,
            "slot": slot,
            "title": title,
            "items": raw_items,
            "total": total,
        })

    plan_total = {
        "calories": round(sum(meal["total"]["calories"] for meal in logged_meals), 1),
        "protein_g": round(sum(meal["total"]["protein_g"] for meal in logged_meals), 1),
        "fat_g": round(sum(meal["total"]["fat_g"] for meal in logged_meals), 1),
        "carbs_g": round(sum(meal["total"]["carbs_g"] for meal in logged_meals), 1),
        "price_eur": round(sum(meal["total"].get("price_eur", 0.0) for meal in logged_meals), 2),
    }
    return {
        "status": "logged",
        "plan_id": request.plan_id,
        "log_date": log_date.isoformat(),
        "meal_count": len(logged_meals),
        "meals": logged_meals,
        "total": plan_total,
        "requires_approval": True,
    }


@router.post("/log/built-meal")
def log_built_meal(
    request: LogBuiltMealRequest,
    constitution: dict = Depends(get_nutrition_constitution),
) -> dict:
    context = _builder_context(constitution)
    suggestion = next(
        (s for s in context.get("suggestions", []) if s["id"] == request.suggestion_id),
        None,
    )
    if suggestion is None:
        raise HTTPException(status_code=404, detail="Meal builder suggestion not found")
    if not suggestion.get("loggable", False):
        raise HTTPException(status_code=400, detail="Meal builder suggestion is not loggable")

    raw_items = [item.model_dump() for item in request.items] if request.items is not None else suggestion["items"]
    if not raw_items:
        raise HTTPException(status_code=400, detail="Built meal must contain at least one item")

    total = {
        "calories": round(sum(float(item["calories"]) for item in raw_items), 1),
        "protein_g": round(sum(float(item["protein_g"]) for item in raw_items), 1),
        "fat_g": round(sum(float(item["fat_g"]) for item in raw_items), 1),
        "carbs_g": round(sum(float(item["carbs_g"]) for item in raw_items), 1),
        "price_eur": round(sum(float(item.get("price_eur", 0.0)) for item in raw_items), 2),
    }
    if total["calories"] <= 0:
        raise HTTPException(status_code=400, detail="Built meal calories must be greater than zero")

    allowed_slots = {"breakfast", "lunch", "dinner", "snack", "post_training", "next_meal"}
    meal_slot = request.meal_slot.strip().lower().replace(" ", "_")
    if meal_slot not in allowed_slots:
        meal_slot = "next_meal"

    edited = bool(request.items)
    title = (request.title or suggestion["title"]).strip() or suggestion["title"]
    log_date = request.log_date or date.today()
    meal_id = database.log_meal(
        log_date=log_date,
        item_id=f"builder-{suggestion['id']}",
        item_type="built_meal",
        name=f"Phoenix {meal_slot.replace('_', ' ').title()}: {title}",
        servings=1,
        calories=total["calories"],
        protein_g=total["protein_g"],
        fat_g=total["fat_g"],
        carbs_g=total["carbs_g"],
        source=f"phoenix_autonomous_builder:{meal_slot}:{'edited' if edited else 'original'}",
    )
    return {
        "status": "logged",
        "meal_id": meal_id,
        "log_date": log_date.isoformat(),
        "suggestion_id": suggestion["id"],
        "meal_slot": meal_slot,
        "edited": edited,
        "name": f"Phoenix {meal_slot.replace('_', ' ').title()}: {title}",
        "items": raw_items,
        "total": total,
        "requires_approval": True,
    }


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
        result = ai_gateway.generate_text(
            system_prompt=_NUTRITION_BRIEF_SYSTEM,
            messages=[{"role": "user", "content": user_message}],
            max_tokens=256,
        )
        brief_text = result.text if result.ok else (
            "AI nutrition brief unavailable. Raw nutrition status available via /nutrition/status."
        )
    except Exception:
        brief_text = (
            "Unable to generate brief. "
            "Raw nutrition status available via /nutrition/status."
        )

    return {"brief": brief_text, "requires_approval": True}
