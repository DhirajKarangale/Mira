from __future__ import annotations

import asyncio
import json
import logging
import re
from datetime import date, datetime, timedelta
from pathlib import Path
from typing import Any, Dict, List, Optional, Tuple

import config
from crypto import decrypt_log_data, encrypt_log_data
import config_storage

logger = logging.getLogger("mira.vault.log_manager")

_LOG_LOCK = asyncio.Lock()

LOG_FILENAME_REGEX = re.compile(r"^(\d{2})-(\d{2})-(\d{4})\.jsonl$")

def get_logs_config() -> Dict[str, Any]:
    try:
        return config_storage.get_configuration("logs")
    except Exception as e:
        logger.error(f"Error reading logs config from encrypted SQL storage ({e}), using defaults.")
        return {
            "retention_period": 30,
            "show_logs_vault": True,
            "show_logs_operator": True,
            "show_logs_engine": True,
            "show_logs_memory": True,
            "show_logs_client": True,
            "show_logs_message_broker": True,
            "store_logs_vault": True,
            "store_logs_operator": True,
            "store_logs_engine": True,
            "store_logs_memory": True,
            "store_logs_client": True,
            "store_logs_message_broker": True,
        }

def init_logs_directory() -> Path:
    logs_dir = config.LOGS_DIR
    logs_dir.mkdir(parents=True, exist_ok=True)
    return logs_dir

def parse_log_filename(filename: str) -> Optional[date]:
    match = LOG_FILENAME_REGEX.match(filename)
    if not match:
        return None

    day_str, month_str, year_str = match.groups()
    try:
        dt = datetime.strptime(f"{day_str}-{month_str}-{year_str}", "%d-%m-%Y")
        return dt.date()
    except ValueError:
        return None

def clean_expired_and_invalid_logs(
    today: Optional[date] = None,
    retention_days: Optional[int] = None
) -> Dict[str, Any]:
    init_logs_directory()

    if retention_days is None:
        cfg = get_logs_config()
        retention_days = cfg.get("retention_period", 30)

    if today is None:
        today = datetime.now().date()

    deleted_invalid: List[str] = []
    deleted_expired: List[str] = []
    retained_files: List[str] = []

    logger.info(
        f"Scanning log directory '{config.LOGS_DIR}' for retention cleanup (Retention: {retention_days} days)..."
    )

    for item in config.LOGS_DIR.iterdir():
        if not item.is_file():
            continue

        file_date = parse_log_filename(item.name)

        if file_date is None:
            try:
                item.unlink()
                deleted_invalid.append(item.name)
                logger.warning(
                    f"Deleted file with invalid date format: '{item.name}'"
                )
            except Exception as e:
                logger.error(f"Failed to delete invalid file '{item.name}': {e}")
            continue

        age_in_days = (today - file_date).days
        if age_in_days > retention_days:
            try:
                item.unlink()
                deleted_expired.append(item.name)
                logger.info(
                    f"Deleted expired log file: '{item.name}' (Age: {age_in_days} days > {retention_days} days)"
                )
            except Exception as e:
                logger.error(f"Failed to delete expired file '{item.name}': {e}")
        else:
            retained_files.append(item.name)

    result = {
        "status": "success",
        "retention_days": retention_days,
        "deleted_invalid_count": len(deleted_invalid),
        "deleted_expired_count": len(deleted_expired),
        "retained_count": len(retained_files),
    }
    logger.info(
        f"Log cleanup finished: {len(deleted_invalid)} invalid deleted, {len(deleted_expired)} expired deleted, {len(retained_files)} retained."
    )
    return result

def get_log_filepath(target_date: Optional[date] = None) -> Path:
    if target_date is None:
        target_date = datetime.now().date()
    filename = target_date.strftime(config.LOG_FILENAME_FORMAT)
    return config.LOGS_DIR / filename

def read_logs_from_file(filepath: Path) -> List[Dict[str, Any]]:
    if not filepath.exists():
        return []

    try:
        encrypted_bytes = filepath.read_bytes()
        if not encrypted_bytes:
            return []

        decrypted_bytes = decrypt_log_data(encrypted_bytes)
        logs = json.loads(decrypted_bytes.decode("utf-8"))
        if isinstance(logs, list):
            return logs
        return []
    except Exception as e:
        logger.error(f"Failed to read/decrypt log file '{filepath.name}': {e}")
        raise

async def append_log(module_name: str, data: str) -> Dict[str, Any]:
    init_logs_directory()

    now = datetime.now()
    timestamp_str = now.strftime(config.LOG_TIMESTAMP_FORMAT)
    filepath = get_log_filepath(now.date())

    cfg = get_logs_config()
    mod_key = module_name.strip().lower().replace("-", "_")

    show_logs = cfg.get(f"show_logs_{mod_key}", True)
    store_logs = cfg.get(f"store_logs_{mod_key}", True)

    async with _LOG_LOCK:
        existing_logs: List[Dict[str, Any]] = []
        if filepath.exists():
            try:
                existing_logs = read_logs_from_file(filepath)
            except Exception as e:
                logger.error(f"Could not read existing logs from '{filepath.name}', starting fresh: {e}")
                existing_logs = []

        if existing_logs:
            next_id = max(item.get("id", 0) for item in existing_logs) + 1
        else:
            next_id = 1

        new_entry: Dict[str, Any] = {
            "id": next_id,
            "module_name": module_name,
            "timestamp": timestamp_str,
            "data": data,
        }

        if show_logs:
            terminal_msg = (
                f"[VAULT LOG] [{new_entry['timestamp']}] "
                f"[{new_entry['module_name']}] #{new_entry['id']}: "
                f"{new_entry['data']}"
            )
            print(terminal_msg, flush=True)
            logger.info(terminal_msg)

        if store_logs:
            existing_logs.append(new_entry)
            serialized_json = json.dumps(existing_logs, indent=2, ensure_ascii=False).encode("utf-8")
            encrypted_payload = encrypt_log_data(serialized_json)

            temp_filepath = filepath.with_suffix(".tmp")
            temp_filepath.write_bytes(encrypted_payload)
            temp_filepath.replace(filepath)

        return new_entry

async def log_vault_event(message: str) -> Optional[Dict[str, Any]]:
    try:
        return await append_log("vault", message)
    except Exception as e:
        logger.error(f"Failed to record Vault event '{message}': {e}")
        return None

def log_vault_event_sync(message: str) -> None:
    try:
        loop = None
        try:
            loop = asyncio.get_running_loop()
        except RuntimeError:
            pass

        if loop and loop.is_running():
            asyncio.create_task(append_log("vault", message))
        else:
            asyncio.run(append_log("vault", message))
    except Exception as e:
        logger.error(f"Failed to record Vault event sync '{message}': {e}")

async def get_logs(
    module_name: str = "all",
    start_date: Optional[date] = None,
    end_date: Optional[date] = None,
    search: Optional[str] = None,
    limit: Optional[int] = None,
    offset: int = 0,
) -> Tuple[List[Dict[str, Any]], int]:
    init_logs_directory()

    today = datetime.now().date()
    if start_date is None and end_date is None:
        start_date = today
        end_date = today
    elif start_date is not None and end_date is None:
        end_date = today
    elif end_date is not None and start_date is None:
        start_date = end_date

    if start_date > end_date:
        start_date, end_date = end_date, start_date

    collected_logs: List[Dict[str, Any]] = []

    matching_files: List[Tuple[date, Path]] = []
    if config.LOGS_DIR.exists():
        for item in config.LOGS_DIR.iterdir():
            if not item.is_file():
                continue
            file_date = parse_log_filename(item.name)
            if file_date is not None and start_date <= file_date <= end_date:
                matching_files.append((file_date, item))

    matching_files.sort(key=lambda x: x[0], reverse=True)

    async with _LOG_LOCK:
        for f_date, filepath in matching_files:
            try:
                daily_logs = read_logs_from_file(filepath)
                collected_logs.extend(daily_logs)
            except Exception as e:
                logger.error(f"Failed to read logs for {f_date}: {e}")

    if module_name and module_name.strip().lower() != "all":
        target = module_name.strip().lower()
        collected_logs = [
            log for log in collected_logs
            if log.get("module_name", "").lower() == target
        ]

    if search and search.strip():
        search_term = search.strip().lower()
        collected_logs = [
            log for log in collected_logs
            if search_term in str(log.get("data", "")).lower()
        ]

    collected_logs.sort(
        key=lambda x: (x.get("timestamp", ""), x.get("id", 0)),
        reverse=True
    )

    total_count = len(collected_logs)

    if offset < 0:
        offset = 0

    if limit is not None and limit > 0:
        paged_logs = collected_logs[offset : offset + limit]
    else:
        paged_logs = collected_logs[offset:]

    return paged_logs, total_count
