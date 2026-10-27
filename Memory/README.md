# Memory

The **Memory** module is the screenshot extraction, OCR text processing, visual change detection, and Knowledge Base vector storage service for MIRA.

---

## 1. Purpose

- **Screenshot Ingestion**: Consumes screenshot jobs from the `ocr_extraction` Redis stream.
- **Image Comparison**: Compares consecutive frames using OpenCV matrix diffs to filter unchanged views.
- **OCR Text Extraction**: Extracts structured text using Tesseract OCR and Windows UI Automation.
- **Context Enrichment**: Publishes extracted screen context to the `ocr_summarization` stream.
- **Knowledge Base Vector Store**: Manages vectorized daily memory collections in local Qdrant.
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
    "workers": { "is_running": true, "worker_count": 1 },
    "knowledge_base": { "is_running": true, "worker_count": 1 },
    "image_diff_threshold": 0.008
  }
  ```

---

### 2.3 Start Workers
`POST /workers/start`

- **Response (`200 OK`):**
  ```json
  { "status": "started", "workers": { "is_running": true }, "knowledge_base": { "is_running": true } }
  ```

---

### 2.4 Stop Workers
`POST /workers/stop`

- **Response (`200 OK`):**
  ```json
  { "status": "stopped", "workers": { "is_running": false }, "knowledge_base": { "is_running": false } }
  ```

---

### 2.5 List Knowledge Bases
`GET /knowledge-base`

- **Query Parameters:**
  - `start_date` (string, optional): Start date filter.
  - `end_date` (string, optional): End date filter.
  - `search` (string, optional): Search term.
  - `page` (integer, optional, default: `1`): Page number.
  - `limit` (integer, optional, default: `10`): Items per page.
- **Response (`200 OK`):**
  ```json
  {
    "status": "success",
    "total": 1,
    "page": 1,
    "limit": 10,
    "knowledge_bases": [{ "name": "kb-24_10_2026-25_10_2026" }]
  }
  ```

---

### 2.6 Delete Knowledge Base
`DELETE /knowledge-base/{name}`

- **Path Parameters:**
  - `name` (string, required): Knowledge Base collection name.
- **Response (`200 OK`):**
  ```json
  { "status": "success", "message": "Knowledge Base deleted successfully.", "name": "kb-name" }
  ```

---

### 2.7 Cleanup Expired Knowledge Bases
`POST /knowledge-base/cleanup`

- **Response (`200 OK`):**
  ```json
  { "status": "success", "deleted_count": 0, "deleted": [] }
  ```

---

### 2.8 Search Knowledge Base
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
      { "id": "uuid-1", "score": 0.94, "payload": { "app_name": "Code", "summarized_text": "..." } }
    ]
  }
  ```

---

### 2.9 Batch Ingestion
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

### 2.10 Extract Data
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

### 2.11 Process Job
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
Run from the `Memory/` directory:
```bash
python app.py
```
Or with Uvicorn:
```bash
uvicorn app:app --host 127.0.0.1 --port 9006
```
