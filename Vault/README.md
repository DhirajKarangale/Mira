# Vault

The **Vault** is the centralized service for secret management, configuration storage, and encrypted logging across MIRA modules.

---

## 1. What It Provides

- **Secrets**: Automatically derives and keeps a master 256-bit encryption key internal in memory.
- **Configurations**: Stores module configurations in encrypted SQL tables (`logs`, `message_broker`).
- **Encrypted Logging**: Ingests module logs via HTTP and writes them to daily encrypted JSONL files (`dd-mm-yyyy.jsonl`).
- **Retention**: Automatically cleans up logs older than configured retention period or with invalid names.

---

## 2. API Reference

### 2.1 Service Health
`GET /`

- **Response (`200 OK`):**
  ```json
  {
    "service": "MIRA Vault",
    "status": "online"
  }
  ```

---

### 2.2 Ingest Log
`POST /logs`

Used by all modules to send log entries to Vault.

- **Request Body:**
  ```json
  {
    "module_name": "message_broker",
    "data": "Connected to Redis at localhost:6379"
  }
  ```
- **Response (`201 Created`):**
  ```json
  {
    "message": "Log added successfully"
  }
  ```

---

### 2.3 Retrieve Logs
`GET /logs`

- **Query Parameters:**
  - `module_name` (optional, default: `"all"`): Filter by module name.
  - `start_date` (optional, default: today): `dd-mm-yyyy`
  - `end_date` (optional, default: today): `dd-mm-yyyy`
  - `limit` (optional): Max log entries to return.
- **Request Example:**
  ```bash
  curl "http://127.0.0.1:8001/logs?module_name=message_broker&limit=5"
  ```
- **Response (`200 OK`):**
  ```json
  [
    {
      "id": 1,
      "module_name": "message_broker",
      "timestamp": "20/10/2026T12:00:00",
      "data": "Connected to Redis at localhost:6379"
    }
  ]
  ```

---

### 2.4 Get Configuration
`GET /config/{key}`

Retrieves configuration for a module (e.g. `logs`, `message_broker`) or single key.

- **Request Example:**
  ```bash
  curl http://127.0.0.1:8001/config/logs
  ```
- **Response (`200 OK`):**
  ```json
  {
    "retention_period": 30,
    "show_logs_message_broker": true,
    "store_logs_message_broker": true
  }
  ```

---

### 2.5 Trigger Retention Cleanup
`POST /retention/cleanup`

- **Request Example:**
  ```bash
  curl -X POST http://127.0.0.1:8001/retention/cleanup
  ```
- **Response (`200 OK`):**
  ```json
  {
    "status": "success",
    "retention_days": 30,
    "deleted_invalid_count": 0,
    "deleted_expired_count": 0,
    "retained_count": 1
  }
  ```

---

## 3. How to Run

### Install Dependencies
```bash
pip install -r requirements.txt
```

### Start Server
Run from the `Vault/` directory:
```bash
cd Vault
uvicorn app:app --host 127.0.0.1 --port 8001
```
