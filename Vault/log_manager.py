from __future__ import annotations

import asyncio
import json
import logging
import os
import re
from datetime import date, datetime, timedelta
from pathlib import Path
from typing import Any, Dict, List, Optional

import config
from crypto import decrypt_log_data, encrypt_log_data
import config_storage

logger = logging.getLogger("mira.vault.log_manager")

# Lock to ensure thread-safe/async-safe concurrent log writes
_LOG_LOCK = asyncio.Lock()

# Regex to match log filenames like '20-10-2026.jsonl'
LOG_FILENAME_REGEX = re.compile(r"^(\d{2})-(\d{2})-(\d{4})\.jsonl$")


def get_logs_config() -> Dict[str, Any]:
    """
    Retrieves the Logs configuration directly from Vault's encrypted SQL storage.
    """
    try:
        return config_storage.get_configuration("logs")
    except Exception as e:
        logger.error(f"Error reading logs config from encrypted SQL storage ({e}), using defaults.")
        return {
            "retention_period": 30,
            "show_logs_operator": True,
            "show_logs_engine": True,
            "show_logs_memory": True,
            "show_logs_client": True,
            "show_logs_message_broker": True,
            "store_logs_operator": True,
            "store_logs_engine": True,
            "store_logs_memory": True,
            "store_logs_client": True,
            "store_logs_message_broker": True,
        }


def init_logs_directory() -> Path:
    """
    Creates the logs directory inside the system directory if it does not already exist.
    """
    logs_dir = config.LOGS_DIR
    logs_dir.mkdir(parents=True, exist_ok=True)
    return logs_dir


def parse_log_filename(filename: str) -> Optional[date]:
    """
    Validates whether a filename strictly follows the required 'dd-mm-yyyy.jsonl' date format
    and represents a valid calendar date. Returns date object if valid, None otherwise.
    """
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
    """
    Scans the logs directory on startup and deletes files that:
    1. Do not follow the required 'dd-mm-yyyy.jsonl' date format.
    2. Whose dates are older than the retention period specified in the encrypted SQL configuration.
    """
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
            # File does not follow the required date format
            try:
                item.unlink()
                deleted_invalid.append(item.name)
                logger.warning(
                    f"Deleted file with invalid date format: '{item.name}'"
                )
            except Exception as e:
                logger.error(f"Failed to delete invalid file '{item.name}': {e}")
            continue

        # File follows required date format; check age against retention
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
        "logs_directory": str(config.LOGS_DIR.resolve()),
        "retention_days": retention_days,
        "deleted_invalid_count": len(deleted_invalid),
        "deleted_expired_count": len(deleted_expired),
        "retained_count": len(retained_files),
        "deleted_invalid": deleted_invalid,
        "deleted_expired": deleted_expired,
        "retained_files": retained_files,
    }
    logger.info(
        f"Log cleanup finished: {len(deleted_invalid)} invalid deleted, {len(deleted_expired)} expired deleted, {len(retained_files)} retained."
    )
    return result


def get_log_filepath(target_date: Optional[date] = None) -> Path:
    """
    Returns the file path for a given date in 'dd-mm-yyyy.jsonl' format.
    Defaults to current system date.
    """
    if target_date is None:
        target_date = datetime.now().date()
    filename = target_date.strftime(config.LOG_FILENAME_FORMAT)
    return config.LOGS_DIR / filename


def read_logs_from_file(filepath: Path) -> List[Dict[str, Any]]:
    """
    Reads and decrypts the JSON log file using XChaCha20-Poly1305.
    Returns the deserialized array of log objects.
    """
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
    """
    Appends a new log entry to the current day's log file according to
    the encrypted SQL Logs configuration (show_logs_<module> and store_logs_<module>):
    1. Checks show_logs_<module_name> to control terminal output.
    2. Checks store_logs_<module_name> to control file logging.
    """
    init_logs_directory()

    now = datetime.now()
    timestamp_str = now.strftime(config.LOG_TIMESTAMP_FORMAT)
    filepath = get_log_filepath(now.date())

    cfg = get_logs_config()
    mod_key = module_name.strip().lower().replace("-", "_")

    # Check configuration flags from encrypted SQL (default to True if not explicitly specified)
    show_logs = cfg.get(f"show_logs_{mod_key}", True)
    store_logs = cfg.get(f"store_logs_{mod_key}", True)

    async with _LOG_LOCK:
        # 1. Read existing logs if file exists
        existing_logs: List[Dict[str, Any]] = []
        if filepath.exists():
            try:
                existing_logs = read_logs_from_file(filepath)
            except Exception as e:
                logger.error(f"Could not read existing logs from '{filepath.name}', starting fresh: {e}")
                existing_logs = []

        # 2. Sequential count starting at 1 for each daily file
        if existing_logs:
            next_id = max(item.get("id", 0) for item in existing_logs) + 1
        else:
            next_id = 1

        # 3. Create log object
        new_entry: Dict[str, Any] = {
            "id": next_id,
            "module_name": module_name,
            "timestamp": timestamp_str,
            "data": data,
        }

        # 4. Print to terminal if enabled in encrypted SQL Logs configuration
        if show_logs:
            terminal_msg = (
                f"[VAULT LOG] [{new_entry['timestamp']}] "
                f"[{new_entry['module_name']}] #{new_entry['id']}: "
                f"{new_entry['data']}"
            )
            print(terminal_msg, flush=True)
            logger.info(terminal_msg)

        # 5. Append and encrypt to daily log file if enabled in encrypted SQL Logs configuration
        if store_logs:
            existing_logs.append(new_entry)
            serialized_json = json.dumps(existing_logs, indent=2, ensure_ascii=False).encode("utf-8")
            encrypted_payload = encrypt_log_data(serialized_json)

            temp_filepath = filepath.with_suffix(".tmp")
            temp_filepath.write_bytes(encrypted_payload)
            temp_filepath.replace(filepath)

        return new_entry


async def get_logs(
    module_name: str = "all",
    start_date: Optional[date] = None,
    end_date: Optional[date] = None,
    limit: Optional[int] = None
) -> List[Dict[str, Any]]:
    """
    Retrieves and decrypts logs for a given date range and module_name filter.
    Defaults module_name to 'all' and date range to today when not provided.
    """
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
        raise ValueError(f"start_date ({start_date}) cannot be after end_date ({end_date})")

    collected_logs: List[Dict[str, Any]] = []

    async with _LOG_LOCK:
        curr_date = start_date
        while curr_date <= end_date:
            filepath = get_log_filepath(curr_date)
            if filepath.exists():
                try:
                    daily_logs = read_logs_from_file(filepath)
                    collected_logs.extend(daily_logs)
                except Exception as e:
                    logger.error(f"Failed to read logs for {curr_date}: {e}")
            curr_date += timedelta(days=1)

    # Filter by module_name if not 'all'
    if module_name and module_name.strip().lower() != "all":
        target = module_name.strip().lower()
        collected_logs = [
            log for log in collected_logs
            if log.get("module_name", "").lower() == target
        ]

    if limit is not None and limit > 0:
        collected_logs = collected_logs[-limit:]

    return collected_logs
