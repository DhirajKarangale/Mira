from __future__ import annotations

import sys
if sys.platform == "win32":
    from asyncio.proactor_events import _ProactorBasePipeTransport

    _orig_call_connection_lost = _ProactorBasePipeTransport._call_connection_lost

    def _silenced_call_connection_lost(self, exc):
        try:
            _orig_call_connection_lost(self, exc)
        except ConnectionResetError:
            pass
        except OSError as e:
            if getattr(e, "winerror", None) == 10054:
                pass
            else:
                raise

    _ProactorBasePipeTransport._call_connection_lost = _silenced_call_connection_lost

from contextlib import asynccontextmanager
import logging
import uvicorn
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

import config
from api import router as vault_router
import crypto
import config_storage
import log_manager


class VaultTerminalFilter(logging.Filter):
    def filter(self, record: logging.LogRecord) -> bool:
        if record.levelno >= logging.WARNING:
            return True
        msg = record.getMessage()
        if msg.startswith("[VAULT LOG]"):
            return True
        if config_storage._DB_CONN is None:
            return True
        try:
            cfg = log_manager.get_logs_config()
            return bool(cfg.get("show_logs_vault", True))
        except Exception:
            return True


logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(name)s: %(message)s",
    datefmt="%Y-%m-%d %H:%M:%S"
)
_vault_terminal_filter = VaultTerminalFilter()
for handler in logging.root.handlers:
    handler.addFilter(_vault_terminal_filter)
for _log_name in ("uvicorn", "uvicorn.access", "uvicorn.error", "mira.vault"):
    logging.getLogger(_log_name).addFilter(_vault_terminal_filter)

logger = logging.getLogger("mira.vault.app")


@asynccontextmanager
async def lifespan(app: FastAPI):
    logger.info("Initializing MIRA Vault module on startup...")

    try:
        crypto.init_encryption_key()
        logger.info("Vault encryption key successfully initialized and held strictly internal in memory.")
    except Exception as e:
        logger.error(f"Failed to initialize encryption key: {e}")
        sys.exit(1)

    try:
        config_storage.init_config_storage()
        logger.info("SQL configuration storage initialized, synchronized, and encrypted.")
    except Exception as e:
        logger.error(f"Failed to initialize SQL configuration storage: {e}")
        sys.exit(1)

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
    await log_manager.log_vault_event("MIRA Vault module initialized and online.")
    yield
    logger.info("MIRA Vault shutting down...")
    await log_manager.log_vault_event("MIRA Vault shutting down...")


def create_app() -> FastAPI:
    app = FastAPI(
        title="MIRA Vault",
        version="1.0.0",
        lifespan=lifespan
    )

    app.add_middleware(
        CORSMiddleware,
        allow_origins=["*"],
        allow_credentials=True,
        allow_methods=["*"],
        allow_headers=["*"],
        expose_headers=["*"],
    )

    app.include_router(vault_router)
    return app


app = create_app()


def start_app() -> None:
    host = config.SERVER_HOST
    port = config.SERVER_PORT
    if not port:
        raise RuntimeError("Vault port not specified! Set via PORT/VAULT_PORT env var, --port, or services.json")
    reload = config.SERVER_RELOAD

    logger.info(f"Starting MIRA Vault web server on http://{host}:{port}")
    uvicorn.run("app:app", host=host, port=port, reload=reload)


if __name__ == "__main__":
    start_app()
