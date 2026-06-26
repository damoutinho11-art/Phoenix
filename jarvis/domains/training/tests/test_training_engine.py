"""Tests for the training domain engine."""

import json
import unittest
from datetime import date
from pathlib import Path

import pytest

from jarvis.domains.training import engine
from jarvis.domains.training.data_contracts import Phase, SessionType, TrainingStatus
from jarvis.domains.training.tests.fixtures import (
    MOCK_OPERA_AUGUST_REHEARSALS,
    MOCK_OPERA_EMPTY,
    MOCK_OPERA_PERFORMANCE_IN_2_DAYS,
    MOCK_OPERA_PERFORMANCE_ON_SUNDAY,
    MOCK_OPERA_PERFORMANCE_TOMORROW,
)

_CONSTITUTION_PATH = Path(__file__).parent.parent / "constitution.json"


def _load_constitution() -> dict:
    with open(_CONSTITUTION_PATH) as f:
        return json.load(f)


CONSTITUTION = _load_constitution()

# Anchor dates (all verified against Gregorian calendar)
# June 23, 2026 = Tuesday (month_1 start)
# July 21, 2026 = Tuesday (month_2 start)
# August 18, 2026 = Tuesday (peak start)
# August 25, 2026 = Tuesday (attempt start)
# June 22, 2026 = Monday (week before month_1 — treated as month_1 wk 1)
# June 29, 2026 = Monday (month_1 week 2 start)
# July 14, 2026 = Tuesday (month_1 week 4 = deload)
# June 27, 2026 = Saturday


# ── Phase detection ──────────────────────────────────────────────────────────

class PhaseDetectionTests(unittest.TestCase):
    def test_phase_is_month_1_on_start_date(self):
        phase, _ = engine.get_current_phase(CONSTITUTION, date(2026, 6, 23))
        assert phase == Phase.MONTH_1

    def test_phase_is_month_2_after_july_21(self):
        phase, _ = engine.get_current_phase(CONSTITUTION, date(2026, 7, 21))
        assert phase == Phase.MONTH_2

    def test_phase_is_peak_after_aug_18(self):
        phase, _ = engine.get_current_phase(CONSTITUTION, date(2026, 8, 18))
        assert phase == Phase.PEAK

    def test_phase_is_attempt_after_aug_25(self):
        phase, _ = engine.get_current_phase(CONSTITUTION, date(2026, 8, 25))
        assert phase == Phase.ATTEMPT

    def test_week_of_mesocycle_correct_in_month_1(self):
        # June 23 = week 1; June 30 = week 2
        _, week = engine.get_current_phase(CONSTITUTION, date(2026, 6, 23))
        assert week == 1
        _, week2 = engine.get_current_phase(CONSTITUTION, date(2026, 6, 30))
        assert week2 == 2

    def test_week_4_is_deload(self):
        # July 14 = 21 days after June 23 → week 4
        _, week = engine.get_current_phase(CONSTITUTION, date(2026, 7, 14))
        assert week == 4
        prescription = engine.get_week_prescription(CONSTITUTION, Phase.MONTH_1, 4)
        assert prescription["deload"] is True


# ── Working weights ──────────────────────────────────────────────────────────

class WorkingWeightTests(unittest.TestCase):
    def test_working_weights_calculated_from_1rm(self):
        ww = engine.calculate_working_weights(CONSTITUTION, Phase.MONTH_1, 1)
        # hex_bar_jump: 40 * 0.75 = 30.0
        assert ww.explosive_kg == 30.0
        assert ww.explosive_exercise == "hex_bar_jump"

    def test_working_weights_rounded_to_nearest_2_5kg(self):
        ww = engine.calculate_working_weights(CONSTITUTION, Phase.MONTH_1, 1)
        # back_squat: 68 * 0.75 = 51.0 → nearest 2.5 = 50.0
        assert ww.knee_extension_kg == 50.0
        assert ww.knee_extension_exercise == "back_squat"

    def test_top_set_note_contains_kg_and_exercise(self):
        ww = engine.calculate_working_weights(CONSTITUTION, Phase.MONTH_1, 1)
        assert "kg" in ww.top_set_note
        assert "hex_bar_jump" in ww.top_set_note
        assert "75" in ww.top_set_note

    def test_month_2_uses_power_clean_not_hex_bar(self):
        ww = engine.calculate_working_weights(CONSTITUTION, Phase.MONTH_2, 1)
        assert ww.explosive_exercise == "power_clean"
        assert "power_clean" in ww.top_set_note

    def test_peak_phase_raises_for_working_weights(self):
        with self.assertRaises(ValueError):
            engine.calculate_working_weights(CONSTITUTION, Phase.PEAK, 1)

    def test_sets_and_reps_correct_for_week(self):
        ww = engine.calculate_working_weights(CONSTITUTION, Phase.MONTH_1, 1)
        assert ww.sets == 5
        assert ww.reps == 6
        ww2 = engine.calculate_working_weights(CONSTITUTION, Phase.MONTH_1, 2)
        assert ww2.sets == 6
        assert ww2.reps == 5


# ── Session types ────────────────────────────────────────────────────────────

class SessionTypeTests(unittest.TestCase):
    def test_monday_is_high_intensity(self):
        # June 29 = Monday, month_1 week 2
        st = engine.get_session_type_for_date(CONSTITUTION, date(2026, 6, 29))
        assert st == SessionType.HIGH_INTENSITY

    def test_saturday_is_jump(self):
        # June 27 = Saturday
        st = engine.get_session_type_for_date(CONSTITUTION, date(2026, 6, 27))
        assert st == SessionType.JUMP

    def test_sunday_is_iso_only(self):
        # June 28 = Sunday
        st = engine.get_session_type_for_date(CONSTITUTION, date(2026, 6, 28))
        assert st == SessionType.ISO_ONLY

    def test_friday_is_rest(self):
        # June 26 = Friday
        st = engine.get_session_type_for_date(CONSTITUTION, date(2026, 6, 26))
        assert st == SessionType.REST

    def test_tuesday_week_4_is_rest_not_general(self):
        # July 14 = Tuesday, month_1 week 4 (deload)
        st = engine.get_session_type_for_date(CONSTITUTION, date(2026, 7, 14))
        assert st == SessionType.REST

    def test_tuesday_non_deload_is_general(self):
        # June 23 = Tuesday, month_1 week 1 (not deload)
        st = engine.get_session_type_for_date(CONSTITUTION, date(2026, 6, 23))
        assert st == SessionType.GENERAL

    def test_peak_monday_is_peak_type(self):
        # Aug 18 = Tuesday (peak start); Aug 17 = Monday
        # Aug 18 = Tuesday → ISO_ONLY; let's find the Monday of peak week
        # Peak: Aug 18-24. Aug 17 is Sunday of prev week.
        # Aug 18 = Tuesday. Aug 24 = Monday.
        # Actually Aug 18, 2026 = Tuesday. So Monday in peak week = Aug 24? No.
        # Aug 18 Tue, 19 Wed, 20 Thu, 21 Fri, 22 Sat, 23 Sun, 24 Mon
        # Hmm, peak is Aug 18-24. Let me check Aug 24 = Monday.
        # Actually the peak week Mon would be Aug 24.
        st = engine.get_session_type_for_date(CONSTITUTION, date(2026, 8, 24))
        assert st == SessionType.PEAK

    def test_attempt_saturday_is_attempt_type(self):
        # Aug 25 = Tuesday (attempt start). Aug 29 = Saturday.
        st = engine.get_session_type_for_date(CONSTITUTION, date(2026, 8, 29))
        assert st == SessionType.ATTEMPT


# ── Session order ────────────────────────────────────────────────────────────

class SessionOrderTests(unittest.TestCase):
    def test_high_intensity_order_correct(self):
        order = engine.get_session_order(SessionType.HIGH_INTENSITY, Phase.MONTH_1)
        assert order[0] == "knee_extension_isometrics"
        assert "explosive_lift" in order
        assert "knee_extension_lift" in order
        assert "posterior_chain" in order
        assert "lower_leg" in order

    def test_jump_day_includes_sprint_drills(self):
        order = engine.get_session_order(SessionType.JUMP, Phase.MONTH_1)
        assert "sprint_development_drills" in order
        assert "max_effort_approach_jumps" in order

    def test_general_day_starts_with_shoulder_rehab(self):
        order = engine.get_session_order(SessionType.GENERAL, Phase.MONTH_1)
        assert order[0] == "shoulder_rehab"
        assert "push" in order
        assert "pull" in order

    def test_rest_day_has_empty_order(self):
        order = engine.get_session_order(SessionType.REST, Phase.MONTH_1)
        assert order == []

    def test_iso_only_is_just_isometrics(self):
        order = engine.get_session_order(SessionType.ISO_ONLY, Phase.MONTH_1)
        assert order == ["knee_extension_isometrics"]

    def test_peak_does_not_include_sprint_drills(self):
        order = engine.get_session_order(SessionType.PEAK, Phase.PEAK)
        assert "sprint_development_drills" not in order
        assert "max_effort_approach_jumps" in order


# ── Conflict detection ───────────────────────────────────────────────────────

class ConflictDetectionTests(unittest.TestCase):
    def _plan_week(self, week_start: date) -> list:
        return engine.plan_week_sessions(CONSTITUTION, week_start)

    def test_high_intensity_on_performance_day_is_hard_block(self):
        # Performance Wednesday June 24 = HIGH_INTENSITY day
        sessions = self._plan_week(date(2026, 6, 22))
        conflicts = engine.detect_conflicts(
            CONSTITUTION, sessions, MOCK_OPERA_PERFORMANCE_IN_2_DAYS
        )
        hard = [c for c in conflicts if c.severity == "hard" and
                c.conflict_type == "heavy_session_on_performance_day"]
        assert len(hard) >= 1
        assert hard[0].training_date == date(2026, 6, 24)

    def test_high_intensity_day_before_performance_is_hard_block(self):
        # Performance Tuesday June 23; Monday June 22 = HIGH_INTENSITY
        sessions = self._plan_week(date(2026, 6, 22))
        conflicts = engine.detect_conflicts(
            CONSTITUTION, sessions, MOCK_OPERA_PERFORMANCE_TOMORROW
        )
        hard = [c for c in conflicts if c.severity == "hard" and
                c.conflict_type == "heavy_session_day_before_performance"]
        assert len(hard) == 1
        assert hard[0].training_date == date(2026, 6, 22)

    def test_jump_day_before_performance_is_hard_block(self):
        # Performance Sunday June 28; Saturday June 27 = JUMP
        sessions = self._plan_week(date(2026, 6, 22))
        conflicts = engine.detect_conflicts(
            CONSTITUTION, sessions, MOCK_OPERA_PERFORMANCE_ON_SUNDAY
        )
        hard = [c for c in conflicts if c.severity == "hard" and
                c.conflict_type == "heavy_session_day_before_performance"]
        assert len(hard) == 1
        assert hard[0].session_type == SessionType.JUMP

    def test_general_day_conflict_is_advisory_not_hard(self):
        # Performance Wednesday June 24; Tuesday June 23 = GENERAL → advisory
        sessions = self._plan_week(date(2026, 6, 22))
        conflicts = engine.detect_conflicts(
            CONSTITUTION, sessions, MOCK_OPERA_PERFORMANCE_IN_2_DAYS
        )
        advisory = [c for c in conflicts if c.severity == "advisory"]
        assert len(advisory) >= 1
        assert advisory[0].conflict_type == "any_session_day_before_performance"
        # Confirm no hard block for Tuesday (GENERAL day)
        hard_for_tuesday = [
            c for c in conflicts
            if c.severity == "hard" and c.training_date == date(2026, 6, 23)
        ]
        assert hard_for_tuesday == []

    def test_no_conflicts_when_opera_empty(self):
        sessions = self._plan_week(date(2026, 6, 22))
        conflicts = engine.detect_conflicts(CONSTITUTION, sessions, MOCK_OPERA_EMPTY)
        assert conflicts == []

    def test_no_conflicts_when_opera_none(self):
        sessions = self._plan_week(date(2026, 6, 22))
        conflicts = engine.detect_conflicts(CONSTITUTION, sessions, None)
        assert conflicts == []

    def test_conflict_has_suggestion(self):
        sessions = self._plan_week(date(2026, 6, 22))
        conflicts = engine.detect_conflicts(
            CONSTITUTION, sessions, MOCK_OPERA_PERFORMANCE_TOMORROW
        )
        assert len(conflicts) > 0
        for c in conflicts:
            assert c.suggestion
            assert len(c.suggestion) > 0

    def test_rehearsal_events_do_not_trigger_hard_blocks(self):
        # August rehearsals should not trigger hard blocks (not performances)
        sessions = self._plan_week(date(2026, 8, 10))
        conflicts = engine.detect_conflicts(
            CONSTITUTION, sessions, MOCK_OPERA_AUGUST_REHEARSALS
        )
        hard = [c for c in conflicts if c.severity == "hard"]
        assert hard == []


# ── Fatigue warnings ─────────────────────────────────────────────────────────

class FatigueWarningTests(unittest.TestCase):
    def test_week_1_no_fatigue_warning(self):
        assert engine.get_fatigue_warning(1) is None

    def test_week_2_fatigue_warning_present(self):
        warning = engine.get_fatigue_warning(2)
        assert warning is not None
        assert "Week 2" in warning
        assert "fatigue" in warning

    def test_week_3_fatigue_warning_present(self):
        warning = engine.get_fatigue_warning(3)
        assert warning is not None
        assert "Week 3" in warning
        assert "Trust the process" in warning

    def test_week_4_no_fatigue_warning(self):
        assert engine.get_fatigue_warning(4) is None


# ── Cut status ───────────────────────────────────────────────────────────────

class CutStatusTests(unittest.TestCase):
    def test_cut_active_before_aug_17(self):
        status = engine.get_cut_status(CONSTITUTION, date(2026, 8, 16))
        assert status.active is True

    def test_cut_active_on_aug_17(self):
        status = engine.get_cut_status(CONSTITUTION, date(2026, 8, 17))
        assert status.active is True

    def test_cut_inactive_after_aug_17(self):
        status = engine.get_cut_status(CONSTITUTION, date(2026, 8, 18))
        assert status.active is False

    def test_fat_to_lose_calculated_correctly(self):
        status = engine.get_cut_status(CONSTITUTION, date(2026, 6, 22))
        # 73.4 * 0.25 = 18.35; 73.4 * 0.19 = 13.946; diff = 4.404 → round(4.404, 2) = 4.4
        assert abs(status.estimated_fat_to_lose_kg - 4.4) < 0.01

    def test_cut_days_remaining_positive_before_end(self):
        status = engine.get_cut_status(CONSTITUTION, date(2026, 6, 22))
        assert status.days_remaining > 0

    def test_cut_days_remaining_zero_after_end(self):
        status = engine.get_cut_status(CONSTITUTION, date(2026, 9, 1))
        assert status.days_remaining == 0


# ── Full check_training ──────────────────────────────────────────────────────

class FullCheckTrainingTests(unittest.TestCase):
    def test_check_training_returns_training_status(self):
        result = engine.check_training(CONSTITUTION, today=date(2026, 6, 22))
        assert isinstance(result, TrainingStatus)

    def test_today_session_correct_type(self):
        # June 22 = Monday → HIGH_INTENSITY
        result = engine.check_training(CONSTITUTION, today=date(2026, 6, 22))
        assert result.today_session.session_type == SessionType.HIGH_INTENSITY

    def test_week_sessions_has_7_entries(self):
        result = engine.check_training(CONSTITUTION, today=date(2026, 6, 22))
        assert len(result.week_sessions) == 7

    def test_has_hard_conflicts_when_performance_on_session_day(self):
        result = engine.check_training(
            CONSTITUTION,
            today=date(2026, 6, 22),
            opera_snapshot_raw=MOCK_OPERA_PERFORMANCE_TOMORROW,
        )
        assert result.has_hard_conflicts is True

    def test_no_hard_conflicts_when_no_opera(self):
        result = engine.check_training(CONSTITUTION, today=date(2026, 6, 22))
        assert result.has_hard_conflicts is False

    def test_today_session_has_working_weights_on_high_intensity_day(self):
        # Monday June 22 → HIGH_INTENSITY → working weights present
        result = engine.check_training(CONSTITUTION, today=date(2026, 6, 22))
        assert result.today_session.working_weights is not None

    def test_dunk_goal_on_track_before_attempt_window(self):
        result = engine.check_training(CONSTITUTION, today=date(2026, 6, 22))
        assert result.dunk_goal.on_track is True
        assert result.dunk_goal.days_to_attempt > 0
