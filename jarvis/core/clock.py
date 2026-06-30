from datetime import date, datetime, timezone


def today() -> date:
    return date.today()


def utc_now() -> datetime:
    return datetime.now(timezone.utc)


def utc_now_iso() -> str:
    return utc_now().isoformat()
