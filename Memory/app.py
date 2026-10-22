from __future__ import annotations

import asyncio
from contextlib import asynccontextmanager
from typing import Any, Dict, Optional
from fastapi import FastAPI, HTTPException, status
from pydantic import BaseModel, Field

import config
from data_extractor import extract_pixels_and_grayscale, extract_text_from_image
from screenshot_worker import worker_manager, process_screenshot_job, IMAGE_DIFF_THRESHOLD
from vault_logger import log


@asynccontextmanager
async def lifespan(app: FastAPI):
    log("Memory service starting up...")
    # Start the screenshot extraction workers in the background
    asyncio.create_task(worker_manager.start())
    yield
    log("Memory service shutting down...")
    await worker_manager.stop()


app = FastAPI(
    title="MIRA Memory Service",
    description="Screenshot extraction, OCR text extraction, image comparison, and worker orchestration",
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
        "image_diff_threshold": IMAGE_DIFF_THRESHOLD,
    }


@app.post("/workers/start", status_code=status.HTTP_200_OK)
async def start_workers():
    await worker_manager.start()
    return {"status": "started", "workers": worker_manager.get_status()}


@app.post("/workers/stop", status_code=status.HTTP_200_OK)
async def stop_workers():
    await worker_manager.stop()
    return {"status": "stopped", "workers": worker_manager.get_status()}


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
