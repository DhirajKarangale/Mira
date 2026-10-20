from __future__ import annotations

import os
import shutil
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
import log_manager
from app import create_app


@pytest.fixture(autouse=True)
def setup_isolated_env(monkeypatch):
    """
    Sets up an isolated temporary directory for SYSTEM_DIR and LOGS_DIR for each test,
    and resets in-memory keys.
    """
    temp_dir = tempfile.mkdtemp(prefix="mira_vault_test_")
    system_dir = Path(temp_dir) / "system"
    logs_dir = system_dir / "logs"

    monkeypatch.setattr(config, "SYSTEM_DIR", system_dir)
    monkeypatch.setattr(config, "LOGS_DIR", logs_dir)
    monkeypatch.setattr(config, "KEYRING_SERVICE_NAME", "MIRA_VAULT_TEST")
    monkeypatch.setattr(config, "KEYRING_KEY_NAME", "test_master_key")

    # Reset in-memory key state
    crypto._DERIVED_KEY = None
    crypto._CREDENTIAL_KEY = None

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
    # Verify Vault.__all__ does not export key retrieval functions
    assert not hasattr(Vault, "get_derived_key")

    # Verify internal derivation works for Vault routines
    crypto.init_encryption_key()
    internal_key = crypto._get_internal_key()
    assert isinstance(internal_key, bytes)
    assert len(internal_key) == 32

    # Verify key derivation formula: prefix + credential + suffix
    manual_derived = crypto.derive_key_from_credential(
        crypto._CREDENTIAL_KEY,
        config.KEY_PREFIX,
        config.KEY_SUFFIX
    )
    assert manual_derived == internal_key


def test_xchacha20poly1305_encryption_roundtrip():
    """
    Test XChaCha20-Poly1305 encryption and decryption of arbitrary data using internal key.
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

    # Flip a byte in the ciphertext
    encrypted[-1] ^= 0x01

    with pytest.raises(Exception):
        crypto.decrypt_log_data(bytes(encrypted))


def test_logs_directory_creation():
    """
    Verify that the logs directory inside the system directory is created automatically.
    """
    assert not config.LOGS_DIR.exists()
    log_manager.init_logs_directory()
    assert config.LOGS_DIR.exists()
    assert config.LOGS_DIR.is_dir()


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
    Verify that on scan, files with invalid formats or older than LOG_RETENTION_DAYS are deleted.
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


@pytest.mark.asyncio
async def test_append_log_string_data_and_encryption():
    """
    Verify that logs accept string data, assign sequential id starting at 1,
    and encrypt the daily file on disk.
    """
    entry1 = await log_manager.append_log("operator", "Screen capture completed at 60fps")
    assert entry1["id"] == 1
    assert entry1["module_name"] == "operator"
    assert entry1["data"] == "Screen capture completed at 60fps"
    dt = datetime.strptime(entry1["timestamp"], "%d/%m/%YT%H:%M:%S")
    assert dt is not None

    entry2 = await log_manager.append_log("engine", "LLM inference completed successfully")
    assert entry2["id"] == 2
    assert entry2["module_name"] == "engine"
    assert entry2["data"] == "LLM inference completed successfully"

    entry3 = await log_manager.append_log("memory", "128 frames indexed in cache")
    assert entry3["id"] == 3

    # Verify physical file on disk is encrypted
    today_file = log_manager.get_log_filepath()
    assert today_file.exists()
    raw_disk_bytes = today_file.read_bytes()

    assert not raw_disk_bytes.startswith(b"[")
    assert not raw_disk_bytes.startswith(b"{")

    # Decrypt and verify contents
    decrypted_logs = log_manager.read_logs_from_file(today_file)
    assert len(decrypted_logs) == 3
    assert decrypted_logs[0]["id"] == 1
    assert decrypted_logs[1]["id"] == 2
    assert decrypted_logs[2]["id"] == 3


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
        # Endpoint /key/status must return 404 Not Found
        res_key = client.get("/key/status")
        assert res_key.status_code == 404

        res_key2 = client.get("/key")
        assert res_key2.status_code == 404


def test_message_broker_vault_logger(monkeypatch):
    """
    Verify that Message Broker's vault_logger sends logs to Vault's Ingest Log API.
    """
    import importlib.util
    broker_logger_path = vault_dir.parent / "Message_Broker" / "vault_logger.py"
    spec = importlib.util.spec_from_file_location("vault_logger", str(broker_logger_path))
    vault_logger_mod = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(vault_logger_mod)
    broker_log = vault_logger_mod.log
    app = create_app()

    with TestClient(app) as client:
        # Mock requests.post to send directly to TestClient
        import requests

        def mock_post(url, json=None, **kwargs):
            return client.post("/logs", json=json)

        monkeypatch.setattr(requests, "post", mock_post)

        broker_log("Message Broker connected to Redis stream successfully")

        # Verify log is ingested and retrievable in Vault
        res = client.get("/logs?module_name=message_broker")
        assert res.status_code == 200
        logs = res.json()
        assert len(logs) >= 1
        assert logs[-1]["module_name"] == "message_broker"
        assert logs[-1]["data"] == "Message Broker connected to Redis stream successfully"
