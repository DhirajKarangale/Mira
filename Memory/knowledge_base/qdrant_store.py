from __future__ import annotations

import json
import logging
import os
import sys
import threading
import uuid
import warnings
from pathlib import Path
from typing import Any, Dict, List, Optional, Tuple, Union

# Suppress local Qdrant warning regarding server payload indexes
warnings.filterwarnings("ignore", message=".*Payload indexes have no effect in the local Qdrant.*")

# Ensure Memory root is in sys.path
_memory_dir = Path(__file__).resolve().parent.parent
if str(_memory_dir) not in sys.path:
    sys.path.insert(0, str(_memory_dir))

from qdrant_client import QdrantClient, models
from vault_logger import log, log_error
from .config import (
    COLLECTION_NAME,
    to_unix_timestamp,
)
from .storage import KnowledgeBaseStorage, kb_storage
from .encryption import vault_crypto, IntegrityVerificationError, ENCRYPTION_PREFIX

logger = logging.getLogger("mira.memory.knowledge_base.qdrant")

class QdrantVectorStore:
    """Embedded local Qdrant Vector Store for MIRA Knowledge Bases.

    - Uses local embedded Qdrant storage.
    - Stores app_name, os, timestamp, summarized_text, and embedding.
    - Explicitly ignores job_id when storing point records.
    - Uses provided embedding directly without re-embedding.
    - Inserts jobs in batches with on-disk vectors and on-disk payloads for storage efficiency.
    - Creates payload indexes for app_name, os, and timestamp.
    - Supports vector search on summarized_text, app_name filtering, and Unix timestamp comparisons (gt, lt, between).
    """

    def __init__(self, storage: Optional[KnowledgeBaseStorage] = None) -> None:
        self.storage: KnowledgeBaseStorage = storage or kb_storage
        self._lock: threading.RLock = threading.RLock()
        self._client: Optional[QdrantClient] = None
        self._current_path: Optional[Path] = None
        self._known_dimensions: Dict[str, int] = {}

    def get_client(self) -> QdrantClient:
        """Returns the local Qdrant client for the active Knowledge Base directory."""
        with self._lock:
            active_path = self.storage.get_active_knowledge_base()

            if self._client is None or self._current_path != active_path:
                if self._client is not None:
                    try:
                        self._client.close()
                    except Exception:
                        pass
                self._current_path = active_path
                self._client = QdrantClient(path=str(active_path))
                log(f"[QdrantVectorStore] Initialized local Qdrant store at: {active_path}")

            return self._client

    def close(self) -> None:
        """Closes the current Qdrant client connection cleanly."""
        with self._lock:
            if self._client is not None:
                try:
                    self._client.close()
                except Exception as e:
                    log_error(f"[QdrantVectorStore] Error closing Qdrant client: {e}")
                finally:
                    self._client = None
                    self._current_path = None

    def reopen(self, new_path: Optional[Path] = None) -> None:
        """Reopens the Qdrant client connection on a target or active directory."""
        with self._lock:
            self.close()
            target_path = new_path or self.storage.get_active_knowledge_base()
            self._current_path = target_path
            self._client = QdrantClient(path=str(target_path))
            log(f"[QdrantVectorStore] Reopened Qdrant store at: {target_path}")

    def _ensure_collection(self, client: QdrantClient, vector_size: int) -> None:
        """Ensures the knowledge_base collection exists with on-disk storage and payload indexes."""
        existing_collections = [c.name for c in client.get_collections().collections]
        if COLLECTION_NAME not in existing_collections:
            log(f"[QdrantVectorStore] Creating collection '{COLLECTION_NAME}' with dim={vector_size} (on-disk optimized)")
            client.create_collection(
                collection_name=COLLECTION_NAME,
                vectors_config=models.VectorParams(
                    size=vector_size,
                    distance=models.Distance.COSINE,
                    on_disk=True,
                ),
                on_disk_payload=True,
                optimizers_config=models.OptimizersConfigDiff(memmap_threshold=20000),
            )

            # Payload indexes for app_name, os, and timestamp
            try:
                client.create_payload_index(
                    collection_name=COLLECTION_NAME,
                    field_name="app_name",
                    field_schema=models.PayloadSchemaType.KEYWORD,
                )
                client.create_payload_index(
                    collection_name=COLLECTION_NAME,
                    field_name="os",
                    field_schema=models.PayloadSchemaType.KEYWORD,
                )
                client.create_payload_index(
                    collection_name=COLLECTION_NAME,
                    field_name="timestamp",
                    field_schema=models.PayloadSchemaType.INTEGER,
                )
                client.create_payload_index(
                    collection_name=COLLECTION_NAME,
                    field_name="summarized_text",
                    field_schema=models.TextIndexParams(
                        type="text",
                        tokenizer=models.TokenizerType.WORD,
                        lowercase=True,
                    ),
                )
            except Exception as e:
                log(f"[QdrantVectorStore] Note on payload index creation: {e}")

    def ingest_batch(
        self,
        jobs: List[Dict[str, Any]],
        return_job_ids: bool = False
    ) -> Union[bool, Tuple[int, List[str]]]:
        """Ingests a batch of jobs into Qdrant with data encrypted at rest.

        - Stores app_name, os, timestamp, summarized_text (encrypted at rest), and embedding.
        - Uses XChaCha20-Poly1305 authenticated encryption via Vault key management.
        - Ignores job_id when storing point records (never stored in payload or point ID).
        - Uses the provided embedding directly.
        - Inserts jobs in batches for storage efficiency.
        - Updates the Knowledge Base end date to current date only upon successful ingestion.
        """
        if not jobs:
            return (0, []) if return_job_ids else True

        with self._lock:
            client = self.get_client()

            valid_records: List[Dict[str, Any]] = []
            successful_job_ids: List[str] = []
            vector_dim: Optional[int] = None

            for job in jobs:
                if not isinstance(job, dict):
                    continue

                # Handle potential stringified inner job_data
                inner_job = dict(job)
                if "job_data" in inner_job:
                    jd = inner_job["job_data"]
                    if isinstance(jd, str):
                        try:
                            jd = json.loads(jd)
                        except Exception:
                            jd = {}
                    if isinstance(jd, dict):
                        for k, v in jd.items():
                            if k not in inner_job or inner_job[k] is None:
                                inner_job[k] = v

                raw_emb = inner_job.get("embedding")
                if isinstance(raw_emb, str):
                    try:
                        raw_emb = json.loads(raw_emb)
                    except Exception:
                        raw_emb = None

                if not raw_emb or not isinstance(raw_emb, list) or len(raw_emb) == 0:
                    log_error(f"[QdrantVectorStore] Skipping job missing valid embedding: {inner_job.get('job_id')}")
                    continue

                try:
                    embedding_vector = [float(x) for x in raw_emb]
                except (ValueError, TypeError) as e:
                    log_error(f"[QdrantVectorStore] Invalid float values in embedding: {e}")
                    continue

                if vector_dim is None:
                    vector_dim = len(embedding_vector)

                app_name = str(inner_job.get("app_name") or "Unknown").strip()
                os_name = str(inner_job.get("os") or "Unknown").strip()
                summarized_text = str(inner_job.get("summarized_text") or "").strip()
                raw_ts = inner_job.get("timestamp")
                unix_ts = to_unix_timestamp(raw_ts)

                orig_job_id = str(job.get("job_id") or job.get("_stream_id") or "").strip()

                valid_records.append({
                    "vector": embedding_vector,
                    "app_name": app_name,
                    "os": os_name,
                    "timestamp": unix_ts,
                    "summarized_text": summarized_text,
                    "orig_job_id": orig_job_id,
                })

            if not valid_records:
                log_error("[QdrantVectorStore] No valid points to insert in batch.")
                return (0, []) if return_job_ids else False

            # Batch encrypt summarized_text for storage at rest
            raw_texts = [r["summarized_text"] for r in valid_records]
            try:
                encrypted_texts = vault_crypto.encrypt_batch(raw_texts)
            except Exception as e:
                log_error(f"[QdrantVectorStore] Knowledge Base encryption failed: {e}")
                raise RuntimeError(f"Failed to encrypt Knowledge Base data at rest: {e}")

            points: List[models.PointStruct] = []
            for r, enc_text in zip(valid_records, encrypted_texts):
                payload = {
                    "app_name": r["app_name"],
                    "os": r["os"],
                    "timestamp": r["timestamp"],
                    "summarized_text": enc_text,
                    "_encrypted": True,
                }
                point_id = str(uuid.uuid4())
                points.append(
                    models.PointStruct(
                        id=point_id,
                        vector=r["vector"],
                        payload=payload,
                    )
                )
                if r["orig_job_id"]:
                    successful_job_ids.append(r["orig_job_id"])

            try:
                self._ensure_collection(client, vector_dim or len(points[0].vector))
                client.upsert(collection_name=COLLECTION_NAME, points=points)
                log(f"[QdrantVectorStore] Successfully ingested {len(points)} encrypted points into '{COLLECTION_NAME}'")

                # Update the Knowledge Base end date to the current date only when new data is successfully ingested
                self.storage.update_end_date_on_ingestion(
                    before_rename_cb=self.close,
                    after_rename_cb=self.reopen,
                )

                if return_job_ids:
                    return (len(points), successful_job_ids)
                return True
            except Exception as e:
                log_error(f"[QdrantVectorStore] Batch upsert failed: {e}")
                if return_job_ids:
                    return (0, [])
                return False

    def search(
        self,
        query_vector: Optional[List[float]] = None,
        limit: int = 5,
        app_name: Optional[Union[str, List[str]]] = None,
        os_name: Optional[str] = None,
        start_timestamp: Optional[Union[int, float, str]] = None,
        end_timestamp: Optional[Union[int, float, str]] = None,
        timestamp_gt: Optional[Union[int, float, str]] = None,
        timestamp_gte: Optional[Union[int, float, str]] = None,
        timestamp_lt: Optional[Union[int, float, str]] = None,
        timestamp_lte: Optional[Union[int, float, str]] = None,
        text_query: Optional[str] = None,
        timestamp_between: Optional[Tuple[Any, Any]] = None,
        **kwargs: Any,
    ) -> List[Dict[str, Any]]:
        """Searches the Knowledge Base with vector similarity, app filtering, timestamp comparisons,
        and transparent on-read decryption with cryptographic integrity verification.
        """
        with self._lock:
            client = self.get_client()

            # Check if collection exists
            existing_collections = [c.name for c in client.get_collections().collections]
            if COLLECTION_NAME not in existing_collections:
                return []

            filter_conditions: List[models.FieldCondition] = []

            # 1. Efficient filtering by app_name (single value or multiple via MatchAny)
            if app_name is not None:
                if isinstance(app_name, (list, tuple, set)):
                    clean_apps = [str(a).strip() for a in app_name if str(a).strip()]
                    if clean_apps:
                        filter_conditions.append(
                            models.FieldCondition(key="app_name", match=models.MatchAny(any=clean_apps))
                        )
                elif str(app_name).strip():
                    filter_conditions.append(
                        models.FieldCondition(key="app_name", match=models.MatchValue(value=str(app_name).strip()))
                    )

            # 2. Filtering by OS
            if os_name is not None and str(os_name).strip():
                filter_conditions.append(
                    models.FieldCondition(key="os", match=models.MatchValue(value=str(os_name).strip()))
                )

            # 3. Exclusive Unix timestamp comparisons: greater than, less than, and between conditions
            range_params: Dict[str, int] = {}

            # Greater than conditions
            if timestamp_gt is not None:
                range_params["gt"] = to_unix_timestamp(timestamp_gt)
            elif timestamp_gte is not None:
                range_params["gte"] = to_unix_timestamp(timestamp_gte)
            elif start_timestamp is not None:
                range_params["gte"] = to_unix_timestamp(start_timestamp)

            # Less than conditions
            if timestamp_lt is not None:
                range_params["lt"] = to_unix_timestamp(timestamp_lt)
            elif timestamp_lte is not None:
                range_params["lte"] = to_unix_timestamp(timestamp_lte)
            elif end_timestamp is not None:
                range_params["lte"] = to_unix_timestamp(end_timestamp)

            # Between condition via explicit tuple
            if timestamp_between and len(timestamp_between) == 2:
                range_params["gte"] = to_unix_timestamp(timestamp_between[0])
                range_params["lte"] = to_unix_timestamp(timestamp_between[1])

            if range_params:
                filter_conditions.append(
                    models.FieldCondition(key="timestamp", range=models.Range(**range_params))
                )

            query_filter = models.Filter(must=filter_conditions) if filter_conditions else None

            # Execute search
            limit_val = max(1, min(int(limit), 100))
            has_text_query = bool(text_query and str(text_query).strip())
            query_text_clean = str(text_query).strip().lower() if has_text_query else None
            # Retrieve slightly larger window when post-filtering on decrypted text
            fetch_limit = min(max(limit_val * 4, 25), 100) if has_text_query else limit_val

            try:
                if query_vector is not None and len(query_vector) > 0:
                    clean_vec = [float(x) for x in query_vector]
                    search_res = client.query_points(
                        collection_name=COLLECTION_NAME,
                        query=clean_vec,
                        query_filter=query_filter,
                        limit=fetch_limit,
                    )
                    points = search_res.points
                else:
                    # Fallback scroll if no vector is provided
                    scroll_res, _ = client.scroll(
                        collection_name=COLLECTION_NAME,
                        scroll_filter=query_filter,
                        limit=fetch_limit,
                        with_payload=True,
                        with_vectors=False,
                    )
                    points = scroll_res

                results: List[Dict[str, Any]] = []

                for pt in points:
                    payload = pt.payload or {}
                    raw_text = payload.get("summarized_text", "")
                    decrypted_text = ""

                    # Transparent decryption with Poly1305 MAC tag integrity verification
                    try:
                        if raw_text:
                            decrypted_text = vault_crypto.decrypt(raw_text)
                    except IntegrityVerificationError as e:
                        log_error(
                            f"[QdrantVectorStore] Cryptographic integrity verification failed for point {pt.id}. "
                            f"Unauthorized modification detected: {e}. Skipping compromised record."
                        )
                        continue
                    except Exception as e:
                        log_error(f"[QdrantVectorStore] Decryption error for point {pt.id}: {e}")
                        if vault_crypto.is_encrypted(raw_text):
                            continue
                        decrypted_text = str(raw_text)

                    # Post-search text matching on decrypted plaintext
                    if query_text_clean is not None:
                        if query_text_clean not in decrypted_text.lower():
                            continue

                    score_val = float(getattr(pt, "score", 1.0))
                    decrypted_payload = dict(payload)
                    decrypted_payload["summarized_text"] = decrypted_text

                    results.append({
                        "id": str(pt.id),
                        "score": score_val,
                        "app_name": payload.get("app_name", "Unknown"),
                        "os": payload.get("os", "Unknown"),
                        "timestamp": payload.get("timestamp"),
                        "summarized_text": decrypted_text,
                        "payload": decrypted_payload,
                    })

                    if len(results) >= limit_val:
                        break

                return results
            except Exception as e:
                log_error(f"[QdrantVectorStore] Search query failed: {e}")
                raise

    def get_point(self, point_id: str) -> Optional[Dict[str, Any]]:
        """Retrieves and decrypts a single point by ID with cryptographic integrity verification."""
        with self._lock:
            client = self.get_client()
            try:
                res = client.retrieve(
                    collection_name=COLLECTION_NAME,
                    ids=[point_id],
                    with_payload=True,
                    with_vectors=True,
                )
                if not res:
                    return None
                pt = res[0]
                payload = pt.payload or {}
                raw_text = payload.get("summarized_text", "")
                decrypted_text = ""
                try:
                    if raw_text:
                        decrypted_text = vault_crypto.decrypt(raw_text)
                except IntegrityVerificationError as e:
                    log_error(f"[QdrantVectorStore] Cryptographic integrity verification failed for point {point_id}: {e}")
                    raise

                decrypted_payload = dict(payload)
                decrypted_payload["summarized_text"] = decrypted_text
                return {
                    "id": str(pt.id),
                    "vector": pt.vector,
                    "app_name": payload.get("app_name", "Unknown"),
                    "os": payload.get("os", "Unknown"),
                    "timestamp": payload.get("timestamp"),
                    "summarized_text": decrypted_text,
                    "payload": decrypted_payload,
                }
            except IntegrityVerificationError:
                raise
            except Exception as e:
                log_error(f"[QdrantVectorStore] Error retrieving point {point_id}: {e}")
                return None

    def update_point_payload(
        self,
        point_id: str,
        payload_updates: Dict[str, Any]
    ) -> bool:
        """Updates the payload of an existing point in the active Knowledge Base, encrypting summarized_text if present."""
        with self._lock:
            client = self.get_client()
            clean_updates = dict(payload_updates)
            if "summarized_text" in clean_updates:
                raw_text = str(clean_updates["summarized_text"] or "")
                if not vault_crypto.is_encrypted(raw_text):
                    clean_updates["summarized_text"] = vault_crypto.encrypt(raw_text)
                    clean_updates["_encrypted"] = True

            try:
                client.set_payload(
                    collection_name=COLLECTION_NAME,
                    payload=clean_updates,
                    points=[point_id],
                )
                log(f"[QdrantVectorStore] Successfully updated payload for point {point_id}")
                return True
            except Exception as e:
                log_error(f"[QdrantVectorStore] Failed to update payload for point {point_id}: {e}")
                return False

    def count_points(self) -> int:
        """Returns the number of points in the active Knowledge Base collection."""
        with self._lock:
            try:
                client = self.get_client()
                existing = [c.name for c in client.get_collections().collections]
                if COLLECTION_NAME not in existing:
                    return 0
                return client.count(collection_name=COLLECTION_NAME).count
            except Exception:
                return 0

    def get_kb_point_count(self, kb_path: Path) -> int:
        """Returns the point count for a target or active Knowledge Base directory."""
        with self._lock:
            try:
                if self._current_path and self._current_path.resolve() == kb_path.resolve():
                    return self.count_points()
                # Inspect inactive KB collection safely
                temp_client = QdrantClient(path=str(kb_path))
                existing = [c.name for c in temp_client.get_collections().collections]
                count_val = (
                    temp_client.count(collection_name=COLLECTION_NAME).count
                    if COLLECTION_NAME in existing
                    else 0
                )
                temp_client.close()
                return count_val
            except Exception:
                return 0

    def delete_knowledge_base(self, name: str) -> bool:
        """Deletes a Knowledge Base safely by name, ensuring open clients are closed."""
        with self._lock:
            return self.storage.delete_knowledge_base(
                name=name,
                before_delete_cb=self.close,
            )

