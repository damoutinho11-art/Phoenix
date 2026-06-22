import tempfile
import unittest
from datetime import date, timedelta
from pathlib import Path
from unittest.mock import AsyncMock, MagicMock, patch

import httpx
from fastapi.testclient import TestClient

from jarvis.api.main import app
from jarvis.data import database

client = TestClient(app)

_MEAL = {
    "item_id": "recipe_012",
    "item_type": "recipe",
    "name": "Egg White Bites",
    "servings": 1,
    "calories": 410,
    "protein_g": 72,
    "fat_g": 1,
    "carbs_g": 23,
    "source": "manual",
}

_PRODUCT_PAYLOAD = {
    "status": 1,
    "product": {
        "product_name_en": "Coca-Cola Original Taste",
        "product_name": "Coca-Cola",
        "generic_name": "Cola drink",
        "serving_quantity": "330",
        "nutriments": {
            "energy-kcal_100g": 42,
            "proteins_100g": 0,
            "fat_100g": 0,
            "carbohydrates_100g": 10.6,
        },
    },
}


def _mock_async_client(*, payload=None, side_effect=None):
    response = MagicMock()
    response.raise_for_status.return_value = None
    response.json.return_value = payload
    async_client = MagicMock()
    async_client.get = AsyncMock(return_value=response, side_effect=side_effect)
    context = MagicMock()
    context.__aenter__ = AsyncMock(return_value=async_client)
    context.__aexit__ = AsyncMock(return_value=None)
    return context, async_client


class Step6RouteTests(unittest.TestCase):
    def setUp(self):
        self.temp_dir = tempfile.TemporaryDirectory()
        self.db_path = Path(self.temp_dir.name) / "api-test.db"
        self.db_patch = patch.object(database, "DB_PATH", self.db_path)
        self.db_patch.start()
        database.init_db()

    def tearDown(self):
        self.db_patch.stop()
        self.temp_dir.cleanup()

    def _post_meal(self, payload=None):
        return client.post("/nutrition/log/meal", json=payload or _MEAL)

    def test_nutrition_status_empty_before_meals(self):
        data = client.get("/nutrition/status").json()
        assert data["logged"]["total_calories"] == 0
        assert data["meal_log"] == []

    def test_post_meal_returns_meal_id(self):
        response = self._post_meal()
        assert response.status_code == 200
        assert isinstance(response.json()["meal_id"], int)

    def test_post_meal_defaults_to_today(self):
        data = self._post_meal().json()
        assert data["log_date"] == date.today().isoformat()

    def test_nutrition_status_reflects_logged_meal(self):
        self._post_meal()
        data = client.get("/nutrition/status").json()
        assert data["logged"]["total_calories"] == 410
        assert data["logged"]["total_protein_g"] == 72
        assert data["remaining_protein_g"] == 93

    def test_nutrition_status_includes_meal_log_rows(self):
        meal_id = self._post_meal().json()["meal_id"]
        data = client.get("/nutrition/status").json()
        assert data["meal_log"][0]["id"] == meal_id
        assert data["meal_log"][0]["source"] == "manual"

    def test_multiple_meals_sum_in_status(self):
        self._post_meal()
        second = dict(_MEAL, item_id="second", calories=100, protein_g=10)
        self._post_meal(second)
        data = client.get("/nutrition/status").json()
        assert data["logged"]["total_calories"] == 510
        assert data["logged"]["total_protein_g"] == 82

    def test_delete_meal_resets_status(self):
        meal_id = self._post_meal().json()["meal_id"]
        response = client.delete(f"/nutrition/log/meal/{meal_id}")
        assert response.status_code == 200
        assert response.json()["status"] == "deleted"
        assert client.get("/nutrition/status").json()["logged"]["total_calories"] == 0

    def test_delete_unknown_meal_returns_404(self):
        assert client.delete("/nutrition/log/meal/999999").status_code == 404

    def test_invalid_meal_returns_422(self):
        invalid = dict(_MEAL, servings=0)
        assert self._post_meal(invalid).status_code == 422

    def test_log_weight_returns_value(self):
        response = client.post("/nutrition/log/weight", json={"weight_kg": 73.2})
        assert response.status_code == 200
        assert response.json()["weight_kg"] == 73.2
        assert isinstance(response.json()["weight_id"], int)

    def test_log_weight_upserts_today(self):
        client.post("/nutrition/log/weight", json={"weight_kg": 73.2})
        client.post("/nutrition/log/weight", json={"weight_kg": 72.9})
        weights = client.get("/nutrition/log/weight/history").json()["weights"]
        assert len(weights) == 1
        assert weights[0]["weight_kg"] == 72.9

    def test_weight_history_returns_logged_rows(self):
        client.post("/nutrition/log/weight", json={"weight_kg": 73.2})
        data = client.get("/nutrition/log/weight/history").json()
        assert data["count"] == 1
        assert data["weights"][0]["log_date"] == date.today().isoformat()

    def test_weight_history_respects_days(self):
        database.log_weight(date.today() - timedelta(days=5), 74.0)
        database.log_weight(date.today(), 73.2)
        data = client.get("/nutrition/log/weight/history?days=3").json()
        assert data["count"] == 1
        assert data["weights"][0]["weight_kg"] == 73.2

    def test_unknown_barcode_returns_404(self):
        context, _ = _mock_async_client(payload={"status": 0})
        with patch("jarvis.api.routers.barcode.httpx.AsyncClient", return_value=context):
            response = client.get("/barcode/lookup/unknown")
        assert response.status_code == 404

    def test_barcode_with_missing_macros_returns_404(self):
        payload = {"status": 1, "product": {"product_name": "Mystery", "nutriments": {}}}
        context, _ = _mock_async_client(payload=payload)
        with patch("jarvis.api.routers.barcode.httpx.AsyncClient", return_value=context):
            response = client.get("/barcode/lookup/missing")
        assert response.status_code == 404

    def test_barcode_success_returns_open_food_facts_source(self):
        context, _ = _mock_async_client(payload=_PRODUCT_PAYLOAD)
        with patch("jarvis.api.routers.barcode.httpx.AsyncClient", return_value=context):
            data = client.get("/barcode/lookup/5449000000996").json()
        assert data["source"] == "open_food_facts"
        assert data["name"] == "Coca-Cola Original Taste"
        assert data["calories"] == 42
        assert data["serving_size_g"] == 330

    def test_barcode_success_is_cached(self):
        context, _ = _mock_async_client(payload=_PRODUCT_PAYLOAD)
        with patch("jarvis.api.routers.barcode.httpx.AsyncClient", return_value=context):
            client.get("/barcode/lookup/5449000000996")
        assert database.get_barcode_cache("5449000000996") is not None

    def test_second_barcode_lookup_uses_cache(self):
        database.cache_barcode(
            "5449000000996", "Cached Cola", 42, 0, 0, 10.6, 330
        )
        with patch("jarvis.api.routers.barcode.httpx.AsyncClient") as async_client:
            data = client.get("/barcode/lookup/5449000000996").json()
        async_client.assert_not_called()
        assert data["source"] == "cache"
        assert data["name"] == "Cached Cola"

    def test_barcode_timeout_returns_504(self):
        request = httpx.Request("GET", "https://world.openfoodfacts.org")
        context, _ = _mock_async_client(
            side_effect=httpx.ReadTimeout("timeout", request=request)
        )
        with patch("jarvis.api.routers.barcode.httpx.AsyncClient", return_value=context):
            response = client.get("/barcode/lookup/timeout")
        assert response.status_code == 504

    def test_barcode_http_error_returns_502(self):
        request = httpx.Request("GET", "https://world.openfoodfacts.org")
        context, _ = _mock_async_client(
            side_effect=httpx.ConnectError("failed", request=request)
        )
        with patch("jarvis.api.routers.barcode.httpx.AsyncClient", return_value=context):
            response = client.get("/barcode/lookup/http-error")
        assert response.status_code == 502

    def test_barcode_name_falls_back_to_product_name(self):
        payload = {
            "status": 1,
            "product": {
                "product_name": "Fallback Name",
                "serving_size": "250 g",
                "nutriments": {
                    "energy-kcal_100g": 100,
                    "proteins_100g": 5,
                    "fat_100g": 2,
                    "carbohydrates_100g": 12,
                },
            },
        }
        context, _ = _mock_async_client(payload=payload)
        with patch("jarvis.api.routers.barcode.httpx.AsyncClient", return_value=context):
            data = client.get("/barcode/lookup/fallback").json()
        assert data["name"] == "Fallback Name"
        assert data["serving_size_g"] == 250

