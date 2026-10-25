from __future__ import annotations

import logging
from typing import Any, Dict, List, Optional
from pathlib import Path

from .config import (
    CONSUMER_KEY_USER_KB,
    CONSUMER_GROUP_USER_KB,
    DEFAULT_BATCH_SIZE,
    get_kb_enc_path,
    get_kb_db_path,
    get_kb_workers_count,
    get_kb_workers_poll_time,
    cleanup_legacy_plaintext_files,
)
from .storage import (
    check_kb_exists,
    init_kb,
    update_user_identity,
    get_user_identity,
    save_extracted_batch,
    get_full_knowledge_base,
    search_knowledge_base,
    clear_user_knowledge_base,
    delete_knowledge_base_record,
)
from .crypto import (
    encrypt_kb_data,
    decrypt_kb_data,
    lock_kb_file,
    unlock_kb_file,
)
from .broker_client import (
    poll_jobs,
    remove_job,
    remove_jobs_batch,
    fetch_user_from_vault,
)
from .extractor import extract_user_info_from_batch
from .worker import (
    worker_manager,
    start_user_knowledge_base,
    stop_user_knowledge_base,
    get_user_knowledge_base_status,
    sync_user_knowledge_base_from_vault,
)
from .client import (
    get_user_profile,
    get_user_preferences,
    get_user_likings,
    get_user_dislikes,
    get_music_preferences,
    get_viewing_interests,
    get_sports_interests,
    get_life_activities,
    search_user_knowledge,
    get_complete_knowledge_base,
    get_user_summary_for_llm,
)
from vault_logger import log, log_error

logger = logging.getLogger("mira.engine.user_knowledge_base")


def init_user_knowledge_base(
    force_create: bool = False,
    enc_path: Optional[Path] = None,
    db_path: Optional[Path] = None,
) -> bool:
    """
    On Engine startup:
    1. Purges any legacy plaintext database/JSON files.
    2. Check whether the user's encrypted Knowledge Base exists. Create it if it does not.
    3. Fetch the user's existing data from the user table in Vault and populate the Knowledge Base.
    """
    target_path = enc_path or db_path
    try:
        cleanup_legacy_plaintext_files()

        exists = check_kb_exists(enc_path=target_path)
        if not exists:
            log("[UserKnowledgeBase] Encrypted Knowledge Base does not exist. Initializing...")
            init_kb(force_create=True, enc_path=target_path)
        else:
            log("[UserKnowledgeBase] Existing encrypted Knowledge Base found. Verifying schema...")
            init_kb(force_create=False, enc_path=target_path)

        user_data = fetch_user_from_vault()
        if user_data:
            update_user_identity(user_data, enc_path=target_path)
            log(
                f"[UserKnowledgeBase] Successfully populated user data into Knowledge Base: "
                f"{user_data.get('user_name', 'User')}"
            )
        else:
            log("[UserKnowledgeBase] No existing user data found in Vault to populate.")

        return True
    except Exception as e:
        log_error(f"[UserKnowledgeBase] Failed to initialize User Knowledge Base: {e}")
        return False


__all__ = [
    "init_user_knowledge_base",
    "start_user_knowledge_base",
    "stop_user_knowledge_base",
    "get_user_knowledge_base_status",
    "sync_user_knowledge_base_from_vault",
    "get_full_knowledge_base",
    "search_knowledge_base",
    "check_kb_exists",
    "init_kb",
    "update_user_identity",
    "get_user_identity",
    "save_extracted_batch",
    "worker_manager",
    "poll_jobs",
    "remove_job",
    "remove_jobs_batch",
    "fetch_user_from_vault",
    "extract_user_info_from_batch",
    "CONSUMER_KEY_USER_KB",
    "CONSUMER_GROUP_USER_KB",
    "DEFAULT_BATCH_SIZE",
    "get_kb_enc_path",
    "get_kb_db_path",
    "get_kb_workers_count",
    "get_kb_workers_poll_time",
    "cleanup_legacy_plaintext_files",
    "get_user_profile",
    "get_user_preferences",
    "get_user_likings",
    "get_user_dislikes",
    "get_music_preferences",
    "get_viewing_interests",
    "get_sports_interests",
    "get_life_activities",
    "search_user_knowledge",
    "get_complete_knowledge_base",
    "get_user_summary_for_llm",
    "clear_user_knowledge_base",
    "delete_knowledge_base_record",
]
