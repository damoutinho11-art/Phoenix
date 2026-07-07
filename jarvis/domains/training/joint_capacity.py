"""Deterministic readiness and joint-capacity routing for Long Conjugate."""

from jarvis.domains.training.data_contracts import (
    CapacityBlockRecommendation,
    ReadinessScan,
    ReadinessStatus,
    SessionRoutingResult,
    SubstitutionReason,
)

HIGH_NEURAL_SESSIONS = frozenset({"high_intensity", "jump", "peak", "attempt"})

SQUAT_BALANCE_ZONES = {
    "ankle_extension": ("Calf raise", "Controlled pogo capacity"),
    "ankle_flexion": ("Tibialis raise", "Backward walking or sled"),
    "knee_extension": ("Split squat", "Backward step-up", "Squat"),
    "knee_flexion": ("Nordic curl regression", "Hamstring or slider curl"),
    "hip_extension": ("Hinge", "Glute bridge or hip thrust", "Good morning"),
    "hip_flexion": ("Hip flexor raise", "Controlled knee drive"),
}

JUMP_PLANTS = (
    "one_foot_left",
    "one_foot_right",
    "two_foot_left_right",
    "two_foot_right_left",
)

SLED_BALANCE = CapacityBlockRecommendation(
    key="sled_balance",
    label="Sled Balance",
    purpose="Lower-leg preparation, blood flow, and progressive knee/ankle exposure.",
    exercises=(
        {"name": "Forward sled — long steps", "dose": "2 controlled lengths"},
        {"name": "Backward sled — quick steps", "dose": "2 controlled lengths"},
        {"name": "Backward treadmill", "dose": "Easy alternative"},
        {"name": "Knee-over-toe calf raise", "dose": "Controlled alternative"},
        {"name": "Backward step-up", "dose": "Low-range alternative"},
    ),
)

SQUAT_BALANCE = CapacityBlockRecommendation(
    key="squat_balance",
    label="Squat Balance",
    purpose="Balanced lower-body capacity across six movement zones.",
    exercises=tuple(
        {"zone": zone, "options": options} for zone, options in SQUAT_BALANCE_ZONES.items()
    ),
)

PELVIC_CONTROL = CapacityBlockRecommendation(
    key="pelvic_control",
    label="Pelvic Control",
    purpose="Coordinate rib-pelvis position, trunk control, and hip function without diagnosis.",
    exercises=(
        {"name": "Dead bug", "cue": "Keep ribs and pelvis controlled"},
        {"name": "Couch stretch", "cue": "Use a comfortable hip-flexor range"},
        {"name": "Glute bridge", "cue": "Controlled hip extension"},
        {"name": "Hip flexor raise", "cue": "Slow knee drive"},
        {"name": "Split squat", "cue": "Keep rib-pelvis control; do not force depth"},
    ),
)

RECOVERY_RESET = CapacityBlockRecommendation(
    key="recovery_reset",
    label="Recovery Reset",
    purpose="A calm, low-intensity reset with no jumps, sprints, or heavy lower-body work.",
    exercises=(
        {"name": "Easy backward walk or light sled", "dose": "5–8 minutes"},
        {"name": "Gentle lower-leg work", "dose": "Controlled"},
        {"name": "Dead bug and breathing", "dose": "2 easy sets"},
        {"name": "Hip mobility", "dose": "Comfortable range"},
        {"name": "Low-intensity bridge or slider curl", "dose": "2 easy sets"},
    ),
)

JUMP_BALANCE = CapacityBlockRecommendation(
    key="jump_balance",
    label="Jump Balance",
    purpose="Controlled plant-pattern skill practice; start with one quality rep and progress slowly.",
    exercises=tuple(
        {"plant": plant, "quality_rep_cap": 10} for plant in JUMP_PLANTS
    ),
)


def classify_readiness(scan: ReadinessScan | None) -> ReadinessStatus:
    if scan is None:
        return ReadinessStatus.UNCHECKED
    if scan.sharp_pain or scan.limping or scan.next_day_worsening:
        return ReadinessStatus.RECOVERY_ONLY
    peak = max(scan.discomfort.values())
    if peak >= 7:
        return ReadinessStatus.RECOVERY_ONLY
    if peak >= 5:
        return ReadinessStatus.REGRESS
    if peak >= 3:
        return ReadinessStatus.CAUTION
    return ReadinessStatus.CLEAR


def _elevated_areas(scan: ReadinessScan | None, threshold: int = 3) -> list[tuple[str, int]]:
    if scan is None:
        return []
    fields = (
        "knee", "ankle", "hip", "hamstring", "calf_achilles", "lower_back_pelvic"
    )
    return [
        (name, getattr(scan.discomfort, name))
        for name in fields
        if getattr(scan.discomfort, name) >= threshold
    ]


def _substitution(area: str, status: ReadinessStatus) -> SubstitutionReason:
    actions = {
        "knee": "Reduce knee range/load; use Sled Balance and remove max jumps.",
        "ankle": "Reduce plyometric and sprint exposure; use controlled lower-leg preparation.",
        "calf_achilles": "Reduce plyometric and sprint exposure; use controlled lower-leg preparation.",
        "hamstring": "Remove max sprinting; reduce hinge/Nordic intensity and use a controlled posterior-chain option.",
        "hip": "Reduce heavy axial loading and aggressive split-squat depth; add Pelvic Control.",
        "lower_back_pelvic": "Reduce heavy axial loading and aggressive split-squat depth; add Pelvic Control.",
    }
    action = actions[area]
    if status is ReadinessStatus.CAUTION:
        action = f"Reduce range/load today. {action}"
    return SubstitutionReason(
        area=area,
        reason=f"{area.replace('_', ' ')} readiness is elevated.",
        action=action,
    )


def route_session(
    session: dict,
    scan: ReadinessScan | None,
    *,
    explicit_reset: bool = False,
) -> SessionRoutingResult:
    status = classify_readiness(scan)
    session_type = session.get("session_type", "rest")
    high_neural = session_type in HIGH_NEURAL_SESSIONS
    high_neural_allowed = not high_neural or status in {
        ReadinessStatus.CLEAR,
        ReadinessStatus.CAUTION,
    }
    substitutions = tuple(_substitution(area, status) for area, _ in _elevated_areas(scan))
    show_reset = (
        explicit_reset
        or session_type == "rest"
        or status is ReadinessStatus.RECOVERY_ONLY
        or bool(scan and scan.next_day_worsening)
    )

    blocks: list[CapacityBlockRecommendation] = []
    if show_reset:
        blocks.append(RECOVERY_RESET)
    else:
        blocks.extend((SLED_BALANCE, SQUAT_BALANCE, PELVIC_CONTROL))
        if session_type == "jump" and status is ReadinessStatus.CLEAR:
            blocks.append(JUMP_BALANCE)

    safety = "This is performance guidance, not a diagnosis."
    if scan and (scan.sharp_pain or scan.limping or scan.next_day_worsening):
        safety += " Stop and regress; persistent pain should be assessed by a qualified professional."
    elif status in {ReadinessStatus.CAUTION, ReadinessStatus.REGRESS}:
        safety += " Keep this controlled and pain-free."

    return SessionRoutingResult(
        readiness_status=status,
        readiness_required=high_neural and status is ReadinessStatus.UNCHECKED,
        high_neural_allowed=high_neural_allowed,
        planned_session=session,
        capacity_blocks=tuple(blocks),
        substitutions=substitutions,
        show_jump_balance=session_type == "jump" and status is ReadinessStatus.CLEAR,
        show_recovery_reset=show_reset,
        safety_note=safety,
    )
