# MIRA — Project Overview

## 1. What Is MIRA?

MIRA is a personal AI assistant designed to collect and organize useful personal information, remember important details, retrieve relevant context, and help users continue their work through text or voice interactions.

The initial design prioritizes local information management and controlled sharing of relevant context with cloud AI models.

## 2. Planned Features

- **Personal Knowledge Base:** Store personal information, notes, files, and digital activity locally.
- **Smart Memory:** Remember important details, preferences, and past activities.
- **Contextual Recall:** Retrieve relevant information from past activities and conversations.
- **AI Chat:** Answer questions using relevant personal context.
- **Voice Assistant:** Support voice interaction through cloud AI models.
- **Privacy Control:** Send only relevant information to cloud AI models.
- **Project Continuity:** Remember project details and help continue unfinished work.

## 3. Future Scope — Advanced Features

- **Proactive Job Search:** Find suitable job opportunities and notify the user.
- **Personalized Learning:** Discover relevant courses, tutorials, and study resources.
- **Daily Planning:** Create personalized daily schedules and task plans.
- **Scheduled News:** Deliver personalized news at a specified time, such as 10 AM.
- **Smart Recommendations:** Suggest music, movies, and other content based on preferences.
- **Weekend Planning:** Recommend activities and plans for weekends.
- **Smart Reminders:** Remind the user about tasks, goals, and recurring routines.
- **Activity Insights:** Identify patterns in activities and suggest useful actions.
- **Computer Automation:** Perform supported computer tasks with permission.
- **Personalized Assistance:** Learn from preferences and adapt recommendations over time.

## 4. Architecture & Data Flow

MIRA is divided into six decoupled modules communicating through a centralized Message Broker, defined public interfaces, and asynchronous queues.

```text
                          ┌──────────────────┐
                          │      Client      │
                          │  User interaction│
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
│    Collector     │  │      Engine      │  │      Memory      │
│ Background data  │  │ LLM coordination │  │ Short/long-term  │
└──────────────────┘  └──────────────────┘  └──────────────────┘
                               ▲
                               │
                      ┌────────┴─────────┐
                      │      Vault       │
                      │  Secure storage  │
                      └──────────────────┘
```

### Main Data Flows

1. **Centralized Messaging Backbone:** Each and every module connects directly to the Message Broker for inter-module communication, job distribution, and event streaming.
2. **Background Memory Flow:** Collector pushes collected data batches to the Message Broker, which queues and forwards records to Memory via its callback URL.
3. **User Request Flow:** Client posts requests as jobs to the Message Broker, which routes them to Engine.
4. **Context Retrieval Flow:** Engine requests context from Memory through the Message Broker and receives context callbacks.
5. **AI Response Flow:** Engine processes jobs with cloud AI services and routes results back through the Message Broker to Client callback endpoints.
6. **Secure Internal Data Flow:** Authorized modules access credentials and internal configuration data through Vault's public interface.

Modules communicate strictly through defined public interfaces and the Message Broker rather than importing or modifying internal implementations directly.

## 5. Modules

### Message Broker

**Purpose:** Serve as the central asynchronous communication hub and job distribution system connecting all MIRA modules.

**Responsibilities:**
- Connect all MIRA modules (Client, Collector, Engine, Memory, Vault) through a unified messaging backbone.
- Provide a POST endpoint to add jobs and events into Redis Streams.
- Provide parallel GET endpoints / workers that consume streams concurrently and dispatch data to respective services with their callback URLs.
- Manage message delivery guarantees, tracking, retries, and acknowledgments.

**Technology Stack:**
- **Language:** Python
- **Message Store / Queue:** Redis (Redis Streams)
- **API Framework:** FastAPI
- **Async Concurrency:** Python `asyncio`
- **HTTP Client:** `httpx` (for callback dispatching)

**Endpoints & Processing Flow:**
1. **Job Ingestion (POST Endpoint):**
   - Receives jobs via `POST /jobs` from any module.
   - Accepts payload containing `job_id`, `target_service` (or `stream_name`), data `payload`, and `callback_url`.
   - Validates data and appends the job to the corresponding Redis Stream via `XADD`.
   - Returns an immediate response confirming the job is queued.
2. **Parallel Stream Consumers (GET Endpoints / Background Dispatchers):**
   - Multiple GET endpoints / consumer loops run in parallel (powered by `asyncio`), each listening to designated Redis streams for specific target services.
   - When a job arrives, the consumer reads the payload and dispatches an HTTP request to the target service's designated `callback_url`.
3. **Acknowledgment & Retries:**
   - Upon receiving a successful HTTP confirmation from the callback service, the message is acknowledged in the Redis Stream via `XACK`.
   - Failed or unacknowledged deliveries remain queued for retries based on configured policy.

### Collector

**Purpose:** Collect information in the background and extract useful data.

**Responsibilities:**
- Run background collection tasks.
- Extract useful information from collected sources.
- Send extracted data to Memory via Message Broker for processing and storage.

**Technology Stack:**
- **Language:** Rust
- **Screenshot capture:** `xcap`
- **Image comparison:** `image`
- **Image hashing:** `image-hash`
- **OCR:** Tesseract OCR
- **Async processing:** Tokio

**Configurable Constants:**
- `CAPTURE_INTERVAL_SECS` = 2
- `CHANGE_THRESHOLD_PERCENT` = 5
- `OCR_CACHE_SIZE` = 5
- `MEMORY_BATCH_INTERVAL_SECS` = 120

**Flow:**
1. **Capture:** Capture screenshot every `CAPTURE_INTERVAL_SECS = 2` seconds.
2. **Change Detection:** Detect screen changes by comparing the current screenshot with the previous one.
   - If the change is below `CHANGE_THRESHOLD_PERCENT = 5`, ignore the screenshot.
   - Otherwise, continue processing.
3. **Perceptual Hash:** Calculate perceptual hash for the current screenshot.
4. **OCR Cache Lookup:** Check OCR cache against all 5 cached images.
   - Precompute and store comparison data for each cached image.
   - If a sufficiently similar image is found, reuse its extracted text and update its last-used time.
   - If no match is found, run OCR to extract text and add the result to the cache.
   - Maintain the cache using LRU eviction, keeping a maximum of 5 entries.
5. **Queue Storage:** Add extracted text to the storage queue with its capture timestamp, recorded consistently with timezone information.
6. **Batch Dispatch:** Batch and send data to Memory via Message Broker's POST endpoint every `MEMORY_BATCH_INTERVAL_SECS = 120` seconds.
   - Use asynchronous processing.
   - Retry failed submissions and retain queued records until receipt confirmation is received.
7. **Privacy Controls:** Respect privacy controls by pausing collection when requested and excluding configured sensitive applications.

### Engine

**Purpose:** Coordinate AI requests and LLM interactions.

**Responsibilities:**
- Receive requests from Client and other modules.
- Coordinate jobs, workers, and model executions.
- Retrieve relevant context and call cloud LLM or embedding models.
- Return structured responses to the requesting modules.

**Technology Stack:**
- **Language:** Python
- **LLM integration:** LangChain
- **Workflow orchestration:** LangGraph (when needed)
- **Data validation:** Pydantic
- **Job queue:** Redis Streams (via Message Broker)
- **Workers:** Python + asyncio
- **API:** FastAPI (if HTTP endpoints are needed)

**Flow:**
1. **Requesting Module:** Generates a unique `job_id` and submits a job to Message Broker's POST endpoint with the `job_id`, payload, and callback URL.
2. **Message Broker:** Ingests the job into the appropriate Redis Stream and dispatches it in parallel to Engine.
3. **Worker:** Engine worker consumes and processes the job by calling the required LLM or embedding model.
4. **Worker:** Stores the result, updates the job status, and sends the result to the callback URL with the same `job_id`.
5. **Requesting Module:** Receives the response, matches it using its `job_id`, and continues its workflow.
6. **Failure Handling:** Failed jobs are retried; exhausted retries are marked as failed so the requesting module can handle the error.

### Memory

**Purpose:** Manage MIRA's short-term and long-term memory.

**Responsibilities:**
- Store information in appropriate formats.
- Organize short-term and long-term memory.
- Retrieve relevant information for other modules.
- Accept useful extracted data from Collector via Message Broker.

**Technology Stack:**
- **Language:** Python
- **Vector store:** Qdrant (local)
- **Embeddings:** Configurable embedding model through Engine
- **Metadata storage:** SQLite
- **Data validation:** Pydantic
- **Background processing:** Asyncio
- **Time handling:** Python datetime with timezone-aware timestamps

**Flow:**
1. **Receive Data:** Memory receives information from Collector or other modules via Message Broker dispatch to its callback URL, including text content, timestamp, source, and project/application details.
2. **Process Data:** Clean and structure the content, attach metadata, and generate embeddings through Engine.
3. **Store Data:** Save embeddings and searchable metadata in Qdrant; store additional records and memory relationships in SQLite.
4. **Short-Term Memory:** Keep recent events and context for quick retrieval and ongoing tasks.
5. **Long-Term Memory:** Retain important information, historical activity, preferences, and project progress beyond the short-term window.
6. **Receive Query:** Accept natural-language queries from Engine or another module.
7. **Understand Query:** Identify relevant time ranges, text keywords, project names, and semantic intent.
8. **Retrieve Results:** Combine metadata filtering (date, time, source, project) with keyword and vector similarity search.
9. **Rank Results:** Rank matching records using relevance, timestamp, and query intent.
10. **Return Context:** Return relevant records with their content, timestamps, and source references.

### Client

**Purpose:** Provide the user-facing interface.

**Responsibilities:**
- Receive user input.
- Send requests to Engine.
- Display text responses and support voice interaction.
- Present Engine's responses to the user.

**Technology Stack:**
- **Frontend:** React + TypeScript
- **Desktop framework:** Tauri 2
- **Backend:** Rust — system operations, file access, application launching, automation, and OS integrations.

### Vault

**Purpose:** Store sensitive and internal application data securely.

**Responsibilities:**
- Manage LLM API keys and other credentials.
- Store application configuration and logs.
- Provide controlled access to data needed by other modules.

Vault is an internal application component, not a user-facing module.

**Technology Stack:**

| Component | Technology | Purpose |
| :--- | :--- | :--- |
| **Language** | Rust | Secure storage operations |
| **Database** | SQLite + SQLCipher | Encrypted database with fast queries |
| **Key storage** | OS credential store via Rust `keyring` | Protect encryption keys |
| **File encryption** | XChaCha20-Poly1305 | Encrypt sensitive files and binary data |

**How It Works:**
1. MIRA generates a random encryption key.
2. Vault stores that key in the operating system's secure credential store.
3. SQLite data is encrypted at rest using SQLCipher.
4. Large files are encrypted individually using authenticated encryption.
5. Vault decrypts data only when an authorized MIRA component requests it.
6. Restrict access to the key and keep it in memory only while needed.
7. Key derivation: `key = hardcoded_prefix + credential_key + hardcoded_suffix`.