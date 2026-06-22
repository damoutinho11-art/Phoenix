"""Read-only Open Food Facts lookup with a local SQLite cache."""

from __future__ import annotations

import re
from typing import Any

import httpx
from fastapi import APIRouter, HTTPException

from jarvis.data import database

router = APIRouter()

_OPEN_FOOD_FACTS_URL = "https://world.openfoodfacts.org/api/v2/product/{barcode}.json"


def _number(value: Any) -> float | None:
    try:
        return float(value) if value is not None else None
    except (TypeError, ValueError):
        return None


def _serving_size_g(product: dict[str, Any]) -> float | None:
    quantity = _number(product.get("serving_quantity"))
    if quantity is not None:
        return quantity
    match = re.search(r"\d+(?:[.,]\d+)?", str(product.get("serving_size", "")))
    return _number(match.group(0).replace(",", ".")) if match else None


def _nutrient(nutrients: dict[str, Any], name: str) -> float | None:
    for suffix in ("_100g", "_serving"):
        value = _number(nutrients.get(f"{name}{suffix}"))
        if value is not None:
            return value
    return None


def _parse_product(payload: dict[str, Any]) -> dict[str, Any] | None:
    if payload.get("status") != 1 or not isinstance(payload.get("product"), dict):
        return None

    product = payload["product"]
    name = next(
        (
            str(product.get(key)).strip()
            for key in ("product_name_en", "product_name", "generic_name")
            if product.get(key) and str(product.get(key)).strip()
        ),
        None,
    )
    nutrients = product.get("nutriments")
    if not name or not isinstance(nutrients, dict):
        return None

    calories = _nutrient(nutrients, "energy-kcal")
    protein_g = _nutrient(nutrients, "proteins")
    fat_g = _nutrient(nutrients, "fat")
    carbs_g = _nutrient(nutrients, "carbohydrates")
    if any(value is None for value in (calories, protein_g, fat_g, carbs_g)):
        return None

    return {
        "name": name,
        "calories": calories,
        "protein_g": protein_g,
        "fat_g": fat_g,
        "carbs_g": carbs_g,
        "serving_size_g": _serving_size_g(product),
    }


def _response(row: dict[str, Any], source: str) -> dict[str, Any]:
    return {
        "barcode": row["barcode"],
        "name": row["name"],
        "calories": row["calories"],
        "protein_g": row["protein_g"],
        "fat_g": row["fat_g"],
        "carbs_g": row["carbs_g"],
        "serving_size_g": row["serving_size_g"],
        "source": source,
    }


@router.get("/lookup/{barcode}")
async def lookup_barcode(barcode: str) -> dict:
    cached = database.get_barcode_cache(barcode)
    if cached is not None:
        return _response(cached, "cache")

    try:
        async with httpx.AsyncClient(timeout=10.0, follow_redirects=True) as client:
            response = await client.get(
                _OPEN_FOOD_FACTS_URL.format(barcode=barcode),
                headers={"User-Agent": "JARVIS/0 (read-only nutrition lookup)"},
                params={
                    "fields": (
                        "product_name_en,product_name,generic_name,nutriments,"
                        "serving_quantity,serving_size"
                    )
                },
            )
            response.raise_for_status()
    except httpx.TimeoutException as exc:
        raise HTTPException(status_code=504, detail="Open Food Facts request timed out") from exc
    except httpx.HTTPError as exc:
        raise HTTPException(status_code=502, detail="Open Food Facts request failed") from exc

    try:
        payload = response.json()
    except ValueError as exc:
        raise HTTPException(status_code=502, detail="Open Food Facts returned invalid JSON") from exc

    product = _parse_product(payload)
    if product is None:
        raise HTTPException(status_code=404, detail="Barcode not found or macros unavailable")

    cached = database.cache_barcode(barcode=barcode, **product)
    return _response(cached, "open_food_facts")
