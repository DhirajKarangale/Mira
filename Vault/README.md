# Vault

The **Vault** is the centralized security, secret management, encrypted configuration storage, and audit logging service for MIRA.

---

## 1. Purpose

- **Credential & Secret Storage**: Retains encryption keys securely in memory using native OS credential management.
- **Encrypted Configurations**: Stores system configurations (`logs`, `message_broker`, `operator`, `user_details`, `ai_configs`, `engine_workers`) in an encrypted database.
- **Audit Logging & Retention**: Collects encrypted audit logs with full-text search, pagination, and automated retention cleanup.
- **App Permissions**: Tracks system applications and synchronizes screen capture permissions with Operator.
- **AI & Concurrency Management**: Manages LLM API keys, provider priorities, and worker concurrency limits.

---

## 2. API Endpoints

### 2.1 Health Check
`GET /health`

Checks if the service is online.

- **Parameters**: None
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

Appends an encrypted log entry.

- **Request Body (JSON):**
  ```json
  {
    "module_name": "operator",
    "data": "Capture cycle started"
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
  - `module_name` (string, optional, default: `"all"`): Filter by module.
  - `search` (string, optional): Text search query.
  - `start_date` (string, optional): Start date (`dd-mm-yyyy`).
  - `end_date` (string, optional): End date (`dd-mm-yyyy`).
  - `limit` (integer, optional, default: `50`): Max records.
  - `page` (integer, optional, default: `1`): Page number.
  - `envelope` (boolean, optional, default: `false`): Include pagination metadata.
- **Response (`200 OK`):**
  ```json
  {
    "items": [
      {
        "id": 1,
        "module_name": "operator",
        "timestamp": "21/10/2026T10:00:00",
        "data": "Capture cycle started"
      }
    ],
    "total": 1,
    "page": 1,
    "limit": 50
  }
  ```

---

### 2.4 Retention Cleanup
`POST /retention/cleanup`

Purges log files exceeding the retention period.

- **Parameters**: None
- **Response (`200 OK`):**
  ```json
  {
    "status": "success",
    "retention_days": 30,
    "deleted_expired_count": 0,
    "retained_count": 1
  }
  ```

---

### 2.5 Get Module Configuration
`GET /config/{key}`

Retrieves configuration for a specific module (`logs`, `message_broker`, `operator`, `user_details`).

- **Path Parameters:**
  - `key` (string, required): Configuration key.
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

Updates log retention and visibility settings.

- **Request Body (JSON):**
  ```json
  {
    "retention_period": 30,
    "show_logs_operator": true,
    "store_logs_operator": true
  }
  ```
- **Response (`200 OK`):**
  ```json
  {
    "retention_period": 30,
    "show_logs_operator": true
  }
  ```

---

### 2.7 Update Message Broker Configuration
`POST /config/message_broker`

Updates Redis connection configuration.

- **Request Body (JSON):**
  ```json
  {
    "REDIS_HOST": "localhost",
    "REDIS_PORT": 6379,
    "REDIS_DB": 0
  }
  ```
- **Response (`200 OK`):**
  ```json
  {
    "REDIS_HOST": "localhost",
    "REDIS_PORT": 6379
  }
  ```

---

### 2.8 Update Operator Configuration
`POST /config/operator`

Updates desktop operator capture settings.

- **Request Body (JSON):**
  ```json
  {
    "CAPTURE_INTERVAL_SECS": 15,
    "AUTO_START": true
  }
  ```
- **Response (`200 OK`):**
  ```json
  {
    "CAPTURE_INTERVAL_SECS": 15,
    "AUTO_START": true
  }
  ```

---

### 2.9 Get User Profile
`GET /user`

Retrieves stored user profile details.

- **Parameters**: None
- **Response (`200 OK`):**
  ```json
  {
    "user_name": "Dhiraj",
    "email": "dakarangale02@gmail.com",
    "phone_number": "+91 7620320595",
    "city": "Pune",
    "exists": true
  }
  ```

---

### 2.10 Save User Profile
`POST /user`

Saves or updates user profile details.

- **Request Body (JSON):**
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
    "message": "User details saved successfully"
  }
  ```

---

### 2.11 Detect Host OS
`GET /os`

Identifies the host operating system.

- **Parameters**: None
- **Response (`200 OK`):**
  ```json
  "Windows 11"
  ```

---

### 2.12 List App Permissions
`GET /apps`

Returns all discovered applications with capture permissions.

- **Parameters**: None
- **Response (`200 OK`):**
  ```json
  [
    {
      "app_id": "msedge.exe",
      "app_name": "Microsoft Edge",
      "allowed_to_capture": true
    }
  ]
  ```

---

### 2.13 Refresh App List
`POST /apps/refresh`

Synchronizes the application database with newly discovered system apps.

- **Request Body (JSON):**
  ```json
  [
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
    "total": 42,
    "added": 1
  }
  ```

---

### 2.14 Update App Permission
`POST /apps/permission`

Updates capture permission for a single application and syncs with Operator.

- **Request Body (JSON):**
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
    "app": {
      "app_id": "notepad.exe",
      "allowed_to_capture": false
    }
  }
  ```

---

### 2.15 Get Service Endpoints
`GET /services`

Returns discovered service URLs.

- **Parameters**: None
- **Response (`200 OK`):**
  ```json
  {
    "vault": "http://127.0.0.1:9002",
    "message_broker": "http://127.0.0.1:9003",
    "operator": "http://127.0.0.1:9004"
  }
  ```

---

### 2.16 Update Service Endpoints
`POST /services`

Updates registered service endpoints.

- **Request Body (JSON):**
  ```json
  {
    "operator": "http://127.0.0.1:9004"
  }
  ```
- **Response (`200 OK`):**
  ```json
  {
    "status": "success"
  }
  ```

---

### 2.17 List AI Providers
`GET /ai/providers`

Lists all configured LLM provider identifiers.

- **Parameters**: None
- **Response (`200 OK`):**
  ```json
  ["groq", "gemini"]
  ```

---

### 2.18 List All AI Configurations
`GET /ai/configs`

Returns configuration details for all LLM providers.

- **Parameters**: None
- **Response (`200 OK`):**
  ```json
  [
    {
      "llm_provider": "groq",
      "total_keys": 1,
      "current_key": 0,
      "keys": ["gsk_..."]
    }
  ]
  ```

---

### 2.19 Get AI Configuration by Provider
`GET /ai/configs/{provider}`

Retrieves configuration for a specific provider.

- **Path Parameters:**
  - `provider` (string, required): Provider identifier (`groq`, `gemini`).
- **Response (`200 OK`):**
  ```json
  {
    "llm_provider": "groq",
    "total_keys": 1,
    "current_key": 0,
    "keys": ["gsk_..."]
  }
  ```

---

### 2.20 Update AI Configuration
`POST /ai/configs/{provider}`

Modifies keys or active index for a provider.

- **Path Parameters:**
  - `provider` (string, required): Provider identifier.
- **Request Body (JSON):**
  ```json
  {
    "add_key": "gsk_new_key"
  }
  ```
- **Response (`200 OK`):**
  ```json
  {
    "llm_provider": "groq",
    "total_keys": 2,
    "current_key": 0
  }
  ```

---

### 2.21 Delete AI Configuration
`DELETE /ai/configs/{provider}`

Deletes an LLM provider configuration and its stored keys.

- **Path Parameters:**
  - `provider` (string, required): Provider identifier.
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

Returns the priority order for AI providers.

- **Parameters**: None
- **Response (`200 OK`):**
  ```json
  ["gemini", "groq"]
  ```

---

### 2.23 Update LLM Priorities
`PUT /ai/priorities`

Updates provider priority sequence.

- **Request Body (JSON):**
  ```json
  ["groq", "gemini"]
  ```
- **Response (`200 OK`):**
  ```json
  ["groq", "gemini"]
  ```

---

### 2.24 Get Engine Workers
`GET /engine/workers`

Retrieves background worker concurrency limits.

- **Parameters**: None
- **Response (`200 OK`):**
  ```json
  {
    "embedding_workers": 1,
    "llm_workers": 1
  }
  ```

---

### 2.25 Update Engine Workers
`PUT /engine/workers`

Updates worker concurrency counts.

- **Request Body (JSON):**
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

## 3. Installation & Startup

### Install Dependencies
```bash
pip install -r requirements.txt
```

### Start Server
Run from the `Vault/` directory:
```bash
python app.py
```
Or directly using Uvicorn:
```bash
uvicorn app:app --host 127.0.0.1 --port 9002
```
