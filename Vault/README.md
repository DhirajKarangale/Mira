# Vault

The **Vault** is the centralized security, secret management, encrypted configuration storage, and audit logging service for MIRA.

---

## 1. Purpose

- **Credential & Secret Storage**: Encrypted credential storage using OS keyring and sodium secretbox.
- **Encrypted Configurations**: Stores system configurations (`logs`, `message_broker`, `operator`, `user_details`, `ai_configs`, `engine_workers`) in an encrypted SQLite database.
- **Audit Logging**: Collects encrypted audit logs with full-text search, pagination, and automated retention cleanup.
- **App Permissions**: Synchronizes screen capture permissions for system applications with Operator.
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
  - `module_name` (string, optional, default: `"all"`): Filter by module.
  - `search` (string, optional): Text search query.
  - `start_date` / `end_date` (string, optional): Filter by date range (`YYYY-MM-DD`).
  - `limit` (integer, optional, default: `50`): Max logs.
  - `page` (integer, optional): Page number.
  - `envelope` (boolean, optional, default: `false`): Include pagination metadata.
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
  - `key` (string, required): Configuration key (e.g. `logs`, `message_broker`, `operator`).
- **Response (`200 OK`):**
  ```json
  { "CAPTURE_INTERVAL_SECS": 10, "AUTO_START": false }
  ```

---

### 2.6 Update Module Configurations
`POST /config/logs`
`POST /config/message_broker`
`POST /config/operator`

- **Request Body (`POST /config/operator`):**
  ```json
  { "CAPTURE_INTERVAL_SECS": 15, "AUTO_START": true }
  ```
- **Response (`200 OK`):**
  ```json
  { "CAPTURE_INTERVAL_SECS": 15, "AUTO_START": true }
  ```

---

### 2.7 User Details
`GET /user`
`POST /user`

- **Save User Details (`POST /user`):**
  ```json
  { "user_name": "Alice", "email": "alice@example.com" }
  ```
- **Response (`200 OK`):**
  ```json
  { "user_name": "Alice", "email": "alice@example.com", "exists": true }
  ```

---

### 2.8 OS Detection
`GET /os`

- **Response (`200 OK`):**
  `"Windows 11"`

---

### 2.9 Service Discovery Registry
`GET /services`
`POST /services`

- **Update Services (`POST /services`):**
  ```json
  { "vault": "http://127.0.0.1:9001", "operator": "http://127.0.0.1:9003" }
  ```
- **Response (`200 OK`):**
  ```json
  { "status": "success", "services": { "vault": "http://127.0.0.1:9001" } }
  ```

---

### 2.10 App Capture Permissions
`GET /apps`
`POST /apps/refresh`
`POST /apps/permission`

- **Update Permission (`POST /apps/permission`):**
  ```json
  { "app_id": "chrome.exe", "allowed_to_capture": false }
  ```
- **Response (`200 OK`):**
  ```json
  { "status": "success", "app": { "app_id": "chrome.exe", "allowed_to_capture": false } }
  ```

---

### 2.11 AI Provider Configurations
`GET /ai/providers`
`GET /ai/configs`
`GET /ai/configs/{provider}`
`POST /ai/configs/{provider}`
`DELETE /ai/configs/{provider}`

- **Update Provider Config (`POST /ai/configs/Groq`):**
  ```json
  { "keys": ["gsk_..."], "current_key": 0 }
  ```
- **Response (`200 OK`):**
  ```json
  { "llm_provider": "Groq", "total_keys": 1, "current_key": 0, "keys": ["gsk_..."] }
  ```

---

### 2.12 AI Priorities
`GET /ai/priorities`
`PUT /ai/priorities`

- **Update Priorities (`PUT /ai/priorities`):**
  ```json
  ["Groq", "Gemini", "OpenAI"]
  ```
- **Response (`200 OK`):**
  ```json
  ["Groq", "Gemini", "OpenAI"]
  ```

---

### 2.13 Engine Workers Concurrency
`GET /engine/workers`
`PUT /engine/workers`

- **Update Concurrency (`PUT /engine/workers`):**
  ```json
  { "screenshot_extraction_workers": 2, "screenshot_extraction_poll_time": 3.0 }
  ```
- **Response (`200 OK`):**
  ```json
  { "screenshot_extraction_workers": 2, "screenshot_extraction_poll_time": 3.0 }
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
