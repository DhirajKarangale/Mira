from __future__ import annotations

import asyncio
from contextlib import asynccontextmanager
from typing import Any, Dict, Optional
from fastapi import FastAPI, HTTPException, status
from pydantic import BaseModel, Field

import config
from screenshot_processing import (
    worker_manager,
    process_screenshot_job,
    IMAGE_DIFF_THRESHOLD,
    extract_pixels_and_grayscale,
    extract_text_from_image,
)
from knowledge_base import (
    kb_worker_manager,
    QdrantVectorStore,
    kb_storage,
)
from vault_logger import log

@asynccontextmanager
async def lifespan(app: FastAPI):
    log("Memory service starting up...")

    # Automatically start screenshot and knowledge base workers
    asyncio.create_task(worker_manager.start())
    asyncio.create_task(kb_worker_manager.start())
    yield
    log("Memory service shutting down...")
    await asyncio.gather(
        worker_manager.stop(),
        kb_worker_manager.stop(),
        return_exceptions=True
    )

app = FastAPI(
    title="MIRA Memory Service",
    description="Screenshot extraction, OCR text processing, Knowledge Base vector store, and worker orchestration",
    version="1.0.0",
    lifespan=lifespan,
)

class ExtractRequest(BaseModel):
    image_path: str = Field(..., min_length=1)

class JobProcessRequest(BaseModel):
    job_id: str = Field(..., min_length=1)
    app_name: str = Field("Unknown")
    os: str = Field("Unknown")
    image_path: str = Field(..., min_length=1)

class KBSearchRequest(BaseModel):
    query_vector: list[float] = Field(..., min_length=1)
    limit: int = Field(5, ge=1, le=100)
    app_name: Optional[str] = None
    os: Optional[str] = None
    start_timestamp: Optional[int] = None
    end_timestamp: Optional[int] = None

class KBJobIngestItem(BaseModel):
    app_name: Optional[str] = "Unknown"
    os: Optional[str] = "Unknown"
    timestamp: Optional[int] = None
    summarized_text: str = ""
    embedding: list[float]

class KBIngestBatchRequest(BaseModel):
    jobs: list[KBJobIngestItem]

@app.get("/health", status_code=status.HTTP_200_OK)
async def health():
    return {
        "service": "Memory",
        "status": "online",
    }

@app.get("/status", status_code=status.HTTP_200_OK)
async def get_status():
    return {
        "service": "Memory",
        "status": "online",
        "workers": worker_manager.get_status(),
        "knowledge_base": kb_worker_manager.get_status(),
        "image_diff_threshold": IMAGE_DIFF_THRESHOLD,
    }

@app.post("/workers/start", status_code=status.HTTP_200_OK)
async def start_workers():
    await worker_manager.start()
    await kb_worker_manager.start()
    return {
        "status": "started",
        "workers": worker_manager.get_status(),
        "knowledge_base": kb_worker_manager.get_status(),
    }

@app.post("/workers/stop", status_code=status.HTTP_200_OK)
async def stop_workers():
    await worker_manager.stop()
    await kb_worker_manager.stop()
    return {
        "status": "stopped",
        "workers": worker_manager.get_status(),
        "knowledge_base": kb_worker_manager.get_status(),
    }

@app.get("/knowledge-base/status", status_code=status.HTTP_200_OK)
async def get_kb_status():
    return {
        "status": "online",
        "workers": kb_worker_manager.get_status(),
        "monthly_knowledge_bases": kb_storage.list_knowledge_bases(),
    }

@app.post("/knowledge-base/workers/start", status_code=status.HTTP_200_OK)
async def start_kb_workers():
    await kb_worker_manager.start()
    return {"status": "started", "workers": kb_worker_manager.get_status()}

@app.post("/knowledge-base/workers/stop", status_code=status.HTTP_200_OK)
async def stop_kb_workers():
    await kb_worker_manager.stop()
    return {"status": "stopped", "workers": kb_worker_manager.get_status()}

@app.post("/knowledge-base/search", status_code=status.HTTP_200_OK)
async def search_kb(req: KBSearchRequest):
    try:
        results = await asyncio.to_thread(
            kb_worker_manager.vector_store.search,
            query_vector=req.query_vector,
            limit=req.limit,
            app_name=req.app_name,
            os_name=req.os,
            start_timestamp=req.start_timestamp,
            end_timestamp=req.end_timestamp,
        )
        return {"status": "success", "count": len(results), "results": results}
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail={"message": f"Search failed: {str(e)}"}
        )

@app.post("/knowledge-base/batch-ingest", status_code=status.HTTP_200_OK)
async def batch_ingest_kb(req: KBIngestBatchRequest):
    try:
        raw_jobs = [j.model_dump() for j in req.jobs]
        success = await asyncio.to_thread(
            kb_worker_manager.vector_store.ingest_batch,
            raw_jobs
        )
        return {"status": "success", "ingested": len(raw_jobs)}
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail={"message": f"Batch ingestion failed: {str(e)}"}
        )


@app.post("/extract", status_code=status.HTTP_200_OK)
async def extract_data(req: ExtractRequest):
    try:
        pixels, gray = extract_pixels_and_grayscale(req.image_path)
        text = extract_text_from_image(req.image_path)
        return {
            "status": "success",
            "image_path": req.image_path,
            "shape": list(pixels.shape),
            "grayscale_shape": list(gray.shape),
            "extracted_text": text,
        }
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail={"message": f"Extraction failed: {str(e)}"}
        )

@app.post("/process-job", status_code=status.HTTP_200_OK)
async def process_job_endpoint(job: JobProcessRequest):
    try:
        success = await asyncio.to_thread(process_screenshot_job, job.model_dump())
        return {"status": "processed", "success": success}
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail={"message": f"Job processing failed: {str(e)}"}
        )

if __name__ == "__main__":
    import uvicorn
    uvicorn.run("app:app", host=config.SERVER_HOST, port=config.SERVER_PORT, reload=False)
