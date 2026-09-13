from datetime import date, datetime, timezone
from unittest.mock import patch

from jarvis.core import clock


def test_local_monday_starts_while_server_is_still_sunday():
    with patch('jarvis.core.clock.utc_now', return_value=datetime(2026, 9, 13, 20, 59, tzinfo=timezone.utc)):
        assert clock.today() == date(2026, 9, 13)
    frozen = datetime(2026, 9, 13, 21, 0, tzinfo=timezone.utc)
    with patch('jarvis.core.clock.utc_now', return_value=frozen):
        assert clock.today() == date(2026, 9, 14)
        assert clock.today().isocalendar().week == 38


def test_local_winter_midnight_uses_two_hour_offset():
    with patch('jarvis.core.clock.utc_now', return_value=datetime(2026, 12, 31, 21, 59, tzinfo=timezone.utc)):
        assert clock.today() == date(2026, 12, 31)
    with patch('jarvis.core.clock.utc_now', return_value=datetime(2026, 12, 31, 22, 0, tzinfo=timezone.utc)):
        assert clock.today() == date(2027, 1, 1)


def test_today_returns_date() -> None:
    assert isinstance(clock.today(), date)


def test_utc_now_is_timezone_aware() -> None:
    assert clock.utc_now().tzinfo == timezone.utc


def test_utc_now_iso_uses_utc_now_boundary() -> None:
    frozen = datetime(2026, 6, 30, 8, 15, tzinfo=timezone.utc)
    with patch("jarvis.core.clock.utc_now", return_value=frozen):
        assert clock.utc_now_iso() == "2026-06-30T08:15:00+00:00"
