from __future__ import annotations
import logging
from typing import List, Optional
import groq
from .config import get_models_for_work, get_temperature, get_provider_config, get_active_key, rotate_key
from .error_analysis import ErrorType, classify_error, mask_sensitive, AllKeysExhaustedError, AllModelsExhaustedError, ProviderUnavailableError
from .response_parser import parse_response
logger = logging.getLogger('mira.engine.llm.groq')

def log(msg: str) -> None:
    from vault_logger import log as v_log
    v_log(mask_sensitive(msg))

def log_error(msg: str) -> None:
    from vault_logger import log_error as v_log_error
    v_log_error(mask_sensitive(msg))

def call(prompt: str, work: str) -> str:
    prov_cfg = get_provider_config('groq')
    keys: List[str] = prov_cfg.get('keys', [])
    if not keys:
        log_error('[Groq] No API keys configured for Groq in Vault.')
        raise ProviderUnavailableError('Groq has no API keys configured.')
    models: List[str] = get_models_for_work(work, 'groq')
    if not models:
        log_error(f"[Groq] No models configured for work='{work}' in config.json")
        raise AllModelsExhaustedError('groq')
    temperature = get_temperature(work)
    log(f"[Groq] Starting request for work='{work}' (temperature={temperature}, models={models}, keys={len(keys)})")
    for model_idx, model in enumerate(models):
        key_attempts = 0
        max_key_attempts = max(1, len(keys))
        while key_attempts < max_key_attempts:
            active_key = get_active_key('groq')
            if not active_key:
                raise ProviderUnavailableError('No active key found for Groq.')
            try:
                log(f"[Groq] Invoking model '{model}' (attempt {key_attempts + 1} with active key index)")
                client = groq.Groq(api_key=active_key, timeout=15.0)
                response = client.chat.completions.create(model=model, messages=[{'role': 'user', 'content': prompt}], temperature=temperature)
                parsed_text = parse_response(response)
                log(f"[Groq] Successfully generated response with model '{model}'")
                return parsed_text
            except Exception as e:
                err_type = classify_error(e, provider='groq')
                log_error(f"[Groq] Model '{model}' error classified as '{err_type.value}': {mask_sensitive(str(e))}")
                if err_type == ErrorType.API_KEY_EXPIRED_OR_INVALID:
                    key_attempts += 1
                    if key_attempts >= len(keys):
                        log_error(f"[Groq] All Groq API keys failed for model '{model}'. Falling back to next configured model...")
                        break
                    new_key = rotate_key('groq')
                    log(f"[Groq] Rotated key. Retrying model '{model}' with next key...")
                    continue
                elif err_type == ErrorType.MODEL_UNAVAILABLE:
                    log(f"[Groq] Model '{model}' is unavailable. Falling back to next configured model...")
                    break
                elif err_type == ErrorType.PROVIDER_UNAVAILABLE:
                    log_error('[Groq] Provider service is unavailable.')
                    raise ProviderUnavailableError('Groq service is unavailable.')
                else:
                    log_error(f"[Groq] Unknown/unrecoverable error on model '{model}', falling back to next model...")
                    break
    log_error('[Groq] All configured models failed.')
    raise AllModelsExhaustedError('groq')
call_groq = call
generate = call
