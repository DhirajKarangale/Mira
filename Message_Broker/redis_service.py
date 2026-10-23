from datetime import datetime, timezone
import json
import time
from typing import Any, Dict, List, Optional, Union
import uuid

import redis.exceptions

from redis_client import get_redis_client
import consumer_group_manager as cgm
from vault_logger import log

def to_unix_timestamp(ts: Any) -> Union[int, float]:
    if ts is None:
        return int(datetime.now(timezone.utc).timestamp())
    if isinstance(ts, (int, float)):
        return ts
    if isinstance(ts, str):
        s = ts.strip()
        try:
            val = float(s)
            return int(val) if val.is_integer() else val
        except ValueError:
            pass
        for fmt in (
            "%d/%m/%YT%H:%M:%S",
            "%d/%m/%Y %H:%M:%S",
            "%Y-%m-%dT%H:%M:%S",
            "%Y-%m-%d %H:%M:%S",
            "%d-%m-%YT%H-%M-%S",
            "%d-%m-%Y %H:%M:%S",
        ):
            try:
                dt = datetime.strptime(s, fmt)
                # Convert system local time to UTC timestamp
                return int(dt.astimezone().timestamp())
            except ValueError:
                pass
        try:
            dt = datetime.fromisoformat(s)
            if dt.tzinfo is None:
                dt = dt.astimezone()
            return int(dt.timestamp())
        except Exception:
            pass
    return int(datetime.now(timezone.utc).timestamp())

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

    return results

async def delete_consumer_group(group_name: str, stream_name: Optional[str] = None) -> Dict[str, Any]:
    client = get_redis_client()
    if not stream_name:
        stream_name = cgm.get_stream_for_consumer_group(group_name)

    if not stream_name:
        raise ValueError(f"Consumer group '{group_name}' is not registered in consumer_groups.json.")

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
    reset_stream: bool = True
) -> Dict[str, Any]:
    client = get_redis_client()
    if not group_name:
        return await clean_all_consumer_groups()

    if not stream_name:
        stream_name = cgm.get_stream_for_consumer_group(group_name)

    if not stream_name:
        raise ValueError(f"Consumer group '{group_name}' is not registered in consumer_groups.json.")

    active_count = 0
    try:
        active_count = await client.xlen(stream_name)
    except Exception:
        pass

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

    total_cleaned = active_count if reset_stream else cleaned_pending
    return {
        "message": f"Successfully cleaned {total_cleaned} message(s) for '{group_name}'",
        "group_name": group_name,
        "stream_name": stream_name,
        "cleaned_count": total_cleaned,
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
        if k == "timestamp":
            v = to_unix_timestamp(v)
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

IMAGE_COMPARISON_RECENT_KEY = "mira:image_comparison:recent"
IMAGE_COMPARISON_DATA_KEY_PREFIX = "mira:image_comparison:data:"
IMAGE_COMPARISON_MAX_COUNT = 10

async def store_image_comparison_data(data: Dict[str, Any]) -> Dict[str, Any]:
    image_id = str(data.get("image_id") or uuid.uuid4())
    app_name = str(data.get("app_name", "")).strip()
    client = get_redis_client()

    record = {
        "image_id": image_id,
        "app_name": app_name,
        "timestamp": to_unix_timestamp(data.get("timestamp")),
        "pixel_values": data.get("pixel_values"),
        "grayscale_matrix": data.get("grayscale_matrix"),
        "metadata": data.get("metadata") or {},
    }

    serialized = json.dumps(record)
    data_key = f"{IMAGE_COMPARISON_DATA_KEY_PREFIX}{image_id}"
    await client.set(data_key, serialized)

    await client.lrem(IMAGE_COMPARISON_RECENT_KEY, 0, image_id)
    await client.lpush(IMAGE_COMPARISON_RECENT_KEY, image_id)

    excess_ids = await client.lrange(IMAGE_COMPARISON_RECENT_KEY, IMAGE_COMPARISON_MAX_COUNT, -1)
    if excess_ids:
        for old_id in excess_ids:
            try:
                await client.delete(f"{IMAGE_COMPARISON_DATA_KEY_PREFIX}{old_id}")
            except Exception as e:
                log(f"Error purging expired image comparison data {old_id}: {e}")
        await client.ltrim(IMAGE_COMPARISON_RECENT_KEY, 0, IMAGE_COMPARISON_MAX_COUNT - 1)

    total_count = await client.llen(IMAGE_COMPARISON_RECENT_KEY)
    log(f"Stored image comparison data {image_id} for app '{app_name}' (recent count: {total_count})")

    return {
        "status": "success",
        "message": "Image comparison data stored successfully",
        "image_id": image_id,
        "app_name": app_name,
        "total_recent": total_count,
    }

async def get_recent_image_comparison_data(limit: int = 10) -> List[Dict[str, Any]]:
    client = get_redis_client()
    limit = min(max(int(limit), 1), IMAGE_COMPARISON_MAX_COUNT)
    image_ids = await client.lrange(IMAGE_COMPARISON_RECENT_KEY, 0, limit - 1)

    results: List[Dict[str, Any]] = []
    for img_id in image_ids:
        raw = await client.get(f"{IMAGE_COMPARISON_DATA_KEY_PREFIX}{img_id}")
        if raw:
            try:
                results.append(json.loads(raw))
            except Exception:
                pass
    return results

async def get_image_comparison_data_by_id(image_id: str) -> Optional[Dict[str, Any]]:
    client = get_redis_client()
    raw = await client.get(f"{IMAGE_COMPARISON_DATA_KEY_PREFIX}{image_id}")
    if raw:
        try:
            return json.loads(raw)
        except Exception:
            return None
    return None

async def search_image_comparison_data(app_name: Optional[str] = None, limit: int = 10) -> List[Dict[str, Any]]:
    client = get_redis_client()
    limit = min(max(int(limit), 1), IMAGE_COMPARISON_MAX_COUNT)
    image_ids = await client.lrange(IMAGE_COMPARISON_RECENT_KEY, 0, IMAGE_COMPARISON_MAX_COUNT - 1)

    normalized = app_name.strip().lower() if app_name else None
    results: List[Dict[str, Any]] = []

    for img_id in image_ids:
        raw = await client.get(f"{IMAGE_COMPARISON_DATA_KEY_PREFIX}{img_id}")
        if not raw:
            continue
        try:
            record = json.loads(raw)
            if normalized:
                rec_app = str(record.get("app_name", "")).strip().lower()
                if rec_app != normalized:
                    continue
            results.append(record)
            if len(results) >= limit:
                break
        except Exception:
            continue

    return results

async def remove_image_comparison_data(
    image_id: Optional[str] = None,
    app_name: Optional[str] = None,
    remove_all: bool = False
) -> Dict[str, Any]:
    client = get_redis_client()

    if remove_all:
        recent_ids = await client.lrange(IMAGE_COMPARISON_RECENT_KEY, 0, -1)
        removed_count = 0
        for r_id in recent_ids:
            await client.delete(f"{IMAGE_COMPARISON_DATA_KEY_PREFIX}{r_id}")
            removed_count += 1
        await client.delete(IMAGE_COMPARISON_RECENT_KEY)

        try:
            extra_keys = await client.keys(f"{IMAGE_COMPARISON_DATA_KEY_PREFIX}*")
            for ek in extra_keys:
                await client.delete(ek)
        except Exception:
            pass

        log("Removed all image comparison data from Redis")
        return {
            "status": "success",
            "message": "All image comparison data removed",
            "removed_count": removed_count,
        }

    if image_id:
        await client.lrem(IMAGE_COMPARISON_RECENT_KEY, 0, image_id)
        deleted = await client.delete(f"{IMAGE_COMPARISON_DATA_KEY_PREFIX}{image_id}")
        log(f"Removed image comparison data for {image_id}")
        return {
            "status": "success",
            "message": f"Image comparison data {image_id} removed",
            "image_id": image_id,
            "deleted": bool(deleted),
        }

    if app_name:
        records = await search_image_comparison_data(app_name=app_name, limit=IMAGE_COMPARISON_MAX_COUNT)
        removed_count = 0
        for rec in records:
            r_id = rec.get("image_id")
            if r_id:
                await client.lrem(IMAGE_COMPARISON_RECENT_KEY, 0, r_id)
                await client.delete(f"{IMAGE_COMPARISON_DATA_KEY_PREFIX}{r_id}")
                removed_count += 1
        log(f"Removed {removed_count} image comparison record(s) for app '{app_name}'")
        return {
            "status": "success",
            "message": f"Image comparison data for app '{app_name}' removed",
            "app_name": app_name,
            "removed_count": removed_count,
        }

    return {
        "status": "ignored",
        "message": "No image_id, app_name, or remove_all parameter specified",
        "removed_count": 0,
    }
