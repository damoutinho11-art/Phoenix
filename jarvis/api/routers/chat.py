"""Universal PHOENIX conversational endpoint. All domains, one POST."""

import json
import re
from datetime import date
from pathlib import Path

from fastapi import APIRouter
from pydantic import BaseModel

from jarvis.data import database
from jarvis.api import ai_gateway
from jarvis.api.finance_authority import (
    authoritative_portfolio_state,
    build_cashflow_authority,
)
from jarvis.api.finance_lifecycle import current_week_lifecycle
from jarvis.domains.finance.cashflow_authority import blocked_cashflow_authority
from jarvis.domains.news import engine as news_engine
from jarvis.domains.calendar import engine as calendar_engine
from jarvis.domains.calendar.tests.fixtures import LIVE_SNAPSHOT_RAW
from jarvis.domains.finance import engine as finance_engine
from jarvis.domains.nutrition import engine as nutrition_engine
from jarvis.domains.training import engine as training_engine
from jarvis.core import clock

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
"Legs today at HIGH intensity — Hex Bar Jump 30kg, Back Squat 50kg, Hip Thrust 37.5kg, Calf Raise 30kg (5×6). Nutrition: nothing logged yet, hit 2400 kcal / 165g protein before day ends. Requires your approval."\
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


def _build_finance_context(
    *, include_authority: bool = False, decision_today: date | None = None
) -> tuple:
    """Build a Finance context from one lifecycle and decision-date snapshot."""
    today = decision_today or clock.today()
    lifecycle = current_week_lifecycle(today)
    authority = build_cashflow_authority(
        today, week_closed=lifecycle["week_closed"]
    )
    if lifecycle["week_closed"]:
        result = "FINANCE: Current investment week is closed. No new allocation is available."
        return (result, False, authority, today) if include_authority else (result, False)
    if authority.get("data_ready") is not True:
        result = (
            "FINANCE: Cash-flow authority is blocked. No allocation is available. "
            f"Blockers: {'; '.join(authority.get('blockers') or [])}"
        )
        return (result, True, authority, today) if include_authority else (result, True)
    try:
        constitution = finance_engine.load_json(finance_engine.DEFAULT_CONSTITUTION_PATH)
        finance_engine.validate_constitution(constitution)
        portfolio_state = database.load_portfolio_state()
    except (FileNotFoundError, ValueError):
        result = "FINANCE: Constitution or portfolio state unavailable."
        authority = blocked_cashflow_authority(
            "Finance constitution or portfolio state is unavailable."
        )
        return (result, True, authority, today) if include_authority else (result, True)

    try:
        from jarvis.domains.finance.market_data import detect_market_regime

        # Load profile for regime-aware allocation
        try:
            profile = finance_engine.load_json(finance_engine.DEFAULT_PROFILE_PATH)
        except FileNotFoundError:
            profile = None

        portfolio_state = authoritative_portfolio_state(portfolio_state, authority)
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
            f"FINANCE (decision as of {today.isoformat()}; portfolio as of {portfolio_state.get('as_of')}):\n"
            f"Total invested: €{finance_engine.euros(sum(holdings.values())):.2f}\n"
            f"Weekly budget: €{ticket['weekly_budget']:.2f}\n"
            f"Portfolio mode: {result['portfolio_mode']['mode']}\n"
            f"{regime_str} | {phase_str}\n"
            f"Sleeves:\n{sleeve_lines}\n"
            f"Recommended buys:\n{rec_lines}\n"
            f"Engine rationale: {'; '.join(rationale_parts) or 'No buys this week'}\n"
            f"Warnings: {'; '.join(ticket['warnings']) or 'None'}"
        )
        return (context, True, authority, today) if include_authority else (context, True)
    except Exception:
        result = "FINANCE: Engine error loading context."
        authority = blocked_cashflow_authority("Finance context is unavailable.")
        return (result, True, authority, today) if include_authority else (result, True)


def _finance_allocation_intent(domain: str, message: str) -> bool:
    if domain == "finance":
        return True
    if domain != "home":
        return False
    stock_inventory_or_media = re.search(
        r"\bstocks?\s+(?:photos?|photography|images?|footage|media)\b|"
        r"\bstocks?\b.*\b(?:inventory|furniture\s+shop|shop|store|design|site)\b",
        message,
        re.IGNORECASE,
    )
    stock_security_company = re.search(
        r"\b(?:stock|shares?)\s+(?:in|of)\s+(?:a\s+)?(?:[\w-]+\s+)*company\b",
        message,
        re.IGNORECASE,
    )
    explicit_nonfinancial_context = re.search(
        r"\b(?:design\s+portfolio|portfolio\s+website|website\s+design|"
        r"site\s+design|dinner\s+table|furniture|shopping|supermarket)\b",
        message,
        re.IGNORECASE,
    )
    # A named company's securities remain a Finance question even when the
    # company itself makes furniture. All other explicit non-finance contexts
    # must win before concrete asset tokens are considered.
    if (stock_inventory_or_media or explicit_nonfinancial_context) and not stock_security_company:
        return False
    financial_action = re.search(
        r"\b(?:invest(?:ed|ing|ment)?|allocat(?:e|ed|ing|ion)|deploy(?:ed|ing)?(?:\s+capital)?|"
        r"plan(?:ning)?|schedule(?:d|ing)?|mov(?:e|ed|ing)|purchas(?:e|ed|ing)|buys?|buying|"
        r"bought|sell(?:ing)?|sold|hold(?:ing)?|held|put|add|rebalanc(?:e|ed|ing)|review(?:ed|ing)?)\b",
        message,
        re.IGNORECASE,
    )
    concrete_financial_asset = re.search(
        r"\b(?:btc|bitcoin|eth|ethereum|etf|shares?|stocks?|crypto|bonds?|"
        r"nasdaq|s&p(?:\s*500)?)\b",
        message,
        re.IGNORECASE,
    )
    advice_question = re.search(
        r"\b(?:should|what\s+should|what\s+do\s+i\s+do\s+with|can\s+i|"
        r"do\s+i|help|advice|advise|review)\b",
        message,
        re.IGNORECASE,
    )
    generic_invest = re.search(
        r"\b(?:invest(?:ed|ing|ment)?|allocat(?:e|ed|ing|ion)|deploy(?:ed|ing)?\s+capital)\b",
        message,
        re.IGNORECASE,
    )
    finance_context = re.search(
        r"\b(?:money|cash|capital|euros?|eur|market|weekly|this\s+week|finance|financial)\b",
        message,
        re.IGNORECASE,
    )
    if concrete_financial_asset:
        return bool(financial_action or advice_question)
    market_action = financial_action and re.search(r"\bmarket\b", message, re.IGNORECASE)
    return bool(
        (market_action and finance_context)
        or (generic_invest and finance_context)
    )


def _finance_chat_projection(authority: dict | None, context: str) -> dict:
    week_closed = context.startswith("FINANCE: Current investment week is closed.")
    ready = authority is not None and authority.get("data_ready") is True and not week_closed
    recommendations = [
        {"asset": asset.lower(), "amount": float(amount)}
        for asset, amount in re.findall(
            r"^\s+([A-Z0-9_]+): €(\d+(?:\.\d{2})?)", context, re.MULTILINE
        )
    ] if ready else []
    return {
        "week_closed": week_closed,
        "week_budget": authority["weekly_budget_eur"] if ready else 0.0,
        "recommendations": recommendations,
    }


def _deterministic_finance_chat_response(authority: dict | None, context: str) -> str:
    if context.startswith("FINANCE: Current investment week is closed."):
        return "Sir, the current investment week is closed. No new allocation is available."
    if not authority or authority.get("data_ready") is not True:
        blocker = "; ".join((authority or {}).get("blockers") or ["Finance context is unavailable."])
        return (
            f"Sir, cash-flow authority is blocked: {blocker} "
            "No allocation or buy amount is available until the inputs are verified."
        )
    legs = re.findall(r"^\s+([A-Z0-9_]+): €(\d+(?:\.\d{2})?)", context, re.MULTILINE)
    total = authority["weekly_budget_eur"]
    if legs:
        allocation = "; ".join(f"{asset} €{amount}" for asset, amount in legs)
        return (
            f"Sir, the verified cash-flow authority permits €{total:.2f} this week. "
            f"Current manual-review allocation: {allocation}. Requires your approval before any action."
        )
    return (
        f"Sir, the verified cash-flow authority permits €{total:.2f} this week, "
        "but no manual allocation is currently prepared."
    )


def _build_training_context(*, today: date | None = None) -> str:
    try:
        decision_today = today or clock.today()
        with open(training_engine.DEFAULT_CONSTITUTION_PATH) as f:
            constitution = json.load(f)
        status = training_engine.check_training(
            constitution, today=decision_today, opera_snapshot_raw=LIVE_SNAPSHOT_RAW
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


def _build_nutrition_context(*, today: date | None = None) -> str:
    try:
        decision_today = today or clock.today()
        with open(_NUTRITION_CONSTITUTION_PATH) as f:
            constitution = json.load(f)
        meals = database.get_meals_for_date(decision_today)
        items = [
            {k: m[k] for k in ("item_id", "item_type", "name", "servings", "calories", "protein_g", "fat_g", "carbs_g")}
            for m in meals
        ]
        status = nutrition_engine.check_nutrition(
            constitution, daily_log_items=items, today=decision_today
        )
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
    from jarvis.api.main import background_job_descriptions  # noqa: PLC0415

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
        "background_jobs": background_job_descriptions(),
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
    decision_today = clock.today()
    context_parts = []
    requires_approval = False
    cashflow_authority: dict | None = None
    finance_ctx = ""
    finance_projection = {"week_closed": False, "week_budget": 0.0, "recommendations": []}
    lower_message = request.message.lower()
    history_peptide_text = " ".join(str(row.get("content", "")) for row in request.history)
    normalized_current = "".join(ch for ch in request.message.lower() if ch.isalnum())
    normalized_history = "".join(ch for ch in history_peptide_text.lower() if ch.isalnum())
    peptide_block_message = None
    try:
        with open(_NUTRITION_CONSTITUTION_PATH) as f:
            nutrition_constitution = json.load(f)
        peptide_names = nutrition_constitution.get("supplements", {}).get("research_peptides", {})
        current_peptides = [name for name in peptide_names if "".join(ch for ch in name.lower() if ch.isalnum()) in normalized_current]
        dosing_followup = any(term in lower_message for term in (
            "dose", "dosing", "protocol", "how much", "how many", "spray",
            "inject", "microgram", " mcg", " mg", "administer", "cycle",
            "frequency", "daily", "twice", "nasal", "take it", "use it",
        ))
        history_peptides = [name for name in peptide_names if "".join(ch for ch in name.lower() if ch.isalnum()) in normalized_history]
        requested_peptides = current_peptides or (history_peptides if dosing_followup else [])
        if requested_peptides:
            nutrition_engine.validate_planning_substances(
                requested_peptides, nutrition_constitution
            )
    except ValueError:
        peptide_block_message = (
            "Those research-only peptides are blocked from Phoenix planning and human-use dosing. "
            "Reconsideration requires a qualified clinician and identifiable product information."
        )
    except (OSError, json.JSONDecodeError):
        peptide_block_message = None
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
            database.log_weight(decision_today, bodyweight)
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

    finance_allocation_request = _finance_allocation_intent(domain, request.message)
    if finance_allocation_request:
        finance_ctx, fin_approval, cashflow_authority, _finance_as_of = _build_finance_context(
            include_authority=True, decision_today=decision_today
        )
        finance_projection = _finance_chat_projection(cashflow_authority, finance_ctx)
        context_parts.append(finance_ctx)
        if fin_approval:
            requires_approval = True

    if domain in ("training", "home"):
        context_parts.append(_build_training_context(today=decision_today))

    if domain in ("nutrition", "home"):
        context_parts.append(_build_nutrition_context(today=decision_today))

    if domain in ("calendar", "home"):
        context_parts.append(_build_calendar_context())

    if domain == "budget":
        try:
            month = decision_today.strftime("%Y-%m")
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

    finance_context_blocked = finance_allocation_request and (
        cashflow_authority is None or cashflow_authority.get("data_ready") is not True
    )
    if peptide_block_message:
        response_text = peptide_block_message
    elif finance_context_blocked or finance_allocation_request:
        response_text = _deterministic_finance_chat_response(cashflow_authority, finance_ctx)
    else:
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

    response = {
        "response": response_text,
        "domain": domain,
        "requires_approval": requires_approval,
        "ai": ai_gateway.status().as_dict(),
        "context_summary": f"{domain} context loaded as of {decision_today.isoformat()}",
        "as_of": decision_today.isoformat(),
    }
    if finance_allocation_request:
        response["cashflow_authority"] = cashflow_authority
        response.update(finance_projection)
    return response
