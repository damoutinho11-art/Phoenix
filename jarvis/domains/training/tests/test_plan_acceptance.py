import json
from dataclasses import replace
from datetime import date, timedelta
from pathlib import Path

import pytest

import jarvis.domains.training.plan_acceptance as acceptance_module
from jarvis.domains.training.adaptive_planner import PlanningSnapshot, generate_weekly_plan
from jarvis.domains.training.plan_acceptance import (
    REQUIRED_FIXTURE_CATEGORIES,
    decode_training_evidence_receipts,
    evaluate_training_shadow,
    replay_training_plan,
    training_planner_acceptance_status,
    training_planner_mode,
)
from jarvis.domains.training.plan_contracts import (
    PlanValidation,
    TrainingConstraint,
    WeeklyPlanReceipt,
)


@pytest.fixture
def training_constitution():
    path = Path(__file__).parent.parent / "constitution.json"
    return json.loads(path.read_text(encoding="utf-8"))


def _snapshot(week_start: date, **overrides) -> PlanningSnapshot:
    values = {
        "week_start": week_start,
        "created_at": f"{week_start.isoformat()}T06:00:00Z",
        "completed_sessions": (),
        "readiness": None,
        "calendar_events": (),
        "progression": {},
        "equipment": ("barbell", "rack", "hex_bar", "bench"),
        "preferences": (),
        "safety_blocks": (),
    }
    values.update(overrides)
    return PlanningSnapshot(**values)


def _scenario_receipt(constitution, category: str, week_start: date) -> WeeklyPlanReceipt:
    snapshot = _snapshot(week_start)
    constraints = ()
    if category == "move":
        constraints = (
            TrainingConstraint.from_mapping(
                "move_session",
                "user",
                {
                    "source_date": week_start.isoformat(),
                    "target_date": (week_start + timedelta(days=1)).isoformat(),
                },
            ),
        )
    elif category == "skip":
        constraints = (
            TrainingConstraint.from_mapping(
                "skip_session", "user", {"date": week_start.isoformat()}
            ),
        )
    elif category == "equipment-limited":
        constraints = (
            TrainingConstraint.from_mapping(
                "equipment_available",
                "user",
                {
                    "date": week_start.isoformat(),
                    "equipment": ("barbell", "seated_calf_raise"),
                },
            ),
        )
    elif category == "fatigue-reduced":
        snapshot = replace(
            snapshot,
            progression={
                "Bench Press": {
                    "suggested_kg": 55,
                    "basis": "Two consecutive misses require a deload.",
                    "deload": True,
                }
            },
        )
    elif category == "calendar-blocked":
        snapshot = replace(
            snapshot,
            calendar_events=(
                {
                    "event_type": "performance",
                    "date": (week_start + timedelta(days=2)).isoformat(),
                },
            ),
        )
    elif category == "pain-blocked":
        snapshot = replace(
            snapshot,
            readiness={"pain": True, "knee": 5, "sharp_pain": True},
            safety_blocks=("knee",),
        )
    else:
        raise AssertionError(f"Unknown scenario: {category}")
    return generate_weekly_plan(constitution, snapshot, constraints)


def _required_receipts(constitution) -> list[dict]:
    return [
        _scenario_receipt(
            constitution,
            category,
            date(2026, 7, 20) + timedelta(weeks=index),
        ).to_mapping()
        for index, category in enumerate(REQUIRED_FIXTURE_CATEGORIES)
    ]


def _with_receipt_values(receipt: WeeklyPlanReceipt, **overrides) -> WeeklyPlanReceipt:
    values = {
        "parent_plan_id": receipt.parent_plan_id,
        "constitution_version": receipt.constitution_version,
        "planner_version": receipt.planner_version,
        "cycle_id": receipt.cycle_id,
        "days": receipt.days,
        "constraints": receipt.constraints,
        "validations": receipt.validations,
        "replay_inputs": receipt.replay_inputs,
        "created_at": receipt.created_at,
        "status": receipt.status,
    }
    values.update(overrides)
    return WeeklyPlanReceipt.create(**values)


def test_serialized_plan_reruns_actual_planner_to_identical_identities(
    monkeypatch, training_constitution
):
    receipt = _scenario_receipt(training_constitution, "move", date(2026, 7, 20))
    active = _with_receipt_values(receipt, status="active")
    calls = []
    real_generate = acceptance_module.generate_weekly_plan

    def spy(constitution, snapshot, constraints=()):
        calls.append((constitution, snapshot, tuple(constraints)))
        return real_generate(constitution, snapshot, constraints)

    monkeypatch.setattr(acceptance_module, "generate_weekly_plan", spy)

    replayed = replay_training_plan(json.loads(json.dumps(active.to_mapping())))

    assert len(calls) == 1
    assert calls[0][1] == active.replay_inputs.snapshot
    assert calls[0][2] == active.replay_inputs.constraints
    assert replayed.plan_id == active.plan_id
    assert replayed.input_hash == active.input_hash
    assert replayed.receipt_hash == active.receipt_hash


def test_replay_rejects_legacy_receipt_without_replay_inputs(training_constitution):
    serialized = _scenario_receipt(
        training_constitution, "move", date(2026, 7, 20)
    ).to_mapping()
    serialized.pop("replay_inputs")

    with pytest.raises(ValueError, match="replay inputs"):
        replay_training_plan(serialized)


def test_replay_rejects_tampered_canonical_inputs(training_constitution):
    serialized = _scenario_receipt(
        training_constitution, "move", date(2026, 7, 20)
    ).to_mapping()
    serialized["replay_inputs"]["snapshot"]["readiness"] = {"knee": 4}

    with pytest.raises(ValueError, match="identity|replay"):
        replay_training_plan(serialized)


def test_replay_rejects_resigned_output_not_generated_from_inputs(training_constitution):
    receipt = _scenario_receipt(training_constitution, "move", date(2026, 7, 20))
    tampered_day = replace(receipt.days[0], objective="self_attested_output")
    resigned = _with_receipt_values(
        receipt,
        days=(tampered_day, *receipt.days[1:]),
    )

    with pytest.raises(ValueError, match="planner replay"):
        replay_training_plan(resigned.to_mapping())


def test_replay_rejects_planner_drift_or_nondeterminism(
    monkeypatch, training_constitution
):
    receipt = _scenario_receipt(training_constitution, "move", date(2026, 7, 20))
    real_generate = acceptance_module.generate_weekly_plan

    def drifted_generate(constitution, snapshot, constraints=()):
        generated = real_generate(constitution, snapshot, constraints)
        drifted_day = replace(generated.days[-1], objective="drifted")
        return _with_receipt_values(
            generated,
            days=(*generated.days[:-1], drifted_day),
        )

    monkeypatch.setattr(
        acceptance_module,
        "generate_weekly_plan",
        drifted_generate,
    )

    with pytest.raises(ValueError, match="planner replay"):
        replay_training_plan(receipt.to_mapping())


def test_shadow_gate_infers_real_fixture_behavior_and_ignores_caller_labels(
    training_constitution,
):
    receipts = _required_receipts(training_constitution)
    for receipt in receipts:
        receipt["fixture_category"] = "caller-controlled-lie"
        receipt["side_effects"] = {"direct_execution_count": 999}

    result = evaluate_training_shadow(receipts)

    assert result["accepted"] is True
    assert result["fixture_summary"] == {
        category: 1 for category in REQUIRED_FIXTURE_CATEGORIES
    }
    assert result["side_effect_proof"]["passed"] is True
    assert result["side_effect_proof"]["replay_count"] == 6
    assert all(
        row["input_hash_before"] == row["input_hash_after"]
        for row in result["side_effect_proof"]["immutable_inputs"]
    )


def test_caller_labels_cannot_fake_required_fixture_coverage(training_constitution):
    receipts = []
    for index, label in enumerate(REQUIRED_FIXTURE_CATEGORIES):
        receipt = _scenario_receipt(
            training_constitution,
            "move",
            date(2026, 9, 7) + timedelta(weeks=index),
        ).to_mapping()
        receipt["fixture_category"] = label
        receipts.append(receipt)

    result = evaluate_training_shadow(receipts)

    assert result["accepted"] is False
    assert result["fixture_summary"] == {"move": 6}
    assert "fixture_coverage" in result["reasons"]


def test_shadow_gate_emits_exact_proposal_identity_allowlist(training_constitution):
    receipts = _required_receipts(training_constitution)

    result = evaluate_training_shadow(receipts)

    assert result["accepted_proposals"] == sorted(
        [
            {
                "plan_id": receipt["plan_id"],
                "planner_version": receipt["planner_version"],
                "constitution_version": receipt["constitution_version"],
                "input_hash": receipt["input_hash"],
                "receipt_hash": receipt["receipt_hash"],
            }
            for receipt in receipts
        ],
        key=lambda row: row["plan_id"],
    )
    assert decode_training_evidence_receipts(result) == sorted(
        receipts, key=lambda row: row["plan_id"]
    )
    assert len(json.dumps(result)) < 32767


def test_shadow_gate_rejects_non_current_constitution(training_constitution):
    stale_constitution = json.loads(json.dumps(training_constitution))
    stale_constitution["version"] = "0"
    receipts = _required_receipts(training_constitution)
    receipts[0] = _scenario_receipt(
        stale_constitution, "move", date(2026, 7, 20)
    ).to_mapping()

    result = evaluate_training_shadow(receipts)

    assert result["accepted"] is False
    assert "version_mismatch" in result["reasons"]


def test_shadow_gate_rejects_failed_pure_replay_boundary_audit(
    training_constitution, monkeypatch
):
    monkeypatch.setattr(
        acceptance_module,
        "_source_side_effect_audit",
        lambda: ({"planner.py": "source-hash"}, ["planner.py:call:commit"]),
    )

    result = evaluate_training_shadow(_required_receipts(training_constitution))

    assert result["accepted"] is False
    assert result["side_effect_proof"]["passed"] is False
    assert "side_effect_proof_failed" in result["reasons"]


def test_acceptance_status_recomputes_complete_evidence(training_constitution, monkeypatch):
    evidence = evaluate_training_shadow(_required_receipts(training_constitution))
    monkeypatch.setenv(
        "PHOENIX_TRAINING_PLANNER_ACCEPTANCE_JSON",
        json.dumps(evidence),
    )

    status = training_planner_acceptance_status()

    assert status["accepted"] is True
    assert status["evidence_id"] == evidence["evidence_id"]
    assert status["accepted_proposals"] == evidence["accepted_proposals"]


@pytest.mark.parametrize(
    "tamper",
    (
        lambda evidence: evidence.update(accepted=False),
        lambda evidence: evidence["fixture_summary"].update(move=99),
        lambda evidence: evidence["accepted_proposals"].pop(),
        lambda evidence: evidence["side_effect_proof"].update(passed=False),
        lambda evidence: evidence.update(evidence_id="attacker-supplied"),
        lambda evidence: evidence["receipt_bundle"].update(payload="tampered"),
    ),
)
def test_acceptance_status_rejects_any_tampered_evidence(
    training_constitution, monkeypatch, tamper
):
    evidence = evaluate_training_shadow(_required_receipts(training_constitution))
    tamper(evidence)
    monkeypatch.setenv(
        "PHOENIX_TRAINING_PLANNER_ACCEPTANCE_JSON",
        json.dumps(evidence),
    )

    status = training_planner_acceptance_status()

    assert status["accepted"] is False
    assert "evidence_recompute_failed" in status["reasons"]


@pytest.mark.parametrize("passed", (0, 1, "true", None, [], {}))
def test_shadow_gate_rejects_malformed_hard_validation_rows(
    training_constitution, passed
):
    receipt = _scenario_receipt(training_constitution, "move", date(2026, 7, 20))
    malformed = tuple(
        PlanValidation(row.rule, passed, row.severity, row.detail)
        if row.severity == "hard"
        else row
        for row in receipt.validations
    )
    signed = _with_receipt_values(receipt, validations=malformed).to_mapping()

    result = evaluate_training_shadow([signed])

    assert result["accepted"] is False
    assert "malformed_validations" in result["reasons"]


def test_shadow_gate_rejects_empty_validation_set(training_constitution):
    receipt = _scenario_receipt(training_constitution, "move", date(2026, 7, 20))
    signed = _with_receipt_values(receipt, validations=()).to_mapping()

    result = evaluate_training_shadow([signed])

    assert result["accepted"] is False
    assert "malformed_validations" in result["reasons"]


def test_shadow_gate_requires_all_expected_hard_rules(training_constitution):
    receipt = _scenario_receipt(training_constitution, "move", date(2026, 7, 20))
    validations = tuple(
        row for row in receipt.validations if row.rule != "pain_block"
    )
    signed = _with_receipt_values(receipt, validations=validations).to_mapping()

    result = evaluate_training_shadow([signed])

    assert result["accepted"] is False
    assert "malformed_validations" in result["reasons"]


def test_shadow_gate_rejects_multiple_plans_for_one_cycle(training_constitution):
    receipts = _required_receipts(training_constitution)
    same_cycle = date(2026, 7, 20)
    receipts[1] = _scenario_receipt(
        training_constitution, "skip", same_cycle
    ).to_mapping()

    result = evaluate_training_shadow(receipts)

    assert result["accepted"] is False
    assert "multiple_plans_per_cycle" in result["reasons"]


def test_training_planner_mode_defaults_and_fails_closed_to_shadow(monkeypatch):
    monkeypatch.delenv("PHOENIX_TRAINING_PLANNER_MODE", raising=False)
    assert training_planner_mode() == "shadow"

    monkeypatch.setenv("PHOENIX_TRAINING_PLANNER_MODE", "LIVE")
    assert training_planner_mode() == "shadow"

    monkeypatch.setenv("PHOENIX_TRAINING_PLANNER_MODE", "live")
    assert training_planner_mode() == "live"


@pytest.mark.parametrize("raw", (None, "not-json", "{}", "[]"))
def test_acceptance_status_fails_closed_without_recomputable_evidence(monkeypatch, raw):
    if raw is None:
        monkeypatch.delenv("PHOENIX_TRAINING_PLANNER_ACCEPTANCE_JSON", raising=False)
    else:
        monkeypatch.setenv("PHOENIX_TRAINING_PLANNER_ACCEPTANCE_JSON", raw)

    assert training_planner_acceptance_status()["accepted"] is False
