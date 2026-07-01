import pytest

from jarvis.domains.training.data_contracts import (
    BodyAreaDiscomfort,
    ReadinessScan,
    ReadinessStatus,
)
from jarvis.domains.training.joint_capacity import (
    JUMP_PLANTS,
    SQUAT_BALANCE_ZONES,
    classify_readiness,
    route_session,
)


def scan(score: int = 0, **overrides) -> ReadinessScan:
    values = {
        "knee": score,
        "ankle": score,
        "hip": score,
        "hamstring": score,
        "calf_achilles": score,
        "lower_back_pelvic": score,
    }
    values.update(overrides.pop("scores", {}))
    return ReadinessScan(discomfort=BodyAreaDiscomfort(**values), **overrides)


@pytest.mark.parametrize(
    ("value", "expected"),
    [
        (0, ReadinessStatus.CLEAR),
        (2, ReadinessStatus.CLEAR),
        (3, ReadinessStatus.CAUTION),
        (4, ReadinessStatus.CAUTION),
        (5, ReadinessStatus.REGRESS),
        (6, ReadinessStatus.REGRESS),
        (7, ReadinessStatus.RECOVERY_ONLY),
        (10, ReadinessStatus.RECOVERY_ONLY),
    ],
)
def test_classifies_readiness_thresholds(value, expected):
    assert classify_readiness(scan(value)) is expected


def test_missing_scan_is_unchecked():
    assert classify_readiness(None) is ReadinessStatus.UNCHECKED


@pytest.mark.parametrize("flag", ["sharp_pain", "limping", "next_day_worsening"])
def test_conservative_observation_overrides_low_scores(flag):
    assert classify_readiness(scan(0, **{flag: True})) is ReadinessStatus.RECOVERY_ONLY


def test_body_scores_must_be_between_zero_and_ten():
    with pytest.raises(ValueError, match="0 and 10"):
        BodyAreaDiscomfort(11, 0, 0, 0, 0, 0)


def test_squat_balance_has_exactly_six_capacity_zones():
    assert set(SQUAT_BALANCE_ZONES) == {
        "ankle_extension",
        "ankle_flexion",
        "knee_extension",
        "knee_flexion",
        "hip_extension",
        "hip_flexion",
    }


def test_jump_balance_supports_four_plants():
    assert set(JUMP_PLANTS) == {
        "one_foot_left",
        "one_foot_right",
        "two_foot_left_right",
        "two_foot_right_left",
    }


def test_unchecked_high_neural_session_is_gated_with_conservative_prep():
    result = route_session({"session_type": "jump", "exercises": [{"name": "Max jumps"}]}, None)
    assert result.readiness_status is ReadinessStatus.UNCHECKED
    assert result.readiness_required is True
    assert result.high_neural_allowed is False
    assert any(block.key == "sled_balance" for block in result.capacity_blocks)
    assert result.show_jump_balance is False


def test_caution_keeps_session_and_adds_targeted_reduction():
    result = route_session(
        {"session_type": "high_intensity", "exercises": []},
        scan(0, scores={"knee": 4}),
    )
    assert result.readiness_status is ReadinessStatus.CAUTION
    assert result.high_neural_allowed is True
    assert any("range/load" in item.action for item in result.substitutions)


def test_regress_removes_max_lower_body_exposure():
    result = route_session(
        {"session_type": "jump", "exercises": []},
        scan(0, scores={"hamstring": 6}),
    )
    assert result.readiness_status is ReadinessStatus.REGRESS
    assert result.high_neural_allowed is False
    assert any("sprinting" in item.action for item in result.substitutions)


def test_recovery_reset_only_appears_for_allowed_conditions():
    high_clear = route_session({"session_type": "high_intensity"}, scan(0))
    rest_clear = route_session({"session_type": "rest"}, scan(0))
    high_elevated = route_session({"session_type": "high_intensity"}, scan(7))
    explicit = route_session({"session_type": "general"}, scan(0), explicit_reset=True)
    assert high_clear.show_recovery_reset is False
    assert rest_clear.show_recovery_reset is True
    assert high_elevated.show_recovery_reset is True
    assert explicit.show_recovery_reset is True


def test_jump_balance_is_for_jump_day_with_clear_readiness():
    assert route_session({"session_type": "jump"}, scan(0)).show_jump_balance is True
    assert route_session({"session_type": "jump"}, scan(5)).show_jump_balance is False
    assert route_session({"session_type": "general"}, scan(0)).show_jump_balance is False


def test_capacity_copy_contains_no_medical_or_marketing_claims():
    result = route_session({"session_type": "jump"}, scan(3))
    text = repr(result).lower()
    for forbidden in (
        "bulletproof",
        "heal your",
        "safe for everyone",
        "push through pain",
        "guaranteed",
        "fix pelvic tilt",
    ):
        assert forbidden not in text
    assert "performance guidance, not a diagnosis" in text
