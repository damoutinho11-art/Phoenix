"""UI contract for the post-buy flow: Phoenix records trades, it never places them.

This used to read `pwa/src/components/finance/WeeklyBrief.jsx`. That screen was
removed when the Holo control room took over finance, and the test kept pointing
at the deleted path — so it failed on a missing file rather than on the contract
it exists to protect. It now reads the components that actually render the flow.
"""

from pathlib import Path

_PWA = Path(__file__).resolve().parents[3] / "pwa" / "src" / "components" / "holo"
LEDGER = _PWA / "subs" / "LedgerContent.jsx"
CONTROL_ROOM = _PWA / "subs" / "FinanceControlRoom.jsx"
CHECKLIST = _PWA / "subs" / "FinanceSubs.jsx"


def _source(path: Path) -> str:
    assert path.exists(), f"post-buy flow moved again: {path} is missing"
    return path.read_text(encoding="utf-8")


def test_ledger_offers_recording_a_buy_the_user_already_placed() -> None:
    source = _source(LEDGER)
    assert "RECORD A BUY YOU PLACED" in source
    assert "SAVE MANUAL RECORD" in source


def test_actual_execution_fields_remain_required_user_inputs() -> None:
    """Price, size and date come from the broker, so the user must supply them."""
    source = _source(LEDGER)
    for field in ("amount_eur", "units", "price", "currency", "executed_at"):
        assert f"form.{field}" in source, f"{field} is no longer a user-entered field"


def test_recording_requires_the_execution_details_before_saving() -> None:
    source = _source(LEDGER)
    for field in ("amount_eur", "units", "price"):
        assert f"num(form.{field}) > 0" in source, f"{field} is no longer validated"
    assert "form.platform.trim()" in source


def test_post_buy_flow_has_preview_and_explicit_apply() -> None:
    """Portfolio state changes only on a second, deliberate confirmation."""
    source = _source(LEDGER)
    assert "APPLY TO PORTFOLIO STATE — PREVIEW" in source
    assert "CONFIRM APPLY" in source


def test_post_buy_flow_states_that_phoenix_never_executes() -> None:
    assert "PHOENIX NEVER EXECUTES" in _source(LEDGER)
    assert "never executes orders" in _source(CONTROL_ROOM)
    assert "YOU BUY IN BROKER" in _source(CHECKLIST)


def test_post_buy_flow_does_not_present_a_buy_or_execute_button() -> None:
    for path in (LEDGER, CONTROL_ROOM):
        source = _source(path)
        assert ">BUY<" not in source, f"{path.name} renders a buy button"
        assert ">EXECUTE<" not in source, f"{path.name} renders an execute button"
