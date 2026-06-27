"""Tests for configurable SQLite DB path via JARVIS_DB_PATH env var."""

from pathlib import Path

import pytest

from jarvis.data import database


def _patch_db(monkeypatch: pytest.MonkeyPatch, path: Path, source: str) -> None:
    monkeypatch.setattr(database, "DB_PATH", path)
    monkeypatch.setattr(database, "_DB_PATH_SOURCE", source)


def test_default_db_path_works(tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> None:
    db = tmp_path / "jarvis.db"
    _patch_db(monkeypatch, db, "default")
    database.init_db()

    assert db.exists()


def test_env_db_path_works(tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> None:
    db = tmp_path / "vol" / "jarvis.db"
    _patch_db(monkeypatch, db, "env:JARVIS_DB_PATH")
    database.init_db()

    assert db.exists()


def test_env_db_path_creates_parent_directory(tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> None:
    db = tmp_path / "deep" / "nested" / "jarvis.db"
    _patch_db(monkeypatch, db, "env:JARVIS_DB_PATH")
    database.init_db()

    assert db.parent.exists()
    assert db.exists()


def test_diagnostics_reports_default_source(tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> None:
    _patch_db(monkeypatch, tmp_path / "jarvis.db", "default")
    database.init_db()

    diag = database.get_database_diagnostics()

    assert diag["db_path_source"] == "default"


def test_diagnostics_reports_env_source(tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> None:
    _patch_db(monkeypatch, tmp_path / "jarvis.db", "env:JARVIS_DB_PATH")
    database.init_db()

    diag = database.get_database_diagnostics()

    assert diag["db_path_source"] == "env:JARVIS_DB_PATH"


def test_diagnostics_includes_db_parent_fields(tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> None:
    _patch_db(monkeypatch, tmp_path / "jarvis.db", "default")
    database.init_db()

    diag = database.get_database_diagnostics()

    assert "db_parent" in diag
    assert "db_parent_exists" in diag
    assert diag["db_parent_exists"] is True


def test_persistence_marker_survives_reopen(tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> None:
    db = tmp_path / "jarvis.db"
    _patch_db(monkeypatch, db, "env:JARVIS_DB_PATH")
    database.init_db()

    database.set_persistence_marker("production_persistence_probe", "test-value-123")
    # Simulate reopen: get_db() opens a fresh connection each time
    result = database.get_persistence_marker("production_persistence_probe")

    assert result is not None
    assert result["value"] == "test-value-123"


def test_diagnostics_db_path_matches_patched_path(tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> None:
    db = tmp_path / "custom.db"
    _patch_db(monkeypatch, db, "env:JARVIS_DB_PATH")
    database.init_db()

    diag = database.get_database_diagnostics()

    assert diag["db_path"] == str(db)
