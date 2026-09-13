from datetime import date, datetime, timezone
from zoneinfo import ZoneInfo


# Phoenix's owner profile and calendar use Tallinn. Calendar boundaries must
# not depend on the deployment host's timezone; audit timestamps remain UTC.
LOCAL_TIMEZONE = ZoneInfo('Europe/Tallinn')


def today() -> date:
    return utc_now().astimezone(LOCAL_TIMEZONE).date()


def utc_now() -> datetime:
    return datetime.now(timezone.utc)


def utc_now_iso() -> str:
    return utc_now().isoformat()
