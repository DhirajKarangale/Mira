from __future__ import annotations

import json
from typing import Any, Dict, List, Optional

import redis.exceptions

from redis_client import get_redis_client
import consumer_group_manager as cgm
from vault_logger import log


async def ensure_consumer_group(stream_name: str, group_name: str) -> None:
    client = get_redis_client()
    try:
        await client.xgroup_create(stream_name, group_name, id="0", mkstream=True)
    except redis.exceptions.ResponseError as e:
        if "BUSYGROUP" not in str(e):
            log(f"Error ensuring consumer group {group_name} on {stream_name}: {e}")


async def clean_all_consumer_groups() -> Dict[str, Any]:
    client = get_redis_client()
    cleaned = 0
    for group in cgm.get_all_consumer_groups():
        stream_name = cgm.get_stream_for_consumer_group(group)
        if stream_name:
            try:
                await client.delete(stream_name)
                await client.delete(f"{stream_name}:job_ids")
                await client.xgroup_create(stream_name, group, id="0", mkstream=True)
                cleaned += 1
            except Exception as e:
                log(f"Error cleaning {group}: {e}")

    return {
        "message": f"Successfully cleaned all consumer groups ({cleaned} groups reset)",
        "cleaned_groups": cleaned
    }


async def format_all_redis() -> Dict[str, Any]:
    client = get_redis_client()
    await client.flushdb()
    recreated = 0
    for key, group in cgm._load_consumer_groups().items():
        stream_name = f"mira:stream:{key}"
        try:
            await client.xgroup_create(stream_name, group, id="0", mkstream=True)
            recreated += 1
        except Exception as e:
            log(f"Error re-creating consumer group {group} on {stream_name}: {e}")
    return {
        "message": f"Successfully formatted Redis and initialized {recreated} consumer groups",
        "status": "success",
        "initialized_groups": recreated
    }


async def get_consumer_groups_details() -> List[Dict[str, Any]]:
    client = get_redis_client()
    configured_groups = cgm._load_consumer_groups()
    results: List[Dict[str, Any]] = []
    processed_pairs = set()

    for key, group_name in configured_groups.items():
        stream_name = f"mira:stream:{key}"
        group_entry: Dict[str, Any] = {
            "group_name": group_name,
            "stream_name": stream_name,
            "consumer_key": key,
            "consumers_count": 0,
            "pending_messages_count": 0,
            "active_messages_count": 0,
            "total_messages_count": 0,
            "last_delivered_id": "0-0",
            "status": "idle",
            "is_registered": True,
            "stream_exists": False,
        }

        try:
            exists = await client.exists(stream_name)
            if exists:
                group_entry["stream_exists"] = True
                stream_len = await client.xlen(stream_name)
                group_entry["total_messages_count"] = stream_len
                group_entry["active_messages_count"] = stream_len

                try:
                    groups_info = await client.xinfo_groups(stream_name)
                    matching = next((g for g in groups_info if g.get("name") == group_name), None)
                    if matching:
                        group_entry["consumers_count"] = matching.get("consumers", 0)
                        group_entry["pending_messages_count"] = matching.get("pending", 0)
                        group_entry["last_delivered_id"] = str(matching.get("last-delivered-id", "0-0"))
                        if group_entry["pending_messages_count"] > 0:
                            group_entry["status"] = "active"
                        else:
                            group_entry["status"] = "idle"
                    else:
                        group_entry["status"] = "group_missing"
                except Exception:
                    pass
        except Exception as e:
            log(f"Error inspecting group {group_name} on {stream_name}: {e}")

        results.append(group_entry)
        processed_pairs.add((stream_name, group_name))

    try:
        all_stream_keys = await client.keys("mira:stream:*")
        for stream_key in all_stream_keys:
            if stream_key.endswith(":job_ids"):
                continue
            try:
                groups_info = await client.xinfo_groups(stream_key)
                stream_len = await client.xlen(stream_key)
                for g in groups_info:
                    g_name = g.get("name")
                    if (stream_key, g_name) not in processed_pairs:
                        results.append({
                            "group_name": g_name,
                            "stream_name": stream_key,
                            "consumer_key": stream_key.replace("mira:stream:", ""),
                            "consumers_count": g.get("consumers", 0),
                            "pending_messages_count": g.get("pending", 0),
                            "active_messages_count": stream_len,
                            "total_messages_count": stream_len,
                            "last_delivered_id": str(g.get("last-delivered-id", "0-0")),
                            "status": "active" if g.get("pending", 0) > 0 else "idle",
                            "is_registered": False,
                            "stream_exists": True,
                        })
                        processed_pairs.add((stream_key, g_name))
            except Exception:
                pass
    except Exception as e:
        log(f"Error scanning extra Redis streams: {e}")

    return results


async def delete_consumer_group(group_name: str, stream_name: Optional[str] = None) -> Dict[str, Any]:
    client = get_redis_client()
    if not stream_name:
        stream_name = cgm.get_stream_for_consumer_group(group_name)

    if not stream_name:
        stream_keys = await client.keys("mira:stream:*")
        for sk in stream_keys:
            if sk.endswith(":job_ids"):
                continue
            try:
                groups = await client.xinfo_groups(sk)
                if any(g.get("name") == group_name for g in groups):
                    stream_name = sk
                    break
            except Exception:
                pass

    if not stream_name:
        raise ValueError(f"Stream for consumer group '{group_name}' not found.")

    destroyed = False
    try:
        res = await client.xgroup_destroy(stream_name, group_name)
        destroyed = bool(res)
    except Exception as e:
        log(f"Failed to destroy group {group_name} on {stream_name}: {e}")
        raise e

    return {
        "message": f"Consumer group '{group_name}' deleted successfully",
        "group_name": group_name,
        "stream_name": stream_name,
        "destroyed": destroyed
    }


async def clean_consumer_group(
    group_name: Optional[str] = None,
    stream_name: Optional[str] = None,
    reset_stream: bool = False
) -> Dict[str, Any]:
    client = get_redis_client()
    if not group_name:
        return await clean_all_consumer_groups()

    if not stream_name:
        stream_name = cgm.get_stream_for_consumer_group(group_name)

    if not stream_name:
        stream_keys = await client.keys("mira:stream:*")
        for sk in stream_keys:
            if sk.endswith(":job_ids"):
                continue
            try:
                groups = await client.xinfo_groups(sk)
                if any(g.get("name") == group_name for g in groups):
                    stream_name = sk
                    break
            except Exception:
                pass

    if not stream_name:
        raise ValueError(f"Stream for consumer group '{group_name}' not found.")

    cleaned_pending = 0
    try:
        pending_list = await client.xpending_range(stream_name, group_name, min="-", max="+", count=5000)
        if pending_list:
            cleaned_pending = len(pending_list)
            msg_ids = [item["message_id"] for item in pending_list]
            await client.xack(stream_name, group_name, *msg_ids)
            await client.xdel(stream_name, *msg_ids)

            job_ids_key = f"{stream_name}:job_ids"
            try:
                all_jobs = await client.hgetall(job_ids_key)
                to_del = [jid for jid, sid in all_jobs.items() if sid in msg_ids]
                if to_del:
                    await client.hdel(job_ids_key, *to_del)
            except Exception:
                pass
    except Exception as e:
        log(f"Error clearing pending messages for {group_name}: {e}")

    if reset_stream:
        try:
            await client.delete(stream_name)
            await client.delete(f"{stream_name}:job_ids")
            await client.xgroup_create(stream_name, group_name, id="0", mkstream=True)
        except Exception as e:
            log(f"Error resetting stream for {group_name}: {e}")

    return {
        "message": f"Successfully cleaned {cleaned_pending} pending message(s) for '{group_name}'",
        "group_name": group_name,
        "stream_name": stream_name,
        "cleaned_count": cleaned_pending,
    }


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
