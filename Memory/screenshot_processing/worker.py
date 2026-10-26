from __future__ import annotations
import asyncio
import os
from pathlib import Path
from typing import Any, Dict, List, Optional
import uuid
import requests
import re
import sys
import time
from datetime import datetime
_memory_dir = Path(__file__).resolve().parent.parent
if str(_memory_dir) not in sys.path:
    sys.path.insert(0, str(_memory_dir))
try:
    import config
    from vault_logger import log
except ImportError:
    from Memory import config
    from Memory.vault_logger import log
try:
    from .data_extractor import extract_pixels_and_grayscale, extract_structured_ocr, extract_text_from_image, is_browser_application
    from .image_comparison import compare_app_images, store_image_data, get_recent_images, calculate_image_difference
    from .region_comparator import compare_ui_regions, is_somewhat_similar
    from .uia_extractor import extract_native_uia, get_application_window_title
except ImportError:
    _submodule_dir = Path(__file__).resolve().parent
    if str(_submodule_dir) not in sys.path:
        sys.path.insert(0, str(_submodule_dir))
    from data_extractor import extract_pixels_and_grayscale, extract_structured_ocr, extract_text_from_image, is_browser_application
    from image_comparison import compare_app_images, store_image_data, get_recent_images, calculate_image_difference
    from region_comparator import compare_ui_regions, is_somewhat_similar
    from uia_extractor import extract_native_uia, get_application_window_title
DEFAULT_IMAGE_DIFF_THRESHOLD: float = 0.008
IMAGE_DIFF_THRESHOLD: float = float(os.getenv('IMAGE_DIFF_THRESHOLD', str(DEFAULT_IMAGE_DIFF_THRESHOLD)))

def get_current_threshold() -> float:
    if 'worker_manager' in globals() and hasattr(worker_manager, '_image_diff_threshold'):
        return worker_manager._image_diff_threshold
    return float(os.getenv('IMAGE_DIFF_THRESHOLD', str(DEFAULT_IMAGE_DIFF_THRESHOLD)))

def get_broker_base_url() -> str:
    mb_url = config.get_service_url('message_broker') or config.MESSAGE_BROKER_URL
    if not mb_url:
        raise RuntimeError('Message Broker URL is not configured')
    return mb_url.rstrip('/')

def get_operator_base_url() -> Optional[str]:
    op_url = config.get_service_url('operator') or config.OPERATOR_URL
    return op_url.rstrip('/') if op_url else None

def call_operator_delete_screenshot(image_path: str) -> bool:
    operator_url = get_operator_base_url()
    if operator_url:
        endpoint = f'{operator_url}/delete'
        try:
            resp = requests.post(endpoint, json={'image_path': str(image_path)}, timeout=4.0)
            if resp.status_code in (200, 404):
                return True
        except Exception as e:
            log(f'Operator delete screenshot API call failed ({e}), attempting local removal')
    try:
        p = Path(image_path)
        if p.exists():
            p.unlink(missing_ok=True)
            return True
    except Exception as e:
        log(f"Fallback deletion failed for '{image_path}': {e}")
    return False

def poll_broker_jobs(consumer_key: str, count: int=1) -> List[Dict[str, Any]]:
    base_url = get_broker_base_url()
    endpoint = f'{base_url}/jobs'
    params = {'consumer_key': consumer_key, 'count': count}
    try:
        resp = requests.get(endpoint, params=params, timeout=5.0)
        resp.raise_for_status()
        return resp.json()
    except Exception as e:
        log(f"Polling '{consumer_key}' from Message Broker failed: {e}")
        return []

def remove_broker_job(consumer_key: str, job_id: str) -> bool:
    base_url = get_broker_base_url()
    endpoint = f'{base_url}/jobs'
    params = {'consumer_key': consumer_key, 'job_id': job_id}
    try:
        resp = requests.delete(endpoint, params=params, timeout=5.0)
        return resp.status_code == 200
    except Exception as e:
        log(f'Failed to remove job {job_id} from {consumer_key}: {e}')
        return False

def publish_broker_job(job_payload: Dict[str, Any]) -> bool:
    base_url = get_broker_base_url()
    endpoint = f'{base_url}/jobs'
    try:
        resp = requests.post(endpoint, json=job_payload, timeout=5.0)
        resp.raise_for_status()
        return True
    except Exception as e:
        log(f'Failed to publish job to Message Broker: {e}')
        return False

def process_screenshot_job(job: Dict[str, Any], worker_id: int=1) -> bool:
    job_id = str(job.get('job_id') or '')
    app_name = str(job.get('app_name') or 'Unknown').strip()
    os_name = str(job.get('os') or 'Unknown').strip()
    image_path = str(job.get('image_path') or '').strip()
    timestamp = job.get('timestamp')
    if 'job_data' in job:
        inner = job['job_data']
        if isinstance(inner, str):
            try:
                import json
                inner = json.loads(inner)
            except Exception:
                inner = {}
        if isinstance(inner, dict):
            job_id = job_id or str(inner.get('job_id') or '')
            app_name = str(inner.get('app_name') or app_name).strip()
            os_name = str(inner.get('os') or os_name).strip()
            image_path = image_path or str(inner.get('image_path') or '').strip()
            if inner.get('timestamp') is not None:
                timestamp = inner.get('timestamp')
    if not job_id or not image_path:
        log(f'[Worker-{worker_id}] Invalid job data (missing job_id or image_path): {job}')
        if job_id:
            remove_broker_job('ocr_extraction', job_id)
        return False
    if not os.path.exists(image_path):
        log(f"[Worker-{worker_id}] Image file not found at '{image_path}'. Cleaning up job {job_id}")
        remove_broker_job('ocr_extraction', job_id)
        return False
    log(f"[Worker-{worker_id}] Processing screenshot job {job_id} for app '{app_name}'")
    try:
        pixel_values, grayscale_matrix = extract_pixels_and_grayscale(image_path)
    except Exception as e:
        log(f"[Worker-{worker_id}] Error extracting image data from '{image_path}': {e}")
        call_operator_delete_screenshot(image_path)
        remove_broker_job('ocr_extraction', job_id)
        return False
    h_img, w_img = pixel_values.shape[:2]
    window_metadata = {'app_name': app_name, 'os': os_name, 'timestamp': timestamp, 'dimensions': {'width': w_img, 'height': h_img}}
    try:
        diff_score, prev_record = compare_app_images(app_name, grayscale_matrix)
        effective_threshold = get_current_threshold()
        is_image_unchanged = diff_score is not None and diff_score < effective_threshold
        if prev_record and is_image_unchanged:
            log(f"[Worker-{worker_id}] Duplicate frame detected for app '{app_name}' (diff={diff_score:.4f} < threshold={effective_threshold:.4f}). Skipping extraction.")
            call_operator_delete_screenshot(image_path)
            remove_broker_job('ocr_extraction', job_id)
            return True
        if not prev_record:
            recent = get_recent_images(limit=1)
            if recent:
                candidate = recent[0]
                cand_ts = candidate.get('timestamp')
                try:
                    cand_age = time.time() - float(cand_ts)
                    if cand_age < 15.0:
                        cand_gray = candidate.get('grayscale_matrix')
                        if cand_gray is not None:
                            d = calculate_image_difference(cand_gray, grayscale_matrix)
                            if d < effective_threshold:
                                log(f"[Worker-{worker_id}] Duplicate frame detected across app boundary ('{candidate.get('app_name')}' -> '{app_name}', diff={d:.4f} < {effective_threshold:.4f}). Skipping extraction.")
                                call_operator_delete_screenshot(image_path)
                                remove_broker_job('ocr_extraction', job_id)
                                return True
                            diff_score = d
                            prev_record = candidate
                except Exception:
                    pass
        if diff_score is not None:
            log(f"[Worker-{worker_id}] App '{app_name}' changed (diff={diff_score:.4f} >= threshold={effective_threshold:.4f})")
        else:
            log(f"[Worker-{worker_id}] First frame or no prior comparison record for app '{app_name}'")
        is_browser = is_browser_application(app_name)
        active_win_title = get_application_window_title(app_name)
        if active_win_title:
            window_metadata['window_title'] = active_win_title
        extraction_source = 'ocr'
        try:
            ocr_result = extract_structured_ocr(pixel_values, app_name=app_name, window_title=active_win_title)
            full_text = ocr_result.get('extracted_text') or ocr_result.get('corrected_text', '')
            ui_regions = ocr_result.get('ui_regions', [])
            log(f"[Worker-{worker_id}] Screen OCR extracted {len(full_text)} chars, {len(ui_regions)} regions for '{app_name}' (Window: '{active_win_title}')")
        except Exception as e:
            log(f"[Worker-{worker_id}] Structured OCR failed for '{image_path}': {e}")
            full_text = ''
            ui_regions = []
        if not is_browser:
            try:
                uia_res = extract_native_uia(app_name=app_name)
                if uia_res.get('success'):
                    uia_text = uia_res.get('extracted_text', '')
                    focus_idx = uia_text.find('## Active Focus:')
                    if focus_idx != -1 and '## Active Focus:' not in full_text:
                        focus_part = uia_text[focus_idx:].strip()
                        full_text = full_text.rstrip() + '\n\n' + focus_part + '\n'
                    if len(full_text.strip()) < 30 and len(uia_text.strip()) >= 30:
                        full_text = uia_text
                        extraction_source = 'uia'
                        ui_regions = [{'region_id': f'uia_{i}', 'type': 'header' if el['type'] in ('TabItemControl', 'MenuItemControl') else 'sidebar' if el['bbox'][0] / max(w_img, 1) < 0.2 else 'content', 'bbox': el['bbox'], 'raw_text': el['name'] or el['value'], 'corrected_text': el['name'] or el['value'], 'text': el['name'] or el['value'], 'confidence': 100.0, 'is_filtered': False} for i, el in enumerate(uia_res.get('elements', []))]
            except Exception as e:
                log(f"[Worker-{worker_id}] UIA enrichment exception for '{app_name}': {e}")
        if not ui_regions or not full_text.strip():
            log(f"[Worker-{worker_id}] No UI regions extracted for '{app_name}' (blank/transitional frame). Skipping summarization.")
            call_operator_delete_screenshot(image_path)
            remove_broker_job('ocr_extraction', job_id)
            return True
        prev_metadata = prev_record.get('metadata', {}) if prev_record else {}
        prev_regions = prev_metadata.get('ui_regions', [])
        prev_text = prev_metadata.get('extracted_text', '')
        region_changes = compare_ui_regions(previous_regions=prev_regions, current_regions=ui_regions, previous_text=prev_text, current_text=full_text)
        if prev_record:
            prev_ts = prev_record.get('timestamp')
            if prev_ts:
                try:
                    time_since_prev = time.time() - float(prev_ts)
                    if 0 <= time_since_prev < 4.0:
                        overall_sim = float(region_changes.get('overall_text_similarity', 1.0))
                        if overall_sim >= 0.7:
                            log(f"[Worker-{worker_id}] Throttling rapid consecutive frame for '{app_name}' ({time_since_prev:.1f}s ago, similarity={overall_sim:.1%}). Skipping summarization.")
                            call_operator_delete_screenshot(image_path)
                            remove_broker_job('ocr_extraction', job_id)
                            return True
                except Exception:
                    pass
            is_similar, reason = is_somewhat_similar(region_changes, diff_score, similarity_threshold=0.85)
            if is_similar:
                log(f"[Worker-{worker_id}] Ignoring somewhat similar frame for app '{app_name}' ({reason}). Skipping summarization.")
                call_operator_delete_screenshot(image_path)
                remove_broker_job('ocr_extraction', job_id)
                return True
        try:
            structured_metadata = {'window_metadata': window_metadata, 'extraction_source': extraction_source, 'ui_regions': ui_regions, 'extracted_text': full_text, 'changes': region_changes}
            store_image_data(app_name=app_name, pixel_values=pixel_values, grayscale_matrix=grayscale_matrix, image_id=job_id, timestamp=timestamp, metadata=structured_metadata)
        except Exception as e:
            log(f'[Worker-{worker_id}] Warning: failed to store image comparison in Redis: {e}')
        call_operator_delete_screenshot(image_path)
        new_job_id = str(uuid.uuid4())
        summarization_job = {'job_id': new_job_id, 'consumer_key': 'ocr_summarization', 'app_name': app_name, 'os': os_name, 'timestamp': timestamp, 'extracted_text': full_text}
        published = publish_broker_job(summarization_job)
        if published:
            log(f"[Worker-{worker_id}] Published structured job {new_job_id} ({extraction_source}) to 'ocr_summarization' (extracted {len(full_text)} chars, {len(ui_regions)} UI regions from '{app_name}')")
        else:
            log(f"[Worker-{worker_id}] Failed to publish job {new_job_id} to 'ocr_summarization'")

        removed = remove_broker_job('ocr_extraction', job_id)
        if removed:
            log(f"[Worker-{worker_id}] Completed and removed job {job_id} from 'ocr_extraction'")
        return True
    except Exception as e:
        log(f'[Worker-{worker_id}] Unhandled error processing job {job_id}: {e}')
        call_operator_delete_screenshot(image_path)
        remove_broker_job('ocr_extraction', job_id)
        return False

class ScreenshotExtractionWorkerManager:

    def __init__(self) -> None:
        self.is_running: bool = False
        self._stop_event: asyncio.Event = asyncio.Event()
        self._tasks: List[asyncio.Task] = []
        self._poll_time: float = 5.0
        self._worker_count: int = 1
        self._image_diff_threshold: float = IMAGE_DIFF_THRESHOLD

    def refresh_config(self) -> None:
        worker_cfg = config.fetch_worker_config()
        self._poll_time = worker_cfg.get('screenshot_extraction_poll_time', 5.0)
        self._worker_count = worker_cfg.get('screenshot_extraction_workers', 1)
        vault_thresh = worker_cfg.get('image_diff_threshold')
        if vault_thresh is not None:
            self._image_diff_threshold = float(vault_thresh)
        else:
            self._image_diff_threshold = float(os.getenv('IMAGE_DIFF_THRESHOLD', str(DEFAULT_IMAGE_DIFF_THRESHOLD)))

    async def _worker_loop(self, worker_id: int) -> None:
        log(f'[Worker-{worker_id}] Worker started (poll_time={self._poll_time}s)')
        while not self._stop_event.is_set():
            try:
                self.refresh_config()
                jobs = await asyncio.to_thread(poll_broker_jobs, 'ocr_extraction', 1)
                if jobs and len(jobs) > 0:
                    job = jobs[0]
                    await asyncio.to_thread(process_screenshot_job, job, worker_id)
                    await asyncio.sleep(0.01)
                else:
                    try:
                        await asyncio.wait_for(self._stop_event.wait(), timeout=self._poll_time)
                    except asyncio.TimeoutError:
                        pass
            except asyncio.CancelledError:
                break
            except Exception as e:
                log(f'[Worker-{worker_id}] Unhandled error in worker loop: {e}')
                await asyncio.sleep(self._poll_time)
        log(f'[Worker-{worker_id}] Worker stopped cleanly')

    async def start(self) -> None:
        if self.is_running:
            return
        self.refresh_config()
        self.is_running = True
        self._stop_event.clear()
        log(f'Starting {self._worker_count} screenshot extraction worker(s) in parallel (poll_time: {self._poll_time}s)...')
        for i in range(1, self._worker_count + 1):
            task = asyncio.create_task(self._worker_loop(worker_id=i))
            self._tasks.append(task)

    async def stop(self) -> None:
        if not self.is_running:
            return
        log('Stopping screenshot extraction workers...')
        self.is_running = False
        self._stop_event.set()
        for task in self._tasks:
            task.cancel()
        if self._tasks:
            await asyncio.gather(*self._tasks, return_exceptions=True)
        self._tasks.clear()
        log('All screenshot extraction workers stopped')

    def get_status(self) -> Dict[str, Any]:
        return {'is_running': self.is_running, 'worker_count': self._worker_count, 'active_tasks': len([t for t in self._tasks if not t.done()]), 'poll_time': self._poll_time, 'image_diff_threshold': self._image_diff_threshold}
worker_manager = ScreenshotExtractionWorkerManager()

async def run_standalone() -> None:
    print(f'Starting MIRA Screenshot Extraction Workers (Threshold={IMAGE_DIFF_THRESHOLD})...')
    await worker_manager.start()
    try:
        while True:
            await asyncio.sleep(1)
    except (KeyboardInterrupt, asyncio.CancelledError):
        await worker_manager.stop()
if __name__ == '__main__':
    asyncio.run(run_standalone())
