"""Tests for /barcode lookup, focused on the macro basis a caller scales by."""

import sqlite3

import pytest
from fastapi.testclient import TestClient

from jarvis.api.main import app
from jarvis.api.routers.barcode import _macros_for_suffix, _parse_product
from jarvis.data import database

client = TestClient(app)


def _payload(nutriments: dict, name: str = "Test Cereal", **product) -> dict:
    return {"status": 1, "product": {"product_name": name, "nutriments": nutriments, **product}}


_PER_100G = {
    "energy-kcal_100g": 379.0,
    "proteins_100g": 7.5,
    "fat_100g": 1.4,
    "carbohydrates_100g": 84.0,
}
_PER_SERVING = {
    "energy-kcal_serving": 114.0,
    "proteins_serving": 2.3,
    "fat_serving": 0.4,
    "carbohydrates_serving": 25.2,
}


def test_per_100g_product_reports_the_gram_basis() -> None:
    parsed = _parse_product(_payload(_PER_100G))
    assert parsed["macro_basis"] == "100g"
    assert parsed["calories"] == 379.0
    assert parsed["protein_g"] == 7.5


def test_serving_only_product_is_labelled_serving_not_grams() -> None:
    """A serving-only product must never be presented as per-100g."""
    parsed = _parse_product(_payload(_PER_SERVING, serving_size="30 g"))
    assert parsed["macro_basis"] == "serving"
    assert parsed["calories"] == 114.0
    assert parsed["serving_size_g"] == 30.0


def test_per_100g_wins_when_both_bases_are_present() -> None:
    parsed = _parse_product(_payload({**_PER_100G, **_PER_SERVING}))
    assert parsed["macro_basis"] == "100g"
    assert parsed["calories"] == 379.0


def test_mixed_bases_are_rejected_rather_than_blended() -> None:
    """Half per-100g and half per-serving describes no real portion."""
    mixed = {
        "energy-kcal_100g": 379.0,
        "proteins_100g": 7.5,
        "fat_serving": 0.4,
        "carbohydrates_serving": 25.2,
    }
    assert _parse_product(_payload(mixed)) is None


def test_incomplete_macros_are_rejected() -> None:
    partial = {k: v for k, v in _PER_100G.items() if k != "fat_100g"}
    assert _macros_for_suffix(partial, "_100g") is None
    assert _parse_product(_payload(partial)) is None


def test_lookup_persists_and_returns_the_basis(monkeypatch, tmp_path) -> None:
    monkeypatch.setattr(database, "DB_PATH", tmp_path / "barcode.db")
    database.init_db()

    cached = database.cache_barcode(
        barcode="4056489182634",
        name="Crownfield Cornflakes",
        calories=379.0,
        protein_g=7.5,
        fat_g=1.4,
        carbs_g=84.0,
        serving_size_g=30.0,
        macro_basis="100g",
    )
    assert cached["macro_basis"] == "100g"

    response = client.get("/barcode/lookup/4056489182634")
    assert response.status_code == 200
    body = response.json()
    assert body["source"] == "cache"
    assert body["macro_basis"] == "100g"
    assert body["calories"] == 379.0


def test_cache_rejects_an_unknown_basis(monkeypatch, tmp_path) -> None:
    monkeypatch.setattr(database, "DB_PATH", tmp_path / "barcode-check.db")
    database.init_db()
    with pytest.raises(sqlite3.IntegrityError):
        database.cache_barcode(
            barcode="1",
            name="Nope",
            calories=1.0,
            protein_g=1.0,
            fat_g=1.0,
            carbs_g=1.0,
            serving_size_g=None,
            macro_basis="per_bowl",
        )


def test_migration_drops_basisless_cache_rows(monkeypatch, tmp_path) -> None:
    """Pre-migration rows have an unknowable basis, so they must not survive."""
    db_path = tmp_path / "legacy.db"
    monkeypatch.setattr(database, "DB_PATH", db_path)
    legacy = sqlite3.connect(db_path)
    legacy.executescript(
        """
        CREATE TABLE barcode_cache (
            barcode TEXT PRIMARY KEY,
            name TEXT NOT NULL,
            calories REAL NOT NULL,
            protein_g REAL NOT NULL,
            fat_g REAL NOT NULL,
            carbs_g REAL NOT NULL,
            serving_size_g REAL,
            fetched_at TEXT NOT NULL
        );
        INSERT INTO barcode_cache VALUES ('999', 'Legacy', 100, 1, 1, 1, NULL, '2026-01-01');
        """
    )
    legacy.commit()
    legacy.close()

    database.init_db()

    assert database.get_barcode_cache("999") is None
    columns = {
        row[1]
        for row in sqlite3.connect(db_path)
        .execute("PRAGMA table_info(barcode_cache)")
        .fetchall()
    }
    assert "macro_basis" in columns
