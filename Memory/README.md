# Memory

The **Memory** module is the screenshot extraction, OCR text processing, visual change detection, and context enrichment service for MIRA.

---

## 1. Purpose

- **Parallel Screenshot Extraction**: Ingests screenshot jobs from the `ocr_extraction` Redis stream in parallel.
- **Image Comparison**: Compares consecutive frames of the same application using OpenCV `cv2.absdiff()` to filter unchanged frames.
- **OCR Text Extraction**: Extracts text with bounding boxes using Tesseract OCR, grouping text into logical UI regions.
- **Context Enrichment**: Enriches UI regions and changes via Vision-Language Models (VLM) when deeper context is needed.
- **Activity Tracking**: Aggregates screen observations into application activities and publishes context to `ocr_summarization`.

---

## 2. API Endpoints

### 2.1 Health Check
`GET /health`

- **Response (`200 OK`):**
  ```json
  { "service": "Memory", "status": "online" }
  ```

---

### 2.2 Worker Status
`GET /status`

- **Response (`200 OK`):**
  ```json
  {
    "service": "Memory",
    "status": "online",
    "workers": {
      "running": true,
      "num_workers": 1,
      "poll_interval": 5.0,
      "jobs_processed": 0
    },
    "image_diff_threshold": 0.05
  }
  ```

---

### 2.3 Start Workers
`POST /workers/start`

- **Response (`200 OK`):**
  ```json
  { "status": "started", "workers": { "running": true, "num_workers": 1 } }
  ```

---

### 2.4 Stop Workers
`POST /workers/stop`

- **Response (`200 OK`):**
  ```json
  { "status": "stopped", "workers": { "running": false } }
  ```

---

### 2.5 Extract Data
`POST /extract`

- **Request Body (JSON):**
  ```json
  { "image_path": "E:/Screenshots/frame_1.png" }
  ```
- **Response (`200 OK`):**
  ```json
  {
    "status": "success",
    "shape": [1080, 1920, 3],
    "grayscale_shape": [1080, 1920],
    "extracted_text": "Extracted text content..."
  }
  ```

---

### 2.6 Process Job
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

## 3. Installation & Startup

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
