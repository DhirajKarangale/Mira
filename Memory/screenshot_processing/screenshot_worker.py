from __future__ import annotations

import asyncio
from .worker import *
from .worker import (
    DEFAULT_IMAGE_DIFF_THRESHOLD,
    IMAGE_DIFF_THRESHOLD,
    get_current_threshold,
    get_broker_base_url,
    get_operator_base_url,
    call_operator_delete_screenshot,
    poll_broker_jobs,
    remove_broker_job,
    publish_broker_job,
    process_screenshot_job,
    ScreenshotExtractionWorkerManager,
    worker_manager,
    run_standalone,
)

if __name__ == "__main__":
    asyncio.run(run_standalone())
