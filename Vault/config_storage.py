from __future__ import annotations
import base64
from datetime import datetime, timezone
import json
import logging
import math
import re
import sqlite3
import uuid
from pathlib import Path
from typing import Any, Dict, List, Optional, Tuple
import config
from crypto import decrypt_log_data, encrypt_log_data
logger = logging.getLogger('mira.vault.config_storage')
_DB_CONN: Optional[sqlite3.Connection] = None
_PARSED_SCHEMA: Dict[str, Dict[str, Any]] = {}
TABLE_REGEX = re.compile('CREATE\\s+TABLE\\s+(?:IF\\s+NOT\\s+EXISTS\\s+)?([a-zA-Z0-9_]+)\\s*\\((.*?)\\);', re.DOTALL | re.IGNORECASE)
INDEX_REGEX = re.compile(r'CREATE\s+(?:UNIQUE\s+)?INDEX\s+(?:IF\s+NOT\s+EXISTS\s+)?.*?;', re.DOTALL | re.IGNORECASE)

def get_schema_file_path() -> Path:
    return getattr(config, 'SCHEMA_FILE_PATH', config.VAULT_DIR / 'schema.sql')

def get_encrypted_db_path() -> Path:
    return config.SYSTEM_DIR / 'config.db.enc'

def parse_schema_file(schema_path: Optional[Path]=None) -> Dict[str, Dict[str, Any]]:
    if schema_path is None:
        schema_path = get_schema_file_path()
    if not schema_path.exists():
        raise FileNotFoundError(f'Schema file not found at: {schema_path}')
    content = schema_path.read_text(encoding='utf-8')
    tables: Dict[str, Dict[str, Any]] = {}
    for match in TABLE_REGEX.finditer(content):
        table_name = match.group(1).lower()
        body = match.group(2)
        columns: Dict[str, Tuple[str, str]] = {}
        types: Dict[str, str] = {}
        for line in body.strip().splitlines():
            line = line.strip().rstrip(',')
            if not line or line.startswith('--'):
                continue
            parts = line.split()
            col_name = parts[0]
            col_type = parts[1].upper() if len(parts) > 1 else 'TEXT'
            columns[col_name.lower()] = (col_name, line)
            types[col_name.lower()] = col_type
        tables[table_name] = {'table_name': table_name, 'raw_name': match.group(1), 'columns': columns, 'types': types, 'body': body, 'create_sql': f'CREATE TABLE IF NOT EXISTS {table_name} ({body});'}
    return tables

def init_config_storage(schema_path: Optional[Path]=None, enc_db_path: Optional[Path]=None) -> None:
    global _DB_CONN, _PARSED_SCHEMA
    config.SYSTEM_DIR.mkdir(parents=True, exist_ok=True)
    if enc_db_path is None:
        enc_db_path = get_encrypted_db_path()
    _PARSED_SCHEMA = parse_schema_file(schema_path)
    _DB_CONN = sqlite3.connect(':memory:', check_same_thread=False)
    if enc_db_path.exists():
        try:
            encrypted_bytes = enc_db_path.read_bytes()
            if encrypted_bytes:
                decrypted_bytes = decrypt_log_data(encrypted_bytes)
                _DB_CONN.deserialize(decrypted_bytes)
                logger.info(f'Loaded and decrypted configuration database from {enc_db_path}')
        except Exception as e:
            logger.error(f'Failed to decrypt existing config database ({e}), starting clean.')
    for table_name, table_spec in _PARSED_SCHEMA.items():
        exists = _DB_CONN.execute("SELECT count(*) FROM sqlite_master WHERE type='table' AND name=?", (table_name,)).fetchone()[0]
        if not exists:
            logger.info(f"Creating missing configuration table: '{table_name}'")
            _DB_CONN.execute(table_spec['create_sql'])
            if table_name not in ('app_permissions', 'ai_configs', 'chats', 'gnews_config'):
                _DB_CONN.execute(f'INSERT INTO {table_name} DEFAULT VALUES')
            _DB_CONN.commit()
        else:
            existing_info = _DB_CONN.execute(f'PRAGMA table_info({table_name})').fetchall()
            existing_cols = {row[1].lower(): row[1] for row in existing_info}
            target_cols = table_spec['columns']
            for col_key, (col_name, col_def) in target_cols.items():
                if col_key not in existing_cols:
                    logger.info(f"Adding missing column '{col_name}' to table '{table_name}'")
                    _DB_CONN.execute(f'ALTER TABLE {table_name} ADD COLUMN {col_def}')
                    _DB_CONN.commit()
            if table_name == 'daily_suggestions':
                if 'whether' in existing_cols and 'weather' in target_cols:
                    try:
                        _DB_CONN.execute("UPDATE daily_suggestions SET weather = whether WHERE (weather IS NULL OR weather = '{}') AND whether IS NOT NULL")
                        _DB_CONN.commit()
                    except Exception:
                        pass
                if 'date_whether' in existing_cols and 'date_weather' in target_cols:
                    try:
                        _DB_CONN.execute("UPDATE daily_suggestions SET date_weather = date_whether WHERE date_weather IS NULL AND date_whether IS NOT NULL")
                        _DB_CONN.commit()
                    except Exception:
                        pass
            for col_key, col_name in existing_cols.items():
                if col_key not in target_cols and col_key != 'id':
                    logger.info(f"Dropping obsolete column '{col_name}' from table '{table_name}'")
                    try:
                        _DB_CONN.execute(f'ALTER TABLE {table_name} DROP COLUMN {col_name}')
                        _DB_CONN.commit()
                    except Exception as e:
                        logger.error(f"Failed to drop column '{col_name}' from '{table_name}': {e}")
            if table_name not in ('app_permissions', 'ai_configs', 'chats', 'gnews_config'):
                count = _DB_CONN.execute(f'SELECT count(*) FROM {table_name}').fetchone()[0]
                if count == 0:
                    _DB_CONN.execute(f'INSERT INTO {table_name} DEFAULT VALUES')
                    _DB_CONN.commit()
                elif table_name == 'logs':
                    _DB_CONN.execute('UPDATE logs SET show_logs_vault = 1 WHERE show_logs_vault IS NULL')
                    _DB_CONN.execute('UPDATE logs SET store_logs_vault = 1 WHERE store_logs_vault IS NULL')
                    _DB_CONN.commit()
                elif table_name == 'engine_workers':
                    if 'llm_workers' in existing_cols and 'chat_workers' in target_cols:
                        try:
                            _DB_CONN.execute('UPDATE engine_workers SET chat_workers = llm_workers WHERE chat_workers IS NULL')
                            _DB_CONN.commit()
                        except Exception:
                            pass
                    _DB_CONN.execute('UPDATE engine_workers SET chat_workers = 1 WHERE chat_workers IS NULL')
                    _DB_CONN.execute('UPDATE engine_workers SET chat_workers_poll_time = 1.0 WHERE chat_workers_poll_time IS NULL')
                    _DB_CONN.execute('UPDATE engine_workers SET embedding_vector_store_workers = 1 WHERE embedding_vector_store_workers IS NULL')
                    _DB_CONN.execute('UPDATE engine_workers SET embedding_vector_store_workers_poll_time = 1.0 WHERE embedding_vector_store_workers_poll_time IS NULL')
                    _DB_CONN.commit()
                elif table_name == 'operator':
                    _DB_CONN.execute("UPDATE operator SET KNOWLEDGE_BASE_RETENTION_PERIOD = 'Never auto delete' WHERE KNOWLEDGE_BASE_RETENTION_PERIOD IS NULL")
                    _DB_CONN.commit()
            elif table_name == 'app_permissions':
                _DB_CONN.execute("DELETE FROM app_permissions WHERE app_id IS NULL OR app_id = ''")
                _DB_CONN.commit()
    _seed_default_ai_configs()
    _seed_default_gnews_config()
    try:
        schema_file = schema_path if schema_path is not None else get_schema_file_path()
        if schema_file.exists():
            schema_content = schema_file.read_text(encoding='utf-8')
            for match in INDEX_REGEX.finditer(schema_content):
                idx_sql = match.group(0).strip()
                if idx_sql:
                    try:
                        _DB_CONN.execute(idx_sql)
                    except Exception as ex_idx:
                        logger.debug(f"Index execution error for '{idx_sql}': {ex_idx}")
            _DB_CONN.commit()
    except Exception as e:
        logger.debug(f"Automatic schema index creation: {e}")

    try:
        _DB_CONN.execute("CREATE INDEX IF NOT EXISTS idx_chats_session_id ON chats(session_id)")
        _DB_CONN.execute("CREATE INDEX IF NOT EXISTS idx_chats_session_created ON chats(session_id, created_at)")
        _DB_CONN.execute("CREATE INDEX IF NOT EXISTS idx_chats_created ON chats(created_at)")
        _DB_CONN.execute("CREATE INDEX IF NOT EXISTS idx_chats_session_created_id ON chats(session_id, created_at ASC, id ASC)")
        _DB_CONN.execute("CREATE INDEX IF NOT EXISTS idx_chats_session_role_created ON chats(session_id, role, created_at DESC, id DESC)")
        _DB_CONN.execute("CREATE INDEX IF NOT EXISTS idx_app_permissions_name ON app_permissions(app_name COLLATE NOCASE ASC)")
        _DB_CONN.execute("CREATE INDEX IF NOT EXISTS idx_app_permissions_lower_app_id ON app_permissions(LOWER(app_id))")
        _DB_CONN.execute("CREATE INDEX IF NOT EXISTS idx_ai_configs_lower_provider ON ai_configs(LOWER(llm_provider))")
        _DB_CONN.execute("CREATE INDEX IF NOT EXISTS idx_daily_suggestions_date ON daily_suggestions(date_suggestions DESC)")
        _DB_CONN.commit()
    except Exception as e:
        logger.debug(f"Index creation fallback: {e}")
    try:
        cleanup_duplicate_chats()
    except Exception as e:
        logger.debug(f"Cleanup duplicate chats: {e}")
    save_config_storage(enc_db_path)

def cleanup_duplicate_chats() -> int:
    global _DB_CONN
    if _DB_CONN is None:
        return 0
    try:
        cursor = _DB_CONN.execute("""
            DELETE FROM chats
            WHERE id IN (
                SELECT c2.id
                FROM chats c1
                JOIN chats c2
                  ON c1.session_id = c2.session_id
                 AND c1.role = c2.role
                 AND c1.content = c2.content
                 AND c1.rowid < c2.rowid
            )
        """)
        deleted = cursor.rowcount
        if deleted > 0:
            _DB_CONN.commit()
            save_config_storage()
            logger.info(f"Cleaned up {deleted} duplicate chat records in Vault")
        return deleted
    except Exception as e:
        logger.error(f"Error cleaning duplicate chats: {e}")
        return 0

def save_config_storage(enc_db_path: Optional[Path]=None) -> None:
    global _DB_CONN
    if _DB_CONN is None:
        return
    if enc_db_path is None:
        enc_db_path = get_encrypted_db_path()
    raw_bytes = _DB_CONN.serialize()
    encrypted_bytes = encrypt_log_data(raw_bytes)
    temp_path = enc_db_path.with_suffix('.tmp')
    temp_path.write_bytes(encrypted_bytes)
    temp_path.replace(enc_db_path)
    logger.debug(f'Saved and encrypted configuration storage to {enc_db_path}')

def get_configuration(key: str) -> Dict[str, Any]:
    global _DB_CONN, _PARSED_SCHEMA
    if _DB_CONN is None:
        init_config_storage()
    normalized_key = key.strip().lower().replace('-', '_')
    if normalized_key == 'redis':
        normalized_key = 'message_broker'
    elif normalized_key in ('user', 'users'):
        normalized_key = 'user_details'
    elif normalized_key in ('ai', 'ai_config', 'ai_configs', 'llm'):
        return {'providers': get_all_ai_providers(), 'priorities': get_ai_priorities(), 'configs': get_all_ai_configs()}
    elif normalized_key in ('gnews', 'gnews_config', 'gnews_configs', 'news', 'news_config'):
        return get_gnews_config()
    elif normalized_key in ('priorities', 'ai_priorities', 'llm_priorities'):
        return {'priorities': get_ai_priorities()}
    elif normalized_key in ('engine', 'engine_workers', 'workers'):
        return get_engine_workers()
    elif normalized_key in ('system', 'system_storage', 'storage'):
        return {'system_storage_path': str(config.SYSTEM_DIR.resolve()), 'knowledge_base_path': str((config.SYSTEM_DIR / 'knowledge_base').resolve()), 'logs_path': str(config.LOGS_DIR.resolve())}
    elif normalized_key in ('daily_suggestions', 'suggestions', 'daily_suggestion'):
        return get_latest_daily_suggestions() or {}
    if normalized_key in _PARSED_SCHEMA:
        table_name = normalized_key
        table_spec = _PARSED_SCHEMA[table_name]
        types = table_spec.get('types', {})
        cursor = _DB_CONN.execute(f'SELECT * FROM {table_name} LIMIT 1')
        row = cursor.fetchone()
        if not row:
            return {}
        col_names = [d[0] for d in cursor.description]
        result: Dict[str, Any] = {}
        for col_name, val in zip(col_names, row):
            if col_name.lower() == 'id':
                continue
            col_type = types.get(col_name.lower(), '')
            if not col_type:
                if col_name.upper().startswith(('IS_', 'AUTO_', 'SHOW_', 'STORE_')):
                    col_type = 'BOOLEAN'
                elif isinstance(val, int):
                    col_type = 'INTEGER'
            if 'BOOLEAN' in col_type.upper():
                result[col_name] = bool(val) if val is not None else False
            elif 'INT' in col_type.upper():
                result[col_name] = int(val) if val is not None else None
            elif 'REAL' in col_type.upper() or 'FLOAT' in col_type.upper():
                result[col_name] = float(val) if val is not None else None
            else:
                result[col_name] = val
        return result
    for table_name, table_spec in _PARSED_SCHEMA.items():
        if normalized_key in table_spec['columns']:
            actual_col_name = table_spec['columns'][normalized_key][0]
            col_type = table_spec['types'].get(normalized_key, 'TEXT')
            cursor = _DB_CONN.execute(f'SELECT {actual_col_name} FROM {table_name} LIMIT 1')
            row = cursor.fetchone()
            val = row[0] if row else None
            if 'BOOLEAN' in col_type:
                val = bool(val) if val is not None else None
            elif 'INT' in col_type:
                val = int(val) if val is not None else None
            elif 'REAL' in col_type or 'FLOAT' in col_type:
                val = float(val) if val is not None else None
            return {actual_col_name: val}
    raise KeyError(f"Configuration key '{key}' not found in Vault.")

def update_configuration(table_name: str, updates: Dict[str, Any]) -> Dict[str, Any]:
    global _DB_CONN
    if _DB_CONN is None:
        init_config_storage()
    normalized_table = table_name.strip().lower().replace('-', '_')
    if normalized_table == 'redis':
        normalized_table = 'message_broker'
    elif normalized_table in ('user', 'users'):
        normalized_table = 'user_details'
    elif normalized_table in ('engine', 'engine_workers'):
        return update_engine_workers(updates)
    elif normalized_table in ('gnews', 'gnews_config', 'gnews_configs', 'news', 'news_config'):
        return update_gnews_config(**updates)
    if normalized_table not in _PARSED_SCHEMA:
        raise KeyError(f"Unknown configuration group '{table_name}'")
    existing_info = _DB_CONN.execute(f'PRAGMA table_info({normalized_table})').fetchall()
    existing_cols = {row[1].lower(): row[1] for row in existing_info}
    for k, v in updates.items():
        k_lower = k.lower()
        if k_lower not in existing_cols:
            col_type = 'BOOLEAN DEFAULT 0' if isinstance(v, bool) or k.upper().startswith(('IS_', 'AUTO_')) else 'INTEGER DEFAULT 0' if isinstance(v, int) else 'REAL' if isinstance(v, float) else 'TEXT'
            try:
                logger.info(f"Dynamically adding column '{k}' to '{normalized_table}'")
                _DB_CONN.execute(f'ALTER TABLE {normalized_table} ADD COLUMN {k} {col_type}')
                _DB_CONN.commit()
                existing_cols[k_lower] = k
            except Exception as e:
                logger.warning(f'Failed to add column {k} to {normalized_table}: {e}')
    set_clauses: List[str] = []
    values: List[Any] = []
    for k, v in updates.items():
        set_clauses.append(f'{k} = ?')
        if isinstance(v, bool):
            values.append(1 if v else 0)
        else:
            values.append(v)
    cursor = _DB_CONN.execute(f'SELECT id FROM {normalized_table} LIMIT 1')
    row = cursor.fetchone()
    if not row:
        _DB_CONN.execute(f'INSERT INTO {normalized_table} DEFAULT VALUES')
        _DB_CONN.commit()
        row_id = _DB_CONN.execute(f'SELECT id FROM {normalized_table} LIMIT 1').fetchone()[0]
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
    cursor = _DB_CONN.execute('SELECT app_name, app_id, allowed_to_capture FROM app_permissions ORDER BY app_name COLLATE NOCASE ASC')
    rows = cursor.fetchall()
    return [{'app_name': row[0], 'app_id': row[1], 'allowed_to_capture': bool(row[2])} for row in rows]

def refresh_app_permissions(discovered_apps: List[Dict[str, str]]) -> Dict[str, Any]:
    global _DB_CONN
    if _DB_CONN is None:
        init_config_storage()
    deduped_discovered: Dict[str, Tuple[str, str]] = {}
    for app in discovered_apps:
        app_id = (app.get('app_id') or '').strip()
        app_name = (app.get('app_name') or '').strip()
        if not app_id:
            continue
        if not app_name:
            app_name = app_id
        app_id_key = app_id.lower()
        if app_id_key not in deduped_discovered:
            deduped_discovered[app_id_key] = (app_name, app_id)
    cursor = _DB_CONN.execute('SELECT app_id, app_name, allowed_to_capture FROM app_permissions')
    existing_rows = cursor.fetchall()
    existing_map: Dict[str, Tuple[str, bool]] = {row[0].strip().lower(): (row[1], bool(row[2])) for row in existing_rows if row[0]}
    added_count = 0
    preserved_count = 0
    removed_count = 0
    for existing_id_key in list(existing_map.keys()):
        if existing_id_key not in deduped_discovered:
            _DB_CONN.execute('DELETE FROM app_permissions WHERE LOWER(app_id) = ?', (existing_id_key,))
            removed_count += 1
    for app_id_key, (app_name, original_app_id) in deduped_discovered.items():
        if app_id_key in existing_map:
            existing_name, _ = existing_map[app_id_key]
            if existing_name != app_name:
                _DB_CONN.execute('UPDATE app_permissions SET app_name = ? WHERE LOWER(app_id) = ?', (app_name, app_id_key))
            preserved_count += 1
        else:
            _DB_CONN.execute('INSERT INTO app_permissions (app_id, app_name, allowed_to_capture) VALUES (?, ?, 1)', (original_app_id, app_name))
            added_count += 1
    _DB_CONN.commit()
    save_config_storage()
    total_count = _DB_CONN.execute('SELECT count(*) FROM app_permissions').fetchone()[0]
    logger.info(f'Refreshed app permissions: {total_count} total, {added_count} added, {removed_count} removed, {preserved_count} preserved')
    return {'status': 'success', 'message': 'App list refreshed successfully', 'total': total_count, 'added': added_count, 'removed': removed_count, 'preserved': preserved_count}

def update_app_permission(app_id: str, allowed_to_capture: bool) -> Dict[str, Any]:
    global _DB_CONN
    if _DB_CONN is None:
        init_config_storage()
    clean_id = app_id.strip()
    if not clean_id:
        raise ValueError('app_id cannot be empty')
    cursor = _DB_CONN.execute('SELECT app_name, app_id, allowed_to_capture FROM app_permissions WHERE LOWER(app_id) = LOWER(?)', (clean_id,))
    row = cursor.fetchone()
    if not row:
        raise KeyError(f"Application with app_id '{clean_id}' not found in Vault.")
    perm_val = 1 if allowed_to_capture else 0
    _DB_CONN.execute('UPDATE app_permissions SET allowed_to_capture = ? WHERE LOWER(app_id) = LOWER(?)', (perm_val, clean_id))
    _DB_CONN.commit()
    save_config_storage()
    updated = {'app_name': row[0], 'app_id': row[1], 'allowed_to_capture': bool(allowed_to_capture)}
    logger.info(f"Updated capture permission for '{updated['app_name']}' ({clean_id}) -> {allowed_to_capture}")
    return updated

def _seed_default_ai_configs() -> None:
    global _DB_CONN
    if _DB_CONN is None:
        return
    exists = _DB_CONN.execute("SELECT count(*) FROM sqlite_master WHERE type='table' AND name='ai_configs'").fetchone()[0]
    if not exists:
        return
    default_providers = ['groq', 'gemini']
    for provider in default_providers:
        cursor = _DB_CONN.execute('SELECT count(*) FROM ai_configs WHERE LOWER(llm_provider) = LOWER(?)', (provider,))
        if cursor.fetchone()[0] == 0:
            logger.info(f"Seeding default AI config provider: '{provider}'")
            _DB_CONN.execute("INSERT INTO ai_configs (llm_provider, total_keys, current_key, keys) VALUES (?, 0, 0, '[]')", (provider,))
    _DB_CONN.commit()

def _seed_default_gnews_config() -> None:
    global _DB_CONN
    if _DB_CONN is None:
        return
    exists = _DB_CONN.execute("SELECT count(*) FROM sqlite_master WHERE type='table' AND name='gnews_config'").fetchone()[0]
    if not exists:
        return
    cursor = _DB_CONN.execute("SELECT count(*) FROM gnews_config")
    if cursor.fetchone()[0] == 0:
        new_id = str(uuid.uuid4())
        logger.info(f"Seeding default GNews config with ID: '{new_id}'")
        _DB_CONN.execute("INSERT INTO gnews_config (id, current_key, keys) VALUES (?, 0, '[]')", (new_id,))
        _DB_CONN.commit()

def get_gnews_config() -> Dict[str, Any]:
    global _DB_CONN
    if _DB_CONN is None:
        init_config_storage()
    cursor = _DB_CONN.execute("SELECT id, current_key, keys FROM gnews_config LIMIT 1")
    row = cursor.fetchone()
    if not row:
        new_id = str(uuid.uuid4())
        _DB_CONN.execute("INSERT INTO gnews_config (id, current_key, keys) VALUES (?, 0, '[]')", (new_id,))
        _DB_CONN.commit()
        save_config_storage()
        return {
            "id": new_id,
            "total_keys": 0,
            "current_key": 0,
            "keys": []
        }
    row_id, current_key_idx, raw_keys = row
    try:
        keys_list = json.loads(raw_keys) if raw_keys else []
        if not isinstance(keys_list, list):
            keys_list = []
    except Exception:
        keys_list = []
    keys_list = [str(k) for k in keys_list]
    current_key_idx = int(current_key_idx) if current_key_idx is not None else 0
    return {
        "id": str(row_id),
        "total_keys": len(keys_list),
        "current_key": current_key_idx,
        "keys": keys_list
    }

def update_gnews_config(
    *,
    keys: Optional[List[str]] = None,
    add_keys: Optional[List[str]] = None,
    remove_keys: Optional[List[str]] = None,
    current_key: Optional[int] = None,
    total_keys: Optional[int] = None,
) -> Dict[str, Any]:
    global _DB_CONN
    if _DB_CONN is None:
        init_config_storage()
    cursor = _DB_CONN.execute("SELECT id, current_key, keys FROM gnews_config LIMIT 1")
    row = cursor.fetchone()
    if not row:
        row_id = str(uuid.uuid4())
        _DB_CONN.execute("INSERT INTO gnews_config (id, current_key, keys) VALUES (?, 0, '[]')", (row_id,))
        _DB_CONN.commit()
        current_key_idx = 0
        keys_list = []
    else:
        row_id, current_key_idx, raw_keys = row
        try:
            keys_list = json.loads(raw_keys) if raw_keys else []
            if not isinstance(keys_list, list):
                keys_list = []
        except Exception:
            keys_list = []

    if keys is not None:
        keys_list = [str(k).strip() for k in keys if str(k).strip()]

    if add_keys:
        for k in add_keys:
            cleaned_k = str(k).strip()
            if cleaned_k and cleaned_k not in keys_list:
                keys_list.append(cleaned_k)

    if remove_keys:
        remove_set = {str(k).strip() for k in remove_keys if str(k).strip()}
        keys_list = [k for k in keys_list if k not in remove_set]

    computed_total = len(keys_list)

    # Validate selected index against number of configured keys
    if current_key is not None:
        if current_key < 0:
            raise ValueError(f"Current key index cannot be negative (got {current_key}).")
        if computed_total == 0:
            if current_key != 0:
                raise ValueError(f"Current key index {current_key} is invalid. No keys are configured.")
            target_current_key = 0
        else:
            if current_key >= computed_total:
                raise ValueError(
                    f"Current key index {current_key} is out of bounds. Must be between 0 and {computed_total - 1}."
                )
            target_current_key = current_key
    else:
        if computed_total == 0:
            target_current_key = 0
        elif current_key_idx >= computed_total:
            target_current_key = max(0, computed_total - 1)
        elif current_key_idx < 0:
            target_current_key = 0
        else:
            target_current_key = current_key_idx

    json_keys = json.dumps(keys_list)
    _DB_CONN.execute(
        "UPDATE gnews_config SET current_key = ?, keys = ? WHERE id = ?",
        (target_current_key, json_keys, str(row_id))
    )
    _DB_CONN.commit()
    save_config_storage()
    logger.info(f"Updated GNews config: total_keys={computed_total}, current_key={target_current_key}, id={row_id}")
    return {
        "id": str(row_id),
        "total_keys": computed_total,
        "current_key": target_current_key,
        "keys": keys_list
    }

def delete_gnews_config() -> Dict[str, Any]:
    global _DB_CONN
    if _DB_CONN is None:
        init_config_storage()
    cursor = _DB_CONN.execute("SELECT id FROM gnews_config LIMIT 1")
    row = cursor.fetchone()
    if not row:
        row_id = str(uuid.uuid4())
        _DB_CONN.execute("INSERT INTO gnews_config (id, current_key, keys) VALUES (?, 0, '[]')", (row_id,))
    else:
        row_id = row[0]
        _DB_CONN.execute("UPDATE gnews_config SET current_key = 0, keys = '[]' WHERE id = ?", (row_id,))
    _DB_CONN.commit()
    save_config_storage()
    logger.info("Cleared GNews config keys in Vault")
    return {"status": "success", "message": "GNews configuration keys cleared successfully."}


def get_all_ai_providers() -> List[str]:
    global _DB_CONN
    if _DB_CONN is None:
        init_config_storage()
    cursor = _DB_CONN.execute('SELECT llm_provider FROM ai_configs ORDER BY id ASC')
    rows = cursor.fetchall()
    return [row[0] for row in rows]

def get_all_ai_configs() -> List[Dict[str, Any]]:
    global _DB_CONN
    if _DB_CONN is None:
        init_config_storage()
    cursor = _DB_CONN.execute('SELECT id, llm_provider, total_keys, current_key, keys FROM ai_configs ORDER BY id ASC')
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
        results.append({'id': row[0], 'llm_provider': row[1], 'total_keys': int(row[2]) if row[2] is not None else 0, 'current_key': int(row[3]) if row[3] is not None else 0, 'keys': [str(k) for k in keys_list]})
    return results

def get_ai_config(provider: str) -> Dict[str, Any]:
    global _DB_CONN
    if _DB_CONN is None:
        init_config_storage()
    clean_provider = provider.strip()
    if not clean_provider:
        raise ValueError('Provider name cannot be empty')
    cursor = _DB_CONN.execute('SELECT id, llm_provider, total_keys, current_key, keys FROM ai_configs WHERE LOWER(llm_provider) = LOWER(?)', (clean_provider,))
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
    return {'id': row[0], 'llm_provider': row[1], 'total_keys': int(row[2]) if row[2] is not None else 0, 'current_key': int(row[3]) if row[3] is not None else 0, 'keys': [str(k) for k in keys_list]}

def update_ai_config(provider: str, *, keys: Optional[List[str]]=None, add_keys: Optional[List[str]]=None, remove_keys: Optional[List[str]]=None, current_key: Optional[int]=None, total_keys: Optional[int]=None, create_if_missing: bool=True) -> Dict[str, Any]:
    global _DB_CONN
    if _DB_CONN is None:
        init_config_storage()
    clean_provider = provider.strip()
    if not clean_provider:
        raise ValueError('Provider name cannot be empty')
    cursor = _DB_CONN.execute('SELECT id, llm_provider, total_keys, current_key, keys FROM ai_configs WHERE LOWER(llm_provider) = LOWER(?)', (clean_provider,))
    row = cursor.fetchone()
    if not row:
        if not create_if_missing:
            raise KeyError(f"AI config for provider '{provider}' not found in Vault.")
        _DB_CONN.execute("INSERT INTO ai_configs (llm_provider, total_keys, current_key, keys) VALUES (?, 0, 0, '[]')", (clean_provider,))
        _DB_CONN.commit()
        cursor = _DB_CONN.execute('SELECT id, llm_provider, total_keys, current_key, keys FROM ai_configs WHERE LOWER(llm_provider) = LOWER(?)', (clean_provider,))
        row = cursor.fetchone()
    row_id, orig_provider, current_total_keys, current_key_idx, raw_keys = row
    try:
        keys_list = json.loads(raw_keys) if raw_keys else []
        if not isinstance(keys_list, list):
            keys_list = []
    except Exception:
        keys_list = []
    if keys is not None:
        keys_list = [str(k).strip() for k in keys if str(k).strip()]
    if add_keys:
        for k in add_keys:
            cleaned_k = str(k).strip()
            if cleaned_k and cleaned_k not in keys_list:
                keys_list.append(cleaned_k)
    if remove_keys:
        remove_set = {str(k).strip() for k in remove_keys if str(k).strip()}
        keys_list = [k for k in keys_list if k not in remove_set]
    computed_total = len(keys_list) if total_keys is None else max(0, total_keys)
    if current_key is not None:
        if computed_total == 0:
            current_key_idx = 0
        else:
            current_key_idx = max(0, min(current_key, computed_total - 1))
    elif computed_total == 0:
        current_key_idx = 0
    elif current_key_idx >= computed_total:
        current_key_idx = max(0, computed_total - 1)
    elif current_key_idx < 0:
        current_key_idx = 0
    json_keys = json.dumps(keys_list)
    _DB_CONN.execute('UPDATE ai_configs SET total_keys = ?, current_key = ?, keys = ? WHERE id = ?', (computed_total, current_key_idx, json_keys, row_id))
    _DB_CONN.commit()
    save_config_storage()
    logger.info(f"Updated AI config for '{orig_provider}': total_keys={computed_total}, current_key={current_key_idx}, keys={len(keys_list)}")
    return {'id': row_id, 'llm_provider': orig_provider, 'total_keys': computed_total, 'current_key': current_key_idx, 'keys': keys_list}

def delete_ai_config(provider: str) -> Dict[str, Any]:
    global _DB_CONN
    if _DB_CONN is None:
        init_config_storage()
    clean_provider = provider.strip()
    if not clean_provider:
        raise ValueError('Provider name cannot be empty')
    cursor = _DB_CONN.execute('SELECT id, llm_provider FROM ai_configs WHERE LOWER(llm_provider) = LOWER(?)', (clean_provider,))
    row = cursor.fetchone()
    if not row:
        raise KeyError(f"AI config for provider '{provider}' not found in Vault.")
    _DB_CONN.execute('DELETE FROM ai_configs WHERE id = ?', (row[0],))
    _DB_CONN.commit()
    save_config_storage()
    return {'status': 'success', 'message': f"AI config for provider '{row[1]}' deleted successfully."}

def get_ai_priorities() -> List[str]:
    global _DB_CONN
    if _DB_CONN is None:
        init_config_storage()
    all_providers = get_all_ai_providers()
    provider_map = {p.strip().lower(): p for p in all_providers}
    exists = _DB_CONN.execute("SELECT count(*) FROM sqlite_master WHERE type='table' AND name='ai_priorities'").fetchone()[0]
    if not exists:
        return list(all_providers)
    cursor = _DB_CONN.execute('SELECT id, priorities FROM ai_priorities LIMIT 1')
    row = cursor.fetchone()
    if not row:
        json_priorities = json.dumps(all_providers)
        _DB_CONN.execute('INSERT INTO ai_priorities (priorities) VALUES (?)', (json_priorities,))
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
        _DB_CONN.execute('UPDATE ai_priorities SET priorities = ? WHERE id = ?', (json.dumps(reconciled), row_id))
        _DB_CONN.commit()
        save_config_storage()
    return reconciled

def update_ai_priorities(new_priorities: List[str]) -> List[str]:
    global _DB_CONN
    if _DB_CONN is None:
        init_config_storage()
    if not isinstance(new_priorities, list):
        raise ValueError('Priorities must be an array of provider names.')
    all_providers = get_all_ai_providers()
    configured_set = {p.strip().lower() for p in all_providers}
    configured_map = {p.strip().lower(): p for p in all_providers}
    seen = set()
    cleaned_order: List[str] = []
    for item in new_priorities:
        if not isinstance(item, str):
            raise ValueError(f'Invalid item in priorities list: expected string, got {type(item).__name__}')
        clean_name = item.strip()
        name_lower = clean_name.lower()
        if not name_lower:
            raise ValueError('Provider names cannot be empty strings.')
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
        raise ValueError(f'Priorities array must have exactly {len(all_providers)} providers.')
    cursor = _DB_CONN.execute('SELECT id FROM ai_priorities LIMIT 1')
    row = cursor.fetchone()
    json_val = json.dumps(cleaned_order)
    if row:
        _DB_CONN.execute('UPDATE ai_priorities SET priorities = ? WHERE id = ?', (json_val, row[0]))
    else:
        _DB_CONN.execute('INSERT INTO ai_priorities (priorities) VALUES (?)', (json_val,))
    _DB_CONN.commit()
    save_config_storage()
    logger.info(f'Updated LLM provider priorities: {cleaned_order}')
    return cleaned_order

def get_engine_workers() -> Dict[str, Any]:
    global _DB_CONN
    if _DB_CONN is None:
        init_config_storage()
    exists = _DB_CONN.execute("SELECT count(*) FROM sqlite_master WHERE type='table' AND name='engine_workers'").fetchone()[0]
    if not exists:
        return {
            'chat_workers': 1,
            'screenshot_extraction_workers': 1,
            'screenshot_summarization_workers': 1,
            'embedding_vector_store_workers': 1,
            'chat_workers_poll_time': 1.0,
            'screenshot_extraction_poll_time': 5.0,
            'screenshot_summarization_poll_time': 5.0,
            'embedding_vector_store_workers_poll_time': 1.0
        }
    cursor = _DB_CONN.execute('SELECT * FROM engine_workers LIMIT 1')
    row = cursor.fetchone()
    if not row:
        _DB_CONN.execute('''INSERT INTO engine_workers (
                chat_workers,
                screenshot_extraction_workers,
                screenshot_summarization_workers,
                embedding_vector_store_workers,
                chat_workers_poll_time,
                screenshot_extraction_poll_time,
                screenshot_summarization_poll_time,
                embedding_vector_store_workers_poll_time
            ) VALUES (1, 1, 1, 1, 1.0, 5.0, 5.0, 1.0)''')
        _DB_CONN.commit()
        save_config_storage()
        return {
            'chat_workers': 1,
            'screenshot_extraction_workers': 1,
            'screenshot_summarization_workers': 1,
            'embedding_vector_store_workers': 1,
            'chat_workers_poll_time': 1.0,
            'screenshot_extraction_poll_time': 5.0,
            'screenshot_summarization_poll_time': 5.0,
            'embedding_vector_store_workers_poll_time': 1.0
        }
    col_names = [d[0].lower() for d in cursor.description]
    row_dict = dict(zip(col_names, row))
    chat_w = row_dict.get('chat_workers') or row_dict.get('llm_workers') or 1
    return {
        'chat_workers': int(chat_w),
        'screenshot_extraction_workers': int(row_dict.get('screenshot_extraction_workers') or 1),
        'screenshot_summarization_workers': int(row_dict.get('screenshot_summarization_workers') or 1),
        'embedding_vector_store_workers': int(row_dict.get('embedding_vector_store_workers') or 1),
        'chat_workers_poll_time': float(row_dict.get('chat_workers_poll_time') if row_dict.get('chat_workers_poll_time') is not None else (row_dict.get('llm_workers_poll_time') if row_dict.get('llm_workers_poll_time') is not None else 1.0)),
        'screenshot_extraction_poll_time': float(row_dict.get('screenshot_extraction_poll_time') if row_dict.get('screenshot_extraction_poll_time') is not None else 5.0),
        'screenshot_summarization_poll_time': float(row_dict.get('screenshot_summarization_poll_time') if row_dict.get('screenshot_summarization_poll_time') is not None else 5.0),
        'embedding_vector_store_workers_poll_time': float(row_dict.get('embedding_vector_store_workers_poll_time') if row_dict.get('embedding_vector_store_workers_poll_time') is not None else 1.0)
    }

def update_engine_workers(updates: Dict[str, Any]) -> Dict[str, Any]:
    global _DB_CONN
    if _DB_CONN is None:
        init_config_storage()
    if not isinstance(updates, dict):
        raise ValueError('Payload must be a dictionary or object containing worker settings.')
    current = get_engine_workers()
    alias_map = {
        'llm_workers': 'chat_workers',
        'llm_worker': 'chat_workers',
        'chat_worker': 'chat_workers',
        'llm_workers_poll_time': 'chat_workers_poll_time',
        'chat_poll_time': 'chat_workers_poll_time',
        'chat_worker_poll_time': 'chat_workers_poll_time',
        'extraction_workers': 'screenshot_extraction_workers',
        'memory_extraction_workers': 'screenshot_extraction_workers',
        'summarization_workers': 'screenshot_summarization_workers',
        'engine_summarization_workers': 'screenshot_summarization_workers',
        'vector_store_workers': 'embedding_vector_store_workers',
        'embedding_workers': 'embedding_vector_store_workers',
        'vector_workers': 'embedding_vector_store_workers',
        'extraction_poll_time': 'screenshot_extraction_poll_time',
        'summarization_poll_time': 'screenshot_summarization_poll_time',
        'vector_store_poll_time': 'embedding_vector_store_workers_poll_time',
        'embedding_poll_time': 'embedding_vector_store_workers_poll_time',
        'vector_poll_time': 'embedding_vector_store_workers_poll_time',
        'embedding_vector_store_poll_time': 'embedding_vector_store_workers_poll_time'
    }
    normalized_updates = {}
    for k, v in updates.items():
        canonical = alias_map.get(k.lower(), k.lower())
        normalized_updates[canonical] = v
    new_config = dict(current)
    int_fields = ['chat_workers', 'screenshot_extraction_workers', 'screenshot_summarization_workers']
    for field in int_fields:
        if field in normalized_updates and normalized_updates[field] is not None:
            val = normalized_updates[field]
            if isinstance(val, bool) or not isinstance(val, int):
                raise ValueError(f'{field} must be an integer between 1 and 50.')
            if val < 1 or val > 50:
                raise ValueError(f'{field} must be an integer between 1 and 50 inclusive.')
            new_config[field] = val
    if 'embedding_vector_store_workers' in normalized_updates and normalized_updates['embedding_vector_store_workers'] is not None:
        val = normalized_updates['embedding_vector_store_workers']
        if isinstance(val, bool) or not isinstance(val, int):
            raise ValueError('embedding_vector_store_workers must be an integer of at least 1.')
        if val < 1:
            raise ValueError('embedding_vector_store_workers must be an integer of at least 1.')
        new_config['embedding_vector_store_workers'] = val
    float_fields = ['chat_workers_poll_time', 'screenshot_extraction_poll_time', 'screenshot_summarization_poll_time']
    for field in float_fields:
        if field in normalized_updates and normalized_updates[field] is not None:
            val = normalized_updates[field]
            if isinstance(val, bool) or not isinstance(val, (int, float)):
                raise ValueError(f'{field} must be a number between 0.1 and 1800 seconds.')
            val_f = float(val)
            if val_f < 0.1 or val_f > 1800.0:
                raise ValueError(f'{field} must be between 0.1 and 1800 seconds inclusive.')
            new_config[field] = val_f
    if 'embedding_vector_store_workers_poll_time' in normalized_updates and normalized_updates['embedding_vector_store_workers_poll_time'] is not None:
        val = normalized_updates['embedding_vector_store_workers_poll_time']
        if isinstance(val, bool) or not isinstance(val, (int, float)):
            raise ValueError('embedding_vector_store_workers_poll_time must be a positive number.')
        val_f = float(val)
        if val_f <= 0.0:
            raise ValueError('embedding_vector_store_workers_poll_time must be a positive number.')
        new_config['embedding_vector_store_workers_poll_time'] = val_f
    cursor = _DB_CONN.execute('SELECT id FROM engine_workers LIMIT 1')
    row = cursor.fetchone()
    if row:
        _DB_CONN.execute('''UPDATE engine_workers SET
                chat_workers = ?,
                screenshot_extraction_workers = ?,
                screenshot_summarization_workers = ?,
                embedding_vector_store_workers = ?,
                chat_workers_poll_time = ?,
                screenshot_extraction_poll_time = ?,
                screenshot_summarization_poll_time = ?,
                embedding_vector_store_workers_poll_time = ?
            WHERE id = ?''', (
                new_config['chat_workers'],
                new_config['screenshot_extraction_workers'],
                new_config['screenshot_summarization_workers'],
                new_config['embedding_vector_store_workers'],
                new_config['chat_workers_poll_time'],
                new_config['screenshot_extraction_poll_time'],
                new_config['screenshot_summarization_poll_time'],
                new_config['embedding_vector_store_workers_poll_time'],
                row[0]
            ))
    else:
        _DB_CONN.execute('''INSERT INTO engine_workers (
                chat_workers,
                screenshot_extraction_workers,
                screenshot_summarization_workers,
                embedding_vector_store_workers,
                chat_workers_poll_time,
                screenshot_extraction_poll_time,
                screenshot_summarization_poll_time,
                embedding_vector_store_workers_poll_time
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)''', (
                new_config['chat_workers'],
                new_config['screenshot_extraction_workers'],
                new_config['screenshot_summarization_workers'],
                new_config['embedding_vector_store_workers'],
                new_config['chat_workers_poll_time'],
                new_config['screenshot_extraction_poll_time'],
                new_config['screenshot_summarization_poll_time'],
                new_config['embedding_vector_store_workers_poll_time']
            ))
    _DB_CONN.commit()
    save_config_storage()
    logger.info(f'Updated engine workers configuration: {new_config}')
    return new_config

def _encode_cursor(data: Dict[str, Any]) -> str:
    raw = json.dumps(data)
    return base64.urlsafe_b64encode(raw.encode('utf-8')).decode('utf-8')

def _decode_cursor(cursor_str: Optional[str]) -> Optional[Dict[str, Any]]:
    if not cursor_str:
        return None
    try:
        raw = base64.urlsafe_b64decode(cursor_str.encode('utf-8')).decode('utf-8')
        return json.loads(raw)
    except Exception:
        return {"created_at": cursor_str}

def save_chat_message(
    session_id: str,
    role: str,
    content: str,
    chat_name: Optional[str] = None,
    message_id: Optional[str] = None,
    created_at: Optional[str] = None,
) -> Dict[str, Any]:
    global _DB_CONN
    if _DB_CONN is None:
        init_config_storage()
    if role not in ('user', 'ai'):
        raise ValueError(f"Invalid role '{role}'. Role must be either 'user' or 'ai'.")
    if not session_id or not session_id.strip():
        session_id = str(uuid.uuid4())
    else:
        session_id = session_id.strip()

    msg_id = (message_id or str(uuid.uuid4())).strip()
    if not created_at:
        created_at = datetime.now(timezone.utc).strftime('%Y-%m-%d %H:%M:%S')

    clean_chat_name = chat_name.strip() if chat_name and chat_name.strip() else None

    # If chat_name is provided, also backfill/update existing messages for this session
    if clean_chat_name:
        _DB_CONN.execute(
            "UPDATE chats SET chat_name = ? WHERE session_id = ? AND (chat_name IS NULL OR chat_name = '')",
            (clean_chat_name, session_id)
        )
    else:
        # Inherit session's existing chat_name if previously named
        existing_name_row = _DB_CONN.execute(
            "SELECT chat_name FROM chats WHERE session_id = ? AND chat_name IS NOT NULL AND trim(chat_name) != '' LIMIT 1",
            (session_id,)
        ).fetchone()
        if existing_name_row:
            clean_chat_name = existing_name_row[0]

    # Strict deduplication check: never store duplicate message in the same session
    existing_row = _DB_CONN.execute(
        """
        SELECT id, session_id, chat_name, role, content, created_at
        FROM chats
        WHERE session_id = ? AND role = ? AND content = ?
        ORDER BY created_at DESC, id DESC
        LIMIT 1
        """,
        (session_id, role, content)
    ).fetchone()
    if existing_row:
        # Check if this exact message is already the latest message of this role in the session
        latest_role_row = _DB_CONN.execute(
            """
            SELECT id, role, content FROM chats
            WHERE session_id = ? AND role = ?
            ORDER BY created_at DESC, id DESC
            LIMIT 1
            """,
            (session_id, role)
        ).fetchone()
        if latest_role_row and latest_role_row[2] == content:
            return {
                "id": existing_row[0],
                "session_id": existing_row[1],
                "chat_name": existing_row[2] or clean_chat_name,
                "role": existing_row[3],
                "content": existing_row[4],
                "created_at": existing_row[5],
            }
        # Also return existing if saved within 120 seconds
        existing_ts = existing_row[5]
        try:
            ex_dt = datetime.strptime(existing_ts, '%Y-%m-%d %H:%M:%S').replace(tzinfo=timezone.utc)
            now_dt = datetime.strptime(created_at, '%Y-%m-%d %H:%M:%S').replace(tzinfo=timezone.utc)
            if abs((now_dt - ex_dt).total_seconds()) <= 120:
                return {
                    "id": existing_row[0],
                    "session_id": existing_row[1],
                    "chat_name": existing_row[2] or clean_chat_name,
                    "role": existing_row[3],
                    "content": existing_row[4],
                    "created_at": existing_row[5],
                }
        except Exception:
            return {
                "id": existing_row[0],
                "session_id": existing_row[1],
                "chat_name": existing_row[2] or clean_chat_name,
                "role": existing_row[3],
                "content": existing_row[4],
                "created_at": existing_row[5],
            }

    _DB_CONN.execute(
        """
        INSERT INTO chats (id, session_id, chat_name, role, content, created_at)
        VALUES (?, ?, ?, ?, ?, ?)
        """,
        (msg_id, session_id, clean_chat_name, role, content, created_at)
    )
    _DB_CONN.commit()
    save_config_storage()

    return {
        "id": msg_id,
        "session_id": session_id,
        "chat_name": clean_chat_name,
        "role": role,
        "content": content,
        "created_at": created_at,
    }

def get_chat_sessions(
    limit: int = 10,
    offset: int = 0,
    cursor: Optional[str] = None,
    page: Optional[int] = None,
) -> Dict[str, Any]:
    global _DB_CONN
    if _DB_CONN is None:
        init_config_storage()

    effective_limit = max(1, min(limit, 100))

    # Total distinct sessions
    total_row = _DB_CONN.execute("SELECT count(DISTINCT session_id) FROM chats").fetchone()
    total_items = total_row[0] if total_row else 0
    total_pages = max(1, math.ceil(total_items / effective_limit))

    cursor_data = _decode_cursor(cursor)

    if cursor_data and "created_at" in cursor_data:
        cur_ts = cursor_data["created_at"]
        cur_sid = cursor_data.get("session_id", "")
        query = """
            WITH session_summaries AS (
                SELECT session_id,
                       COALESCE(MAX(CASE WHEN chat_name IS NOT NULL AND chat_name != '' THEN chat_name ELSE NULL END), session_id) as chat_name,
                       MAX(created_at) as latest_created_at,
                       count(*) as message_count
                FROM chats
                GROUP BY session_id
            )
            SELECT session_id, chat_name, latest_created_at, message_count
            FROM session_summaries
            WHERE (latest_created_at < ?) OR (latest_created_at = ? AND session_id < ?)
            ORDER BY latest_created_at DESC, session_id DESC
            LIMIT ?
        """
        cursor_exec = _DB_CONN.execute(query, (cur_ts, cur_ts, cur_sid, effective_limit))
        rows = cursor_exec.fetchall()

        if page is not None and page >= 1:
            current_page = page
        else:
            preceding_query = """
                WITH session_summaries AS (
                    SELECT session_id, MAX(created_at) as latest_created_at
                    FROM chats
                    GROUP BY session_id
                )
                SELECT count(*)
                FROM session_summaries
                WHERE (latest_created_at > ?) OR (latest_created_at = ? AND session_id >= ?)
            """
            preceding_row = _DB_CONN.execute(preceding_query, (cur_ts, cur_ts, cur_sid)).fetchone()
            preceding_count = preceding_row[0] if preceding_row else 0
            current_page = (preceding_count // effective_limit) + 1
    else:
        effective_page = page if page is not None and page >= 1 else 1
        calc_offset = offset if offset > 0 else (effective_page - 1) * effective_limit
        current_page = effective_page

        query = """
            WITH session_summaries AS (
                SELECT session_id,
                       COALESCE(MAX(CASE WHEN chat_name IS NOT NULL AND chat_name != '' THEN chat_name ELSE NULL END), session_id) as chat_name,
                       MAX(created_at) as latest_created_at,
                       count(*) as message_count
                FROM chats
                GROUP BY session_id
            )
            SELECT session_id, chat_name, latest_created_at, message_count
            FROM session_summaries
            ORDER BY latest_created_at DESC, session_id DESC
            LIMIT ? OFFSET ?
        """
        cursor_exec = _DB_CONN.execute(query, (effective_limit, calc_offset))
        rows = cursor_exec.fetchall()

    sessions: List[Dict[str, Any]] = []
    for r in rows:
        sessions.append({
            "session_id": r[0],
            "chat_name": r[1] or r[0],
            "latest_created_at": r[2],
            "created_at": r[2],
            "message_count": r[3],
        })

    has_more = current_page < total_pages and len(sessions) > 0
    next_cursor = None
    if has_more and sessions:
        last = sessions[-1]
        next_cursor = _encode_cursor({
            "created_at": last["latest_created_at"],
            "session_id": last["session_id"],
        })

    return {
        "sessions": sessions,
        "total_pages": total_pages,
        "current_page": current_page,
        "total_items": total_items,
        "limit": effective_limit,
        "next_cursor": next_cursor,
        "has_more": has_more,
    }

def get_chats_by_session(
    session_id: str,
    limit: int = 30,
    offset: int = 0,
    cursor: Optional[str] = None,
    page: Optional[int] = None,
) -> Dict[str, Any]:
    global _DB_CONN
    if _DB_CONN is None:
        init_config_storage()

    clean_sid = (session_id or "").strip()
    effective_limit = max(1, min(limit, 500))

    total_row = _DB_CONN.execute("SELECT count(*) FROM chats WHERE session_id = ?", (clean_sid,)).fetchone()
    total_messages = total_row[0] if total_row else 0
    total_pages = max(1, math.ceil(total_messages / effective_limit))

    cursor_data = _decode_cursor(cursor)

    if cursor_data and "created_at" in cursor_data:
        cur_ts = cursor_data["created_at"]
        cur_id = cursor_data.get("id", "")
        query = """
            SELECT id, session_id, chat_name, role, content, created_at
            FROM chats
            WHERE session_id = ?
              AND ((created_at > ?) OR (created_at = ? AND id > ?))
            ORDER BY created_at ASC, id ASC
            LIMIT ?
        """
        cursor_exec = _DB_CONN.execute(query, (clean_sid, cur_ts, cur_ts, cur_id, effective_limit))
        rows = cursor_exec.fetchall()

        if page is not None and page >= 1:
            current_page = page
        else:
            preceding_query = """
                SELECT count(*) FROM chats
                WHERE session_id = ?
                  AND ((created_at < ?) OR (created_at = ? AND id <= ?))
            """
            preceding_row = _DB_CONN.execute(preceding_query, (clean_sid, cur_ts, cur_ts, cur_id)).fetchone()
            preceding_count = preceding_row[0] if preceding_row else 0
            current_page = (preceding_count // effective_limit) + 1
    else:
        effective_page = page if page is not None and page >= 1 else 1
        calc_offset = offset if offset > 0 else (effective_page - 1) * effective_limit
        current_page = effective_page

        query = """
            SELECT id, session_id, chat_name, role, content, created_at
            FROM chats
            WHERE session_id = ?
            ORDER BY created_at ASC, id ASC
            LIMIT ? OFFSET ?
        """
        cursor_exec = _DB_CONN.execute(query, (clean_sid, effective_limit, calc_offset))
        rows = cursor_exec.fetchall()

    messages: List[Dict[str, Any]] = []
    for r in rows:
        messages.append({
            "id": r[0],
            "session_id": r[1],
            "chat_name": r[2],
            "role": r[3],
            "content": r[4],
            "created_at": r[5],
        })

    has_more = current_page < total_pages and len(messages) > 0
    next_cursor = None
    if has_more and messages:
        last = messages[-1]
        next_cursor = _encode_cursor({
            "created_at": last["created_at"],
            "id": last["id"],
        })

    session_name_row = _DB_CONN.execute(
        "SELECT chat_name FROM chats WHERE session_id = ? AND chat_name IS NOT NULL AND trim(chat_name) != '' LIMIT 1",
        (clean_sid,)
    ).fetchone()
    current_chat_name = session_name_row[0] if session_name_row else None

    return {
        "session_id": clean_sid,
        "chat_name": current_chat_name,
        "messages": messages,
        "total_pages": total_pages,
        "current_page": current_page,
        "total_messages": total_messages,
        "limit": effective_limit,
        "next_cursor": next_cursor,
        "has_more": has_more,
    }

def update_chat_session_name(session_id: str, chat_name: str) -> bool:
    global _DB_CONN
    if _DB_CONN is None:
        init_config_storage()
    clean_sid = (session_id or "").strip()
    clean_name = (chat_name or "").strip()
    if not clean_sid:
        return False
    cursor = _DB_CONN.execute(
        "UPDATE chats SET chat_name = ? WHERE session_id = ?",
        (clean_name, clean_sid)
    )
    _DB_CONN.commit()
    save_config_storage()
    return cursor.rowcount > 0

def get_chat_session_name(session_id: str) -> Optional[str]:
    global _DB_CONN
    if _DB_CONN is None:
        init_config_storage()
    clean_sid = (session_id or "").strip()
    row = _DB_CONN.execute(
        "SELECT chat_name FROM chats WHERE session_id = ? AND chat_name IS NOT NULL AND trim(chat_name) != '' LIMIT 1",
        (clean_sid,)
    ).fetchone()
    return row[0] if row else None

def delete_chat_session(session_id: str) -> bool:
    global _DB_CONN
    if _DB_CONN is None:
        init_config_storage()
    clean_sid = (session_id or "").strip()
    _DB_CONN.execute("DELETE FROM chats WHERE session_id = ?", (clean_sid,))
    _DB_CONN.commit()
    save_config_storage()
    return True

def delete_all_chats() -> int:
    global _DB_CONN
    if _DB_CONN is None:
        init_config_storage()
    cursor = _DB_CONN.execute("DELETE FROM chats")
    deleted_count = cursor.rowcount
    _DB_CONN.commit()
    save_config_storage()
    return deleted_count


# ==============================================================================
# Daily Suggestions Storage
# ==============================================================================

def parse_completed_column(raw: Any) -> List[int]:
    """Parses completed column into a unique, sorted list of integer indices."""
    if not raw:
        return []
    if isinstance(raw, list):
        return sorted(list(set(int(x) for x in raw if str(x).strip().isdigit())))
    s = str(raw).strip()
    if not s:
        return []
    if s.startswith("["):
        try:
            parsed = json.loads(s)
            if isinstance(parsed, list):
                return sorted(list(set(int(x) for x in parsed if str(x).strip().isdigit())))
        except Exception:
            pass
    indices = []
    for part in s.split(","):
        p = part.strip()
        if p.isdigit():
            indices.append(int(p))
    return sorted(list(set(indices)))


def format_completed_column(indices: Any) -> str:
    """Formats indices into comma-separated string."""
    cleaned = parse_completed_column(indices)
    return ",".join(str(i) for i in cleaned)


def _format_daily_suggestion_row(row: Any, cursor_description: Any) -> Dict[str, Any]:
    if not row:
        return {}
    cols = [d[0].lower() for d in cursor_description]
    raw_dict = dict(zip(cols, row))

    def _parse_json(val: Any, default: Any):
        if val is None or val == "":
            return default
        if isinstance(val, (dict, list)):
            return val
        try:
            return json.loads(val)
        except Exception:
            return default

    suggestions = _parse_json(raw_dict.get("suggestions"), [])
    completed_indices = parse_completed_column(raw_dict.get("completed"))
    weather = _parse_json(raw_dict.get("weather"), {})
    news = _parse_json(raw_dict.get("news"), [])
    music = _parse_json(raw_dict.get("music"), [])
    entertainment = _parse_json(raw_dict.get("entertainment"), [])

    return {
        "id": raw_dict.get("id"),
        "date_suggestions": raw_dict.get("date_suggestions"),
        "suggestions": suggestions,
        "completed": completed_indices,
        "date_weather": raw_dict.get("date_weather"),
        "weather": weather,
        "date_news": raw_dict.get("date_news"),
        "news": news,
        "date_music": raw_dict.get("date_music"),
        "music": music,
        "date_entertainment": raw_dict.get("date_entertainment"),
        "entertainment": entertainment,
    }


def get_latest_daily_suggestions() -> Optional[Dict[str, Any]]:
    global _DB_CONN
    if _DB_CONN is None:
        init_config_storage()
    cursor = _DB_CONN.execute("SELECT * FROM daily_suggestions ORDER BY id DESC LIMIT 1")
    row = cursor.fetchone()
    if not row:
        return None
    return _format_daily_suggestion_row(row, cursor.description)


def find_daily_suggestions_entry_for_today(date_str: Optional[str] = None) -> Optional[Dict[str, Any]]:
    """
    Checks the daily_suggestions table for ANY entry with valid date_suggestions for today.
    If date_str is provided (e.g. 'YYYY-MM-DD'), checks if date_suggestions starts with date_str.
    Also checks today's UTC date and local system date prefixes.
    Returns the matching record dict if found, or None if no entry with date_suggestions exists for today.
    """
    global _DB_CONN
    if _DB_CONN is None:
        init_config_storage()
    cursor = _DB_CONN.execute(
        "SELECT * FROM daily_suggestions WHERE date_suggestions IS NOT NULL AND date_suggestions != '' ORDER BY id DESC"
    )
    rows = cursor.fetchall()
    if not rows:
        return None

    target_prefixes = set()
    if date_str and str(date_str).strip():
        target_prefixes.add(str(date_str).strip())
    else:
        target_prefixes.add(datetime.now(timezone.utc).strftime("%Y-%m-%d"))
        target_prefixes.add(datetime.now().strftime("%Y-%m-%d"))

    for r in rows:
        item = _format_daily_suggestion_row(r, cursor.description)
        date_sugg = str(item.get("date_suggestions") or "").strip()
        suggestions = item.get("suggestions") or []
        if not date_sugg or not suggestions:
            continue
        for prefix in target_prefixes:
            if date_sugg.startswith(prefix):
                return item

    return None


def get_previous_daily_suggestions(skip_today: bool = False) -> Optional[Dict[str, Any]]:
    """Returns the latest record that has content, optionally skipping today's record."""
    global _DB_CONN
    if _DB_CONN is None:
        init_config_storage()
    cursor = _DB_CONN.execute("SELECT * FROM daily_suggestions ORDER BY id DESC LIMIT 10")
    rows = cursor.fetchall()
    if not rows:
        return None
    now_date_str = datetime.now(timezone.utc).strftime("%Y-%m-%d")
    for r in rows:
        item = _format_daily_suggestion_row(r, cursor.description)
        has_content = bool(item.get("suggestions") or item.get("weather") or item.get("news"))
        if not has_content:
            continue
        if skip_today:
            ts_str = str(item.get("date_suggestions") or item.get("date_weather") or item.get("date_news") or "")
            if ts_str.startswith(now_date_str):
                continue
        return item
    return None


def get_daily_suggestions_history(days: int = 14) -> List[Dict[str, Any]]:
    global _DB_CONN
    if _DB_CONN is None:
        init_config_storage()
    cursor = _DB_CONN.execute(
        "SELECT * FROM daily_suggestions ORDER BY id DESC LIMIT ?",
        (max(1, int(days)),)
    )
    rows = cursor.fetchall()
    return [_format_daily_suggestion_row(r, cursor.description) for r in rows]


def save_daily_suggestions(updates: Dict[str, Any], record_id: Optional[int] = None) -> Dict[str, Any]:
    """
    Upserts daily suggestions record.
    If record_id is given, updates that specific record.
    Otherwise, checks if a record for today (same calendar date) exists:
      - If today's record exists, updates it.
      - If no record exists or latest record is from a previous day, inserts a new record.
    """
    global _DB_CONN
    if _DB_CONN is None:
        init_config_storage()

    target_id: Optional[int] = record_id
    now_utc = datetime.now(timezone.utc)
    now_date_str = now_utc.strftime("%Y-%m-%d")

    if target_id is None:
        # Check if ANY row in daily_suggestions matches today
        cursor = _DB_CONN.execute(
            "SELECT id FROM daily_suggestions "
            "WHERE date_suggestions LIKE ? OR date_weather LIKE ? OR date_news LIKE ? "
            "ORDER BY id DESC LIMIT 1",
            (f"{now_date_str}%", f"{now_date_str}%", f"{now_date_str}%")
        )
        matched = cursor.fetchone()
        if matched:
            target_id = matched[0]
        else:
            cursor = _DB_CONN.execute("SELECT id, date_suggestions, date_weather, date_news FROM daily_suggestions ORDER BY id DESC LIMIT 1")
            latest = cursor.fetchone()
            if latest:
                latest_id, d_sugg, d_weath, d_news = latest
                for ts in (d_sugg, d_weath, d_news):
                    if ts and str(ts).strip().startswith(now_date_str):
                        target_id = latest_id
                        break

    # If still None, insert a new record for today
    if target_id is None:
        cursor = _DB_CONN.execute("INSERT INTO daily_suggestions DEFAULT VALUES")
        target_id = cursor.lastrowid
        _DB_CONN.commit()

    set_clauses: List[str] = []
    params: List[Any] = []

    valid_cols = {
        "date_suggestions", "suggestions", "completed",
        "date_weather", "weather",
        "date_news", "news",
        "date_music", "music",
        "date_entertainment", "entertainment"
    }

    for k, v in updates.items():
        k_clean = k.lower().strip()
        if k_clean == "whether":
            k_clean = "weather"
        elif k_clean == "date_whether":
            k_clean = "date_weather"

        if k_clean not in valid_cols:
            continue

        if k_clean in ("suggestions", "weather", "news", "music", "entertainment"):
            if isinstance(v, (dict, list)):
                val_str = json.dumps(v, ensure_ascii=False)
            else:
                val_str = str(v) if v is not None else ("{}" if k_clean == "weather" else "[]")
            set_clauses.append(f"{k_clean} = ?")
            params.append(val_str)
        elif k_clean == "completed":
            set_clauses.append(f"{k_clean} = ?")
            params.append(format_completed_column(v))
        else:
            set_clauses.append(f"{k_clean} = ?")
            params.append(str(v) if v is not None else None)

    if set_clauses:
        params.append(target_id)
        sql = f"UPDATE daily_suggestions SET {', '.join(set_clauses)} WHERE id = ?"
        _DB_CONN.execute(sql, tuple(params))
        _DB_CONN.commit()
        save_config_storage()

    cursor = _DB_CONN.execute("SELECT * FROM daily_suggestions WHERE id = ?", (target_id,))
    row = cursor.fetchone()
    return _format_daily_suggestion_row(row, cursor.description) if row else {}


def update_suggestion_completion(index: int, completed: bool, record_id: Optional[int] = None) -> Dict[str, Any]:
    """
    Updates completion state of suggestion by index:
      - If completed is True: adds index to completed column (preventing duplicates)
      - If completed is False: removes index from completed column
    Persists to Vault storage.
    """
    global _DB_CONN
    if _DB_CONN is None:
        init_config_storage()

    target_id: Optional[int] = record_id
    if target_id is None:
        cursor = _DB_CONN.execute(
            "SELECT id, completed FROM daily_suggestions WHERE date_suggestions IS NOT NULL AND date_suggestions != '' ORDER BY id DESC LIMIT 1"
        )
        row_with_sugg = cursor.fetchone()
        if row_with_sugg:
            target_id = row_with_sugg[0]
            current_completed_raw = row_with_sugg[1]
        else:
            cursor = _DB_CONN.execute("SELECT id, completed FROM daily_suggestions ORDER BY id DESC LIMIT 1")
            latest = cursor.fetchone()
            if not latest:
                cursor = _DB_CONN.execute("INSERT INTO daily_suggestions DEFAULT VALUES")
                target_id = cursor.lastrowid
                _DB_CONN.commit()
                current_completed_raw = ""
            else:
                target_id = latest[0]
                current_completed_raw = latest[1]
    else:
        cursor = _DB_CONN.execute("SELECT completed FROM daily_suggestions WHERE id = ?", (target_id,))
        row = cursor.fetchone()
        current_completed_raw = row[0] if row else ""

    completed_indices = set(parse_completed_column(current_completed_raw))

    idx = int(index)
    if completed:
        completed_indices.add(idx)
    else:
        completed_indices.discard(idx)

    formatted_str = ",".join(str(i) for i in sorted(completed_indices))
    _DB_CONN.execute("UPDATE daily_suggestions SET completed = ? WHERE id = ?", (formatted_str, target_id))
    _DB_CONN.commit()
    save_config_storage()

    return {
        "id": target_id,
        "completed": sorted(list(completed_indices)),
        "status": "success",
    }




