from __future__ import annotations

import asyncio
import os
from pathlib import Path
from typing import Any, Dict, List, Optional
import uuid
import requests

import config
from data_extractor import extract_pixels_and_grayscale, extract_text_from_image
from image_comparison import compare_app_images, store_image_data
from vault_logger import log

# Image difference threshold constant.
# If cv2.absdiff normalized difference between consecutive frames of the same app
# is below this threshold, the image is considered unchanged and skipped.
IMAGE_DIFF_THRESHOLD: float = float(os.getenv("IMAGE_DIFF_THRESHOLD", "0.02"))


def get_broker_base_url() -> str:
    mb_url = config.get_service_url("message_broker") or config.MESSAGE_BROKER_URL
    if not mb_url:
        raise RuntimeError("Message Broker URL is not configured")
    return mb_url.rstrip("/")


def get_operator_base_url() -> Optional[str]:
    op_url = config.get_service_url("operator") or config.OPERATOR_URL
    return op_url.rstrip("/") if op_url else None


def call_operator_delete_screenshot(image_path: str) -> bool:
    """Call Operator API to delete the screenshot file, with local fallback if needed."""
    operator_url = get_operator_base_url()
    if operator_url:
        endpoint = f"{operator_url}/delete"
        try:
            resp = requests.post(endpoint, json={"image_path": str(image_path)}, timeout=4.0)
            if resp.status_code in (200, 404):
                return True
        except Exception as e:
            log(f"Operator delete screenshot API call failed ({e}), attempting local removal")

    # Local fallback in case Operator service is unavailable or file remains
    try:
        p = Path(image_path)
        if p.exists():
            p.unlink(missing_ok=True)
            return True
    except Exception as e:
        log(f"Fallback deletion failed for '{image_path}': {e}")
    return False


def poll_broker_jobs(consumer_key: str, count: int = 1) -> List[Dict[str, Any]]:
    """Poll jobs from the specified Redis Stream consumer group via Message Broker."""
    base_url = get_broker_base_url()
    endpoint = f"{base_url}/jobs"
    params = {"consumer_key": consumer_key, "count": count}

    try:
        resp = requests.get(endpoint, params=params, timeout=5.0)
        resp.raise_for_status()
        return resp.json()
    except Exception as e:
        log(f"Polling '{consumer_key}' from Message Broker failed: {e}")
        return []


def remove_broker_job(consumer_key: str, job_id: str) -> bool:
    """Acknowledge and remove a job from the Redis Stream via Message Broker."""
    base_url = get_broker_base_url()
    endpoint = f"{base_url}/jobs"
    params = {"consumer_key": consumer_key, "job_id": job_id}

    try:
        resp = requests.delete(endpoint, params=params, timeout=5.0)
        return resp.status_code == 200
    except Exception as e:
        log(f"Failed to remove job {job_id} from {consumer_key}: {e}")
        return False


def publish_broker_job(job_payload: Dict[str, Any]) -> bool:
    """Publish a new job to a Redis Stream via Message Broker."""
    base_url = get_broker_base_url()
    endpoint = f"{base_url}/jobs"

    try:
        resp = requests.post(endpoint, json=job_payload, timeout=5.0)
        resp.raise_for_status()
        return True
    except Exception as e:
        log(f"Failed to publish job to Message Broker: {e}")
        return False


def process_screenshot_job(job: Dict[str, Any], worker_id: int = 1) -> bool:
    """
    Execute the 9-step processing workflow for a single screenshot extraction job:
    1. Extract pixel values and the grayscale matrix from the image.
    2. Retrieve previous image data from Redis and compare images from the same application using OpenCV.
    3. If difference is below threshold, call Operator API to delete screenshot, remove job from ocr_extraction, skip.
    4. Otherwise, store current image data in Redis, retaining only 10 most recent images.
    5. Extract text from the screenshot using OCR.
    6. Delete the screenshot through the Operator API.
    7. Create a new job containing job_id (UUID), app_name, os, and extracted_text.
    8. Publish the new job to ocr_summarization.
    9. Remove the completed job from ocr_extraction.
    """
    job_id = str(job.get("job_id") or "")
    app_name = str(job.get("app_name") or "Unknown").strip()
    os_name = str(job.get("os") or "Unknown").strip()
    image_path = str(job.get("image_path") or "").strip()

    if not job_id or not image_path:
        log(f"[Worker-{worker_id}] Invalid job data (missing job_id or image_path): {job}")
        if job_id:
            remove_broker_job("ocr_extraction", job_id)
        return False

    if not os.path.exists(image_path):
        log(f"[Worker-{worker_id}] Image file not found at '{image_path}'. Cleaning up job {job_id}")
        remove_broker_job("ocr_extraction", job_id)
        return False

    log(f"[Worker-{worker_id}] Processing screenshot job {job_id} for app '{app_name}'")

    # Step 1: Extract pixel values and the grayscale matrix from the image
    try:
        pixel_values, grayscale_matrix = extract_pixels_and_grayscale(image_path)
    except Exception as e:
        log(f"[Worker-{worker_id}] Error extracting image data from '{image_path}': {e}")
        call_operator_delete_screenshot(image_path)
        remove_broker_job("ocr_extraction", job_id)
        return False

    # Step 2: Retrieve previous image data from Redis and compare images from the same application using OpenCV
    diff_score, prev_record = compare_app_images(app_name, grayscale_matrix)

    # Step 3: If difference is below threshold, call Operator API to delete screenshot, remove job from ocr_extraction, skip
    if diff_score is not None and diff_score < IMAGE_DIFF_THRESHOLD:
        log(
            f"[Worker-{worker_id}] Duplicate frame detected for app '{app_name}' "
            f"(diff={diff_score:.4f} < threshold={IMAGE_DIFF_THRESHOLD}). Skipping extraction."
        )
        call_operator_delete_screenshot(image_path)
        remove_broker_job("ocr_extraction", job_id)
        return True

    if diff_score is not None:
        log(f"[Worker-{worker_id}] App '{app_name}' changed (diff={diff_score:.4f} >= threshold={IMAGE_DIFF_THRESHOLD})")
    else:
        log(f"[Worker-{worker_id}] First frame or no prior comparison record for app '{app_name}'")

    # Step 4: Otherwise, store the current image data in Redis, retaining only the 10 most recent images
    try:
        store_image_data(
            app_name=app_name,
            pixel_values=pixel_values,
            grayscale_matrix=grayscale_matrix,
            image_id=job_id,
            timestamp=job.get("timestamp"),
            metadata={"os": os_name},
        )
    except Exception as e:
        log(f"[Worker-{worker_id}] Warning: failed to store image comparison in Redis: {e}")

    # Step 5: Extract text from the screenshot using OCR
    try:
        extracted_text = extract_text_from_image(image_path)
    except Exception as e:
        log(f"[Worker-{worker_id}] OCR text extraction failed for '{image_path}': {e}")
        extracted_text = ""

    # Step 6: Delete the screenshot through the Operator API
    call_operator_delete_screenshot(image_path)

    # Step 7: Create a new job containing job_id (UUID), app_name, os, and extracted_text
    new_job_id = str(uuid.uuid4())
    summarization_job = {
        "job_id": new_job_id,
        "consumer_key": "ocr_summarization",
        "app_name": app_name,
        "os": os_name,
        "extracted_text": extracted_text,
    }

    # Step 8: Publish the new job to ocr_summarization
    published = publish_broker_job(summarization_job)
    if published:
        log(
            f"[Worker-{worker_id}] Published job {new_job_id} to 'ocr_summarization' "
            f"(extracted {len(extracted_text)} chars from '{app_name}')"
        )
    else:
        log(f"[Worker-{worker_id}] Failed to publish job {new_job_id} to 'ocr_summarization'")

    # Step 9: Remove the completed job from ocr_extraction
    removed = remove_broker_job("ocr_extraction", job_id)
    if removed:
        log(f"[Worker-{worker_id}] Completed and removed job {job_id} from 'ocr_extraction'")

    return True


class ScreenshotExtractionWorkerManager:
    """
    Orchestrates multiple screenshot extraction workers running in parallel.
    Polls the 'ocr_extraction' Redis Stream through Message Broker using the
    configurable 'screenshot_extraction_poll_time' fetched from Vault.
    """

    def __init__(self) -> None:
        self.is_running: bool = False
        self._stop_event: asyncio.Event = asyncio.Event()
        self._tasks: List[asyncio.Task] = []
        self._poll_time: float = 5.0
        self._worker_count: int = 1

    def refresh_config(self) -> None:
        worker_cfg = config.fetch_worker_config()
        self._poll_time = worker_cfg.get("screenshot_extraction_poll_time", 5.0)
        self._worker_count = worker_cfg.get("screenshot_extraction_workers", 1)

    async def _worker_loop(self, worker_id: int) -> None:
        log(f"[Worker-{worker_id}] Worker started (poll_time={self._poll_time}s)")
        while not self._stop_event.is_set():
            try:
                # Refresh poll time and settings periodically
                self.refresh_config()

                # Poll Message Broker for 1 job at a time for this worker
                jobs = await asyncio.to_thread(poll_broker_jobs, "ocr_extraction", 1)
                if jobs and len(jobs) > 0:
                    job = jobs[0]
                    await asyncio.to_thread(process_screenshot_job, job, worker_id)
                    # Continue polling immediately after completing each job
                    await asyncio.sleep(0.01)
                else:
                    # Wait for configurable poll time if no jobs available
                    try:
                        await asyncio.wait_for(self._stop_event.wait(), timeout=self._poll_time)
                    except asyncio.TimeoutError:
                        pass
            except asyncio.CancelledError:
                break
            except Exception as e:
                log(f"[Worker-{worker_id}] Unhandled error in worker loop: {e}")
                await asyncio.sleep(self._poll_time)

        log(f"[Worker-{worker_id}] Worker stopped cleanly")

    async def start(self) -> None:
        if self.is_running:
            return
        self.refresh_config()
        self.is_running = True
        self._stop_event.clear()

        log(f"Starting {self._worker_count} screenshot extraction worker(s) in parallel (poll_time: {self._poll_time}s)...")
        for i in range(1, self._worker_count + 1):
            task = asyncio.create_task(self._worker_loop(worker_id=i))
            self._tasks.append(task)

    async def stop(self) -> None:
        if not self.is_running:
            return
        log("Stopping screenshot extraction workers...")
        self.is_running = False
        self._stop_event.set()

        for task in self._tasks:
            task.cancel()
        if self._tasks:
            await asyncio.gather(*self._tasks, return_exceptions=True)
        self._tasks.clear()
        log("All screenshot extraction workers stopped")

    def get_status(self) -> Dict[str, Any]:
        return {
            "is_running": self.is_running,
            "worker_count": self._worker_count,
            "active_tasks": len([t for t in self._tasks if not t.done()]),
            "poll_time": self._poll_time,
            "image_diff_threshold": IMAGE_DIFF_THRESHOLD,
        }


# Global worker manager instance
worker_manager = ScreenshotExtractionWorkerManager()


async def run_standalone() -> None:
    """Run workers directly as a standalone script until interrupted."""
    print(f"Starting MIRA Screenshot Extraction Workers (Threshold={IMAGE_DIFF_THRESHOLD})...")
    await worker_manager.start()
    try:
        while True:
            await asyncio.sleep(1)
    except (KeyboardInterrupt, asyncio.CancelledError):
        await worker_manager.stop()


if __name__ == "__main__":
    asyncio.run(run_standalone())
