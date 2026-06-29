"""Calendar domain engine for J.A.R.V.I.S.

READ-ONLY. This module never clicks, submits, or mutates anything on Plaan.
It takes a PlaanSnapshot (produced by the Cowork browser session) and
surfaces conflicts and schedule facts for the dashboard and other domains.

The browser session that produces the snapshot lives in Cowork, not here.
This engine only reasons about the data once it has been handed over.
"""

from __future__ import annotations

import json
from datetime import date, datetime, time, timedelta, timezone
from pathlib import Path
from typing import Any

from .data_contracts import (
    CalendarCheckResult,
    ConflictFlag,
    EventType,
    PlaanEvent,
    PlaanSnapshot,
)

_CALENDAR_DOMAIN_DIR = Path(__file__).resolve().parent
DEFAULT_CONSTITUTION_PATH = _CALENDAR_DOMAIN_DIR / "constitution.json"

APPROVAL_NOTICE = "Read-only. No mutations. No actions taken on Plaan."


def load_constitution(path: Path | str = DEFAULT_CONSTITUTION_PATH) -> dict[str, Any]:
    with Path(path).open("r", encoding="utf-8") as f:
        return json.load(f)


def validate_constitution(constitution: dict[str, Any]) -> None:
    required_true = [
        "no_mutations",
        "no_form_submissions",
        "no_clicks_that_change_state",
        "manual_approval_required_for_any_external_action",
    ]
    for key in required_true:
        if constitution.get(key) is not True:
            raise ValueError(f"Calendar constitution safety flag must be {key}=true.")

    rules = constitution.get("rules", {})
    for key, value in rules.items():
        if value is not True:
            raise ValueError(f"Calendar constitution rule must be true: {key}.")

    if constitution.get("access_mode") != "read_only":
        raise ValueError("Calendar constitution access_mode must be 'read_only'.")


# ---------------------------------------------------------------------------
# Snapshot parsing — called with data the Cowork browser session hands over
# ---------------------------------------------------------------------------

def parse_event(raw: dict[str, Any]) -> PlaanEvent:
    """Parse a single event dict from a Plaan scrape into a PlaanEvent.

    Expected raw keys: event_id, event_type, title, date (ISO), time_start
    (HH:MM or null), time_end (HH:MM or null), location (str or null),
    role (str or null).

    Unknown event_type values become EventType.UNKNOWN rather than raising,
    so new Plaan event categories don't hard-crash the engine.
    """

    def _parse_time(value: str | None) -> time | None:
        if not value:
            return None
        try:
            parts = value.strip().split(":")
            return time(int(parts[0]), int(parts[1]))
        except (ValueError, IndexError):
            return None

    raw_type = str(raw.get("event_type", "")).lower()
    try:
        event_type = EventType(raw_type)
    except ValueError:
        event_type = EventType.UNKNOWN

    return PlaanEvent(
        event_id=str(raw.get("event_id", "")),
        event_type=event_type,
        title=str(raw.get("title", "")),
        date=date.fromisoformat(str(raw["date"])),
        time_start=_parse_time(raw.get("time_start")),
        time_end=_parse_time(raw.get("time_end")),
        location=raw.get("location"),
        role=raw.get("role"),
        raw_source=raw,
    )


def parse_snapshot(raw: dict[str, Any]) -> PlaanSnapshot:
    """Parse a full Plaan scrape payload into a PlaanSnapshot.

    Expected raw keys: as_of (ISO datetime), events (list of event dicts),
    fetch_warnings (list of strings, optional).

    This is the entry point for data arriving from the Cowork browser session.
    """

    as_of = datetime.fromisoformat(str(raw["as_of"]))
    events = tuple(parse_event(e) for e in raw.get("events", []))
    warnings = tuple(str(w) for w in raw.get("fetch_warnings", []))
    return PlaanSnapshot(as_of=as_of, events=events, fetch_warnings=warnings)


# ---------------------------------------------------------------------------
# Staleness check
# ---------------------------------------------------------------------------

def snapshot_staleness_warning(
    snapshot: PlaanSnapshot,
    constitution: dict[str, Any],
    *,
    now: datetime | None = None,
) -> str | None:
    now = now or datetime.now(timezone.utc).replace(tzinfo=None)
    staleness = constitution.get("staleness_policy", {})
    warn_threshold = float(staleness.get("warn_if_older_than_hours", 12))
    hard_threshold = float(staleness.get("max_age_hours", 24))

    age_hours = (now - snapshot.as_of).total_seconds() / 3600

    if age_hours > hard_threshold:
        return (
            f"Plaan snapshot is {age_hours:.1f}h old (threshold: {hard_threshold}h). "
            "Fetch a fresh snapshot before relying on this schedule."
        )
    if age_hours > warn_threshold:
        return (
            f"Plaan snapshot is {age_hours:.1f}h old (warn threshold: {warn_threshold}h). "
            "Consider refreshing before making training/practice decisions."
        )
    return None


# ---------------------------------------------------------------------------
# Conflict detection
# ---------------------------------------------------------------------------

def detect_conflicts(
    snapshot: PlaanSnapshot,
    constitution: dict[str, Any],
    proposed_activities: list[dict[str, Any]],
) -> list[ConflictFlag]:
    """Detect conflicts between proposed local activities and the opera schedule.

    proposed_activities is a list of dicts with keys:
      - date (ISO date string)
      - activity_type: "heavy_training" | "practice" | "travel" | "other"
      - description: str
      - time_start: "HH:MM" or null (None means all-day / unscheduled)

    Returns a list of ConflictFlag. Hard blocks require explicit user decision;
    advisories are surfaced as warnings but don't block.
    """

    cd = constitution.get("conflict_detection", {})
    heavy_leg_buffer_hours = float(cd.get("heavy_leg_day_before_performance_hours", 18))
    late_cutoff_hour = int(cd.get("late_rehearsal_cutoff_hour", 21))

    conflicts: list[ConflictFlag] = []

    for activity in proposed_activities:
        activity_date = date.fromisoformat(str(activity["date"]))
        activity_type = str(activity.get("activity_type", "other"))
        description = str(activity.get("description", ""))

        opera_events_on_day = snapshot.events_on(activity_date)
        performances_on_day = [e for e in opera_events_on_day if e.event_type == EventType.PERFORMANCE]
        rehearsals_on_day = [e for e in opera_events_on_day if e.event_type == EventType.REHEARSAL]

        # Hard block: heavy training on a performance day
        if activity_type == "heavy_training" and performances_on_day:
            for perf in performances_on_day:
                conflicts.append(ConflictFlag(
                    conflict_type="heavy_training_on_performance_day",
                    severity="hard",
                    opera_event=perf,
                    proposed_activity=description,
                    detail=(
                        f"Heavy training on {activity_date} conflicts with performance "
                        f"'{perf.title}' at {perf.time_start}. "
                        "Constitution: performance_day_heavy_training_blocked."
                    ),
                ))

        # Hard block: heavy training on the day immediately before a performance.
        # The hour-based config (`heavy_leg_day_before_performance_hours`) is used
        # for same-day proximity checks (e.g. morning performance, afternoon training).
        # For the "day before" case, a calendar-day check is the right semantic:
        # "don't do heavy legs the day before a concert" regardless of what time
        # the training starts. Hour-arithmetic only from training_start_time to
        # perf_start creates dead zones (e.g. 08:00 training → 35h before 19:00
        # perf, which is outside an 18h window even though it's the day before).
        if activity_type == "heavy_training":
            buffer_delta = timedelta(hours=heavy_leg_buffer_hours)
            for perf in snapshot.performances():
                if perf.date == activity_date:
                    continue
                perf_start = perf.as_of_datetime_start()
                # Day-before check: performance is the calendar day after training.
                if perf.date == activity_date + timedelta(days=1):
                    conflicts.append(ConflictFlag(
                        conflict_type="heavy_training_too_close_to_performance",
                        severity="hard",
                        opera_event=perf,
                        proposed_activity=description,
                        detail=(
                            f"Heavy training on {activity_date} is the day before "
                            f"performance '{perf.title}' on {perf.date} at {perf.time_start}."
                        ),
                    ))
                # Same-day-proximity check for non-next-day cases (e.g. morning perf,
                # afternoon training on same day is caught above; this catches
                # training the same day as an early-morning performance on a later day).
                elif perf_start is not None:
                    activity_datetime = datetime.combine(activity_date, time(23, 59))
                    gap = perf_start - activity_datetime
                    if timedelta(0) < gap <= buffer_delta:
                        conflicts.append(ConflictFlag(
                            conflict_type="heavy_training_too_close_to_performance",
                            severity="hard",
                            opera_event=perf,
                            proposed_activity=description,
                            detail=(
                                f"Heavy training on {activity_date} is within "
                                f"{gap.total_seconds()/3600:.1f}h of performance "
                                f"'{perf.title}' on {perf.date} at {perf.time_start}."
                            ),
                        ))

        # Advisory: any activity scheduled after late_cutoff_hour when there's a late rehearsal
        raw_start = activity.get("time_start")
        if raw_start:
            try:
                act_hour = int(str(raw_start).split(":")[0])
                for rehearsal in rehearsals_on_day:
                    if rehearsal.time_end and rehearsal.time_end.hour >= late_cutoff_hour:
                        if act_hour >= late_cutoff_hour:
                            conflicts.append(ConflictFlag(
                                conflict_type="late_activity_during_late_rehearsal",
                                severity="advisory",
                                opera_event=rehearsal,
                                proposed_activity=description,
                                detail=(
                                    f"Activity '{description}' at {raw_start} on {activity_date} "
                                    f"overlaps with late rehearsal ending at {rehearsal.time_end}."
                                ),
                            ))
            except (ValueError, IndexError):
                pass

    return conflicts


# ---------------------------------------------------------------------------
# Top-level check — main entry point for other domains and the dashboard
# ---------------------------------------------------------------------------

def check_schedule(
    snapshot: PlaanSnapshot,
    constitution: dict[str, Any],
    proposed_activities: list[dict[str, Any]] | None = None,
    *,
    now: datetime | None = None,
) -> CalendarCheckResult:
    """Run a full schedule check and return a read-only result.

    proposed_activities: list of activity dicts (see detect_conflicts docstring).
    Pass an empty list or None to get just staleness/fetch info with no conflict check.
    """

    validate_constitution(constitution)

    now = now or datetime.now(timezone.utc).replace(tzinfo=None)
    age_hours = (now - snapshot.as_of).total_seconds() / 3600
    staleness = snapshot_staleness_warning(snapshot, constitution, now=now)
    conflicts = detect_conflicts(snapshot, constitution, proposed_activities or [])

    return CalendarCheckResult(
        as_of=snapshot.as_of,
        snapshot_age_hours=age_hours,
        staleness_warning=staleness,
        conflicts=tuple(conflicts),
        fetch_warnings=snapshot.fetch_warnings,
    )
