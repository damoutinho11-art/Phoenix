"""Universal PHOENIX conversational endpoint. All domains, one POST."""

import json
import re
from datetime import date
from pathlib import Path

from fastapi import APIRouter
from pydantic import BaseModel

from jarvis.data import database
from jarvis.api import ai_gateway
from jarvis.domains.news import engine as news_engine
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
You are PHOENIX, a personal AI assistant. Always address the user as "Sir" — never by name. The user is a professional bassoonist at the Estonian National Opera and a serious athlete training for a dunk goal. Direct, precise, concise. No filler phrases, no preamble.

Rules:
- Use ONLY the live data provided — never invent numbers, dates, or facts
- Lead with the insight or answer
- If any action requires real-world execution (trades, purchases, logging, external systems), end with "Requires your approval."
- Maximum 6 sentences total
- Plain prose or bullet list only — NEVER use markdown headers (##, ###) or horizontal rules (---)
- NEVER use markdown tables
- For voice responses, be extremely concise — maximum 2 sentences, no lists, no markdown

Example of correct output format:
"Legs today at HIGH intensity — Hex Bar Jump 30kg, Back Squat 50kg, Hip Thrust 37.5kg, Calf Raise 30kg (5×6). Nutrition: nothing logged yet, hit 2400 kcal / 165g protein before day ends. Finance: €46.15 BTC + €69.23 Quality ETF ready to deploy. Requires your approval."\
"""

_FINANCE_WEB_SEARCH_ADDENDUM = """\

You have access to web search. Before making any recommendation, search for:
- Recent news on the specific assets being recommended (BTC, ETFs)
- Any macro events this week (Fed decisions, CPI data, major market moves)
- Earnings or events affecting holdings in the stock universe
Use this context to explain WHY the recommendation makes sense right now,
or flag if news changes the conviction level.
Keep the response under 200 words. Lead with the recommendation,
follow with the news context in 1-2 sentences.
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
        portfolio_state = database.load_portfolio_state()
    except (FileNotFoundError, ValueError):
        return "FINANCE: Constitution or portfolio state unavailable.", True

    try:
        from jarvis.domains.finance.market_data import detect_market_regime

        # Load profile for regime-aware allocation
        try:
            profile = finance_engine.load_json(finance_engine.DEFAULT_PROFILE_PATH)
        except FileNotFoundError:
            profile = None

        regime = detect_market_regime(portfolio_state)
        result = finance_engine.allocate_weekly_budget(
            constitution, portfolio_state,
            regime=regime, profile=profile,
        )
        ticket = result["approval_ticket"]
        holdings = finance_engine.investable_holdings(constitution, portfolio_state)
        statuses = finance_engine.current_statuses(constitution, holdings)
        mandate = ticket["weekly_dual_lane_mandate"]
        dyn = result.get("dynamic_context", {})

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

        regime_str = f"Market regime: {dyn.get('regime', regime).upper()}"
        phase_str = f"Portfolio phase: {dyn.get('phase', '?')} ({dyn.get('phase_label', '')})"

        context = (
            f"FINANCE (as of {portfolio_state.get('as_of')}):\n"
            f"Total invested: €{finance_engine.euros(sum(holdings.values())):.2f}\n"
            f"Weekly budget: €{ticket['weekly_budget']:.2f}\n"
            f"Portfolio mode: {result['portfolio_mode']['mode']}\n"
            f"{regime_str} | {phase_str}\n"
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

        _display = {
            "high_intensity": "HIGH INTENSITY (Lower)",
            "general": "UPPER BODY (General)",
            "jump": "JUMP SESSION",
            "iso_only": "ISO ONLY",
            "rest": "REST",
            "deload": "DELOAD",
            "peak": "PEAK SESSION",
            "attempt": "DUNK ATTEMPT",
        }
        session_label = _display.get(sess.session_type.value, sess.session_type.value.upper())
        lines = [
            f"TRAINING (as of {status.as_of.isoformat()}):",
            f"Phase: {g.current_phase.value}, mesocycle week {g.current_mesocycle_week}",
            f"Days to dunk attempt: {g.days_to_attempt} ({g.weeks_to_attempt:.1f} weeks)",
            f"Today: {session_label}",
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

        sleep = database.get_last_sleep()
        lines.append(
            f"Last sleep: {sleep['duration_hours']:.1f}h (score {sleep['score']}/100)"
            if sleep else "Last sleep: not logged yet"
        )
        soreness = database.get_last_soreness()
        lines.append(
            f"Soreness: {soreness['label']} ({soreness['score']}/5)"
            if soreness else "Soreness: not logged yet"
        )

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




def _build_app_context() -> str:
    """Explain what Phoenix is doing/fetching without requiring AI."""
    try:
        ai = ai_gateway.status().as_dict()
    except Exception:
        ai = {"selected_provider": "unknown", "configured": False, "missing": ["status_error"]}
    try:
        recipes = len(nutrition_engine.load_recipes())
        staples = len(nutrition_engine.load_lidl_staples())
    except Exception:
        recipes = staples = 0
    try:
        calendar_snapshot = calendar_engine.parse_snapshot(LIVE_SNAPSHOT_RAW)
        calendar_events = len(calendar_snapshot.events)
    except Exception:
        calendar_events = 0
    news = news_engine.status()
    return (
        "APP OPERATIONS:\n"
        f"AI provider: {ai.get('selected_provider')} | configured={ai.get('configured')} | model={ai.get('model')}\n"
        f"AI missing config: {', '.join(ai.get('missing') or []) or 'none'}\n"
        "Core modules do not require AI: nutrition, calendar, finance, training, barcode, shopping, weekly prep.\n"
        f"Nutrition food brain: {recipes} recipes, {staples} Lidl staples.\n"
        f"Calendar snapshot events currently loaded: {calendar_events}.\n"
        "Background jobs: Railway keepalive.\n"
        f"News: enabled={news.get('enabled')} source={news.get('source')} optional=true.\n"
        "Safety: no automatic trading, no automatic food logging, no Plaan mutation, no Google writes."
    )


_WEIGHT_PATTERNS = [
    re.compile(r'(?:i\s+)?weigh\s+(\d{2,3}(?:\.\d{1,2})?)', re.IGNORECASE),
    re.compile(r'weight\s+(?:is\s+)?(\d{2,3}(?:\.\d{1,2})?)', re.IGNORECASE),
    re.compile(r'(\d{2,3}(?:\.\d{1,2})?)\s*kg\b', re.IGNORECASE),
]

_SORENESS_LEVELS = [
    (0, ["feeling fresh", "fully recovered", "no soreness", "feeling great", "feel great", "fully rested", "fresh legs"]),
    (1, ["slightly sore", "little sore", "minor soreness", "mild soreness", "barely sore"]),
    (2, ["a bit sore", "moderately sore", "some soreness", "bit sore"]),
    (3, ["sore", "feeling it", "heavy legs", "legs are heavy", "stiff"]),
    (4, ["very sore", "quite sore", "really sore", "very stiff", "badly sore"]),
    (5, ["destroyed", "wrecked", "can't walk", "dead legs", "absolutely destroyed", "extremely sore"]),
]


def _detect_bodyweight(message: str) -> float | None:
    for pattern in _WEIGHT_PATTERNS:
        m = pattern.search(message)
        if m:
            val = float(m.group(1))
            if 40 <= val <= 200:
                return val
    return None


def _detect_soreness(message: str) -> int | None:
    lower = message.lower()
    for score, keywords in reversed(_SORENESS_LEVELS):
        for kw in keywords:
            if kw in lower:
                return score
    return None


_SLEEP_BEDTIME_KEYWORDS = [
    "going to sleep", "going to bed", "good night", "goodnight",
    "heading to bed", "time to sleep", "off to sleep", "bedtime",
    "nite", "night night", "i'm going to bed", "im going to bed",
]
_SLEEP_WAKEUP_KEYWORDS = [
    "just woke up", "good morning", "i woke up", "woke up",
    "just got up", "i'm up", "im up", "waking up", "morning",
    "i got up",
]


def _detect_sleep_intent(message: str) -> str | None:
    """Return 'bedtime', 'wakeup', or None based on message keywords."""
    lower = message.lower().strip()
    for kw in _SLEEP_BEDTIME_KEYWORDS:
        if kw in lower:
            return "bedtime"
    for kw in _SLEEP_WAKEUP_KEYWORDS:
        if kw in lower:
            return "wakeup"
    return None



@router.get("/ai/status")
def jarvis_ai_status() -> dict:
    return ai_gateway.status().as_dict()


@router.get("/activity")
def jarvis_activity() -> dict:
    """Machine-readable summary of what Phoenix is doing/fetching."""
    ai = ai_gateway.status().as_dict()
    news = news_engine.status()
    try:
        recipes = len(nutrition_engine.load_recipes())
        staples = len(nutrition_engine.load_lidl_staples())
    except Exception:
        recipes = staples = 0
    return {
        "ai": ai,
        "news": news,
        "background_jobs": [
            {"name": "keepalive", "cadence": "10 minutes", "effect": "pings /health"},
        ],
        "inventory": {"recipes": recipes, "lidl_staples": staples},
        "safety": {
            "automatic_trades": False,
            "automatic_food_logging": False,
            "plaan_mutations": False,
            "google_writes": False,
            "raw_pages_sent_to_ai": False,
        },
    }


@router.post("/chat")
def jarvis_chat(request: ChatRequest) -> dict:
    domain = request.domain.lower()
    context_parts = []
    requires_approval = False
    lower_message = request.message.lower()
    app_status_intent = domain in ("home", "app", "system") or any(
        phrase in lower_message
        for phrase in ["what are you doing", "what is the app doing", "what are you fetching", "fetching", "ai status", "provider status"]
    )

    # Auto-log biometric signals before building context
    sleep_event = _detect_sleep_intent(request.message)
    sleep_logged_note = ""
    if sleep_event:
        try:
            database.log_sleep_event(sleep_event)
            sleep_logged_note = f"\n[SYSTEM: {sleep_event} logged]"
        except Exception:
            pass

    bodyweight = _detect_bodyweight(request.message)
    if bodyweight:
        try:
            database.log_weight(date.today(), bodyweight)
            sleep_logged_note += f"\n[SYSTEM: bodyweight {bodyweight}kg logged]"
        except Exception:
            pass

    soreness_score = _detect_soreness(request.message)
    if soreness_score is not None:
        try:
            database.log_soreness(soreness_score)
            sleep_logged_note += f"\n[SYSTEM: soreness score {soreness_score}/5 logged]"
        except Exception:
            pass

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

    if domain == "budget":
        try:
            month = date.today().strftime("%Y-%m")
            budget_summary = database.get_budget_summary(month)
            context_parts.append(f"BUDGET ({month}):\n{json.dumps(budget_summary)}")
        except Exception:
            pass

    if app_status_intent:
        context_parts.append(_build_app_context())

    if news_engine.should_fetch_for_message(domain, request.message):
        context_parts.append(news_engine.context_text(topic=domain if domain != "home" else "markets", limit=5))

    context = "\n\n".join(p for p in context_parts if p)
    user_content = (
        f"Live data:\n{context}{sleep_logged_note}\n\nQuestion: {request.message}"
        if context else request.message
    )

    messages = [*request.history, {"role": "user", "content": user_content}]

    tools = []
    system_prompt = _SYSTEM_PROMPT
    if domain == "finance":
        tools = [{"type": "web_search_20250305", "name": "web_search"}]
        system_prompt = _SYSTEM_PROMPT + _FINANCE_WEB_SEARCH_ADDENDUM

    ai_status = ai_gateway.status()
    if app_status_intent and not ai_status.configured:
        response_text = _build_app_context()
        if news_engine.should_fetch_for_message(domain, request.message):
            response_text += "\n\n" + news_engine.context_text(topic=domain if domain != "home" else "markets", limit=5)
    else:
        ai_result = ai_gateway.generate_text(
            system_prompt=system_prompt,
            messages=messages,
            max_tokens=512,
            tools=tools if ai_status.supports_web_search_tool else None,
        )
        response_text = ai_result.text

    if not requires_approval and "requires your approval" in response_text.lower():
        requires_approval = True

    return {
        "response": response_text,
        "domain": domain,
        "requires_approval": requires_approval,
        "ai": ai_gateway.status().as_dict(),
        "context_summary": f"{domain} context loaded as of {date.today().isoformat()}",
    }
