from datetime import date

CUT_TRAINING_DATE = date(2026, 6, 22)  # Monday
CUT_REST_DATE = date(2026, 6, 26)      # Friday
PEAK_DATE = date(2026, 8, 20)          # Thursday in peak week

SAMPLE_LOG_ITEMS = [
    {
        "item_id": "recipe_012",
        "item_type": "recipe",
        "name": "Egg White Bites",
        "servings": 1.0,
        "calories": 410,
        "protein_g": 72,
        "fat_g": 1,
        "carbs_g": 23,
    }
]

EMPTY_LOG_ITEMS = []
