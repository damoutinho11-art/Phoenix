from datetime import date, timedelta
from types import SimpleNamespace

import pytest

from jarvis.domains.nutrition.recomposition import (
    _balance_stage,
    build_today_protocol,
    evaluate_adjustment_evidence,
    exact_component,
    protocol_identity,
    replan_protocol,
    validate_planning_substances,
)


TARGET = {"calories": 2600, "protein_g": 175, "carbs_g": 315, "fat_g": 70}

FOODS = [
    {"id": "cookie", "name": "Cookie Crisp", "reference_g": 100, "calories": 390, "protein_g": 6, "carbs_g": 85, "fat_g": 5, "fibre_g": 3, "label_source": "Cookie Crisp label"},
    {"id": "yogurt", "name": "0% Greek Yogurt", "reference_g": 100, "calories": 57, "protein_g": 10, "carbs_g": 3.5, "fat_g": 0.2, "fibre_g": 0, "label_source": "Greek Yogurt label"},
    {"id": "whey", "name": "Whey Protein", "reference_g": 100, "calories": 400, "protein_g": 80, "carbs_g": 10, "fat_g": 5, "fibre_g": 0, "label_source": "Whey label"},
    {"id": "wrap", "name": "Wholewheat Wrap", "reference_g": 62, "calories": 190, "protein_g": 6, "carbs_g": 31, "fat_g": 4, "fibre_g": 4, "label_source": "Wrap label"},
    {"id": "banana", "name": "Banana", "reference_g": 120, "calories": 107, "protein_g": 1.3, "carbs_g": 27, "fat_g": 0.4, "fibre_g": 3.1},
    {"id": "chicken", "name": "Chicken Breast", "reference_g": 100, "calories": 165, "protein_g": 31, "carbs_g": 0, "fat_g": 3.6, "fibre_g": 0, "label_source": "Chicken label"},
    {"id": "pasta", "name": "Wholewheat Pasta", "reference_g": 100, "calories": 350, "protein_g": 13, "carbs_g": 68, "fat_g": 2.5, "fibre_g": 8, "label_source": "Pasta label"},
    {"id": "vegetables", "name": "Frozen Mixed Vegetables", "reference_g": 100, "calories": 35, "protein_g": 2.5, "carbs_g": 7, "fat_g": 0.5, "fibre_g": 3.5, "label_source": "Frozen vegetables label"},
    {"id": "oil", "name": "Extra Virgin Olive Oil", "reference_g": 100, "calories": 884, "protein_g": 0, "carbs_g": 0, "fat_g": 100, "fibre_g": 0, "label_source": "Olive oil label"},
    {"id": "potato", "name": "White Potatoes", "reference_g": 100, "calories": 77, "protein_g": 2, "carbs_g": 17, "fat_g": 0.1, "fibre_g": 2.2, "label_source": "Potato label"},
]

CONSTITUTION = {
    "phases": {"recomposition_cut": {"calibration": {"minimum_complete_days": 14, "desired_loss_kg_per_week": [0.2, 0.4], "high_loss_guardrail_kg_per_week": 0.5, "adjustment_kcal_range": [100, 150]}}},
    "active_phase": "recomposition_cut",
    "food_preferences": {"avoid": ["potato"], "prefer": ["cookie crisp", "wrap", "pasta", "meat", "frozen vegetables", "banana", "yogurt"], "protein_priority": "meat_over_fish"},
    "measurement_rules": {"pasta": "dry", "meat": "raw_unless_explicitly_cooked", "frozen_vegetables": "frozen", "packaged_food": "as_served_label", "wrap": "unit_and_label_grams"},
}


def status_for(target=TARGET):
    return SimpleNamespace(
        target=SimpleNamespace(**target),
        remaining_calories=target["calories"],
        remaining_protein_g=target["protein_g"],
        remaining_carbs_g=target["carbs_g"],
        remaining_fat_g=target["fat_g"],
    )


def meal_log(*, calories, protein_g, carbs_g=0, fat_g=0):
    return {"meal_id": "logged-breakfast", "calories": calories, "protein_g": protein_g, "carbs_g": carbs_g, "fat_g": fat_g}


def build_fixture_protocol(*, calendar_blocks=None, logged_meals=None):
    return build_today_protocol(
        target_date=date(2026, 8, 27),
        status=status_for(),
        foods=FOODS,
        memory_entries=[],
        calendar_blocks=calendar_blocks or [],
        constitution=CONSTITUTION,
        logged_meals=logged_meals or [],
    )


def build_protocol_for(*, target, logged_meals=None, memory_entries=None):
    return build_today_protocol(
        target_date=date(2026, 8, 27), status=status_for(target), foods=FOODS,
        memory_entries=memory_entries or [], calendar_blocks=[], constitution=CONSTITUTION,
        logged_meals=logged_meals or [],
    )


def test_protocol_has_four_exact_gram_slots_and_reconciles_targets():
    protocol = build_fixture_protocol()

    assert [meal["slot"] for meal in protocol["meals"]] == ["breakfast", "rehearsal_break", "pre_training", "dinner"]
    assert all(item["quantity_g"] > 0 for meal in protocol["meals"] for item in meal["items"])
    assert all(item["measurement_state"] for meal in protocol["meals"] for item in meal["items"])
    assert abs(protocol["target_gap"]["calories"]) <= 50
    assert abs(protocol["target_gap"]["protein_g"]) <= 5
    assert protocol["target_matched"] is True


def test_protocol_reconciles_a_lower_calorie_higher_protein_remaining_target():
    protocol = build_protocol_for(target={"calories": 2400, "protein_g": 200, "carbs_g": 260, "fat_g": 60})

    assert abs(protocol["target_gap"]["calories"]) <= 50
    assert abs(protocol["target_gap"]["protein_g"]) <= 5
    assert protocol["target_matched"] is True


def test_protocol_reconciles_protein_skewed_logged_meals():
    protocol = build_protocol_for(
        target=TARGET,
        logged_meals=[meal_log(calories=600, protein_g=20, carbs_g=100, fat_g=20)],
    )

    assert protocol["remaining_target"]["protein_g"] == 155
    assert abs(protocol["target_gap"]["calories"]) <= 50
    assert abs(protocol["target_gap"]["protein_g"]) <= 5
    assert protocol["target_matched"] is True


def test_protocol_preserves_the_constitution_fibre_minimum_while_reconciling():
    constitution = {
        **CONSTITUTION,
        "phases": {"recomposition_cut": {"fibre_target_g": [30, 35]}},
    }
    protocol = build_today_protocol(
        target_date=date(2026, 8, 27),
        status=status_for({"calories": 1800, "protein_g": 180, "carbs_g": 160, "fat_g": 45}),
        foods=FOODS, memory_entries=[], calendar_blocks=[], constitution=constitution, logged_meals=[],
    )

    assert protocol["planned_total"]["fibre_g"] >= 30
    assert protocol["target_matched"] is True


def test_protocol_respects_user_food_rules_before_scoring():
    protocol = build_fixture_protocol()
    names = " ".join(item["name"].lower() for meal in protocol["meals"] for item in meal["items"])

    assert "potato" not in names
    assert "cookie crisp" in names
    assert "wrap" in names or "pasta" in names
    assert "chicken" in names


def test_protocol_reads_approved_food_rules_from_the_active_phase():
    constitution = {
        "active_phase": "recomposition_cut",
        "phases": {"recomposition_cut": {"preferences": {"avoid": ["wrap"]}, "measurement_rules": CONSTITUTION["measurement_rules"]}},
    }
    protocol = build_today_protocol(
        target_date=date(2026, 8, 27), status=status_for(), foods=FOODS,
        memory_entries=[], calendar_blocks=[], constitution=constitution, logged_meals=[],
    )

    assert all("wrap" not in item["name"].lower() for meal in protocol["meals"] for item in meal["items"])


def test_rehearsal_creates_portable_noon_meal_without_changing_target():
    protocol = build_fixture_protocol(calendar_blocks=[{"start": "11:00", "end": "15:00", "kind": "rehearsal", "breaks": ["12:00"]}])
    meal = next(row for row in protocol["meals"] if row["slot"] == "rehearsal_break")

    assert meal["timing"] == "12:00"
    assert meal["portable"] is True
    assert protocol["target"]["calories"] == 2600


def test_logged_meals_are_subtracted_and_never_rewritten():
    logged = [meal_log(calories=600, protein_g=40, carbs_g=60, fat_g=20)]
    protocol = build_fixture_protocol(logged_meals=logged)

    assert protocol["logged_meals"] == logged
    assert protocol["remaining_target"]["calories"] == 2000
    assert protocol["remaining_target"]["protein_g"] == 135
    assert all(meal["source"] == "proposal" for meal in protocol["meals"])


def test_exact_component_scales_macros_and_marks_missing_label_as_estimate():
    component = exact_component(FOODS[4], 60, "as_served")

    assert component == {
        "item_id": "banana", "name": "Banana", "quantity_g": 60.0,
        "measurement_state": "as_served", "label_source": "generic_estimate", "is_estimate": True,
        "calories": 53.5, "protein_g": 0.7, "carbs_g": 13.5, "fat_g": 0.2, "fibre_g": 1.6,
    }


def test_protocol_identity_is_deterministic_for_key_order_and_changes_for_logged_meals():
    first = protocol_identity(date(2026, 8, 27), TARGET, [meal_log(calories=100, protein_g=10)])
    second = protocol_identity(date(2026, 8, 27), {"fat_g": 70, "carbs_g": 315, "protein_g": 175, "calories": 2600}, [meal_log(protein_g=10, calories=100)])
    changed = protocol_identity(date(2026, 8, 27), TARGET, [meal_log(calories=101, protein_g=10)])

    assert first == second
    assert len(first) == 20
    assert first != changed


def test_replan_skip_removes_only_the_requested_proposal_and_preserves_approval():
    protocol = build_fixture_protocol()
    result = replan_protocol(protocol, {"type": "skip", "meal_id": "pre_training"}, FOODS)

    assert [meal["meal_id"] for meal in result["meals"]] == ["breakfast", "rehearsal_break", "dinner"]
    assert result["requires_approval"] is True
    assert result["logged_meals"] == protocol["logged_meals"]


def test_replan_adjust_portion_recalculates_an_exact_component():
    protocol = build_fixture_protocol()
    result = replan_protocol(protocol, {"type": "adjust_portion", "meal_id": "breakfast", "item_id": "cookie", "quantity_g": 50}, FOODS)
    item = next(item for meal in result["meals"] for item in meal["items"] if item["item_id"] == "cookie")

    assert item["quantity_g"] == 50.0
    assert item["calories"] == 195.0
    assert result["requires_approval"] is True


def test_replan_replace_uses_an_allowed_nearest_macro_match():
    protocol = build_fixture_protocol()
    result = replan_protocol(protocol, {"type": "replace", "meal_id": "pre_training"}, FOODS)
    meal = next(meal for meal in result["meals"] if meal["meal_id"] == "pre_training")

    assert meal["source"] == "proposal"
    assert all("potato" not in item["name"].lower() for item in meal["items"])
    assert all(item["quantity_g"] > 0 for item in meal["items"])


def test_replan_preserves_all_avoided_foods_while_rebalancing():
    protocol = build_protocol_for(target=TARGET, memory_entries=[{"kind": "dislike", "name": "pasta"}])
    result = replan_protocol(protocol, {"type": "skip", "meal_id": "dinner"}, FOODS)

    assert all("pasta" not in item["name"].lower() for meal in result["meals"] for item in meal["items"])
    assert abs(result["target_gap"]["calories"]) <= 50
    assert abs(result["target_gap"]["protein_g"]) <= 5


def test_replan_corrects_a_large_portion_increase_back_to_target_tolerance():
    protocol = build_fixture_protocol()
    result = replan_protocol(protocol, {"type": "adjust_portion", "meal_id": "breakfast", "item_id": "cookie", "quantity_g": 300}, FOODS)
    cookie = next(item for meal in result["meals"] for item in meal["items"] if item["item_id"] == "cookie")

    assert cookie["quantity_g"] == 300.0
    assert abs(result["target_gap"]["calories"]) <= 50
    assert abs(result["target_gap"]["protein_g"]) <= 5
    assert result["target_matched"] is True


def test_balance_stage_enforces_protein_carbohydrate_fat_then_fibre_order():
    assert _balance_stage({"calories": 500, "protein_g": 6, "carbs_g": 100, "fat_g": 30}, 10) == 0
    assert _balance_stage({"calories": 500, "protein_g": 5, "carbs_g": 100, "fat_g": 30}, 10) == 1
    assert _balance_stage({"calories": 500, "protein_g": 5, "carbs_g": 10, "fat_g": 30}, 10) == 2
    assert _balance_stage({"calories": 40, "protein_g": 5, "carbs_g": 10, "fat_g": 5}, 10) == 3


def test_replan_protects_an_implied_first_item_portion_change():
    protocol = build_fixture_protocol()
    meal = next(row for row in protocol["meals"] if row["meal_id"] == "breakfast")
    first_item_id = meal["items"][0]["item_id"]

    result = replan_protocol(
        protocol,
        {"type": "adjust_portion", "meal_id": "breakfast", "quantity_g": 75},
        FOODS,
    )
    changed = next(
        item for row in result["meals"] for item in row["items"]
        if row["meal_id"] == "breakfast" and item["item_id"] == first_item_id
    )

    assert changed["quantity_g"] == 75.0


@pytest.mark.parametrize("action, message", [
    ({"type": "skip", "meal_id": "missing"}, "Unknown protocol meal"),
    ({"type": "unknown", "meal_id": "breakfast"}, "Unsupported replan action"),
])
def test_replan_rejects_invalid_operations(action, message):
    with pytest.raises(ValueError, match=message):
        replan_protocol(build_fixture_protocol(), action, FOODS)


def complete_rows(weights):
    start = date(2026, 8, 1)
    return [{"date": (start + timedelta(days=index)).isoformat(), "complete": True, "weight_kg": weight} for index, weight in enumerate(weights)]


def test_adjustment_evidence_is_locked_before_fourteen_complete_days():
    evidence = evaluate_adjustment_evidence(
        daily_rows=complete_rows([77.6] * 13), waist_rows=[], performance_rows=[], hunger_rows=[], constitution=CONSTITUTION,
    )

    assert evidence == {"status": "insufficient_evidence", "eligible": False, "complete_days": 13, "minimum_complete_days": 14}


def test_adjustment_evidence_never_lowers_the_fourteen_day_minimum():
    constitution = {
        "active_phase": "recomposition_cut",
        "phases": {"recomposition_cut": {"calibration": {"minimum_complete_days": 7}}},
    }
    evidence = evaluate_adjustment_evidence(
        daily_rows=complete_rows([77.6] * 13), waist_rows=[], performance_rows=[], hunger_rows=[], constitution=constitution,
    )

    assert evidence == {"status": "insufficient_evidence", "eligible": False, "complete_days": 13, "minimum_complete_days": 14}


def test_adjustment_evidence_proposes_guardrailed_change_without_mutating_constitution():
    constitution = {**CONSTITUTION}
    evidence = evaluate_adjustment_evidence(
        daily_rows=complete_rows([77.6 - (0.6 / 7) * day for day in range(14)]),
        waist_rows=[{"date": "2026-08-01", "value": 86}, {"date": "2026-08-14", "value": 85.5}],
        performance_rows=[{"trend": "stable"}], hunger_rows=[{"level": 2}], constitution=constitution,
    )

    assert evidence["eligible"] is True
    assert evidence["direction"] == "increase"
    assert evidence["kcal_delta"] in {100, 150}
    assert evidence["requires_approval"] is True
    assert constitution == CONSTITUTION


def test_research_peptides_are_rejected_from_planning():
    constitution = {
        "supplements": {
            "research_peptides": {
                "MOTS-C": {"status": "blocked", "human_use_dosing": False},
            },
        },
    }
    with pytest.raises(ValueError, match="Blocked planning substance"):
        validate_planning_substances(["creatine", "MOTS-C"], constitution)


def test_non_blocked_supplements_remain_plannable():
    assert validate_planning_substances(["creatine"], {"supplements": {}}) == ["creatine"]
