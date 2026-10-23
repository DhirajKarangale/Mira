from __future__ import annotations

import logging
from typing import List, Optional
from google import genai
from google.genai import types

from .config import (
    get_models_for_work,
    get_temperature,
    get_provider_config,
    get_active_key,
    rotate_key,
)
from .error_analysis import (
    ErrorType,
    classify_error,
    mask_sensitive,
    AllKeysExhaustedError,
    AllModelsExhaustedError,
    ProviderUnavailableError,
)
from .response_parser import parse_response

logger = logging.getLogger("mira.engine.llm.gemini")

def log(msg: str) -> None:
    from vault_logger import log as v_log
    v_log(mask_sensitive(msg))

def log_error(msg: str) -> None:
    from vault_logger import log_error as v_log_error
    v_log_error(mask_sensitive(msg))

def call(prompt: str, work: str) -> str:
    """Executes an LLM request against Google Gemini with model fallback and key rotation.
    
    Accepts:
        prompt: User or task prompt string.
        work: Target work configuration (e.g. 'summarization', 'chat', 'extraction').
    Returns:
        Clean parsed text response from the model.
    Raises:
        ProviderUnavailableError: If provider cannot be contacted or has no keys.
        AllKeysExhaustedError: If all API keys failed due to invalidity or expiration.
        AllModelsExhaustedError: If all configured models failed.
    """
    prov_cfg = get_provider_config("gemini")
    keys: List[str] = prov_cfg.get("keys", [])
    if not keys:
        log_error("[Gemini] No API keys configured for Gemini in Vault.")
        raise ProviderUnavailableError("Gemini has no API keys configured.")

    models: List[str] = get_models_for_work(work, "gemini")
    if not models:
        models = ["gemini-2.5-flash", "gemini-3.8-flash", "gemini-2.5-flash-lite"]

    temperature = get_temperature(work)
    log(f"[Gemini] Starting request for work='{work}' (temperature={temperature}, models={models}, keys={len(keys)})")

    # Iterate through models in configured priority order
    for model_idx, model in enumerate(models):
        key_attempts = 0
        max_key_attempts = max(1, len(keys))

        while key_attempts < max_key_attempts:
            active_key = get_active_key("gemini")
            if not active_key:
                raise ProviderUnavailableError("No active key found for Gemini.")

            try:
                log(f"[Gemini] Invoking model '{model}' (attempt {key_attempts + 1} with active key index)")
                client = genai.Client(api_key=active_key, http_options={"timeout": 30})
                gen_config = types.GenerateContentConfig(temperature=temperature)

                response = client.models.generate_content(
                    model=model,
                    contents=prompt,
                    config=gen_config,
                )

                parsed_text = parse_response(response)
                log(f"[Gemini] Successfully generated response with model '{model}'")
                return parsed_text

            except Exception as e:
                err_type = classify_error(e, provider="gemini")
                log_error(f"[Gemini] Model '{model}' error classified as '{err_type.value}': {mask_sensitive(str(e))}")

                if err_type == ErrorType.API_KEY_EXPIRED_OR_INVALID:
                    key_attempts += 1
                    if key_attempts >= len(keys):
                        log_error("[Gemini] All Gemini API keys failed due to expiration or invalidity.")
                        raise AllKeysExhaustedError("gemini")
                    # Rotate key and retry current model
                    new_key = rotate_key("gemini")
                    log(f"[Gemini] Rotated key. Retrying model '{model}' with next key...")
                    continue

                elif err_type == ErrorType.MODEL_UNAVAILABLE:
                    log(f"[Gemini] Model '{model}' is unavailable. Falling back to next configured model...")
                    break  # Break inner key loop to advance to next model

                elif err_type == ErrorType.PROVIDER_UNAVAILABLE:
                    log_error("[Gemini] Provider service is unavailable.")
                    raise ProviderUnavailableError("Gemini service is unavailable.")

                else:
                    log_error(f"[Gemini] Unknown/unrecoverable error on model '{model}', falling back to next model...")
                    break  # Break inner key loop to try next model

    log_error("[Gemini] All configured models failed.")
    raise AllModelsExhaustedError("gemini")

# Aliases
call_gemini = call
generate = call
