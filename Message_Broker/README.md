# Message Broker

The **Message Broker** is the centralized asynchronous communication hub connecting all MIRA modules using **Redis Streams**, Consumer Groups, and **FastAPI**.

---

## 1. Purpose

- **Centralized Event Backbone**: Facilitates asynchronous, decoupled data exchange between MIRA modules.
- **Job Ingestion & Queuing**: Accepts jobs from producers (e.g., Operator) and stores them reliably in Redis Streams.
- **Consumer Group Dispatch**: Distributes queued messages to dedicated worker consumer groups with acknowledgment semantics.
- **Telemetry & Maintenance**: Provides stream monitoring, pending message cleanup, and Redis database formatting.

---

## 2. API Endpoints

### 2.1 Health Check
`GET /health`

Checks if the service is online and healthy.

- **Parameters**: None
- **Response (`200 OK`):**
  ```json
  {
    "service": "Message Broker",
    "status": "online"
  }
  ```

---

### 2.2 Add Job
`POST /jobs`

Enqueues a job into the Redis stream for the designated consumer key.

- **Request Body (JSON):**
  - `job_id` (string, required): Unique identifier for the job.
  - `consumer_key` (string, required): Consumer group key registered in `consumer_groups.json` (e.g. `screenshot_process`, `engine_llm_task`).
  - *Additional Fields*: Any arbitrary payload fields needed by the downstream consumer (e.g. `image_path`, `app_name`, `timestamp`, `prompt`).
  ```json
  {
    "job_id": "job_12345",
    "consumer_key": "screenshot_process",
    "app_name": "Code",
    "image_path": "E:/Screenshots/frame_1.png"
  }
  ```
- **Response (`201 Created`):**
  ```json
  {
    "message": "successfully queued"
  }
  ```

---

### 2.3 Get Jobs
`GET /jobs`

Dequeues pending jobs from the consumer group stream for processing.

- **Query Parameters:**
  - `consumer_key` (string, required): Consumer group key to poll.
  - `count` (integer, optional, default: `1`, min: `1`, max: `10`): Number of jobs to fetch.
- **Response (`200 OK`):**
  ```json
  [
    {
      "job_id": "job_12345",
      "app_name": "Code",
      "image_path": "E:/Screenshots/frame_1.png"
    }
  ]
  ```

---

### 2.4 Delete Job
`DELETE /jobs`

Acknowledges (`XACK`) and deletes (`XDEL`) a completed job from the stream and internal index.

- **Query Parameters:**
  - `consumer_key` (string, required): Consumer key associated with the job.
  - `job_id` (string, required): Unique job ID to acknowledge and delete.
- **Response (`200 OK`):**
  ```json
  {
    "message": "successfully deleted"
  }
  ```
- **Response (`404 Not Found`):**
  ```json
  {
    "detail": {
      "message": "job not found"
    }
  }
  ```

---

### 2.5 List Consumer Groups & Telemetry
`GET /redis/consumer-groups`

Retrieves status, consumer counts, active message counts, and pending messages across all registered Redis streams.

- **Query Parameters:**
  - `raw` (boolean, optional, default: `false`): If `true`, returns a flat list of registered consumer group names.
- **Response (`200 OK`):**
  ```json
  [
    {
      "group_name": "CONSUMER_GROUP_SCREENSHOT_PROCESS",
      "stream_name": "mira:stream:screenshot_process",
      "consumer_key": "screenshot_process",
      "consumers_count": 1,
      "pending_messages_count": 0,
      "active_messages_count": 0,
      "total_messages_count": 0,
      "last_delivered_id": "0-0",
      "status": "idle",
      "is_registered": true,
      "stream_exists": true
    }
  ]
  ```

---

### 2.6 Delete Consumer Group
`DELETE /redis/consumer-groups/{group_name}`

Destroys a specific consumer group from its Redis stream.

- **Path Parameters:**
  - `group_name` (string, required): Name of the consumer group to delete.
- **Query Parameters:**
  - `stream_name` (string, optional): Associated stream key if non-standard.
- **Response (`200 OK`):**
  ```json
  {
    "message": "Consumer group 'CONSUMER_GROUP_SCREENSHOT_PROCESS' deleted successfully",
    "group_name": "CONSUMER_GROUP_SCREENSHOT_PROCESS",
    "stream_name": "mira:stream:screenshot_process",
    "destroyed": true
  }
  ```

---

### 2.7 Clean Consumer Groups
`POST /redis/clean`

Acknowledges and clears pending messages for a single consumer group or across all registered groups.

- **Request Body (JSON, Optional):**
  - `group_name` (string, optional): Target consumer group name. If omitted, cleans all groups.
  - `stream_name` (string, optional): Target stream key.
  - `reset_stream` (boolean, optional, default: `false`): If `true`, resets the stream and consumer group back to ID `0`.
  ```json
  {
    "group_name": "CONSUMER_GROUP_SCREENSHOT_PROCESS",
    "reset_stream": false
  }
  ```
- **Response (`200 OK`):**
  ```json
  {
    "message": "Successfully cleaned 0 pending message(s) for 'CONSUMER_GROUP_SCREENSHOT_PROCESS'",
    "group_name": "CONSUMER_GROUP_SCREENSHOT_PROCESS",
    "stream_name": "mira:stream:screenshot_process",
    "cleaned_count": 0
  }
  ```

---

### 2.8 Format Entire Redis
`POST /redis/format`

Flushes the entire Redis database (`FLUSHDB`) and reinitializes all registered consumer groups.

- **Request Body**: None
- **Response (`200 OK`):**
  ```json
  {
    "message": "Successfully formatted Redis and initialized 9 consumer groups",
    "status": "success",
    "initialized_groups": 9
  }
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
Or directly using Uvicorn:
```bash
uvicorn app:app --host 127.0.0.1 --port 9003
```
