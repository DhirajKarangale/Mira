from __future__ import annotations

import json
import logging
from typing import Any, Dict, List

import redis.exceptions

from redis_client import get_redis_client
import consumer_group_manager as cgm

logger = logging.getLogger("mira.redis_service")


async def ensure_consumer_group(stream_name: str, group_name: str) -> None:
    client = get_redis_client()
    try:
        await client.xgroup_create(stream_name, group_name, id="0", mkstream=True)
    except redis.exceptions.ResponseError as e:
        if "BUSYGROUP" not in str(e):
            logger.warning(f"Error ensuring consumer group {group_name} on {stream_name}: {e}")


async def clean_all_consumer_groups() -> Dict[str, str]:
    client = get_redis_client()
    for group in cgm.get_all_consumer_groups():
        stream_name = cgm.get_stream_for_consumer_group(group)
        if stream_name:
            try:
                await client.delete(stream_name)
                await client.delete(f"{stream_name}:job_ids")
                await client.xgroup_create(stream_name, group, id="0", mkstream=True)
            except Exception as e:
                logger.error(f"Error cleaning {group}: {e}")

    return {"message": "successfully cleaned all consumer groups"}


async def format_all_redis() -> Dict[str, str]:
    client = get_redis_client()
    await client.flushdb()
    return {"message": "successfully formatted redis"}


async def add_job_to_stream(job_data: Dict[str, Any]) -> Dict[str, str]:
    job_id = job_data.get("job_id")
    consumer_key = job_data.get("consumer_key")
    if not job_id or not consumer_key:
        raise ValueError("job_id and consumer_key are required.")

    consumer_group = cgm.get_consumer_group(consumer_key)
    if not consumer_group:
        raise ValueError(f"Unknown consumer_key: '{consumer_key}'.")

    stream_name = cgm.get_stream_for_consumer_key(consumer_key)
    client = get_redis_client()

    await ensure_consumer_group(stream_name, consumer_group)

    stream_fields: Dict[str, str] = {}
    for k, v in job_data.items():
        if k == "consumer_key":
            continue
        if isinstance(v, (dict, list)):
            stream_fields[k] = json.dumps(v)
        elif v is not None:
            stream_fields[k] = str(v)

    stream_entry_id = await client.xadd(stream_name, stream_fields)
    await client.hset(f"{stream_name}:job_ids", str(job_id), stream_entry_id)

    return {"message": "successfully queued"}


async def get_jobs_from_stream(consumer_key: str, count: int = 1) -> List[Dict[str, Any]]:
    consumer_group = cgm.get_consumer_group(consumer_key)
    if not consumer_group:
        raise ValueError(f"Unknown consumer_key: '{consumer_key}'.")

    count = min(max(int(count), 1), 10)
    stream_name = cgm.get_stream_for_consumer_key(consumer_key)
    client = get_redis_client()

    await ensure_consumer_group(stream_name, consumer_group)

    worker_name = f"{consumer_group}_worker"
    read_results = await client.xreadgroup(
        groupname=consumer_group,
        consumername=worker_name,
        streams={stream_name: ">"},
        count=count
    )

    jobs: List[Dict[str, Any]] = []
    if read_results and read_results[0][1]:
        for entry_id, fields in read_results[0][1]:
            job_obj: Dict[str, Any] = {}
            for k, v in fields.items():
                try:
                    job_obj[k] = json.loads(v)
                except Exception:
                    job_obj[k] = v
            jobs.append(job_obj)

    return jobs


async def delete_job_from_stream(consumer_key: str, job_id: str) -> Dict[str, str]:
    consumer_group = cgm.get_consumer_group(consumer_key)
    if not consumer_group:
        raise ValueError(f"Unknown consumer_key: '{consumer_key}'.")

    stream_name = cgm.get_stream_for_consumer_key(consumer_key)
    client = get_redis_client()

    stream_entry_id = await client.hget(f"{stream_name}:job_ids", str(job_id))
    if not stream_entry_id:
        parts = str(job_id).split("-")
        if len(parts) == 2 and parts[0].isdigit() and parts[1].isdigit():
            stream_entry_id = str(job_id)
        else:
            return {"message": "job not found"}

    try:
        await client.xack(stream_name, consumer_group, stream_entry_id)
    except Exception:
        pass

    try:
        await client.xdel(stream_name, stream_entry_id)
    except Exception:
        pass

    await client.hdel(f"{stream_name}:job_ids", str(job_id))
    return {"message": "successfully deleted"}
