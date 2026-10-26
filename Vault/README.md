# Vault

The **Vault** is the centralized security, secret management, encrypted configuration storage, and audit logging service for MIRA.

---

## 1. Purpose

- **Encrypted Configurations**: Stores configurations in an encrypted SQLite database.
- **Audit Logging**: Collects and queries encrypted audit logs with retention cleanup.
- **Application Permissions**: Manages per-application capture permissions.
- **AI Management**: Stores AI credentials, provider priorities, and concurrency limits.
- **Cryptography Services**: Encrypts and decrypts sensitive data in transit and at rest.

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
  - `start_date` / `end_date` (string, optional): Filter by date (`YYYY-MM-DD`).
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
  { "retention_period": 30, "show_logs_operator": true }
  ```
- **Response (`200 OK`):**
  ```json
  { "retention_period": 30, "show_logs_operator": true }
  ```

---

### 2.8 Update Message Broker Configuration
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

### 2.9 Update Operator Configuration
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

### 2.10 Get User Details
`GET /user`

- **Response (`200 OK`):**
  ```json
  {
    "user_name": "User",
    "email": "user@example.com",
    "phone_number": "+1 555-019-2834",
    "city": "Pune",
    "state": "Maharashtra",
    "country": "India",
    "address": "Pune, Maharashtra, India",
    "postal_code": "411001",
    "latitude": 18.51957,
    "longitude": 73.85535,
    "exists": true
  }
  ```

---

### 2.11 Save User Details
`POST /user`

- **Request Body (JSON):**
  ```json
  {
    "user_name": "User",
    "email": "user@example.com",
    "phone_number": "+1 555-019-2834",
    "city": "Pune",
    "state": "Maharashtra",
    "country": "India",
    "address": "Pune, Maharashtra, India",
    "postal_code": "411001",
    "latitude": 18.51957,
    "longitude": 73.85535
  }
  ```
- **Response (`200 OK`):**
  ```json
  {
    "user_name": "User",
    "email": "user@example.com",
    "phone_number": "+1 555-019-2834",
    "city": "Pune",
    "state": "Maharashtra",
    "country": "India",
    "address": "Pune, Maharashtra, India",
    "postal_code": "411001",
    "latitude": 18.51957,
    "longitude": 73.85535,
    "exists": true,
    "message": "User details saved successfully"
  }
  ```

---

### 2.12 OS Detection
`GET /os`

- **Response (`200 OK`):**
  `"Windows 11"`

---

### 2.13 Services Registry
`GET /services`
- **Response (`200 OK`):**
  ```json
  { "vault": "http://127.0.0.1:9001", "operator": "http://127.0.0.1:9003" }
  ```

`POST /services`
- **Request Body (JSON):**
  ```json
  { "vault": "http://127.0.0.1:9001" }
  ```
- **Response (`200 OK`):**
  ```json
  { "status": "success", "services": { "vault": "http://127.0.0.1:9001" } }
  ```

---

### 2.14 Get Applications & Permissions
`GET /apps`

- **Response (`200 OK`):**
  ```json
  [{ "app_name": "Code", "app_id": "code.exe", "allowed_to_capture": true }]
  ```

---

### 2.15 Refresh Application Permissions
`POST /apps/refresh`

- **Request Body (JSON):**
  ```json
  [{ "app_name": "Code", "app_id": "code.exe" }]
  ```
- **Response (`200 OK`):**
  ```json
  [{ "app_name": "Code", "app_id": "code.exe", "allowed_to_capture": true }]
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
  { "status": "success", "message": "App permission updated successfully" }
  ```

---

### 2.17 AI Providers & Configurations
`GET /ai/providers`
- **Response (`200 OK`):** `["Groq", "Gemini", "OpenAI"]`

`GET /ai/configs`
- **Response (`200 OK`):**
  ```json
  [{ "llm_provider": "Groq", "total_keys": 1, "current_key": 0, "keys": ["gsk_..."] }]
  ```

`GET /ai/configs/{provider}`
- **Response (`200 OK`):**
  ```json
  { "llm_provider": "Groq", "total_keys": 1, "current_key": 0, "keys": ["gsk_..."] }
  ```

`POST /ai/configs/{provider}`
- **Request Body (JSON):**
  ```json
  { "keys": ["gsk_..."], "current_key": 0 }
  ```
- **Response (`200 OK`):**
  ```json
  { "llm_provider": "Groq", "total_keys": 1, "current_key": 0, "keys": ["gsk_..."] }
  ```

`DELETE /ai/configs/{provider}`
- **Response (`200 OK`):**
  ```json
  { "status": "success", "message": "Deleted AI configuration for Groq" }
  ```

---

### 2.18 AI Priorities
`GET /ai/priorities`
- **Response (`200 OK`):** `["Groq", "Gemini"]`

`PUT /ai/priorities`
- **Request Body (JSON):** `["Groq", "Gemini"]`
- **Response (`200 OK`):** `["Groq", "Gemini"]`

---

### 2.19 Engine Workers Concurrency
`GET /engine/workers`
- **Response (`200 OK`):**
  ```json
  {
    "chat_workers": 1,
    "screenshot_extraction_workers": 1,
    "screenshot_summarization_workers": 1,
    "embedding_vector_store_workers": 1,
    "chat_workers_poll_time": 1.0,
    "screenshot_extraction_poll_time": 5.0,
    "screenshot_summarization_poll_time": 5.0,
    "embedding_vector_store_workers_poll_time": 1.0
  }
  ```

`PUT /engine/workers`
- **Request Body (JSON):**
  ```json
  { "screenshot_extraction_workers": 2 }
  ```
- **Response (`200 OK`):**
  ```json
  { "screenshot_extraction_workers": 2, ... }
  ```

---

### 2.20 System Storage Paths
`GET /system/storage`

- **Response (`200 OK`):**
  ```json
  {
    "system_storage_path": "E:/FullStack/Mira/Vault/system",
    "knowledge_base_path": "E:/FullStack/Mira/Vault/system/knowledge_base",
    "logs_path": "E:/FullStack/Mira/Vault/system/logs"
  }
  ```

---

### 2.21 Cryptography Endpoints
- `POST /crypto/encrypt` -> Body: `{"data": "secret"}` -> `{"ciphertext": "..."}`
- `POST /crypto/decrypt` -> Body: `{"ciphertext": "..."}` -> `{"data": "secret"}`
- `POST /crypto/encrypt-batch` -> Body: `{"items": ["..."]}` -> `{"ciphertexts": ["..."]}`
- `POST /crypto/decrypt-batch` -> Body: `{"ciphertexts": ["..."]}` -> `{"items": ["..."]}`

---

## 3. Installation & Startup

### Install Dependencies
```bash
pip install -r requirements.txt
```

### Start Server
```bash
python app.py
```
Or with Uvicorn:
```bash
uvicorn app:app --host 127.0.0.1 --port 9001
```
