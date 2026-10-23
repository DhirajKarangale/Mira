from __future__ import annotations

import logging
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

def log(msg: str) -> None:
    from vault_logger import log as v_log
    v_log(mask_sensitive(msg))

def log_error(msg: str) -> None:
    from vault_logger import log_error as v_log_error
    v_log_error(mask_sensitive(msg))

def call_llm(prompt: str, work: str = "summarization") -> str:
    """Main LLM public entrypoint.
    
    Coordinates provider selection according to Vault's priority sequence,
    executes model generation, handles provider/model/key fallbacks,
    and returns a clean parsed response string.
    
    If every configured provider fails, returns a safe, user-friendly string
    without exposing API keys or internal errors.
    """
    if not prompt or not str(prompt).strip():
        return ""

    work_clean = str(work).strip().lower() if work else "summarization"

    # 1. Resolve provider priority sequence from Vault
    raw_priorities: List[str] = get_ai_priorities()
    priorities = [p.strip().lower() for p in raw_priorities if p and p.strip().lower() in PROVIDER_HANDLERS]
    if not priorities:
        # Fallback to supported default order
        priorities = ["gemini", "groq"]

    log(f"[Engine LLM] Initiating LLM call for work='{work_clean}' across priorities: {priorities}")

    # 2. Iterate through providers in Vault priority order
    last_error: Optional[Exception] = None
    for provider in priorities:
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
                log(f"[Engine LLM] Provider '{provider}' succeeded for work='{work_clean}'")
                return parsed_result

            # If response is empty, continue to next provider
            log_error(f"[Engine LLM] Provider '{provider}' returned empty response, trying next provider...")

        except Exception as e:
            last_error = e
            log_error(f"[Engine LLM] Provider '{provider}' failed: {mask_sensitive(str(e))}. Moving to next provider...")
            continue

    # 3. If every provider fails, return user-friendly message
    log_error("[Engine LLM] All configured providers failed to satisfy request.")
    return AI_UNAVAILABLE_MESSAGE
