from __future__ import annotations
import logging
from typing import List, Optional
import requests
from .config import get_models_for_work, get_temperature, get_provider_config, get_active_key, rotate_key
from .error_analysis import ErrorType, classify_error, mask_sensitive, AllKeysExhaustedError, AllModelsExhaustedError, ProviderUnavailableError
from .response_parser import parse_response

logger = logging.getLogger('mira.engine.llm.gemini')

def log(msg: str) -> None:
    from vault_logger import log as v_log
    v_log(mask_sensitive(msg))

def log_error(msg: str) -> None:
    from vault_logger import log_error as v_log_error
    v_log_error(mask_sensitive(msg))

def call(prompt: str, work: str) -> str:
    prov_cfg = get_provider_config('gemini')
    keys: List[str] = prov_cfg.get('keys', [])
    if not keys:
        log_error('[Gemini] No API keys configured for Gemini in Vault.')
        raise ProviderUnavailableError('Gemini has no API keys configured.')
    models: List[str] = get_models_for_work(work, 'gemini')
    if not models:
        log_error(f"[Gemini] No models configured for work='{work}' in config.json")
        raise AllModelsExhaustedError('gemini')
    temperature = get_temperature(work)
    log(f"[Gemini] Starting request for work='{work}' (temperature={temperature}, models={models}, keys={len(keys)})")
    
    for model_idx, model in enumerate(models):
        key_attempts = 0
        max_key_attempts = max(1, len(keys))
        while key_attempts < max_key_attempts:
            active_key = get_active_key('gemini')
            if not active_key:
                raise ProviderUnavailableError('No active key found for Gemini.')
            try:
                log(f"[Gemini] Invoking model '{model}' (attempt {key_attempts + 1} with active key index)")
                url = f"https://generativelanguage.googleapis.com/v1beta/models/{model}:generateContent?key={active_key}"
                payload = {
                    "contents": [{"parts": [{"text": prompt}]}],
                    "generationConfig": {"temperature": temperature}
                }
                resp = requests.post(url, json=payload, timeout=20)
                
                if resp.status_code == 200:
                    data = resp.json()
                    candidates = data.get("candidates", [])
                    if candidates and "content" in candidates[0]:
                        parts = candidates[0]["content"].get("parts", [])
                        text = "".join(p.get("text", "") for p in parts).strip()
                        if text:
                            log(f"[Gemini] Successfully generated response with model '{model}'")
                            return text
                    log_error(f"[Gemini] Model '{model}' returned 200 but empty parts, trying next model...")
                    break

                if resp.status_code in (401, 403, 429):
                    log_error(f"[Gemini] Key returned status {resp.status_code}: {resp.text[:200]}")
                    key_attempts += 1
                    if key_attempts >= len(keys):
                        log_error(f"[Gemini] All Gemini API keys failed for model '{model}'. Falling back to next configured model...")
                        break
                    new_key = rotate_key('gemini')
                    log(f"[Gemini] Rotated key. Retrying model '{model}' with next key...")
                    continue

                if resp.status_code == 404:
                    log_error(f"[Gemini] Model '{model}' returned 404 (not found / deprecated). Falling back to next configured model...")
                    break

                log_error(f"[Gemini] Model '{model}' HTTP {resp.status_code}: {resp.text[:200]}, trying next model...")
                break

            except requests.Timeout:
                log_error(f"[Gemini] Model '{model}' timed out after 20s. Trying next configured model...")
                break
            except Exception as e:
                log_error(f"[Gemini] Error invoking model '{model}': {mask_sensitive(str(e))}")
                break

    log_error('[Gemini] All configured models failed.')
    raise AllModelsExhaustedError('gemini')

call_gemini = call
generate = call
