# MIRA — Memory Module

The **Memory** module is responsible for the screenshot extraction pipeline, OCR text extraction, visual change detection, and preparation of context records for long-term intelligence and recall in MIRA.

---

## 1. Submodule Overview: Parallel Screenshot Extraction

The Screenshot Extraction submodule ingests captured screenshot jobs dispatched by the **Operator** into the `ocr_extraction` Redis Stream via the **Message Broker**. It operates multiple asynchronous extraction workers in parallel to detect frame changes, deduplicate screenshots, run OCR, and route newly extracted records forward to `ocr_summarization`.

```text
               ┌────────────────────────────────────────┐
               │         Operator (Rust Engine)         │
               │ Takes screenshots -> POST /jobs        │
               └───────────────────┬────────────────────┘
                                   │
                                   ▼
               ┌────────────────────────────────────────┐
               │             Message Broker             │
               │ Stream: mira:stream:ocr_extraction     │
               └───────────▲────────────────┬───────────┘
                           │                │
            (1) Poll jobs  │                │ (8) Publish ocr_summarization
                           │                │ (9) Remove ocr_extraction
                           │                ▼
               ┌────────────────────────────────────────┐
               │    Memory: Screenshot Extraction Pool  │
               │  - Worker 1 ... Worker N in parallel   │
               │  - cv2.absdiff App Image Comparison    │
               │  - Tesseract OCR Text Extraction       │
               │  - Vault Logging & Operator Deletion   │
               └───────────────────┬────────────────────┘
                                   │
                                   ▼ (2, 4)
               ┌────────────────────────────────────────┐
               │       Redis Image Comparison Data      │
               │  (Retains only 10 most recent images)  │
               └────────────────────────────────────────┘
```

---

## 2. Architecture & Scripts

Following the modular design of MIRA, the submodule is organized into decoupled scripts:

### 2.1 Data Extraction Script (`data_extractor.py`)
Accepts an image path as input and provides two primary functions:
- `extract_text_from_image(image_path: str) -> str`: Performs optical character recognition using Tesseract OCR (`pytesseract`).
- `extract_pixels_and_grayscale(image_path: str) -> Tuple[np.ndarray, np.ndarray]`: Extracts raw pixel values (BGR/RGB array) and the 2D grayscale image matrix using OpenCV.

### 2.2 Redis Storage & Image Comparison Script (`image_comparison.py`)
- Communicates **exclusively** with Message Broker HTTP APIs (never accessing Redis directly).
- Stores and retrieves image pixel values and grayscale matrices for the 10 most recent images in Redis.
- Implements array serialization to compact base64 JSON structures.
- Compares **only** images belonging to the same application using `cv2.absdiff(previous_gray, current_gray)`.
- Handles dimension changes seamlessly (e.g. window resizes) before calculating pixel differences.

### 2.3 Screenshot Extraction Worker (`screenshot_worker.py`)
- Runs multiple worker loops in parallel as asynchronous tasks.
- Polls the `ocr_extraction` stream through Message Broker using the configurable `screenshot_extraction_poll_time` fetched from Vault.
- Automatically queries Vault (`GET /engine/workers`) for `screenshot_extraction_workers` and `screenshot_extraction_poll_time`.
- Defines `IMAGE_DIFF_THRESHOLD` (default `0.02`, i.e., 2% difference) at the top of the script.

### 2.4 FastAPI Service Lifecycle (`app.py`)
- Integrates worker orchestration into the FastAPI lifespan.
- Automatically launches workers when the service starts and stops them cleanly on shutdown.
- Exposes health check (`GET /health`), worker telemetry (`GET /status`), manual control (`POST /workers/start`, `POST /workers/stop`), and testing endpoints (`POST /extract`, `POST /process-job`).

---

## 3. The 9-Step Processing Workflow

For each job received from `ocr_extraction`:

1. **Extract Image Data:** Extract pixel values and the grayscale matrix from `image_path` using `extract_pixels_and_grayscale()`.
2. **App Comparison:** Retrieve previous image data from Redis via Message Broker and compare images from the **same application** using OpenCV `cv2.absdiff()`.
3. **Difference Threshold Check:**
   - If the difference is below `IMAGE_DIFF_THRESHOLD`:
     - Call the Operator API (`POST /delete`) to delete the screenshot.
     - Remove the job from `ocr_extraction` (`DELETE /jobs?consumer_key=ocr_extraction&job_id={job_id}`).
     - Skip further processing.
4. **Redis Cache:** If the difference meets or exceeds the threshold (or this is the application's first frame), store the current image data in Redis via Message Broker, retaining only the 10 most recent images across the system.
5. **OCR Extraction:** Extract text from the screenshot using OCR (`extract_text_from_image()`).
6. **Delete Screenshot:** Call the Operator API (`POST /delete`) to delete the screenshot file from disk.
7. **Create Summarization Job:** Construct a new job payload containing:
   - `job_id`: Generated UUID (v4)
   - `app_name`: Target application name
   - `os`: Client operating system
   - `extracted_text`: Text extracted by OCR
8. **Publish Job:** Publish the new job to `ocr_summarization` via Message Broker (`POST /jobs`).
9. **Acknowledge Job:** Remove the completed job from `ocr_extraction` via Message Broker (`DELETE /jobs`).

---

## 4. Message Broker APIs for Image Comparison

All Redis operations are executed through the Message Broker:

| Method | Endpoint | Description |
|---|---|---|
| `POST` | `/images/comparison` | Stores pixel values and grayscale matrix; retains 10 most recent images |
| `GET` | `/images/comparison` | Retrieves up to 10 most recent image comparison records |
| `GET` | `/images/comparison/search` | Searches recent records matching `app_name` |
| `GET` | `/images/comparison/{image_id}` | Retrieves specific image comparison data by ID |
| `DELETE` | `/images/comparison/{image_id}` | Removes a specific image comparison record |
| `DELETE` | `/images/comparison` | Removes images by ID, `app_name`, or `all=true` |

---

## 5. Running the Service

### 5.1 As Part of MIRA Starter
The unified starter (`start.py`) will automatically launch Memory as service #5 on port 9005:
```bash
python start.py
```

### 5.2 Standalone Service
```bash
cd Memory
pip install -r requirements.txt
python app.py
```
Or with Uvicorn:
```bash
uvicorn app:app --host 127.0.0.1 --port 9005
```

### 5.3 Standalone Worker Process
```bash
cd Memory
python screenshot_worker.py
```

---

## 6. Running Tests

Run the test suite covering data extraction, image comparison, Redis 10-item retention, Message Broker APIs, and worker workflow:
```bash
pytest Memory/tests
```
