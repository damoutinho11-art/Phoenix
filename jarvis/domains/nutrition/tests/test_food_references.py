import pytest

from jarvis.domains.nutrition import engine, recomposition


def _inventory_by_id() -> dict[str, dict]:
    return {food["id"]: food for food in engine.load_exact_food_inventory()}


def test_exact_inventory_uses_reference_overlay_without_fabricating_product_labels():
    foods = _inventory_by_id()

    banana = foods["lidl_012"]
    assert banana["fibre_g"] == 3.12
    assert banana["fibre_known"] is True
    assert banana["fibre_source_url"].startswith("https://www.nal.usda.gov/")
    assert banana["label_state"] == "inventory_estimate"
    assert banana["is_estimate"] is True
    assert "label_source" not in banana

    unknown = foods["lidl_003"]
    assert unknown["fibre_g"] == 0.0
    assert unknown["fibre_known"] is False
    assert unknown["label_state"] == "inventory_estimate"
    assert unknown["is_estimate"] is True
    assert "label_source" not in unknown


def test_reference_fibre_scales_from_each_foods_declared_basis():
    foods = _inventory_by_id()

    banana = recomposition.exact_component(foods["lidl_012"], 120, "as_served")
    wrap = recomposition.exact_component(foods["lidl_044"], 62, "as_served")

    assert banana["fibre_g"] == 3.1
    assert foods["lidl_012"]["fibre_g"] == 3.12
    assert wrap["fibre_g"] == 6.1
    assert foods["lidl_044"]["fibre_g"] == pytest.approx(6.076)


def test_exact_inventory_adds_cookie_crisp_reference_and_cooked_chicken_basis():
    foods = _inventory_by_id()

    cookie = foods["reference_cookie_crisp"]
    assert cookie == {
        "id": "reference_cookie_crisp",
        "name": "Cookie Crisp",
        "reference_g": 100.0,
        "calories": 393,
        "protein_g": 7.2,
        "carbs_g": 76.3,
        "fat_g": 5.2,
        "fibre_g": 6.0,
        "fibre_known": True,
        "source_url": "https://www.nestle-cereals.com/ee/hommikusoogihelbed/cookie-crisp",
        "fibre_source_url": "https://www.nestle-cereals.com/ee/hommikusoogihelbed/cookie-crisp",
        "label_state": "reference_estimate",
        "is_estimate": True,
        "unit_weight_g": None,
    }

    chicken = foods["lidl_001"]
    assert chicken["name"] == "Chicken Breast (cooked reference)"
    assert chicken["measurement_state"] == "cooked"
    assert chicken["fibre_g"] == 0.0
    assert chicken["fibre_known"] is True
    assert chicken["source_url"] == "https://fdc.nal.usda.gov/food-details/171477/nutrients"
    assert chicken["is_estimate"] is True
