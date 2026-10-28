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
warnings.filterwarnings('ignore', message='.*Payload indexes have no effect in the local Qdrant.*')
_memory_dir = Path(__file__).resolve().parent.parent
if str(_memory_dir) not in sys.path:
    sys.path.insert(0, str(_memory_dir))
from qdrant_client import QdrantClient, models
from vault_logger import log, log_error
from .config import COLLECTION_NAME, to_unix_timestamp
from .storage import KnowledgeBaseStorage, kb_storage
from .encryption import vault_crypto, IntegrityVerificationError, ENCRYPTION_PREFIX
from .protection import kb_protector
logger = logging.getLogger('mira.memory.knowledge_base.qdrant')

class QdrantVectorStore:

    def __init__(self, storage: Optional[KnowledgeBaseStorage]=None) -> None:
        self.storage: KnowledgeBaseStorage = storage or kb_storage
        self._lock: threading.RLock = threading.RLock()
        self._client: Optional[QdrantClient] = None
        self._current_path: Optional[Path] = None
        self._known_dimensions: Dict[str, int] = {}

    def get_client(self, create_if_missing: bool = False, activity_dt: Optional[datetime] = None) -> Optional[QdrantClient]:
        with self._lock:
            active_path = self.storage.get_active_knowledge_base(create_if_missing=create_if_missing, activity_dt=activity_dt)
            if active_path is None:
                return None
            if self._client is None or self._current_path != active_path:
                if self._client is not None:
                    try:
                        self._client.close()
                    except Exception:
                        pass
                self._current_path = active_path
                self._client = QdrantClient(path=str(active_path))
                log(f'[QdrantVectorStore] Initialized local Qdrant store at: {active_path}')
            return self._client

    def close(self) -> None:
        with self._lock:
            if self._client is not None:
                try:
                    self._client.close()
                except Exception as e:
                    log_error(f'[QdrantVectorStore] Error closing Qdrant client: {e}')
                finally:
                    self._client = None
                    self._current_path = None

    def reopen(self, new_path: Optional[Path]=None) -> None:
        with self._lock:
            self.close()
            target_path = new_path or self.storage.get_active_knowledge_base()
            self._current_path = target_path
            self._client = QdrantClient(path=str(target_path))
            log(f'[QdrantVectorStore] Reopened Qdrant store at: {target_path}')

    def _ensure_collection(self, client: QdrantClient, vector_size: int) -> None:
        existing_collections = [c.name for c in client.get_collections().collections]
        if COLLECTION_NAME not in existing_collections:
            log(f"[QdrantVectorStore] Creating collection '{COLLECTION_NAME}' with dim={vector_size} (on-disk optimized)")
            client.create_collection(collection_name=COLLECTION_NAME, vectors_config=models.VectorParams(size=vector_size, distance=models.Distance.COSINE, on_disk=True), on_disk_payload=True, optimizers_config=models.OptimizersConfigDiff(memmap_threshold=20000))
            try:
                client.create_payload_index(collection_name=COLLECTION_NAME, field_name='app_name', field_schema=models.PayloadSchemaType.KEYWORD)
                client.create_payload_index(collection_name=COLLECTION_NAME, field_name='os', field_schema=models.PayloadSchemaType.KEYWORD)
                client.create_payload_index(collection_name=COLLECTION_NAME, field_name='timestamp', field_schema=models.PayloadSchemaType.INTEGER)
                client.create_payload_index(collection_name=COLLECTION_NAME, field_name='summarized_text', field_schema=models.TextIndexParams(type='text', tokenizer=models.TokenizerType.WORD, lowercase=True))
            except Exception as e:
                log(f'[QdrantVectorStore] Note on payload index creation: {e}')

    def ingest_batch(self, jobs: List[Dict[str, Any]], return_job_ids: bool=False) -> Union[bool, Tuple[int, List[str]]]:
        if not jobs:
            return (0, []) if return_job_ids else True
        with self._lock:
            activity_dt: Optional[datetime] = None
            for job in jobs:
                if isinstance(job, dict):
                    raw_ts = job.get('timestamp')
                    if raw_ts is None and isinstance(job.get('job_data'), dict):
                        raw_ts = job['job_data'].get('timestamp')
                    if raw_ts is not None:
                        try:
                            unix_ts = to_unix_timestamp(raw_ts)
                            activity_dt = datetime.fromtimestamp(unix_ts)
                            break
                        except Exception:
                            pass
            if activity_dt is None:
                activity_dt = datetime.now()

            client = self.get_client(create_if_missing=True, activity_dt=activity_dt)
            if client is None:
                log_error('[QdrantVectorStore] Failed to acquire Qdrant client for active Knowledge Base.')
                return (0, []) if return_job_ids else False
            valid_records: List[Dict[str, Any]] = []
            successful_job_ids: List[str] = []
            vector_dim: Optional[int] = None
            for job in jobs:
                if not isinstance(job, dict):
                    continue
                inner_job = dict(job)
                if 'job_data' in inner_job:
                    jd = inner_job['job_data']
                    if isinstance(jd, str):
                        try:
                            jd = json.loads(jd)
                        except Exception:
                            jd = {}
                    if isinstance(jd, dict):
                        for k, v in jd.items():
                            if k not in inner_job or inner_job[k] is None:
                                inner_job[k] = v
                raw_emb = inner_job.get('embedding')
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
                    log_error(f'[QdrantVectorStore] Invalid float values in embedding: {e}')
                    continue
                if vector_dim is None:
                    vector_dim = len(embedding_vector)
                app_name = str(inner_job.get('app_name') or 'Unknown').strip()
                os_name = str(inner_job.get('os') or 'Unknown').strip()
                summarized_text = str(inner_job.get('summarized_text') or '').strip()
                raw_ts = inner_job.get('timestamp')
                unix_ts = to_unix_timestamp(raw_ts)
                orig_job_id = str(job.get('job_id') or job.get('_stream_id') or '').strip()
                valid_records.append({'vector': embedding_vector, 'app_name': app_name, 'os': os_name, 'timestamp': unix_ts, 'summarized_text': summarized_text, 'orig_job_id': orig_job_id})
            if not valid_records:
                log_error('[QdrantVectorStore] No valid points to insert in batch.')
                return (0, []) if return_job_ids else False
            raw_texts = [r['summarized_text'] for r in valid_records]
            try:
                encrypted_texts = vault_crypto.encrypt_batch(raw_texts)
            except Exception as e:
                log_error(f'[QdrantVectorStore] Knowledge Base encryption failed: {e}')
                raise RuntimeError(f'Failed to encrypt Knowledge Base data at rest: {e}')
            points: List[models.PointStruct] = []
            for r, enc_text in zip(valid_records, encrypted_texts):
                payload = {'app_name': r['app_name'], 'os': r['os'], 'timestamp': r['timestamp'], 'summarized_text': enc_text, '_encrypted': True}
                point_id = str(uuid.uuid4())
                points.append(models.PointStruct(id=point_id, vector=r['vector'], payload=payload))
                if r['orig_job_id']:
                    successful_job_ids.append(r['orig_job_id'])
            try:
                self._ensure_collection(client, vector_dim or len(points[0].vector))
                client.upsert(collection_name=COLLECTION_NAME, points=points)
                log(f"[QdrantVectorStore] Successfully ingested {len(points)} encrypted points into '{COLLECTION_NAME}'")
                self.storage.update_end_date_on_ingestion(before_rename_cb=self.close, after_rename_cb=self.reopen, activity_dt=activity_dt)
                try:
                    active_kb_p = self.storage.get_active_knowledge_base(create_if_missing=False, activity_dt=activity_dt)
                    if active_kb_p:
                        kb_protector.encrypt_folder_snapshot(active_kb_p)
                except Exception:
                    pass
                if return_job_ids:
                    return (len(points), successful_job_ids)
                return True
            except Exception as e:
                log_error(f'[QdrantVectorStore] Batch upsert failed: {e}')
                if return_job_ids:
                    return (0, [])
                return False

    def search(self, query_vector: Optional[List[float]]=None, limit: int=5, app_name: Optional[Union[str, List[str]]]=None, os_name: Optional[str]=None, start_timestamp: Optional[Union[int, float, str]]=None, end_timestamp: Optional[Union[int, float, str]]=None, timestamp_gt: Optional[Union[int, float, str]]=None, timestamp_gte: Optional[Union[int, float, str]]=None, timestamp_lt: Optional[Union[int, float, str]]=None, timestamp_lte: Optional[Union[int, float, str]]=None, text_query: Optional[str]=None, timestamp_between: Optional[Tuple[Any, Any]]=None, **kwargs: Any) -> List[Dict[str, Any]]:
        with self._lock:
            client = self.get_client(create_if_missing=False)
            if client is None:
                return []
            existing_collections = [c.name for c in client.get_collections().collections]
            if COLLECTION_NAME not in existing_collections:
                return []
            filter_conditions: List[models.FieldCondition] = []
            if app_name is not None:
                if isinstance(app_name, (list, tuple, set)):
                    clean_apps = [str(a).strip() for a in app_name if str(a).strip()]
                    if clean_apps:
                        filter_conditions.append(models.FieldCondition(key='app_name', match=models.MatchAny(any=clean_apps)))
                elif str(app_name).strip():
                    filter_conditions.append(models.FieldCondition(key='app_name', match=models.MatchValue(value=str(app_name).strip())))
            if os_name is not None and str(os_name).strip():
                filter_conditions.append(models.FieldCondition(key='os', match=models.MatchValue(value=str(os_name).strip())))
            range_params: Dict[str, int] = {}
            if timestamp_gt is not None:
                range_params['gt'] = to_unix_timestamp(timestamp_gt)
            elif timestamp_gte is not None:
                range_params['gte'] = to_unix_timestamp(timestamp_gte)
            elif start_timestamp is not None:
                range_params['gte'] = to_unix_timestamp(start_timestamp)
            if timestamp_lt is not None:
                range_params['lt'] = to_unix_timestamp(timestamp_lt)
            elif timestamp_lte is not None:
                range_params['lte'] = to_unix_timestamp(timestamp_lte)
            elif end_timestamp is not None:
                range_params['lte'] = to_unix_timestamp(end_timestamp)
            if timestamp_between and len(timestamp_between) == 2:
                range_params['gte'] = to_unix_timestamp(timestamp_between[0])
                range_params['lte'] = to_unix_timestamp(timestamp_between[1])
            if range_params:
                filter_conditions.append(models.FieldCondition(key='timestamp', range=models.Range(**range_params)))
            query_filter = models.Filter(must=filter_conditions) if filter_conditions else None
            limit_val = max(1, min(int(limit), 100))
            has_text_query = bool(text_query and str(text_query).strip())
            query_text_clean = str(text_query).strip().lower() if has_text_query else None
            fetch_limit = min(max(limit_val * 4, 25), 100) if has_text_query else limit_val
            try:
                if query_vector is not None and len(query_vector) > 0:
                    clean_vec = [float(x) for x in query_vector]
                    search_res = client.query_points(collection_name=COLLECTION_NAME, query=clean_vec, query_filter=query_filter, limit=fetch_limit)
                    points = search_res.points
                else:
                    scroll_res, _ = client.scroll(collection_name=COLLECTION_NAME, scroll_filter=query_filter, limit=fetch_limit, with_payload=True, with_vectors=False)
                    points = scroll_res
                results: List[Dict[str, Any]] = []
                for pt in points:
                    payload = pt.payload or {}
                    raw_text = payload.get('summarized_text', '')
                    decrypted_text = ''
                    try:
                        if raw_text:
                            decrypted_text = vault_crypto.decrypt(raw_text)
                    except IntegrityVerificationError as e:
                        log_error(f'[QdrantVectorStore] Cryptographic integrity verification failed for point {pt.id}. Unauthorized modification detected: {e}. Skipping compromised record.')
                        continue
                    except Exception as e:
                        log_error(f'[QdrantVectorStore] Decryption error for point {pt.id}: {e}')
                        if vault_crypto.is_encrypted(raw_text):
                            continue
                        decrypted_text = str(raw_text)
                    if query_text_clean is not None:
                        if query_text_clean not in decrypted_text.lower():
                            continue
                    score_val = float(getattr(pt, 'score', 1.0))
                    decrypted_payload = dict(payload)
                    decrypted_payload['summarized_text'] = decrypted_text
                    results.append({'id': str(pt.id), 'score': score_val, 'app_name': payload.get('app_name', 'Unknown'), 'os': payload.get('os', 'Unknown'), 'timestamp': payload.get('timestamp'), 'summarized_text': decrypted_text, 'payload': decrypted_payload})
                    if len(results) >= limit_val:
                        break
                return results
            except Exception as e:
                log_error(f'[QdrantVectorStore] Search query failed: {e}')
                raise

    def get_point(self, point_id: str) -> Optional[Dict[str, Any]]:
        with self._lock:
            client = self.get_client(create_if_missing=False)
            if client is None:
                return None
            try:
                res = client.retrieve(collection_name=COLLECTION_NAME, ids=[point_id], with_payload=True, with_vectors=True)
                if not res:
                    return None
                pt = res[0]
                payload = pt.payload or {}
                raw_text = payload.get('summarized_text', '')
                decrypted_text = ''
                try:
                    if raw_text:
                        decrypted_text = vault_crypto.decrypt(raw_text)
                except IntegrityVerificationError as e:
                    log_error(f'[QdrantVectorStore] Cryptographic integrity verification failed for point {point_id}: {e}')
                    raise
                decrypted_payload = dict(payload)
                decrypted_payload['summarized_text'] = decrypted_text
                return {'id': str(pt.id), 'vector': pt.vector, 'app_name': payload.get('app_name', 'Unknown'), 'os': payload.get('os', 'Unknown'), 'timestamp': payload.get('timestamp'), 'summarized_text': decrypted_text, 'payload': decrypted_payload}
            except IntegrityVerificationError:
                raise
            except Exception as e:
                log_error(f'[QdrantVectorStore] Error retrieving point {point_id}: {e}')
                return None

    def update_point_payload(self, point_id: str, payload_updates: Dict[str, Any]) -> bool:
        with self._lock:
            client = self.get_client(create_if_missing=False)
            if client is None:
                return False
            clean_updates = dict(payload_updates)
            if 'summarized_text' in clean_updates:
                raw_text = str(clean_updates['summarized_text'] or '')
                if not vault_crypto.is_encrypted(raw_text):
                    clean_updates['summarized_text'] = vault_crypto.encrypt(raw_text)
                    clean_updates['_encrypted'] = True
            try:
                client.set_payload(collection_name=COLLECTION_NAME, payload=clean_updates, points=[point_id])
                log(f'[QdrantVectorStore] Successfully updated payload for point {point_id}')
                return True
            except Exception as e:
                log_error(f'[QdrantVectorStore] Failed to update payload for point {point_id}: {e}')
                return False

    def count_points(self) -> int:
        with self._lock:
            try:
                client = self.get_client(create_if_missing=False)
                if client is None:
                    return 0
                existing = [c.name for c in client.get_collections().collections]
                if COLLECTION_NAME not in existing:
                    return 0
                return client.count(collection_name=COLLECTION_NAME).count
            except Exception:
                return 0

    def get_kb_point_count(self, kb_path: Path) -> int:
        with self._lock:
            try:
                active_kb_path = self.storage.get_active_kb_path()
                is_active = False
                if self._current_path:
                    try:
                        is_active = self._current_path.resolve() == kb_path.resolve()
                    except Exception:
                        pass
                if not is_active and active_kb_path:
                    try:
                        is_active = active_kb_path.resolve() == kb_path.resolve()
                    except Exception:
                        pass

                if is_active:
                    return self.count_points()

                cache_key = str(kb_path.resolve())
                if not hasattr(self, '_point_count_cache'):
                    self._point_count_cache = {}
                if cache_key in self._point_count_cache:
                    return self._point_count_cache[cache_key]

                temp_client = QdrantClient(path=str(kb_path))
                existing = [c.name for c in temp_client.get_collections().collections]
                count_val = temp_client.count(collection_name=COLLECTION_NAME).count if COLLECTION_NAME in existing else 0
                temp_client.close()
                self._point_count_cache[cache_key] = count_val
                return count_val
            except Exception:
                return 0

    def delete_knowledge_base(self, name: str) -> bool:
        with self._lock:
            return self.storage.delete_knowledge_base(name=name, before_delete_cb=self.close)
