# MIRA — Vault Module

The **Vault** module serves as the centralized, secure storage and logging backbone for MIRA. It manages cryptographic secrets in the OS credential store and provides an authenticated, encrypted logging service using **XChaCha20-Poly1305**.

---

## 1. Features

### Key Generation & Cryptographic Security
- **OS Credential Store Integration:** On startup, Vault checks the OS credential store (Windows Credential Manager / macOS Keychain / Secret Service via Python `keyring`) for an existing master encryption key.
- **Secure Key Generation:** If no key is found, Vault generates a cryptographically secure 256-bit random key (`secrets.token_hex(32)`) and securely persists it into the OS credential store under restricted user access.
- **Key Derivation:** Vault derives the final 32-byte key using:
  ```text
  final_key = SHA256(hardcoded_prefix + credential_key + hardcoded_suffix)
  ```
- **Strictly Internal Key Security:** The encryption key is kept strictly internal to the Vault module in memory. No API endpoint or external functionality exposes or returns the encryption key.

### Encrypted Log Management
- **Dedicated System Logs Directory:** Automatically creates a `logs/` directory inside the system directory (`Vault/system/logs` by default).
- **Date-based JSONL Files:** Daily log files are formatted as `dd-mm-yyyy.jsonl` (e.g., `20-10-2026.jsonl`).
- **Retention & Validation Policy on Startup:**
  - Scans `logs/` on server startup.
  - Automatically deletes any files that do not conform to the required date format.
  - Automatically deletes log files older than the configurable retention period (`LOG_RETENTION_DAYS`, default: 30 days).
- **XChaCha20-Poly1305 AEAD Encryption:** Every daily log file is encrypted using XChaCha20-Poly1305 with the derived internal key and a fresh 24-byte random nonce per write.
- **Sequential Record ID & Formatting:**
  - `id`: Sequential integer starting at `1` for each daily file.
  - `module_name`: Name of the emitting module (e.g. `message_broker`, `operator`, `engine`, `memory`).
  - `timestamp`: System timestamp in `dd/mm/yyyyTHH:mm:ss` format.
  - `data`: Log message string.
- **Terminal Streaming:** For every log ingestion request, the log is formatted and printed directly to the terminal stdout and logger.

---

## 2. Directory Structure

```text
Vault/
├── __init__.py           # Package exports (encrypt_log_data, decrypt_log_data)
├── config.py             # Configuration parameters & environment variables
├── crypto.py             # Credential store, key derivation & internal XChaCha20-Poly1305 cipher
├── log_manager.py        # Log rotation, retention cleaner, atomic encrypted writer & query engine
├── api.py                # FastAPI routes (POST /logs, GET /logs, POST /retention/cleanup)
├── app.py                # Web server application entrypoint & lifespan lifecycle
├── requirements.txt      # Dependencies
├── tests/
│   └── test_vault.py     # Comprehensive automated test suite
└── README.md             # Documentation
```

---

## 3. Configuration

Configurable via environment variables or in `config.py`:

| Variable | Default Value | Description |
| :--- | :--- | :--- |
| `VAULT_HOST` | `127.0.0.1` | Host address for web server |
| `VAULT_PORT` | `8001` | Port for Vault web server |
| `VAULT_RELOAD` | `false` | Enable/disable auto-reload |
| `MIRA_SYSTEM_DIR` | `<Vault_dir>/system` | Base system directory |
| `MIRA_LOGS_DIR` | `<system_dir>/logs` | Directory for encrypted log files |
| `LOG_RETENTION_DAYS` | `30` | Number of days to retain logs before cleanup |
| `MIRA_KEYRING_SERVICE` | `MIRA_VAULT` | Service name in OS credential store |
| `MIRA_KEYRING_KEY_NAME`| `master_encryption_key` | Key name in OS credential store |
| `MIRA_KEY_PREFIX` | `MIRA_VAULT_PREFIX_SEC_` | Hardcoded prefix for key derivation |
| `MIRA_KEY_SUFFIX` | `_MIRA_VAULT_SUFFIX_KEY` | Hardcoded suffix for key derivation |

---

## 4. API Endpoints

### 1. Ingest Log
* **Method:** `POST /logs`
* **Status:** `201 Created`
* **Request Body:**
  ```json
  {
    "module_name": "message_broker",
    "data": "Connected to Redis at localhost:6379"
  }
  ```
  *(Note: `data` must strictly be a string)*
* **Response Body:**
  ```json
  {
    "message": "Log added successfully"
  }
  ```

### 2. Retrieve Logs
* **Method:** `GET /logs`
* **Status:** `200 OK`
* **Query Parameters:**
  - `module_name` *(optional)*: Filter logs by module name. Defaults to `"all"`.
  - `start_date` *(optional)*: Start date in `dd-mm-yyyy` format. Defaults to today's date.
  - `end_date` *(optional)*: End date in `dd-mm-yyyy` format. Defaults to today's date.
  - `date` *(optional)*: Shortcut for single day query.
  - `limit` *(optional)*: Maximum number of recent log entries to return.
* **Default Behavior:**
  When no parameters are provided, returns all logs (`module_name="all"`) for today.
* **Response Body:**
  ```json
  [
    {
      "id": 1,
      "module_name": "message_broker",
      "timestamp": "20/10/2026T11:22:02",
      "data": "Connected to Redis at localhost:6379"
    }
  ]
  ```

### 3. Trigger Retention Cleanup
* **Method:** `POST /retention/cleanup`
* **Status:** `200 OK`
* Scans the logs folder and deletes invalid files and expired files older than `LOG_RETENTION_DAYS`.

---

## 5. Running and Testing

### Install Dependencies
```bash
pip install -r requirements.txt
```

### Run Tests
```bash
pytest tests/test_vault.py -v
```

### Start Web Server
```bash
python app.py
```
The server will run on `http://127.0.0.1:8001`.
