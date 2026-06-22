from dataclasses import dataclass
from datetime import date


@dataclass(frozen=True)
class MacroTarget:
    calories: int
    protein_g: int
    carbs_g: int
    fat_g: int


@dataclass(frozen=True)
class Recipe:
    id: str
    name: str
    category: str
    page: int
    serving: str
    calories: int
    protein_g: int
    fat_g: int
    carbs_g: int
    fiber_g: int


@dataclass(frozen=True)
class LidlStaple:
    id: str
    name: str
    unit: str
    price_eur: float
    calories: int
    protein_g: float
    fat_g: float
    carbs_g: float


@dataclass(frozen=True)
class LoggedItem:
    item_id: str
    item_type: str
    name: str
    servings: float
    calories: float
    protein_g: float
    fat_g: float
    carbs_g: float


@dataclass(frozen=True)
class DailyLog:
    date: date
    items: tuple
    total_calories: float
    total_protein_g: float
    total_fat_g: float
    total_carbs_g: float


@dataclass(frozen=True)
class NutritionStatus:
    as_of: date
    phase: str
    is_training_day: bool
    target: MacroTarget
    logged: DailyLog
    remaining_calories: float
    remaining_protein_g: float
    remaining_fat_g: float
    remaining_carbs_g: float
    protein_target_met: bool
    calorie_target_met: bool
    suggested_recipes: tuple
