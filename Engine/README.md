# Engine

The **Engine** module coordinates LLM orchestration, model executions, provider fallbacks, and AI workflows for MIRA.

---

## 1. Purpose

- **LLM Coordination & Orchestration**: Centrally manages prompt dispatching and execution across multiple AI providers.
- **Dynamic Vault Integration**: Fetches LLM provider priorities, API keys, active key indices, and worker settings from Vault at startup and stores them in memory.
- **Provider & Model Fallback**: Automatically rotates API keys on key expiration/invalidation, tries fallback models in configured order on model availability errors, and falls back across providers according to Vault's priority sequence.
- **Response Normalization**: Normalizes responses by stripping internal thinking tags (`<think>`, `<thought>`, `<reasoning>`) and provider-specific metadata.
- **Security & Key Masking**: Guarantees API keys and raw error traces are masked and never exposed in logs or user-facing messages.

---

## 2. Directory Structure

Engine/
├── __init__.py
├── start.py                   # General startup script: initializes config, starts OCR Summarization & web server
├── app.py                     # FastAPI service exposing /health, /status, /llm/call, /config/sync, /summarization/*
├── config.py                  # In-memory configuration store & Vault HTTP fetcher
├── requirements.txt           # Module dependencies
├── vault_logger.py            # Centralized logging to Vault with API key redaction
├── tests/
│   ├── test_api.py            # FastAPI endpoint tests
│   ├── test_llm.py            # LLM caller, parser, error analysis, and fallback tests
│   └── test_ocr_summarization.py # OCR summarization batch, mapping, and worker tests
├── ocr_summarization/
│   ├── __init__.py            # Public startup function start_ocr_summarization()
│   ├── broker_client.py       # Message Broker polling, publishing, and acknowledgement
│   ├── config.py              # Consumer group mappings & batch size constants
│   ├── summarizer.py          # Batch formatting, single LLM call, and 1-to-1 output mapping
│   └── worker.py              # Parallel non-blocking summarization worker manager
└── llm/
    ├── __init__.py            # Main public exports
    ├── caller.py              # Main LLM caller: call_llm(prompt, work)
    ├── config.json            # Model fallback lists & temperatures per work category
    ├── config.py              # Work configuration loader & Vault config coordinator
    ├── error_analysis.py      # Error classifier (Key, Model, Provider, Other) & key masker
    ├── gemini.py              # Google Gemini provider implementation
    ├── groq.py                # Groq provider implementation
    ├── main.py                # CLI runner and public wrapper
    └── response_parser.py     # Text extractor and reasoning tag stripper
```

---

## 3. Work & Model Configuration (`llm/config.json`)

Supported works, temperatures, and ordered model fallback lists:

```json
{
  "summarization": {
    "temperature": 0.1,
    "gemini": [
      "gemini-2.5-flash",
      "gemini-3.8-flash",
      "gemini-2.5-flash-lite",
      "gemini-1.5-flash"
    ],
    "groq": [
      "llama-3.3-70b-versatile",
      "qwen/qwen3.8-27b",
      "openai/gpt-oss-120b",
      "openai/gpt-oss-20b",
      "llama-3.1-8b-instant"
    ]
  },
  "chat": {
    "temperature": 0.7,
    "gemini": [
      "gemini-2.5-flash",
      "gemini-3.8-flash",
      "gemini-2.5-flash-lite",
      "gemini-1.5-flash"
    ],
    "groq": [
      "llama-3.3-70b-versatile",
      "qwen/qwen3.8-27b",
      "openai/gpt-oss-120b",
      "llama-3.1-8b-instant"
    ]
  },
  "extraction": {
    "temperature": 0.0,
    "gemini": [
      "gemini-2.5-flash",
      "gemini-3.8-flash",
      "gemini-2.5-flash-lite",
      "gemini-1.5-flash"
    ],
    "groq": [
      "llama-3.3-70b-versatile",
      "qwen/qwen3.8-27b",
      "openai/gpt-oss-120b",
      "llama-3.1-8b-instant"
    ]
  }
}
```

---

## 4. LLM Calling Flow & Fallback Architecture

```text
               call_llm(prompt, work)
                         │
                         ▼
             Vault Priority Sequence (e.g. Gemini -> Groq)
                         │
        ┌────────────────┴────────────────┐
        ▼                                 ▼
   [Try Gemini]                      [Try Groq]
        │                                 │
  Model Fallback                    Model Fallback
  1. gemini-2.5-flash               1. llama-3.3-70b-versatile
  2. gemini-3.8-flash               2. qwen/qwen3.8-27b
  3. gemini-2.5-flash-lite          3. openai/gpt-oss-120b
        │                                 │
  Key Rotation                      Key Rotation
  (Rotates on 401/Invalid/Expired)  (Rotates on 401/Invalid/Expired)
        │                                 │
        ▼ (if all fail)                   ▼ (if all fail)
  Shift to Next Provider ──────────► Final Friendly Failure Message
```

### Error Classification Rules:
- **`api_key_expired_or_invalid`**: Rotates to the next available API key in Vault configuration and retries the model. If all keys fail, returns control to the caller to switch to the next provider.
- **`model_unavailable`**: Automatically shifts to the next configured fallback model in `config.json`.
- **`provider_unavailable`**: Immediately returns control to the caller to switch to the next provider in the priority sequence.
- **All Providers Exhausted**: Returns `"The AI request could not be completed because no configured provider is currently available."`

---

## 5. API Endpoints

### 5.1 Health Check
`GET /health`
- **Response (`200 OK`):**
  ```json
  { "service": "Engine", "status": "online" }
  ```

### 5.2 Status
`GET /status`
- **Response (`200 OK`):**
  ```json
  {
    "service": "Engine",
    "status": "online",
    "active_provider": "gemini",
    "ai_priorities": ["gemini", "groq"],
    "workers": {
      "embedding_workers": 1,
      "llm_workers": 1,
      "screenshot_extraction_workers": 1,
      "screenshot_summarization_workers": 1,
      "screenshot_extraction_poll_time": 5.0,
      "screenshot_summarization_poll_time": 5.0,
      "embedding_poll_time": 5.0
    }
  }
  ```

### 5.3 Execute LLM Call
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
    "response": "The screen shows a code editor with Python files...",
    "work": "summarization",
    "provider": "groq"
  }
  ```

### 5.4 Synchronize Config from Vault
`POST /config/sync`
- **Response (`200 OK`):**
  ```json
  {
    "status": "success",
    "active_provider": "gemini",
    "ai_priorities": ["gemini", "groq"]
  }
  ```

### 5.5 OCR Summarization Status
`GET /summarization/status`
- **Response (`200 OK`):**
  ```json
  {
    "running": true,
    "num_workers": 1,
    "configured_workers": 1,
    "batch_size": 10,
    "poll_interval": 5.0,
    "total_jobs_processed": 0
  }
  ```

### 5.6 Control OCR Summarization Workers
- `POST /summarization/start` — Starts the background worker pool.
- `POST /summarization/stop` — Gracefully stops all active workers.

---

## 6. OCR Summarization Architecture

```text
Message Broker (CONSUMER_GROUP_OCR_TEXT_SUMMARIZATION)
                         │
                         ▼
             Parallel Workers Polling
             (screenshot_summarization_workers)
                         │
                         ▼
             Batch Preparation (Up to 10 jobs)
             [app_name, os, extracted_text]
                         │
                         ▼
             Single LLM Call (call_llm)
             work="summarization"
                         │
                         ▼
             1-to-1 Mapping & Output Job Creation
             [new UUID, original app, os, timestamp, summary]
                         │
                         ▼
             Publish to Message Broker (CONSUMER_GROUP_SUMMARY_EMBEDDING)
                         │
                 (If successful)
                         ▼
             Acknowledge & Delete from CONSUMER_GROUP_OCR_TEXT_SUMMARIZATION
```

