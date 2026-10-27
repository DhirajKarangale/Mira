# Message Broker

The **Message Broker** is the centralized asynchronous communication hub connecting all MIRA modules using Redis Streams, Consumer Groups, and FastAPI.

---

## 1. Purpose

- **Centralized Event Backbone**: Facilitates asynchronous, decoupled data exchange between MIRA modules.
- **Job Ingestion & Queuing**: Accepts jobs from producers (e.g. Operator) and stores them in Redis Streams.
- **Consumer Group Dispatch**: Distributes queued messages to dedicated worker consumer groups with acknowledgment semantics.
- **Image Comparison Cache**: Stores and manages recent frame matrices for OpenCV difference comparisons.

---

## 2. API Endpoints

### 2.1 Health Check
`GET /health`

- **Response (`200 OK`):**
  ```json
  { "service": "Message Broker", "status": "online" }
  ```

---

### 2.2 Add Job
`POST /jobs`

- **Request Body (JSON):**
  ```json
  {
    "job_id": "job_12345",
    "consumer_key": "ocr_extraction",
    "app_name": "Code",
    "image_path": "E:/Screenshots/frame_1.png"
  }
  ```
- **Response (`201 Created`):**
  ```json
  { "message": "successfully queued" }
  ```

---

### 2.3 Get Jobs
`GET /jobs`

- **Query Parameters:**
  - `consumer_key` (string, required): Consumer group key to poll.
  - `count` (integer, optional, default: `1`): Number of jobs to fetch.
- **Response (`200 OK`):**
  ```json
  [
    { "job_id": "job_12345", "consumer_key": "ocr_extraction", "image_path": "..." }
  ]
  ```

---

### 2.4 Delete Job
`DELETE /jobs`

- **Query Parameters:**
  - `consumer_key` (string, required): Consumer group key.
  - `job_id` (string, required): Job ID to acknowledge and delete.
- **Response (`200 OK`):**
  ```json
  { "message": "successfully deleted" }
  ```

---

### 2.5 List Consumer Groups
`GET /redis/consumer-groups`

- **Query Parameters:**
  - `raw` (boolean, optional, default: `false`): If `true`, returns flat list of group names.
- **Response (`200 OK`):**
  ```json
  [
    { "group_name": "CONSUMER_GROUP_SCREENSHOT_PROCESS", "pending_messages_count": 0, "status": "idle" }
  ]
  ```

---

### 2.6 Delete Consumer Group
`DELETE /redis/consumer-groups/{group_name}`

- **Path Parameters:**
  - `group_name` (string, required): Target consumer group name.
- **Response (`200 OK`):**
  ```json
  { "message": "Consumer group deleted successfully", "destroyed": true }
  ```

---

### 2.7 Clean Consumer Groups
`POST /redis/clean`

- **Request Body (JSON, Optional):**
  ```json
  { "group_name": "CONSUMER_GROUP_SCREENSHOT_PROCESS", "reset_stream": false }
  ```
- **Response (`200 OK`):**
  ```json
  { "message": "Successfully cleaned 0 pending message(s)", "cleaned_count": 0 }
  ```

---

### 2.8 Format Entire Redis
`POST /redis/format`

- **Response (`200 OK`):**
  ```json
  { "status": "success", "initialized_groups": 9 }
  ```

---

### 2.9 Store Image Comparison Data
`POST /images/comparison`

- **Request Body (JSON):**
  ```json
  {
    "image_id": "frame_1",
    "app_name": "Code",
    "timestamp": 1729580000.0,
    "pixel_values": { "shape": [1080, 1920, 3], "dtype": "uint8", "data": "base64..." },
    "grayscale_matrix": { "shape": [1080, 1920], "dtype": "uint8", "data": "base64..." }
  }
  ```
- **Response (`201 Created`):**
  ```json
  { "status": "stored", "image_id": "frame_1" }
  ```

---

### 2.10 Get Recent Image Comparisons
`GET /images/comparison`

- **Query Parameters:**
  - `limit` (integer, optional, default: `10`, max: `10`): Number of recent frames to fetch.
- **Response (`200 OK`):**
  ```json
  [
    { "image_id": "frame_1", "app_name": "Code", "timestamp": 1729580000.0 }
  ]
  ```

---

### 2.11 Search Image Comparisons
`GET /images/comparison/search`

- **Query Parameters:**
  - `app_name` (string, optional): Application name to filter frames.
  - `limit` (integer, optional, default: `10`): Max results.
- **Response (`200 OK`):**
  ```json
  [
    { "image_id": "frame_1", "app_name": "Code" }
  ]
  ```

---

### 2.12 Get Image Comparison by ID
`GET /images/comparison/{image_id}`

- **Path Parameters:**
  - `image_id` (string, required): Unique image comparison frame ID.
- **Response (`200 OK`):**
  ```json
  { "image_id": "frame_1", "app_name": "Code", "grayscale_matrix": { ... } }
  ```

---

### 2.13 Delete Image Comparisons
`DELETE /images/comparison`

- **Query Parameters:**
  - `image_id` (string, optional): Specific image ID to delete.
  - `app_name` (string, optional): Delete all images for an application.
  - `all` (boolean, optional, default: `false`): Delete all image comparisons.
- **Response (`200 OK`):**
  ```json
  { "deleted_count": 1 }
  ```

---

## 3. Installation & Startup

### Install Dependencies
```bash
pip install -r requirements.txt
```

### Start Server
Run from the `Message_Broker/` directory:
```bash
python app.py
```
Or with Uvicorn:
```bash
uvicorn app:app --host 127.0.0.1 --port 9002
```
