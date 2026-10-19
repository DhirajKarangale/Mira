from __future__ import annotations

import asyncio
from contextlib import asynccontextmanager
import logging
import sys
import uvicorn
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

import config
from api import router as broker_router
from redis_client import init_redis_connection, close_redis_connection

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(name)s: %(message)s",
    datefmt="%Y-%m-%d %H:%M:%S"
)
logger = logging.getLogger("mira.app")


@asynccontextmanager
async def lifespan(app: FastAPI):
    logger.info("Initializing Redis connection on startup...")
    await init_redis_connection()
    logger.info("Redis connection established.")
    yield
    logger.info("Closing Redis connection on shutdown...")
    await close_redis_connection()
    logger.info("Redis connection closed.")


def create_app() -> FastAPI:
    app = FastAPI(
        title="MIRA Message Broker",
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
            "service": "MIRA Message Broker",
            "status": "online"
        }

    return app


app = create_app()


def start_app() -> None:
    host = config.SERVER_HOST
    port = config.SERVER_PORT
    reload = config.SERVER_RELOAD

    logger.info(f"Starting MIRA Message Broker server on http://{host}:{port}")

    try:
        asyncio.run(init_redis_connection())
    except Exception as e:
        logger.error(f"Cannot start server: Redis is not reachable on {config.REDIS_HOST}:{config.REDIS_PORT} ({e})")
        sys.exit(1)

    uvicorn.run(app, host=host, port=port, reload=reload)


if __name__ == "__main__":
    start_app()

