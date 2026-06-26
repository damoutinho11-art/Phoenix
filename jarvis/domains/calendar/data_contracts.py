"""Typed data contracts for the calendar domain.

All data structures here are read-only views of what Plaan returns.
Nothing in this module writes to or interacts with Plaan.
"""

from __future__ import annotations

from dataclasses import dataclass, field
from datetime import date, datetime, time
from enum import Enum
from typing import Any


class EventType(str, Enum):
    REHEARSAL = "rehearsal"
    PERFORMANCE = "performance"
    CALL = "call"
    TRAVEL = "travel"
    UNKNOWN = "unknown"


@dataclass(frozen=True)
class PlaanEvent:
    """A single event as extracted from Plaan. All fields are read-only.

    raw_source is the original dict/text from the scrape, kept for debugging
    and for re-parsing if the schema changes.
    """

    event_id: str
    event_type: EventType
    title: str
    date: date
    time_start: time | None
    time_end: time | None
    location: str | None
    role: str | None
    raw_source: dict[str, Any] = field(default_factory=dict, compare=False, hash=False)

    def as_of_datetime_start(self) -> datetime | None:
        if self.time_start is None:
            return None
        return datetime.combine(self.date, self.time_start)

    def as_of_datetime_end(self) -> datetime | None:
        if self.time_end is None:
            return None
        return datetime.combine(self.date, self.time_end)


@dataclass(frozen=True)
class PlaanSnapshot:
    """A point-in-time read of Plaan, with provenance."""

    as_of: datetime
    events: tuple[PlaanEvent, ...]
    fetch_warnings: tuple[str, ...]

    def events_on(self, target_date: date) -> list[PlaanEvent]:
        return [e for e in self.events if e.date == target_date]

    def performances(self) -> list[PlaanEvent]:
        return [e for e in self.events if e.event_type == EventType.PERFORMANCE]

    def rehearsals(self) -> list[PlaanEvent]:
        return [e for e in self.events if e.event_type == EventType.REHEARSAL]


@dataclass(frozen=True)
class ConflictFlag:
    """A detected conflict between opera schedule and a proposed local activity."""

    conflict_type: str
    severity: str
    opera_event: PlaanEvent
    proposed_activity: str
    detail: str

    @property
    def is_hard_block(self) -> bool:
        return self.severity == "hard"

    @property
    def is_advisory(self) -> bool:
        return self.severity == "advisory"


@dataclass(frozen=True)
class CalendarCheckResult:
    """Result of a schedule check. Read-only surface for the dashboard/user."""

    as_of: datetime
    snapshot_age_hours: float
    staleness_warning: str | None
    conflicts: tuple[ConflictFlag, ...]
    fetch_warnings: tuple[str, ...]

    @property
    def has_conflicts(self) -> bool:
        return len(self.conflicts) > 0

    @property
    def has_hard_blocks(self) -> bool:
        return any(c.is_hard_block for c in self.conflicts)
