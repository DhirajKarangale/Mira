from __future__ import annotations

import json
from datetime import datetime, timezone
import logging
from typing import Any, Dict, List, Optional

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


async def clean_all_consumer_groups() -> Dict[str, Any]:
    client = get_redis_client()
    all_groups = cgm.get_all_consumer_groups()
    report_lines: List[str] = []
    details: List[Dict[str, Any]] = []

    for group in all_groups:
        stream_name = cgm.get_stream_for_consumer_group(group)
        if not stream_name:
            continue

        try:
            job_count = await client.xlen(stream_name)
        except Exception:
            job_count = 0

        try:
            await client.delete(stream_name)
            await client.delete(f"{stream_name}:job_ids")
            await client.xgroup_create(stream_name, group, id="0", mkstream=True)
        except Exception as e:
            logger.error(f"Error cleaning stream for group {group}: {e}")

        line = f"{group} - {job_count} - Cleaned"
        report_lines.append(line)
        details.append({
            "consumer_group": group,
            "stream_name": stream_name,
            "jobs_count": job_count,
            "status": "Cleaned"
        })

    total_cleaned = len(details)
    summary_line = f"Total cleaned Consumer groups: {total_cleaned}"
    formatted_message = "\n".join(report_lines) + f"\n\n{summary_line}"

    return {
        "status": "success",
        "message": formatted_message,
        "total_cleaned": total_cleaned,
        "details": details
    }


async def format_all_redis() -> Dict[str, Any]:
    client = get_redis_client()
    total_items = await client.dbsize()
    await client.flushdb()

    message = (
        f"Formatted Redis successfully. Deleted all {total_items} items present in Redis "
        f"(including all keys, streams, consumer groups, sets, hashes, and queues)."
    )

    return {
        "status": "success",
        "deleted_count": total_items,
        "message": message
    }


async def add_job_to_stream(job_data: Dict[str, Any]) -> Dict[str, Any]:
    job_id = job_data.get("job_id")
    consumer_key = job_data.get("consumer_key")
    if not job_id:
        raise ValueError("job_id is required.")
    if not consumer_key:
        raise ValueError("consumer_key is required.")

    consumer_group = cgm.get_consumer_group(consumer_key)
    if not consumer_group:
        raise ValueError(f"Unknown consumer_key: '{consumer_key}'.")

    stream_name = cgm.get_stream_for_consumer_key(consumer_key)
    client = get_redis_client()

    await ensure_consumer_group(stream_name, consumer_group)

    entry_payload = job_data.get("payload") or {}
    stream_fields: Dict[str, str] = {
        "job_id": str(job_id),
        "consumer_key": str(consumer_key),
        "consumer_group": str(consumer_group),
        "payload": json.dumps(entry_payload),
        "created_at": datetime.now(timezone.utc).isoformat(),
    }
    if "callback_url" in job_data and job_data["callback_url"]:
        stream_fields["callback_url"] = str(job_data["callback_url"])
    if "target_service" in job_data and job_data["target_service"]:
        stream_fields["target_service"] = str(job_data["target_service"])

    for k, v in job_data.items():
        if k not in {"job_id", "consumer_key", "consumer_group", "payload", "callback_url", "target_service"} and v is not None:
            stream_fields[k] = json.dumps(v) if isinstance(v, (dict, list)) else str(v)

    stream_entry_id = await client.xadd(stream_name, stream_fields)
    await client.hset(f"{stream_name}:job_ids", str(job_id), stream_entry_id)

    return {
        "status": "queued",
        "job_id": job_id,
        "stream_id": stream_entry_id,
        "stream_name": stream_name,
        "consumer_key": consumer_key,
        "consumer_group": consumer_group,
        "callback_url": job_data.get("callback_url"),
        "message": f"Job '{job_id}' successfully queued in stream '{stream_name}'."
    }


async def get_job_from_stream(consumer_key: str) -> Dict[str, Any]:
    consumer_group = cgm.get_consumer_group(consumer_key)
    if not consumer_group:
        raise ValueError(f"Unknown consumer_key: '{consumer_key}'.")

    stream_name = cgm.get_stream_for_consumer_key(consumer_key)
    client = get_redis_client()

    await ensure_consumer_group(stream_name, consumer_group)

    worker_name = f"{consumer_group}_worker"

    read_results = await client.xreadgroup(
        groupname=consumer_group,
        consumername=worker_name,
        streams={stream_name: ">"},
        count=1
    )

    if not read_results:
        return {
            "status": "empty",
            "message": f"No pending jobs available for consumer_key '{consumer_key}' in consumer group '{consumer_group}'.",
            "consumer_key": consumer_key,
            "consumer_group": consumer_group,
            "job": None
        }

    stream_result = read_results[0]
    entries = stream_result[1]
    if not entries:
        return {
            "status": "empty",
            "message": f"No pending jobs available for consumer_key '{consumer_key}'.",
            "consumer_key": consumer_key,
            "consumer_group": consumer_group,
            "job": None
        }

    entry_id, raw_fields = entries[0]

    parsed_payload = raw_fields.get("payload")
    if parsed_payload:
        try:
            parsed_payload = json.loads(parsed_payload)
        except Exception:
            pass

    job_data = {
        "job_id": raw_fields.get("job_id"),
        "stream_id": entry_id,
        "consumer_key": consumer_key,
        "consumer_group": consumer_group,
        "consumer_worker": worker_name,
        "callback_url": raw_fields.get("callback_url"),
        "target_service": raw_fields.get("target_service"),
        "payload": parsed_payload,
        "created_at": raw_fields.get("created_at"),
        "in_pel": True,
        "pel_status": "Job is in Pending Entries List (PEL) awaiting acknowledgment or completion."
    }

    return {
        "status": "success",
        "message": f"Retrieved job '{job_data['job_id']}' (stream ID: {entry_id}) and placed in PEL.",
        "job": job_data
    }


async def delete_job_from_stream(
    consumer_key: str,
    job_id: str
) -> Dict[str, Any]:
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
            return {
                "status": "not_found",
                "message": f"Job '{job_id}' not found in stream '{stream_name}' or already deleted.",
                "job_id": job_id,
                "stream_id": None,
                "deleted_count": 0
            }

    try:
        await client.xack(stream_name, consumer_group, stream_entry_id)
    except Exception as e:
        logger.debug(f"xack note for {stream_entry_id}: {e}")

    deleted_count = 0
    try:
        deleted_count = await client.xdel(stream_name, stream_entry_id)
    except Exception as e:
        logger.debug(f"xdel note for {stream_entry_id}: {e}")

    await client.hdel(f"{stream_name}:job_ids", str(job_id))

    if deleted_count > 0:
        return {
            "status": "success",
            "message": f"Successfully deleted job '{job_id}' (stream ID: {stream_entry_id}) from stream '{stream_name}'.",
            "job_id": job_id,
            "stream_id": stream_entry_id,
            "deleted_count": deleted_count
        }
    else:
        return {
            "status": "not_found",
            "message": f"Job '{job_id}' not found in stream '{stream_name}' or already deleted.",
            "job_id": job_id,
            "stream_id": stream_entry_id,
            "deleted_count": 0
        }
