from __future__ import annotations

import importlib.util
import json
import os
import shutil
import sqlite3
import tempfile
from datetime import date, datetime, timedelta
from pathlib import Path
import pytest
from fastapi.testclient import TestClient

import sys

# Ensure Vault directory has highest precedence in sys.path
vault_dir = Path(__file__).resolve().parent.parent
sys.path = [p for p in sys.path if p != str(vault_dir)]
sys.path.insert(0, str(vault_dir))

import config
import crypto
import config_storage
import log_manager
from app import create_app


@pytest.fixture(autouse=True)
def setup_isolated_env(monkeypatch):
    """
    Sets up an isolated temporary directory for SYSTEM_DIR and LOGS_DIR for each test,
    resets in-memory keys, and isolates configuration databases.
    """
    temp_dir = tempfile.mkdtemp(prefix="mira_vault_test_")
    system_dir = Path(temp_dir) / "system"
    logs_dir = system_dir / "logs"

    system_dir.mkdir(parents=True, exist_ok=True)
    logs_dir.mkdir(parents=True, exist_ok=True)

    monkeypatch.setattr(config, "SYSTEM_DIR", system_dir)
    monkeypatch.setattr(config, "LOGS_DIR", logs_dir)
    monkeypatch.setattr(config, "KEYRING_SERVICE_NAME", "MIRA_VAULT_TEST")
    monkeypatch.setattr(config, "KEYRING_KEY_NAME", "test_master_key")
    monkeypatch.setattr(config, "SCHEMA_FILE_PATH", vault_dir / "schema.sql")

    # Reset in-memory key state and database connection
    crypto._DERIVED_KEY = None
    crypto._CREDENTIAL_KEY = None
    config_storage._DB_CONN = None
    config_storage._PARSED_SCHEMA = {}

    yield {
        "temp_dir": temp_dir,
        "system_dir": system_dir,
        "logs_dir": logs_dir
    }

    shutil.rmtree(temp_dir, ignore_errors=True)


def test_key_security_and_internal_derivation():
    """
    Test that keys are strictly internal to the Vault module,
    never exposed through public exports or endpoints.
    """
    import Vault
    assert not hasattr(Vault, "get_derived_key")

    crypto.init_encryption_key()
    internal_key = crypto._get_internal_key()
    assert isinstance(internal_key, bytes)
    assert len(internal_key) == 32

    manual_derived = crypto.derive_key_from_credential(
        crypto._CREDENTIAL_KEY,
        config.KEY_PREFIX,
        config.KEY_SUFFIX
    )
    assert manual_derived == internal_key


def test_xchacha20poly1305_encryption_roundtrip():
    """
    Test XChaCha20-Poly1305 encryption and decryption using internal key.
    """
    test_payload = b"Sensitive log content with unicode: \xe2\x9c\x93"
    encrypted = crypto.encrypt_log_data(test_payload)
    assert encrypted != test_payload
    assert len(encrypted) > len(test_payload)

    decrypted = crypto.decrypt_log_data(encrypted)
    assert decrypted == test_payload


def test_encryption_tampering_detection():
    """
    Test that modifying any byte of ciphertext causes decryption failure (Poly1305 MAC).
    """
    encrypted = bytearray(crypto.encrypt_log_data(b"secret message"))
    encrypted[-1] ^= 0x01

    with pytest.raises(Exception):
        crypto.decrypt_log_data(bytes(encrypted))


def test_schema_parsing_and_table_creation():
    """
    Verify central SQL schema file parsing and automatic creation of separate SQL tables
    for different configuration groups ('logs' and 'message_broker').
    """
    crypto.init_encryption_key()
    config_storage.init_config_storage()

    logs_cfg = config_storage.get_configuration("logs")
    assert logs_cfg["retention_period"] == 30
    assert logs_cfg["show_logs_operator"] is True
    assert logs_cfg["show_logs_engine"] is True
    assert logs_cfg["show_logs_memory"] is True
    assert logs_cfg["show_logs_client"] is True
    assert logs_cfg["show_logs_message_broker"] is True
    assert logs_cfg["store_logs_operator"] is True

    mb_cfg = config_storage.get_configuration("message_broker")
    assert mb_cfg["REDIS_HOST"] == "localhost"
    assert mb_cfg["REDIS_PORT"] == 6379
    assert mb_cfg["REDIS_DB"] == 0
    assert mb_cfg["REDIS_PASSWORD"] is None
    assert mb_cfg["SERVER_HOST"] == "127.0.0.1"
    assert mb_cfg["SERVER_PORT"] == 8000
    assert mb_cfg["SERVER_RELOAD"] is False


def test_schema_synchronization_add_and_drop_columns(monkeypatch, setup_isolated_env):
    """
    Verify that on startup, existing tables are synchronized by:
    1. Adding missing columns.
    2. Dropping extra/removed columns.
    """
    crypto.init_encryption_key()

    # Pre-populate an in-memory DB with an outdated schema (has extra_col, missing show_logs_operator)
    raw_conn = sqlite3.connect(":memory:")
    raw_conn.execute("""
        CREATE TABLE logs (
            id INTEGER PRIMARY KEY,
            retention_period INTEGER DEFAULT 20,
            legacy_col TEXT DEFAULT 'old',
            show_logs_engine BOOLEAN DEFAULT 1
        )
    """)
    raw_conn.execute("INSERT INTO logs (id, retention_period, legacy_col) VALUES (1, 20, 'old_value')")
    raw_conn.commit()

    # Save as encrypted DB
    enc_path = config_storage.get_encrypted_db_path()
    raw_bytes = raw_conn.serialize()
    enc_path.write_bytes(crypto.encrypt_log_data(raw_bytes))

    # Run initialization to synchronize
    config_storage.init_config_storage()

    # Verify synchronization
    synced_cfg = config_storage.get_configuration("logs")
    assert "legacy_col" not in synced_cfg
    assert "show_logs_operator" in synced_cfg
    assert synced_cfg["show_logs_operator"] is True
    # Preserves existing values of retained columns
    assert synced_cfg["retention_period"] == 20


def test_config_encryption_at_rest():
    """
    Verify that the SQL configuration tables are encrypted at rest with XChaCha20-Poly1305.
    """
    crypto.init_encryption_key()
    config_storage.init_config_storage()

    enc_path = config_storage.get_encrypted_db_path()
    assert enc_path.exists()
    disk_bytes = enc_path.read_bytes()

    # Must be encrypted (not SQLite header)
    assert not disk_bytes.startswith(b"SQLite format 3")

    # Decrypting must reveal SQLite database
    decrypted = crypto.decrypt_log_data(disk_bytes)
    assert decrypted.startswith(b"SQLite format 3")


def test_get_config_api():
    """
    Test GET /config/{key} and GET /config API endpoints.
    """
    app = create_app()
    with TestClient(app) as client:
        # 1. GET /config/logs
        res_logs = client.get("/config/logs")
        assert res_logs.status_code == 200
        data_logs = res_logs.json()
        assert data_logs["retention_period"] == 30
        assert data_logs["show_logs_operator"] is True
        assert data_logs["store_logs_message_broker"] is True

        # 2. GET /config/message_broker
        res_mb = client.get("/config/message_broker")
        assert res_mb.status_code == 200
        data_mb = res_mb.json()
        assert data_mb["REDIS_HOST"] == "localhost"
        assert data_mb["SERVER_PORT"] == 8000

        # 3. GET /config?key=logs
        res_query = client.get("/config?key=logs")
        assert res_query.status_code == 200
        assert res_query.json() == data_logs

        # 4. Unknown key -> 404
        res_unknown = client.get("/config/unknown_group")
        assert res_unknown.status_code == 404


def test_logs_config_controls_terminal_and_file_logging(capsys):
    """
    Verify that Logs configuration controls:
    1. Terminal output via show_logs_<module_name>
    2. File logging via store_logs_<module_name>
    3. Log retention period
    """
    app = create_app()
    with TestClient(app) as client:
        # Case 1: show_logs=False, store_logs=True (set directly in encrypted SQL)
        config_storage.update_configuration("logs", {
            "retention_period": 30,
            "show_logs_operator": False,
            "store_logs_operator": True,
            "show_logs_engine": True,
            "store_logs_engine": False,
        })

        # Ingest operator log (show=False, store=True)
        capsys.readouterr()  # clear buffer
        res1 = client.post("/logs", json={
            "module_name": "operator",
            "data": "Operator capture silent"
        })
        assert res1.status_code == 201
        captured1 = capsys.readouterr().out
        assert "Operator capture silent" not in captured1  # Suppressed terminal output

        # Verify operator log WAS saved to file
        res_get1 = client.get("/logs?module_name=operator")
        assert len(res_get1.json()) == 1
        assert res_get1.json()[0]["data"] == "Operator capture silent"

        # Case 2: show_logs=True, store_logs=False for engine
        capsys.readouterr()  # clear buffer
        res2 = client.post("/logs", json={
            "module_name": "engine",
            "data": "Engine inference printed only"
        })
        assert res2.status_code == 201
        captured2 = capsys.readouterr().out
        assert "Engine inference printed only" in captured2  # Terminal output printed

        # Verify engine log was NOT saved to file
        res_get2 = client.get("/logs?module_name=engine")
        assert len(res_get2.json()) == 0


def test_message_broker_config_fetch_and_store(monkeypatch):
    """
    Verify that Message Broker fetches its configuration from Vault's GET API
    on startup, saves it locally in config.json, and uses the values for Redis and Server.
    """
    app = create_app()
    with TestClient(app) as client:
        # Update Message Broker configuration in Vault
        config_storage.update_configuration("message_broker", {
            "REDIS_PORT": 6380,
            "SERVER_PORT": 8080
        })

        # Load Message_Broker/config.py
        broker_cfg_path = vault_dir.parent / "Message_Broker" / "config.py"
        spec = importlib.util.spec_from_file_location("mb_config", str(broker_cfg_path))
        mb_config_mod = importlib.util.module_from_spec(spec)

        # Mock requests.get in mb_config_mod to route to TestClient
        import requests
        def mock_get(url, **kwargs):
            if "/config/message_broker" in url:
                return client.get("/config/message_broker")
            return requests.get(url, **kwargs)

        monkeypatch.setattr(requests, "get", mock_get)

        # Execute fetch_and_store_config
        spec.loader.exec_module(mb_config_mod)
        fetched = mb_config_mod.fetch_and_store_config("http://testserver")

        assert fetched["REDIS_PORT"] == 6380
        assert fetched["SERVER_PORT"] == 8080
        assert mb_config_mod.REDIS_PORT == 6380
        assert mb_config_mod.SERVER_PORT == 8080


def test_log_filename_parsing():
    """
    Verify strict parsing of the dd-mm-yyyy.jsonl date format.
    """
    assert log_manager.parse_log_filename("20-10-2026.jsonl") == date(2026, 10, 20)
    assert log_manager.parse_log_filename("01-01-2024.jsonl") == date(2024, 1, 1)

    # Invalid names / formats
    assert log_manager.parse_log_filename("2026-10-20.jsonl") is None
    assert log_manager.parse_log_filename("20/10/2026.jsonl") is None
    assert log_manager.parse_log_filename("32-01-2026.jsonl") is None
    assert log_manager.parse_log_filename("not_a_date.jsonl") is None
    assert log_manager.parse_log_filename("20-10-2026.txt") is None


def test_retention_policy_cleanup():
    """
    Verify that on scan, files with invalid formats or older than retention period are deleted.
    """
    log_manager.init_logs_directory()
    logs_dir = config.LOGS_DIR

    today = date(2026, 10, 20)

    # Create various test files
    valid_today = logs_dir / "20-10-2026.jsonl"
    valid_recent = logs_dir / "10-10-2026.jsonl"    # 10 days old (< 30)
    expired_old = logs_dir / "15-08-2026.jsonl"     # 66 days old (> 30)
    invalid_format1 = logs_dir / "app.log"
    invalid_format2 = logs_dir / "invalid_date.jsonl"
    invalid_date3 = logs_dir / "32-01-2026.jsonl"

    for f in [valid_today, valid_recent, expired_old, invalid_format1, invalid_format2, invalid_date3]:
        f.write_bytes(b"dummy data")

    # Run cleanup with 30 days retention
    stats = log_manager.clean_expired_and_invalid_logs(today=today, retention_days=30)

    assert stats["deleted_invalid_count"] == 3
    assert stats["deleted_expired_count"] == 1
    assert stats["retained_count"] == 2

    # Check files on disk
    assert valid_today.exists()
    assert valid_recent.exists()
    assert not expired_old.exists()
    assert not invalid_format1.exists()
    assert not invalid_format2.exists()
    assert not invalid_date3.exists()


def test_api_ingest_log_strict_string_and_message_response():
    """
    Test POST /logs:
    - Accepts module_name and string data
    - Returns strictly {"message": "Log added successfully"}
    - Rejects non-string data with 422
    """
    app = create_app()
    with TestClient(app) as client:
        # 1. Valid string payload
        valid_res = client.post("/logs", json={
            "module_name": "message_broker",
            "data": "Broker started on port 8000"
        })
        assert valid_res.status_code == 201
        assert valid_res.json() == {"message": "Log added successfully"}

        # 2. Reject non-string data (e.g., dict or int)
        invalid_res1 = client.post("/logs", json={
            "module_name": "message_broker",
            "data": {"status": "started"}
        })
        assert invalid_res1.status_code == 422

        invalid_res2 = client.post("/logs", json={
            "module_name": "message_broker",
            "data": 12345
        })
        assert invalid_res2.status_code == 422

        # 3. Reject missing fields
        invalid_res3 = client.post("/logs", json={"data": "missing module_name"})
        assert invalid_res3.status_code == 422


def test_api_get_logs_defaults_and_filters():
    """
    Test GET /logs:
    - Default module_name to 'all' and date range to today when not provided.
    - Filter by module_name.
    - Filter by date range (start_date, end_date).
    """
    app = create_app()
    with TestClient(app) as client:
        # Add logs for today from multiple modules
        client.post("/logs", json={"module_name": "operator", "data": "Operator capture event"})
        client.post("/logs", json={"module_name": "message_broker", "data": "Broker route event"})
        client.post("/logs", json={"module_name": "engine", "data": "Engine inference event"})

        # 1. Default GET /logs -> module_name='all', date_range=today
        res_default = client.get("/logs")
        assert res_default.status_code == 200
        logs = res_default.json()
        assert len(logs) == 3

        # 2. Filter by module_name
        res_filtered = client.get("/logs?module_name=message_broker")
        assert res_filtered.status_code == 200
        broker_logs = res_filtered.json()
        assert len(broker_logs) == 1
        assert broker_logs[0]["module_name"] == "message_broker"
        assert broker_logs[0]["data"] == "Broker route event"

        # Explicit module_name='all'
        res_all = client.get("/logs?module_name=all")
        assert res_all.status_code == 200
        assert len(res_all.json()) == 3

        # 3. Date range filter
        today_str = datetime.now().strftime("%d-%m-%Y")
        res_range = client.get(f"/logs?start_date={today_str}&end_date={today_str}")
        assert res_range.status_code == 200
        assert len(res_range.json()) == 3

        # Past date range with no logs
        res_empty = client.get("/logs?start_date=01-01-2020&end_date=02-01-2020")
        assert res_empty.status_code == 200
        assert res_empty.json() == []

        # Invalid start_date after end_date
        res_bad_range = client.get("/logs?start_date=25-10-2026&end_date=20-10-2026")
        assert res_bad_range.status_code == 400


def test_encryption_key_not_exposed_via_api():
    """
    Verify that Vault does not expose any API to retrieve the encryption key.
    """
    app = create_app()
    with TestClient(app) as client:
        res_key = client.get("/key/status")
        assert res_key.status_code == 404

        res_key2 = client.get("/key")
        assert res_key2.status_code == 404


def test_message_broker_vault_logger(monkeypatch):
    """
    Verify that Message Broker's vault_logger sends logs to Vault's Ingest Log API.
    """
    broker_logger_path = vault_dir.parent / "Message_Broker" / "vault_logger.py"
    spec = importlib.util.spec_from_file_location("vault_logger", str(broker_logger_path))
    vault_logger_mod = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(vault_logger_mod)
    broker_log = vault_logger_mod.log
    app = create_app()

    with TestClient(app) as client:
        import requests

        def mock_post(url, json=None, **kwargs):
            return client.post("/logs", json=json)

        monkeypatch.setattr(requests, "post", mock_post)

        broker_log("Message Broker connected to Redis stream successfully")

        res = client.get("/logs?module_name=message_broker")
        assert res.status_code == 200
        logs = res.json()
        assert len(logs) >= 1
        assert logs[-1]["module_name"] == "message_broker"
        assert logs[-1]["data"] == "Message Broker connected to Redis stream successfully"
