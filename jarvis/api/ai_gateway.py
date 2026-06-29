"""Provider-agnostic AI gateway for PHOENIX.

The core app must never depend on one paid provider. This module keeps the
Anthropic path intact while adding an OpenAI-compatible gateway path such as
FreeLLMAPI. No frontend code sees upstream provider keys.
"""

from __future__ import annotations

import os
from dataclasses import dataclass
from typing import Any

import httpx


@dataclass(frozen=True)
class AIStatus:
    provider: str
    configured: bool
    selected_provider: str
    model: str | None
    base_url: str | None
    missing: list[str]
    supports_web_search_tool: bool
    core_requires_ai: bool = False

    def as_dict(self) -> dict[str, Any]:
        return {
            "provider": self.provider,
            "configured": self.configured,
            "selected_provider": self.selected_provider,
            "model": self.model,
            "base_url": self.base_url,
            "missing": self.missing,
            "supports_web_search_tool": self.supports_web_search_tool,
            "core_requires_ai": self.core_requires_ai,
            "safe_note": "Phoenix core modules work without AI; AI only explains/summarizes selected context.",
        }


@dataclass(frozen=True)
class AIResult:
    text: str
    provider: str
    model: str | None
    routed_via: str | None = None
    fallback_attempts: str | None = None
    ok: bool = True
    error: str | None = None

    def as_dict(self) -> dict[str, Any]:
        return {
            "text": self.text,
            "provider": self.provider,
            "model": self.model,
            "routed_via": self.routed_via,
            "fallback_attempts": self.fallback_attempts,
            "ok": self.ok,
            "error": self.error,
        }


def _env(name: str, default: str | None = None) -> str | None:
    value = os.getenv(name)
    if value is None or value.strip() == "":
        return default
    return value.strip()


def _requested_provider() -> str:
    return (_env("PHOENIX_AI_PROVIDER", "anthropic") or "anthropic").lower()


def _select_provider() -> str:
    requested = _requested_provider()
    if requested in {"off", "none", "disabled"}:
        return "off"
    if requested in {"freellmapi", "openai_compatible", "openai-compatible", "llm_gateway"}:
        return "freellmapi"
    if requested == "auto":
        if _env("PHOENIX_LLM_BASE_URL") and (_env("PHOENIX_LLM_API_KEY") or _env("FREELLMAPI_API_KEY")):
            return "freellmapi"
        if _env("ANTHROPIC_API_KEY"):
            return "anthropic"
        return "off"
    return "anthropic"


def status() -> AIStatus:
    selected = _select_provider()
    requested = _requested_provider()
    missing: list[str] = []
    model: str | None = None
    base_url: str | None = None
    supports_web = False

    if selected == "off":
        return AIStatus(
            provider=requested,
            configured=False,
            selected_provider="off",
            model=None,
            base_url=None,
            missing=[],
            supports_web_search_tool=False,
        )

    if selected == "freellmapi":
        base_url = (_env("PHOENIX_LLM_BASE_URL", "http://localhost:3001/v1") or "").rstrip("/")
        api_key = _env("PHOENIX_LLM_API_KEY") or _env("FREELLMAPI_API_KEY")
        model = _env("PHOENIX_LLM_MODEL", "auto")
        if not base_url:
            missing.append("PHOENIX_LLM_BASE_URL")
        if not api_key:
            missing.append("PHOENIX_LLM_API_KEY")
        return AIStatus(
            provider=requested,
            configured=not missing,
            selected_provider="freellmapi",
            model=model,
            base_url=base_url,
            missing=missing,
            supports_web_search_tool=False,
        )

    model = _env("ANTHROPIC_MODEL", "claude-sonnet-4-6")
    if not _env("ANTHROPIC_API_KEY"):
        missing.append("ANTHROPIC_API_KEY")
    supports_web = True
    return AIStatus(
        provider=requested,
        configured=not missing,
        selected_provider="anthropic",
        model=model,
        base_url=None,
        missing=missing,
        supports_web_search_tool=supports_web,
    )


def provider_error_message(ai_status: AIStatus | None = None) -> str:
    ai_status = ai_status or status()
    if ai_status.selected_provider == "off":
        return "AI is disabled. Phoenix core is still running; enable PHOENIX_AI_PROVIDER to use the AI layer."
    if ai_status.selected_provider == "freellmapi":
        return (
            "AI gateway unavailable. Start FreeLLMAPI and set PHOENIX_LLM_BASE_URL plus PHOENIX_LLM_API_KEY. "
            "Phoenix core is still running."
        )
    return "Unable to reach the AI backend. Check your ANTHROPIC_API_KEY or set PHOENIX_AI_PROVIDER=freellmapi."


def _normalise_messages(messages: list[dict[str, Any]]) -> list[dict[str, Any]]:
    cleaned: list[dict[str, Any]] = []
    for msg in messages:
        role = msg.get("role")
        if role not in {"user", "assistant", "system", "tool"}:
            role = "user"
        content = msg.get("content", "")
        if not isinstance(content, str):
            content = str(content)
        cleaned.append({"role": role, "content": content})
    return cleaned


def generate_text(
    *,
    system_prompt: str,
    messages: list[dict[str, Any]],
    max_tokens: int = 512,
    tools: list[dict[str, Any]] | None = None,
) -> AIResult:
    ai_status = status()
    if not ai_status.configured:
        return AIResult(
            text=provider_error_message(ai_status),
            provider=ai_status.selected_provider,
            model=ai_status.model,
            ok=False,
            error="not_configured",
        )

    if ai_status.selected_provider == "freellmapi":
        return _generate_free_llm(system_prompt=system_prompt, messages=messages, max_tokens=max_tokens, ai_status=ai_status)

    if ai_status.selected_provider == "anthropic":
        return _generate_anthropic(
            system_prompt=system_prompt,
            messages=messages,
            max_tokens=max_tokens,
            tools=tools,
            ai_status=ai_status,
        )

    return AIResult(
        text=provider_error_message(ai_status),
        provider=ai_status.selected_provider,
        model=ai_status.model,
        ok=False,
        error="provider_disabled",
    )


def _generate_free_llm(*, system_prompt: str, messages: list[dict[str, Any]], max_tokens: int, ai_status: AIStatus) -> AIResult:
    api_key = _env("PHOENIX_LLM_API_KEY") or _env("FREELLMAPI_API_KEY")
    base_url = (ai_status.base_url or "http://localhost:3001/v1").rstrip("/")
    url = f"{base_url}/chat/completions"
    timeout = float(_env("PHOENIX_LLM_TIMEOUT_SECONDS", "45") or "45")
    payload = {
        "model": ai_status.model or "auto",
        "messages": [{"role": "system", "content": system_prompt}, *_normalise_messages(messages)],
        "max_tokens": max_tokens,
        "stream": False,
    }
    try:
        with httpx.Client(timeout=timeout) as client:
            response = client.post(
                url,
                headers={"Authorization": f"Bearer {api_key}", "Content-Type": "application/json"},
                json=payload,
            )
            response.raise_for_status()
        data = response.json()
        text = (
            data.get("choices", [{}])[0]
            .get("message", {})
            .get("content", "")
        )
        return AIResult(
            text=(text or "No response generated.").strip(),
            provider="freellmapi",
            model=ai_status.model,
            routed_via=response.headers.get("x-routed-via"),
            fallback_attempts=response.headers.get("x-fallback-attempts"),
        )
    except Exception as exc:  # noqa: BLE001 - gateway failures must never crash Phoenix core
        return AIResult(
            text=provider_error_message(ai_status),
            provider="freellmapi",
            model=ai_status.model,
            ok=False,
            error=exc.__class__.__name__,
        )


def _generate_anthropic(
    *,
    system_prompt: str,
    messages: list[dict[str, Any]],
    max_tokens: int,
    tools: list[dict[str, Any]] | None,
    ai_status: AIStatus,
) -> AIResult:
    try:
        import anthropic

        client = anthropic.Anthropic()
        msg = client.messages.create(
            model=ai_status.model or "claude-sonnet-4-6",
            max_tokens=max_tokens,
            system=system_prompt,
            messages=[m for m in _normalise_messages(messages) if m["role"] != "system"],
            **({"tools": tools} if tools else {}),
        )
        response_text = " ".join(
            block.text for block in msg.content if hasattr(block, "text")
        ).strip() or "No response generated."
        return AIResult(text=response_text, provider="anthropic", model=ai_status.model)
    except Exception as exc:  # noqa: BLE001
        return AIResult(
            text=provider_error_message(ai_status),
            provider="anthropic",
            model=ai_status.model,
            ok=False,
            error=exc.__class__.__name__,
        )
