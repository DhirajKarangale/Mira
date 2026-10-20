from __future__ import annotations

from contextlib import asynccontextmanager
import logging
import sys
import uvicorn
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

import config
from api import router as vault_router
import crypto
import config_storage
import log_manager

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(name)s: %(message)s",
    datefmt="%Y-%m-%d %H:%M:%S"
)
logger = logging.getLogger("mira.vault.app")


@asynccontextmanager
async def lifespan(app: FastAPI):
    logger.info("Initializing MIRA Vault module on startup...")

    # 1. Key Generation & Retrieval:
    try:
        crypto.init_encryption_key()
        logger.info(
            "Vault encryption key successfully initialized and held strictly internal in memory."
        )
    except Exception as e:
        logger.error(f"Failed to initialize encryption key: {e}")
        sys.exit(1)

    # 2. SQL Configuration Storage & Schema Synchronization:
    try:
        config_storage.init_config_storage()
        logger.info("SQL configuration storage initialized, synchronized, and encrypted.")
    except Exception as e:
        logger.error(f"Failed to initialize SQL configuration storage: {e}")
        sys.exit(1)

    # 3. Log Management Initialization:
    try:
        log_manager.init_logs_directory()
        cleanup_stats = log_manager.clean_expired_and_invalid_logs()
        logger.info(
            f"Startup log retention cleanup complete: "
            f"deleted_invalid={cleanup_stats['deleted_invalid_count']}, "
            f"deleted_expired={cleanup_stats['deleted_expired_count']}, "
            f"retained={cleanup_stats['retained_count']}."
        )
    except Exception as e:
        logger.error(f"Failed to initialize or clean logs directory: {e}")

    logger.info("MIRA Vault initialization complete. Ready to receive requests.")
    yield
    logger.info("MIRA Vault shutting down...")


def create_app() -> FastAPI:
    app = FastAPI(
        title="MIRA Vault",
        description="Centralized Vault Module for Encrypted Logs, Configuration, and Secrets",
        version="1.0.0",
        lifespan=lifespan
    )

    app.add_middleware(
        CORSMiddleware,
        allow_origins=["*"],
        allow_credentials=True,
        allow_methods=["*"],
        allow_headers=["*"],
    )

    app.include_router(vault_router)

    @app.get("/")
    async def root():
        return {
            "service": "MIRA Vault",
            "status": "online",
            "version": "1.0.0"
        }

    @app.get("/health")
    async def health():
        return {
            "status": "healthy",
            "service": "MIRA Vault"
        }

    return app


app = create_app()


def start_app() -> None:
    host = config.SERVER_HOST
    port = config.SERVER_PORT
    reload = config.SERVER_RELOAD

    logger.info(f"Starting MIRA Vault web server on http://{host}:{port}")
    uvicorn.run("app:app", host=host, port=port, reload=reload)


if __name__ == "__main__":
    start_app()
