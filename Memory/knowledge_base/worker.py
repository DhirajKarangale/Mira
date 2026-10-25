from __future__ import annotations
import asyncio
import os
import sys
from datetime import datetime
from pathlib import Path
from typing import Any, Dict, List, Optional
_memory_dir = Path(__file__).resolve().parent.parent
if str(_memory_dir) not in sys.path:
    sys.path.insert(0, str(_memory_dir))
from vault_logger import log, log_error
from .config import DEFAULT_KB_BATCH_SIZE, MAX_KB_BATCH_SIZE, get_worker_config
from .storage import KnowledgeBaseStorage, kb_storage
from .qdrant_store import QdrantVectorStore
from .broker_client import poll_jobs, acknowledge_batch
from .protection import kb_protector

class KnowledgeBaseWorkerManager:

    def __init__(self, storage: Optional[KnowledgeBaseStorage]=None, vector_store: Optional[QdrantVectorStore]=None) -> None:
        self.storage: KnowledgeBaseStorage = storage or kb_storage
        self.vector_store: QdrantVectorStore = vector_store or QdrantVectorStore(storage=self.storage)
        self.is_running: bool = False
        self._stop_event: asyncio.Event = asyncio.Event()
        self._tasks: List[asyncio.Task] = []
        self._poll_time: float = 1.0
        self._worker_count: int = 1
        self._batch_size: int = DEFAULT_KB_BATCH_SIZE
        self._total_jobs_processed: int = 0

    def refresh_config(self) -> None:
        try:
            cfg = get_worker_config()
            self._worker_count = int(cfg.get('embedding_vector_store_workers', 1))
            self._poll_time = float(cfg.get('embedding_vector_store_workers_poll_time', 1.0))
            self._batch_size = min(max(int(os.getenv('KB_BATCH_SIZE', str(DEFAULT_KB_BATCH_SIZE))), 1), MAX_KB_BATCH_SIZE)
        except Exception as e:
            log_error(f'[KnowledgeBaseWorkerManager] Failed to refresh worker config: {e}')

    async def _worker_loop(self, worker_id: int) -> None:
        log(f'[KBWorker-{worker_id}] Started embedding vector store worker (poll_time={self._poll_time}s, batch_size={self._batch_size})')
        while not self._stop_event.is_set():
            try:
                self.refresh_config()
                jobs = await asyncio.to_thread(poll_jobs, self._batch_size)
                if jobs and len(jobs) > 0:
                    log(f"[KBWorker-{worker_id}] Retrieved {len(jobs)} job(s) from 'embedding_memory'")
                    ingested_count, successful_job_ids = await asyncio.to_thread(self.vector_store.ingest_batch, jobs, True)
                    if ingested_count > 0:
                        acked_count = await asyncio.to_thread(acknowledge_batch, successful_job_ids)
                        log(f"[KBWorker-{worker_id}] Successfully stored {ingested_count} jobs in Qdrant and acknowledged {acked_count}/{len(successful_job_ids)} jobs from 'embedding_memory'")
                        self._total_jobs_processed += ingested_count
                        await asyncio.sleep(0.01)
                    else:
                        log_error(f'[KBWorker-{worker_id}] Qdrant batch ingestion stored 0 jobs. Preserving all {len(jobs)} unprocessed jobs in stream for retry.')
                        try:
                            await asyncio.wait_for(self._stop_event.wait(), timeout=self._poll_time)
                        except asyncio.TimeoutError:
                            pass
                else:
                    try:
                        await asyncio.wait_for(self._stop_event.wait(), timeout=self._poll_time)
                    except asyncio.TimeoutError:
                        pass
            except asyncio.CancelledError:
                break
            except Exception as e:
                log_error(f'[KBWorker-{worker_id}] Unhandled error in worker loop: {e}. Preserving jobs for retry.')
                try:
                    await asyncio.wait_for(self._stop_event.wait(), timeout=self._poll_time)
                except asyncio.TimeoutError:
                    pass
        log(f'[KBWorker-{worker_id}] Embedding vector store worker stopped cleanly')

    def cleanup_expired_knowledge_bases(self, retention_period: Optional[str]=None, now: Optional[datetime]=None) -> List[str]:
        return self.storage.cleanup_expired_knowledge_bases(retention_period=retention_period, now=now, delete_fn=self.delete_knowledge_base)

    async def start(self) -> None:
        if self.is_running:
            return
        try:
            deleted = await asyncio.to_thread(self.cleanup_expired_knowledge_bases)
            if deleted:
                log(f"[KnowledgeBaseWorkerManager] Startup cleanup removed {len(deleted)} expired Knowledge Base(s): {', '.join(deleted)}")
        except Exception as e:
            log_error(f'[KnowledgeBaseWorkerManager] Failed startup retention cleanup: {e}')
        try:
            await asyncio.to_thread(kb_protector.sync_and_protect_all, self.storage.base_dir)
        except Exception as e:
            log_error(f'[KnowledgeBaseWorkerManager] Failed to protect all KB folders on startup: {e}')
        try:
            await asyncio.to_thread(self.vector_store.get_client)
        except Exception as e:
            log_error(f'[KnowledgeBaseWorkerManager] Failed to pre-warm Qdrant client: {e}')
        self.refresh_config()
        self.is_running = True
        self._stop_event.clear()
        log(f'Starting {self._worker_count} knowledge base worker(s) in parallel (poll_time: {self._poll_time}s, batch_size: {self._batch_size})...')
        for i in range(1, self._worker_count + 1):
            task = asyncio.create_task(self._worker_loop(worker_id=i))
            self._tasks.append(task)

    async def stop(self) -> None:
        if not self.is_running:
            return
        log('Stopping knowledge base workers...')
        self.is_running = False
        self._stop_event.set()
        for task in self._tasks:
            task.cancel()
        if self._tasks:
            await asyncio.gather(*self._tasks, return_exceptions=True)
        self._tasks.clear()
        self.vector_store.close()
        kb_protector.unlock_all_folders()
        log('All knowledge base workers stopped')

    def get_status(self) -> Dict[str, Any]:
        active_kb = self.storage.get_active_kb_name()
        active_path = str(self.storage.get_active_kb_path())
        points_count = self.vector_store.count_points()
        return {'is_running': self.is_running, 'worker_count': self._worker_count, 'active_tasks': len([t for t in self._tasks if not t.done()]), 'poll_time': self._poll_time, 'batch_size': self._batch_size, 'total_jobs_processed': self._total_jobs_processed, 'active_knowledge_base': active_kb, 'active_kb_path': active_path, 'total_points_in_active_kb': points_count}

    def list_knowledge_bases(self, start_date: Optional[str]=None, end_date: Optional[str]=None, search: Optional[str]=None, page: int=1, limit: int=10) -> Dict[str, Any]:
        return self.storage.get_knowledge_bases_paginated(start_date=start_date, end_date=end_date, search=search, page=page, limit=limit, get_point_count_cb=self.vector_store.get_kb_point_count)

    def delete_knowledge_base(self, name: str) -> bool:
        return self.vector_store.delete_knowledge_base(name)
kb_worker_manager = KnowledgeBaseWorkerManager()
