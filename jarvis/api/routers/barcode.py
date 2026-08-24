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


_MACRO_FIELDS = (
    ("calories", "energy-kcal"),
    ("protein_g", "proteins"),
    ("fat_g", "fat"),
    ("carbs_g", "carbohydrates"),
)


def _macros_for_suffix(nutrients: dict[str, Any], suffix: str) -> dict[str, float] | None:
    """Read all four macros from one basis, or nothing.

    Open Food Facts may carry `_100g` for some nutrients and `_serving` for
    others. Mixing them yields a macro set that belongs to no real portion, so
    a partial match fails instead of silently blending bases.
    """
    macros: dict[str, float] = {}
    for key, name in _MACRO_FIELDS:
        value = _number(nutrients.get(f"{name}{suffix}"))
        if value is None:
            return None
        macros[key] = value
    return macros


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

    # Prefer per-100g: it is what gram-based logging scales against.
    macros = _macros_for_suffix(nutrients, "_100g")
    macro_basis = "100g"
    if macros is None:
        macros = _macros_for_suffix(nutrients, "_serving")
        macro_basis = "serving"
    if macros is None:
        return None

    return {
        "name": name,
        **macros,
        "serving_size_g": _serving_size_g(product),
        "macro_basis": macro_basis,
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
        # Callers must not scale these macros by grams without checking this:
        # "100g" is safe to scale, "serving" is one portion of serving_size_g.
        "macro_basis": row["macro_basis"],
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
                headers={"User-Agent": "PHOENIX/0 (read-only nutrition lookup)"},
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
