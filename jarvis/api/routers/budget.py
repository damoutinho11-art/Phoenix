"""Budget API — parse, save, and summarise personal bank transactions."""

import json
from datetime import date

import anthropic
from fastapi import APIRouter
from pydantic import BaseModel

from jarvis.data import database

router = APIRouter()

CATEGORIES = [
    "Housing", "Food & Groceries", "Eating Out", "Transport",
    "Subscriptions", "Health & Sport", "Shopping", "Investment",
    "Income", "Banking & Fees", "Other",
]


class ParseRequest(BaseModel):
    raw_text: str
    source: str = "text"


class SaveRequest(BaseModel):
    transactions: list[dict]


def _parse_transactions_with_claude(raw_text: str, source: str = "text") -> list[dict]:
    client = anthropic.Anthropic()
    prompt = f"""Extract all transactions from this LHV bank statement text.

For each transaction return a JSON object with:
- date: "YYYY-MM-DD"
- merchant: clean merchant name (remove codes, addresses, terminal IDs)
- amount_eur: float (positive = expense, negative = income/refund)
- category: one of exactly: "Housing", "Food & Groceries", "Eating Out", "Transport", "Subscriptions", "Health & Sport", "Shopping", "Investment", "Income", "Banking & Fees", "Other"
- is_income: 1 if this is income/salary, 0 if expense
- description: one sentence explaining the transaction

Return ONLY a JSON array, no other text.

Categorisation rules:
- Selver, Rimi, Prisma, Maxima, Lidl = Food & Groceries
- Bolt Food, Wolt, restaurants, cafes = Eating Out
- Bolt, Uber, Tallinn Linnatranspordi, parking = Transport
- Spotify, Netflix, Adobe, Apple, Google, GitHub, Anthropic, OpenAI = Subscriptions
- LHV investment transfers, stocks, ETF = Investment
- Salary, freelance, performance fees = Income
- LHV fees, conversion fees, bank charges = Banking & Fees
- Pharmacy, gym, sports shop = Health & Sport
- Rent, utilities, internet = Housing
- Clothes, electronics, Amazon = Shopping

Raw text:
{raw_text}"""

    result = client.messages.create(
        model="claude-sonnet-4-6",
        max_tokens=2000,
        messages=[{"role": "user", "content": prompt}],
    )
    text = result.content[0].text.strip()
    text = text.replace("```json", "").replace("```", "").strip()
    transactions = json.loads(text)
    for t in transactions:
        t["month"] = t["date"][:7]
        t["source"] = source
    return transactions


def _generate_budget_insight(summary: dict, month: str) -> str:
    client = anthropic.Anthropic()
    prompt = f"""Budget summary for {month}:
{json.dumps(summary, indent=2)}

Generate a spoken JARVIS budget brief for Sir.
Maximum 3 sentences. Be concise. Cover: savings rate vs 25% target,
top spending category, one specific thing to cut.
No markdown, no symbols, natural spoken sentences.
Address the user as Sir."""
    result = client.messages.create(
        model="claude-sonnet-4-6",
        max_tokens=200,
        messages=[{"role": "user", "content": prompt}],
    )
    return result.content[0].text.strip()


@router.post("/parse")
def parse_transactions(request: ParseRequest) -> dict:
    transactions = _parse_transactions_with_claude(request.raw_text, request.source)
    return {"transactions": transactions, "count": len(transactions)}


@router.post("/save")
def save_transactions(request: SaveRequest) -> dict:
    saved = database.save_budget_transactions(request.transactions)
    return {"saved": saved}


@router.get("/summary")
def budget_summary(month: str = "") -> dict:
    if not month:
        month = date.today().strftime("%Y-%m")
    summary = database.get_budget_summary(month)
    insight = ""
    if summary["income_total"] > 0 or summary["expenses_total"] > 0:
        try:
            insight = _generate_budget_insight(summary, month)
        except Exception:
            pass
    summary["insight"] = insight
    return summary


@router.get("/transactions")
def budget_transactions(month: str = "") -> dict:
    if not month:
        month = date.today().strftime("%Y-%m")
    transactions = database.get_budget_transactions(month)
    return {"transactions": transactions, "month": month}


@router.get("/months")
def budget_months() -> dict:
    months = database.get_budget_months()
    return {"months": months}
