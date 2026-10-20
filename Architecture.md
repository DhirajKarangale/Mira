# MIRA — Architecture

MIRA is a personal AI assistant designed to collect digital activity, organize personal knowledge, remember context, and assist users through text and voice interactions.

---

## 1. System Architecture

All inter-module data transfers route through the central **Message Broker**. All application configurations, parameters, logs, and sensitive credentials are centrally stored and managed by **Vault**.

```text
                          ┌──────────────────┐
                          │      Client      │
                          │  User interface  │
                          └────────┬─────────┘
                                   │
                                   ▼
                    ┌──────────────────────────────┐
                    │        Message Broker        │
                    │   Redis Streams & HTTP API   │
                    └───▲──────┬────────▲──────┬───┘
                        │      │        │      │
         ┌──────────────┘      │        │      └──────────────┐
         ▼                     ▼        ▼                     ▼
┌──────────────────┐  ┌──────────────────┐  ┌──────────────────┐
│     Operator     │  │      Engine      │  │      Memory      │
│ OS ops & capture │  │ LLM coordination │  │ Image proc & RAM │
└──────────────────┘  └──────────────────┘  └──────────────────┘
         ▲                     ▲                      ▲
         │                     │                      │
         └──────────────┐      │      ┌───────────────┘
                        │      │      │
                     ┌──┴──────┴──────┴──┐
                     │       Vault       │
                     │  Config & Secrets │
                     └───────────────────┘
```

### Core Data Flows

1. **Centralized Messaging:** Every module uses the Message Broker for all inter-module data transfer activities, job queuing, and event streaming.
2. **Centralized Configuration & Logging:** Vault stores all module configurations, credentials, and system logs. Every module retrieves its configuration from Vault at startup.
3. **Capture Pipeline:** Operator runs as a Rust web service, captures screenshots and OS events, and transfers raw capture data directly to the Message Broker.
4. **Image Processing & Storage:** Memory consumes raw screenshots from the Message Broker, executes the image processing pipeline (frame comparison, perceptual hashing, LRU OCR caching, and OCR text extraction), and publishes extracted records to Redis Streams via Message Broker for later database persistence (Qdrant & SQLite).
5. **AI Interaction:** Client submits user queries through the Message Broker to Engine. Engine requests contextual history from Memory via the Message Broker, calls AI models, and routes answers back to Client via the Message Broker.

---

## 2. Modules

### Message Broker

* **What It Does:**
  * Acts as the central asynchronous communication hub and data transfer backbone for all MIRA modules.
  * Manages queues, event streams, delivery guarantees, retries, and job routing.
  * Facilitates all data transfers across the system.
* **Technology:**
  * **Language:** Python (`asyncio`, FastAPI, `httpx`)
  * **Queue / Stream Engine:** Redis (Redis Streams)

---

### Operator

* **What It Does:**
  * Performs all low-level operating system operations, desktop screen captures, and system automations.
  * Runs as an independent web service that exposes control APIs.
  * Streams raw screenshot frames and OS events directly to the Message Broker for all data transfer.
* **Technology:**
  * **Language:** Rust (strictly)
  * **Web Framework:** Axum / Actix-web
  * **Screen Capture:** `xcap`
  * **Async Runtime:** Tokio
  * **HTTP Client:** `reqwest`

---

### Memory

* **What It Does:**
  * Ingests raw screenshots from the Message Broker and handles the complete image processing pipeline: frame comparison, perceptual hashing, LRU OCR caching, and OCR text extraction.
  * Publishes extracted text and metadata into Redis Streams via the Message Broker for subsequent database persistence.
  * Organizes short-term memory (recent activities) and long-term memory (historical interactions, notes, preferences).
  * Performs semantic vector search and keyword retrieval to supply relevant context to Engine upon request.
* **Technology:**
  * **Language:** Python (`asyncio`, Pydantic)
  * **Image Processing & Hashing:** Pillow, ImageHash
  * **OCR Engine:** Tesseract OCR (`pytesseract`)
  * **Vector Database:** Qdrant (local)
  * **Metadata Storage:** SQLite

---

### Engine

* **What It Does:**
  * Coordinates AI workflows, prompt construction, and model executions.
  * Queries Memory through the Message Broker for relevant context.
  * Calls local or cloud LLM / embedding models and dispatches structured responses back to Client via the Message Broker.
* **Technology:**
  * **Language:** Python (`asyncio`, Pydantic)
  * **AI & Workflow Orchestration:** LangChain, LangGraph

---

### Client

* **What It Does:**
  * Provides the desktop user interface for chat, voice assistant, activity insights, and manual controls.
  * Sends user requests to the Message Broker and presents streamed or completed AI responses.
* **Technology:**
  * **Frontend:** React, TypeScript
  * **Desktop Framework:** Tauri 2 (Rust shell)
  * **Networking:** HTTP / WebSocket to Message Broker

---

### Vault

* **What It Does:**
  * Centralized, encrypted store for all system and module configurations (timing intervals, change thresholds, cache limits, service endpoints, feature flags).
  * Securely stores LLM API keys, master credentials, and encryption keys.
  * Centrally stores and manages application logs and audit trails across all modules.
  * Serves configurations to all modules at startup and broadcasts configuration sync events via the Message Broker.
* **Technology:**
  * **Language:** Python
  * **Encrypted Database:** SQLite + SQLCipher (`sqlcipher3`)
  * **Key Storage:** OS Credential Store (via Python `keyring`)
  * **Cryptography & Encryption:** `cryptography` (ChaCha20-Poly1305 / AES-GCM)