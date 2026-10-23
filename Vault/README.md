# Vault

The **Vault** is the centralized security, secret management, encrypted configuration storage, and audit logging service for MIRA.

---

## 1. Purpose

- **Encrypted Configurations**: Stores system configurations (`logs`, `message_broker`, `operator`, `user_details`, `ai_configs`, `engine_workers`) in an encrypted SQLite database.
- **Audit Logging**: Collects encrypted audit logs with search, pagination, and automated retention cleanup.
- **App Permissions**: Stores and manages per-application screenshot capture permissions.
- **AI & Concurrency Management**: Manages LLM API keys, provider priorities, and worker concurrency limits.

---

## 2. API Endpoints

### 2.1 Health Check
`GET /health`

- **Response (`200 OK`):**
  ```json
  { "service": "Vault", "status": "online" }
  ```

---

### 2.2 Create Log
`POST /logs`

- **Request Body (JSON):**
  ```json
  { "module_name": "operator", "data": "Capture cycle started" }
  ```
- **Response (`201 Created`):**
  ```json
  { "message": "Log added successfully" }
  ```

---

### 2.3 Get Logs
`GET /logs`

- **Query Parameters:**
  - `module_name` (string, optional, default: `"all"`): Module filter.
  - `search` (string, optional): Text search query.
  - `start_date` / `end_date` (string, optional): Date filter (`YYYY-MM-DD`).
  - `limit` (integer, optional, default: `50`): Max logs.
  - `page` (integer, optional): Page number.
  - `envelope` (boolean, optional, default: `false`): Include pagination wrapper.
- **Response (`200 OK`):**
  ```json
  {
    "items": [{ "id": 1, "module_name": "operator", "timestamp": "...", "data": "..." }],
    "total": 1,
    "page": 1,
    "limit": 50
  }
  ```

---

### 2.4 Retention Cleanup
`POST /retention/cleanup`

- **Response (`200 OK`):**
  ```json
  { "status": "success", "deleted_expired_count": 0, "retained_count": 1 }
  ```

---

### 2.5 Get Configuration by Key
`GET /config/{key}`

- **Path Parameters:**
  - `key` (string, required): Configuration key (e.g. `logs`, `message_broker`, `operator`, `user_details`).
- **Response (`200 OK`):**
  ```json
  { "CAPTURE_INTERVAL_SECS": 10, "AUTO_START": false }
  ```

---

### 2.6 Update Logs Configuration
`POST /config/logs`

- **Request Body (JSON):**
  ```json
  { "retention_period": 30, "show_logs_operator": true }
  ```
- **Response (`200 OK`):**
  ```json
  { "retention_period": 30, "show_logs_operator": true }
  ```

---

### 2.7 Update Message Broker Configuration
`POST /config/message_broker`

- **Request Body (JSON):**
  ```json
  { "REDIS_HOST": "localhost", "REDIS_PORT": 6379 }
  ```
- **Response (`200 OK`):**
  ```json
  { "REDIS_HOST": "localhost", "REDIS_PORT": 6379 }
  ```

---

### 2.8 Update Operator Configuration
`POST /config/operator`

- **Request Body (JSON):**
  ```json
  { "CAPTURE_INTERVAL_SECS": 15, "AUTO_START": true }
  ```
- **Response (`200 OK`):**
  ```json
  { "CAPTURE_INTERVAL_SECS": 15, "AUTO_START": true }
  ```

---

### 2.9 Get User Details
`GET /user`

- **Response (`200 OK`):**
  ```json
  { "user_name": "User", "email": "user@example.com", "exists": true }
  ```

---

### 2.10 Save User Details
`POST /user`

- **Request Body (JSON):**
  ```json
  { "user_name": "User", "email": "user@example.com" }
  ```
- **Response (`200 OK`):**
  ```json
  { "user_name": "User", "email": "user@example.com", "exists": true, "message": "User details saved successfully" }
  ```

---

### 2.11 OS Detection
`GET /os`

- **Response (`200 OK`):**
  `"Windows 11"`

---

### 2.12 Get Services Registry
`GET /services`

- **Response (`200 OK`):**
  ```json
  { "vault": "http://127.0.0.1:9001", "operator": "http://127.0.0.1:9003" }
  ```

---

### 2.13 Update Services Registry
`POST /services`

- **Request Body (JSON):**
  ```json
  { "vault": "http://127.0.0.1:9001", "operator": "http://127.0.0.1:9003" }
  ```
- **Response (`200 OK`):**
  ```json
  { "status": "success", "services": { "vault": "http://127.0.0.1:9001" } }
  ```

---

### 2.14 Get Stored App Permissions
`GET /apps`

- **Response (`200 OK`):**
  ```json
  [
    { "app_name": "Visual Studio Code", "app_id": "code.exe", "allowed_to_capture": true }
  ]
  ```

---

### 2.15 Refresh App Permissions Batch
`POST /apps/refresh`

- **Request Body (JSON):**
  ```json
  [
    { "app_name": "Visual Studio Code", "app_id": "code.exe" }
  ]
  ```
- **Response (`200 OK`):**
  ```json
  [
    { "app_name": "Visual Studio Code", "app_id": "code.exe", "allowed_to_capture": true }
  ]
  ```

---

### 2.16 Update App Permission
`POST /apps/permission`

- **Request Body (JSON):**
  ```json
  { "app_id": "chrome.exe", "allowed_to_capture": false }
  ```
- **Response (`200 OK`):**
  ```json
  { "status": "success", "message": "App permission updated successfully", "app": { "app_id": "chrome.exe", "allowed_to_capture": false } }
  ```

---

### 2.17 Get AI Providers
`GET /ai/providers`

- **Response (`200 OK`):**
  ```json
  ["Groq", "Gemini", "OpenAI"]
  ```

---

### 2.18 Get All AI Configurations
`GET /ai/configs`

- **Response (`200 OK`):**
  ```json
  [
    { "llm_provider": "Groq", "total_keys": 1, "current_key": 0, "keys": ["gsk_..."] }
  ]
  ```

---

### 2.19 Get AI Configuration by Provider
`GET /ai/configs/{provider}`

- **Path Parameters:**
  - `provider` (string, required): Provider name.
- **Response (`200 OK`):**
  ```json
  { "llm_provider": "Groq", "total_keys": 1, "current_key": 0, "keys": ["gsk_..."] }
  ```

---

### 2.20 Update AI Configuration
`POST /ai/configs/{provider}`

- **Path Parameters:**
  - `provider` (string, required): Provider name.
- **Request Body (JSON):**
  ```json
  { "keys": ["gsk_..."], "current_key": 0 }
  ```
- **Response (`200 OK`):**
  ```json
  { "llm_provider": "Groq", "total_keys": 1, "current_key": 0, "keys": ["gsk_..."] }
  ```

---

### 2.21 Delete AI Configuration
`DELETE /ai/configs/{provider}`

- **Path Parameters:**
  - `provider` (string, required): Provider name.
- **Response (`200 OK`):**
  ```json
  { "status": "success", "message": "Deleted AI configuration for Groq" }
  ```

---

### 2.22 Get AI Priorities
`GET /ai/priorities`

- **Response (`200 OK`):**
  ```json
  ["Groq", "Gemini", "OpenAI"]
  ```

---

### 2.23 Update AI Priorities
`PUT /ai/priorities`

- **Request Body (JSON):**
  ```json
  ["Groq", "Gemini", "OpenAI"]
  ```
- **Response (`200 OK`):**
  ```json
  ["Groq", "Gemini", "OpenAI"]
  ```

---

### 2.24 Get Engine Workers Concurrency
`GET /engine/workers`

- **Response (`200 OK`):**
  ```json
  {
    "llm_workers": 1,
    "screenshot_extraction_workers": 1,
    "screenshot_summarization_workers": 1,
    "screenshot_extraction_poll_time": 5.0,
    "screenshot_summarization_poll_time": 5.0
  }
  ```

---

### 2.25 Update Engine Workers Concurrency
`PUT /engine/workers`

- **Request Body (JSON):**
  ```json
  { "screenshot_extraction_workers": 2, "screenshot_extraction_poll_time": 3.0 }
  ```
- **Response (`200 OK`):**
  ```json
  {
    "llm_workers": 1,
    "screenshot_extraction_workers": 2,
    "screenshot_summarization_workers": 1,
    "screenshot_extraction_poll_time": 3.0,
    "screenshot_summarization_poll_time": 5.0
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
Or with Uvicorn:
```bash
uvicorn app:app --host 127.0.0.1 --port 9001
```
