from __future__ import annotations

import os
from pathlib import Path
import sys

_engine_dir = Path(__file__).resolve().parent.parent
if str(_engine_dir) not in sys.path:
    sys.path.insert(0, str(_engine_dir))

import config as engine_config

CONSUMER_KEY_LLM_CHAT: str = "llm_chat"
CONSUMER_GROUP_LLM_CHAT: str = "CONSUMER_GROUP_LLM_CHAT"

# =========================================================================
# SHORT-TERM MEMORY CONFIGURATION & STRATEGIES
# =========================================================================
# Strategy 1: "count" - Stores chat history bounded by number of recent chat turns
# Strategy 2: "tokens" - Stores chat history bounded by total token count
MEMORY_STRATEGY_COUNT: str = "count"
MEMORY_STRATEGY_TOKENS: str = "tokens"

# Switch variable: Change between MEMORY_STRATEGY_COUNT and MEMORY_STRATEGY_TOKENS
SHORT_TERM_MEMORY_STRATEGY: str = MEMORY_STRATEGY_TOKENS

# Strategy 1 (Count Approach):
# Maximum number of chat turns stored in short-term memory per session
MAX_SHORT_TERM_CHATS: int = 10
MAX_SHORT_TERM_MEMORY: int = MAX_SHORT_TERM_CHATS  # Backward compatibility alias

# Strategy 2 (Token Approach):
# Maximum token count stored in short-term memory per session
# Groq Free Tier LLM Considerations:
#   - Groq free tier models (e.g. llama-3.3-70b-versatile, qwen/qwen3.8-27b) enforce ~6,000 TPM (Tokens Per Minute).
#   - Mira system preamble & workflow instructions require ~400 - 600 tokens.
#   - User queries can be substantial (1,000 - 2,000 tokens when pasting code snippets or error logs).
#   - Output completion reservation needs ~800 - 1,500 tokens.
#   - A 2,500 token budget retains ~8-15 normal conversation turns (or 3-5 code-heavy turns) while
#     guaranteeing total prompt tokens stay comfortably below 5,000, avoiding Groq 429 TPM rate-limit errors.
MAX_SHORT_TERM_TOKENS: int = 2500

DEFAULT_CHAT_WORKERS: int = 1
DEFAULT_POLL_TIME: float = 0.2


def get_broker_base_url() -> str:
    mb_url = engine_config.get_service_url("message_broker") or engine_config.MESSAGE_BROKER_URL
    if not mb_url:
        mb_url = "http://127.0.0.1:9002"
    return mb_url.rstrip("/")


def get_vault_base_url() -> str:
    vault_url = engine_config.get_service_url("vault") or engine_config.VAULT_URL
    if not vault_url:
        vault_url = "http://127.0.0.1:9001"
    return vault_url.rstrip("/")


def get_chat_workers_count() -> int:
    workers_cfg = engine_config.CONFIG.get_workers_config()
    count = workers_cfg.get("chat_workers", DEFAULT_CHAT_WORKERS)
    try:
        return max(1, min(int(count), 20))
    except (ValueError, TypeError):
        return DEFAULT_CHAT_WORKERS


def get_chat_poll_time() -> float:
    workers_cfg = engine_config.CONFIG.get_workers_config()
    poll = workers_cfg.get("chat_workers_poll_time", DEFAULT_POLL_TIME)
    try:
        return max(0.1, min(float(poll), 60.0))
    except (ValueError, TypeError):
        return DEFAULT_POLL_TIME
