# MIRA — Vault Module

The **Vault** module serves as the centralized, secure storage, configuration management, and logging backbone for MIRA. It manages cryptographic secrets in the OS credential store, synchronizes SQL configuration tables encrypted with **XChaCha20-Poly1305**, and provides an authenticated, encrypted logging service.

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

### Configuration Management
- **Central SQL Schema (`schema.sql`):** Defines separate SQL tables for different configuration groups (`logs`, `message_broker`).
- **Dynamic Schema Synchronization:** On startup, Vault inspects existing SQLite tables:
  - Automatically creates any missing tables defined in `schema.sql`.
  - Automatically adds any missing columns (`ALTER TABLE ADD COLUMN`).
  - Automatically drops any obsolete/removed columns (`ALTER TABLE DROP COLUMN`).
  - Populates default configuration values if the table is empty.
- **Encrypted Tables at Rest:** The entire configuration database is encrypted using **XChaCha20-Poly1305** and stored as `config.db.enc` in the system directory.
- **Get Config API:** Exposes `GET /config/{key}` and `GET /config?key={key}` returning the configuration group (e.g. `logs`, `message_broker`) as typed JSON.

### Encrypted Log Management
- **Dedicated System Logs Directory:** Automatically creates a `logs/` directory inside the system directory (`Vault/system/logs` by default).
- **Date-based JSONL Files:** Daily log files are formatted as `dd-mm-yyyy.jsonl` (e.g., `20-10-2026.jsonl`).
- **Configurable Retention Policy:** Uses `retention_period` from the encrypted SQL Logs configuration (default: 30 days) to delete expired files on startup.
- **Fine-Grained Logging Controls:**
  - `show_logs_<module_name>`: Controls whether incoming logs for a module are printed to the terminal.
  - `store_logs_<module_name>`: Controls whether incoming logs for a module are written to the daily encrypted log file.
- **XChaCha20-Poly1305 AEAD Encryption:** Every daily log file is encrypted using XChaCha20-Poly1305 with the derived internal key and a fresh 24-byte random nonce per write.
- **Sequential Record ID & Formatting:**
  - `id`: Sequential integer starting at `1` for each daily file.
  - `module_name`: Name of the emitting module.
  - `timestamp`: System timestamp in `dd/mm/yyyyTHH:mm:ss` format.
  - `data`: Log message string.

---

## 2. Directory Structure

```text
Vault/
├── __init__.py           # Package exports (encrypt_log_data, decrypt_log_data)
├── schema.sql            # Central SQL schema definition for all configuration groups
├── config.py             # Configuration parameters & environment variables
├── config_storage.py     # SQL table manager, schema synchronizer & XChaCha20-Poly1305 database encryption
├── crypto.py             # Credential store, key derivation & internal XChaCha20-Poly1305 cipher
├── log_manager.py        # Log rotation, retention cleaner, atomic encrypted writer & query engine
├── api.py                # FastAPI routes (POST /logs, GET /logs, GET /config/{key}, POST /retention/cleanup)
├── app.py                # Web server application entrypoint & lifespan lifecycle
├── requirements.txt      # Dependencies
├── tests/
│   └── test_vault.py     # Comprehensive automated test suite
└── README.md             # Documentation
```

---

## 3. Configuration Groups

### Logs Configuration (`logs`)
| Field | Type | Default | Description |
| :--- | :--- | :--- | :--- |
| `retention_period` | INTEGER | `30` | Retention duration in days |
| `show_logs_operator` | BOOLEAN | `true` | Print operator logs to terminal |
| `show_logs_engine` | BOOLEAN | `true` | Print engine logs to terminal |
| `show_logs_memory` | BOOLEAN | `true` | Print memory logs to terminal |
| `show_logs_client` | BOOLEAN | `true` | Print client logs to terminal |
| `show_logs_message_broker` | BOOLEAN | `true` | Print message_broker logs to terminal |
| `store_logs_operator` | BOOLEAN | `true` | Save operator logs to encrypted file |
| `store_logs_engine` | BOOLEAN | `true` | Save engine logs to encrypted file |
| `store_logs_memory` | BOOLEAN | `true` | Save memory logs to encrypted file |
| `store_logs_client` | BOOLEAN | `true` | Save client logs to encrypted file |
| `store_logs_message_broker`| BOOLEAN | `true` | Save message_broker logs to encrypted file |

### Message Broker Configuration (`message_broker`)
| Field | Type | Default | Description |
| :--- | :--- | :--- | :--- |
| `REDIS_HOST` | TEXT | `"localhost"` | Redis server hostname |
| `REDIS_PORT` | INTEGER | `6379` | Redis server port |
| `REDIS_DB` | INTEGER | `0` | Redis database index |
| `REDIS_PASSWORD` | TEXT | `null` | Redis password |
| `REDIS_PROTOCOL` | INTEGER | `2` | Redis connection protocol |
| `REDIS_DECODE_RESPONSES` | BOOLEAN | `true` | Decode Redis responses to strings |
| `SERVER_HOST` | TEXT | `"127.0.0.1"` | Message Broker bind host |
| `SERVER_PORT` | INTEGER | `8000` | Message Broker bind port |
| `SERVER_RELOAD` | BOOLEAN | `false` | Enable/disable auto-reload |

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
  - `limit` *(optional)*: Maximum number of recent log entries to return.

### 3. Get Configuration
* **Method:** `GET /config/{key}` or `GET /config?key={key}`
* **Status:** `200 OK`
* **Example Request:** `GET /config/logs`
* **Response Body:**
  ```json
  {
    "retention_period": 30,
    "show_logs_operator": true,
    "show_logs_engine": true,
    "show_logs_memory": true,
    "show_logs_client": true,
    "show_logs_message_broker": true,
    "store_logs_operator": true,
    "store_logs_engine": true,
    "store_logs_memory": true,
    "store_logs_client": true,
    "store_logs_message_broker": true
  }
  ```
* **Example Request:** `GET /config/message_broker`
* **Response Body:**
  ```json
  {
    "REDIS_HOST": "localhost",
    "REDIS_PORT": 6379,
    "REDIS_DB": 0,
    "REDIS_PASSWORD": null,
    "REDIS_PROTOCOL": 2,
    "REDIS_DECODE_RESPONSES": true,
    "SERVER_HOST": "127.0.0.1",
    "SERVER_PORT": 8000,
    "SERVER_RELOAD": false
  }
  ```

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
