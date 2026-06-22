"""Tests for nutrition API routes. Mocks Anthropic API call."""

import unittest
from unittest.mock import MagicMock, patch
from fastapi.testclient import TestClient
from jarvis.api.main import app

client = TestClient(app)

_MOCK_BRIEF = (
    "Today is a cut training day targeting 2400 kcal and 165g protein. "
    "Nothing logged yet — full 2400 kcal and 165g protein remaining. "
    "Egg White Bites are a strong first meal at 410 kcal and 72g protein. "
    "Remaining protein target: 165g."
)

_MOCK_RESPONSE = MagicMock()
_MOCK_RESPONSE.content = [MagicMock(text=_MOCK_BRIEF)]


def _make_mock_claude():
    mock = MagicMock()
    mock.messages.create.return_value = _MOCK_RESPONSE
    return mock


class NutritionStatusRouteTests(unittest.TestCase):
    def test_status_returns_200(self):
        assert client.get("/nutrition/status").status_code == 200

    def test_status_has_phase(self):
        data = client.get("/nutrition/status").json()
        assert "phase" in data
        assert data["phase"] in ("cut", "peak")

    def test_status_has_target(self):
        data = client.get("/nutrition/status").json()
        assert "target" in data
        t = data["target"]
        assert "calories" in t
        assert "protein_g" in t

    def test_status_has_logged(self):
        data = client.get("/nutrition/status").json()
        assert "logged" in data
        assert "total_calories" in data["logged"]

    def test_status_has_remaining(self):
        data = client.get("/nutrition/status").json()
        assert "remaining_calories" in data
        assert "remaining_protein_g" in data

    def test_status_has_suggested_recipes(self):
        data = client.get("/nutrition/status").json()
        assert "suggested_recipes" in data
        assert isinstance(data["suggested_recipes"], list)

    def test_is_training_day_is_bool(self):
        data = client.get("/nutrition/status").json()
        assert isinstance(data["is_training_day"], bool)


class RecipesRouteTests(unittest.TestCase):
    def test_recipes_returns_200(self):
        assert client.get("/nutrition/recipes").status_code == 200

    def test_recipes_has_count(self):
        data = client.get("/nutrition/recipes").json()
        assert "count" in data
        assert data["count"] == 156

    def test_filter_by_category(self):
        data = client.get("/nutrition/recipes?category=Breakfast").json()
        assert all(r["category"] == "Breakfast" for r in data["recipes"])

    def test_filter_by_max_calories(self):
        data = client.get("/nutrition/recipes?max_calories=300").json()
        assert all(r["calories"] <= 300 for r in data["recipes"])

    def test_filter_by_min_protein(self):
        data = client.get("/nutrition/recipes?min_protein=70").json()
        assert all(r["protein_g"] >= 70 for r in data["recipes"])

    def test_recipe_has_required_fields(self):
        data = client.get("/nutrition/recipes").json()
        r = data["recipes"][0]
        for field in ["id", "name", "category", "calories", "protein_g"]:
            assert field in r


class StaplesRouteTests(unittest.TestCase):
    def test_staples_returns_200(self):
        assert client.get("/nutrition/staples").status_code == 200

    def test_staples_count(self):
        data = client.get("/nutrition/staples").json()
        assert data["count"] == 25

    def test_staple_has_price(self):
        data = client.get("/nutrition/staples").json()
        assert all(s["price_eur"] > 0 for s in data["staples"])

    def test_staple_has_macros(self):
        data = client.get("/nutrition/staples").json()
        s = data["staples"][0]
        for field in ["calories", "protein_g", "fat_g", "carbs_g"]:
            assert field in s


class NutritionBriefRouteTests(unittest.TestCase):
    def test_brief_returns_200(self):
        with patch("jarvis.api.routers.nutrition.anthropic.Anthropic",
                   return_value=_make_mock_claude()):
            assert client.get("/nutrition/brief").status_code == 200

    def test_brief_has_brief_field(self):
        with patch("jarvis.api.routers.nutrition.anthropic.Anthropic",
                   return_value=_make_mock_claude()):
            data = client.get("/nutrition/brief").json()
        assert "brief" in data
        assert isinstance(data["brief"], str)

    def test_requires_approval_always_true(self):
        with patch("jarvis.api.routers.nutrition.anthropic.Anthropic",
                   return_value=_make_mock_claude()):
            data = client.get("/nutrition/brief").json()
        assert data["requires_approval"] is True

    def test_claude_failure_returns_fallback(self):
        mock = MagicMock()
        mock.messages.create.side_effect = Exception("timeout")
        with patch("jarvis.api.routers.nutrition.anthropic.Anthropic",
                   return_value=mock):
            data = client.get("/nutrition/brief").json()
        assert "Unable to generate brief" in data["brief"]
        assert data["requires_approval"] is True

    def test_correct_model_used(self):
        mock = _make_mock_claude()
        with patch("jarvis.api.routers.nutrition.anthropic.Anthropic",
                   return_value=mock):
            client.get("/nutrition/brief")
        kwargs = mock.messages.create.call_args.kwargs
        assert kwargs["model"] == "claude-sonnet-4-6"
