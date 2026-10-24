# Engine

The **Engine** module coordinates LLM orchestration, model execution, provider fallback, and AI workflows for MIRA.

---

## 1. Purpose

- **LLM Orchestration**: Coordinates prompt dispatching and execution across AI providers (Gemini, Groq).
- **Dynamic Vault Integration**: Synchronizes AI priorities, API keys, and worker concurrency limits from Vault.
- **Provider & Model Fallback**: Rotates invalid API keys and falls back across models and providers automatically.
- **Response Normalization**: Strips internal reasoning tags (`<think>`, `<thought>`) from completions.
- **OCR Summarization Pipeline**: Pulls extracted screen text from Message Broker, generates summaries and embeddings, and pushes to Knowledge Base queues.

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
    "workers": { "llm_workers": 1, "screenshot_summarization_workers": 1 },
    "ocr_summarization": { "running": true, "total_jobs_processed": 0 },
    "embedding_model": { "status": "ready", "model_name": "Qwen/Qwen3-Embedding-0.6B" }
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

### 2.4 OCR Summarization Status
`GET /summarization/status`

- **Response (`200 OK`):**
  ```json
  { "running": true, "num_workers": 1, "batch_size": 10, "total_jobs_processed": 0 }
  ```

---

### 2.5 Start OCR Summarization
`POST /summarization/start`

- **Response (`200 OK`):**
  ```json
  { "status": "started", "details": { "running": true } }
  ```

---

### 2.6 Stop OCR Summarization
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

### 2.8 Execute LLM Call
`POST /llm/call`

- **Request Body (JSON):**
  ```json
  {
    "prompt": "Summarize the key events in this OCR text...",
    "work": "summarization"
  }
  ```
- **Response (`200 OK`):**
  ```json
  {
    "response": "The screen shows a code editor...",
    "work": "summarization",
    "provider": "gemini"
  }
  ```

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
uvicorn app:app --host 127.0.0.1 --port 9007
```
