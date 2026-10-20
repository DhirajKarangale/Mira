# Operator

The **Operator** is the high-performance desktop capture and system automation service written in **Rust** using **Axum**, **Tokio**, and native **Windows GDI / xcap**.

---

## 1. What It Does

- **Silent Screen Capture**: Captures desktop screen frames silently in the background at regular intervals defined by `CAPTURE_INTERVAL_SECS` without notifications or user interruption.
- **Active Application Detection**: Identifies the currently active foreground application executable name or window title at the exact moment of each capture.
- **Job Generation & Queuing**: Creates screenshot job objects and streams them asynchronously to the **Message Broker** (`screenshot_process` consumer group) for downstream processing.
- **Vault Configuration & Encrypted Logging**: Automatically pulls runtime configuration from Vault at startup and delivers asynchronous lifecycle and dispatch logs to Vault's encrypted log repository.
- **Screenshot Cleanup**: Exposes an endpoint to delete processed screenshot files from disk.

---

## 2. API Reference

Every endpoint has strictly one way to be called.

### 2.1 Service Health
`GET /` or `GET /health`

- **Response (`200 OK`):**
  ```json
  {
    "service": "Operator",
    "status": "online"
  }
  ```

---

### 2.2 Start Screenshot Capture
`GET /start`

Initiates the continuous background capture loop ticking every `CAPTURE_INTERVAL_SECS`.

- **Response (`200 OK`):**
  ```json
  {
    "status": "started",
    "message": "Screenshot capture loop started successfully",
    "capture_interval_secs": 10
  }
  ```
- **If already running:**
  ```json
  {
    "status": "already_running",
    "message": "Screenshot capture is already active",
    "capture_interval_secs": 10
  }
  ```

---

### 2.3 Stop Screenshot Capture
`GET /stop`

Cleanly signals the background capture task to terminate.

- **Response (`200 OK`):**
  ```json
  {
    "status": "stopped",
    "message": "Screenshot capture loop stopped cleanly"
  }
  ```
- **If not running:**
  ```json
  {
    "status": "already_stopped",
    "message": "Screenshot capture is not running"
  }
  ```

---

### 2.4 Delete Screenshot
`POST /delete`

Deletes the specified screenshot file from the local filesystem.

- **Request Body:**
  ```json
  {
    "image_path": "E:\\FullStack\\Mira\\Operator\\screenshots\\msedge_20-10-2026T13-13-45.png"
  }
  ```
- **Response (`200 OK`):**
  ```json
  {
    "status": "success",
    "message": "Screenshot deleted successfully"
  }
  ```
- **If file not found (`404 Not Found`):**
  ```json
  {
    "status": "error",
    "message": "Screenshot file not found"
  }
  ```

---

## 3. Screenshot Job Object Schema

Every captured frame produces a job sent to Message Broker (`POST /jobs`):

| Field | Type | Description |
| :--- | :--- | :--- |
| `job_id` | `String` (UUID v4) | Unique identifier for the capture frame. |
| `consumer_key` | `String` | Stream routing key (`screenshot_process`). |
| `app_name` | `String` | Active foreground process name (e.g. `msedge.exe`, `Code.exe`). |
| `timestamp` | `String` | Formatted timestamp: `dd/mm/yyyyTHH:mm:ss`. |
| `image_path` | `String` | Absolute path to the saved PNG screenshot file (`AppName_timestamp.png`). |

**Example Job Object:**
```json
{
  "job_id": "786a78ce-e62d-4108-9e4e-5349fceb7e9c",
  "consumer_key": "screenshot_process",
  "app_name": "msedge.exe",
  "timestamp": "20/10/2026T13:13:45",
  "image_path": "E:\\FullStack\\Mira\\Operator\\screenshots\\msedge_20-10-2026T13-13-45.png"
}
```

---

## 4. How to Run

### Install Dependencies
Dependencies are defined in `Cargo.toml` and summarized in `dependencies.txt`.
```bash
cargo check
```

### Start Server
Run from the `Operator/` directory:
```bash
cd Operator
cargo run -- --port 8002
```
