from __future__ import annotations

import logging
import threading
import time
from typing import Callable, Dict, List, Optional

from .config import (
    get_ai_priorities,
    get_active_provider,
    set_active_provider,
)
from .error_analysis import mask_sensitive, LLMError
from .response_parser import parse_response
from . import gemini
from . import groq

logger = logging.getLogger("mira.engine.llm.caller")

# Registered provider callers
PROVIDER_HANDLERS: Dict[str, Callable[[str, str], str]] = {
    "gemini": gemini.call,
    "groq": groq.call,
}

# User-friendly string returned when all configured providers fail
AI_UNAVAILABLE_MESSAGE = (
    "The AI request could not be completed because no configured provider is currently available."
)

# Cooldown tracking for temporarily down providers (e.g. timeout / connection failure)
_COOLDOWN_LOCK = threading.Lock()
_PROVIDER_COOLDOWN_UNTIL: Dict[str, float] = {}
COOLDOWN_DURATION_SEC = 60.0

def log(msg: str) -> None:
    from vault_logger import log as v_log
    v_log(mask_sensitive(msg))

def log_error(msg: str) -> None:
    from vault_logger import log_error as v_log_error
    v_log_error(mask_sensitive(msg))

def _is_in_cooldown(provider: str) -> bool:
    with _COOLDOWN_LOCK:
        expiry = _PROVIDER_COOLDOWN_UNTIL.get(provider, 0.0)
        return time.time() < expiry

def _mark_provider_failure(provider: str) -> None:
    with _COOLDOWN_LOCK:
        _PROVIDER_COOLDOWN_UNTIL[provider] = time.time() + COOLDOWN_DURATION_SEC

def _mark_provider_success(provider: str) -> None:
    with _COOLDOWN_LOCK:
        _PROVIDER_COOLDOWN_UNTIL.pop(provider, None)

def get_ordered_providers(raw_priorities: List[str]) -> List[str]:
    """Orders providers by respecting Vault priorities, the active healthy provider, and cooldowns."""
    valid_priorities = [p.strip().lower() for p in raw_priorities if p and p.strip().lower() in PROVIDER_HANDLERS]
    if not valid_priorities:
        valid_priorities = ["groq", "gemini"]

    active = get_active_provider()
    active_clean = active.strip().lower() if active else None

    # Partition into healthy (not in cooldown) and cooling-down providers
    healthy = [p for p in valid_priorities if not _is_in_cooldown(p)]
    cooling = [p for p in valid_priorities if _is_in_cooldown(p)]

    # If active provider is healthy, prioritize it
    if active_clean and active_clean in healthy:
        ordered_healthy = [active_clean] + [p for p in healthy if p != active_clean]
    else:
        ordered_healthy = healthy

    # If all configured providers are in cooldown, don't stall—try them anyway in priority order
    if not ordered_healthy:
        return valid_priorities

    return ordered_healthy + cooling

def call_llm(prompt: str, work: str = "summarization") -> str:
    """Main LLM public entrypoint.
    
    Coordinates provider selection according to Vault's priority sequence and active status,
    executes model generation, handles provider/model/key fallbacks,
    and returns a clean parsed response string.
    
    If every configured provider fails, returns a safe, user-friendly string
    without exposing API keys or internal errors.
    """
    if not prompt or not str(prompt).strip():
        return ""

    work_clean = str(work).strip().lower() if work else "summarization"

    # 1. Resolve provider priority sequence from Vault & health status
    raw_priorities: List[str] = get_ai_priorities()
    providers_order = get_ordered_providers(raw_priorities)

    log(f"[Engine LLM] Initiating LLM call for work='{work_clean}' across candidate order: {providers_order}")

    # 2. Iterate through candidate providers
    last_error: Optional[Exception] = None
    for provider in providers_order:
        handler = PROVIDER_HANDLERS.get(provider)
        if not handler:
            continue

        log(f"[Engine LLM] Routing request to provider: '{provider}'")
        try:
            # Update current active provider in memory
            set_active_provider(provider)

            # Call provider handler (handles model iteration and key rotation internally)
            raw_result = handler(prompt, work_clean)
            parsed_result = parse_response(raw_result)

            if parsed_result:
                _mark_provider_success(provider)
                log(f"[Engine LLM] Provider '{provider}' succeeded for work='{work_clean}'")
                return parsed_result

            # If response is empty, continue to next provider
            log_error(f"[Engine LLM] Provider '{provider}' returned empty response, trying next provider...")

        except Exception as e:
            last_error = e
            _mark_provider_failure(provider)
            log_error(f"[Engine LLM] Provider '{provider}' failed: {mask_sensitive(str(e))}. Moving to next provider...")
            continue

    # 3. If every provider fails, return user-friendly message
    log_error("[Engine LLM] All configured providers failed to satisfy request.")
    return AI_UNAVAILABLE_MESSAGE
