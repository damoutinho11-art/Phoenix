from pathlib import Path


LEDGER_CONTENT = (
    Path(__file__).resolve().parents[3]
    / "pwa"
    / "src"
    / "components"
    / "holo"
    / "subs"
    / "LedgerContent.jsx"
)


def _source() -> str:
    return LEDGER_CONTENT.read_text(encoding="utf-8")


def test_ledger_offers_a_manual_record_action_for_each_buy() -> None:
    source = _source()
    assert "SAVE MANUAL RECORD" in source
    assert "postManualFinanceTransaction(" in source


def test_actual_execution_fields_remain_required_user_inputs() -> None:
    source = _source()
    for field in ("amount_eur", "units", "price", "currency", "executed_at"):
        assert f"form.{field}" in source


def test_post_buy_flow_has_preview_and_explicit_apply_safety_copy() -> None:
    source = _source()
    assert "APPLY TO PORTFOLIO STATE" in source
    assert "PREVIEW" in source
    assert "PHOENIX NEVER EXECUTES" in source


def test_post_buy_flow_does_not_present_a_buy_or_execute_button() -> None:
    source = _source()
    assert ">BUY<" not in source
    assert ">EXECUTE<" not in source
