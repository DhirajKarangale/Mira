"""Knowledge Base Submodule for MIRA Memory.

Manages monthly Qdrant vector databases, Vault-encrypted payload storage,
batch ingestion of embedding records from Message Broker, and parallel background workers.
"""
from __future__ import annotations

from .config import (
    DEFAULT_BATCH_SIZE,
    MAX_BATCH_SIZE,
    CONSUMER_KEY_EMBEDDING_MEMORY,
    CONSUMER_GROUP_EMBEDDING_MEMORY,
    DEFAULT_COLLECTION_NAME,
    get_worker_concurrency,
    get_worker_poll_time,
    get_system_storage_path,
)

from .encryption import (
    VaultCryptoClient,
    vault_crypto,
    encrypt_text,
    decrypt_text,
)

from .storage import (
    KnowledgeBaseStorage,
    kb_storage,
    get_active_kb_dir,
)

from .qdrant_store import (
    QdrantVectorStore,
)

from .broker_client import (
    poll_embedding_jobs,
    remove_embedding_job,
    remove_batch_jobs,
)

from .worker import (
    KnowledgeBaseWorkerManager,
    kb_worker_manager,
    process_kb_batch,
    run_standalone,
)

__all__ = [
    # Config
    "DEFAULT_BATCH_SIZE",
    "MAX_BATCH_SIZE",
    "CONSUMER_KEY_EMBEDDING_MEMORY",
    "CONSUMER_GROUP_EMBEDDING_MEMORY",
    "DEFAULT_COLLECTION_NAME",
    "get_worker_concurrency",
    "get_worker_poll_time",
    "get_system_storage_path",
    # Encryption
    "VaultCryptoClient",
    "vault_crypto",
    "encrypt_text",
    "decrypt_text",
    # Storage
    "KnowledgeBaseStorage",
    "kb_storage",
    "get_active_kb_dir",
    # Qdrant Vector Store
    "QdrantVectorStore",
    # Broker Client
    "poll_embedding_jobs",
    "remove_embedding_job",
    "remove_batch_jobs",
    # Worker Orchestration
    "KnowledgeBaseWorkerManager",
    "kb_worker_manager",
    "process_kb_batch",
    "run_standalone",
]
