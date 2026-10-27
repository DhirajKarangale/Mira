# Engine

The **Engine** module coordinates LLM orchestration, model execution, prompt workflows, chat conversations, and daily suggestions for MIRA.

---

## 1. Purpose

- **LLM Orchestration**: Dispatches prompts across configured AI providers (Gemini, Groq) with automatic fallback and key rotation.
- **Agentic Chat**: Manages real-time multi-turn conversations over WebSocket and REST, retrieving memories and context.
- **Daily Suggestions Pipeline**: Periodically generates weather summaries, local news, and contextual suggestions.
- **OCR Summarization Pipeline**: Pulls extracted screen text from Message Broker, generates summaries and embeddings, and pushes to Knowledge Base queues.
- **Configuration Synchronization**: Dynamically synchronizes AI credentials, priorities, and worker limits from Vault.

---

## 2. API Endpoints

### 2.1 Health Check
`GET /health`

- **Response (`200 OK`):**
  ```json
  { "service": "Engine", "status": "online" }
  ```

---

### 2.2 Status
`GET /status`

- **Response (`200 OK`):**
  ```json
  {
    "service": "Engine",
    "status": "online",
    "active_provider": "gemini",
    "ai_priorities": ["gemini", "groq"],
    "workers": { "chat_workers": 1 },
    "ocr_summarization": { "running": true }
  }
  ```

---

### 2.3 Embedding Status
`GET /embedding/status`

- **Response (`200 OK`):**
  ```json
  { "status": "ready", "model_name": "Qwen/Qwen3-Embedding-0.6B" }
  ```

---

### 2.4 Summarization Status
`GET /summarization/status`

- **Response (`200 OK`):**
  ```json
  { "running": true, "num_workers": 1, "batch_size": 10 }
  ```

---

### 2.5 Start Summarization
`POST /summarization/start`

- **Response (`200 OK`):**
  ```json
  { "status": "started", "details": { "running": true } }
  ```

---

### 2.6 Stop Summarization
`POST /summarization/stop`

- **Response (`200 OK`):**
  ```json
  { "status": "stopped", "details": { "running": false } }
  ```

---

### 2.7 Synchronize Configuration
`POST /config/sync`

- **Response (`200 OK`):**
  ```json
  { "status": "success", "active_provider": "gemini", "ai_priorities": ["gemini", "groq"] }
  ```

---

### 2.8 Get User Profile
`GET /user/profile`

- **Response (`200 OK`):**
  ```json
  { "name": "User", "city": "Pune", "country": "India" }
  ```

---

### 2.9 Update User Profile
`POST /user/profile`

- **Request Body (JSON):**
  ```json
  { "name": "User", "city": "Pune", "country": "India" }
  ```
- **Response (`200 OK`):**
  ```json
  { "status": "success" }
  ```

---

### 2.10 Execute LLM Call
`POST /llm/call`

- **Request Body (JSON):**
  ```json
  { "prompt": "Summarize this context...", "work": "summarization" }
  ```
- **Response (`200 OK`):**
  ```json
  { "response": "Summary content...", "provider": "gemini" }
  ```

---

### 2.11 Get Daily Suggestions
`GET /daily_suggestions`

- **Response (`200 OK`):**
  ```json
  {
    "status": "success",
    "today": { "suggestions": [], "completed": [], "weather": {}, "news": [] },
    "previous": { "suggestions": [], "completed": [] },
    "scheduler": { "running": true }
  }
  ```

---

### 2.12 Get Previous Daily Suggestions
`GET /daily_suggestions/previous`

- **Response (`200 OK`):**
  ```json
  { "suggestions": [], "completed": [] }
  ```

---

### 2.13 Refresh Daily Suggestions
`POST /daily_suggestions/refresh`

- **Request Body (JSON):**
  ```json
  { "section": "all" }
  ```
- **Response (`200 OK`):**
  ```json
  { "status": "refresh_triggered", "section": "all" }
  ```

---

### 2.14 Complete Daily Suggestion
`POST /daily_suggestions/complete`

- **Request Body (JSON):**
  ```json
  { "index": 0, "completed": true, "record_id": 1 }
  ```
- **Response (`200 OK`):**
  ```json
  { "status": "success", "completed": [0] }
  ```

---

### 2.15 Daily Suggestions Status
`GET /daily_suggestions/status`

- **Response (`200 OK`):**
  ```json
  { "running": true, "weather": { "status": "idle" }, "news": { "status": "idle" } }
  ```

---

### 2.16 Chat WebSocket
`WS /ws/chat`

- Real-time bidirectional streaming for chat token generation and session events.

---

### 2.17 List Chat Sessions
`GET /chats/sessions`

- **Query Parameters:**
  - `limit` (integer, optional, default: `10`): Items per page.
  - `page` (integer, optional): Page number.
  - `cursor` (string, optional): Pagination cursor.
- **Response (`200 OK`):**
  ```json
  { "sessions": [{ "session_id": "sid_1", "chat_name": "New Chat" }], "total_items": 1 }
  ```

---

### 2.18 Get Chat Messages by Session
`GET /chats/sessions/{session_id}`

- **Path Parameters:**
  - `session_id` (string, required): Session ID.
- **Response (`200 OK`):**
  ```json
  { "session_id": "sid_1", "messages": [{ "role": "user", "content": "hello" }] }
  ```

---

### 2.19 Send Chat Message
`POST /chats/message`

- **Request Body (JSON):**
  ```json
  { "session_id": "sid_1", "content": "How are you?" }
  ```
- **Response (`200 OK`):**
  ```json
  { "status": "queued", "session_id": "sid_1", "job_id": "job_1" }
  ```

---

### 2.20 Rename Chat Session
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

### 2.21 Delete Chat Session
`DELETE /chats/sessions/{session_id}`

- **Path Parameters:**
  - `session_id` (string, required): Session ID.
- **Response (`200 OK`):**
  ```json
  { "status": "success", "session_id": "sid_1" }
  ```

---

### 2.22 Delete All Chat Sessions
`DELETE /chats/all`

- **Response (`200 OK`):**
  ```json
  { "status": "success", "message": "All chat sessions and memories deleted successfully." }
  ```

---

### 2.23 Pending Chat Sessions
`GET /chats/pending`

- **Response (`200 OK`):**
  ```json
  { "pending_sessions": [] }
  ```

---

### 2.24 Chat Session Status
`GET /chats/sessions/{session_id}/status`

- **Path Parameters:**
  - `session_id` (string, required): Session ID.
- **Response (`200 OK`):**
  ```json
  { "session_id": "sid_1", "status": "idle" }
  ```

---

### 2.25 Chat Workers Status
`GET /chats/workers/status`

- **Response (`200 OK`):**
  ```json
  { "running": true, "worker_count": 1 }
  ```

---

### 2.26 Start Chat Workers
`POST /chats/workers/start`

- **Response (`200 OK`):**
  ```json
  { "status": "started" }
  ```

---

### 2.27 Stop Chat Workers
`POST /chats/workers/stop`

- **Response (`200 OK`):**
  ```json
  { "status": "stopped" }
  ```

---

### 2.28 Seed Demo Chats
`POST /chats/seed`

- **Query Parameters:**
  - `count` (integer, optional, default: `12`): Number of demo sessions to create.
- **Response (`200 OK`):**
  ```json
  { "status": "success", "seeded_count": 12 }
  ```

---

## 3. Installation & Startup

### Install Dependencies
```bash
pip install -r requirements.txt
```

### Start Server
Run from the `Engine/` directory:
```bash
python app.py
```
Or with Uvicorn:
```bash
uvicorn app:app --host 127.0.0.1 --port 9007
```
