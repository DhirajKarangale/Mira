from __future__ import annotations
import logging
import threading
import time
from typing import Callable, Dict, List, Optional
from .config import get_ai_priorities, get_active_provider, set_active_provider
from .error_analysis import mask_sensitive, LLMError
from .response_parser import parse_response
from . import gemini
from . import groq
logger = logging.getLogger('mira.engine.llm.caller')
PROVIDER_HANDLERS: Dict[str, Callable[[str, str], str]] = {'gemini': gemini.call, 'groq': groq.call}
AI_UNAVAILABLE_MESSAGE = 'The AI request could not be completed because no configured provider is currently available.'
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
    valid_priorities = [p.strip().lower() for p in raw_priorities if p and p.strip().lower() in PROVIDER_HANDLERS]
    if not valid_priorities:
        valid_priorities = ['groq', 'gemini']
    active = get_active_provider()
    active_clean = active.strip().lower() if active else None
    healthy = [p for p in valid_priorities if not _is_in_cooldown(p)]
    cooling = [p for p in valid_priorities if _is_in_cooldown(p)]
    if active_clean and active_clean in healthy:
        ordered_healthy = [active_clean] + [p for p in healthy if p != active_clean]
    else:
        ordered_healthy = healthy
    if not ordered_healthy:
        return valid_priorities
    return ordered_healthy + cooling

NO_LLM_KEYS_MESSAGE = "NO_LLM_KEYS: You don't have any LLM API keys configured. Please add an LLM key in AI Configurations (/configurations/ai-config)."

def call_llm(prompt: str, work: str='summarization') -> str:
    if not prompt or not str(prompt).strip():
        return ''
    # Protect backend: immediately return clear error if no LLM keys configured
    from config import CONFIG
    if not CONFIG.has_any_llm_key(force_refresh=True):
        log_error("[Engine LLM] No LLM API keys configured in Vault. Rejecting LLM call to protect backend.")
        return NO_LLM_KEYS_MESSAGE
    work_clean = str(work).strip().lower() if work else 'summarization'
    raw_priorities: List[str] = get_ai_priorities()
    providers_order = get_ordered_providers(raw_priorities)
    log(f"[Engine LLM] Initiating LLM call for work='{work_clean}' across candidate order: {providers_order}")
    last_error: Optional[Exception] = None
    for provider in providers_order:
        handler = PROVIDER_HANDLERS.get(provider)
        if not handler:
            continue
        log(f"[Engine LLM] Routing request to provider: '{provider}'")
        try:
            set_active_provider(provider)
            raw_result = handler(prompt, work_clean)
            parsed_result = parse_response(raw_result)
            if parsed_result:
                _mark_provider_success(provider)
                log(f"[Engine LLM] Provider '{provider}' succeeded for work='{work_clean}'")
                return parsed_result
            log_error(f"[Engine LLM] Provider '{provider}' returned empty response, trying next provider...")
        except Exception as e:
            last_error = e
            _mark_provider_failure(provider)
            log_error(f"[Engine LLM] Provider '{provider}' failed: {mask_sensitive(str(e))}. Moving to next provider...")
            continue
    log_error('[Engine LLM] All configured providers failed to satisfy request.')
    return AI_UNAVAILABLE_MESSAGE
