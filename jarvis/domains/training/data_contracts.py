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


class ReadinessStatus(str, Enum):
    CLEAR = "clear"
    CAUTION = "caution"
    REGRESS = "regress"
    RECOVERY_ONLY = "recovery_only"
    UNCHECKED = "unchecked"


@dataclass(frozen=True)
class BodyAreaDiscomfort:
    knee: int
    ankle: int
    hip: int
    hamstring: int
    calf_achilles: int
    lower_back_pelvic: int

    def __post_init__(self) -> None:
        for value in self.values():
            if isinstance(value, bool) or not isinstance(value, int) or not 0 <= value <= 10:
                raise ValueError("Discomfort scores must be integers between 0 and 10")

    def values(self) -> tuple[int, ...]:
        return (
            self.knee,
            self.ankle,
            self.hip,
            self.hamstring,
            self.calf_achilles,
            self.lower_back_pelvic,
        )


@dataclass(frozen=True)
class ReadinessScan:
    discomfort: BodyAreaDiscomfort
    note: str | None = None
    sharp_pain: bool = False
    limping: bool = False
    next_day_worsening: bool = False


@dataclass(frozen=True)
class CapacityBlockRecommendation:
    key: str
    label: str
    purpose: str
    exercises: tuple[dict, ...]


@dataclass(frozen=True)
class SubstitutionReason:
    area: str
    reason: str
    action: str


@dataclass(frozen=True)
class SessionRoutingResult:
    readiness_status: ReadinessStatus
    readiness_required: bool
    high_neural_allowed: bool
    planned_session: dict
    capacity_blocks: tuple[CapacityBlockRecommendation, ...]
    substitutions: tuple[SubstitutionReason, ...]
    show_jump_balance: bool
    show_recovery_reset: bool
    safety_note: str


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
