from datetime import date, datetime, timezone
from unittest.mock import patch

from jarvis.core import clock


def test_today_returns_date() -> None:
    assert isinstance(clock.today(), date)


def test_utc_now_is_timezone_aware() -> None:
    assert clock.utc_now().tzinfo == timezone.utc


def test_utc_now_iso_uses_utc_now_boundary() -> None:
    frozen = datetime(2026, 6, 30, 8, 15, tzinfo=timezone.utc)
    with patch("jarvis.core.clock.utc_now", return_value=frozen):
        assert clock.utc_now_iso() == "2026-06-30T08:15:00+00:00"
