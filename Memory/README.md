# Memory

The **Memory** module is the screenshot extraction, OCR text processing, visual change detection, and context enrichment service for MIRA.

---

## 1. Purpose

- **Parallel Screenshot Extraction**: Ingests screenshot jobs from the `ocr_extraction` Redis stream in parallel.
- **Image Comparison**: Compares consecutive frames using OpenCV difference comparisons to filter unchanged frames.
- **OCR Text Extraction**: Extracts structured text using Tesseract OCR and Windows UI Automation.
- **Context Enrichment**: Publishes extracted screen context to the `ocr_summarization` stream for downstream AI workflows.

---

## 2. Architecture & Submodule Structure

The Memory module organizes screenshot processing into a dedicated submodule:

```
Memory/
├── app.py                      # FastAPI application server and endpoints
├── config.py                   # Service configuration and service discovery
├── vault_logger.py             # Centralized logging to Vault
├── requirements.txt            # Python dependencies
├── README.md                   # Documentation
├── screenshot_processing/      # Dedicated screenshot processing submodule
│   ├── __init__.py             # Submodule public API exports
│   ├── worker.py               # Parallel extraction worker loop & broker coordination
│   ├── screenshot_worker.py    # Compatibility alias for worker
│   ├── data_extractor.py       # Tesseract OCR & structured UI text extraction
│   ├── image_comparison.py     # OpenCV frame diffing & Redis comparison storage
│   ├── region_comparator.py    # UI region IoU, text normalization & change detection
│   └── uia_extractor.py        # Windows UI Automation tree extraction & formatting
└── tests/                      # Unit and integration tests for Memory module
```

---

## 3. API Endpoints

### 3.1 Health Check
`GET /health`

- **Response (`200 OK`):**
  ```json
  { "service": "Memory", "status": "online" }
  ```

---

### 3.2 Worker Status
`GET /status`

- **Response (`200 OK`):**
  ```json
  {
    "service": "Memory",
    "status": "online",
    "workers": { "running": true, "num_workers": 1, "poll_interval": 5.0, "jobs_processed": 0 },
    "image_diff_threshold": 0.008
  }
  ```

---

### 3.3 Start Workers
`POST /workers/start`

- **Response (`200 OK`):**
  ```json
  { "status": "started", "workers": { "running": true, "num_workers": 1 } }
  ```

---

### 3.4 Stop Workers
`POST /workers/stop`

- **Response (`200 OK`):**
  ```json
  { "status": "stopped", "workers": { "running": false } }
  ```

---

### 3.5 Extract Data
`POST /extract`

- **Request Body (JSON):**
  ```json
  { "image_path": "E:/Screenshots/frame_1.png" }
  ```
- **Response (`200 OK`):**
  ```json
  {
    "status": "success",
    "image_path": "E:/Screenshots/frame_1.png",
    "shape": [1080, 1920, 3],
    "grayscale_shape": [1080, 1920],
    "extracted_text": "Extracted text content..."
  }
  ```

---

### 3.6 Process Job
`POST /process-job`

- **Request Body (JSON):**
  ```json
  {
    "job_id": "test_job_1",
    "app_name": "Code",
    "os": "Windows 11",
    "image_path": "E:/Screenshots/frame_1.png"
  }
  ```
- **Response (`200 OK`):**
  ```json
  { "status": "processed", "success": true }
  ```

---

## 4. Installation & Startup

### Install Dependencies
```bash
pip install -r requirements.txt
```

> **Note**: Requires Tesseract OCR installed on the system (e.g. `C:\Program Files\Tesseract-OCR`).

### Start Server
Run from the `Memory/` directory:
```bash
python app.py
```
Or with Uvicorn:
```bash
uvicorn app:app --host 127.0.0.1 --port 9006
```
