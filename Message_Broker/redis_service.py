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
        for fmt in ('%d/%m/%YT%H:%M:%S', '%d/%m/%Y %H:%M:%S', '%Y-%m-%dT%H:%M:%S', '%Y-%m-%d %H:%M:%S', '%d-%m-%YT%H-%M-%S', '%d-%m-%Y %H:%M:%S'):
            try:
                dt = datetime.strptime(s, fmt)
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
        await client.xgroup_create(stream_name, group_name, id='0', mkstream=True)
    except redis.exceptions.ResponseError as e:
        if 'BUSYGROUP' not in str(e):
            log(f'Error ensuring consumer group {group_name} on {stream_name}: {e}')

async def clean_all_consumer_groups(reset_stream: bool=False) -> Dict[str, Any]:
    client = get_redis_client()
    cleaned = 0
    total_messages = 0
    targets = []
    seen = set()
    for group in cgm.get_all_consumer_groups():
        s_name = cgm.get_stream_for_consumer_group(group)
        if s_name:
            targets.append((group, s_name))
            seen.add((group, s_name))
    try:
        all_s = await client.keys('mira:stream*')
        for s in all_s:
            if s.endswith(':job_ids'):
                continue
            try:
                for g in await client.xinfo_groups(s):
                    pair = (g.get('name'), s)
                    if pair not in seen:
                        targets.append(pair)
                        seen.add(pair)
            except Exception:
                pass
    except Exception:
        pass
    for group, stream_name in targets:
        try:
            res = await clean_consumer_group(group_name=group, stream_name=stream_name, reset_stream=reset_stream)
            cleaned += 1
            total_messages += res.get('cleaned_count', 0)
        except Exception as e:
            log(f'Error cleaning {group}: {e}')
    action = 'reset' if reset_stream else 'PELs cleaned'
    return {'message': f'Successfully cleaned all consumer groups ({total_messages} message(s), {cleaned} groups {action})', 'cleaned_groups': cleaned, 'cleaned_count': total_messages}

async def format_all_redis() -> Dict[str, Any]:
    client = get_redis_client()
    await client.flushdb()
    recreated = 0
    for key, group in cgm._load_consumer_groups().items():
        stream_name = f'mira:stream:{key}'
        try:
            await client.xgroup_create(stream_name, group, id='0', mkstream=True)
            recreated += 1
        except Exception as e:
            log(f'Error re-creating consumer group {group} on {stream_name}: {e}')
    return {'message': f'Successfully formatted Redis and initialized {recreated} consumer groups', 'status': 'success', 'initialized_groups': recreated}

async def get_consumer_groups_details() -> List[Dict[str, Any]]:
    client = get_redis_client()
    configured_groups = cgm._load_consumer_groups()
    results: List[Dict[str, Any]] = []
    seen_streams = set()
    for key, group_name in configured_groups.items():
        stream_name = f'mira:stream:{key}'
        seen_streams.add(stream_name)
        group_entry: Dict[str, Any] = {'group_name': group_name, 'stream_name': stream_name, 'consumer_key': key, 'consumers_count': 0, 'pending_messages_count': 0, 'active_messages_count': 0, 'total_messages_count': 0, 'last_delivered_id': '0-0', 'status': 'idle', 'is_registered': True, 'stream_exists': False}
        try:
            exists = await client.exists(stream_name)
            if exists:
                group_entry['stream_exists'] = True
                stream_len = await client.xlen(stream_name)
                group_entry['total_messages_count'] = stream_len
                pending_count = 0
                last_delivered = '0-0'
                try:
                    groups_info = await client.xinfo_groups(stream_name)
                    matching = next((g for g in groups_info if g.get('name') == group_name), None)
                    if matching:
                        group_entry['consumers_count'] = matching.get('consumers', 0)
                        pending_count = int(matching.get('pending', 0))
                        last_delivered = str(matching.get('last-delivered-id', '0-0'))
                        group_entry['pending_messages_count'] = pending_count
                        group_entry['last_delivered_id'] = last_delivered
                        if pending_count > 0:
                            group_entry['status'] = 'active'
                        else:
                            group_entry['status'] = 'idle'
                    else:
                        group_entry['status'] = 'group_missing'
                except Exception:
                    pass
                if last_delivered and last_delivered != '0-0':
                    try:
                        res = await client.xrange(stream_name, min=last_delivered, max='+', count=5000)
                        active_count = len(res) - 1 if (res and res[0][0] == last_delivered) else len(res)
                    except Exception:
                        active_count = max(0, stream_len - pending_count)
                else:
                    active_count = stream_len
                group_entry['active_messages_count'] = max(0, active_count)
        except Exception as e:
            log(f'Error inspecting group {group_name} on {stream_name}: {e}')
        results.append(group_entry)
    try:
        all_s = await client.keys('mira:stream*')
        for s_name in all_s:
            if s_name.endswith(':job_ids') or s_name in seen_streams:
                continue
            seen_streams.add(s_name)
            c_key = s_name.replace('mira:stream:', '')
            try:
                g_info = await client.xinfo_groups(s_name)
                s_len = await client.xlen(s_name)
                for g in g_info:
                    g_name = g.get('name')
                    p_cnt = int(g.get('pending', 0))
                    l_del = str(g.get('last-delivered-id', '0-0'))
                    if l_del and l_del != '0-0':
                        try:
                            r_entries = await client.xrange(s_name, min=l_del, max='+', count=5000)
                            a_cnt = len(r_entries) - 1 if (r_entries and r_entries[0][0] == l_del) else len(r_entries)
                        except Exception:
                            a_cnt = max(0, s_len - p_cnt)
                    else:
                        a_cnt = s_len
                    results.append({
                        'group_name': g_name,
                        'stream_name': s_name,
                        'consumer_key': c_key,
                        'consumers_count': g.get('consumers', 0),
                        'pending_messages_count': p_cnt,
                        'active_messages_count': max(0, a_cnt),
                        'total_messages_count': s_len,
                        'last_delivered_id': l_del,
                        'status': 'active' if p_cnt > 0 else 'idle',
                        'is_registered': False,
                        'stream_exists': True
                    })
            except Exception:
                pass
    except Exception:
        pass
    return results

async def delete_consumer_group(group_name: str, stream_name: Optional[str]=None) -> Dict[str, Any]:
    client = get_redis_client()
    if not stream_name:
        stream_name = cgm.get_stream_for_consumer_group(group_name)
    if not stream_name:
        try:
            for s in await client.keys('mira:stream*'):
                if not s.endswith(':job_ids'):
                    for g in await client.xinfo_groups(s):
                        if g.get('name') == group_name:
                            stream_name = s
                            break
                if stream_name:
                    break
        except Exception:
            pass
    if not stream_name:
        raise ValueError(f"Consumer group '{group_name}' is not registered in consumer_groups.json.")
    destroyed = False
    try:
        res = await client.xgroup_destroy(stream_name, group_name)
        destroyed = bool(res)
    except Exception as e:
        log(f'Failed to destroy group {group_name} on {stream_name}: {e}')
        raise e
    return {'message': f"Consumer group '{group_name}' deleted successfully", 'group_name': group_name, 'stream_name': stream_name, 'destroyed': destroyed}

async def clean_consumer_group(group_name: Optional[str]=None, stream_name: Optional[str]=None, reset_stream: bool=False) -> Dict[str, Any]:
    client = get_redis_client()
    if not group_name:
        return await clean_all_consumer_groups(reset_stream=reset_stream)
    if not stream_name:
        stream_name = cgm.get_stream_for_consumer_group(group_name)
    if not stream_name:
        try:
            for s in await client.keys('mira:stream*'):
                if not s.endswith(':job_ids'):
                    for g in await client.xinfo_groups(s):
                        if g.get('name') == group_name:
                            stream_name = s
                            break
                if stream_name:
                    break
        except Exception:
            pass
    if not stream_name:
        raise ValueError(f"Consumer group '{group_name}' is not registered in consumer_groups.json.")
    active_count = 0
    try:
        active_count = await client.xlen(stream_name)
    except Exception:
        pass
    cleaned_pending = 0
    try:
        while True:
            pending_list = await client.xpending_range(stream_name, group_name, min='-', max='+', count=5000)
            if not pending_list:
                break
            cleaned_pending += len(pending_list)
            msg_ids = [item['message_id'] for item in pending_list]
            await client.xack(stream_name, group_name, *msg_ids)
            await client.xdel(stream_name, *msg_ids)
            job_ids_key = f'{stream_name}:job_ids'
            try:
                all_jobs = await client.hgetall(job_ids_key)
                to_del = [jid for jid, sid in all_jobs.items() if sid in msg_ids]
                if to_del:
                    await client.hdel(job_ids_key, *to_del)
            except Exception:
                pass
            if len(pending_list) < 5000:
                break
    except Exception as e:
        log(f'Error clearing pending messages for {group_name}: {e}')
    if reset_stream:
        try:
            await client.delete(stream_name)
            await client.delete(f'{stream_name}:job_ids')
            await client.xgroup_create(stream_name, group_name, id='0', mkstream=True)
        except Exception as e:
            log(f'Error resetting stream for {group_name}: {e}')
    total_cleaned = active_count if reset_stream else cleaned_pending
    return {'message': f"Successfully cleaned {total_cleaned} message(s) for '{group_name}'", 'group_name': group_name, 'stream_name': stream_name, 'cleaned_count': total_cleaned}

async def add_job_to_stream(job_data: Dict[str, Any]) -> Dict[str, str]:
    job_id = job_data.get('job_id')
    consumer_key = job_data.get('consumer_key')
    if not job_id or not consumer_key:
        raise ValueError('job_id and consumer_key are required.')
    consumer_group = cgm.get_consumer_group(consumer_key)
    if not consumer_group:
        raise ValueError(f"Unknown consumer_key: '{consumer_key}'.")
    stream_name = cgm.get_stream_for_consumer_key(consumer_key)
    client = get_redis_client()
    await ensure_consumer_group(stream_name, consumer_group)
    stream_fields: Dict[str, str] = {}
    for k, v in job_data.items():
        if k == 'consumer_key':
            continue
        if k == 'timestamp':
            v = to_unix_timestamp(v)
        if isinstance(v, (dict, list)):
            stream_fields[k] = json.dumps(v)
        elif v is not None:
            stream_fields[k] = str(v)
    stream_entry_id = await client.xadd(stream_name, stream_fields)
    await client.hset(f'{stream_name}:job_ids', str(job_id), stream_entry_id)
    if consumer_key in ('llm_chat', 'CONSUMER_GROUP_LLM_CHAT') and job_data.get('session_id'):
        try:
            await set_active_chat_session(
                session_id=str(job_data['session_id']),
                job_id=str(job_id),
                user_query=str(job_data.get('user_query', ''))[:120],
            )
        except Exception as e:
            log(f"Warning: Failed to set active chat session in Redis: {e}")
    return {'message': 'successfully queued'}

async def get_jobs_from_stream(consumer_key: str, count: int=1) -> List[Dict[str, Any]]:
    consumer_group = cgm.get_consumer_group(consumer_key)
    if not consumer_group:
        raise ValueError(f"Unknown consumer_key: '{consumer_key}'.")
    count = min(max(int(count), 1), 10)
    stream_name = cgm.get_stream_for_consumer_key(consumer_key)
    client = get_redis_client()
    await ensure_consumer_group(stream_name, consumer_group)
    worker_name = f'{consumer_group}_worker'
    read_results = await client.xreadgroup(groupname=consumer_group, consumername=worker_name, streams={stream_name: '>'}, count=count)
    if not read_results or not read_results[0][1]:
        read_results = await client.xreadgroup(groupname=consumer_group, consumername=worker_name, streams={stream_name: '0'}, count=count)
        if not read_results or not read_results[0][1]:
            try:
                pending_entries = await client.xpending_range(stream_name, consumer_group, min='-', max='+', count=count)
                if pending_entries:
                    idle_ids = [p['message_id'] for p in pending_entries if p.get('time_since_delivered', 0) > 3000]
                    if idle_ids:
                        claimed = await client.xclaim(stream_name, consumer_group, worker_name, min_idle_time=3000, message_ids=idle_ids)
                        if claimed:
                            read_results = [[stream_name, claimed]]
            except Exception:
                pass
    jobs: List[Dict[str, Any]] = []
    if read_results and read_results[0][1]:
        for entry_id, fields in read_results[0][1]:
            job_obj: Dict[str, Any] = {}
            for k, v in fields.items():
                try:
                    job_obj[k] = json.loads(v)
                except Exception:
                    job_obj[k] = v
            job_obj['_stream_id'] = str(entry_id)
            jobs.append(job_obj)
    return jobs

async def delete_job_from_stream(consumer_key: str, job_id: str) -> Dict[str, str]:
    consumer_group = cgm.get_consumer_group(consumer_key)
    if not consumer_group:
        raise ValueError(f"Unknown consumer_key: '{consumer_key}'.")
    stream_name = cgm.get_stream_for_consumer_key(consumer_key)
    client = get_redis_client()
    stream_entry_id = await client.hget(f'{stream_name}:job_ids', str(job_id))
    if not stream_entry_id:
        parts = str(job_id).split('-')
        if len(parts) == 2 and parts[0].isdigit() and parts[1].isdigit():
            stream_entry_id = str(job_id)
        else:
            return {'message': 'job not found'}
    try:
        await client.xack(stream_name, consumer_group, stream_entry_id)
    except Exception:
        pass
    try:
        await client.xdel(stream_name, stream_entry_id)
    except Exception:
        pass
    await client.hdel(f'{stream_name}:job_ids', str(job_id))
    if consumer_key in ('llm_chat', 'CONSUMER_GROUP_LLM_CHAT'):
        try:
            active_sessions = await client.hgetall(ACTIVE_CHAT_SESSIONS_KEY)
            for sid, val in active_sessions.items():
                try:
                    obj = json.loads(val)
                    if obj.get("job_id") == str(job_id):
                        await client.hdel(ACTIVE_CHAT_SESSIONS_KEY, sid)
                        break
                except Exception:
                    pass
        except Exception:
            pass
    return {'message': 'successfully deleted'}
IMAGE_COMPARISON_RECENT_KEY = 'mira:image_comparison:recent'
IMAGE_COMPARISON_DATA_KEY_PREFIX = 'mira:image_comparison:data:'
IMAGE_COMPARISON_MAX_COUNT = 10

async def store_image_comparison_data(data: Dict[str, Any]) -> Dict[str, Any]:
    image_id = str(data.get('image_id') or uuid.uuid4())
    app_name = str(data.get('app_name', '')).strip()
    client = get_redis_client()
    record = {'image_id': image_id, 'app_name': app_name, 'timestamp': to_unix_timestamp(data.get('timestamp')), 'pixel_values': data.get('pixel_values'), 'grayscale_matrix': data.get('grayscale_matrix'), 'metadata': data.get('metadata') or {}}
    serialized = json.dumps(record)
    data_key = f'{IMAGE_COMPARISON_DATA_KEY_PREFIX}{image_id}'
    await client.set(data_key, serialized)
    await client.lrem(IMAGE_COMPARISON_RECENT_KEY, 0, image_id)
    await client.lpush(IMAGE_COMPARISON_RECENT_KEY, image_id)
    excess_ids = await client.lrange(IMAGE_COMPARISON_RECENT_KEY, IMAGE_COMPARISON_MAX_COUNT, -1)
    if excess_ids:
        for old_id in excess_ids:
            try:
                await client.delete(f'{IMAGE_COMPARISON_DATA_KEY_PREFIX}{old_id}')
            except Exception as e:
                log(f'Error purging expired image comparison data {old_id}: {e}')
        await client.ltrim(IMAGE_COMPARISON_RECENT_KEY, 0, IMAGE_COMPARISON_MAX_COUNT - 1)
    total_count = await client.llen(IMAGE_COMPARISON_RECENT_KEY)
    log(f"Stored image comparison data {image_id} for app '{app_name}' (recent count: {total_count})")
    return {'status': 'success', 'message': 'Image comparison data stored successfully', 'image_id': image_id, 'app_name': app_name, 'total_recent': total_count}

async def get_recent_image_comparison_data(limit: int=10) -> List[Dict[str, Any]]:
    client = get_redis_client()
    limit = min(max(int(limit), 1), IMAGE_COMPARISON_MAX_COUNT)
    image_ids = await client.lrange(IMAGE_COMPARISON_RECENT_KEY, 0, limit - 1)
    results: List[Dict[str, Any]] = []
    for img_id in image_ids:
        raw = await client.get(f'{IMAGE_COMPARISON_DATA_KEY_PREFIX}{img_id}')
        if raw:
            try:
                results.append(json.loads(raw))
            except Exception:
                pass
    return results

async def get_image_comparison_data_by_id(image_id: str) -> Optional[Dict[str, Any]]:
    client = get_redis_client()
    raw = await client.get(f'{IMAGE_COMPARISON_DATA_KEY_PREFIX}{image_id}')
    if raw:
        try:
            return json.loads(raw)
        except Exception:
            return None
    return None

async def search_image_comparison_data(app_name: Optional[str]=None, limit: int=10) -> List[Dict[str, Any]]:
    client = get_redis_client()
    limit = min(max(int(limit), 1), IMAGE_COMPARISON_MAX_COUNT)
    image_ids = await client.lrange(IMAGE_COMPARISON_RECENT_KEY, 0, IMAGE_COMPARISON_MAX_COUNT - 1)
    normalized = app_name.strip().lower() if app_name else None
    results: List[Dict[str, Any]] = []
    for img_id in image_ids:
        raw = await client.get(f'{IMAGE_COMPARISON_DATA_KEY_PREFIX}{img_id}')
        if not raw:
            continue
        try:
            record = json.loads(raw)
            if normalized:
                rec_app = str(record.get('app_name', '')).strip().lower()
                if rec_app != normalized:
                    continue
            results.append(record)
            if len(results) >= limit:
                break
        except Exception:
            continue
    return results

async def remove_image_comparison_data(image_id: Optional[str]=None, app_name: Optional[str]=None, remove_all: bool=False) -> Dict[str, Any]:
    client = get_redis_client()
    if remove_all:
        recent_ids = await client.lrange(IMAGE_COMPARISON_RECENT_KEY, 0, -1)
        removed_count = 0
        for r_id in recent_ids:
            await client.delete(f'{IMAGE_COMPARISON_DATA_KEY_PREFIX}{r_id}')
            removed_count += 1
        await client.delete(IMAGE_COMPARISON_RECENT_KEY)
        try:
            extra_keys = await client.keys(f'{IMAGE_COMPARISON_DATA_KEY_PREFIX}*')
            for ek in extra_keys:
                await client.delete(ek)
        except Exception:
            pass
        log('Removed all image comparison data from Redis')
        return {'status': 'success', 'message': 'All image comparison data removed', 'removed_count': removed_count}
    if image_id:
        await client.lrem(IMAGE_COMPARISON_RECENT_KEY, 0, image_id)
        deleted = await client.delete(f'{IMAGE_COMPARISON_DATA_KEY_PREFIX}{image_id}')
        log(f'Removed image comparison data for {image_id}')
        return {'status': 'success', 'message': f'Image comparison data {image_id} removed', 'image_id': image_id, 'deleted': bool(deleted)}
    if app_name:
        records = await search_image_comparison_data(app_name=app_name, limit=IMAGE_COMPARISON_MAX_COUNT)
        removed_count = 0
        for rec in records:
            r_id = rec.get('image_id')
            if r_id:
                await client.lrem(IMAGE_COMPARISON_RECENT_KEY, 0, r_id)
                await client.delete(f'{IMAGE_COMPARISON_DATA_KEY_PREFIX}{r_id}')
                removed_count += 1
        log(f"Removed {removed_count} image comparison record(s) for app '{app_name}'")
        return {'status': 'success', 'message': f"Image comparison data for app '{app_name}' removed", 'app_name': app_name, 'removed_count': removed_count}
    return {'status': 'ignored', 'message': 'No image_id, app_name, or remove_all parameter specified', 'removed_count': 0}

CHAT_MEMORY_PREFIX = "mira:chat:memory:"
DEFAULT_MAX_SHORT_TERM_MEMORY = 5

async def store_chat_memory(
    session_id: str,
    user_query: str,
    ai_response: str,
    max_limit: int = DEFAULT_MAX_SHORT_TERM_MEMORY
) -> Dict[str, Any]:
    client = get_redis_client()
    clean_sid = str(session_id).strip()
    key = f"{CHAT_MEMORY_PREFIX}{clean_sid}"
    record = {
        "user": user_query.strip(),
        "ai": ai_response.strip(),
        "timestamp": int(datetime.now(timezone.utc).timestamp()),
    }
    serialized = json.dumps(record)
    await client.rpush(key, serialized)
    total = await client.llen(key)
    if total > max_limit:
        await client.ltrim(key, -max_limit, -1)
    return {
        "status": "success",
        "session_id": clean_sid,
        "count": min(total, max_limit),
    }

async def get_chat_memory(
    session_id: str,
    limit: int = DEFAULT_MAX_SHORT_TERM_MEMORY
) -> List[Dict[str, Any]]:
    client = get_redis_client()
    clean_sid = str(session_id).strip()
    key = f"{CHAT_MEMORY_PREFIX}{clean_sid}"
    limit = max(1, min(int(limit), 50))
    raw_items = await client.lrange(key, -limit, -1)
    results: List[Dict[str, Any]] = []
    for item in raw_items:
        try:
            results.append(json.loads(item))
        except Exception:
            pass
    return results

async def clear_chat_memory(session_id: str) -> Dict[str, Any]:
    client = get_redis_client()
    clean_sid = str(session_id).strip()
    key = f"{CHAT_MEMORY_PREFIX}{clean_sid}"
    deleted = await client.delete(key)
    return {"status": "success", "session_id": clean_sid, "deleted": bool(deleted)}

async def clear_all_chat_memory() -> Dict[str, Any]:
    client = get_redis_client()
    keys = []
    async for k in client.scan_iter(match=f"{CHAT_MEMORY_PREFIX}*"):
        keys.append(k)
    deleted_count = 0
    if keys:
        deleted_count = await client.delete(*keys)
    return {"status": "success", "deleted_count": deleted_count}


# ==============================================================================
# Active Chat Session Tracking in Redis (for cross-screen state persistence)
# ==============================================================================

ACTIVE_CHAT_SESSIONS_KEY = "mira:chat:active_sessions"

async def set_active_chat_session(
    session_id: str,
    job_id: str,
    user_query: str = "",
) -> Dict[str, Any]:
    """
    Records an active chat job in Redis under mira:chat:active_sessions.
    Allows clients to restore loading animation across page reloads & navigation.
    """
    clean_sid = str(session_id).strip()
    clean_jid = str(job_id).strip()
    if not clean_sid or not clean_jid:
        return {"status": "error", "message": "session_id and job_id required"}

    client = get_redis_client()
    record = {
        "job_id": clean_jid,
        "session_id": clean_sid,
        "user_query": str(user_query)[:120] if user_query else "",
        "created_at": int(time.time()),
        "status": "processing",
    }
    await client.hset(ACTIVE_CHAT_SESSIONS_KEY, clean_sid, json.dumps(record))
    return {"status": "success", "session_id": clean_sid, "job_id": clean_jid}

async def remove_active_chat_session(session_id: str) -> Dict[str, Any]:
    """
    Removes a chat session from active Redis sessions once processing completes.
    """
    clean_sid = str(session_id).strip()
    client = get_redis_client()
    deleted = await client.hdel(ACTIVE_CHAT_SESSIONS_KEY, clean_sid)
    return {"status": "success", "session_id": clean_sid, "deleted": bool(deleted)}

async def get_active_chat_sessions() -> Dict[str, Any]:
    """
    Returns all currently active chat sessions from Redis.
    Automatically purges any jobs older than 10 minutes to prevent stale state.
    """
    client = get_redis_client()
    raw = await client.hgetall(ACTIVE_CHAT_SESSIONS_KEY)
    results: Dict[str, Any] = {}
    now = int(time.time())
    stale_keys: List[str] = []

    for sid, val in raw.items():
        try:
            parsed = json.loads(val)
            # Auto-expire entries older than 10 minutes (600s)
            if now - parsed.get("created_at", 0) > 600:
                stale_keys.append(sid)
            else:
                results[sid] = parsed
        except Exception:
            results[sid] = {"job_id": val, "session_id": sid, "status": "processing"}

    if stale_keys:
        try:
            await client.hdel(ACTIVE_CHAT_SESSIONS_KEY, *stale_keys)
        except Exception:
            pass

    return results

async def get_active_chat_session(session_id: str) -> Optional[Dict[str, Any]]:
    """
    Returns the active state of a single session, or None if idle.
    """
    clean_sid = str(session_id).strip()
    client = get_redis_client()
    raw = await client.hget(ACTIVE_CHAT_SESSIONS_KEY, clean_sid)
    if not raw:
        return None
    try:
        parsed = json.loads(raw)
        if int(time.time()) - parsed.get("created_at", 0) > 600:
            await client.hdel(ACTIVE_CHAT_SESSIONS_KEY, clean_sid)
            return None
        return parsed
    except Exception:
        return {"job_id": raw, "session_id": clean_sid, "status": "processing"}



