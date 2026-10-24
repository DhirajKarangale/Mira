# Memory

The **Memory** module is the screenshot extraction, OCR text processing, visual change detection, and Knowledge Base vector storage service for MIRA.

---

## 1. Purpose

- **Parallel Screenshot Extraction**: Ingests screenshot jobs from the `ocr_extraction` Redis stream in parallel.
- **Image Comparison**: Compares consecutive frames using OpenCV difference comparisons to filter unchanged frames.
- **OCR Text Extraction**: Extracts structured text using Tesseract OCR and Windows UI Automation.
- **Context Enrichment**: Publishes extracted screen context to the `ocr_summarization` stream for downstream AI workflows.
- **Knowledge Base Vector Store**: Ingests summarized contextual embedding jobs from `embedding_memory` in parallel batches into Qdrant vector databases organized monthly (`kb_DD_MM_YYYY`).
- **Encrypted Local Storage**: Encrypts stored Knowledge Base payloads using Vault encryption, keeping keys internal to Vault and never exposing them through APIs.

---

## 2. Architecture & Submodule Structure

The Memory module organizes its functionality into dedicated submodules:

```
Memory/
├── app.py                      # FastAPI application server and endpoints
├── config.py                   # Service configuration, worker settings, and storage discovery
├── vault_logger.py             # Centralized logging to Vault
├── requirements.txt            # Python dependencies (including qdrant-client)
├── README.md                   # Documentation
├── screenshot_processing/      # Screenshot ingestion and visual diffing submodule
│   ├── __init__.py             # Submodule public API exports
│   ├── worker.py               # Parallel extraction worker loop & broker coordination
│   ├── screenshot_worker.py    # Compatibility alias for worker
│   ├── data_extractor.py       # Tesseract OCR & structured UI text extraction
│   ├── image_comparison.py     # OpenCV frame diffing & Redis comparison storage
│   ├── region_comparator.py    # UI region IoU, text normalization & change detection
│   └── uia_extractor.py        # Windows UI Automation tree extraction & formatting
├── knowledge_base/             # Knowledge base vector store submodule
│   ├── __init__.py             # Submodule public API exports
│   ├── config.py               # KB-specific batch constants and broker/vault URLs
│   ├── encryption.py           # Vault-backed encryption & decryption client
│   ├── storage.py              # Monthly knowledge base directory management (kb_DD_MM_YYYY)
│   ├── qdrant_store.py         # Local Qdrant client, collection & payload indexing
│   ├── broker_client.py        # Message Broker polling & job acknowledgment
│   └── worker.py               # Parallel KB workers & batch ingestion orchestration
└── tests/                      # Unit and integration tests for Memory module
    ├── test_knowledge_base.py  # Tests for KB storage, Qdrant, encryption, and workers
    ├── test_memory_api.py      # Tests for Memory endpoints
    ├── test_pipeline_integration.py
    └── test_screenshot_processing.py
```

---

## 3. Knowledge Base Submodule

### 3.1 Worker Concurrency & Batch Ingestion
- Configured dynamically via Vault's `embedding_vector_store_workers` and `embedding_vector_store_workers_poll_time`.
- Each worker continuously polls `CONSUMER_GROUP_EMBEDDING_MEMORY` through Message Broker.
- Retrieves up to 10 jobs per poll (configurable via `KB_BATCH_SIZE`).
- Ingests records into Qdrant in batches.
- Input jobs are acknowledged and removed from Message Broker **only after successful storage**. If storage encounters an error, jobs remain in the stream for retry without data loss.

### 3.2 Monthly Storage Organization
- Retrieves configured system storage path from Vault (or fallback `MIRA_SYSTEM_DIR`).
- Automatically creates `<system_storage_path>/knowledge_base` if not present.
- Reuses existing knowledge base created during current month (matching `kb_DD_MM_YYYY`); otherwise creates a new one using the current system date.

### 3.3 Qdrant Vector Storage & Payload Indexing
- Embedded local Qdrant instance per monthly knowledge base directory (`path=.../knowledge_base/kb_DD_MM_YYYY`).
- Stored fields:
  - `app_name`: String (Payload index: `KEYWORD`)
  - `os`: String (Payload index: `KEYWORD`)
  - `timestamp`: Integer unix timestamp (Payload index: `INTEGER`)
  - `summarized_text`: Vault-encrypted base64 ciphertext
  - `embedding`: Float vector directly stored (no re-embedding)
  - `job_id`: Ignored when storing records.

### 3.4 Encryption Guarantee
- Stored `summarized_text` is encrypted using Vault's internal encryption mechanism before Qdrant ingestion.
- Decrypted automatically upon retrieval when querying the Knowledge Base.
- Encryption keys remain strictly internal to Vault and are never exposed across APIs.

---

## 4. API Endpoints

### 4.1 Health Check
`GET /health`
```json
{ "service": "Memory", "status": "online" }
```

### 4.2 System & Worker Status
`GET /status`
```json
{
  "service": "Memory",
  "status": "online",
  "workers": {
    "is_running": true,
    "worker_count": 1,
    "poll_time": 5.0
  },
  "knowledge_base": {
    "is_running": true,
    "worker_count": 2,
    "poll_time": 1.0,
    "batch_size": 10,
    "total_jobs_processed": 0,
    "active_knowledge_base": "kb_24_10_2026",
    "active_kb_path": "E:\\FullStack\\Mira\\Vault\\system\\knowledge_base\\kb_24_10_2026",
    "total_points_in_active_kb": 2
  },
  "image_diff_threshold": 0.008
}
```

### 4.3 Start All Workers
`POST /workers/start`

### 4.4 Stop All Workers
`POST /workers/stop`

### 4.5 Knowledge Base Status
`GET /knowledge-base/status`
```json
{
  "status": "online",
  "workers": { ... },
  "monthly_knowledge_bases": [
    { "name": "kb_24_10_2026", "day": 24, "month": 10, "year": 2026 }
  ]
}
```

### 4.6 Search Knowledge Base
`POST /knowledge-base/search`
- **Request Body (JSON):**
  ```json
  {
    "query_vector": [0.01, -0.05, ...],
    "limit": 5,
    "app_name": "Google Chrome",
    "os": "Windows 11",
    "start_timestamp": 1729760000,
    "end_timestamp": 1729770000
  }
  ```
- **Response (`200 OK`):**
  ```json
  {
    "status": "success",
    "count": 1,
    "results": [
      {
        "id": "e4b52df3-b3c6-4d7a-8533-5c02452c6f14",
        "score": 0.942,
        "payload": {
          "app_name": "Google Chrome",
          "os": "Windows 11",
          "timestamp": 1729765000,
          "summarized_text": "User browsing technical documentation..."
        }
      }
    ]
  }
  ```

### 4.7 Direct Batch Ingestion
`POST /knowledge-base/batch-ingest`

---

## 5. Installation & Startup

### Install Dependencies
```bash
pip install -r requirements.txt
```

### Run Memory Service
```bash
python app.py
```

### Run Knowledge Base Workers Standalone
```bash
python knowledge_base/worker.py
```
