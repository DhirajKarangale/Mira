from __future__ import annotations

import logging
from pathlib import Path
import time
from typing import Any, Dict, List, Optional, Tuple, Union
import uuid

from qdrant_client import QdrantClient, models
from qdrant_client.http.exceptions import UnexpectedResponse

from .config import DEFAULT_COLLECTION_NAME
from .encryption import vault_crypto
from .storage import kb_storage

logger = logging.getLogger("mira.memory.knowledge_base.qdrant")

class QdrantVectorStore:
    """Manages Qdrant vector storage, payload indexing, batch ingestion, and retrieval for a monthly Knowledge Base."""

    def __init__(
        self,
        kb_path: Optional[Path] = None,
        collection_name: str = DEFAULT_COLLECTION_NAME,
        crypto_client = None,
    ):
        self._custom_kb_path = kb_path
        self.collection_name = collection_name
        self.crypto = crypto_client or vault_crypto
        self._client: Optional[QdrantClient] = None
        self._current_kb_name: Optional[str] = None
        self._collection_initialized: bool = False
        import atexit
        atexit.register(self.close)

    def __del__(self):
        try:
            self.close()
        except Exception:
            pass


    def _resolve_kb(self) -> Tuple[str, Path]:
        if self._custom_kb_path:
            return self._custom_kb_path.name, self._custom_kb_path
        return kb_storage.get_active_knowledge_base()

    def get_client(self) -> QdrantClient:
        kb_name, kb_path = self._resolve_kb()
        if self._client is None or self._current_kb_path != kb_path:
            if self._client is not None:
                try:
                    self._client.close()
                except Exception:
                    pass

            self._current_kb_name = kb_name
            self._current_kb_path = kb_path
            self._collection_initialized = False

            kb_path.mkdir(parents=True, exist_ok=True)
            logger.info(f"Connecting to Qdrant storage at {kb_path} (KB: {kb_name})...")
            self._client = QdrantClient(path=str(kb_path))

        return self._client

    def ensure_collection(self, vector_size: int) -> None:
        """Ensures Qdrant collection exists and payload indexes are configured."""
        if self._collection_initialized:
            return

        client = self.get_client()
        exists = False
        try:
            exists = client.collection_exists(self.collection_name)
        except Exception:
            exists = False

        if not exists:
            logger.info(f"Creating Qdrant collection '{self.collection_name}' (vector_size={vector_size}, distance=Cosine)...")
            client.create_collection(
                collection_name=self.collection_name,
                vectors_config=models.VectorParams(
                    size=vector_size,
                    distance=models.Distance.COSINE
                )
            )

            # Create payload indexes for filtering on app_name, os, and timestamp
            logger.info("Creating payload indexes for app_name, os, and timestamp...")
            try:
                client.create_payload_index(
                    collection_name=self.collection_name,
                    field_name="app_name",
                    field_schema=models.PayloadSchemaType.KEYWORD
                )
                client.create_payload_index(
                    collection_name=self.collection_name,
                    field_name="os",
                    field_schema=models.PayloadSchemaType.KEYWORD
                )
                client.create_payload_index(
                    collection_name=self.collection_name,
                    field_name="timestamp",
                    field_schema=models.PayloadSchemaType.INTEGER
                )
            except Exception as e:
                logger.debug(f"Payload index creation note: {e}")

        self._collection_initialized = True

    def ingest_batch(self, jobs: List[Dict[str, Any]]) -> bool:
        """Ingests a batch of jobs into Qdrant.
        
        Requirements:
        - Stores: app_name, os, timestamp, summarized_text (encrypted), embedding.
        - Uses app_name, os, and timestamp as payload indexes.
        - Uses the provided embedding directly.
        - Ignores job_id when storing records.
        - Inserts retrieved jobs in batches.
        """
        if not jobs:
            return True

        # Validate and prepare points
        points: List[models.PointStruct] = []
        texts_to_encrypt: List[str] = []
        valid_jobs_data: List[Tuple[str, str, int, List[float]]] = []

        for job in jobs:
            # Handle potential nested job_data
            data = job.get("job_data") if isinstance(job.get("job_data"), dict) else job

            app_name = str(data.get("app_name") or "Unknown").strip()
            os_name = str(data.get("os") or "Unknown").strip()
            
            # Timestamp normalization
            raw_ts = data.get("timestamp")
            try:
                ts = int(raw_ts) if raw_ts is not None else int(time.time())
            except Exception:
                ts = int(time.time())

            summarized_text = str(data.get("summarized_text") or "").strip()
            embedding = data.get("embedding")

            if not embedding or not isinstance(embedding, list):
                logger.warning(f"Skipping job without valid embedding vector (type={type(embedding)})")
                continue

            try:
                vector = [float(v) for v in embedding]
            except Exception as e:
                logger.warning(f"Skipping job with invalid float values in embedding: {e}")
                continue

            texts_to_encrypt.append(summarized_text)
            valid_jobs_data.append((app_name, os_name, ts, vector))

        if not valid_jobs_data:
            logger.warning("No valid jobs in batch to ingest.")
            return True

        # Encrypt summarized_texts using Vault encryption mechanism in batch
        encrypted_texts = self.crypto.encrypt_batch(texts_to_encrypt)

        vector_dim = len(valid_jobs_data[0][3])
        self.ensure_collection(vector_size=vector_dim)

        # Build Qdrant points with a newly generated UUID point id, ignoring job_id
        for (app_name, os_name, ts, vector), enc_text in zip(valid_jobs_data, encrypted_texts):
            point_id = str(uuid.uuid4())
            payload = {
                "app_name": app_name,
                "os": os_name,
                "timestamp": ts,
                "summarized_text": enc_text,  # Encrypted using Vault mechanism
            }
            points.append(
                models.PointStruct(
                    id=point_id,
                    vector=vector,
                    payload=payload
                )
            )

        client = self.get_client()
        try:
            client.upsert(
                collection_name=self.collection_name,
                points=points
            )
            logger.info(
                f"Successfully ingested batch of {len(points)} records into Qdrant "
                f"collection '{self.collection_name}' (KB: {self._current_kb_name})"
            )
            return True
        except Exception as e:
            logger.error(f"Failed to upsert batch into Qdrant: {e}")
            raise e

    def search(
        self,
        query_vector: List[float],
        limit: int = 5,
        app_name: Optional[str] = None,
        os_name: Optional[str] = None,
        start_timestamp: Optional[int] = None,
        end_timestamp: Optional[int] = None,
    ) -> List[Dict[str, Any]]:
        """Performs vector search with payload filtering, decrypting summarized_text on read."""
        client = self.get_client()

        must_conditions = []
        if app_name:
            must_conditions.append(models.FieldCondition(key="app_name", match=models.MatchValue(value=app_name)))
        if os_name:
            must_conditions.append(models.FieldCondition(key="os", match=models.MatchValue(value=os_name)))
        if start_timestamp is not None or end_timestamp is not None:
            must_conditions.append(
                models.FieldCondition(
                    key="timestamp",
                    range=models.Range(
                        gte=start_timestamp,
                        lte=end_timestamp
                    )
                )
            )

        query_filter = models.Filter(must=must_conditions) if must_conditions else None

        try:
            if hasattr(client, "query_points"):
                query_res = client.query_points(
                    collection_name=self.collection_name,
                    query=query_vector,
                    query_filter=query_filter,
                    limit=limit
                )
                hits = getattr(query_res, "points", query_res)
            elif hasattr(client, "search"):
                hits = client.search(
                    collection_name=self.collection_name,
                    query_vector=query_vector,
                    query_filter=query_filter,
                    limit=limit
                )
            else:
                hits = []
        except Exception as e:
            logger.error(f"Qdrant search error: {e}")
            return []


        results: List[Dict[str, Any]] = []
        ciphertexts = []
        for hit in hits:
            enc = (hit.payload or {}).get("summarized_text", "")
            ciphertexts.append(enc)

        decrypted_texts = self.crypto.decrypt_batch(ciphertexts)

        for hit, dec_text in zip(hits, decrypted_texts):
            item_payload = dict(hit.payload or {})
            item_payload["summarized_text"] = dec_text  # Decrypted for consumer access
            results.append({
                "id": str(hit.id),
                "score": float(hit.score),
                "payload": item_payload,
            })

        return results

    def get_count(self) -> int:
        """Returns total records in the active knowledge base collection."""
        try:
            client = self.get_client()
            if not client.collection_exists(self.collection_name):
                return 0
            info = client.get_collection(self.collection_name)
            return info.points_count or 0
        except Exception:
            return 0

    def close(self) -> None:
        if self._client is not None:
            try:
                self._client.close()
            except Exception:
                pass
            self._client = None
