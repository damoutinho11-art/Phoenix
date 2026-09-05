from jarvis.domains.nutrition.recomposition import exact_component, measurement_state_for_food


def test_reference_source_does_not_turn_an_estimate_into_a_product_label():
    food = dict(id="reference", name="Chicken Breast", reference_g=100,
                calories=165, protein_g=31, carbs_g=0, fat_g=3.6,
                fibre_g=0, fibre_known=True, is_estimate=True,
                label_source="USDA reference", label_state="reference_estimate",
                source_url="https://fdc.nal.usda.gov/food-details/171477/nutrients",
                measurement_state="cooked")
    component = exact_component(food, 150, measurement_state_for_food(food, {}))
    assert component["is_estimate"] is True
    assert component["label_state"] == "reference_estimate"
    assert component["source_url"] == food["source_url"]
    assert component["measurement_state"] == "cooked"
    assert component["fibre_known"] is True


def test_unknown_fibre_is_explicit_and_not_reported_as_measured_zero():
    food = dict(id="unknown", name="Unknown food", reference_g=100,
                calories=100, protein_g=10, carbs_g=10, fat_g=2,
                fibre_g=0, fibre_known=False, is_estimate=True)
    component = exact_component(food, 100, "as_served")
    assert component["fibre_known"] is False
    assert component["is_estimate"] is True
