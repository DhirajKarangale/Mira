from __future__ import annotations

import json
import logging
import re
import sqlite3
from pathlib import Path
from typing import Any, Dict, List, Optional, Tuple

import config
from crypto import decrypt_log_data, encrypt_log_data

logger = logging.getLogger("mira.vault.config_storage")

_DB_CONN: Optional[sqlite3.Connection] = None
_PARSED_SCHEMA: Dict[str, Dict[str, Any]] = {}

TABLE_REGEX = re.compile(
    r"CREATE\s+TABLE\s+(?:IF\s+NOT\s+EXISTS\s+)?([a-zA-Z0-9_]+)\s*\((.*?)\);",
    re.DOTALL | re.IGNORECASE
)


def get_schema_file_path() -> Path:
    return getattr(config, "SCHEMA_FILE_PATH", config.VAULT_DIR / "schema.sql")


def get_encrypted_db_path() -> Path:
    return config.SYSTEM_DIR / "config.db.enc"


def parse_schema_file(schema_path: Optional[Path] = None) -> Dict[str, Dict[str, Any]]:
    if schema_path is None:
        schema_path = get_schema_file_path()

    if not schema_path.exists():
        raise FileNotFoundError(f"Schema file not found at: {schema_path}")

    content = schema_path.read_text(encoding="utf-8")
    tables: Dict[str, Dict[str, Any]] = {}

    for match in TABLE_REGEX.finditer(content):
        table_name = match.group(1).lower()
        body = match.group(2)
        columns: Dict[str, Tuple[str, str]] = {}
        types: Dict[str, str] = {}

        for line in body.strip().splitlines():
            line = line.strip().rstrip(",")
            if not line or line.startswith("--"):
                continue

            parts = line.split()
            col_name = parts[0]
            col_type = parts[1].upper() if len(parts) > 1 else "TEXT"

            columns[col_name.lower()] = (col_name, line)
            types[col_name.lower()] = col_type

        tables[table_name] = {
            "table_name": table_name,
            "raw_name": match.group(1),
            "columns": columns,
            "types": types,
            "body": body,
            "create_sql": f"CREATE TABLE IF NOT EXISTS {table_name} ({body});"
        }

    return tables


def init_config_storage(
    schema_path: Optional[Path] = None,
    enc_db_path: Optional[Path] = None
) -> None:
    global _DB_CONN, _PARSED_SCHEMA

    config.SYSTEM_DIR.mkdir(parents=True, exist_ok=True)
    if enc_db_path is None:
        enc_db_path = get_encrypted_db_path()

    _PARSED_SCHEMA = parse_schema_file(schema_path)
    _DB_CONN = sqlite3.connect(":memory:", check_same_thread=False)

    if enc_db_path.exists():
        try:
            encrypted_bytes = enc_db_path.read_bytes()
            if encrypted_bytes:
                decrypted_bytes = decrypt_log_data(encrypted_bytes)
                _DB_CONN.deserialize(decrypted_bytes)
                logger.info(f"Loaded and decrypted configuration database from {enc_db_path}")
        except Exception as e:
            logger.error(f"Failed to decrypt existing config database ({e}), starting clean.")

    for table_name, table_spec in _PARSED_SCHEMA.items():
        exists = _DB_CONN.execute(
            "SELECT count(*) FROM sqlite_master WHERE type='table' AND name=?",
            (table_name,)
        ).fetchone()[0]

        if not exists:
            logger.info(f"Creating missing configuration table: '{table_name}'")
            _DB_CONN.execute(table_spec["create_sql"])
            if table_name not in ("app_permissions", "ai_configs"):
                _DB_CONN.execute(f"INSERT INTO {table_name} DEFAULT VALUES")
            _DB_CONN.commit()
        else:
            existing_info = _DB_CONN.execute(f"PRAGMA table_info({table_name})").fetchall()
            existing_cols = {row[1].lower(): row[1] for row in existing_info}
            target_cols = table_spec["columns"]

            for col_key, (col_name, col_def) in target_cols.items():
                if col_key not in existing_cols:
                    logger.info(f"Adding missing column '{col_name}' to table '{table_name}'")
                    _DB_CONN.execute(f"ALTER TABLE {table_name} ADD COLUMN {col_def}")
                    _DB_CONN.commit()

            for col_key, col_name in existing_cols.items():
                if col_key not in target_cols and col_key != "id":
                    logger.info(f"Dropping obsolete column '{col_name}' from table '{table_name}'")
                    try:
                        _DB_CONN.execute(f"ALTER TABLE {table_name} DROP COLUMN {col_name}")
                        _DB_CONN.commit()
                    except Exception as e:
                        logger.error(f"Failed to drop column '{col_name}' from '{table_name}': {e}")

            if table_name not in ("app_permissions", "ai_configs"):
                count = _DB_CONN.execute(f"SELECT count(*) FROM {table_name}").fetchone()[0]
                if count == 0:
                    _DB_CONN.execute(f"INSERT INTO {table_name} DEFAULT VALUES")
                    _DB_CONN.commit()
                elif table_name == "logs":
                    _DB_CONN.execute("UPDATE logs SET show_logs_vault = 1 WHERE show_logs_vault IS NULL")
                    _DB_CONN.execute("UPDATE logs SET store_logs_vault = 1 WHERE store_logs_vault IS NULL")
                    _DB_CONN.commit()
            elif table_name == "app_permissions":
                _DB_CONN.execute("DELETE FROM app_permissions WHERE app_id IS NULL OR app_id = ''")
                _DB_CONN.commit()

    _seed_default_ai_configs()
    save_config_storage(enc_db_path)


def save_config_storage(enc_db_path: Optional[Path] = None) -> None:
    global _DB_CONN
    if _DB_CONN is None:
        return

    if enc_db_path is None:
        enc_db_path = get_encrypted_db_path()

    raw_bytes = _DB_CONN.serialize()
    encrypted_bytes = encrypt_log_data(raw_bytes)

    temp_path = enc_db_path.with_suffix(".tmp")
    temp_path.write_bytes(encrypted_bytes)
    temp_path.replace(enc_db_path)
    logger.debug(f"Saved and encrypted configuration storage to {enc_db_path}")


def get_configuration(key: str) -> Dict[str, Any]:
    global _DB_CONN, _PARSED_SCHEMA
    if _DB_CONN is None:
        init_config_storage()

    normalized_key = key.strip().lower().replace("-", "_")
    if normalized_key == "redis":
        normalized_key = "message_broker"
    elif normalized_key in ("user", "users"):
        normalized_key = "user_details"
    elif normalized_key in ("ai", "ai_config", "ai_configs", "llm"):
        return {
            "providers": get_all_ai_providers(),
            "priorities": get_ai_priorities(),
            "configs": get_all_ai_configs()
        }
    elif normalized_key in ("priorities", "ai_priorities", "llm_priorities"):
        return {
            "priorities": get_ai_priorities()
        }
    elif normalized_key in ("engine", "engine_workers", "workers"):
        return get_engine_workers()

    if normalized_key in _PARSED_SCHEMA:
        table_name = normalized_key
        table_spec = _PARSED_SCHEMA[table_name]
        types = table_spec.get("types", {})

        cursor = _DB_CONN.execute(f"SELECT * FROM {table_name} LIMIT 1")
        row = cursor.fetchone()
        if not row:
            return {}

        col_names = [d[0] for d in cursor.description]
        result: Dict[str, Any] = {}

        for col_name, val in zip(col_names, row):
            if col_name.lower() == "id":
                continue

            col_type = types.get(col_name.lower(), "")
            if not col_type:
                if col_name.upper().startswith(("IS_", "AUTO_", "SHOW_", "STORE_")):
                    col_type = "BOOLEAN"
                elif isinstance(val, int):
                    col_type = "INTEGER"

            if "BOOLEAN" in col_type.upper():
                result[col_name] = bool(val) if val is not None else False
            elif "INT" in col_type.upper():
                result[col_name] = int(val) if val is not None else None
            else:
                result[col_name] = val

        return result

    for table_name, table_spec in _PARSED_SCHEMA.items():
        if normalized_key in table_spec["columns"]:
            actual_col_name = table_spec["columns"][normalized_key][0]
            col_type = table_spec["types"].get(normalized_key, "TEXT")

            cursor = _DB_CONN.execute(f"SELECT {actual_col_name} FROM {table_name} LIMIT 1")
            row = cursor.fetchone()
            val = row[0] if row else None

            if "BOOLEAN" in col_type:
                val = bool(val) if val is not None else None
            elif "INT" in col_type:
                val = int(val) if val is not None else None

            return {actual_col_name: val}

    raise KeyError(f"Configuration key '{key}' not found in Vault.")


def update_configuration(table_name: str, updates: Dict[str, Any]) -> Dict[str, Any]:
    global _DB_CONN
    if _DB_CONN is None:
        init_config_storage()

    normalized_table = table_name.strip().lower().replace("-", "_")
    if normalized_table == "redis":
        normalized_table = "message_broker"
    elif normalized_table in ("user", "users"):
        normalized_table = "user_details"
    elif normalized_table in ("engine", "engine_workers"):
        return update_engine_workers(updates)
    if normalized_table not in _PARSED_SCHEMA:
        raise KeyError(f"Unknown configuration group '{table_name}'")

    existing_info = _DB_CONN.execute(f"PRAGMA table_info({normalized_table})").fetchall()
    existing_cols = {row[1].lower(): row[1] for row in existing_info}

    for k, v in updates.items():
        k_lower = k.lower()
        if k_lower not in existing_cols:
            col_type = "BOOLEAN DEFAULT 0" if isinstance(v, bool) or k.upper().startswith(("IS_", "AUTO_")) else (
                "INTEGER DEFAULT 0" if isinstance(v, int) else "TEXT"
            )
            try:
                logger.info(f"Dynamically adding column '{k}' to '{normalized_table}'")
                _DB_CONN.execute(f"ALTER TABLE {normalized_table} ADD COLUMN {k} {col_type}")
                _DB_CONN.commit()
                existing_cols[k_lower] = k
            except Exception as e:
                logger.warning(f"Failed to add column {k} to {normalized_table}: {e}")

    set_clauses: List[str] = []
    values: List[Any] = []

    for k, v in updates.items():
        set_clauses.append(f"{k} = ?")
        if isinstance(v, bool):
            values.append(1 if v else 0)
        else:
            values.append(v)

    cursor = _DB_CONN.execute(f"SELECT id FROM {normalized_table} LIMIT 1")
    row = cursor.fetchone()
    if not row:
        _DB_CONN.execute(f"INSERT INTO {normalized_table} DEFAULT VALUES")
        _DB_CONN.commit()
        row_id = _DB_CONN.execute(f"SELECT id FROM {normalized_table} LIMIT 1").fetchone()[0]
    else:
        row_id = row[0]

    if set_clauses:
        sql = f"UPDATE {normalized_table} SET {', '.join(set_clauses)} WHERE id = ?"
        _DB_CONN.execute(sql, [*values, row_id])
        _DB_CONN.commit()
        save_config_storage()

    return get_configuration(normalized_table)


def get_all_app_permissions() -> List[Dict[str, Any]]:
    global _DB_CONN
    if _DB_CONN is None:
        init_config_storage()

    cursor = _DB_CONN.execute(
        "SELECT app_name, app_id, allowed_to_capture FROM app_permissions ORDER BY app_name COLLATE NOCASE ASC"
    )
    rows = cursor.fetchall()
    return [
        {
            "app_name": row[0],
            "app_id": row[1],
            "allowed_to_capture": bool(row[2])
        }
        for row in rows
    ]


def refresh_app_permissions(discovered_apps: List[Dict[str, str]]) -> Dict[str, Any]:
    global _DB_CONN
    if _DB_CONN is None:
        init_config_storage()

    deduped_discovered: Dict[str, Tuple[str, str]] = {}
    for app in discovered_apps:
        app_id = (app.get("app_id") or "").strip()
        app_name = (app.get("app_name") or "").strip()
        if not app_id:
            continue
        if not app_name:
            app_name = app_id
        app_id_key = app_id.lower()
        if app_id_key not in deduped_discovered:
            deduped_discovered[app_id_key] = (app_name, app_id)

    cursor = _DB_CONN.execute("SELECT app_id, app_name, allowed_to_capture FROM app_permissions")
    existing_rows = cursor.fetchall()
    existing_map: Dict[str, Tuple[str, bool]] = {
        row[0].strip().lower(): (row[1], bool(row[2])) for row in existing_rows if row[0]
    }

    added_count = 0
    preserved_count = 0
    removed_count = 0

    for existing_id_key in list(existing_map.keys()):
        if existing_id_key not in deduped_discovered:
            _DB_CONN.execute("DELETE FROM app_permissions WHERE LOWER(app_id) = ?", (existing_id_key,))
            removed_count += 1

    for app_id_key, (app_name, original_app_id) in deduped_discovered.items():
        if app_id_key in existing_map:
            existing_name, _ = existing_map[app_id_key]
            if existing_name != app_name:
                _DB_CONN.execute(
                    "UPDATE app_permissions SET app_name = ? WHERE LOWER(app_id) = ?",
                    (app_name, app_id_key)
                )
            preserved_count += 1
        else:
            _DB_CONN.execute(
                "INSERT INTO app_permissions (app_id, app_name, allowed_to_capture) VALUES (?, ?, 1)",
                (original_app_id, app_name)
            )
            added_count += 1

    _DB_CONN.commit()
    save_config_storage()

    total_count = _DB_CONN.execute("SELECT count(*) FROM app_permissions").fetchone()[0]

    logger.info(
        f"Refreshed app permissions: {total_count} total, {added_count} added, "
        f"{removed_count} removed, {preserved_count} preserved"
    )

    return {
        "status": "success",
        "message": "App list refreshed successfully",
        "total": total_count,
        "added": added_count,
        "removed": removed_count,
        "preserved": preserved_count,
    }


def update_app_permission(app_id: str, allowed_to_capture: bool) -> Dict[str, Any]:
    global _DB_CONN
    if _DB_CONN is None:
        init_config_storage()

    clean_id = app_id.strip()
    if not clean_id:
        raise ValueError("app_id cannot be empty")

    cursor = _DB_CONN.execute(
        "SELECT app_name, app_id, allowed_to_capture FROM app_permissions WHERE LOWER(app_id) = LOWER(?)",
        (clean_id,)
    )
    row = cursor.fetchone()
    if not row:
        raise KeyError(f"Application with app_id '{clean_id}' not found in Vault.")

    perm_val = 1 if allowed_to_capture else 0
    _DB_CONN.execute(
        "UPDATE app_permissions SET allowed_to_capture = ? WHERE LOWER(app_id) = LOWER(?)",
        (perm_val, clean_id)
    )
    _DB_CONN.commit()
    save_config_storage()

    updated = {
        "app_name": row[0],
        "app_id": row[1],
        "allowed_to_capture": bool(allowed_to_capture),
    }
    logger.info(f"Updated capture permission for '{updated['app_name']}' ({clean_id}) -> {allowed_to_capture}")
    return updated


def _seed_default_ai_configs() -> None:
    global _DB_CONN
    if _DB_CONN is None:
        return

    exists = _DB_CONN.execute(
        "SELECT count(*) FROM sqlite_master WHERE type='table' AND name='ai_configs'"
    ).fetchone()[0]
    if not exists:
        return

    default_providers = ["groq", "gemini"]
    for provider in default_providers:
        cursor = _DB_CONN.execute(
            "SELECT count(*) FROM ai_configs WHERE LOWER(llm_provider) = LOWER(?)",
            (provider,)
        )
        if cursor.fetchone()[0] == 0:
            logger.info(f"Seeding default AI config provider: '{provider}'")
            _DB_CONN.execute(
                "INSERT INTO ai_configs (llm_provider, total_keys, current_key, keys) VALUES (?, 0, 0, '[]')",
                (provider,)
            )
    _DB_CONN.commit()


def get_all_ai_providers() -> List[str]:
    global _DB_CONN
    if _DB_CONN is None:
        init_config_storage()

    cursor = _DB_CONN.execute("SELECT llm_provider FROM ai_configs ORDER BY id ASC")
    rows = cursor.fetchall()
    return [row[0] for row in rows]


def get_all_ai_configs() -> List[Dict[str, Any]]:
    global _DB_CONN
    if _DB_CONN is None:
        init_config_storage()

    cursor = _DB_CONN.execute(
        "SELECT id, llm_provider, total_keys, current_key, keys FROM ai_configs ORDER BY id ASC"
    )
    rows = cursor.fetchall()
    results: List[Dict[str, Any]] = []
    for row in rows:
        raw_keys = row[4]
        try:
            keys_list = json.loads(raw_keys) if raw_keys else []
            if not isinstance(keys_list, list):
                keys_list = []
        except Exception:
            keys_list = []

        results.append({
            "id": row[0],
            "llm_provider": row[1],
            "total_keys": int(row[2]) if row[2] is not None else 0,
            "current_key": int(row[3]) if row[3] is not None else 0,
            "keys": [str(k) for k in keys_list]
        })
    return results


def get_ai_config(provider: str) -> Dict[str, Any]:
    global _DB_CONN
    if _DB_CONN is None:
        init_config_storage()

    clean_provider = provider.strip()
    if not clean_provider:
        raise ValueError("Provider name cannot be empty")

    cursor = _DB_CONN.execute(
        "SELECT id, llm_provider, total_keys, current_key, keys FROM ai_configs WHERE LOWER(llm_provider) = LOWER(?)",
        (clean_provider,)
    )
    row = cursor.fetchone()
    if not row:
        raise KeyError(f"AI config for provider '{provider}' not found in Vault.")

    raw_keys = row[4]
    try:
        keys_list = json.loads(raw_keys) if raw_keys else []
        if not isinstance(keys_list, list):
            keys_list = []
    except Exception:
        keys_list = []

    return {
        "id": row[0],
        "llm_provider": row[1],
        "total_keys": int(row[2]) if row[2] is not None else 0,
        "current_key": int(row[3]) if row[3] is not None else 0,
        "keys": [str(k) for k in keys_list]
    }


def update_ai_config(
    provider: str,
    *,
    keys: Optional[List[str]] = None,
    add_keys: Optional[List[str]] = None,
    remove_keys: Optional[List[str]] = None,
    current_key: Optional[int] = None,
    total_keys: Optional[int] = None,
    create_if_missing: bool = True
) -> Dict[str, Any]:
    global _DB_CONN
    if _DB_CONN is None:
        init_config_storage()

    clean_provider = provider.strip()
    if not clean_provider:
        raise ValueError("Provider name cannot be empty")

    cursor = _DB_CONN.execute(
        "SELECT id, llm_provider, total_keys, current_key, keys FROM ai_configs WHERE LOWER(llm_provider) = LOWER(?)",
        (clean_provider,)
    )
    row = cursor.fetchone()
    if not row:
        if not create_if_missing:
            raise KeyError(f"AI config for provider '{provider}' not found in Vault.")
        _DB_CONN.execute(
            "INSERT INTO ai_configs (llm_provider, total_keys, current_key, keys) VALUES (?, 0, 0, '[]')",
            (clean_provider,)
        )
        _DB_CONN.commit()
        cursor = _DB_CONN.execute(
            "SELECT id, llm_provider, total_keys, current_key, keys FROM ai_configs WHERE LOWER(llm_provider) = LOWER(?)",
            (clean_provider,)
        )
        row = cursor.fetchone()

    row_id, orig_provider, current_total_keys, current_key_idx, raw_keys = row

    try:
        keys_list = json.loads(raw_keys) if raw_keys else []
        if not isinstance(keys_list, list):
            keys_list = []
    except Exception:
        keys_list = []

    # 1. Full replacement if 'keys' provided
    if keys is not None:
        keys_list = [str(k).strip() for k in keys if str(k).strip()]

    # 2. Add keys if 'add_keys' provided
    if add_keys:
        for k in add_keys:
            cleaned_k = str(k).strip()
            if cleaned_k and cleaned_k not in keys_list:
                keys_list.append(cleaned_k)

    # 3. Remove keys if 'remove_keys' provided
    if remove_keys:
        remove_set = {str(k).strip() for k in remove_keys if str(k).strip()}
        keys_list = [k for k in keys_list if k not in remove_set]

    # Calculate total_keys
    computed_total = len(keys_list) if total_keys is None else max(0, total_keys)

    # 4. Handle current_key index
    if current_key is not None:
        if computed_total == 0:
            current_key_idx = 0
        else:
            current_key_idx = max(0, min(current_key, computed_total - 1))
    else:
        if computed_total == 0:
            current_key_idx = 0
        elif current_key_idx >= computed_total:
            current_key_idx = max(0, computed_total - 1)
        elif current_key_idx < 0:
            current_key_idx = 0

    json_keys = json.dumps(keys_list)
    _DB_CONN.execute(
        "UPDATE ai_configs SET total_keys = ?, current_key = ?, keys = ? WHERE id = ?",
        (computed_total, current_key_idx, json_keys, row_id)
    )
    _DB_CONN.commit()
    save_config_storage()

    logger.info(
        f"Updated AI config for '{orig_provider}': total_keys={computed_total}, "
        f"current_key={current_key_idx}, keys={len(keys_list)}"
    )

    return {
        "id": row_id,
        "llm_provider": orig_provider,
        "total_keys": computed_total,
        "current_key": current_key_idx,
        "keys": keys_list
    }


def delete_ai_config(provider: str) -> Dict[str, Any]:
    global _DB_CONN
    if _DB_CONN is None:
        init_config_storage()

    clean_provider = provider.strip()
    if not clean_provider:
        raise ValueError("Provider name cannot be empty")

    cursor = _DB_CONN.execute(
        "SELECT id, llm_provider FROM ai_configs WHERE LOWER(llm_provider) = LOWER(?)",
        (clean_provider,)
    )
    row = cursor.fetchone()
    if not row:
        raise KeyError(f"AI config for provider '{provider}' not found in Vault.")

    _DB_CONN.execute("DELETE FROM ai_configs WHERE id = ?", (row[0],))
    _DB_CONN.commit()
    save_config_storage()

    return {
        "status": "success",
        "message": f"AI config for provider '{row[1]}' deleted successfully."
    }


def get_ai_priorities() -> List[str]:
    global _DB_CONN
    if _DB_CONN is None:
        init_config_storage()

    all_providers = get_all_ai_providers()
    provider_map = {p.strip().lower(): p for p in all_providers}

    exists = _DB_CONN.execute(
        "SELECT count(*) FROM sqlite_master WHERE type='table' AND name='ai_priorities'"
    ).fetchone()[0]
    if not exists:
        return list(all_providers)

    cursor = _DB_CONN.execute("SELECT id, priorities FROM ai_priorities LIMIT 1")
    row = cursor.fetchone()
    if not row:
        json_priorities = json.dumps(all_providers)
        _DB_CONN.execute("INSERT INTO ai_priorities (priorities) VALUES (?)", (json_priorities,))
        _DB_CONN.commit()
        save_config_storage()
        return list(all_providers)

    row_id, raw_priorities = row
    try:
        parsed = json.loads(raw_priorities) if raw_priorities else []
        if not isinstance(parsed, list):
            parsed = []
    except Exception:
        parsed = []

    # Reconcile with current configured providers
    reconciled: List[str] = []
    seen = set()
    for item in parsed:
        if isinstance(item, str):
            p_lower = item.strip().lower()
            if p_lower in provider_map and p_lower not in seen:
                reconciled.append(provider_map[p_lower])
                seen.add(p_lower)

    for p in all_providers:
        p_lower = p.strip().lower()
        if p_lower not in seen:
            reconciled.append(provider_map[p_lower])
            seen.add(p_lower)

    if reconciled != parsed:
        _DB_CONN.execute(
            "UPDATE ai_priorities SET priorities = ? WHERE id = ?",
            (json.dumps(reconciled), row_id)
        )
        _DB_CONN.commit()
        save_config_storage()

    return reconciled


def update_ai_priorities(new_priorities: List[str]) -> List[str]:
    global _DB_CONN
    if _DB_CONN is None:
        init_config_storage()

    if not isinstance(new_priorities, list):
        raise ValueError("Priorities must be an array of provider names.")

    all_providers = get_all_ai_providers()
    configured_set = {p.strip().lower() for p in all_providers}
    configured_map = {p.strip().lower(): p for p in all_providers}

    seen = set()
    cleaned_order: List[str] = []

    for item in new_priorities:
        if not isinstance(item, str):
            raise ValueError(f"Invalid item in priorities list: expected string, got {type(item).__name__}")
        clean_name = item.strip()
        name_lower = clean_name.lower()
        if not name_lower:
            raise ValueError("Provider names cannot be empty strings.")
        if name_lower in seen:
            raise ValueError(f"Duplicate provider '{clean_name}' in priorities array. Each provider must appear exactly once.")
        seen.add(name_lower)
        if name_lower not in configured_set:
            raise ValueError(f"Provider '{clean_name}' is not in configured AI providers. Reordering cannot add extra providers.")
        cleaned_order.append(configured_map[name_lower])

    missing = configured_set - seen
    if missing:
        missing_names = [configured_map[m] for m in missing]
        raise ValueError(f"Missing provider(s) in priorities array: {', '.join(missing_names)}. Every configured provider must be included.")

    if len(cleaned_order) != len(all_providers):
        raise ValueError(f"Priorities array must have exactly {len(all_providers)} providers.")

    cursor = _DB_CONN.execute("SELECT id FROM ai_priorities LIMIT 1")
    row = cursor.fetchone()
    json_val = json.dumps(cleaned_order)
    if row:
        _DB_CONN.execute("UPDATE ai_priorities SET priorities = ? WHERE id = ?", (json_val, row[0]))
    else:
        _DB_CONN.execute("INSERT INTO ai_priorities (priorities) VALUES (?)", (json_val,))
    _DB_CONN.commit()
    save_config_storage()

    logger.info(f"Updated LLM provider priorities: {cleaned_order}")
    return cleaned_order


def get_engine_workers() -> Dict[str, int]:
    global _DB_CONN
    if _DB_CONN is None:
        init_config_storage()

    exists = _DB_CONN.execute(
        "SELECT count(*) FROM sqlite_master WHERE type='table' AND name='engine_workers'"
    ).fetchone()[0]
    if not exists:
        return {"embedding_workers": 1, "llm_workers": 1}

    row = _DB_CONN.execute("SELECT embedding_workers, llm_workers FROM engine_workers LIMIT 1").fetchone()
    if not row:
        _DB_CONN.execute("INSERT INTO engine_workers (embedding_workers, llm_workers) VALUES (1, 1)")
        _DB_CONN.commit()
        save_config_storage()
        return {"embedding_workers": 1, "llm_workers": 1}

    emb = row[0] if row[0] is not None else 1
    llm = row[1] if row[1] is not None else 1
    return {
        "embedding_workers": int(emb),
        "llm_workers": int(llm)
    }


def update_engine_workers(updates: Dict[str, Any]) -> Dict[str, int]:
    global _DB_CONN
    if _DB_CONN is None:
        init_config_storage()

    if not isinstance(updates, dict):
        raise ValueError("Payload must be a dictionary or object containing worker settings.")

    current = get_engine_workers()
    new_embedding = current["embedding_workers"]
    new_llm = current["llm_workers"]

    if "embedding_workers" in updates and updates["embedding_workers"] is not None:
        val = updates["embedding_workers"]
        if isinstance(val, bool) or not isinstance(val, int):
            raise ValueError("embedding_workers must be an integer between 1 and 50.")
        if val < 1 or val > 50:
            raise ValueError("embedding_workers must be an integer between 1 and 50 inclusive.")
        new_embedding = val

    if "llm_workers" in updates and updates["llm_workers"] is not None:
        val = updates["llm_workers"]
        if isinstance(val, bool) or not isinstance(val, int):
            raise ValueError("llm_workers must be an integer between 1 and 50.")
        if val < 1 or val > 50:
            raise ValueError("llm_workers must be an integer between 1 and 50 inclusive.")
        new_llm = val

    cursor = _DB_CONN.execute("SELECT id FROM engine_workers LIMIT 1")
    row = cursor.fetchone()
    if row:
        _DB_CONN.execute(
            "UPDATE engine_workers SET embedding_workers = ?, llm_workers = ? WHERE id = ?",
            (new_embedding, new_llm, row[0])
        )
    else:
        _DB_CONN.execute(
            "INSERT INTO engine_workers (embedding_workers, llm_workers) VALUES (?, ?)",
            (new_embedding, new_llm)
        )
    _DB_CONN.commit()
    save_config_storage()

    logger.info(f"Updated engine workers configuration: embedding_workers={new_embedding}, llm_workers={new_llm}")
    return {
        "embedding_workers": new_embedding,
        "llm_workers": new_llm
    }

