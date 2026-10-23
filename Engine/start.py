from __future__ import annotations

import argparse
import asyncio
import os
import signal
import sys
from pathlib import Path
import uvicorn

# Ensure Engine root directory is in sys.path
_engine_dir = Path(__file__).resolve().parent
if str(_engine_dir) not in sys.path:
    sys.path.insert(0, str(_engine_dir))

import config
from vault_logger import log, log_error
from ocr_summarization import (
    start_ocr_summarization,
    stop_ocr_summarization,
    get_summarization_status,
)
from embedding import (
    start_embedding,
    stop_embedding,
    get_embedding_status,
)

async def run_standalone_workers():
    """Runs OCR Summarization and Embedding workers in standalone asyncio loop."""
    log("Initializing Engine configuration from Vault...")
    try:
        config.CONFIG.fetch_from_vault()
    except Exception as e:
        log_error(f"Failed to fetch initial configuration from Vault: {e}")

    log("Starting OCR Summarization module...")
    await start_ocr_summarization()
    log(f"OCR Summarization module initialized. Status: {get_summarization_status()}")

    log("Starting Embedding module...")
    await start_embedding()
    log(f"Embedding module initialized. Status: {get_embedding_status()}")

    stop_event = asyncio.Event()

    def _signal_handler():
        log("Shutdown signal received.")
        stop_event.set()

    loop = asyncio.get_running_loop()
    if os.name != "nt":
        for sig in (signal.SIGINT, signal.SIGTERM):
            loop.add_signal_handler(sig, _signal_handler)

    try:
        await stop_event.wait()
    except (KeyboardInterrupt, SystemExit):
        pass
    finally:
        log("Shutting down background worker modules...")
        try:
            await stop_embedding()
        except Exception as e:
            log_error(f"Error stopping embedding workers: {e}")
        try:
            await stop_ocr_summarization()
        except Exception as e:
            log_error(f"Error stopping summarization workers: {e}")
        log("Engine shutdown complete.")

def main():
    parser = argparse.ArgumentParser(description="MIRA Engine Startup Script")
    parser.add_argument("--workers-only", action="store_true", help="Run only background workers without web server")
    parser.add_argument("--host", type=str, default=config.SERVER_HOST, help=f"Host (default: {config.SERVER_HOST})")
    parser.add_argument("--port", type=int, default=config.SERVER_PORT, help=f"Port (default: {config.SERVER_PORT})")
    args = parser.parse_args()

    if args.workers_only:
        try:
            asyncio.run(run_standalone_workers())
        except (KeyboardInterrupt, SystemExit):
            print("\nExiting Engine workers.", flush=True)
    else:
        # Launch full FastAPI service (which starts OCR Summarization in its lifespan)
        print(f"[ENGINE] Starting Engine Service on http://{args.host}:{args.port}...", flush=True)
        uvicorn.run("app:app", host=args.host, port=args.port, reload=False)

if __name__ == "__main__":
    main()
