from __future__ import annotations
from enum import Enum
import re
from typing import Any, Optional

class ErrorType(str, Enum):
    API_KEY_EXPIRED_OR_INVALID = 'api_key_expired_or_invalid'
    PROVIDER_UNAVAILABLE = 'provider_unavailable'
    MODEL_UNAVAILABLE = 'model_unavailable'
    OTHER_OR_UNKNOWN = 'other_or_unknown'

class LLMError(Exception):

    def __init__(self, message: str, error_type: ErrorType=ErrorType.OTHER_OR_UNKNOWN):
        super().__init__(message)
        self.error_type = error_type

class KeyExpiredOrInvalidError(LLMError):

    def __init__(self, message: str='API key expired or invalid'):
        super().__init__(message, ErrorType.API_KEY_EXPIRED_OR_INVALID)

class ModelUnavailableError(LLMError):

    def __init__(self, message: str='Configured model is currently unavailable'):
        super().__init__(message, ErrorType.MODEL_UNAVAILABLE)

class ProviderUnavailableError(LLMError):

    def __init__(self, message: str='Provider service is currently unavailable'):
        super().__init__(message, ErrorType.PROVIDER_UNAVAILABLE)

class AllKeysExhaustedError(LLMError):

    def __init__(self, provider: str):
        super().__init__(f"All API keys exhausted for provider '{provider}'", ErrorType.API_KEY_EXPIRED_OR_INVALID)
        self.provider = provider

class AllModelsExhaustedError(LLMError):

    def __init__(self, provider: str):
        super().__init__(f"All models exhausted for provider '{provider}'", ErrorType.MODEL_UNAVAILABLE)
        self.provider = provider
_KEY_PATTERNS = [re.compile('gsk_[a-zA-Z0-9]{20,}', re.IGNORECASE), re.compile('AQ\\.[a-zA-Z0-9_\\-]{20,}', re.IGNORECASE), re.compile('AIza[a-zA-Z0-9_\\-]{20,}', re.IGNORECASE), re.compile('sk-[a-zA-Z0-9_\\-]{20,}', re.IGNORECASE)]

def mask_sensitive(text: Any) -> str:
    if not isinstance(text, str):
        text = str(text)
    sanitized = text
    for pattern in _KEY_PATTERNS:
        sanitized = pattern.sub('[REDACTED_API_KEY]', sanitized)
    return sanitized

def classify_error(error: Any, provider: Optional[str]=None) -> ErrorType:
    if isinstance(error, LLMError):
        return error.error_type
    err_name = type(error).__name__
    err_str = str(error).lower()
    status_code = getattr(error, 'status_code', getattr(error, 'code', None))
    if 'AuthenticationError' in err_name or 'PermissionDeniedError' in err_name:
        return ErrorType.API_KEY_EXPIRED_OR_INVALID
    if 'NotFoundError' in err_name:
        return ErrorType.MODEL_UNAVAILABLE
    if 'APIConnectionError' in err_name or 'APITimeoutError' in err_name or 'InternalServerError' in err_name:
        return ErrorType.PROVIDER_UNAVAILABLE
    if 'ClientError' in err_name:
        if status_code in (401, 403) or 'api_key_invalid' in err_str or 'api key not valid' in err_str or ('permission_denied' in err_str):
            return ErrorType.API_KEY_EXPIRED_OR_INVALID
        if status_code == 404 or 'not_found' in err_str or 'no longer available' in err_str or ('not found' in err_str):
            return ErrorType.MODEL_UNAVAILABLE
        if 'quota' in err_str or 'resource_exhausted' in err_str:
            if 'key' in err_str or 'project' in err_str:
                return ErrorType.API_KEY_EXPIRED_OR_INVALID
            return ErrorType.MODEL_UNAVAILABLE
    if 'ServerError' in err_name:
        return ErrorType.PROVIDER_UNAVAILABLE
    if any((k in err_name for k in ['ConnectError', 'Timeout', 'ConnectionError', 'NetworkError', 'URLError', 'socket'])):
        return ErrorType.PROVIDER_UNAVAILABLE
    if status_code == 401 or status_code == 403:
        return ErrorType.API_KEY_EXPIRED_OR_INVALID
    if status_code == 404:
        return ErrorType.MODEL_UNAVAILABLE
    if status_code in (500, 502, 503, 504):
        return ErrorType.PROVIDER_UNAVAILABLE
    key_indicators = ['invalid api key', 'api key not valid', 'invalid_api_key', 'api_key_invalid', 'unauthenticated', 'authentication failed', 'expired key', 'key expired', 'permission denied', 'unauthorized', 'forbidden']
    for ind in key_indicators:
        if ind in err_str:
            return ErrorType.API_KEY_EXPIRED_OR_INVALID
    model_indicators = ['model_not_found', 'model not found', 'does not exist or you do not have access', 'no longer available', 'is deprecated', 'decommissioned', 'model_decommissioned', 'not supported for generatecontent', 'unknown model', 'model is overloaded']
    for ind in model_indicators:
        if ind in err_str:
            return ErrorType.MODEL_UNAVAILABLE
    provider_indicators = ['connection refused', 'failed to establish a new connection', 'connection error', 'timed out', 'timeout', 'service unavailable', 'bad gateway', 'gateway timeout', 'internal server error', 'temporarily unavailable']
    for ind in provider_indicators:
        if ind in err_str:
            return ErrorType.PROVIDER_UNAVAILABLE
    return ErrorType.OTHER_OR_UNKNOWN
