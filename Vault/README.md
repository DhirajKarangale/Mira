# Vault

The **Vault** is the centralized security, secret management, encrypted configuration storage, and audit logging service for MIRA.

---

## 1. Purpose

- **Encrypted Configurations**: Stores module configurations in an encrypted SQLite database.
- **Audit Logging**: Collects and queries encrypted audit logs with automatic retention cleanup.
- **Application Permissions**: Manages per-application screen capture permissions.
- **AI Credentials & Priority**: Stores LLM API keys, provider priorities, and worker concurrency limits.
- **Chat & Daily Suggestions Persistence**: Encrypts and persists chat history and daily suggestions.
- **Cryptography Services**: Provides centralized XChaCha20-Poly1305 data encryption and decryption.

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
  - `start_date` / `end_date` (string, optional): Date filter (`YYYY-MM-DD`).
  - `limit` (integer, optional, default: `50`): Max logs to retrieve.
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

### 2.4 Delete Logs
`DELETE /logs`

- **Query Parameters:**
  - `module_name` (string, optional): Target module, or omit for all.
- **Response (`200 OK`):**
  ```json
  { "status": "success", "message": "Logs deleted successfully", "deleted_count": 5 }
  ```

---

### 2.5 Retention Cleanup
`POST /retention/cleanup`

- **Response (`200 OK`):**
  ```json
  { "deleted_expired_count": 0, "deleted_invalid_count": 0, "retained_count": 1 }
  ```

---

### 2.6 Get Configuration by Key
`GET /config/{key}`

- **Path Parameters:**
  - `key` (string, required): `logs`, `message_broker`, `operator`, `user_details`.
- **Response (`200 OK`):**
  ```json
  { "CAPTURE_INTERVAL_SECS": 10, "AUTO_START": false }
  ```

---

### 2.7 Update Logs Configuration
`POST /config/logs`

- **Request Body (JSON):**
  ```json
  { "retention_period": 30, "show_logs_vault": true }
  ```
- **Response (`200 OK`):**
  ```json
  { "retention_period": 30, "show_logs_vault": true }
  ```

---

### 2.8 Update Message Broker Configuration
`POST /config/message_broker`

- **Request Body (JSON):**
  ```json
  { "REDIS_HOST": "127.0.0.1", "REDIS_PORT": 6379 }
  ```
- **Response (`200 OK`):**
  ```json
  { "REDIS_HOST": "127.0.0.1", "REDIS_PORT": 6379 }
  ```

---

### 2.9 Update Operator Configuration
`POST /config/operator`

- **Request Body (JSON):**
  ```json
  { "CAPTURE_INTERVAL_SECS": 10, "AUTO_START": true }
  ```
- **Response (`200 OK`):**
  ```json
  { "CAPTURE_INTERVAL_SECS": 10, "AUTO_START": true }
  ```

---

### 2.10 Get User Details
`GET /user`

- **Response (`200 OK`):**
  ```json
  { "first_name": "John", "city": "Pune", "country": "India", "exists": true }
  ```

---

### 2.11 Save User Details
`POST /user`

- **Request Body (JSON):**
  ```json
  { "first_name": "John", "city": "Pune", "country": "India" }
  ```
- **Response (`200 OK`):**
  ```json
  { "first_name": "John", "city": "Pune", "country": "India", "exists": true }
  ```

---

### 2.12 Get Detected OS
`GET /os`

- **Response (`200 OK`):**
  ```json
  "windows"
  ```

---

### 2.13 Register Service URL
`POST /services`

- **Request Body (JSON):**
  ```json
  { "service_name": "operator", "url": "http://127.0.0.1:9003" }
  ```
- **Response (`200 OK`):**
  ```json
  { "status": "success", "service_name": "operator" }
  ```

---

### 2.14 Get Registered Services
`GET /services`

- **Response (`200 OK`):**
  ```json
  { "operator": "http://127.0.0.1:9003", "engine": "http://127.0.0.1:9007" }
  ```

---

### 2.15 Get Applications & Permissions
`GET /apps`

- **Response (`200 OK`):**
  ```json
  [{ "app_name": "Code", "app_id": "code.exe", "allowed_to_capture": true }]
  ```

---

### 2.16 Refresh Applications
`POST /apps/refresh`

- **Response (`200 OK`):**
  ```json
  { "status": "success", "total_apps": 25 }
  ```

---

### 2.17 Update App Permission
`POST /apps/permission`

- **Request Body (JSON):**
  ```json
  { "app_id": "chrome.exe", "allowed_to_capture": false }
  ```
- **Response (`200 OK`):**
  ```json
  { "status": "success", "app_id": "chrome.exe", "allowed_to_capture": false }
  ```

---

### 2.18 Get AI Providers
`GET /ai/providers`

- **Response (`200 OK`):**
  ```json
  ["gemini", "groq"]
  ```

---

### 2.19 Get All AI Configs
`GET /ai/configs`

- **Response (`200 OK`):**
  ```json
  [{ "llm_provider": "gemini", "total_keys": 1, "current_key": 0, "keys": ["AIza..."] }]
  ```

---

### 2.20 Get AI Config by Provider
`GET /ai/configs/{provider}`

- **Path Parameters:**
  - `provider` (string, required): `gemini`, `groq`.
- **Response (`200 OK`):**
  ```json
  { "llm_provider": "gemini", "total_keys": 1, "current_key": 0, "keys": ["AIza..."] }
  ```

---

### 2.21 Update AI Config
`POST /ai/configs/{provider}`

- **Path Parameters:**
  - `provider` (string, required): Provider name.
- **Request Body (JSON):**
  ```json
  { "add_key": "AIzaSy..." }
  ```
- **Response (`200 OK`):**
  ```json
  { "llm_provider": "gemini", "total_keys": 2, "current_key": 0 }
  ```

---

### 2.22 Delete AI Config
`DELETE /ai/configs/{provider}`

- **Path Parameters:**
  - `provider` (string, required): Provider name.
- **Response (`200 OK`):**
  ```json
  { "status": "success", "message": "Config deleted for gemini" }
  ```

---

### 2.23 Get AI Priorities
`GET /ai/priorities`

- **Response (`200 OK`):**
  ```json
  ["gemini", "groq"]
  ```

---

### 2.24 Update AI Priorities
`PUT /ai/priorities`

- **Request Body (JSON Array):**
  ```json
  ["groq", "gemini"]
  ```
- **Response (`200 OK`):**
  ```json
  ["groq", "gemini"]
  ```

---

### 2.25 Get News Configuration
`GET /news/config`

- **Response (`200 OK`):**
  ```json
  { "id": "gnews", "total_keys": 1, "current_key": 0, "keys": ["key1..."] }
  ```

---

### 2.26 Update News Configuration
`POST /news/config`

- **Request Body (JSON):**
  ```json
  { "add_key": "new_key" }
  ```
- **Response (`200 OK`):**
  ```json
  { "id": "gnews", "total_keys": 2, "current_key": 0 }
  ```

---

### 2.27 Delete News Configuration
`DELETE /news/config`

- **Response (`200 OK`):**
  ```json
  { "status": "success", "message": "GNews config cleared" }
  ```

---

### 2.28 Get Engine Workers Config
`GET /engine/workers`

- **Response (`200 OK`):**
  ```json
  { "chat_workers": 1, "screenshot_extraction_workers": 1, "screenshot_summarization_workers": 1 }
  ```

---

### 2.29 Update Engine Workers Config
`PUT /engine/workers`

- **Request Body (JSON):**
  ```json
  { "chat_workers": 2 }
  ```
- **Response (`200 OK`):**
  ```json
  { "chat_workers": 2 }
  ```

---

### 2.30 System Storage Status
`GET /system/storage`

- **Response (`200 OK`):**
  ```json
  { "database_size_bytes": 1048576, "total_logs": 150, "total_chats": 20 }
  ```

---

### 2.31 Encrypt Data
`POST /crypto/encrypt`

- **Request Body (JSON):**
  ```json
  { "plaintext": "secret_data" }
  ```
- **Response (`200 OK`):**
  ```json
  { "ciphertext": "base64..." }
  ```

---

### 2.32 Decrypt Data
`POST /crypto/decrypt`

- **Request Body (JSON):**
  ```json
  { "ciphertext": "base64..." }
  ```
- **Response (`200 OK`):**
  ```json
  { "plaintext": "secret_data" }
  ```

---

### 2.33 Batch Encrypt Data
`POST /crypto/encrypt-batch`

- **Request Body (JSON):**
  ```json
  { "plaintexts": ["secret1", "secret2"] }
  ```
- **Response (`200 OK`):**
  ```json
  { "ciphertexts": ["base64_1...", "base64_2..."] }
  ```

---

### 2.34 Batch Decrypt Data
`POST /crypto/decrypt-batch`

- **Request Body (JSON):**
  ```json
  { "ciphertexts": ["base64_1...", "base64_2..."] }
  ```
- **Response (`200 OK`):**
  ```json
  { "plaintexts": ["secret1", "secret2"] }
  ```

---

### 2.35 Get Chat Sessions
`GET /chats/sessions`

- **Query Parameters:**
  - `limit` (integer, optional, default: `10`): Page size.
  - `page` (integer, optional): Page number.
  - `cursor` (string, optional): Pagination cursor.
- **Response (`200 OK`):**
  ```json
  { "sessions": [{ "session_id": "sid_1", "chat_name": "New Chat" }], "total_items": 1 }
  ```

---

### 2.36 Get Chats by Session
`GET /chats/sessions/{session_id}`

- **Path Parameters:**
  - `session_id` (string, required): Session ID.
- **Response (`200 OK`):**
  ```json
  { "session_id": "sid_1", "messages": [{ "role": "user", "content": "hello" }] }
  ```

---

### 2.37 Create Chat Message
`POST /chats`

- **Request Body (JSON):**
  ```json
  { "session_id": "sid_1", "role": "user", "content": "hello" }
  ```
- **Response (`201 Created`):**
  ```json
  { "id": "msg_1", "session_id": "sid_1", "role": "user", "content": "hello" }
  ```

---

### 2.38 Rename Chat Session
`PATCH /chats/sessions/{session_id}`

- **Path Parameters:**
  - `session_id` (string, required): Session ID.
- **Request Body (JSON):**
  ```json
  { "chat_name": "Renamed Session" }
  ```
- **Response (`200 OK`):**
  ```json
  { "status": "success", "session_id": "sid_1", "chat_name": "Renamed Session" }
  ```

---

### 2.39 Delete Chat Session
`DELETE /chats/sessions/{session_id}`

- **Path Parameters:**
  - `session_id` (string, required): Session ID.
- **Response (`200 OK`):**
  ```json
  { "status": "success", "message": "Chat session deleted." }
  ```

---

### 2.40 Delete All Chats
`DELETE /chats/all`

- **Response (`200 OK`):**
  ```json
  { "status": "success", "deleted_count": 20 }
  ```

---

### 2.41 Cleanup Duplicate Chats
`POST /chats/cleanup`

- **Response (`200 OK`):**
  ```json
  { "status": "success", "deleted": 0 }
  ```

---

### 2.42 Get Latest Daily Suggestions
`GET /daily_suggestions/latest`

- **Response (`200 OK`):**
  ```json
  { "id": 1, "suggestions": ["Task 1"], "completed": [], "weather": {}, "news": [] }
  ```

---

### 2.43 Get Previous Daily Suggestions
`GET /daily_suggestions/previous`

- **Query Parameters:**
  - `skip_today` (boolean, optional, default: `true`): Exclude current day.
- **Response (`200 OK`):**
  ```json
  { "id": 1, "suggestions": ["Task 1"], "completed": [0] }
  ```

---

### 2.44 Get Daily Suggestions History
`GET /daily_suggestions/history`

- **Query Parameters:**
  - `days` (integer, optional, default: `14`): Number of historical days.
- **Response (`200 OK`):**
  ```json
  [{ "id": 1, "date_suggestions": "2026-10-27", "suggestions": [] }]
  ```

---

### 2.45 Save Daily Suggestions
`POST /daily_suggestions`

- **Request Body (JSON):**
  ```json
  { "suggestions": ["Task 1", "Task 2"], "weather": {} }
  ```
- **Response (`200 OK`):**
  ```json
  { "id": 1, "status": "saved" }
  ```

---

### 2.46 Update Suggestion Completion
`POST /daily_suggestions/completed`

- **Request Body (JSON):**
  ```json
  { "index": 0, "completed": true, "record_id": 1 }
  ```
- **Response (`200 OK`):**
  ```json
  { "status": "success", "completed": [0] }
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
