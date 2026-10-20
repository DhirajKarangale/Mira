from __future__ import annotations

import asyncio
from contextlib import asynccontextmanager
import os
import sys
import uvicorn
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

import config
from api import router as broker_router
from redis_client import init_redis_connection, close_redis_connection
from vault_logger import log


@asynccontextmanager
async def lifespan(app: FastAPI):
    try:
        config.fetch_and_store_config()
        log("Fetched and updated Message Broker configuration from Vault.")
    except Exception as e:
        log(f"Using local Message Broker configuration fallback: {e}")

    log("Initializing Redis connection on startup...")
    await init_redis_connection()
    log("Redis connection established.")
    yield
    log("Closing Redis connection on shutdown...")
    await close_redis_connection()
    log("Redis connection closed.")


def create_app() -> FastAPI:
    app = FastAPI(
        title="Message Broker",
        lifespan=lifespan
    )

    app.add_middleware(
        CORSMiddleware,
        allow_origins=["*"],
        allow_credentials=True,
        allow_methods=["*"],
        allow_headers=["*"],
    )

    app.include_router(broker_router)

    @app.get("/")
    async def root():
        return {
            "service": "Message Broker",
            "status": "online"
        }

    return app


app = create_app()


def start_app() -> None:
    config.fetch_and_store_config()

    mb_url = config.SERVICES["message_broker"]
    clean = mb_url.replace("http://", "").replace("https://", "").rstrip("/")
    default_host, default_port = clean.split(":")

    host = config.SERVER_HOST or default_host
    port = int(os.getenv("PORT", default_port))
    reload = config.SERVER_RELOAD

    log(f"Starting Message Broker server on http://{host}:{port}")
    uvicorn.run("app:app", host=host, port=port, reload=reload)


if __name__ == "__main__":
    start_app()
