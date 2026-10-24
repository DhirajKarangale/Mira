from __future__ import annotations

"""MIRA Memory Knowledge Base Submodule.

Manages local Qdrant vector store collections, dynamic monthly knowledge base
directory selection, batch ingestion, payload indexing, and parallel worker
orchestration with Message Broker.
"""

from .config import (
    DEFAULT_KB_BATCH_SIZE,
    MAX_KB_BATCH_SIZE,
    CONSUMER_KEY_EMBEDDING_MEMORY,
    CONSUMER_GROUP_EMBEDDING_MEMORY,
    COLLECTION_NAME,
    to_unix_timestamp,
    get_knowledge_base_dir,
    get_system_storage_path,
    get_worker_config,
    get_kb_retention_period,
)
from .storage import (
    KnowledgeBaseStorage,
    kb_storage,
    KB_NAME_PATTERN,
    calculate_retention_cutoff,
)
from .qdrant_store import (
    QdrantVectorStore,
)
from .broker_client import (
    poll_jobs,
    remove_job,
    acknowledge_batch,
)
from .worker import (
    KnowledgeBaseWorkerManager,
    kb_worker_manager,
)
from .encryption import (
    VaultCryptoClient,
    vault_crypto,
    encrypt_text,
    decrypt_text,
    IntegrityVerificationError,
    ENCRYPTION_PREFIX,
)
from .protection import (
    FolderProtectionManager,
    kb_protector,
    MANIFEST_FILENAME,
    LOCK_FILENAME,
    VAULT_SNAPSHOT_FILENAME,
)

__all__ = [
    "KnowledgeBaseStorage",
    "kb_storage",
    "KB_NAME_PATTERN",
    "QdrantVectorStore",
    "KnowledgeBaseWorkerManager",
    "kb_worker_manager",
    "poll_jobs",
    "remove_job",
    "acknowledge_batch",
    "VaultCryptoClient",
    "vault_crypto",
    "encrypt_text",
    "decrypt_text",
    "IntegrityVerificationError",
    "ENCRYPTION_PREFIX",
    "FolderProtectionManager",
    "kb_protector",
    "MANIFEST_FILENAME",
    "LOCK_FILENAME",
    "VAULT_SNAPSHOT_FILENAME",
    "DEFAULT_KB_BATCH_SIZE",
    "MAX_KB_BATCH_SIZE",
    "CONSUMER_KEY_EMBEDDING_MEMORY",
    "CONSUMER_GROUP_EMBEDDING_MEMORY",
    "COLLECTION_NAME",
    "to_unix_timestamp",
    "get_knowledge_base_dir",
    "get_system_storage_path",
    "get_worker_config",
    "get_kb_retention_period",
    "calculate_retention_cutoff",
]
