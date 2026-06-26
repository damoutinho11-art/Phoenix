"""Training domain engine — Isiah Rivera Long Conjugate Sequence System."""

from datetime import date, timedelta
from pathlib import Path
from typing import Any

from .data_contracts import (
    CutStatus,
    DunkGoal,
    Phase,
    PlannedSession,
    SessionType,
    TrainingConflict,
    TrainingStatus,
    WorkingWeights,
)

_TRAINING_DOMAIN_DIR = Path(__file__).parent
DEFAULT_CONSTITUTION_PATH = _TRAINING_DOMAIN_DIR / "constitution.json"

_DAY_NAMES = ["monday", "tuesday", "wednesday", "thursday", "friday", "saturday", "sunday"]
_HEAVY_SESSION_TYPES = {SessionType.HIGH_INTENSITY, SessionType.JUMP}

_SESSION_ORDERS: dict[SessionType, list[str]] = {
    SessionType.HIGH_INTENSITY: [
        "knee_extension_isometrics",
        "dynamic_flexibility",
        "barbell_warmup",
        "explosive_lift",
        "knee_extension_lift",
        "posterior_chain",
        "lower_leg",
    ],
    SessionType.GENERAL: [
        "shoulder_rehab",
        "push",
        "pull",
        "shoulder",
    ],
    SessionType.JUMP: [
        "knee_extension_isometrics",
        "dynamic_flexibility",
        "sprint_development_drills",
        "jumps_10_to_100pct",
        "max_effort_approach_jumps",
    ],
    SessionType.ISO_ONLY: ["knee_extension_isometrics"],
    SessionType.REST: [],
    SessionType.DELOAD: [],
    SessionType.PEAK: [
        "knee_extension_isometrics",
        "dynamic_flexibility",
        "jumps_10_to_100pct",
        "max_effort_approach_jumps",
    ],
    SessionType.ATTEMPT: [
        "knee_extension_isometrics",
        "dynamic_flexibility",
        "sprint_development_drills",
        "max_effort_approach_jumps",
    ],
}


def get_current_phase(constitution: dict, today: date) -> tuple[Phase, int]:
    """Returns (phase, week_of_mesocycle) for a given date. Week is 1-4."""
    meso = constitution["mesocycle_progression"]

    for phase_name, phase_enum in [
        ("month_1", Phase.MONTH_1),
        ("month_2", Phase.MONTH_2),
        ("peak", Phase.PEAK),
        ("attempt", Phase.ATTEMPT),
    ]:
        phase_cfg = meso[phase_name]
        start = date.fromisoformat(phase_cfg["start_date"])
        end = date.fromisoformat(phase_cfg["end_date"])
        if start <= today <= end:
            if phase_name in ("peak", "attempt"):
                return phase_enum, 1
            week = (today - start).days // 7 + 1
            return phase_enum, min(week, 4)

    # Before programme start → treat as month_1 week 1
    month_1_start = date.fromisoformat(meso["month_1"]["start_date"])
    if today < month_1_start:
        return Phase.MONTH_1, 1

    # After attempt window → still attempt
    return Phase.ATTEMPT, 1


def get_week_prescription(constitution: dict, phase: Phase, week: int) -> dict[str, Any] | None:
    """Returns sets/reps/intensity dict or None for peak/attempt phases."""
    if phase in (Phase.PEAK, Phase.ATTEMPT):
        return None
    meso = constitution["mesocycle_progression"][phase.value]
    return meso["weeks"].get(str(week))


def _round_to_nearest_2_5(kg: float) -> float:
    return round(kg / 2.5) * 2.5


def calculate_working_weights(constitution: dict, phase: Phase, week: int) -> WorkingWeights:
    """Calculates kg targets from 1RM × intensity%, rounded to nearest 2.5kg."""
    prescription = get_week_prescription(constitution, phase, week)
    if prescription is None:
        raise ValueError(f"No lifting prescription for phase={phase} week={week}")

    meso = constitution["mesocycle_progression"][phase.value]
    one_rms = constitution["estimated_1rm_kg"]
    intensity = prescription["intensity_pct"]
    sets = prescription["sets"]
    reps = prescription["reps"]

    explosive_exercise = meso["explosive_exercise"]
    explosive_kg = _round_to_nearest_2_5(one_rms[explosive_exercise] * intensity / 100)

    knee_exercise = meso["knee_extension"]
    knee_kg = _round_to_nearest_2_5(one_rms[knee_exercise] * intensity / 100)

    posterior_exercise = meso["posterior_chain"]
    posterior_kg = _round_to_nearest_2_5(one_rms[posterior_exercise] * intensity / 100)

    lower_leg_exercise = meso["lower_leg"]
    lower_leg_kg = _round_to_nearest_2_5(one_rms[lower_leg_exercise] * intensity / 100)

    top_set_note = (
        f"Last 2 sets at {intensity}% = {explosive_kg}kg on {explosive_exercise}"
    )

    return WorkingWeights(
        explosive_exercise=explosive_exercise,
        explosive_kg=explosive_kg,
        knee_extension_exercise=knee_exercise,
        knee_extension_kg=knee_kg,
        posterior_chain_exercise=posterior_exercise,
        posterior_chain_kg=posterior_kg,
        lower_leg_exercise=lower_leg_exercise,
        lower_leg_kg=lower_leg_kg,
        sets=sets,
        reps=reps,
        intensity_pct=float(intensity),
        top_set_note=top_set_note,
    )


def get_session_type_for_date(constitution: dict, target_date: date) -> SessionType:
    """Returns SessionType for a date based on day-of-week and current phase."""
    phase, week = get_current_phase(constitution, target_date)
    day = target_date.weekday()  # 0=Mon … 6=Sun

    if phase == Phase.PEAK:
        # Mon/Wed/Sat = PEAK, Fri = REST, others = ISO_ONLY
        if day in (0, 2, 5):
            return SessionType.PEAK
        if day == 4:
            return SessionType.REST
        return SessionType.ISO_ONLY

    if phase == Phase.ATTEMPT:
        # Sat = ATTEMPT, Fri = REST, others = ISO_ONLY
        if day == 5:
            return SessionType.ATTEMPT
        if day == 4:
            return SessionType.REST
        return SessionType.ISO_ONLY

    # Month 1 / Month 2
    day_name = _DAY_NAMES[day]
    base = constitution["weekly_structure"][day_name]

    # Deload week (week 4): skip general days
    if week == 4 and base == "general":
        return SessionType.REST

    _MAP = {
        "high_intensity": SessionType.HIGH_INTENSITY,
        "general": SessionType.GENERAL,
        "rest": SessionType.REST,
        "jump": SessionType.JUMP,
        "iso_only": SessionType.ISO_ONLY,
    }
    return _MAP[base]


def get_session_order(session_type: SessionType, phase: Phase) -> list[str]:
    """Returns ordered exercise groups for a session type."""
    return list(_SESSION_ORDERS.get(session_type, []))


def plan_week_sessions(constitution: dict, week_start: date) -> list[PlannedSession]:
    """Returns 7 PlannedSession objects starting from week_start (Monday)."""
    sessions = []
    for i in range(7):
        target_date = week_start + timedelta(days=i)
        phase, week = get_current_phase(constitution, target_date)
        session_type = get_session_type_for_date(constitution, target_date)
        order = get_session_order(session_type, phase)

        working_weights = None
        if session_type == SessionType.HIGH_INTENSITY:
            try:
                working_weights = calculate_working_weights(constitution, phase, week)
            except Exception:
                pass

        notes: str | None = None
        if session_type in (SessionType.ISO_ONLY, SessionType.PEAK, SessionType.ATTEMPT):
            iso = constitution["iso_protocol"]
            notes = (
                f"Isometrics: {iso['sets']} sets x {iso['duration_seconds']}s "
                f"at {iso['effort_pct']}% effort"
            )

        prescription = get_week_prescription(constitution, phase, week)
        if prescription and prescription.get("deload"):
            deload_note = "Deload week — reduced volume"
            notes = f"{notes} | {deload_note}" if notes else deload_note

        sessions.append(PlannedSession(
            date=target_date,
            session_type=session_type,
            phase=phase,
            week_of_mesocycle=week,
            working_weights=working_weights,
            session_order=order,
            notes=notes,
        ))

    return sessions


def detect_conflicts(
    constitution: dict,
    sessions: list[PlannedSession],
    opera_snapshot_raw: dict | None,
) -> list[TrainingConflict]:
    """Cross-references planned sessions against opera performance events."""
    if not opera_snapshot_raw:
        return []

    events = opera_snapshot_raw.get("events", [])
    performances = [e for e in events if e.get("event_type") == "performance"]
    if not performances:
        return []

    sessions_by_date = {s.date: s for s in sessions}
    heavy_types = {SessionType(t) for t in constitution["heavy_session_types"]}
    conflicts: list[TrainingConflict] = []

    for perf in performances:
        perf_date = date.fromisoformat(perf["date"])
        perf_title = perf.get("title", "Performance")

        # Heavy session ON performance day → hard block
        session_on_day = sessions_by_date.get(perf_date)
        if session_on_day and session_on_day.session_type in heavy_types:
            conflicts.append(TrainingConflict(
                conflict_type="heavy_session_on_performance_day",
                severity="hard",
                training_date=session_on_day.date,
                session_type=session_on_day.session_type,
                opera_event_title=perf_title,
                opera_event_date=perf_date,
                detail=(
                    f"{session_on_day.session_type.value} session on {session_on_day.date} "
                    f"conflicts with {perf_title} on {perf_date}"
                ),
                suggestion="Move to an alternative day or treat as rest day.",
            ))

        # Session DAY BEFORE performance
        day_before = perf_date - timedelta(days=1)
        session_before = sessions_by_date.get(day_before)
        if session_before and session_before.session_type not in (
            SessionType.REST, SessionType.ISO_ONLY
        ):
            if session_before.session_type in heavy_types:
                conflicts.append(TrainingConflict(
                    conflict_type="heavy_session_day_before_performance",
                    severity="hard",
                    training_date=session_before.date,
                    session_type=session_before.session_type,
                    opera_event_title=perf_title,
                    opera_event_date=perf_date,
                    detail=(
                        f"{session_before.session_type.value} session on {session_before.date} "
                        f"is the day before {perf_title} on {perf_date}"
                    ),
                    suggestion="Move to an alternative day or treat as rest day.",
                ))
            else:
                conflicts.append(TrainingConflict(
                    conflict_type="any_session_day_before_performance",
                    severity="advisory",
                    training_date=session_before.date,
                    session_type=session_before.session_type,
                    opera_event_title=perf_title,
                    opera_event_date=perf_date,
                    detail=(
                        f"{session_before.session_type.value} session on {session_before.date} "
                        f"is the day before {perf_title} on {perf_date}"
                    ),
                    suggestion="Consider lighter warm-up only.",
                ))

    return conflicts


def get_fatigue_warning(week_of_mesocycle: int) -> str | None:
    """Returns fatigue advisory for accumulation weeks; None for week 1 and 4."""
    _WARNINGS = {
        2: "Week 2 — fatigue building. Performance may feel slightly off. Expected.",
        3: "Week 3 — peak fatigue. Jumps may feel worse. Fitness is accumulating. Trust the process.",
    }
    return _WARNINGS.get(week_of_mesocycle)


def get_dunk_goal(constitution: dict, today: date) -> DunkGoal:
    deadline = date.fromisoformat(constitution["dunk_deadline"])
    attempt_start = date.fromisoformat(constitution["dunk_attempt_window_start"])
    phase, week = get_current_phase(constitution, today)

    days_to_attempt = (attempt_start - today).days
    days_to_deadline = (deadline - today).days

    return DunkGoal(
        deadline=deadline,
        attempt_window_start=attempt_start,
        days_to_attempt=max(0, days_to_attempt),
        days_to_deadline=max(0, days_to_deadline),
        weeks_to_attempt=max(0.0, days_to_attempt / 7),
        current_phase=phase,
        current_mesocycle_week=week,
        on_track=days_to_attempt >= 0,
    )


def get_cut_status(constitution: dict, today: date) -> CutStatus:
    cut_end = date.fromisoformat(constitution["cut_end_date"])
    active = today <= cut_end
    days_remaining = max(0, (cut_end - today).days)

    bw = constitution["current_bodyweight_kg"]
    bf = constitution["current_bf_percent"]
    target_bf = constitution["target_bf_percent"]

    fat_mass = bw * bf / 100
    target_fat_mass = bw * target_bf / 100
    fat_to_lose = max(0.0, fat_mass - target_fat_mass)

    return CutStatus(
        active=active,
        end_date=cut_end,
        days_remaining=days_remaining,
        current_bodyweight_kg=bw,
        current_bf_pct=bf,
        target_bf_pct=target_bf,
        estimated_fat_to_lose_kg=round(fat_to_lose, 2),
    )


def check_training(
    constitution: dict,
    today: date | None = None,
    opera_snapshot_raw: dict | None = None,
) -> TrainingStatus:
    """Top-level entry point. Assembles full TrainingStatus."""
    if today is None:
        today = date.today()

    phase, week = get_current_phase(constitution, today)
    week_start = today - timedelta(days=today.weekday())
    week_sessions = plan_week_sessions(constitution, week_start)

    today_session = next(
        (s for s in week_sessions if s.date == today),
        week_sessions[0],
    )

    conflicts = detect_conflicts(constitution, week_sessions, opera_snapshot_raw)
    has_hard_conflicts = any(c.severity == "hard" for c in conflicts)

    return TrainingStatus(
        as_of=today,
        dunk_goal=get_dunk_goal(constitution, today),
        cut_status=get_cut_status(constitution, today),
        today_session=today_session,
        week_sessions=tuple(week_sessions),
        conflicts=tuple(conflicts),
        has_hard_conflicts=has_hard_conflicts,
        fatigue_warning=get_fatigue_warning(week),
    )


def get_cross_domain_alerts(
    training_constitution: dict,
    nutrition_constitution: dict,
    opera_snapshot_raw: dict | None,
    today: date | None = None,
) -> list[str]:
    """Surface training, nutrition, and calendar conflicts as plain strings.

    This is a best-effort intelligence layer: malformed or unavailable domain
    data never propagates an exception to its callers.
    """
    alerts: list[str] = []
    try:
        today = today or date.today()
        tomorrow = today + timedelta(days=1)

        week_start = today - timedelta(days=today.weekday())
        sessions = plan_week_sessions(training_constitution, week_start)
        conflicts = detect_conflicts(
            training_constitution,
            sessions,
            opera_snapshot_raw,
        )
        for conflict in conflicts:
            if conflict.severity != "hard":
                continue
            if conflict.training_date not in (today, tomorrow):
                continue
            alerts.append(
                f"⚠ HARD CONFLICT: {conflict.session_type.value} session on "
                f"{conflict.training_date.isoformat()} clashes with "
                f"{conflict.opera_event_title}. Treat as rest day."
            )

        phase, week = get_current_phase(training_constitution, today)
        if get_fatigue_warning(week) is not None:
            alerts.append(
                f"Week {week} fatigue building — jumps may feel worse. "
                "Trust the process."
            )

        attempt_start = date.fromisoformat(
            training_constitution["dunk_attempt_window_start"]
        )
        days_to_attempt = (attempt_start - today).days
        alerts.append(
            f"{days_to_attempt} days to attempt window. "
            f"Phase: {phase.value}, week {week}."
        )

        cut_end = date.fromisoformat(
            nutrition_constitution["phases"]["cut"]["end_date"]
        )
        if today <= cut_end:
            alerts.append(
                f"Cut active: {(cut_end - today).days} days remaining."
            )

        peak_start = date.fromisoformat(training_constitution["peak_week_start"])
        days_to_peak = (peak_start - today).days
        if 0 <= days_to_peak <= 7:
            alerts.append(
                f"Peak week in {days_to_peak} days — reduce volume, "
                "prioritize sleep."
            )
    except Exception:
        pass

    return alerts
