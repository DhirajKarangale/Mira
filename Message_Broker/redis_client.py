from __future__ import annotations

from typing import Optional
import redis.asyncio as aioredis
import config
from vault_logger import log

import asyncio

_redis_client: Optional[aioredis.Redis] = None


def get_redis_client() -> aioredis.Redis:
    global _redis_client
    try:
        current_loop = asyncio.get_running_loop()
    except RuntimeError:
        current_loop = None

    if _redis_client is not None and current_loop is not None:
        client_loop = getattr(_redis_client, "_mira_loop", None)
        if client_loop is not None and (client_loop is not current_loop or client_loop.is_closed()):
            _redis_client = None

    if _redis_client is None:
        _redis_client = aioredis.Redis(
            host=config.REDIS_HOST,
            port=config.REDIS_PORT,
            db=config.REDIS_DB,
            password=config.REDIS_PASSWORD,
            decode_responses=config.REDIS_DECODE_RESPONSES,
            protocol=config.REDIS_PROTOCOL,
        )
        if current_loop is not None:
            setattr(_redis_client, "_mira_loop", current_loop)
    return _redis_client


async def init_redis_connection() -> bool:
    client = get_redis_client()
    try:
        pong = await client.ping()
        log(f"Connected to Redis at {config.REDIS_HOST}:{config.REDIS_PORT}")
        return bool(pong)
    except Exception as e:
        log(f"Failed to connect to Redis at {config.REDIS_HOST}:{config.REDIS_PORT}: {e}")
        raise e


async def close_redis_connection() -> None:
    global _redis_client
    if _redis_client is not None:
        try:
            if hasattr(_redis_client, "aclose"):
                await _redis_client.aclose()
            else:
                await _redis_client.close()
        except Exception as e:
            log(f"Error closing Redis connection: {e}")
        finally:
            _redis_client = None
