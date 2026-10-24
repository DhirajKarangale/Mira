# Memory

The **Memory** module is the screenshot extraction, OCR text processing, visual change detection, and Knowledge Base vector storage service for MIRA.

---

## 1. Purpose

- **Parallel Screenshot Extraction**: Ingests screenshot jobs from the `ocr_extraction` Redis stream.
- **Image Comparison**: Compares consecutive frames using OpenCV to filter unchanged frames.
- **OCR Text Extraction**: Extracts structured text using Tesseract OCR and Windows UI Automation.
- **Context Enrichment**: Publishes extracted screen context to the `ocr_summarization` stream.
- **Knowledge Base Vector Store**: Stores summarized embeddings in local Qdrant collections organized by date (`kb-DD_MM_YYYY-DD_MM_YYYY`).
- **Semantic Vector Retrieval**: Performs cosine similarity search with application and timestamp filters.

---

## 2. API Endpoints

### 2.1 Health Check
`GET /health`

- **Response (`200 OK`):**
  ```json
  { "service": "Memory", "status": "online" }
  ```

---

### 2.2 System & Worker Status
`GET /status`

- **Response (`200 OK`):**
  ```json
  {
    "service": "Memory",
    "status": "online",
    "workers": { "is_running": true, "worker_count": 1, "poll_time": 5.0 },
    "knowledge_base": { "is_running": true, "worker_count": 1, "poll_time": 1.0 },
    "image_diff_threshold": 0.008
  }
  ```

---

### 2.3 Start Workers
`POST /workers/start`

- **Response (`200 OK`):**
  ```json
  { "status": "started", "workers": { ... }, "knowledge_base": { ... } }
  ```

---

### 2.4 Stop Workers
`POST /workers/stop`

- **Response (`200 OK`):**
  ```json
  { "status": "stopped", "workers": { ... }, "knowledge_base": { ... } }
  ```

---

### 2.5 Knowledge Base Status
`GET /knowledge-base/status`

- **Response (`200 OK`):**
  ```json
  {
    "status": "online",
    "workers": { ... },
    "daily_knowledge_bases": [{ "name": "kb-24_10_2026-24_10_2026" }]
  }
  ```

---

### 2.6 List Knowledge Bases
`GET /knowledge-base`

- **Query Parameters:**
  - `start_date` (string, optional): Start date filter.
  - `end_date` (string, optional): End date filter.
  - `search` (string, optional): Search term.
  - `page` (integer, optional, default: `1`): Page number.
  - `limit` (integer, optional, default: `10`): Page size.
- **Response (`200 OK`):**
  ```json
  {
    "status": "success",
    "total": 1,
    "page": 1,
    "limit": 10,
    "knowledge_bases": [{ "name": "kb-24_10_2026-24_10_2026" }]
  }
  ```

---

### 2.7 Delete Knowledge Base
`DELETE /knowledge-base/{name}`

- **Path Parameters:**
  - `name` (string, required): Knowledge Base name.
- **Response (`200 OK`):**
  ```json
  { "status": "success", "message": "Knowledge Base '...' deleted successfully.", "name": "..." }
  ```

---

### 2.8 Cleanup Expired Knowledge Bases
`POST /knowledge-base/cleanup`

- **Response (`200 OK`):**
  ```json
  { "status": "success", "deleted_count": 0, "deleted": [] }
  ```

---

### 2.9 Get Retention Period
`GET /knowledge-base/retention`

- **Response (`200 OK`):**
  ```json
  { "status": "success", "retention_period": "Never auto delete" }
  ```

---

### 2.10 Search Knowledge Base
`POST /knowledge-base/search`

- **Request Body (JSON):**
  ```json
  {
    "query_vector": [0.01, -0.05],
    "limit": 5,
    "app_name": "Code",
    "timestamp_gte": 1729760000
  }
  ```
- **Response (`200 OK`):**
  ```json
  {
    "status": "success",
    "count": 1,
    "results": [
      {
        "id": "e4b52df3-...",
        "score": 0.942,
        "payload": { "app_name": "Code", "summarized_text": "..." }
      }
    ]
  }
  ```

---

### 2.11 Batch Ingestion
`POST /knowledge-base/batch-ingest`

- **Request Body (JSON):**
  ```json
  {
    "jobs": [
      { "app_name": "Code", "summarized_text": "...", "embedding": [0.01, -0.05] }
    ]
  }
  ```
- **Response (`200 OK`):**
  ```json
  { "status": "success", "ingested": 1 }
  ```

---

### 2.12 Direct Image & Text Extraction
`POST /extract`

- **Request Body (JSON):**
  ```json
  { "image_path": "E:/Screenshots/frame.png" }
  ```
- **Response (`200 OK`):**
  ```json
  { "status": "success", "extracted_text": "...", "shape": [1080, 1920, 3] }
  ```

---

### 2.13 Process Job
`POST /process-job`

- **Request Body (JSON):**
  ```json
  { "job_id": "job_1", "image_path": "E:/Screenshots/frame.png", "app_name": "Code" }
  ```
- **Response (`200 OK`):**
  ```json
  { "status": "processed", "success": true }
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
uvicorn app:app --host 127.0.0.1 --port 9006
```
