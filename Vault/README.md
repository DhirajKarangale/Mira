# Vault

The **Vault** is the centralized service for secret management, configuration storage, encrypted audit logging, and application permissions across MIRA modules.

---

## 1. What It Does

- **Secrets & Encryption**: Derives and retains an internal 256-bit encryption key securely in memory using the OS credential store (Windows Credential Manager / macOS Keychain / Linux SecretService).
- **Encrypted Configurations**: Stores module configurations in an encrypted SQLite database (`logs`, `message_broker`, `operator`, `user_details`, `app_permissions`).
- **Encrypted Audit Logging**: Ingests logs from all modules and stores them in encrypted daily files (`dd-mm-yyyy.jsonl`) with search, date filtering, and pagination.
- **Log Retention**: Automatically and manually cleans up expired logs according to configured retention periods.
- **Host OS Detection**: Identifies host operating system type and friendly version.
- **App Capture Permissions**: Maintains system application capture permissions and keeps them synchronized with Operator.

---

## 2. API Reference

Every endpoint has strictly one way to be called.

### 2.1 Service Health
`GET /health`

- **Response (`200 OK`):**
  ```json
  {
    "service": "Vault",
    "status": "online"
  }
  ```

---

### 2.2 Ingest Log
`POST /logs`

Appends an encrypted log entry to the active daily log file.

- **Request Body:**
  ```json
  {
    "module_name": "operator",
    "data": "Captured silent screenshot: job_123"
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

Queries encrypted log records with optional filtering and pagination.

- **Query Parameters:**
  - `module_name` (optional, default: `"all"`): Filter by module name.
  - `search` (optional): Case-insensitive text search within log contents.
  - `start_date` (optional): Beginning date (`dd-mm-yyyy` or `yyyy-mm-dd`).
  - `end_date` (optional): Ending date (`dd-mm-yyyy` or `yyyy-mm-dd`).
  - `date` (optional): Single day filter.
  - `limit` (optional, default: `50`, max: `1000`): Maximum logs per page.
  - `offset` (optional, default: `0`): Offset for pagination.
  - `page` (optional): Page number (1-indexed).
  - `envelope` (optional, default: `false`): When `true`, returns items with pagination metadata.
- **Response (`200 OK`):**
  ```json
  [
    {
      "id": 1,
      "module_name": "operator",
      "timestamp": "21/10/2026T10:00:00",
      "data": "Captured silent screenshot: job_123"
    }
  ]
  ```

---

### 2.4 Trigger Retention Cleanup
`POST /retention/cleanup`

Manually purges log files that exceed retention days or possess invalid file naming formats.

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

### 2.5 Get Module Configuration
`GET /config/{key}`

Retrieves configuration parameters for a module group (`logs`, `message_broker`, `operator`, `user_details`).

- **Example:**
  `GET /config/operator`
- **Response (`200 OK`):**
  ```json
  {
    "CAPTURE_INTERVAL_SECS": 10,
    "AUTO_START": false
  }
  ```

---

### 2.6 Update Logs Configuration
`POST /config/logs`

- **Request Body:**
  ```json
  {
    "retention_period": 30,
    "show_logs_vault": true,
    "show_logs_operator": true,
    "show_logs_engine": true,
    "show_logs_memory": true,
    "show_logs_client": true,
    "show_logs_message_broker": true,
    "store_logs_vault": true,
    "store_logs_operator": true,
    "store_logs_engine": true,
    "store_logs_memory": true,
    "store_logs_client": true,
    "store_logs_message_broker": true
  }
  ```
- **Response (`200 OK`):**
  Returns the updated configuration object for `logs`.

---

### 2.7 Update Message Broker Configuration
`POST /config/message_broker`

- **Request Body:**
  ```json
  {
    "REDIS_HOST": "localhost",
    "REDIS_PORT": 6379,
    "REDIS_DB": 0
  }
  ```
- **Response (`200 OK`):**
  Returns the updated configuration object for `message_broker`.

---

### 2.8 Update Operator Configuration
`POST /config/operator`

- **Request Body:**
  ```json
  {
    "CAPTURE_INTERVAL_SECS": 15,
    "AUTO_START": true
  }
  ```
- **Response (`200 OK`):**
  Returns the updated configuration object for `operator`.

---

### 2.9 Get User Profile
`GET /user`

- **Response (`200 OK`):**
  ```json
  {
    "user_name": "Dhiraj",
    "email": "dakarangale02@gmail.com",
    "phone_number": "+91 7620320595",
    "city": "Pune",
    "state": "Maharashtra",
    "country": "India",
    "exists": true
  }
  ```

---

### 2.10 Save User Profile
`POST /user`

- **Request Body:**
  ```json
  {
    "user_name": "Dhiraj",
    "email": "dakarangale02@gmail.com",
    "phone_number": "+91 7620320595",
    "city": "Pune",
    "state": "Maharashtra",
    "country": "India"
  }
  ```
- **Response (`200 OK`):**
  ```json
  {
    "user_name": "Dhiraj",
    "email": "dakarangale02@gmail.com",
    "phone_number": "+91 7620320595",
    "city": "Pune",
    "state": "Maharashtra",
    "country": "India",
    "exists": true,
    "message": "User details saved successfully"
  }
  ```

---

### 2.11 Detect Operating System
`GET /os`

- **Response (`200 OK`):**
  ```json
  "Windows 11"
  ```

---

### 2.12 Get App Capture Permissions
`GET /apps`

Returns all discovered system applications with their capture permission settings.

- **Response (`200 OK`):**
  ```json
  [
    {
      "app_name": "Microsoft Edge",
      "app_id": "msedge.exe",
      "allowed_to_capture": true
    },
    {
      "app_name": "Notepad",
      "app_id": "notepad.exe",
      "allowed_to_capture": false
    }
  ]
  ```

---

### 2.13 Refresh App List
`POST /apps/refresh`

Synchronizes the application database with system applications discovered by Operator:
- Adds new applications with `allowed_to_capture = true`.
- Removes applications no longer present on the host system.
- Preserves existing capture permissions for already registered applications.

- **Request Body:**
  ```json
  [
    {
      "app_name": "Microsoft Edge",
      "app_id": "msedge.exe"
    },
    {
      "app_name": "Notepad",
      "app_id": "notepad.exe"
    }
  ]
  ```
- **Response (`200 OK`):**
  ```json
  {
    "status": "success",
    "message": "App list refreshed successfully",
    "total": 42,
    "added": 2,
    "removed": 0,
    "preserved": 40
  }
  ```

---

### 2.14 Update App Capture Permission
`POST /apps/permission`

Updates an application's `allowed_to_capture` status in the encrypted database and notifies Operator.

- **Request Body:**
  ```json
  {
    "app_id": "notepad.exe",
    "allowed_to_capture": false
  }
  ```
- **Response (`200 OK`):**
  ```json
  {
    "status": "success",
    "message": "App permission updated successfully",
    "app": {
      "app_name": "Notepad",
      "app_id": "notepad.exe",
      "allowed_to_capture": false
    }
  }
  ```

---

### 2.15 Get Services
`GET /services`

- **Response (`200 OK`):**
  ```json
  {
    "vault": "http://127.0.0.1:8001",
    "message_broker": "http://127.0.0.1:8000",
    "operator": "http://127.0.0.1:8002"
  }
  ```

---

### 2.16 Update Services
`POST /services`

- **Request Body:**
  ```json
  {
    "operator": "http://127.0.0.1:8002"
  }
  ```
- **Response (`200 OK`):**
  ```json
  {
    "status": "success",
    "services": {
      "vault": "http://127.0.0.1:8001",
      "message_broker": "http://127.0.0.1:8000",
      "operator": "http://127.0.0.1:8002"
    }
  }
  ```

---

### 2.17 Get Available AI Providers
`GET /ai/providers`

Returns the list of all configured LLM provider names.

- **Response (`200 OK`):**
  ```json
  [
    "groq",
    "gemini"
  ]
  ```

---

### 2.18 Get All AI Configs
`GET /ai/configs`

Returns the complete configuration objects for all LLM providers.

- **Response (`200 OK`):**
  ```json
  [
    {
      "id": 1,
      "llm_provider": "groq",
      "total_keys": 0,
      "current_key": 0,
      "keys": []
    },
    {
      "id": 2,
      "llm_provider": "gemini",
      "total_keys": 0,
      "current_key": 0,
      "keys": []
    }
  ]
  ```

---

### 2.19 Get AI Config by Provider
`GET /ai/configs/{provider}`

Returns the full configuration object for a specific LLM provider (`groq`, `gemini`, etc.).

- **Example:**
  `GET /ai/configs/groq`
- **Response (`200 OK`):**
  ```json
  {
    "id": 1,
    "llm_provider": "groq",
    "total_keys": 0,
    "current_key": 0,
    "keys": []
  }
  ```

---

### 2.20 Update AI Config
`POST /ai/configs/{provider}`

Updates LLM provider configurations. Supports adding keys, removing keys, setting key arrays directly, and updating the active key index.

- **Request Body Options:**
  - `add_key`: string (single key to add)
  - `add_keys`: array of strings (keys to add)
  - `remove_key`: string (single key to remove)
  - `remove_keys`: array of strings (keys to remove)
  - `keys`: array of strings (replace entire key array)
  - `current_key`: integer (set current key index)

- **Example (Add Key):**
  ```json
  {
    "add_key": "gsk_example_key_123"
  }
  ```
- **Example (Remove Key):**
  ```json
  {
    "remove_key": "gsk_example_key_123"
  }
  ```
- **Response (`200 OK`):**
  ```json
  {
    "id": 1,
    "llm_provider": "groq",
    "total_keys": 1,
    "current_key": 0,
    "keys": [
      "gsk_example_key_123"
    ]
  }
  ```

---

### 2.21 Delete AI Config
`DELETE /ai/configs/{provider}`

Removes a configured LLM provider and all associated API keys from Vault.

- **Example:**
  `DELETE /ai/configs/groq`
- **Response (`200 OK`):**
  ```json
  {
    "status": "success",
    "message": "AI config for provider 'groq' deleted successfully."
  }
  ```

---

### 2.22 Get LLM Priorities
`GET /ai/priorities`

Returns the ordered priority sequence of configured LLM providers for execution and fallback routing.

- **Response (`200 OK`):**
  ```json
  [
    "groq",
    "gemini"
  ]
  ```

---

### 2.23 Update LLM Priorities
`PUT /ai/priorities`

Updates the priority sequence of all configured LLM providers.
- Validates that every configured provider appears exactly once.
- Disallows adding new, removing existing, or duplicating providers (only reordering allowed).

- **Request Body:**
  ```json
  [
    "gemini",
    "groq"
  ]
  ```
- **Response (`200 OK`):**
  ```json
  [
    "gemini",
    "groq"
  ]
  ```

---

### 2.24 Get Engine Workers
`GET /engine/workers` (or `GET /config/engine/workers`)

Retrieves the current background worker concurrency configuration for embeddings and LLM inference.

- **Response (`200 OK`):**
  ```json
  {
    "embedding_workers": 1,
    "llm_workers": 1
  }
  ```

---

### 2.25 Update Engine Workers
`PUT /engine/workers` (or `POST /engine/workers`, `PUT /config/engine/workers`)

Updates the background worker concurrency counts.
- Validates that both `embedding_workers` and `llm_workers` are integers between `1` and `50`, inclusive.

- **Request Body:**
  ```json
  {
    "embedding_workers": 4,
    "llm_workers": 2
  }
  ```
- **Response (`200 OK`):**
  ```json
  {
    "embedding_workers": 4,
    "llm_workers": 2
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
uvicorn app:app --host 127.0.0.1 --port 8001 --reload
```
*(Or start all modules simultaneously using `python start.py` from the project root)*
