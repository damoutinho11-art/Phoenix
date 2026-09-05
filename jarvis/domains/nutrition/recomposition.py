"""Deterministic, approval-first exact-gram recomposition protocols."""

from copy import deepcopy
from datetime import date
import hashlib
import json


CALORIE_TOLERANCE = 50.0
PROTEIN_TOLERANCE_G = 5.0

_MACROS = ("calories", "protein_g", "carbs_g", "fat_g", "fibre_g")
_MEAL_LAYOUT = (
    ("breakfast", "Breakfast", "09:00"),
    ("rehearsal_break", "Rehearsal break", "12:30"),
    ("pre_training", "Pre-training", "16:30"),
    ("dinner", "Dinner", "20:30"),
)


def _round(value: float) -> float:
    return round(float(value), 1)


def exact_component(food: dict, quantity_g: float, measurement_state: str) -> dict:
    """Resolve an exact measured quantity from a food's reference-label values."""
    reference_g = float(food["reference_g"])
    quantity_g = float(quantity_g)
    factor = quantity_g / reference_g
    label_source = food.get("label_source") or "generic_estimate"
    is_estimate = bool(food.get("is_estimate", not bool(food.get("label_source"))))
    component = {
        "item_id": food.get("id", food.get("item_id")),
        "name": food["name"],
        "quantity_g": _round(quantity_g),
        "measurement_state": measurement_state,
        "label_source": label_source,
        "is_estimate": is_estimate,
        "label_state": food.get("label_state", "reference_estimate" if is_estimate else "product_label"),
        "source_url": food.get("source_url"),
        "fibre_source_url": food.get("fibre_source_url"),
        "fibre_known": food.get("fibre_known", food.get("fibre_g", food.get("fiber_g")) is not None),
        "calories": _round(float(food["calories"]) * factor),
        "protein_g": _round(float(food["protein_g"]) * factor),
        "carbs_g": _round(float(food["carbs_g"]) * factor),
        "fat_g": _round(float(food["fat_g"]) * factor),
        "fibre_g": _round(float(food.get("fibre_g", food.get("fiber_g", 0))) * factor),
    }
    unit_weight_g = food.get("unit_weight_g")
    if unit_weight_g:
        component["unit_count"] = _round(quantity_g / float(unit_weight_g))
    return component


def protocol_identity(
    target_date: date,
    target: dict,
    logged_meals: list[dict],
    behavior_inputs: dict | None = None,
) -> str:
    """Return the stable identity for all inputs that change a protocol proposal."""
    canonical = json.dumps(
        {
            "date": target_date.isoformat(),
            "target": target,
            "logged": logged_meals,
            "behavior_inputs": behavior_inputs or {},
        },
        sort_keys=True,
        separators=(",", ":"),
        default=str,
    )
    return hashlib.sha256(canonical.encode("utf-8")).hexdigest()[:20]


def _macro_dict(source) -> dict:
    if source is None:
        source = {}
    values = source if isinstance(source, dict) else vars(source)
    def value(*keys):
        for key in keys:
            if values.get(key) is not None:
                return values[key]
        return 0
    return {
        "calories": _round(value("calories", "total_calories")),
        "protein_g": _round(value("protein_g", "total_protein_g")),
        "carbs_g": _round(value("carbs_g", "total_carbs_g")),
        "fat_g": _round(value("fat_g", "total_fat_g")),
        "fibre_g": _round(value("fibre_g", "fiber_g", "total_fibre_g")),
    }


def _sum_rows(rows: list[dict]) -> dict:
    total = {key: 0.0 for key in _MACROS}
    for row in rows:
        source = row.get("total", row) if isinstance(row, dict) else row
        if isinstance(source, dict) and not any(key in source for key in _MACROS) and source.get("items"):
            source = _sum_rows(source["items"])
        macros = _macro_dict(source)
        for key in _MACROS:
            total[key] += macros[key]
    return {key: _round(value) for key, value in total.items()}


def _target_from_status(status) -> dict:
    return _macro_dict(status["target"] if isinstance(status, dict) else status.target)


def _remaining_target(target: dict, logged: dict) -> dict:
    return {key: _round(target[key] - logged[key]) for key in _MACROS}


def _active_phase(constitution: dict) -> dict:
    return constitution.get("phases", {}).get(constitution.get("active_phase"), {})


def _preferences(constitution: dict) -> dict:
    return {
        **constitution.get("preferences", {}),
        **constitution.get("food_preferences", {}),
        **_active_phase(constitution).get("preferences", {}),
    }


def _measurement_rules(constitution: dict) -> dict:
    return {
        **constitution.get("measurement_rules", {}),
        **_active_phase(constitution).get("measurement_rules", {}),
    }


def _fibre_minimum(constitution: dict) -> float:
    source = _active_phase(constitution).get("fibre_target_g", constitution.get("fibre_target_g", 0))
    if isinstance(source, dict):
        return float(source.get("minimum", source.get("target", 0)))
    if isinstance(source, (list, tuple)):
        return float(source[0]) if source else 0.0
    return float(source or 0)


def _avoid_terms(memory_entries: list[dict], constitution: dict) -> set[str]:
    preferences = _preferences(constitution)
    terms = {str(value).lower() for value in preferences.get("avoid", [])}
    for entry in memory_entries or []:
        if str(entry.get("kind", "")).lower() == "dislike":
            if entry.get("name"):
                terms.add(str(entry["name"]).lower())
            if entry.get("item_id"):
                terms.add(str(entry["item_id"]).lower())
    terms.add("potato")
    return terms


def _allowed_foods(foods: list[dict], avoid_terms: set[str]) -> list[dict]:
    allowed = []
    for food in foods:
        searchable = f"{food.get('id', '')} {food.get('item_id', '')} {food.get('name', '')}".lower()
        if any(term and term in searchable for term in avoid_terms):
            continue
        allowed.append(food)
    return allowed


def _select_food(foods: list[dict], *terms: str) -> dict:
    matches = [
        food for food in foods
        if any(term in food.get("name", "").lower() for term in terms)
    ]
    candidates = matches or foods
    if not candidates:
        raise ValueError("No allowed foods available for recomposition protocol")
    return sorted(
        candidates,
        key=lambda food: (not bool(food.get("label_source")), food.get("name", "").lower(), str(food.get("id", ""))),
    )[0]


def measurement_state_for_food(food: dict, constitution: dict) -> str:
    if food.get("measurement_state") in {"raw", "cooked", "dry", "frozen", "as_served", "unknown"}:
        return food["measurement_state"]
    rules = _measurement_rules(constitution)
    name = food.get("name", "").lower()
    if "pasta" in name:
        return rules.get("pasta", "dry")
    if "frozen" in name:
        return rules.get("frozen_vegetables", "frozen")
    if any(term in name for term in ("chicken", "turkey", "beef", "meat", "fish", "salmon", "cod")):
        return "cooked" if "cooked" in name else "raw"
    return "as_served"


def validate_planning_substances(substances: list[str], constitution: dict) -> list[str]:
    """Reject constitution-blocked substances before they can enter a plan."""
    peptide_policy = constitution.get("supplements", {}).get("research_peptides", {})
    blocked = {
        str(name).casefold()
        for name, policy in peptide_policy.items()
        if policy.get("status") == "blocked"
    }
    requested = [str(substance) for substance in substances or []]
    rejected = [substance for substance in requested if substance.casefold() in blocked]
    if rejected:
        raise ValueError(f"Blocked planning substance: {', '.join(rejected)}")
    return requested


_measurement_state = measurement_state_for_food


def _meal(meal_id: str, slot: str, title: str, timing: str, portable: bool, items: list[dict]) -> dict:
    return {
        "meal_id": meal_id,
        "slot": slot,
        "title": title,
        "timing": timing,
        "portable": portable,
        "source": "proposal",
        "items": items,
        "total": _sum_rows(items),
        "requires_approval": True,
    }


def _rehearsal_timing(calendar_blocks: list[dict]) -> tuple[str, bool]:
    for block in calendar_blocks or []:
        if "rehearsal" not in str(block.get("kind", "")).lower():
            continue
        start = str(block.get("start", ""))
        end = str(block.get("end", ""))
        breaks = [str(value) for value in block.get("breaks", [])]
        if "12:00" in breaks and start <= "12:00" <= end:
            return "12:00", True
    return "12:30", False


def _build_four_slots(*, target_date: date, remaining_target: dict, foods: list[dict], memory_entries: list[dict], calendar_blocks: list[dict], constitution: dict) -> list[dict]:
    del target_date
    allowed = _allowed_foods(foods, _avoid_terms(memory_entries, constitution))
    cookie = _select_food(allowed, "cookie crisp")
    yogurt = _select_food(allowed, "yogurt", "skyr", "quark")
    whey = _select_food(allowed, "whey")
    wrap = _select_food(allowed, "wrap")
    banana = _select_food(allowed, "banana")
    meat = _select_food(allowed, "chicken", "turkey", "beef", "meat")
    pasta = _select_food(allowed, "pasta")
    vegetables = _select_food(allowed, "frozen vegetable", "vegetable", "broccoli")
    oil = _select_food(allowed, "olive oil", "oil")
    scale = max(0.1, remaining_target["calories"] / 2600.0)

    def component(food: dict, grams: float) -> dict:
        return exact_component(food, max(0.1, _round(grams * scale)), _measurement_state(food, constitution))

    rehearsal_timing, portable = _rehearsal_timing(calendar_blocks)
    return [
        _meal("breakfast", "breakfast", "Breakfast", "09:00", False, [component(cookie, 85), component(yogurt, 250), component(whey, 30)]),
        _meal("rehearsal_break", "rehearsal_break", "Rehearsal break", rehearsal_timing, portable, [component(wrap, 124), component(banana, 120), component(yogurt, 100)]),
        _meal("pre_training", "pre_training", "Pre-training", "16:30", False, [component(pasta, 120), component(meat, 150), component(vegetables, 200), component(oil, 10)]),
        _meal("dinner", "dinner", "Dinner", "20:30", False, [component(pasta, 60), component(meat, 50), component(vegetables, 200), component(oil, 32)]),
    ]


def _gap(target: dict, logged_total: dict, planned_total: dict) -> dict:
    return {key: _round(target[key] - logged_total[key] - planned_total[key]) for key in _MACROS}


def _hydrate_protocol(protocol: dict) -> dict:
    protocol["planned_total"] = _sum_rows([meal["total"] for meal in protocol["meals"]])
    logged_total = _sum_rows(protocol["logged_meals"])
    protocol["remaining_target"] = _remaining_target(protocol["target"], logged_total)
    protocol["target_gap"] = _gap(protocol["target"], logged_total, protocol["planned_total"])

    def nutrition_rows(rows):
        leaves = []
        for row in rows:
            if isinstance(row, dict) and row.get("items"):
                leaves.extend(nutrition_rows(row["items"]))
            else:
                leaves.append(row)
        return leaves

    nutrition = nutrition_rows([*protocol["meals"], *protocol["logged_meals"]])
    fibre_known = [
        bool(row.get("fibre_known", row.get("fibre_g", row.get("fiber_g")) is not None))
        for row in nutrition if isinstance(row, dict)
    ]
    known_fibre_total = _round(sum(
        _macro_dict(row)["fibre_g"]
        for row, known in zip(nutrition, fibre_known)
        if isinstance(row, dict) and known
    ))
    protocol["fibre_complete"] = bool(fibre_known) and all(fibre_known)
    protocol["fibre_known_lower_bound_g"] = known_fibre_total
    protocol["nutrition_basis"] = "labelled" if nutrition and all(
        row.get("is_estimate") is False for row in nutrition if isinstance(row, dict)
    ) else "estimated"
    protocol["target_matched"] = (
        0 <= protocol["target_gap"]["calories"] <= 100
        and abs(protocol["target_gap"]["protein_g"]) <= PROTEIN_TOLERANCE_G
        and abs(protocol["target_gap"]["carbs_g"]) <= 10
        and abs(protocol["target_gap"]["fat_g"]) <= 5
        and known_fibre_total >= float(protocol.get("food_constraints", {}).get("fibre_minimum_g", 0))
    )
    protocol["requires_approval"] = True
    return protocol


def build_today_protocol(*, target_date, status, foods, memory_entries, calendar_blocks, constitution, logged_meals) -> dict:
    """Build four exact-gram proposals without changing any logged facts."""
    target = _target_from_status(status)
    immutable_logged_meals = deepcopy(logged_meals or [])
    logged_total = _sum_rows(immutable_logged_meals)
    remaining_target = _remaining_target(target, logged_total)
    avoided_terms = _avoid_terms(memory_entries, constitution)
    allowed_foods = _allowed_foods(foods, avoided_terms)
    base_protocol_id = protocol_identity(
        target_date,
        target,
        immutable_logged_meals,
        {
            "calendar_blocks": calendar_blocks or [],
            "memory_entries": memory_entries or [],
            "constitution": constitution or {},
            "foods": foods or [],
        },
    )
    logged_slot_ids = {
        str(row.get("source", "")).rsplit(":", 1)[-1]
        for row in immutable_logged_meals
        if str(row.get("source", "")).startswith("today_protocol:")
    }
    meals = _build_four_slots(
        target_date=target_date,
        remaining_target=remaining_target,
        foods=foods,
        memory_entries=memory_entries,
        calendar_blocks=calendar_blocks,
        constitution=constitution,
    )
    protocol = {
        "mode": "recomposition_today_protocol",
        "protocol_id": base_protocol_id,
        "base_protocol_id": base_protocol_id,
        "target": target,
        "remaining_target": remaining_target,
        "logged_meals": immutable_logged_meals,
        "food_constraints": {
            "avoided_terms": sorted(avoided_terms),
            "allowed_food_ids": [food.get("id", food.get("item_id")) for food in allowed_foods],
            "fibre_minimum_g": _fibre_minimum(constitution),
            "measurement_rules": _measurement_rules(constitution),
        },
        "meals": [meal for meal in meals if meal["meal_id"] not in logged_slot_ids],
        "requires_approval": True,
    }
    return _rebalance_unlogged_meals(protocol, foods)


def _find_food(foods: list[dict], item_id: str) -> dict:
    for food in foods:
        if food.get("id", food.get("item_id")) == item_id:
            return food
    raise ValueError("Unknown protocol food")


def _refresh_meal_total(meal: dict) -> None:
    meal["total"] = _sum_rows(meal["items"])
    meal["source"] = "proposal"
    meal["requires_approval"] = True


def _nearest_replacement(meal: dict, foods: list[dict], measurement_rules: dict) -> dict:
    target = _macro_dict(meal["total"])
    original_ids = {item["item_id"] for item in meal["items"]}
    candidates = [food for food in foods if food.get("id", food.get("item_id")) not in original_ids] or foods
    if not candidates:
        raise ValueError("No allowed foods available for replacement")

    def score(food: dict) -> tuple:
        factor = target["calories"] / max(1.0, float(food["calories"]))
        projected = {
            key: float(food.get(key, food.get("fiber_g", 0) if key == "fibre_g" else 0)) * factor
            for key in ("protein_g", "carbs_g", "fat_g", "fibre_g")
        }
        distance = sum((projected[key] - target[key]) ** 2 for key in projected)
        return (distance, not bool(food.get("label_source")), food.get("name", "").lower())

    selected = min(candidates, key=score)
    quantity_g = target["calories"] / max(1.0, float(selected["calories"])) * float(selected["reference_g"])
    return exact_component(
        selected,
        max(0.1, quantity_g),
        measurement_state_for_food(selected, {"measurement_rules": measurement_rules}),
    )


def _allowed_protocol_foods(protocol: dict, foods: list[dict]) -> list[dict]:
    constraints = protocol.get("food_constraints", {})
    allowed_ids = set(constraints.get("allowed_food_ids", []))
    allowed = _allowed_foods(foods, set(constraints.get("avoided_terms", ["potato"])))
    if allowed_ids:
        allowed = [food for food in allowed if food.get("id", food.get("item_id")) in allowed_ids]
    return allowed


def _food_role(food: dict) -> int:
    name = food.get("name", "").lower()
    if any(term in name for term in ("chicken", "turkey", "beef", "meat", "whey", "yogurt", "skyr", "quark")):
        return 0
    if any(term in name for term in ("pasta", "wrap", "rice", "banana", "cookie", "oat")):
        return 1
    if any(term in name for term in ("oil", "almond", "walnut", "avocado")):
        return 2
    return 3


def _balance_score(gap: dict, fibre_deficit: float = 0.0) -> float:
    return (
        abs(gap["protein_g"]) / PROTEIN_TOLERANCE_G
        + abs(gap["calories"]) / CALORIE_TOLERANCE
        + abs(gap["carbs_g"]) / 80.0
        + abs(gap["fat_g"]) / 25.0
        + fibre_deficit / 2.0
    )


def _balance_stage(gap: dict, fibre_deficit: float = 0.0) -> int:
    """Return the active deterministic macro stage."""
    if abs(gap["protein_g"]) > PROTEIN_TOLERANCE_G:
        return 0
    if abs(gap["carbs_g"]) > 10:
        return 1
    if abs(gap["fat_g"]) > 5:
        return 2
    if fibre_deficit > 0:
        return 3
    return 1 if abs(gap["calories"]) > CALORIE_TOLERANCE else 3


def _rebalance_unlogged_meals(protocol: dict, foods: list[dict], protected: set[tuple[str, str]] | None = None) -> dict:
    """Reconcile proposal-only components against all macro constraints."""
    if not protocol["meals"]:
        return _hydrate_protocol(protocol)
    protected = protected or set()
    allowed = _allowed_protocol_foods(protocol, foods)
    by_id = {food.get("id", food.get("item_id")): food for food in allowed}
    if not by_id:
        raise ValueError("No allowed foods available for recomposition protocol")

    from itertools import combinations

    adjustable = []
    for meal_index, meal in enumerate(protocol["meals"]):
        for item_index, item in enumerate(meal["items"]):
            item_id = item["item_id"]
            if (meal["meal_id"], item_id) not in protected and item_id in by_id:
                adjustable.append((meal_index, item_index, item, by_id[item_id]))

    logged_total = _sum_rows(protocol["logged_meals"])
    fibre_minimum = float(protocol.get("food_constraints", {}).get("fibre_minimum_g", 0))
    keys = ("calories", "protein_g", "carbs_g", "fat_g")

    def solve(matrix, values):
        size = len(values)
        rows = [list(map(float, matrix[index])) + [float(values[index])] for index in range(size)]
        for column in range(size):
            pivot = max(range(column, size), key=lambda row: abs(rows[row][column]))
            if abs(rows[pivot][column]) < 1e-9:
                return None
            rows[column], rows[pivot] = rows[pivot], rows[column]
            divisor = rows[column][column]
            rows[column] = [value / divisor for value in rows[column]]
            for row in range(size):
                if row == column:
                    continue
                factor = rows[row][column]
                rows[row] = [rows[row][index] - factor * rows[column][index] for index in range(size + 1)]
        return [rows[index][-1] for index in range(size)]

    remaining_calories = max(0.0, float(protocol["target"]["calories"]) - logged_total["calories"])
    enforce_meal_bounds = len(protocol["meals"]) == 4 and not protected and not protocol["logged_meals"]

    def rank(total, meal_totals=None):
        gap = {key: protocol["target"][key] - total[key] for key in keys}
        fibre_deficit = max(0.0, fibre_minimum - total["fibre_g"])
        violations = [
            max(0.0, -gap["calories"]) / 10 + max(0.0, gap["calories"] - CALORIE_TOLERANCE) / 10,
            max(0.0, abs(gap["protein_g"]) - 5),
            max(0.0, abs(gap["carbs_g"]) - 10) / 2,
            max(0.0, abs(gap["fat_g"]) - 5) * 2,
            fibre_deficit,
        ]
        if enforce_meal_bounds and meal_totals is not None:
            lower = remaining_calories * 0.15
            for meal, meal_total in zip(protocol["meals"], meal_totals):
                upper_share = 0.30 if meal.get("slot") == "pre_training" else 0.35
                calories = meal_total["calories"]
                violations.append((max(0.0, lower - calories) + max(0.0, calories - remaining_calories * upper_share)) / 10)
        distance = abs(gap["calories"]) / 100 + abs(gap["protein_g"]) / 5 + abs(gap["carbs_g"]) / 10 + abs(gap["fat_g"]) / 5
        return (
            sum(value > 1e-8 for value in violations),
            round(max(violations), 8),
            round(sum(violations), 8),
            round(distance, 8),
        )

    current_meal_totals = [meal["total"] for meal in protocol["meals"]]
    current_total = _sum_rows([logged_total, *current_meal_totals])
    best = (rank(current_total, current_meal_totals), None)
    floor_replacements = {
        (meal_index, item_index): exact_component(food, 0.1, item["measurement_state"])
        for meal_index, item_index, item, food in adjustable
    }
    baseline_rows = [logged_total, *floor_replacements.values()]
    baseline_meal_rows = [[] for _ in protocol["meals"]]
    for (meal_index, _), replacement in floor_replacements.items():
        baseline_meal_rows[meal_index].append(replacement)
    for meal in protocol["meals"]:
        for item in meal["items"]:
            if not any(item is row[2] for row in adjustable):
                baseline_rows.append(item)
                baseline_meal_rows[protocol["meals"].index(meal)].append(item)
    baseline = _sum_rows(baseline_rows)
    baseline_meals = [_sum_rows(rows) for rows in baseline_meal_rows]
    # Four independent nutrition vectors can solve the four macro equations.
    # Smaller subsets are also considered so sparse inventories degrade honestly.
    maximum_foods = 5 if enforce_meal_bounds else 4
    selections = [
        selected
        for count in range(1, min(maximum_foods, len(adjustable)) + 1)
        for selected in combinations(range(len(adjustable)), count)
    ]
    for selected_indexes in selections:
            count = len(selected_indexes)
            columns = []
            for index in selected_indexes:
                meal_index, _, _, food = adjustable[index]
                reference = float(food["reference_g"])
                column = [
                    float(food[key]) / reference / scale
                    for key, scale in zip(keys, (100.0, 5.0, 10.0, 5.0))
                ]
                if enforce_meal_bounds:
                    calories_per_g = float(food["calories"]) / reference / 100.0
                    column.extend(calories_per_g if index == meal_index else 0.0 for index in range(4))
                columns.append(column)
            residual = [
                (float(protocol["target"][key]) - (10.0 if key == "calories" and enforce_meal_bounds else 0.0) - baseline[key]) / scale
                for key, scale in zip(keys, (100.0, 5.0, 10.0, 5.0))
            ]
            if enforce_meal_bounds:
                residual.extend((remaining_calories * 0.25 - meal["calories"]) / 100.0 for meal in baseline_meals)
                residual.append((fibre_minimum - baseline["fibre_g"]) / 5.0)
                for column, index in zip(columns, selected_indexes):
                    food = adjustable[index][3]
                    column.append(float(food.get("fibre_g", food.get("fiber_g", 0))) / float(food["reference_g"]) / 5.0)
            feature_count = len(residual)
            normal = [[sum(columns[c][k] * columns[d][k] for k in range(feature_count)) for d in range(count)] for c in range(count)]
            rhs = [sum(columns[c][k] * residual[k] for k in range(feature_count)) for c in range(count)]
            quantities = solve(normal, rhs)
            if quantities is None or any(quantity < 0 for quantity in quantities):
                continue
            replacements = dict(floor_replacements)
            for position, index in enumerate(selected_indexes):
                meal_index, item_index, item, food = adjustable[index]
                replacements[(meal_index, item_index)] = exact_component(food, quantities[position] + 0.1, item["measurement_state"])
            rows = [logged_total]
            meal_totals = []
            for meal_index, meal in enumerate(protocol["meals"]):
                meal_rows = [replacements.get((meal_index, item_index), item) for item_index, item in enumerate(meal["items"])]
                meal_totals.append(_sum_rows(meal_rows))
                rows.extend(meal_rows)
            total = _sum_rows(rows)
            candidate = (rank(total, meal_totals), replacements)
            if candidate[0] < best[0]:
                best = candidate
                if candidate[0][0] == 0:
                    for (meal_index, item_index), replacement in replacements.items():
                        protocol["meals"][meal_index]["items"][item_index] = replacement
                    for meal in protocol["meals"]:
                        _refresh_meal_total(meal)
                    return _hydrate_protocol(protocol)

    if best[1] is not None:
        for (meal_index, item_index), replacement in best[1].items():
            protocol["meals"][meal_index]["items"][item_index] = replacement
        for meal in protocol["meals"]:
            _refresh_meal_total(meal)
    return _hydrate_protocol(protocol)


def replan_protocol(protocol: dict, action: dict, foods: list[dict]) -> dict:
    """Apply one explicit proposal change and rebalance no logged food."""
    result = deepcopy(protocol)
    meal_id = action.get("meal_id")
    meal_ids = {meal["meal_id"] for meal in result.get("meals", [])}
    if meal_id not in meal_ids:
        raise ValueError("Unknown protocol meal")
    operation = action.get("type", action.get("action"))
    protected: set[tuple[str, str]] = set()
    if operation not in {"skip", "adjust_portion", "replace"}:
        raise ValueError("Unsupported replan action")
    if operation == "skip":
        result["meals"] = [meal for meal in result["meals"] if meal["meal_id"] != meal_id]
    else:
        meal = next(meal for meal in result["meals"] if meal["meal_id"] == meal_id)
        if operation == "adjust_portion":
            item_id = action.get("item_id") or meal["items"][0]["item_id"]
            item = next((item for item in meal["items"] if item["item_id"] == item_id), None)
            if item is None:
                raise ValueError("Unknown protocol food")
            quantity_g = float(action.get("quantity_g", 0))
            if quantity_g <= 0:
                raise ValueError("Portion quantity must be positive")
            food = _find_food(foods, item_id)
            if food not in _allowed_protocol_foods(result, foods):
                raise ValueError("Unknown protocol food")
            replacement = exact_component(food, quantity_g, item["measurement_state"])
            meal["items"][meal["items"].index(item)] = replacement
            _refresh_meal_total(meal)
            protected.add((meal_id, item_id))
        else:
            meal["items"] = [_nearest_replacement(
                meal,
                _allowed_protocol_foods(result, foods),
                result.get("food_constraints", {}).get("measurement_rules", {}),
            )]
            _refresh_meal_total(meal)
    result = _rebalance_unlogged_meals(result, foods, protected)
    canonical = json.dumps(
        {"base_protocol_id": result.get("base_protocol_id"), "meals": result.get("meals", [])},
        sort_keys=True, separators=(",", ":"), default=str,
    )
    result["protocol_id"] = hashlib.sha256(canonical.encode("utf-8")).hexdigest()[:20]
    return result


def _calibration(constitution: dict) -> dict:
    phase_name = constitution.get("active_phase")
    phases = constitution.get("phases", {})
    phase = phases.get(phase_name, {})
    return phase.get("calibration", constitution.get("calibration", {}))


def _row_value(row: dict, *keys: str):
    for key in keys:
        if row.get(key) is not None:
            return float(row[key])
    return None


def _rolling_weight_rate(rows: list[dict]) -> float:
    ordered = sorted(rows, key=lambda row: str(row.get("date", "")))
    first = _row_value(ordered[0], "weight_kg", "weight")
    last = _row_value(ordered[-1], "weight_kg", "weight")
    if first is None or last is None:
        return 0.0
    try:
        span_days = max(1, (date.fromisoformat(str(ordered[-1]["date"])[:10]) - date.fromisoformat(str(ordered[0]["date"])[:10])).days)
    except (KeyError, TypeError, ValueError):
        return 0.0
    return _round((last - first) / span_days * 7)


def _trend_declining(rows: list[dict]) -> bool:
    return any(
        str(row.get("trend", row.get("status", ""))).lower() in {"declining", "poor", "worse"}
        or float(row.get("delta", 0)) < 0
        for row in performance_rows_or_empty(rows)
    )


def performance_rows_or_empty(rows: list[dict] | None) -> list[dict]:
    return rows or []


def _hunger_elevated(rows: list[dict]) -> bool:
    return any(
        bool(row.get("high"))
        or str(row.get("status", "")).lower() in {"high", "severe"}
        or float(row.get("level", 0)) >= 4
        for row in rows or []
    )


def _waist_change(rows: list[dict]) -> float | None:
    values = [_row_value(row, "waist_cm", "value") for row in sorted(rows or [], key=lambda row: str(row.get("date", "")))]
    values = [value for value in values if value is not None]
    return _round(values[-1] - values[0]) if len(values) >= 2 else None


def evaluate_adjustment_evidence(*, daily_rows, waist_rows, performance_rows, hunger_rows, constitution) -> dict:
    """Evaluate read-only evidence and return an approval-required proposal only."""
    calibration = _calibration(constitution)
    minimum_complete_days = max(14, int(calibration.get("minimum_complete_days", 14)))
    complete = sorted(
        [row for row in daily_rows or [] if row.get("complete")],
        key=lambda row: str(row.get("date", "")),
    )
    if len(complete) < minimum_complete_days:
        return {
            "status": "insufficient_evidence",
            "eligible": False,
            "complete_days": len(complete),
            "minimum_complete_days": minimum_complete_days,
        }

    review_window = complete[-minimum_complete_days:]
    window_start = str(review_window[0].get("date", ""))[:10]
    window_end = str(review_window[-1].get("date", ""))[:10]
    in_window = lambda rows: [row for row in (rows or []) if window_start <= str(row.get("date", ""))[:10] <= window_end]
    waist_rows = in_window(waist_rows)
    performance_rows = in_window(performance_rows)
    hunger_rows = in_window(hunger_rows)
    missing_guardrails = []
    if len(waist_rows) < 2:
        missing_guardrails.append("waist")
    if not performance_rows:
        missing_guardrails.append("performance")
    if not hunger_rows:
        missing_guardrails.append("hunger")
    if missing_guardrails:
        return {
            "status": "insufficient_evidence",
            "eligible": False,
            "complete_days": len(complete),
            "minimum_complete_days": minimum_complete_days,
            "missing_guardrails": missing_guardrails,
        }

    rate = _rolling_weight_rate(review_window)
    desired_loss = calibration.get("desired_loss_kg_per_week", calibration.get("target_loss_kg_per_week", [0.2, 0.4]))
    high_loss = float(calibration.get("high_loss_guardrail_kg_per_week", calibration.get("high_loss_kg_per_week", 0.5)))
    adjustment_range = calibration.get("adjustment_kcal_range", calibration.get("adjustment_kcal", [100, 150]))
    kcal_step = int(adjustment_range[0])
    waist_change = _waist_change(waist_rows)
    performance_declining = _trend_declining(performance_rows)
    hunger_elevated = _hunger_elevated(hunger_rows)
    evidence = {
        "complete_days": len(complete),
        "rolling_weight_rate_kg_per_week": rate,
        "waist_change_cm": waist_change,
        "performance_declining": performance_declining,
        "hunger_elevated": hunger_elevated,
    }
    confidence = "high" if waist_change is not None else "medium"
    if rate <= -high_loss or performance_declining or hunger_elevated:
        direction, kcal_delta = "increase", kcal_step
    elif rate > -float(desired_loss[0]) and waist_change is not None and waist_change >= -0.25:
        direction, kcal_delta = "decrease", -kcal_step
    else:
        direction, kcal_delta = "maintain", 0
    return {
        "status": "proposal",
        "eligible": True,
        "direction": direction,
        "kcal_delta": kcal_delta,
        "evidence": evidence,
        "confidence": confidence,
        "requires_approval": True,
    }
