from __future__ import annotations

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

            count = _DB_CONN.execute(f"SELECT count(*) FROM {table_name}").fetchone()[0]
            if count == 0:
                _DB_CONN.execute(f"INSERT INTO {table_name} DEFAULT VALUES")
                _DB_CONN.commit()

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

    if normalized_key in _PARSED_SCHEMA:
        table_name = normalized_key
        table_spec = _PARSED_SCHEMA[table_name]
        types = table_spec["types"]

        cursor = _DB_CONN.execute(f"SELECT * FROM {table_name} LIMIT 1")
        row = cursor.fetchone()
        if not row:
            return {}

        col_names = [d[0] for d in cursor.description]
        result: Dict[str, Any] = {}

        for col_name, val in zip(col_names, row):
            if col_name.lower() == "id":
                continue

            col_type = types.get(col_name.lower(), "TEXT")
            if "BOOLEAN" in col_type:
                result[col_name] = bool(val) if val is not None else None
            elif "INT" in col_type:
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
    if normalized_table not in _PARSED_SCHEMA:
        raise KeyError(f"Unknown configuration group '{table_name}'")

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
