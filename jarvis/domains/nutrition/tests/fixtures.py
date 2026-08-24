import json
from datetime import date, timedelta
from pathlib import Path

# Phase dates are derived from the constitution rather than written as literal
# calendar dates: the programme is restarted periodically and every phase
# shifts, which silently detaches hardcoded fixtures from the phase they name.
with open(Path(__file__).parent.parent / "constitution.json") as _f:
    _PHASES = json.load(_f)["phases"]

_CUT_START = date.fromisoformat(_PHASES["cut"]["start_date"])
_PEAK_START = date.fromisoformat(_PHASES["peak"]["start_date"])

# Phases open on a Monday; training days are Monday, Wednesday and Saturday.
CUT_TRAINING_DATE = _CUT_START                      # Monday — a training day
CUT_REST_DATE = _CUT_START + timedelta(days=4)      # Friday — a rest day
PEAK_DATE = _PEAK_START + timedelta(days=3)         # Thursday in peak week

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
