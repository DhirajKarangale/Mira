# Message Broker

The **Message Broker** is the centralized asynchronous communication hub connecting all MIRA modules using **Redis Streams**, Consumer Groups, and **FastAPI**.

---

## 1. What It Does

- **Asynchronous Ingestion**: Ingests tasks via `POST /jobs` and appends them to Redis Streams (`XADD`).
- **Consumer Group Dispatch**: Dispatches jobs in batches (up to 10) to workers via `GET /jobs`.
- **Job Deletion**: Removes jobs by `job_id` and acknowledges them (`XACK` + `XDEL`) via `GET /jobs/delete`.
- **Maintenance Operations**: Cleans all consumer groups or formats the entire Redis database.

---

## 2. API Reference

Every endpoint has strictly one way to be called.

### 2.1 Service Health
`GET /`

- **Response:**
  ```json
  {
    "service": "Message Broker",
    "status": "online"
  }
  ```

---

### 2.2 Add Job
`POST /jobs`

Adds a job to the Redis stream corresponding to `consumer_key`. Stores `job_id` and whatever other data elements were sent by the calling module (e.g. `text`, `prompt`, `image_path`, etc.), excluding `consumer_key`.

- **Mandatory Fields:** `job_id`, `consumer_key`
- **Other Fields:** Completely depends on the calling module/target service (e.g. `text`, `prompt`, `image_path`, `query`, etc.)
- **Request Body Example:**
  ```json
  {
    "job_id": "job_123",
    "consumer_key": "engine_llm_task",
    "prompt": "Summarize user notes"
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

Reads pending jobs from the stream via consumer groups.

- **Query Parameters:**
  - `consumer_key` (mandatory): Task key to read from.
  - `count` (optional, default `1`, max `10`): Maximum number of jobs to fetch.
- **Request Example:**
  ```bash
  curl "http://127.0.0.1:8000/jobs?consumer_key=engine_llm_task&count=2"
  ```
- **Response (`200 OK`):**
  Array containing the stored job data:
  ```json
  [
    {
      "job_id": "job_123",
      "prompt": "Summarize user notes"
    }
  ]
  ```
  *(Returns `[]` if no jobs are available)*

---

### 2.4 Delete Job
`GET /jobs/delete`

Acknowledges the job from the consumer group (`XACK`), removes it from the Redis stream (`XDEL`), and cleans the internal lookup index.

- **Query Parameters:**
  - `consumer_key` (mandatory): Task key associated with the job.
  - `job_id` (mandatory): The unique job identifier.
- **Request Example:**
  ```bash
  curl "http://127.0.0.1:8000/jobs/delete?consumer_key=engine_llm_task&job_id=job_123"
  ```
- **Response (`200 OK`):**
  ```json
  {
    "message": "successfully deleted"
  }
  ```
- **Response (`404 Not Found` if job does not exist):**
  ```json
  {
    "detail": {
      "message": "job not found"
    }
  }
  ```

---

### 2.5 Clean All Consumer Groups
`GET /consumer-groups/clean`

Deletes all stream data for all registered consumer groups and recreates empty groups.

- **Request Example:**
  ```bash
  curl http://127.0.0.1:8000/consumer-groups/clean
  ```
- **Response (`200 OK`):**
  ```json
  {
    "message": "successfully cleaned all consumer groups"
  }
  ```

---

### 2.6 Format Entire Redis
`GET /redis/format`

Flushes the entire Redis database (`FLUSHDB`).

- **Request Example:**
  ```bash
  curl http://127.0.0.1:8000/redis/format
  ```
- **Response (`200 OK`):**
  ```json
  {
    "message": "successfully formatted redis"
  }
  ```

---

### 2.7 List Consumer Groups
`GET /consumer-groups`

Returns the list of all registered consumer group names.

- **Request Example:**
  ```bash
  curl http://127.0.0.1:8000/consumer-groups
  ```
- **Response (`200 OK`):**
  ```json
  [
    "CONSUMER_GROUP_SCREENSHOT_PROCESS",
    "CONSUMER_GROUP_OCR_EXTRACTION",
    "CONSUMER_GROUP_COLLECTOR_BATCH",
    "CONSUMER_GROUP_MEMORY_STORE",
    "CONSUMER_GROUP_MEMORY_RECALL",
    "CONSUMER_GROUP_ENGINE_LLM_TASK",
    "CONSUMER_GROUP_ENGINE_EMBEDDING_TASK",
    "CONSUMER_GROUP_CLIENT_NOTIFICATION",
    "CONSUMER_GROUP_VAULT_SECRET_SYNC"
  ]
  ```

---

## 3. How to Run

### Install Dependencies
```bash
pip install -r requirements.txt
```

### Start Server
Run from the `Message_Broker/` directory:
```bash
cd Message_Broker
uvicorn app:app --host 127.0.0.1 --port 8000
```
