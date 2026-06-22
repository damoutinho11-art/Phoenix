"""Stable J.A.R.V.I.S. runtime safety boundary.

This module owns the user-facing execution block message for active runtime
commands. It deliberately does not import historical versioned runtime modules.

Safety invariant: Automated research. Manual trust. Manual approval. No execution.
"""

from __future__ import annotations

BLOCKED_EXECUTION_COMMAND = "Jarvis, buy BTC now."
BLOCKED_EXECUTION_MESSAGE = (
    "BLOCKED: I cannot execute that command. J.A.R.V.I.S. can prepare data, "
    "evidence, recommendations, dashboards, and summaries, but Diogo must "
    "perform the final real-world buy outside the system. No execution action "
    "was taken."
)


def build_safety_check_console_output() -> str:
    """Return the canonical no-execution safety-check output."""

    return f"{BLOCKED_EXECUTION_COMMAND}\n{BLOCKED_EXECUTION_MESSAGE}"


__all__ = [
    "BLOCKED_EXECUTION_COMMAND",
    "BLOCKED_EXECUTION_MESSAGE",
    "build_safety_check_console_output",
]
