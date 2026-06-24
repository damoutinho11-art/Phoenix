"""Universal JARVIS conversational endpoint. All domains, one POST."""

import json
from datetime import date
from pathlib import Path

import anthropic
from fastapi import APIRouter
from pydantic import BaseModel

from jarvis.data import database
from jarvis.domains.calendar import engine as calendar_engine
from jarvis.domains.calendar.tests.fixtures import LIVE_SNAPSHOT_RAW
from jarvis.domains.finance import engine as finance_engine
from jarvis.domains.nutrition import engine as nutrition_engine
from jarvis.domains.training import engine as training_engine

router = APIRouter()

_CRYPTO_ASSETS = {"btc", "hype", "tao"}

_NUTRITION_CONSTITUTION_PATH = (
    Path(__file__).parent.parent.parent / "domains" / "nutrition" / "constitution.json"
)

_SYSTEM_PROMPT = """\
You are J.A.R.V.I.S., a personal AI assistant for Diogo — professional bassoonist at the Estonian National Opera and serious athlete training for a dunk goal. Direct, precise, concise. No filler phrases, no preamble.

Rules:
- Use ONLY the live data provided — never invent numbers, dates, or facts
- Lead with the insight or answer
- If any action requires real-world execution (trades, purchases, logging, external systems), end with "Requires your approval."
- Maximum 6 sentences total
- Plain prose or bullet list only — NEVER use markdown headers (##, ###) or horizontal rules (---)
- NEVER use markdown tables

Example of correct output format:
"Legs today at HIGH intensity — Hex Bar Jump 30kg, Back Squat 50kg, Hip Thrust 37.5kg, Calf Raise 30kg (5×6). Nutrition: nothing logged yet, hit 2400 kcal / 165g protein before day ends. Finance: €46.15 BTC + €69.23 Quality ETF ready to deploy. Requires your approval."\
"""


class ChatRequest(BaseModel):
    message: str
    domain: str = "home"
    history: list[dict] = []


def _build_finance_context() -> tuple[str, bool]:
    """Returns (context_text, requires_approval)."""
    try:
        constitution = finance_engine.load_json(finance_engine.DEFAULT_CONSTITUTION_PATH)
        finance_engine.validate_constitution(constitution)
        portfolio_state = finance_engine.load_json(finance_engine.DEFAULT_PORTFOLIO_STATE_PATH)
    except (FileNotFoundError, ValueError):
        return "FINANCE: Constitution or portfolio state unavailable.", True

    try:
        result = finance_engine.allocate_weekly_budget(constitution, portfolio_state)
        ticket = result["approval_ticket"]
        holdings = finance_engine.investable_holdings(constitution, portfolio_state)
        statuses = finance_engine.current_statuses(constitution, holdings)
        mandate = ticket["weekly_dual_lane_mandate"]

        sleeve_lines = "\n".join(
            f"  {s.name}: gap={s.gap:+.2%}, status={s.band_status}"
            for s in statuses
        )
        rec_lines = "\n".join(
            f"  {asset.upper()}: €{amount:.2f} via {constitution['asset_routes'].get(asset)} "
            f"({'crypto' if asset in _CRYPTO_ASSETS else 'etf'} lane)"
            for asset, amount in ticket["executable_allocation"].items()
            if amount > 0
        ) or "  None this week"

        rationale_parts = []
        if mandate["crypto_lane"]["status"] == "READY_FOR_MANUAL_BUY":
            c = mandate["crypto_lane"]
            rationale_parts.append(f"Buy {c['asset'].upper()} €{c['amount']:.2f}")
        if mandate["stock_fund_etf_lane"]["status"] == "READY_FOR_MANUAL_BUY":
            s = mandate["stock_fund_etf_lane"]
            rationale_parts.append(f"Buy {s['asset']} €{s['amount']:.2f}")

        context = (
            f"FINANCE (as of {portfolio_state.get('as_of')}):\n"
            f"Total invested: €{finance_engine.euros(sum(holdings.values())):.2f}\n"
            f"Weekly budget: €{ticket['weekly_budget']:.2f}\n"
            f"Portfolio mode: {result['portfolio_mode']['mode']}\n"
            f"Sleeves:\n{sleeve_lines}\n"
            f"Recommended buys:\n{rec_lines}\n"
            f"Engine rationale: {'; '.join(rationale_parts) or 'No buys this week'}\n"
            f"Warnings: {'; '.join(ticket['warnings']) or 'None'}"
        )
        return context, True
    except Exception:
        return "FINANCE: Engine error loading context.", True


def _build_training_context() -> str:
    try:
        with open(training_engine.DEFAULT_CONSTITUTION_PATH) as f:
            constitution = json.load(f)
        status = training_engine.check_training(
            constitution, today=date.today(), opera_snapshot_raw=LIVE_SNAPSHOT_RAW
        )
        g = status.dunk_goal
        c = status.cut_status
        sess = status.today_session
        ww = sess.working_weights

        lines = [
            f"TRAINING (as of {status.as_of.isoformat()}):",
            f"Phase: {g.current_phase.value}, mesocycle week {g.current_mesocycle_week}",
            f"Days to dunk attempt: {g.days_to_attempt} ({g.weeks_to_attempt:.1f} weeks)",
            f"Today: {sess.session_type.value.upper()} session",
        ]
        if ww:
            lines += [
                f"Working weights ({ww.intensity_pct}% intensity, {ww.sets}×{ww.reps}):",
                f"  {ww.explosive_exercise}: {ww.explosive_kg}kg",
                f"  {ww.knee_extension_exercise}: {ww.knee_extension_kg}kg",
                f"  {ww.posterior_chain_exercise}: {ww.posterior_chain_kg}kg",
                f"  {ww.lower_leg_exercise}: {ww.lower_leg_kg}kg",
                f"  {ww.top_set_note}",
            ]
        lines += [
            f"Cut: {'active' if c.active else 'ended'}, {c.days_remaining} days remaining",
            f"Body fat: {c.current_bf_pct}% → target {c.target_bf_pct}% ({c.estimated_fat_to_lose_kg}kg to lose)",
        ]
        if status.has_hard_conflicts:
            lines.append(f"CONFLICT: {status.conflicts[0].detail}")
        elif status.fatigue_warning:
            lines.append(f"Fatigue note: {status.fatigue_warning}")

        return "\n".join(lines)
    except Exception:
        return "TRAINING: Context unavailable."


def _build_nutrition_context() -> str:
    try:
        with open(_NUTRITION_CONSTITUTION_PATH) as f:
            constitution = json.load(f)
        meals = database.get_meals_for_date(date.today())
        items = [
            {k: m[k] for k in ("item_id", "item_type", "name", "servings", "calories", "protein_g", "fat_g", "carbs_g")}
            for m in meals
        ]
        status = nutrition_engine.check_nutrition(constitution, daily_log_items=items, today=date.today())
        t = status.target

        return (
            f"NUTRITION (as of {status.as_of.isoformat()}):\n"
            f"Phase: {status.phase.upper()}, {'training day' if status.is_training_day else 'rest day'}\n"
            f"Target: {t.calories} kcal | {t.protein_g}g protein | {t.carbs_g}g carbs | {t.fat_g}g fat\n"
            f"Logged: {round(status.logged.total_calories, 1)} kcal | {round(status.logged.total_protein_g, 1)}g protein\n"
            f"Remaining: {round(status.remaining_calories, 1)} kcal | {round(status.remaining_protein_g, 1)}g protein"
        )
    except Exception:
        return "NUTRITION: Context unavailable."


def _build_calendar_context() -> str:
    try:
        snapshot = calendar_engine.parse_snapshot(LIVE_SNAPSHOT_RAW)
        if not snapshot.events:
            return "CALENDAR: No upcoming events."
        event_lines = "\n".join(
            f"  {e.date.isoformat()} {e.time_start.strftime('%H:%M') if e.time_start else ''} — {e.title}"
            for e in snapshot.events[:10]
        )
        return f"CALENDAR (as of {snapshot.as_of.isoformat()}):\n{event_lines}"
    except Exception:
        return "CALENDAR: Context unavailable."


@router.post("/chat")
def jarvis_chat(request: ChatRequest) -> dict:
    domain = request.domain.lower()
    context_parts = []
    requires_approval = False

    if domain in ("finance", "home"):
        finance_ctx, fin_approval = _build_finance_context()
        context_parts.append(finance_ctx)
        if fin_approval:
            requires_approval = True

    if domain in ("training", "home"):
        context_parts.append(_build_training_context())

    if domain in ("nutrition", "home"):
        context_parts.append(_build_nutrition_context())

    if domain in ("calendar", "home"):
        context_parts.append(_build_calendar_context())

    context = "\n\n".join(p for p in context_parts if p)
    user_content = (
        f"Live data:\n{context}\n\nQuestion: {request.message}" if context else request.message
    )

    messages = [*request.history, {"role": "user", "content": user_content}]

    try:
        client = anthropic.Anthropic()
        msg = client.messages.create(
            model="claude-sonnet-4-6",
            max_tokens=512,
            system=_SYSTEM_PROMPT,
            messages=messages,
        )
        response_text = msg.content[0].text
    except Exception:
        response_text = (
            "Unable to reach the AI backend. Check your ANTHROPIC_API_KEY and try again."
        )

    if not requires_approval and "requires your approval" in response_text.lower():
        requires_approval = True

    return {
        "response": response_text,
        "domain": domain,
        "requires_approval": requires_approval,
        "context_summary": f"{domain} context loaded as of {date.today().isoformat()}",
    }
