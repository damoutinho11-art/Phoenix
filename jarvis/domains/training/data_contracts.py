from dataclasses import dataclass
from datetime import date
from enum import Enum


class SessionType(str, Enum):
    HIGH_INTENSITY = "high_intensity"
    GENERAL = "general"
    JUMP = "jump"
    ISO_ONLY = "iso_only"
    REST = "rest"
    DELOAD = "deload"
    PEAK = "peak"
    ATTEMPT = "attempt"


class Phase(str, Enum):
    MONTH_1 = "month_1"
    MONTH_2 = "month_2"
    PEAK = "peak"
    ATTEMPT = "attempt"


@dataclass(frozen=True)
class WorkingWeights:
    explosive_exercise: str
    explosive_kg: float
    knee_extension_exercise: str
    knee_extension_kg: float
    posterior_chain_exercise: str
    posterior_chain_kg: float
    lower_leg_exercise: str
    lower_leg_kg: float
    sets: int
    reps: int
    intensity_pct: float
    top_set_note: str


@dataclass(frozen=True)
class PlannedSession:
    date: date
    session_type: SessionType
    phase: Phase
    week_of_mesocycle: int
    working_weights: WorkingWeights | None
    session_order: list[str]
    notes: str | None


@dataclass(frozen=True)
class DunkGoal:
    deadline: date
    attempt_window_start: date
    days_to_attempt: int
    days_to_deadline: int
    weeks_to_attempt: float
    current_phase: Phase
    current_mesocycle_week: int
    on_track: bool


@dataclass(frozen=True)
class CutStatus:
    active: bool
    end_date: date
    days_remaining: int
    current_bodyweight_kg: float
    current_bf_pct: float
    target_bf_pct: float
    estimated_fat_to_lose_kg: float


@dataclass(frozen=True)
class TrainingConflict:
    conflict_type: str
    severity: str
    training_date: date
    session_type: SessionType
    opera_event_title: str
    opera_event_date: date
    detail: str
    suggestion: str


@dataclass(frozen=True)
class TrainingStatus:
    as_of: date
    dunk_goal: DunkGoal
    cut_status: CutStatus
    today_session: PlannedSession
    week_sessions: tuple[PlannedSession, ...]
    conflicts: tuple[TrainingConflict, ...]
    has_hard_conflicts: bool
    fatigue_warning: str | None
